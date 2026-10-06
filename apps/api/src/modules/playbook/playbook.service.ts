/**
 * Playbook application service (B10) — strategy CRUD with SERVER-SIDE
 * versioning (§17: definition edits freeze the prior version), setups,
 * checklist templates, operating rules, duplicate-as-draft, template
 * library, and the module aggregates (overview / stats / insights).
 * All aggregates derive from stored trades — never invented client-side.
 */
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import {
  type createChecklistInputSchema,
  type createPlaybookRuleInputSchema,
  type createSetupInputSchema,
  type createStrategyInputSchema,
  type updateChecklistInputSchema,
  type updatePlaybookRuleInputSchema,
  type updateSetupInputSchema,
  type updateStrategyInputSchema,
  type ChecklistTemplate,
  type ComplianceSummary,
  type PlaybookOverviewResponse,
  type PlaybookRule,
  type PlaybookTemplatesResponse,
  type SessionBucket,
  type Setup,
  type SetupInsightsResponse,
  type StrategiesStatsResponse,
  type Strategy,
  type StrategyVersionsResponse,
  type StrategiesResponse,
} from "../../shared/contracts";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { ReviewRepository } from "../review/review.repository";
import { TradesRepository, type TradeRow } from "../trades/trades.repository";
import { dateKeyOf } from "../trades/trade-calculations";
import { PlaybookRepository, type PlaybookRow } from "./playbook.repository";
import {
  playbookTemplateCards,
  templateToCreateInput,
} from "./playbook-seed";

const TRADING_ERROR = TRADE_ERROR_CODES;

type CreateStrategyInput = z.infer<typeof createStrategyInputSchema>;
type UpdateStrategyInput = z.infer<typeof updateStrategyInputSchema>;
type CreateSetupInput = z.infer<typeof createSetupInputSchema>;
type UpdateSetupInput = z.infer<typeof updateSetupInputSchema>;
type CreateChecklistInput = z.infer<typeof createChecklistInputSchema>;
type UpdateChecklistInput = z.infer<typeof updateChecklistInputSchema>;
type CreatePlaybookRuleInput = z.infer<typeof createPlaybookRuleInputSchema>;
type UpdatePlaybookRuleInput = z.infer<typeof updatePlaybookRuleInputSchema>;

/** Definition fields whose change creates a NEW version (§17). */
const STRATEGY_DEFINITION_FIELDS = [
  "description",
  "entryRules",
  "exitRules",
  "riskRules",
  "detailedDescription",
  "marketProfile",
  "marketConditions",
  "entryConditions",
  "confirmations",
  "invalidations",
  "risk",
  "tradeManagement",
  "exitPlan",
] as const;

const COMPLIANCE_WINDOW = 20;

@Injectable()
export class PlaybookService {
  constructor(
    private readonly repository: PlaybookRepository,
    private readonly trades: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly reviews: ReviewRepository,
  ) {}

  private nowIso(): string {
    return new Date().toISOString();
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toDecimalString(value: number): string {
    if (Number.isInteger(value)) return value.toFixed(1);
    return String(value);
  }

  // ── strategies ────────────────────────────────────────────────────────────

  async listStrategies(userId: string): Promise<StrategiesResponse> {
    const rows = await this.repository.listByKind(userId, "STRATEGY");
    return { strategies: rows.map((row) => row.data as unknown as Strategy) };
  }

  private async strategiesOf(userId: string): Promise<Strategy[]> {
    const rows = await this.repository.listByKind(userId, "STRATEGY");
    return rows.map((row) => row.data as unknown as Strategy);
  }

  async createStrategy(userId: string, input: CreateStrategyInput): Promise<Strategy> {
    const now = this.nowIso();
    const strategy: Strategy = {
      id: crypto.randomUUID(),
      userId,
      name: input.name.trim(),
      description: input.description ?? null,
      entryRules: input.entryRules ?? null,
      exitRules: input.exitRules ?? null,
      riskRules: input.riskRules ?? null,
      grade: input.grade ?? null,
      status: input.status ?? "ACTIVE",
      color: input.color ?? null,
      createdAt: now,
      version: 1,
      tags: input.tags ?? [],
      detailedDescription: input.detailedDescription ?? null,
      marketProfile: input.marketProfile ?? null,
      marketConditions: input.marketConditions ?? [],
      entryConditions: input.entryConditions ?? [],
      confirmations: input.confirmations ?? [],
      invalidations: input.invalidations ?? [],
      risk: input.risk ?? null,
      tradeManagement: input.tradeManagement ?? [],
      exitPlan: input.exitPlan ?? [],
      updatedAt: now,
    } as unknown as Strategy;
    await this.repository.insert(userId, "STRATEGY", strategy.id, strategy as unknown as never);
    return strategy;
  }

  private async loadStrategy(userId: string, strategyId: string): Promise<PlaybookRow> {
    const row = await this.repository.findForUser(userId, "STRATEGY", strategyId);
    if (row === null) {
      throw new NotFoundError("Strategy not found", TRADING_ERROR.UNKNOWN_STRATEGY);
    }
    return row;
  }

  async updateStrategy(userId: string, strategyId: string, input: UpdateStrategyInput): Promise<Strategy> {
    const row = await this.loadStrategy(userId, strategyId);
    const strategy = row.data as unknown as Strategy;
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") {
        throw new BusinessRuleError("Strategy name cannot be empty", TRADING_ERROR.INVALID_TRADE_DATA);
      }
      strategy.name = name;
    }

    // Versioning (§17): freeze the CURRENT definition BEFORE any content
    // mutation — a trade executed under v1 must stay explainable as v1.
    const touchesDefinition = STRATEGY_DEFINITION_FIELDS.some(
      (field) => (input as Record<string, unknown>)[field] !== undefined,
    );
    if (touchesDefinition) {
      const priorVersion = strategy.version ?? 1;
      await this.repository.insert(
        userId,
        "VERSION",
        crypto.randomUUID(),
        {
          strategyId: strategy.id,
          version: priorVersion,
          snapshot: structuredClone(strategy),
          reason: "Edited in the Playbook",
          createdAt: this.nowIso(),
        } as unknown as never,
      );
      strategy.version = priorVersion + 1;
    }

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value !== undefined && key !== "name") {
        (strategy as unknown as Record<string, unknown>)[key] = structuredClone(value);
      }
    }
    strategy.updatedAt = this.nowIso();
    await this.repository.updateData(row.id, strategy as unknown as never);
    return strategy;
  }

  async duplicateStrategy(userId: string, strategyId: string): Promise<Strategy> {
    const row = await this.loadStrategy(userId, strategyId);
    const source = row.data as unknown as Strategy;
    const copy = await this.createStrategy(userId, {
      ...structuredClone({
        description: source.description,
        entryRules: source.entryRules,
        exitRules: source.exitRules,
        riskRules: source.riskRules,
        color: source.color,
        tags: source.tags ?? [],
        detailedDescription: source.detailedDescription,
        marketProfile: source.marketProfile,
        marketConditions: source.marketConditions ?? [],
        entryConditions: source.entryConditions ?? [],
        confirmations: source.confirmations ?? [],
        invalidations: source.invalidations ?? [],
        risk: source.risk,
        tradeManagement: source.tradeManagement ?? [],
        exitPlan: source.exitPlan ?? [],
      }),
      name: `${source.name} (copy)`.slice(0, 80),
      status: "DRAFT",
      grade: null,
    } as unknown as CreateStrategyInput);
    // Setups and scoped checklists duplicate; history does NOT follow.
    for (const row2 of await this.repository.listByKind(userId, "SETUP")) {
      const setup = row2.data as unknown as Setup;
      if (setup.strategyId !== source.id) continue;
      const clone = { ...structuredClone(setup), id: crypto.randomUUID(), strategyId: copy.id, createdAt: this.nowIso(), updatedAt: this.nowIso() };
      await this.repository.insert(userId, "SETUP", clone.id, clone as unknown as never);
    }
    for (const row2 of await this.repository.listByKind(userId, "CHECKLIST")) {
      const checklist = row2.data as unknown as ChecklistTemplate;
      if (checklist.strategyId !== source.id) continue;
      const clone = { ...structuredClone(checklist), id: crypto.randomUUID(), strategyId: copy.id, createdAt: this.nowIso(), updatedAt: this.nowIso() };
      await this.repository.insert(userId, "CHECKLIST", clone.id, clone as unknown as never);
    }
    return copy;
  }

  async deleteStrategy(userId: string, strategyId: string): Promise<{ ok: true }> {
    const row = await this.loadStrategy(userId, strategyId);
    // FK-RESTRICT semantics: a strategy with history is paused, never
    // erased — the playbook evolves but the journal stays true.
    const trades = await this.trades.listTrades(userId, {});
    if (trades.some((t) => t.strategyId === strategyId)) {
      throw new ConflictError(
        "This strategy has trades attached — pause or retire it instead.",
        TRADING_ERROR.INVALID_TRADE_STATE,
      );
    }
    await this.repository.deleteByDataField(userId, "SETUP", "strategyId", strategyId);
    await this.repository.deleteByDataField(userId, "CHECKLIST", "strategyId", strategyId);
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }

  // ── setups ────────────────────────────────────────────────────────────────

  private async requireStrategy(userId: string, strategyId: string): Promise<void> {
    const strategies = await this.strategiesOf(userId);
    if (!strategies.some((s) => s.id === strategyId)) {
      throw new BusinessRuleError("Unknown strategy for this playbook item", TRADING_ERROR.UNKNOWN_STRATEGY);
    }
  }

  async listSetups(userId: string): Promise<{ setups: Setup[] }> {
    const rows = await this.repository.listByKind(userId, "SETUP");
    return {
      setups: rows
        .map((row) => row.data as unknown as Setup)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async createSetup(userId: string, input: CreateSetupInput): Promise<Setup> {
    await this.requireStrategy(userId, input.strategyId);
    const now = this.nowIso();
    const setup: Setup = {
      id: crypto.randomUUID(),
      userId,
      strategyId: input.strategyId,
      name: input.name.trim(),
      status: input.status ?? "ACTIVE",
      description: input.description ?? null,
      context: input.context ?? null,
      marketCondition: input.marketCondition ?? null,
      trigger: input.trigger ?? null,
      confirmation: input.confirmation ?? null,
      entryModel: input.entryModel ?? null,
      stopModel: input.stopModel ?? null,
      targetModel: input.targetModel ?? null,
      invalidation: input.invalidation ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Setup;
    await this.repository.insert(userId, "SETUP", setup.id, setup as unknown as never);
    return setup;
  }

  private async loadSetup(userId: string, setupId: string): Promise<PlaybookRow> {
    const row = await this.repository.findForUser(userId, "SETUP", setupId);
    if (row === null) {
      throw new NotFoundError("Setup not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return row;
  }

  async updateSetup(userId: string, setupId: string, input: UpdateSetupInput): Promise<Setup> {
    const row = await this.loadSetup(userId, setupId);
    const setup = row.data as unknown as Setup;
    if (input.strategyId !== undefined) await this.requireStrategy(userId, input.strategyId);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") {
        throw new BusinessRuleError("Setup name cannot be empty", TRADING_ERROR.INVALID_TRADE_DATA);
      }
      setup.name = name;
    }
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value !== undefined) (setup as unknown as Record<string, unknown>)[key] = value;
    }
    setup.updatedAt = this.nowIso();
    await this.repository.updateData(row.id, setup as unknown as never);
    return setup;
  }

  async deleteSetup(userId: string, setupId: string): Promise<{ ok: true }> {
    const row = await this.loadSetup(userId, setupId);
    const trades = await this.trades.listTrades(userId, {});
    if (trades.some((t) => t.setupId === setupId)) {
      throw new ConflictError("This setup has trades attached — pause it instead.", TRADING_ERROR.INVALID_TRADE_STATE);
    }
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }

  // ── checklist templates ───────────────────────────────────────────────────

  async listChecklists(userId: string): Promise<{ checklists: ChecklistTemplate[] }> {
    const rows = await this.repository.listByKind(userId, "CHECKLIST");
    return {
      checklists: rows
        .map((row) => row.data as unknown as ChecklistTemplate)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async createChecklist(userId: string, input: CreateChecklistInput): Promise<ChecklistTemplate> {
    if (input.strategyId !== null && input.strategyId !== undefined) {
      await this.requireStrategy(userId, input.strategyId);
    }
    const now = this.nowIso();
    const checklist: ChecklistTemplate = {
      id: crypto.randomUUID(),
      userId,
      strategyId: input.strategyId ?? null,
      name: input.name.trim(),
      items: structuredClone(input.items),
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insert(userId, "CHECKLIST", checklist.id, checklist as unknown as never);
    return checklist;
  }

  async updateChecklist(userId: string, checklistId: string, input: UpdateChecklistInput): Promise<ChecklistTemplate> {
    const row = await this.repository.findForUser(userId, "CHECKLIST", checklistId);
    if (row === null) {
      throw new NotFoundError("Checklist not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const checklist = row.data as unknown as ChecklistTemplate;
    if (input.strategyId !== undefined && input.strategyId !== null) {
      await this.requireStrategy(userId, input.strategyId);
    }
    if (input.strategyId !== undefined) checklist.strategyId = input.strategyId;
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") {
        throw new BusinessRuleError("Checklist name cannot be empty", TRADING_ERROR.INVALID_TRADE_DATA);
      }
      checklist.name = name;
    }
    if (input.items !== undefined) checklist.items = structuredClone(input.items);
    checklist.updatedAt = this.nowIso();
    await this.repository.updateData(row.id, checklist as unknown as never);
    return checklist;
  }

  async deleteChecklist(userId: string, checklistId: string): Promise<{ ok: true }> {
    const row = await this.repository.findForUser(userId, "CHECKLIST", checklistId);
    if (row === null) {
      throw new NotFoundError("Checklist not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }

  // ── operating rules ───────────────────────────────────────────────────────

  async listPlaybookRules(userId: string): Promise<{ rules: PlaybookRule[] }> {
    const rows = await this.repository.listByKind(userId, "RULE");
    return {
      rules: rows
        .map((row) => row.data as unknown as PlaybookRule)
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
  }

  async createPlaybookRule(userId: string, input: CreatePlaybookRuleInput): Promise<PlaybookRule> {
    if (input.scope === "STRATEGY") {
      if (!input.strategyId) {
        throw new BusinessRuleError("A strategy-scoped rule needs a strategy", TRADING_ERROR.INVALID_TRADE_DATA);
      }
      await this.requireStrategy(userId, input.strategyId);
    }
    const now = this.nowIso();
    const rule: PlaybookRule = {
      id: crypto.randomUUID(),
      userId,
      title: input.title.trim(),
      detail: input.detail,
      category: input.category,
      scope: input.scope,
      strategyId: input.scope === "STRATEGY" ? input.strategyId ?? null : null,
      evaluatable: input.evaluatable ?? false,
      evaluationHint: input.evaluationHint ?? null,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insert(userId, "RULE", rule.id, rule as unknown as never);
    return rule;
  }

  async updatePlaybookRule(userId: string, ruleId: string, input: UpdatePlaybookRuleInput): Promise<PlaybookRule> {
    const row = await this.repository.findForUser(userId, "RULE", ruleId);
    if (row === null) {
      throw new NotFoundError("Playbook rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const rule = row.data as unknown as PlaybookRule;
    if (input.strategyId !== undefined && input.strategyId !== null) {
      await this.requireStrategy(userId, input.strategyId);
    }
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title === "") {
        throw new BusinessRuleError("Rule title cannot be empty", TRADING_ERROR.INVALID_TRADE_DATA);
      }
      rule.title = title;
    }
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value !== undefined && key !== "title") {
        (rule as unknown as Record<string, unknown>)[key] = value;
      }
    }
    rule.updatedAt = this.nowIso();
    await this.repository.updateData(row.id, rule as unknown as never);
    return rule;
  }

  async deletePlaybookRule(userId: string, ruleId: string): Promise<{ ok: true }> {
    const row = await this.repository.findForUser(userId, "RULE", ruleId);
    if (row === null) {
      throw new NotFoundError("Playbook rule not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }

  // ── templates + versions ──────────────────────────────────────────────────

  async listTemplates(): Promise<PlaybookTemplatesResponse> {
    return { templates: playbookTemplateCards() };
  }

  async instantiateTemplate(userId: string, input: { key: string; name?: string }): Promise<Strategy> {
    const payload = templateToCreateInput(input.key, input.name);
    if (payload === null) {
      throw new NotFoundError("Unknown playbook template", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return this.createStrategy(userId, { ...payload, status: "DRAFT" });
  }

  async listStrategyVersions(userId: string, strategyId: string): Promise<StrategyVersionsResponse> {
    const row = await this.loadStrategy(userId, strategyId);
    const strategy = row.data as unknown as Strategy;
    const versionRows = await this.repository.listByKind(userId, "VERSION");
    return {
      strategyId,
      currentVersion: strategy.version ?? 1,
      versions: versionRows
        .filter((snapshot) => (snapshot.data as { strategyId?: string })["strategyId"] === strategyId)
        .sort((a, b) => (b.data as { version?: number })["version"]! - (a.data as { version?: number })["version"]!)
        .map((snapshot) => structuredClone(snapshot.data) as StrategyVersionsResponse["versions"][number]),
    };
  }

  // ── aggregates ────────────────────────────────────────────────────────────

  private sortKeyOf(trade: TradeRow): string {
    return `${dateKeyOf(trade.tradingDate)}T${(trade.exitAt ?? trade.entryAt).toISOString()}`;
  }

  private async playbookCompliance(userId: string): Promise<ComplianceSummary> {
    const [all, reviewRows] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.reviews.listReviewsForUser(userId),
    ]);
    const reviewByTrade = new Map(
      reviewRows.map((row) => [(row.data as { tradeId?: string })["tradeId"], row.data as { playbookMatch?: string }]),
    );
    const recent = all
      .filter((t) => t.status === "CLOSED")
      .sort((a, b) => (b.exitAt ?? b.entryAt).getTime() - (a.exitAt ?? a.entryAt).getTime())
      .slice(0, COMPLIANCE_WINDOW);
    let matched = 0;
    let partial = 0;
    let offPlaybook = 0;
    let reviewed = 0;
    let unreviewed = 0;
    for (const trade of recent) {
      const match = reviewByTrade.get(trade.id)?.playbookMatch ?? null;
      if (match === "MATCHED") {
        matched += 1;
        reviewed += 1;
      } else if (match === "PARTIAL") {
        partial += 1;
        reviewed += 1;
      } else if (match === "OFF_PLAYBOOK") {
        offPlaybook += 1;
        reviewed += 1;
      } else {
        unreviewed += 1;
      }
    }
    return {
      windowSize: COMPLIANCE_WINDOW,
      reviewed,
      matched,
      partial,
      offPlaybook,
      unreviewed,
      scorePct: reviewed > 0 ? this.round1((matched / reviewed) * 100) : null,
    };
  }

  async overview(userId: string): Promise<PlaybookOverviewResponse> {
    const [all, strategies, setupRows, checklistRows, ruleRows] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.strategiesOf(userId),
      this.repository.listByKind(userId, "SETUP"),
      this.repository.listByKind(userId, "CHECKLIST"),
      this.repository.listByKind(userId, "RULE"),
    ]);
    const setups = setupRows.map((row) => row.data as unknown as Setup);
    const checklists = checklistRows.map((row) => row.data as unknown as ChecklistTemplate);
    const rules = ruleRows.map((row) => row.data as unknown as PlaybookRule);
    const closed = all.filter((t) => t.status === "CLOSED");
    const playbookClosed = closed.filter((t) => t.strategyId !== null);

    const byStatus = (status: string): number => strategies.filter((s) => s.status === status).length;

    const graded = playbookClosed.filter((t) => t.followedPlan !== null);
    const followedPct =
      graded.length > 0
        ? (graded.filter((t) => t.followedPlan === true).length / graded.length) * 100
        : null;

    const netPnl = playbookClosed.reduce((sum, t) => sum + (t.pnlNet?.toNumber() ?? 0), 0);
    const wins = playbookClosed.filter((t) => (t.pnlNet?.toNumber() ?? 0) > 0).length;
    const sumR = playbookClosed.reduce((sum, t) => sum + (t.rMultiple?.toNumber() ?? 0), 0);

    const recentlyUpdated = [...strategies]
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .slice(0, 5)
      .map((s) => ({
        strategyId: s.id,
        name: s.name,
        status: s.status,
        color: s.color,
        version: s.version ?? 1,
        updatedAt: s.updatedAt ?? s.createdAt,
      }));

    const usage = new Map<string, { lastTradeAt: string; tradesCount: number }>();
    for (const trade of all) {
      if (trade.strategyId === null) continue;
      const entryAt = trade.entryAt.toISOString();
      const current = usage.get(trade.strategyId);
      usage.set(trade.strategyId, {
        lastTradeAt:
          current && current.lastTradeAt > entryAt ? current.lastTradeAt : entryAt,
        tradesCount: (current?.tradesCount ?? 0) + 1,
      });
    }
    const recentlyUsed = [...usage.entries()]
      .sort(([, a], [, b]) => b.lastTradeAt.localeCompare(a.lastTradeAt))
      .slice(0, 5)
      .map(([strategyId, info]) => {
        const strategy = strategies.find((s) => s.id === strategyId);
        return {
          strategyId,
          name: strategy?.name ?? "Unknown strategy",
          color: strategy?.color ?? null,
          lastTradeAt: info.lastTradeAt,
          tradesCount: info.tradesCount,
        };
      });

    // §20 completeness health — factual flags, no profitability judgment.
    const hasGlobalChecklist = checklists.some((c) => c.strategyId === null);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const health = strategies.map((s) => {
      const flags: PlaybookOverviewResponse["health"][number]["flags"] = [];
      if (s.status === "DRAFT") flags.push("DRAFT");
      if (s.status === "RETIRED") flags.push("ARCHIVED");
      const lastUse = usage.get(s.id)?.lastTradeAt;
      if (lastUse === undefined || lastUse < thirtyDaysAgo) flags.push("NO_RECENT_TRADES");
      const risk = s.risk;
      const riskMissing =
        risk === null || risk === undefined
          ? true
          : Object.values(risk).every((value) => value === null);
      if (riskMissing) flags.push("MISSING_RISK");
      if ((s.entryConditions?.length ?? 0) === 0 && s.entryRules === null) {
        flags.push("MISSING_ENTRY_CONDITIONS");
      }
      if ((s.invalidations?.length ?? 0) === 0) flags.push("MISSING_INVALIDATION");
      const hasOwnChecklist = checklists.some((c) => c.strategyId === s.id);
      if (!hasOwnChecklist && !hasGlobalChecklist) flags.push("MISSING_CHECKLIST");
      return { strategyId: s.id, flags };
    });

    const accounts = await this.accounts.listAccountsByUser(userId);
    const currencyParse = (await import("../../shared/contracts")).currencySchema.safeParse(
      accounts[0]?.currency ?? "USD",
    );
    const currency = currencyParse.success ? currencyParse.data : "USD";

    return {
      counts: {
        totalStrategies: strategies.length,
        active: byStatus("ACTIVE"),
        draft: byStatus("DRAFT"),
        paused: byStatus("PAUSED"),
        archived: byStatus("RETIRED"),
        totalSetups: setups.length,
        totalRules: rules.length,
        totalChecklists: checklists.length,
      },
      recentlyUpdated,
      recentlyUsed,
      compliance: await this.playbookCompliance(userId),
      performanceSummary: {
        netPnl: this.toDecimalString(this.round2(netPnl)),
        currency,
        trades: playbookClosed.length,
        winRate: playbookClosed.length > 0 ? this.round2((wins / playbookClosed.length) * 100) : null,
        expectancyR:
          playbookClosed.length > 0
            ? this.toDecimalString(this.round2(sumR / playbookClosed.length))
            : null,
        followedPlanPct: followedPct === null ? null : this.round2(followedPct),
      },
      health,
      meta: { generatedAt: this.nowIso() },
    };
  }

  async strategyStats(userId: string): Promise<StrategiesStatsResponse> {
    const [all, strategies] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.strategiesOf(userId),
    ]);
    const closed = all.filter((t) => t.status === "CLOSED");
    const stats: StrategiesStatsResponse["stats"] = [];
    const candidates: { strategyId: string; name: string; last20Expectancy: number; sampleSize: number }[] = [];

    for (const strategy of strategies) {
      const own = closed
        .filter((t) => t.strategyId === strategy.id)
        .sort((a, b) => this.sortKeyOf(a).localeCompare(this.sortKeyOf(b)));
      if (own.length === 0) continue;

      const count = own.length;
      const wins = own.filter((t) => (t.pnlNet?.toNumber() ?? 0) > 0).length;
      const sumR = own.reduce((sum, t) => sum + (t.rMultiple?.toNumber() ?? 0), 0);
      const winRate = wins / count;
      const avgR = sumR / count;

      let cumR = 0;
      const sparkline = own.map((t) => {
        cumR += t.rMultiple?.toNumber() ?? 0;
        return this.toDecimalString(this.round2(cumR));
      });

      const last = own.slice(-20);
      const last20Expectancy =
        last.reduce((sum, t) => sum + (t.rMultiple?.toNumber() ?? 0), 0) / last.length;

      stats.push({
        strategyId: strategy.id,
        trades: count,
        winRate: this.toDecimalString(this.round2(winRate)),
        avgR: this.toDecimalString(this.round2(avgR)),
        sparkline,
        last20Expectancy: this.toDecimalString(this.round2(last20Expectancy)),
      });
      if (last.length >= 5 && last20Expectancy < 0) {
        candidates.push({
          strategyId: strategy.id,
          name: strategy.name,
          last20Expectancy,
          sampleSize: last.length,
        });
      }
    }

    // The coach banner calls out the WORST negative last-20 expectancy —
    // computed from the data, never a hardcoded name.
    const worst = candidates.sort((a, b) => a.last20Expectancy - b.last20Expectancy)[0] ?? null;
    return {
      stats,
      underperforming:
        worst === null
          ? null
          : {
              strategyId: worst.strategyId,
              name: worst.name,
              last20Expectancy: this.toDecimalString(this.round2(worst.last20Expectancy)),
              sampleSize: worst.sampleSize,
            },
    };
  }

  /** Entry-hour session buckets (UTC): the market heuristic for setups. */
  private sessionOf(iso: string): SessionBucket {
    const hour = new Date(iso).getUTCHours();
    if (hour < 7) return "ASIA";
    if (hour < 12) return "LONDON";
    if (hour < 16) return "OVERLAP";
    if (hour < 21) return "NEW_YORK";
    return "LATE";
  }

  async setupInsights(userId: string): Promise<SetupInsightsResponse> {
    const cutoff = Date.now() - 90 * 86_400_000;
    const [setupRows, all] = await Promise.all([
      this.repository.listByKind(userId, "SETUP"),
      this.trades.listTrades(userId, {}),
    ]);
    const setups = setupRows.map((row) => row.data as unknown as Setup);
    const insights: SetupInsightsResponse["insights"] = [];
    for (const setup of setups) {
      const own = all.filter(
        (trade) =>
          trade.setupId === setup.id &&
          trade.status === "CLOSED" &&
          Date.parse((trade.exitAt ?? trade.entryAt).toISOString()) >= cutoff,
      );
      const wins = own.filter((trade) => (trade.pnlNet?.toNumber() ?? 0) > 0).length;
      const rSum = own.reduce((sum, trade) => sum + (trade.rMultiple?.toNumber() ?? 0), 0);

      const rByInstrument = new Map<string, number>();
      const sessionCount = new Map<SessionBucket, number>();
      for (const trade of own) {
        const r = trade.rMultiple?.toNumber() ?? 0;
        rByInstrument.set(trade.instrumentId, (rByInstrument.get(trade.instrumentId) ?? 0) + r);
        const bucket = this.sessionOf(trade.entryAt.toISOString());
        sessionCount.set(bucket, (sessionCount.get(bucket) ?? 0) + 1);
      }
      let topInstrumentId: string | null = null;
      let bestR = -Infinity;
      for (const [instrumentId, instrumentR] of rByInstrument) {
        if (instrumentR > bestR) {
          bestR = instrumentR;
          topInstrumentId = instrumentId;
        }
      }
      let topSession: SessionBucket | null = null;
      let bestCount = 0;
      for (const bucket of ["ASIA", "LONDON", "OVERLAP", "NEW_YORK", "LATE"] as SessionBucket[]) {
        const count = sessionCount.get(bucket) ?? 0;
        if (count > bestCount) {
          bestCount = count;
          topSession = bucket;
        }
      }
      const topInstrument =
        topInstrumentId !== null ? await this.symbolOf(topInstrumentId) : null;

      insights.push({
        setupId: setup.id,
        strategyId: setup.strategyId,
        windowDays: 90,
        trades: own.length,
        wins,
        winRatePct: own.length > 0 ? this.round1((wins / own.length) * 100) : null,
        totalR: own.length > 0 ? this.round2(rSum) : null,
        expectancyR: own.length > 0 ? this.round2(rSum / own.length) : null,
        topInstrument,
        topInstrumentId,
        topSession,
        smallSample: own.length < 5,
      });
    }
    return { insights };
  }

  private async symbolOf(instrumentId: string): Promise<string | null> {
    const instrument = await this.trades.findInstrument(instrumentId);
    return instrument?.symbol ?? null;
  }
}
