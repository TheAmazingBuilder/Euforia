/**
 * Discipline application service (B4 — data-model.md "Domaine 7", the
 * Discipline Engine). Owns the rule CRUD, the violation log, the alert
 * inbox and the server-side aggregates (score, emotion matrix, mistakes
 * ledger). Everything is computed from the OWNED rows + the Trades
 * context's narrow read contract (facts are consumed, never duplicated —
 * §26/§39/§46).
 *
 * Rule evaluation timing: Trades PUBLISHES `trade.closed` on the domain
 * event bus (infrastructure/events); this service SUBSCRIBES and freezes
 * the breach context at time T (data-model.md "Domaine 7"). Dedupe key =
 * (tradeId, ruleId) — idempotent across replays, exactly like the mock.
 *
 * Deliberate scope (mock-parity): only the rules computable from journal
 * facts auto-evaluate (MAX_TRADES_PER_DAY, MAX_LOSSES_PER_DAY,
 * MAX_RISK_PCT_PER_TRADE). The remaining rule types are user-defined
 * guardrails acknowledged via the log — they never fake breaches. The
 * alert bridges owned by other domains (Goals → B8, Security reminders,
 * Monitoring) stay with their owners.
 */
import { Injectable, OnModuleInit } from "@nestjs/common";
import type { z } from "zod";
import {
  toTradingDateKey,
  type acknowledgeViolationInputSchema,
  type createRuleInputSchema,
  type updateRuleInputSchema,
} from "../../shared/contracts";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { DomainEventsService } from "../../infrastructure/events/domain-events.module";
import { AccountsRepository } from "../accounts/accounts.repository";
import { IdentityRepository } from "../identity/identity.repository";
import { dateKeyOf } from "../trades/trade-calculations";
import { SYSTEM_MISTAKES } from "../trades/trade-catalogs";
import { TradesRepository, type TradeRow } from "../trades/trades.repository";
import { DisciplineRepository, type DisciplineRow } from "./discipline.repository";

const TRADING_ERROR = TRADE_ERROR_CODES;

/** Prisma JSON column input — the service hands over plain JSON objects. */
type JsonInput = Parameters<DisciplineRepository["insertRule"]>[1];

/** System catalog iteration source for the ledger (stable, fixed ids). */
const SYSTEM_MISTAKE_LIST = SYSTEM_MISTAKES;

/** Rolling aggregation window used by every discipline screen (30 days). */
const WINDOW_DAYS = 30;

/** Per-day Cosmoz Index weights (mock engine parity). */
const SCORE_WEIGHTS = { plan: 0.55, mistakes: 0.25, violations: 0.2 } as const;

type CreateRuleInput = z.infer<typeof createRuleInputSchema>;
type UpdateRuleInput = z.infer<typeof updateRuleInputSchema>;
type AcknowledgeViolationInput = z.infer<typeof acknowledgeViolationInputSchema>;

interface RuleData {
  type: string;
  params: { limit?: number } & Record<string, unknown>;
  severity: string;
  accountId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ViolationData {
  ruleId: string;
  tradeId: string | null;
  occurredAt: string;
  context: Record<string, unknown>;
  acknowledgedAt: string | null;
  userNote: string | null;
}

interface ViolationRowData extends ViolationData {
  userId: string;
}

interface AlertData {
  type: string;
  severity: string;
  title: string;
  message: string;
  payload: Record<string, unknown> | null;
  tradeId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export interface RuleView {
  id: string;
  userId: string;
  type: string;
  params: { limit?: number } & Record<string, unknown>;
  severity: string;
  accountId: string | null;
  isActive: boolean;
  createdAt: string;
}

@Injectable()
export class DisciplineService implements OnModuleInit {
  constructor(
    private readonly repository: DisciplineRepository,
    private readonly trades: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly identity: IdentityRepository,
    private readonly events: DomainEventsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe("trade.closed", (event) => this.evaluateForTrade(event));
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private nowIso(): string {
    return new Date().toISOString();
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private toDecimalString(value: number): string {
    if (Number.isInteger(value)) return value.toFixed(1);
    return String(value);
  }

  private async timezoneOf(userId: string): Promise<string> {
    const user = await this.identity.findUserById(userId);
    if (user === null) {
      throw new NotFoundError("User not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return user.timezone;
  }

  private async todayKey(userId: string): Promise<string> {
    return toTradingDateKey(this.nowIso(), await this.timezoneOf(userId));
  }

  private async windowStart(userId: string): Promise<string> {
    const tz = await this.timezoneOf(userId);
    const shifted = new Date();
    shifted.setUTCDate(shifted.getUTCDate() - (WINDOW_DAYS - 1));
    return toTradingDateKey(shifted.toISOString(), tz);
  }

  /** User-wide current balance: Σ starting balances + Σ closed net P&L. */
  private async balanceOf(userId: string): Promise<number> {
    const accounts = await this.accounts.listAccountsByUser(userId);
    const starting = accounts.reduce(
      (sum, account) => sum + Number(account.startingBalance.toString()),
      0,
    );
    const rows = await this.trades.listTrades(userId, {});
    const closedPnl = rows
      .filter((t) => t.status === "CLOSED" && t.pnlNet !== null)
      .reduce((sum, t) => sum + Number(t.pnlNet!.toString()), 0);
    return starting + closedPnl;
  }

  // ── GET /rules/status — today's banner aggregate ──────────────────────────

  async rulesStatus(
    userId: string,
    accountId: string | null,
  ): Promise<{
    date: string;
    accountId: string | null;
    tradesToday: number;
    lossesToday: number;
    violationsToday: number;
    riskBudgetSpentPct: string;
    limits: Array<{ ruleId: string; type: string; severity: string; limit: string; current: string }>;
  }> {
    const [today, tz] = await Promise.all([this.todayKey(userId), this.timezoneOf(userId)]);
    const balance = await this.balanceOf(userId);
    const all = await this.trades.listTrades(userId, {});
    const dayTrades = all.filter(
      (t) => dateKeyOf(t.tradingDate) === today && t.status !== "CANCELLED",
    );
    const scoped =
      accountId === null ? dayTrades : dayTrades.filter((t) => t.accountId === accountId);
    const dayClosed = scoped.filter((t) => t.status === "CLOSED");
    const tradesToday = scoped.length;
    const lossesToday = dayClosed.filter((t) => (t.pnlNet?.toNumber() ?? 0) < 0).length;
    const riskCommitted = scoped.reduce(
      (sum, t) => sum + Number(t.riskAmount?.toString() ?? "0"),
      0,
    );
    const riskBudgetSpentPct = balance > 0 ? this.round2((riskCommitted / balance) * 100) : 0;

    const rules = await this.repository.listRules(userId);
    const limits: Array<{
      ruleId: string;
      type: string;
      severity: string;
      limit: string;
      current: string;
    }> = [];
    for (const row of rules) {
      const rule = row.data as unknown as RuleData;
      if (!rule.isActive) continue;
      const limit = typeof rule.params.limit === "number" ? rule.params.limit : 0;
      let current = 0;
      if (rule.type === "MAX_TRADES_PER_DAY") current = tradesToday;
      else if (rule.type === "MAX_LOSSES_PER_DAY") current = lossesToday;
      else if (rule.type === "MAX_RISK_PCT_PER_TRADE") {
        const risks = scoped.map(
          (t) => (Number(t.riskAmount?.toString() ?? "0") / balance) * 100,
        );
        current = this.round2(Math.max(0, ...(risks.length > 0 ? risks : [0])));
      }
      limits.push({
        ruleId: row.id,
        type: rule.type,
        severity: rule.severity,
        limit: this.toDecimalString(limit),
        current: this.toDecimalString(this.round2(current)),
      });
    }

    // Guardrail input — rule breaches that happened TODAY (any rule).
    const violations = await this.repository.listByKind(userId, "VIOLATION");
    const violationsToday = violations.filter((row) => {
      const data = row.data as unknown as ViolationData;
      return toTradingDateKey(data.occurredAt, tz) === today;
    }).length;

    return {
      date: today,
      accountId,
      tradesToday,
      lossesToday,
      violationsToday,
      riskBudgetSpentPct: this.toDecimalString(riskBudgetSpentPct),
      limits,
    };
  }

  // ── rules CRUD ────────────────────────────────────────────────────────────

  async listRules(userId: string): Promise<{ rules: RuleView[] }> {
    const rows = await this.repository.listRules(userId);
    return {
      rules: rows
        .map((row) => this.toRuleView(row))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  async createRule(userId: string, input: CreateRuleInput): Promise<RuleView> {
    const row = await this.repository.insertRule(
      userId,
      {
        type: input.type,
        params: input.params,
        severity: input.severity,
        accountId: input.accountId ?? null,
        isActive: input.isActive ?? true,
        createdAt: this.nowIso(),
      } as unknown as JsonInput,
    );
    return this.toRuleView(row);
  }

  async updateRule(userId: string, ruleId: string, input: UpdateRuleInput): Promise<RuleView> {
    const row = await this.repository.findRuleForUser(userId, ruleId);
    if (row === null) {
      throw new NotFoundError("Rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const data = row.data as unknown as RuleData;
    if (input.params !== undefined) data.params = input.params;
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    await this.repository.updateRowData(row.id, data as unknown as JsonInput);
    return this.toRuleView({ ...row, data: data as unknown as Record<string, unknown> });
  }

  async deleteRule(userId: string, ruleId: string): Promise<{ ok: true }> {
    const row = await this.repository.findRuleForUser(userId, ruleId);
    if (row === null) {
      throw new NotFoundError("Rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRule(userId, ruleId);
    // Orphaned violations keep their frozen context but drop out of the
    // joined view (same behavior as an API join on a deleted rule).
    return { ok: true };
  }

  private toRuleView(row: DisciplineRow): RuleView {
    const data = row.data as unknown as RuleData;
    return { id: row.id, userId: row.userId, ...data };
  }

  // ── violation log ─────────────────────────────────────────────────────────

  async listViolations(userId: string): Promise<{
    violations: Array<Record<string, unknown>>;
    windowStart: string;
    windowCount: number;
  }> {
    const since = await this.windowStart(userId);
    const [tz, rules] = await Promise.all([
      this.timezoneOf(userId),
      this.repository.listRules(userId),
    ]);
    const rows = await this.repository.listByKind(userId, "VIOLATION");
    const views = rows
      .map((row) => this.violationToView(row, rules))
      .filter((view): view is NonNullable<typeof view> => view !== null)
      .sort((a, b) => String(b["occurredAt"]).localeCompare(String(a["occurredAt"])));
    const windowCount = views.filter(
      (v) => toTradingDateKey(String(v["occurredAt"]), tz) >= since,
    ).length;
    return { violations: views, windowStart: since, windowCount };
  }

  private violationToView(
    row: DisciplineRow,
    rules: DisciplineRow[],
  ): Record<string, unknown> | null {
    const data = row.data as unknown as ViolationData;
    const rule = rules.find((candidate) => candidate.id === data.ruleId);
    if (rule === undefined) return null; // deleted rule → out of the join
    const ruleData = rule.data as unknown as RuleData;
    return {
      id: row.id,
      ruleId: data.ruleId,
      userId: row.userId,
      tradeId: data.tradeId,
      occurredAt: data.occurredAt,
      context: data.context,
      acknowledgedAt: data.acknowledgedAt,
      userNote: data.userNote,
      ruleType: ruleData.type,
      ruleSeverity: ruleData.severity,
    };
  }

  async acknowledgeViolation(
    userId: string,
    violationId: string,
    input: AcknowledgeViolationInput,
  ): Promise<{ violation: Record<string, unknown> }> {
    const row = await this.repository.findRowForUser(userId, "VIOLATION", violationId);
    if (row === null) {
      throw new NotFoundError("Violation not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const data = row.data as unknown as ViolationData;
    if (data.acknowledgedAt === null) data.acknowledgedAt = this.nowIso();
    if (input.note !== undefined) data.userNote = input.note;
    await this.repository.updateRowData(row.id, data as unknown as JsonInput);
    const rules = await this.repository.listRules(userId);
    const view = this.violationToView(
      { ...row, data: data as unknown as Record<string, unknown> },
      rules,
    );
    if (view === null) {
      throw new ConflictError(
        "Rule for this violation no longer exists",
        TRADING_ERROR.INVALID_TRADE_STATE,
      );
    }
    return { violation: view };
  }

  // ── GET /discipline/score ─────────────────────────────────────────────────

  async disciplineScore(userId: string): Promise<{
    windowStart: string;
    score: string | null;
    planAdherencePct: string | null;
    checklistCompletionPct: string;
    violationsCount: number;
    journalingConsistencyPct: string;
  }> {
    const [since, today] = await Promise.all([this.windowStart(userId), this.todayKey(userId)]);
    const all = await this.trades.listTrades(userId, {});
    const windowTrades = all.filter((t) => {
      const key = dateKeyOf(t.tradingDate);
      return key >= since && key <= today && t.status !== "CANCELLED";
    });
    const windowClosed = windowTrades.filter((t) => t.status === "CLOSED");
    const graded = windowClosed.filter((t) => t.decisionGrade !== null);

    const planAdherencePct =
      graded.length > 0
        ? (graded.filter((t) => t.followedPlan === true).length / graded.length) * 100
        : null;
    const checklistComplete = graded.filter((t) => {
      const snap = t.checklistSnap;
      return (
        snap !== null &&
        typeof snap === "object" &&
        !Array.isArray(snap) &&
        Object.values(snap).every((value) => value === true)
      );
    }).length;
    const checklistCompletionPct =
      graded.length > 0 ? (checklistComplete / graded.length) * 100 : 0;

    const tz = await this.timezoneOf(userId);
    const violations = await this.repository.listByKind(userId, "VIOLATION");
    const violationsCount = violations.filter(
      (row) => toTradingDateKey((row.data as unknown as ViolationData).occurredAt, tz) >= since,
    ).length;

    // Journaling consistency: % of the window's trading days with at least
    // one written reflection (lesson or note) — V1 trace of daily_journal.
    const tradingDays = new Set(windowClosed.map((t) => dateKeyOf(t.tradingDate)));
    const journaledDays = new Set(
      windowClosed
        .filter(
          (t) =>
            (t.lessons !== null && t.lessons.trim() !== "") ||
            (t.notes !== null && t.notes.trim() !== ""),
        )
        .map((t) => dateKeyOf(t.tradingDate)),
    );
    const journalingConsistencyPct =
      tradingDays.size > 0
        ? ([...tradingDays].filter((day) => journaledDays.has(day)).length /
            tradingDays.size) *
          100
        : 0;

    // Per-day Cosmoz Index (mock formula) averaged over SCORED days —
    // computed from live facts instead of persisted daily stats.
    const scores = await this.perDayScores(userId, windowClosed);
    const score =
      scores.length > 0
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : null;

    return {
      windowStart: since,
      score: score === null ? null : this.toDecimalString(this.round2(score)),
      planAdherencePct:
        planAdherencePct === null ? null : this.toDecimalString(this.round2(planAdherencePct)),
      checklistCompletionPct: this.toDecimalString(this.round2(checklistCompletionPct)),
      violationsCount,
      journalingConsistencyPct: this.toDecimalString(this.round2(journalingConsistencyPct)),
    };
  }

  /** Days with ≥1 graded trade get a score via the mock's exact weights. */
  private async perDayScores(userId: string, windowClosed: TradeRow[]): Promise<number[]> {
    const days = new Set(windowClosed.map((t) => dateKeyOf(t.tradingDate)));
    const mistakeRows = await this.trades.listSubRowsByUser(userId, "MISTAKE");
    const alertRows = await this.repository.listByKind(userId, "ALERT");
    const mistakesByTrade = new Map<string, number>();
    for (const row of mistakeRows) {
      mistakesByTrade.set(row.tradeId, (mistakesByTrade.get(row.tradeId) ?? 0) + 1);
    }
    const scores: number[] = [];
    for (const day of days) {
      const dayTrades = windowClosed.filter((t) => dateKeyOf(t.tradingDate) === day);
      const graded = dayTrades.filter((t) => t.decisionGrade !== null);
      if (graded.length === 0) continue;
      const followedPct =
        graded.filter((t) => t.followedPlan === true).length / graded.length;
      const dayMistakes = dayTrades.reduce(
        (sum, t) => sum + (mistakesByTrade.get(t.id) ?? 0),
        0,
      );
      const tradeIds = new Set(dayTrades.map((t) => t.id));
      const dayViolations = alertRows.filter((row) => {
        const data = row.data as unknown as AlertData;
        return (
          data.type === "RULE_VIOLATION" && data.tradeId !== null && tradeIds.has(data.tradeId)
        );
      }).length;
      const value =
        100 *
        (SCORE_WEIGHTS.plan * followedPct +
          SCORE_WEIGHTS.mistakes *
            (1 - Math.min(1, dayMistakes / Math.max(1, dayTrades.length))) +
          SCORE_WEIGHTS.violations *
            (1 - Math.min(1, dayViolations / Math.max(1, dayTrades.length))));
      scores.push(Math.max(0, Math.min(100, value)));
    }
    return scores;
  }

  // ── GET /mistakes/ledger ──────────────────────────────────────────────────

  async mistakesLedger(userId: string): Promise<{
    windowStart: string;
    entries: Array<{
      mistakeId: string;
      key: string;
      label: string;
      category: string;
      severity: number;
      count: number;
      rCost: string;
      lastSeenAt: string | null;
    }>;
  }> {
    const since = await this.windowStart(userId);
    const [all, mistakeRows] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.trades.listSubRowsByUser(userId, "MISTAKE"),
    ]);
    const tradeById = new Map(all.map((t) => [t.id, t]));

    const entries: Array<{
      mistakeId: string;
      key: string;
      label: string;
      category: string;
      severity: number;
      count: number;
      rCost: string;
      lastSeenAt: string | null;
    }> = [];
    for (const catalog of SYSTEM_MISTAKE_LIST) {
      const windowRows = mistakeRows
        .filter((row) => (row.data as Record<string, unknown>)["mistakeId"] === catalog.id)
        .map((row) => ({ row, trade: tradeById.get(row.tradeId) }))
        .filter(
          (x): x is { row: (typeof mistakeRows)[number]; trade: TradeRow } =>
            x.trade !== undefined && dateKeyOf(x.trade.tradingDate) >= since,
        );
      if (windowRows.length === 0) continue;
      const rCost = windowRows.reduce(
        (sum, x) => sum + (x.trade.rMultiple?.toNumber() ?? 0),
        0,
      );
      const lastSeenAt = windowRows.reduce<string | null>((latest, x) => {
        const createdAt = String((x.row.data as Record<string, unknown>)["createdAt"] ?? "");
        return latest === null || createdAt > latest ? createdAt : latest;
      }, null);
      entries.push({
        mistakeId: catalog.id,
        key: catalog.key,
        label: catalog.label,
        category: catalog.category,
        severity: catalog.severity,
        count: windowRows.length,
        rCost: this.toDecimalString(this.round2(rCost)),
        lastSeenAt,
      });
    }
    // Most expensive first — cost dominates, then frequency.
    entries.sort(
      (a, b) =>
        Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)) || b.count - a.count,
    );
    return { windowStart: since, entries };
  }

  // ── GET /discipline/emotion-matrix ────────────────────────────────────────

  async disciplineEmotionMatrix(userId: string): Promise<{
    windowStart: string;
    rows: Array<{
      emotion: string;
      trades: number;
      wins: number;
      losses: number;
      winRatePct: number | null;
      avgR: number | null;
      totalR: number | null;
    }>;
    excluded: number;
    meta: { generatedAt: string };
  }> {
    const [since, today] = await Promise.all([this.windowStart(userId), this.todayKey(userId)]);
    const all = await this.trades.listTrades(userId, {});
    const windowClosed = all.filter((t) => {
      const key = dateKeyOf(t.tradingDate);
      return key >= since && key <= today && t.status === "CLOSED";
    });
    const withEmotion = windowClosed.filter((t) => t.emotionBefore !== null);
    const rows = [...new Set(withEmotion.map((t) => t.emotionBefore!))]
      .map((emotion) => {
        const group = withEmotion.filter((t) => t.emotionBefore === emotion);
        const wins = group.filter((t) => (t.pnlNet?.toNumber() ?? 0) > 0).length;
        const losses = group.length - wins;
        const rSum = group.reduce((sum, t) => sum + (t.rMultiple?.toNumber() ?? 0), 0);
        return {
          emotion,
          trades: group.length,
          wins,
          losses,
          winRatePct: group.length > 0 ? this.round1((wins / group.length) * 100) : null,
          avgR: group.length > 0 ? this.round2(rSum / group.length) : null,
          totalR: group.length > 0 ? this.round2(rSum) : null,
        };
      })
      // Busiest emotions first — the heatmap reads top-down.
      .sort((a, b) => b.trades - a.trades);
    return {
      windowStart: since,
      rows,
      excluded: windowClosed.length - withEmotion.length,
      meta: { generatedAt: this.nowIso() },
    };
  }

  // ── alert inbox ───────────────────────────────────────────────────────────

  async listAlerts(userId: string): Promise<{
    alerts: Array<{ id: string; userId: string } & AlertData>;
    unreadCount: number;
  }> {
    const rows = await this.repository.listByKind(userId, "ALERT");
    const alerts = rows
      .map((row) => this.toAlertView(row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unreadCount = alerts.filter(
      (a) => a.readAt === null && a.dismissedAt === null,
    ).length;
    return { alerts, unreadCount };
  }

  async markAlertRead(
    userId: string,
    alertId: string,
  ): Promise<{ id: string; userId: string } & AlertData> {
    const row = await this.repository.findRowForUser(userId, "ALERT", alertId);
    if (row === null) {
      throw new NotFoundError("Alert not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const data = row.data as unknown as AlertData;
    if (data.readAt === null) data.readAt = this.nowIso();
    await this.repository.updateRowData(row.id, data as unknown as JsonInput);
    return this.toAlertView({ ...row, data: data as unknown as Record<string, unknown> });
  }

  private toAlertView(row: DisciplineRow): { id: string; userId: string } & AlertData {
    const data = row.data as unknown as AlertData;
    return { id: row.id, userId: row.userId, ...data };
  }

  // ── rule evaluation (subscribed to trade.closed) ──────────────────────────

  async evaluateForTrade(event: { userId: string; tradeId: string }): Promise<void> {
    const trade = await this.trades.findTradeForUser(event.tradeId, event.userId);
    if (trade === null) return;

    const date = dateKeyOf(trade.tradingDate);
    const all = await this.trades.listTrades(event.userId, {});
    const dayTrades = all.filter(
      (t) => dateKeyOf(t.tradingDate) === date && t.status !== "CANCELLED",
    );
    const dayLosses = dayTrades.filter(
      (t) => t.status === "CLOSED" && (t.pnlNet?.toNumber() ?? 0) < 0,
    ).length;
    const balance = await this.balanceOf(event.userId);

    const rules = await this.repository.listRules(event.userId);
    for (const row of rules) {
      const rule = row.data as unknown as RuleData;
      if (!rule.isActive) continue;
      const limit = typeof rule.params.limit === "number" ? rule.params.limit : null;
      if (limit === null) continue;

      let breached = false;
      let current = 0;
      if (rule.type === "MAX_TRADES_PER_DAY") {
        current = dayTrades.length;
        breached = current >= limit;
      } else if (rule.type === "MAX_LOSSES_PER_DAY") {
        current = dayLosses;
        breached = current >= limit;
      } else if (rule.type === "MAX_RISK_PCT_PER_TRADE") {
        const risk = Number(trade.riskAmount?.toString() ?? "0");
        current = balance > 0 ? this.round2((risk / balance) * 100) : 0;
        breached = current > limit;
      }
      if (!breached) continue;

      // Dedupe key (tradeId, ruleId) — the mock's alreadyAlerted check.
      const alerts = await this.repository.listByKind(event.userId, "ALERT");
      const alreadyAlerted = alerts.some((candidate) => {
        const data = candidate.data as unknown as AlertData;
        return (
          data.tradeId === trade.id &&
          data.payload !== null &&
          (data.payload as { ruleId?: string })["ruleId"] === row.id
        );
      });
      if (alreadyAlerted) continue;

      // rule_violations row — the durable record the discipline screen's log
      // reads (alerts stay the V1 response channel). Context freezes values
      // at time T (data-model.md "Domaine 7").
      const violation: ViolationRowData = {
        ruleId: row.id,
        userId: trade.userId,
        tradeId: trade.id,
        occurredAt: this.nowIso(),
        context:
          rule.type === "MAX_RISK_PCT_PER_TRADE"
            ? { riskPct: current, limit }
            : rule.type === "MAX_LOSSES_PER_DAY"
              ? { lossesToday: current, limit }
              : { tradesToday: current, limit },
        acknowledgedAt: null,
        userNote: null,
      };
      await this.repository.insertRow(
        event.userId,
        "VIOLATION",
        violation as unknown as JsonInput,
      );

      const alert: AlertData = {
        type: "RULE_VIOLATION",
        severity: rule.severity,
        title: `${rule.type.replaceAll("_", " ").toLowerCase()} limit reached`,
        message: `Rule ${rule.type} (limit ${limit}) triggered at ${current}.`,
        payload: { ruleId: row.id, limit, current },
        tradeId: trade.id,
        readAt: null,
        dismissedAt: null,
        createdAt: this.nowIso(),
      };
      await this.repository.insertRow(
        event.userId,
        "ALERT",
        alert as unknown as JsonInput,
      );
    }
  }
}
