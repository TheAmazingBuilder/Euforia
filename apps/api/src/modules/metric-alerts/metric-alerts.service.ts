/**
 * Metric alerts application service (Dashboard Customization Phase 07).
 *
 * Owns: rule CRUD (server-validated references, duplicate guard), the
 * evaluation orchestration, event persistence through the EXISTING
 * discipline inbox (one notification system - spec §2) and the
 * `trade.closed` evaluation trigger (debounced, batched per user).
 *
 * Authority rules (spec §6/§10 - the engine computes NO financial math):
 *   - THRESHOLD metrics come from AnalyticsService.getAnalyticsSuite (the
 *     exact dataset the Analytics page renders), one suite call per
 *     DISTINCT (period, account, strategy) scope - rules sharing a scope
 *     share one computation (spec §14 batching).
 *   - GOAL rules consume GoalService (the only goal-status authority);
 *     a deleted goal degrades to NO_DATA, never a fabricated status.
 *   - Missing data / failed calculations never trigger and never flip the
 *     stored transition state.
 *
 * Concurrency: every state write is a compare-and-set on the stored
 * triggerCount (Prisma JSON path filter) - concurrent evaluations of the
 * same rule serialize; the deterministic uuid-v5 event id makes a replayed
 * trigger a storage-level no-op (P2002 swallowed in DisciplineService).
 *
 * Honest latency (spec §7): rules evaluate AFTER closed-trade journal
 * writes (debounced METRIC_ALERTS_DEBOUNCE_MS, default 1s) and on the
 * manual evaluate endpoint. There is NO background scheduler and NO
 * real-time streaming - a documented limitation, not real-time alerting.
 * The engine can NEVER place/modify/close orders: its only writes are a
 * rule-state JSON document and an inbox alert row.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import {
  alertSchema,
  createMetricAlertRuleInputSchema,
  metricAlertRuleSchema,
  metricAlertRulesResponseSchema,
  updateMetricAlertRuleInputSchema,
  type Alert,
  type AnalyticsFilters,
  type AnalyticsSuiteResponse,
  type EvaluateMetricAlertsResponse,
  type MetricAlertEventPayload,
  type MetricAlertPeriod,
  type MetricAlertRule,
  type MetricAlertRuleState,
} from "../../shared/contracts";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { DomainEventsService } from "../../infrastructure/events/domain-events.module";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { AccountsRepository } from "../accounts/accounts.repository";
import { PlaybookRepository } from "../playbook/playbook.repository";
import { DisciplineService } from "../discipline/discipline.service";
import { DisciplineRepository } from "../discipline/discipline.repository";
import { GoalService } from "../review/goal.service";
import { ReviewRepository } from "../review/review.repository";
import {
  evaluateRuleTick,
  extractSummaryObservation,
  metricAlertCopy,
  metricAlertEventId,
  metricAlertPayload,
  metricAlertSemanticKey,
  validateMetricAlertRuleSemantics,
  type MetricObservation,
  type RuleTickOutcome,
} from "./metric-alerts.logic";
import { MetricAlertRepository, type MetricAlertRuleRow } from "./metric-alerts.repository";

const TRADING_ERROR = TRADE_ERROR_CODES;

type CreateRuleInput = z.infer<typeof createMetricAlertRuleInputSchema>;
type UpdateRuleInput = z.infer<typeof updateMetricAlertRuleInputSchema>;
type ThresholdRule = Extract<MetricAlertRule, { kind: "THRESHOLD" }>;
type GoalRule = Extract<MetricAlertRule, { kind: "GOAL" }>;

const INITIAL_STATE: MetricAlertRuleState = {
  lastConditionMet: null,
  lastTriggeredAt: null,
  lastEvaluationAt: null,
  lastObservedValue: null,
  lastObservation: "NO_DATA",
  triggerCount: 0,
};

/** Cap on the per-rule event history returned by GET /alert-rules/:id/events. */
const RULE_EVENTS_CAP = 50;

interface TickContext {
  periodStart: string | null;
  periodEnd: string | null;
}

@Injectable()
export class MetricAlertsService implements OnModuleInit, OnModuleDestroy {
  /** Debounced post-write evaluation timers per user (coalesces bursts). */
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly debounceMs: number;

  constructor(
    private readonly repository: MetricAlertRepository,
    private readonly prisma: PrismaService,
    private readonly discipline: DisciplineService,
    private readonly disciplineRepository: DisciplineRepository,
    private readonly analytics: AnalyticsService,
    private readonly goals: GoalService,
    private readonly accountsRepository: AccountsRepository,
    private readonly playbookRepository: PlaybookRepository,
    private readonly reviewRepository: ReviewRepository,
    private readonly events: DomainEventsService,
  ) {
    const raw = Number(process.env.METRIC_ALERTS_DEBOUNCE_MS);
    this.debounceMs = Number.isFinite(raw) && raw >= 0 ? raw : 1_000;
  }

  onModuleInit(): void {
    // Closed-trade writes are the evaluation trigger (all five write paths
    // publish trade.closed - manual close, capture-closed, CSV import, OCR
    // bridge, provider reconciliation). Bursts (imports) coalesce into one
    // evaluation per debounce window.
    this.events.subscribe("trade.closed", (event) => {
      this.scheduleEvaluation(event.userId);
    });
  }

  onModuleDestroy(): void {
    for (const timer of this.pendingTimers.values()) clearTimeout(timer);
    this.pendingTimers.clear();
  }

  private scheduleEvaluation(userId: string): void {
    const existing = this.pendingTimers.get(userId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingTimers.delete(userId);
      void this.evaluateUserRules(userId).catch((error) => {
        // Listener errors are contained (event-bus contract) - a failed
        // evaluation must never fail the trade write that triggered it.
        console.error("[metric-alerts] post-write evaluation failed", error);
      });
    }, this.debounceMs);
    this.pendingTimers.set(userId, timer);
  }

  // ── Rule documents ─────────────────────────────────────────────────────────

  /** Parse a stored row into the shared contract; corrupt docs drop out. */
  private parseRuleRow(row: MetricAlertRuleRow): MetricAlertRule | null {
    const parsed = metricAlertRuleSchema.safeParse(row.data);
    return parsed.success ? parsed.data : null;
  }

  async listRules(userId: string): Promise<z.infer<typeof metricAlertRulesResponseSchema>> {
    const rows = await this.repository.listByUser(userId);
    const rules = rows
      .map((row) => this.parseRuleRow(row))
      .filter((rule): rule is MetricAlertRule => rule !== null);
    return metricAlertRulesResponseSchema.parse({ rules });
  }

  async createRule(userId: string, input: CreateRuleInput): Promise<MetricAlertRule> {
    const now = new Date().toISOString();
    // Goal rules carry no suite scope (the goal engine owns its window).
    const scope =
      input.kind === "THRESHOLD"
        ? { accountId: input.accountId ?? null, strategyId: input.strategyId ?? null }
        : { accountId: null, strategyId: null };
    await this.validateRefs(userId, {
      accountId: scope.accountId,
      strategyId: scope.strategyId,
      goalId: input.kind === "GOAL" ? input.goalId : null,
    });

    const shared = {
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      enabled: input.enabled ?? true,
      cooldownMinutes: input.cooldownMinutes ?? 0,
      state: { ...INITIAL_STATE },
      createdAt: now,
      updatedAt: now,
    };
    const draft: MetricAlertRule =
      input.kind === "THRESHOLD"
        ? ({
            ...shared,
            ...scope,
            kind: "THRESHOLD",
            metric: input.metric,
            condition: input.condition,
            threshold: input.threshold,
            period: input.period,
          } satisfies ThresholdRule)
        : ({
            ...shared,
            ...scope,
            kind: "GOAL",
            goalId: input.goalId,
            goalCondition: input.goalCondition,
            thresholdPct: input.thresholdPct ?? null,
          } satisfies GoalRule);

    const parsed = metricAlertRuleSchema.safeParse(draft);
    if (!parsed.success) {
      throw new ValidationError("Invalid alert rule document");
    }
    const doc = parsed.data;
    const semanticError = validateMetricAlertRuleSemantics(doc);
    if (semanticError !== null) {
      throw new ValidationError(semanticError);
    }
    await this.assertNoDuplicate(userId, doc, null);

    await this.repository.insert(userId, doc.id, doc as unknown as Prisma.InputJsonValue);
    return doc;
  }

  async updateRule(
    userId: string,
    ruleId: string,
    input: UpdateRuleInput,
  ): Promise<MetricAlertRule> {
    const row = await this.repository.findForUser(userId, ruleId);
    if (row === null) {
      throw new NotFoundError("Alert rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const current = this.parseRuleRow(row);
    if (current === null) {
      throw new ValidationError("Stored rule document is invalid and cannot be edited");
    }

    // Merge - kind NEVER changes (not an accepted field).
    const mergedDraft: unknown =
      current.kind === "THRESHOLD"
        ? {
            ...current,
            name: input.name ?? current.name,
            enabled: input.enabled ?? current.enabled,
            cooldownMinutes: input.cooldownMinutes ?? current.cooldownMinutes,
            metric: input.metric ?? current.metric,
            condition: input.condition ?? current.condition,
            threshold: input.threshold ?? current.threshold,
            period: input.period ?? current.period,
            accountId:
              input.accountId === undefined ? current.accountId : (input.accountId ?? null),
            strategyId:
              input.strategyId === undefined ? current.strategyId : (input.strategyId ?? null),
            updatedAt: new Date().toISOString(),
          }
        : {
            ...current,
            name: input.name ?? current.name,
            enabled: input.enabled ?? current.enabled,
            cooldownMinutes: input.cooldownMinutes ?? current.cooldownMinutes,
            goalId: input.goalId ?? current.goalId,
            goalCondition: input.goalCondition ?? current.goalCondition,
            thresholdPct:
              input.thresholdPct === undefined
                ? current.thresholdPct
                : (input.thresholdPct ?? null),
            updatedAt: new Date().toISOString(),
          };

    const parsed = metricAlertRuleSchema.safeParse(mergedDraft);
    if (!parsed.success) {
      throw new ValidationError("Invalid alert rule document");
    }
    const merged = parsed.data;
    await this.validateRefs(userId, {
      accountId: merged.accountId,
      strategyId: merged.strategyId,
      goalId: merged.kind === "GOAL" ? merged.goalId : null,
    });
    const semanticError = validateMetricAlertRuleSemantics(merged);
    if (semanticError !== null) {
      throw new ValidationError(semanticError);
    }
    await this.assertNoDuplicate(userId, merged, merged.id);

    await this.repository.updateData(row.id, merged as unknown as Prisma.InputJsonValue);
    return merged;
  }

  async deleteRule(userId: string, ruleId: string): Promise<{ ok: true }> {
    const row = await this.repository.findForUser(userId, ruleId);
    if (row === null) {
      throw new NotFoundError("Alert rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    // Hard delete (discipline-rules convention). Triggered events survive:
    // each alert payload carries the frozen rule context (name, metric,
    // threshold, observed value) - the audit history never breaks (§9).
    await this.repository.deleteForUser(userId, ruleId);
    return { ok: true };
  }

  /** Recent events for one rule - inbox rows whose payload references it. */
  async listRuleEvents(userId: string, ruleId: string): Promise<{ events: Alert[] }> {
    const row = await this.repository.findForUser(userId, ruleId);
    if (row === null) {
      throw new NotFoundError("Alert rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const alertRows = await this.disciplineRepository.listByKind(userId, "ALERT");
    const events = alertRows
      .map((alertRow) => {
        const parsed = alertSchema.safeParse({
          id: alertRow.id,
          userId: alertRow.userId,
          ...(alertRow.data as Record<string, unknown>),
        });
        return parsed.success ? parsed.data : null;
      })
      .filter((alert): alert is Alert => alert !== null)
      .filter(
        (alert) =>
          alert.type === "METRIC_THRESHOLD" &&
          (alert.payload as Record<string, unknown> | null)?.ruleId === ruleId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, RULE_EVENTS_CAP);
    return { events };
  }

  // ── Validation helpers ─────────────────────────────────────────────────────

  /** Account/strategy/goal references must belong to the owner (spec §5). */
  private async validateRefs(
    userId: string,
    refs: {
      accountId?: string | null;
      strategyId?: string | null;
      goalId?: string | null;
    },
  ): Promise<void> {
    if (typeof refs.accountId === "string" && refs.accountId.length > 0) {
      const accounts = await this.accountsRepository.listAccountsByUser(userId);
      if (!accounts.some((account) => account.id === refs.accountId)) {
        throw new NotFoundError("Account not found", TRADING_ERROR.TRADE_NOT_FOUND);
      }
    }
    if (
      typeof refs.strategyId === "string" &&
      refs.strategyId !== "none" &&
      refs.strategyId.length > 0
    ) {
      const strategies = await this.playbookRepository.listStrategies(userId);
      if (!strategies.some((strategy) => strategy.id === refs.strategyId)) {
        throw new NotFoundError("Strategy not found", TRADING_ERROR.TRADE_NOT_FOUND);
      }
    }
    if (typeof refs.goalId === "string" && refs.goalId.length > 0) {
      const goalRows = await this.reviewRepository.listByKind(userId, "GOAL");
      if (!goalRows.some((goalRow) => goalRow.id === refs.goalId)) {
        throw new NotFoundError("Goal not found", TRADING_ERROR.TRADE_NOT_FOUND);
      }
    }
  }

  /** Exact-duplicate guard (spec §5) - near duplicates stay allowed. */
  private async assertNoDuplicate(
    userId: string,
    candidate: MetricAlertRule,
    excludeRuleId: string | null,
  ): Promise<void> {
    const rows = await this.repository.listByUser(userId);
    const candidateKey = metricAlertSemanticKey(candidate);
    for (const row of rows) {
      if (excludeRuleId !== null && row.id === excludeRuleId) continue;
      const existing = this.parseRuleRow(row);
      if (existing !== null && metricAlertSemanticKey(existing) === candidateKey) {
        throw new ConflictError("An identical alert rule already exists");
      }
    }
  }

  // ── Evaluation engine ──────────────────────────────────────────────────────

  /**
   * Evaluate every ENABLED rule for one user. Batched: one suite call per
   * distinct scope, one goal-progress pass for all goal rules.
   */
  async evaluateUserRules(userId: string): Promise<EvaluateMetricAlertsResponse> {
    const rows = await this.repository.listByUser(userId);
    const rules = rows
      .map((row) => this.parseRuleRow(row))
      .filter((rule): rule is MetricAlertRule => rule !== null && rule.enabled);

    const evaluatedAt = new Date().toISOString();
    if (rules.length === 0) {
      return {
        evaluatedRules: 0,
        triggeredEvents: 0,
        skippedNoData: 0,
        failedScopes: 0,
        evaluatedAt,
      };
    }

    let triggeredEvents = 0;
    let skippedNoData = 0;
    let failedScopes = 0;
    let evaluatedRules = 0;

    // ── THRESHOLD rules - group by scope, one suite call per group ──────────
    const thresholdRules = rules.filter(
      (rule): rule is ThresholdRule => rule.kind === "THRESHOLD",
    );
    const scopeGroups = new Map<string, ThresholdRule[]>();
    for (const rule of thresholdRules) {
      const key = `${rule.period}|${rule.accountId ?? ""}|${rule.strategyId ?? ""}`;
      scopeGroups.set(key, [...(scopeGroups.get(key) ?? []), rule]);
    }

    for (const [key, group] of scopeGroups) {
      const [period, accountId, strategyId] = key.split("|");
      let suite: AnalyticsSuiteResponse | null = null;
      let failed = false;
      try {
        suite = await this.fetchSummary(userId, {
          period: period as MetricAlertPeriod,
          accountId: accountId || undefined,
          strategyId: strategyId || undefined,
        });
      } catch (error) {
        // A failed metric calculation must not evaluate the rule (spec §6)
        // - and must not crash the whole pass.
        console.error("[metric-alerts] suite evaluation failed", { userId, scope: key, error });
        failed = true;
        failedScopes += 1;
      }

      for (const rule of group) {
        const observation: MetricObservation =
          failed || suite === null
            ? { ok: false, reason: "CALC_FAILED" }
            : extractSummaryObservation(rule.metric, suite.summary);
        evaluatedRules += 1;
        if (!observation.ok) skippedNoData += 1;
        const committed = await this.applyTick(userId, rule, observation, {
          periodStart: suite?.meta.resolvedFrom ?? null,
          periodEnd: suite?.meta.resolvedTo ?? null,
        });
        if (committed) triggeredEvents += 1;
      }
    }

    // ── GOAL rules - one authoritative progress pass ─────────────────────────
    const goalRules = rules.filter((rule): rule is GoalRule => rule.kind === "GOAL");
    if (goalRules.length > 0) {
      let progressByGoal: Map<string, number | null>;
      try {
        const { goals } = await this.goals.listGoals(userId);
        progressByGoal = new Map(goals.map((goal) => [goal.goal.id, goal.progress.progressPct]));
      } catch (error) {
        console.error("[metric-alerts] goal progress failed", { userId, error });
        progressByGoal = new Map();
        failedScopes += 1;
      }
      for (const rule of goalRules) {
        const progressPct = progressByGoal.get(rule.goalId);
        // A deleted goal is NO_DATA (rule stays quiet) - never a fake status.
        const observation: MetricObservation =
          progressPct === undefined || progressPct === null
            ? { ok: false, reason: "NO_DATA" }
            : { ok: true, value: progressPct };
        evaluatedRules += 1;
        if (!observation.ok) skippedNoData += 1;
        const committed = await this.applyTick(userId, rule, observation, {
          periodStart: null,
          periodEnd: null,
        });
        if (committed) triggeredEvents += 1;
      }
    }

    return {
      evaluatedRules,
      triggeredEvents,
      skippedNoData,
      failedScopes,
      evaluatedAt,
    };
  }

  /** The authoritative suite - the SAME engine the Analytics page renders. */
  private async fetchSummary(
    userId: string,
    filters: { period: MetricAlertPeriod; accountId?: string; strategyId?: string },
  ): Promise<AnalyticsSuiteResponse> {
    const suiteFilters: AnalyticsFilters = {
      period: filters.period,
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.strategyId ? { strategyId: filters.strategyId } : {}),
    };
    // sims=100 = the engine's floor - Monte-Carlo volume is irrelevant here;
    // the summary is the consumed part and nothing is re-derived.
    return this.analytics.getAnalyticsSuite(userId, suiteFilters, 100);
  }

  /**
   * One rule tick: decide → persist event (deterministic id) → CAS the
   * state. Returns true when an event was committed this tick.
   */
  private async applyTick(
    userId: string,
    rule: MetricAlertRule,
    observation: MetricObservation,
    context: TickContext,
  ): Promise<boolean> {
    const now = new Date();
    const tick: RuleTickOutcome = evaluateRuleTick(rule, observation, rule.state, now);
    const nowIso = now.toISOString();
    let inserted = false;

    if (tick.outcome === "TRIGGER") {
      const eventId = metricAlertEventId(rule.id, tick.triggerCount);
      const period = rule.kind === "THRESHOLD" ? rule.period : null;
      const { title, message } = metricAlertCopy(rule, tick.observedValue, period);
      const payload: MetricAlertEventPayload = metricAlertPayload(
        rule,
        tick.observedValue,
        `t${tick.triggerCount}`,
        nowIso,
        {
          period,
          periodStart: context.periodStart,
          periodEnd: context.periodEnd,
        },
      );
      // Event first (deterministic id swallows replays), CAS second - a
      // lost race can only duplicate-suppress, never lose the event.
      inserted = await this.discipline.publishAlert(userId, {
        id: eventId,
        type: "METRIC_THRESHOLD",
        severity: "NOTIFY",
        title,
        message,
        payload: payload as unknown as Record<string, unknown>,
        tradeId: null,
      });
    }

    // CAS state write - only if the triggerCount we evaluated against is
    // still current. Racing evaluations lose cleanly; a replayed trigger
    // never regresses the stored state (the CAS write itself is idempotent
    // across racers - every racer computed the same nextState).
    await this.prisma.metricAlertRuleRow.updateMany({
      where: {
        id: rule.id,
        userId,
        data: {
          path: ["state", "triggerCount"],
          equals: rule.state.triggerCount,
        },
      },
      data: {
        data: {
          ...(rule as unknown as Record<string, unknown>),
          state: tick.nextState,
          updatedAt: nowIso,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    // The counter reports events THIS pass actually inserted - a replayed
    // publish (racing manual evaluate after an auto-evaluation's publish)
    // counts as zero: the event exists exactly once (deterministic id).
    return tick.outcome === "TRIGGER" && inserted;
  }
}
