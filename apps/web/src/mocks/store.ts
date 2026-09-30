import {
  ANALYTIC_SESSIONS,
  ANALYTICS_HOUR_BUCKETS,
  ANALYTICS_WEEKDAYS,
  EMOTION_LABELS,
  computeRiskAmount,
  pnlForExit,
  toDecimalString,
  toTradingDateKey,
  type Account,
  type AcknowledgeViolationInput,
  type Alert,
  type AlertsResponse,
  type EcoEventsResponse,
  type AnalyticsBucket,
  type AnalyticsResponse,
  type AnalyticsFilters,
  type AnalyticsReportRow,
  type AnalyticsSymbolRow,
  type AnalyticsSuiteResponse,
  type CloseTradeInput,
  type CreateRuleInput,
  type CreateSkippedTradeInput,
  type CreateStrategyInput,
  type CreateTagInput,
  type CreateTradeInput,
  type CreateTradeResponse,
  type DailyStat,
  type DeleteScreenshotResponse,
  type DeleteTradeResponse,
  type DisciplineScoreResponse,
  type Emotion,
  type GradeOutcomeCell,
  type GradeOutcomeRow,
  type HeatmapCell,
  type Instrument,
  type MistakeLedgerResponse,
  type NotesUpdateInput,
  type PlanUpdateInput,
  type PlanUpdateResponse,
  type Profile,
  type ProfileUpdateInput,
  type PsychologyUpdateInput,
  type RevealPayload,
  type ReviewResponse,
  type ReviewUpdateInput,
  type ReviewUpdateResponse,
  type Rule,
  type RulesResponse,
  type RulesStatusResponse,
  type RuleViolation,
  type RuleViolationView,
  type SessionTimelineResponse,
  type SettleSkippedTradeInput,
  type SkippedTrade,
  type SkippedTradesResponse,
  type SleepPoint,
  type StatsOverviewResponse,
  type StrategiesStatsResponse,
  type Strategy,
  type StrategyDistribution,
  type StrategyStat,
  type Tag,
  type TagsResponse,
  type BackupPayload,
  type ImportBackupResponse,
  type TiltPoint,
  type Trade,
  type TradeDecisionInput,
  type TradeScreenshot,
  type TradeScreenshotsResponse,
  type AddScreenshotInput,
  type TradesListResponse,
  type TradeMistake,
  type TradeEvent,
  type UpdateRuleInput,
  type UpdateStrategyInput,
  type UpdateTradeInput,
  type UpdateTradeResponse,
  type ViolationsResponse,
  type UserPreferences,
  type PreferenceDomain,
  type DeactivateAccountResponse,
  type RequestAccountDeletionResponse,
  // Professional Playbook module
  type ChecklistTemplate,
  type ChecklistsResponse,
  type CreateChecklistInput,
  type CreatePlaybookRuleInput,
  type CreateSetupInput,
  type InstantiateTemplateInput,
  type PlaybookOverviewResponse,
  type PlaybookRule,
  type PlaybookRulesResponse,
  type PlaybookTemplatesResponse,
  type Setup,
  type SetupsResponse,
  type StrategyVersionSnapshot,
  type UpdateChecklistInput,
  type UpdatePlaybookRuleInput,
  // Trade Review module (fusion with Goal)
  type CreateGoalInput,
  type Goal,
  type GoalDirection,
  type GoalMetric,
  type GoalPeriod,
  type GoalStatus,
  type GoalUnit,
  type GoalWithProgress,
  type GoalsResponse,
  type LessonEntry,
  type LessonsResponse,
  type ReviewRow,
  type ReviewsResponse,
  type TradeReview,
  type TradeReviewOverviewResponse,
  type UpdateGoalInput,
  type UpsertReviewInput,
  type UpdateSetupInput,
  DEFAULT_USER_PREFERENCES,
  tradingPreferencesSchema,
  riskPreferencesSchema,
  journalPreferencesSchema,
  notificationPreferencesSchema,
  appearancePreferencesSchema,
  dashboardPreferencesSchema,
  academyPreferencesSchema,
  privacyPreferencesSchema,
  localizationPreferencesSchema,
} from "@cosmoz/shared";

import { buildFixtureData, USER_TZ, type FixtureData } from "./fixtures";
import { mulberry32 } from "./fixtures/random";
import { integrationEngine } from "./integration-engine";
import { buildPlaybookSeed, playbookTemplateCards, templateToCreateInput } from "./playbook-seed";
import { buildGoalSeed, buildReviewSeed } from "./review-seed";

/** Per-domain validation schemas — one source of truth, used by the handler. */
const PREFERENCE_DOMAIN_SCHEMAS = {
  trading: tradingPreferencesSchema,
  risk: riskPreferencesSchema,
  journal: journalPreferencesSchema,
  notifications: notificationPreferencesSchema,
  appearance: appearancePreferencesSchema,
  dashboard: dashboardPreferencesSchema,
  academy: academyPreferencesSchema,
  privacy: privacyPreferencesSchema,
  localization: localizationPreferencesSchema,
} as const;

/**
 * In-memory mock backend. Initialized from the seeded fixtures; every
 * mutation updates the store so the UI reflects changes without a server.
 * Lives in browser memory for the page session — a full reload reseeds it.
 */

export class MockError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MockError";
    this.status = status;
  }
}

const round2 = (value: number): number => Number(value.toFixed(2));
const round1 = (value: number): number => Number(value.toFixed(1));
/** Next calendar-day key (UTC date arithmetic on YYYY-MM-DD). */
const shiftDayKey = (key: string): string => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
/** Inclusive calendar-day distance between two date keys. */
const dayDiff = (from: string, to: string): number =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
/** Round a histogram step to a human number (1/2/2.5/5 × 10^k). */
const niceStep = (raw: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (raw <= multiple * magnitude) return multiple * magnitude;
  }
  return 10 * magnitude;
};

export function createMockStore() {
  const data: FixtureData = buildFixtureData();
  /** Alerts generated while handling a given trade's mutations (V1 response channel). */
  const alertsByTrade = new Map<string, Alert[]>();
  /** Trade ↔ tag join rows (tradeId → tagIds), Act 3 review. */
  const tradeTags = new Map<string, Set<string>>();
  /** Trade screenshots (module gallery) — data URLs held in memory. */
  const screenshotsByTrade = new Map<string, TradeScreenshot[]>();
  const user = data.user;
  const mainAccount = data.accounts.find((a) => a.isDefault) ?? data.accounts[0]!;

  // ── Professional Playbook state (seeded once, same lifecycle as fixtures) ─
  const playbookSeed = buildPlaybookSeed(user.id, data.strategies);
  const setups: Setup[] = playbookSeed.setups;
  const checklists: ChecklistTemplate[] = playbookSeed.checklists;
  const playbookRules: PlaybookRule[] = playbookSeed.rules;
  /** Historical strategy definitions (§17) — appended, never rewritten. */
  const strategyVersions: StrategyVersionSnapshot[] = [];

  // ── Trade Review state (goals + per-trade reviews, same store lifecycle) ──
  const goals: Goal[] = buildGoalSeed(user.id);
  const reviews: TradeReview[] = buildReviewSeed(user.id, data.trades);

  /**
   * User preferences (Settings module) — seeded from the safe shared
   * defaults, with the seeded instruments/account resolved into the
   * trading domain so the trade form opens pre-filled with real ids.
   */
  const preferences: UserPreferences = (() => {
    const forexDefault = data.instruments.find((i) => i.assetClass === "FOREX") ?? data.instruments[0]!;
    return structuredClone({
      userId: user.id,
      ...DEFAULT_USER_PREFERENCES,
      trading: {
        ...DEFAULT_USER_PREFERENCES.trading,
        defaultAccountId: mainAccount.id,
        defaultInstrumentId: forexDefault.id,
      },
      localization: {
        ...DEFAULT_USER_PREFERENCES.localization,
        timezone: user.timezone,
      },
      updatedAt: new Date().toISOString(),
    });
  })();

  const instrumentById = new Map<string, Instrument>(data.instruments.map((i) => [i.id, i]));
  const mistakeById = new Map(data.mistakes.map((m) => [m.id, m]));

  const nowIso = (): string => new Date().toISOString();
  const todayKey = (): string => toTradingDateKey(nowIso(), USER_TZ);
  /** Calendar day key `offset` days before today (Toronto trading day). */
  const dateKeyOffset = (offset: number): string => {
    const shifted = new Date();
    shifted.setUTCDate(shifted.getUTCDate() + offset);
    return toTradingDateKey(shifted.toISOString(), USER_TZ);
  };
  /** Rolling aggregation window used by the discipline screens (30 days). */
  const windowStart = (): string => dateKeyOffset(-29);

  const closedTrades = (): Trade[] => data.trades.filter((t) => t.status === "CLOSED");
  const currentBalance = (): number =>
    Number(mainAccount.startingBalance) + closedTrades().reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);

  // ── Lists ────────────────────────────────────────────────────────────────

  function listTrades(query: { status?: string; graded?: string; accountId?: string }): TradesListResponse {
    let trades = data.trades.filter((t) => t.deletedAt === null);
    if (query.status) trades = trades.filter((t) => t.status === query.status);
    if (query.graded === "true") {
      trades = trades.filter((t) => t.decisionGrade !== null);
    } else if (query.graded === "false") {
      // The "to grade" queue: closed trades without a decision grade.
      trades = trades.filter((t) => t.status === "CLOSED" && t.decisionGrade === null);
    }
    if (query.accountId) trades = trades.filter((t) => t.accountId === query.accountId);
    trades.sort((a, b) => (b.exitAt ?? b.entryAt).localeCompare(a.exitAt ?? a.entryAt));
    // Tag join projection — lets the trade module render tag chips directly.
    return {
      trades: trades.map((t) => ({ ...t, tagIds: [...(tradeTags.get(t.id) ?? [])] })),
      total: trades.length,
    };
  }

  const listAccounts = (): Account[] => data.accounts;
  const listInstruments = (): Instrument[] => data.instruments;
  const listStrategies = (): Strategy[] => data.strategies;
  const listTags = (): TagsResponse => ({ tags: [...data.tags] });

  /** POST /tags — inline tag creation (Act 3 reflect, capture details). */
  function createTag(input: CreateTagInput): Tag {
    const name = input.name.trim();
    if (name === "") throw new MockError(422, "Tag name is required");
    const category = input.category ?? "CUSTOM";
    const exists = data.tags.some(
      (tag) => tag.userId === user.id && tag.name.toLowerCase() === name.toLowerCase() && tag.category === category,
    );
    if (exists) throw new MockError(409, "Tag already exists");
    const tag: Tag = {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      category,
      color: null,
      parentId: null,
    };
    data.tags.push(tag);
    return tag;
  }
  const listSkippedTrades = (): SkippedTradesResponse => ({
    skippedTrades: [...data.skippedTrades].sort((a, b) => b.seenAt.localeCompare(a.seenAt)),
  });

  function listAlerts(): AlertsResponse {
    // Goal → inbox bridge runs on every read: the topbar bell stays truthful
    // even when the Goals tab was never opened this session.
    syncGoalAlerts();
    const alerts = [...data.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unreadCount = alerts.filter((a) => a.readAt === null && a.dismissedAt === null).length;
    return { alerts, unreadCount };
  }

  function markAlertRead(alertId: string): Alert {
    const alert = data.alerts.find((a) => a.id === alertId);
    if (!alert) throw new MockError(404, "Alert not found");
    if (alert.readAt === null) alert.readAt = nowIso();
    return alert;
  }

  /** GET /eco-events — economic calendar, chronological. Fed by the
   *  Integration Hub's economic provider pipeline (§9/§22), not hardcoded. */
  function listEcoEvents(): EcoEventsResponse {
    return integrationEngine.listEcoEventsForCalendar();
  }

  /** GET /export/backup — full authored-data snapshot (feature 12). */
  function exportBackup(): BackupPayload {
    return {
      app: "cosmoz",
      schemaVersion: 1,
      exportedAt: nowIso(),
      trades: [...data.trades],
      strategies: [...data.strategies],
      tags: [...data.tags],
    };
  }

  /** POST /import/backup — replace trades, merge strategies + tags by id. */
  function importBackup(payload: BackupPayload): ImportBackupResponse {
    data.trades = [...payload.trades];

    let strategiesAdded = 0;
    for (const strategy of payload.strategies) {
      if (!data.strategies.some((existing) => existing.id === strategy.id)) {
        data.strategies.push(strategy);
        strategiesAdded += 1;
      }
    }

    let tagsAdded = 0;
    for (const tag of payload.tags) {
      if (!data.tags.some((existing) => existing.id === tag.id)) {
        data.tags.push(tag);
        tagsAdded += 1;
      }
    }

    return {
      imported: {
        trades: payload.trades.length,
        strategies: strategiesAdded,
        tags: tagsAdded,
      },
    };
  }

  // ── Trade creation & closing ─────────────────────────────────────────────

  function resolveSize(
    input: CreateTradeInput,
    entryPrice: number,
    initialStop: string | null,
  ): { quantity: string; riskAmount: string | null } {
    const contractSize = Number(instrumentById.get(input.instrumentId)?.contractSize ?? "1");
    const stopDistance = initialStop !== null ? Math.abs(entryPrice - Number(initialStop)) : null;
    const balance = currentBalance();

    if (input.size.mode === "quantity") {
      const quantity = input.size.quantity;
      const riskAmount = initialStop !== null
        ? (computeRiskAmount(String(entryPrice), initialStop, quantity, String(contractSize)) ?? null)
        : null;
      return { quantity, riskAmount };
    }
    const budget = input.size.mode === "risk_percent"
      ? (balance * Number(input.size.riskPercent)) / 100
      : Number(input.size.riskAmount);
    if (stopDistance !== null && stopDistance > 0) {
      const quantity = Math.max(0.01, Math.floor((budget / (stopDistance * contractSize)) * 100) / 100);
      return {
        quantity: toDecimalString(round2(quantity)),
        riskAmount: toDecimalString(round2(quantity * stopDistance * contractSize)),
      };
    }
    // Risk-based sizing without a stop: cannot size — minimal unit fallback.
    return { quantity: "0.01", riskAmount: toDecimalString(round2(budget)) };
  }

  function applyResults(trade: Trade): void {
    const instrument = instrumentById.get(trade.instrumentId);
    const contractSize = Number(instrument?.contractSize ?? "1");
    const entry = Number(trade.entryPrice);
    const gross = pnlForExit({
      entry: trade.entryPrice,
      exit: trade.exitPrice,
      direction: trade.direction,
      quantity: trade.quantity,
      contractSize: String(contractSize),
      fees: trade.fees,
      swap: trade.swap,
    });
    trade.pnlGross = gross === null ? null : toDecimalString(round2(Number(gross) + Number(trade.fees) + Number(trade.swap)));
    trade.pnlNet = gross === null ? null : toDecimalString(round2(Number(gross)));
    const risk = Number(trade.riskAmount ?? "0");
    trade.rMultiple = trade.pnlNet !== null && risk > 0
      ? toDecimalString(round2(Number(trade.pnlNet) / risk))
      : null;
    // MFE/MAE prices → R conversions.
    const stopDistance = trade.initialStop !== null ? Math.abs(entry - Number(trade.initialStop)) : null;
    const toR = (price: string | null): string | null =>
      price !== null && stopDistance !== null && stopDistance > 0
        ? toDecimalString(round2(Math.abs(Number(price) - entry) / stopDistance))
        : null;
    trade.mfeR = toR(trade.mfePrice);
    trade.maeR = toR(trade.maePrice);
  }

  function evaluateDiscipline(trade: Trade): void {
    const generated: Alert[] = [];
    const date = trade.tradingDate;
    const dayTrades = data.trades.filter((t) => t.tradingDate === date && t.status !== "CANCELLED");
    const dayLosses = dayTrades.filter((t) => t.status === "CLOSED" && (Number(t.pnlNet) ?? 0) < 0).length;
    const balance = currentBalance();

    for (const rule of data.rules) {
      if (!rule.isActive) continue;
      const params = rule.params as { limit?: number };
      const limit = typeof params.limit === "number" ? params.limit : null;
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
        const risk = Number(trade.riskAmount ?? "0");
        current = round2((risk / balance) * 100);
        breached = current > limit;
      }
      if (!breached) continue;

      const alreadyAlerted = data.alerts.some(
        (a) => a.tradeId === trade.id && (a.payload as { ruleId?: string } | null)?.ruleId === rule.id,
      );
      if (alreadyAlerted) continue;

      // rule_violations row — the durable record the discipline screen's log
      // reads (alerts stay the V1 response channel). Context freezes values
      // at time T (data-model.md "Domaine 7").
      const violation: RuleViolation = {
        id: crypto.randomUUID(),
        ruleId: rule.id,
        userId: trade.userId,
        tradeId: trade.id,
        occurredAt: nowIso(),
        context:
          rule.type === "MAX_RISK_PCT_PER_TRADE"
            ? { riskPct: current, limit }
            : rule.type === "MAX_LOSSES_PER_DAY"
              ? { lossesToday: current, limit }
              : { tradesToday: current, limit },
        acknowledgedAt: null,
        userNote: null,
      };
      data.ruleViolations.push(violation);

      const alert: Alert = {
        id: crypto.randomUUID(),
        userId: trade.userId,
        type: "RULE_VIOLATION",
        severity: rule.severity,
        title: `${rule.type.replaceAll("_", " ").toLowerCase()} limit reached`,
        message: `Rule ${rule.type} (limit ${limit}) triggered at ${current}.`,
        payload: { ruleId: rule.id, limit, current },
        tradeId: trade.id,
        readAt: null,
        dismissedAt: null,
        createdAt: nowIso(),
      };
      data.alerts.push(alert);
      generated.push(alert);
    }
    if (generated.length > 0) {
      alertsByTrade.set(trade.id, [...(alertsByTrade.get(trade.id) ?? []), ...generated]);
    }
  }

  function refreshDailyStat(date: string): DailyStat {
    const dayTrades = data.trades.filter((t) => t.tradingDate === date && t.status === "CLOSED");
    const dayGhosts = data.skippedTrades.filter((g) => toTradingDateKey(g.seenAt, USER_TZ) === date);
    const dayMistakes = data.tradeMistakes.filter((m) => dayTrades.some((t) => t.id === m.tradeId)).length;
    const dayViolations = data.alerts.filter(
      (a) => a.tradeId !== null && dayTrades.some((t) => t.id === a.tradeId) && a.type === "RULE_VIOLATION",
    ).length;
    const savedR = dayGhosts
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_LOST")
      .reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR ?? "0")), 0);
    const hesitatedR = dayGhosts
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_WON")
      .reduce((sum, g) => sum + Number(g.hypotheticalR ?? "0"), 0);
    const graded = dayTrades.filter((t) => t.decisionGrade !== null);
    const followedPct = graded.length > 0
      ? graded.filter((t) => t.followedPlan === true).length / graded.length
      : null;
    const disciplineScore = followedPct === null
      ? null
      : round2(
          Math.max(0, Math.min(100,
            100 * (0.55 * followedPct
              + 0.25 * (1 - Math.min(1, dayMistakes / Math.max(1, dayTrades.length)))
              + 0.2 * (1 - Math.min(1, dayViolations / Math.max(1, dayTrades.length))))),
          ),
        );

    const existing = data.dailyStats.find((s) => s.date === date);
    const stat: DailyStat = {
      id: existing?.id ?? crypto.randomUUID(),
      userId: user.id,
      date,
      tradesCount: dayTrades.length,
      winsCount: dayTrades.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length,
      lossesCount: dayTrades.filter((t) => (Number(t.pnlNet) ?? 0) < 0).length,
      pnlNet: toDecimalString(round2(dayTrades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0))),
      rEarned: toDecimalString(round2(dayTrades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0))),
      disciplineScore: disciplineScore === null ? (existing?.disciplineScore ?? null) : toDecimalString(disciplineScore),
      mistakesCount: dayMistakes,
      violationsCount: dayViolations,
      ghostTradesCount: dayGhosts.length,
      savedR: savedR > 0 ? toDecimalString(round2(savedR)) : null,
      hesitatedR: hesitatedR > 0 ? toDecimalString(round2(hesitatedR)) : null,
      sleepHours: existing?.sleepHours ?? null,
      moodPre: existing?.moodPre ?? null,
    };
    if (existing) {
      Object.assign(existing, stat);
      return existing;
    }
    data.dailyStats.push(stat);
    return stat;
  }

  function createTrade(input: CreateTradeInput): CreateTradeResponse {
    const entryAt = input.entryAt ?? nowIso();
    const entryPrice = Number(input.entryPrice);
    const initialStop = input.initialStop ?? null;
    const { quantity, riskAmount } = resolveSize(input, entryPrice, initialStop);

    // Playbook link integrity (§21): the setup must belong to the strategy,
    // and the strategy definition version is FROZEN at entry (§17).
    let setupId: string | null = null;
    let strategyVersion: number | null = null;
    if (input.strategyId !== undefined) {
      const strategy = data.strategies.find((s) => s.id === input.strategyId);
      if (!strategy) throw new MockError(422, "Unknown strategy for this trade");
      strategyVersion = strategy.version ?? 1;
      if (input.setupId !== undefined) {
        const setup = setups.find((s) => s.id === input.setupId);
        if (!setup || setup.strategyId !== input.strategyId) {
          throw new MockError(422, "Setup does not belong to the selected strategy");
        }
        setupId = setup.id;
      }
    }

    const trade: Trade = {
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
      setupId,
      strategyVersion,
      status: input.variant === "open" ? "OPEN" : "CLOSED",
      direction: input.direction,
      entryPrice: input.entryPrice,
      entryAt,
      quantity,
      initialStop,
      initialTP: input.initialTP ?? null,
      plannedRR: input.plannedRR ?? null,
      riskAmount,
      finalStop: null,
      exitPrice: null,
      exitAt: null,
      exitReason: null,
      fees: input.fees ?? "0",
      swap: input.swap ?? "0",
      pnlGross: null,
      pnlNet: null,
      rMultiple: null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      emotionBefore: input.emotionBefore ?? null,
      emotionAfter: null,
      confidence: input.confidence ?? null,
      decisionGrade: null,
      followedPlan: null,
      checklistSnap: null,
      notes: input.reason ?? null,
      lessons: null,
      tradingDate: toTradingDateKey(entryAt, USER_TZ),
      externalRef: input.externalRef ?? null,
      importBatchId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    };

    if (input.variant === "closed") {
      trade.exitPrice = input.exitPrice;
      trade.exitAt = input.exitAt;
      trade.exitReason = input.exitReason;
      applyResults(trade);
    }
    data.trades.push(trade);
    evaluateDiscipline(trade);
    refreshDailyStat(trade.tradingDate);

    if (input.variant === "open") return trade;
    // HARD CONTRACT (trade-entry-ux.md §13): no P&L fields in this response.
    return { id: trade.id, awaitingDecision: true };
  }

  function closeTrade(tradeId: string, input: CloseTradeInput): CreateTradeResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "OPEN") throw new MockError(409, "Trade is not open");

    if (input.mode === "single") {
      trade.exitPrice = input.exitPrice;
      trade.exitAt = input.exitAt;
      trade.exitReason = input.exitReason;
      if (input.fees !== undefined) trade.fees = input.fees;
      if (input.swap !== undefined) trade.swap = input.swap;
      trade.mfePrice = input.mfePrice ?? null;
      trade.maePrice = input.maePrice ?? null;
    } else {
      const totalQty = input.exits.reduce((sum, leg) => sum + Number(leg.quantity), 0);
      const weighted = input.exits.reduce((sum, leg) => sum + Number(leg.price) * Number(leg.quantity), 0);
      trade.exitPrice = totalQty > 0 ? toDecimalString(round2(weighted / totalQty)) : trade.entryPrice;
      trade.exitAt = input.exits[input.exits.length - 1]?.exitedAt ?? nowIso();
      trade.exitReason = input.exits[0]?.reason ?? "MANUAL";
      trade.quantity = toDecimalString(round2(totalQty));
      if (input.fees !== undefined) trade.fees = input.fees;
      if (input.swap !== undefined) trade.swap = input.swap;
      trade.mfePrice = input.mfePrice ?? null;
      trade.maePrice = input.maePrice ?? null;
    }
    trade.status = "CLOSED";
    trade.updatedAt = nowIso();
    applyResults(trade);
    evaluateDiscipline(trade);
    refreshDailyStat(trade.tradingDate);

    return { id: trade.id, awaitingDecision: true };
  }

  // ── Decision gate & reveal ───────────────────────────────────────────────

  function decide(tradeId: string, input: TradeDecisionInput): RevealPayload {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "CLOSED") throw new MockError(409, "Trade is not closed");
    // Gradeable = closed and not yet graded (same definition as the "to grade"
    // queue). Derived from state, NOT from the in-session awaitingDecision set,
    // so "grade later from the queue" survives reloads (§5 graceful degradation).
    if (trade.decisionGrade !== null) {
      throw new MockError(409, "Decision already submitted");
    }

    trade.decisionGrade = input.grade;
    trade.followedPlan = input.followedPlan;
    trade.updatedAt = nowIso();
    refreshDailyStat(trade.tradingDate);

    const win = (Number(trade.rMultiple) ?? 0) >= 0;
    const bucket = input.grade === "A" || input.grade === "B" ? "ab" : "df";
    const avoidedToday = data.skippedTrades.filter(
      (g) =>
        g.outcomeGuess === "WOULD_HAVE_LOST" &&
        toTradingDateKey(g.seenAt, USER_TZ) === todayKey(),
    );
    const savedRToday = avoidedToday.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR ?? "0")), 0);

    return {
      tradeId: trade.id,
      pnlNet: trade.pnlNet ?? "0",
      rMultiple: trade.rMultiple ?? "0",
      durationSeconds: Math.max(0, Math.round((Date.parse(trade.exitAt ?? trade.entryAt) - Date.parse(trade.entryAt)) / 1000)),
      coachingKey: `${win ? "win" : "loss"}_${bucket}`,
      detectedMistakes: data.tradeMistakes
        .filter((m) => m.tradeId === trade.id)
        .map((m) => {
          const catalog = mistakeById.get(m.mistakeId);
          return {
            mistakeId: m.mistakeId,
            key: catalog?.key ?? "unknown",
            label: catalog?.label ?? "Unknown mistake",
            category: catalog?.category ?? "BEHAVIOR",
            detectedBy: m.detectedBy,
            userConfirmed: m.userConfirmed,
          };
        }),
      triggeredAlerts: (alertsByTrade.get(trade.id) ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
      })),
      savedSetupsToday: avoidedToday.length,
      savedRToday: toDecimalString(round2(savedRToday)),
    };
  }

  function getReview(tradeId: string): ReviewResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    const detectedMistakes = data.tradeMistakes
      .filter((m) => m.tradeId === tradeId)
      .map((m) => {
        const catalog = mistakeById.get(m.mistakeId);
        return {
          id: m.id,
          mistakeId: m.mistakeId,
          key: catalog?.key ?? "unknown",
          label: catalog?.label ?? "Unknown mistake",
          category: catalog?.category ?? "BEHAVIOR",
          detectedBy: m.detectedBy,
          userConfirmed: m.userConfirmed,
          note: m.note,
        };
      });
    const tagIds = [...(tradeTags.get(tradeId) ?? [])];
    return { trade, detectedMistakes, tagIds };
  }

  // ── Act 3 review persistence (PATCH /trades/:id/review) ──────────────────

  function updateReview(tradeId: string, input: ReviewUpdateInput): ReviewUpdateResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");

    if (input.mfePrice !== undefined) trade.mfePrice = input.mfePrice;
    if (input.maePrice !== undefined) trade.maePrice = input.maePrice;
    if (input.lesson !== undefined) trade.lessons = input.lesson;
    if (input.tagIds !== undefined) {
      tradeTags.set(tradeId, new Set(input.tagIds));
    }
    // MFE/MAE price → R conversions are recomputed SERVER-side (§13).
    if (input.mfePrice !== undefined || input.maePrice !== undefined) {
      applyResults(trade);
    }
    trade.updatedAt = nowIso();
    return { trade };
  }

  function resolveMistake(tradeId: string, tradeMistakeId: string, confirmed: boolean) {
    const row: TradeMistake | undefined = data.tradeMistakes.find(
      (m) => m.id === tradeMistakeId && m.tradeId === tradeId,
    );
    if (!row) throw new MockError(404, "Trade mistake not found");
    row.userConfirmed = confirmed;
    row.note = row.note ?? null;
    const catalog = mistakeById.get(row.mistakeId);
    return {
      id: row.id,
      mistakeId: row.mistakeId,
      key: catalog?.key ?? "unknown",
      label: catalog?.label ?? "Unknown mistake",
      category: catalog?.category ?? "BEHAVIOR",
      detectedBy: row.detectedBy,
      userConfirmed: row.userConfirmed,
      note: row.note,
    };
  }

  // ── Open-trade mutations ─────────────────────────────────────────────────

  function updatePlan(tradeId: string, input: PlanUpdateInput): PlanUpdateResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "OPEN") throw new MockError(409, "Only open trades can be re-planned");

    let event: TradeEvent | null = null;
    if (input.stop !== undefined) {
      event = {
        id: crypto.randomUUID(),
        tradeId,
        type: "SL_MODIFIED",
        payload: { from: trade.finalStop ?? trade.initialStop, to: input.stop },
        source: "USER",
        createdAt: nowIso(),
      };
      data.tradeEvents.push(event);
      trade.finalStop = input.stop;
    }
    if (input.tp !== undefined) {
      const tpEvent: TradeEvent = {
        id: crypto.randomUUID(),
        tradeId,
        type: "TP_MODIFIED",
        payload: { from: trade.initialTP, to: input.tp },
        source: "USER",
        createdAt: nowIso(),
      };
      data.tradeEvents.push(tpEvent);
      trade.initialTP = input.tp;
      event = event ?? tpEvent;
    }
    trade.updatedAt = nowIso();
    return { trade, event: event! };
  }

  function updatePsychology(tradeId: string, input: PsychologyUpdateInput): Trade {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (input.emotionBefore !== undefined) trade.emotionBefore = input.emotionBefore;
    if (input.emotionAfter !== undefined) trade.emotionAfter = input.emotionAfter;
    if (input.confidence !== undefined) trade.confidence = input.confidence;
    trade.updatedAt = nowIso();
    return trade;
  }

  // ── Ghost trades ─────────────────────────────────────────────────────────

  function createSkippedTrade(input: CreateSkippedTradeInput): SkippedTrade {
    const seenAt = input.seenAt ?? nowIso();
    const ghost: SkippedTrade = {
      id: crypto.randomUUID(),
      userId: user.id,
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
      direction: input.direction ?? null,
      seenAt,
      reason: input.reason,
      outcomeGuess: null,
      hypotheticalR: null,
      notes: input.notes ?? null,
      createdAt: nowIso(),
    };
    data.skippedTrades.push(ghost);
    refreshDailyStat(toTradingDateKey(seenAt, USER_TZ));
    return ghost;
  }

  function settleSkippedTrade(skippedId: string, input: SettleSkippedTradeInput): SkippedTrade {
    const ghost = data.skippedTrades.find((g) => g.id === skippedId);
    if (!ghost) throw new MockError(404, "Skipped trade not found");
    ghost.outcomeGuess = input.outcomeGuess;
    ghost.hypotheticalR = input.hypotheticalR ?? null;
    refreshDailyStat(toTradingDateKey(ghost.seenAt, USER_TZ));
    return ghost;
  }

  // ── Discipline banner & analytics ────────────────────────────────────────

  function rulesStatus(accountId: string | null): RulesStatusResponse {
    const today = todayKey();
    const balance = currentBalance();
    const dayTrades = data.trades.filter(
      (t) => t.tradingDate === today && t.status !== "CANCELLED" && (accountId === null || t.accountId === accountId),
    );
    const dayClosed = dayTrades.filter((t) => t.status === "CLOSED");
    const tradesToday = dayTrades.length;
    const lossesToday = dayClosed.filter((t) => (Number(t.pnlNet) ?? 0) < 0).length;
    const riskCommitted = dayTrades.reduce((sum, t) => sum + Number(t.riskAmount ?? "0"), 0);
    const riskBudgetSpentPct = balance > 0 ? round2((riskCommitted / balance) * 100) : 0;

    const limits = data.rules
      .filter((r) => r.isActive)
      .map((r) => {
        const params = r.params as { limit?: number };
        const limit = typeof params.limit === "number" ? params.limit : 0;
        let current = 0;
        if (r.type === "MAX_TRADES_PER_DAY") current = tradesToday;
        else if (r.type === "MAX_LOSSES_PER_DAY") current = lossesToday;
        else if (r.type === "MAX_RISK_PCT_PER_TRADE") {
          current = round2(
            Math.max(0, ...dayTrades.map((t) => (Number(t.riskAmount ?? "0") / balance) * 100)),
          );
        }
        return { ruleId: r.id, type: r.type, severity: r.severity, limit: toDecimalString(limit), current: toDecimalString(round2(current)) };
      });

    return {
      date: today,
      accountId,
      tradesToday,
      lossesToday,
      riskBudgetSpentPct: toDecimalString(riskBudgetSpentPct),
      limits,
    };
  }

  function statsOverview(): StatsOverviewResponse {
    const closed = [...closedTrades()].sort(
      (a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt),
    );
    const netPnl = closed.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
    const wins = closed.filter((t) => (Number(t.pnlNet) ?? 0) > 0);
    const grossProfit = wins.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
    const grossLoss = Math.abs(closed.filter((t) => (Number(t.pnlNet) ?? 0) < 0).reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0));
    const winRate = closed.length > 0 ? wins.length / closed.length : 0;
    const expectancy = closed.length > 0
      ? closed.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / closed.length
      : 0;
    const scored = data.dailyStats.filter((s) => s.disciplineScore !== null);
    const disciplineScore = scored.length > 0
      ? round2(scored.reduce((sum, s) => sum + Number(s.disciplineScore), 0) / scored.length)
      : null;

    const byDay = new Map<string, { pnl: number; count: number }>();
    const byDayTrades = new Map<string, Trade[]>();
    for (const trade of closed) {
      const entry = byDay.get(trade.tradingDate) ?? { pnl: 0, count: 0 };
      entry.pnl += Number(trade.pnlNet) ?? 0;
      entry.count += 1;
      byDay.set(trade.tradingDate, entry);
      const list = byDayTrades.get(trade.tradingDate) ?? [];
      list.push(trade);
      byDayTrades.set(trade.tradingDate, list);
    }
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    let equity = Number(mainAccount.startingBalance);
    const equityCurve: StatsOverviewResponse["equityCurve"] = [];
    const dailyPnl: StatsOverviewResponse["dailyPnl"] = [];
    for (const [date, entry] of days) {
      equity += entry.pnl;
      equityCurve.push({ date, equity: toDecimalString(round2(equity)) });
      dailyPnl.push({ date, pnlNet: toDecimalString(round2(entry.pnl)), tradesCount: entry.count });
    }

    // ── Peak & max drawdown (server-computed display chips) ──────────────────
    let runningPeak = Number(mainAccount.startingBalance);
    let maxDdPct = 0;
    for (const point of equityCurve) {
      const eq = Number(point.equity);
      if (eq > runningPeak) runningPeak = eq;
      if (runningPeak > 0) {
        const ddPct = ((eq - runningPeak) / runningPeak) * 100;
        if (ddPct < maxDdPct) maxDdPct = ddPct;
      }
    }
    const equityPeak = Math.max(runningPeak, Number(mainAccount.startingBalance));

    // ── Deltas WEEK VS WEEK (last 7 trading days vs the 7 before that) —
    // all aggregates stay server-side, decimal strings out ──────────────────
    const shiftDateKey = (offsetDays: number): string => {
      const shifted = new Date();
      shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
      return toTradingDateKey(shifted.toISOString(), USER_TZ);
    };
    const currentStart = shiftDateKey(-6);
    const prevStart = shiftDateKey(-13);

    const aggregate = (trades: Trade[]) => {
      const count = trades.length;
      const winCount = trades.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
      const gp = trades
        .filter((t) => (Number(t.pnlNet) ?? 0) > 0)
        .reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
      const gl = Math.abs(
        trades
          .filter((t) => (Number(t.pnlNet) ?? 0) < 0)
          .reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0),
      );
      return {
        netPnl: trades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0),
        winRate: count > 0 ? (winCount / count) * 100 : null,
        profitFactor: gl > 0 ? gp / gl : null,
        expectancy: count > 0 ? trades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / count : null,
        hasData: count > 0,
      };
    };
    const cur = aggregate(closed.filter((t) => t.tradingDate >= currentStart));
    const prev = aggregate(
      closed.filter((t) => t.tradingDate >= prevStart && t.tradingDate < currentStart),
    );
    const avgDiscipline = (from: string, to: string): number | null => {
      const rows = data.dailyStats.filter(
        (s) => s.date >= from && s.date <= to && s.disciplineScore !== null,
      );
      if (rows.length === 0) return null;
      return rows.reduce((sum, s) => sum + Number(s.disciplineScore), 0) / rows.length;
    };
    const curDisc = avgDiscipline(currentStart, shiftDateKey(0));
    const prevDisc = avgDiscipline(prevStart, currentStart);

    const rawDelta = (current: number | null, previous: number | null): StatsOverviewResponse["deltas"]["winRate"] => {
      if (current === null || previous === null) return { value: null, direction: "FLAT" };
      const diff = round2(current - previous);
      return {
        value: toDecimalString(diff),
        direction: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT",
      };
    };
    const netPnlDelta: StatsOverviewResponse["deltas"]["netPnl"] =
      !cur.hasData || !prev.hasData || prev.netPnl === 0
        ? { value: null, direction: cur.netPnl > prev.netPnl && cur.hasData ? "UP" : "FLAT" }
        : rawDelta(cur.netPnl, prev.netPnl);

    // ── Per-KPI sparklines — WEEKLY buckets (last 8 weeks, Monday-anchored).
    // The strips compare week vs week, so the trend line draws one point per
    // week rather than a rolling day window.
    const sparklines: StatsOverviewResponse["sparklines"] = {
      netPnl: [],
      winRate: [],
      profitFactor: [],
      expectancy: [],
      disciplineScore: [],
    };
    const WEEKS_SHOWN = 8;
    const weekStartKey = (dateKey: string): string => {
      const date = new Date(`${dateKey}T00:00:00Z`);
      const weekday = date.getUTCDay(); // 0 = Sunday
      const backToMonday = (weekday + 6) % 7;
      date.setUTCDate(date.getUTCDate() - backToMonday);
      return date.toISOString().slice(0, 10);
    };
    const weekBuckets = new Map<string, Trade[]>();
    for (const trade of closed) {
      const key = weekStartKey(trade.tradingDate);
      const bucket = weekBuckets.get(key) ?? [];
      bucket.push(trade);
      weekBuckets.set(key, bucket);
    }
    const sortedWeekKeys = [...weekBuckets.keys()].sort();
    // Only the weeks that have data, capped to the last 8 — the oldest first.
    const shownWeeks = sortedWeekKeys.slice(-WEEKS_SHOWN);
    for (const weekKey of shownWeeks) {
      const weekTrades = weekBuckets.get(weekKey) ?? [];
      const wins = weekTrades.filter((t) => (Number(t.pnlNet) ?? 0) > 0);
      const gp = wins.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
      const gl = Math.abs(
        weekTrades.filter((t) => (Number(t.pnlNet) ?? 0) < 0).reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0),
      );
      const weekDays = weekTrades.map((t) => t.tradingDate);
      const discScores = data.dailyStats
        .filter((s) => weekDays.includes(s.date) && s.disciplineScore !== null)
        .map((s) => Number(s.disciplineScore));
      sparklines.netPnl.push(toDecimalString(round2(weekTrades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0))));
      sparklines.winRate.push(
        toDecimalString(round2(weekTrades.length > 0 ? (wins.length / weekTrades.length) * 100 : 0)),
      );
      sparklines.profitFactor.push(toDecimalString(round2(gl > 0 ? gp / gl : 0)));
      sparklines.expectancy.push(
        toDecimalString(round2(weekTrades.length > 0 ? weekTrades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / weekTrades.length : 0)),
      );
      sparklines.disciplineScore.push(
        toDecimalString(round2(discScores.length > 0 ? discScores.reduce((sum, v) => sum + v, 0) / discScores.length : 0)),
      );
    }

    // ── Discipline Saved — settled would-have-lost ghost trades ─────────────
    const savedGhosts = data.skippedTrades.filter(
      (g) => g.outcomeGuess === "WOULD_HAVE_LOST" && g.hypotheticalR !== null,
    );
    const rSaved = savedGhosts.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR)), 0);

    // ── Hesitation Cost — settled would-have-won ghost trades (mirror) ──────
    const hesitantGhosts = data.skippedTrades.filter(
      (g) => g.outcomeGuess === "WOULD_HAVE_WON" && g.hypotheticalR !== null,
    );
    const rCost = hesitantGhosts.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR)), 0);

    // ── Ghost trend — fear vs discipline skip counts, last 30 days ─────────
    const trendDays = 30;
    const ghostTrend: StatsOverviewResponse["ghostTrend"] = [];
    for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
      const date = shiftDateKey(-offset);
      const dayGhosts = data.skippedTrades.filter(
        (g) => toTradingDateKey(g.seenAt, USER_TZ) === date,
      );
      ghostTrend.push({
        date,
        fear: dayGhosts.filter((g) => g.reason === "FEAR").length,
        discipline: dayGhosts.filter((g) => g.reason === "DISCIPLINE").length,
      });
    }

    // ── Weekly comparison bands (this week vs previous week) — the SAME
    // rolling 7-day windows as the deltas above, zero-filled so both
    // mini-sparkline strips always draw 7 columns. Server-computed.
    const weekBands = (fromOffset: number): StatsOverviewResponse["weeklyCompare"]["thisWeek"]["days"] =>
      Array.from({ length: 7 }, (_, i) => {
        const date = shiftDateKey(fromOffset + i);
        const found = dailyPnl.find((point) => point.date === date);
        return {
          date,
          pnlNet: found?.pnlNet ?? toDecimalString(0),
          tradesCount: found?.tradesCount ?? 0,
        };
      });
    const curCount = closed.filter((t) => t.tradingDate >= currentStart).length;
    const prevCount = closed.filter(
      (t) => t.tradingDate >= prevStart && t.tradingDate < currentStart,
    ).length;
    const weeklyCompare: StatsOverviewResponse["weeklyCompare"] = {
      thisWeek: {
        days: weekBands(-6),
        totalPnl: toDecimalString(round2(cur.netPnl)),
        winRate: cur.winRate === null ? null : toDecimalString(round2(cur.winRate)),
        tradesCount: curCount,
      },
      prevWeek: {
        days: weekBands(-13),
        totalPnl: toDecimalString(round2(prev.netPnl)),
        winRate: prev.winRate === null ? null : toDecimalString(round2(prev.winRate)),
        tradesCount: prevCount,
      },
      deltaPnlPct:
        !cur.hasData || !prev.hasData || prev.netPnl === 0
          ? null
          : toDecimalString(round2(((cur.netPnl - prev.netPnl) / Math.abs(prev.netPnl)) * 100)),
    };

    return {
      currency: mainAccount.currency,
      netPnl: toDecimalString(round2(netPnl)),
      winRate: toDecimalString(round2(winRate)),
      profitFactor: grossLoss > 0 ? toDecimalString(round2(grossProfit / grossLoss)) : null,
      expectancy: toDecimalString(round2(expectancy)),
      disciplineScore: disciplineScore === null ? null : toDecimalString(disciplineScore),
      equityCurve,
      dailyPnl,
      equityPeak: toDecimalString(round2(equityPeak)),
      maxDrawdownPct: toDecimalString(round2(maxDdPct)),
      deltas: {
        netPnl: netPnlDelta,
        winRate: rawDelta(cur.winRate, prev.winRate),
        profitFactor: rawDelta(cur.profitFactor, prev.profitFactor),
        expectancy: rawDelta(cur.expectancy, prev.expectancy),
        disciplineScore: rawDelta(curDisc, prevDisc),
      },
      deltaWindowDays: 7,
      sparklines,
      disciplineSaved: {
        rSaved: toDecimalString(round2(rSaved)),
        settledCount: savedGhosts.length,
      },
      hesitationCost: {
        rCost: toDecimalString(round2(rCost)),
        settledCount: hesitantGhosts.length,
      },
      ghostTrend,
      weeklyCompare,
    };
  }

  // ── Playbook CRUD (Phase 8) ──────────────────────────────────────────────

  function createStrategy(input: CreateStrategyInput): Strategy {
    const strategy: Strategy = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: input.name.trim(),
      description: input.description ?? null,
      entryRules: input.entryRules ?? null,
      exitRules: input.exitRules ?? null,
      riskRules: input.riskRules ?? null,
      grade: input.grade ?? null,
      status: input.status ?? "ACTIVE",
      color: input.color ?? null,
      createdAt: nowIso(),
      // Professional Playbook extensions (§6–§15)
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
      updatedAt: nowIso(),
    };
    data.strategies.push(strategy);
    return strategy;
  }

  /**
   * Definition fields whose change creates a NEW version (§17). Status, color
   * and grade are lifecycle/presentation — they mutate in place without
   * rewriting the definition a trade was executed under.
   */
  const STRATEGY_DEFINITION_FIELDS = [
    "description", "entryRules", "exitRules", "riskRules", "detailedDescription",
    "marketProfile", "marketConditions", "entryConditions", "confirmations",
    "invalidations", "risk", "tradeManagement", "exitPlan",
  ] as const;

  function updateStrategy(strategyId: string, input: UpdateStrategyInput): Strategy {
    const strategy = data.strategies.find((s) => s.id === strategyId);
    if (!strategy) throw new MockError(404, "Strategy not found");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") throw new MockError(422, "Strategy name cannot be empty");
      strategy.name = name;
    }

    // Versioning (§17): freeze the CURRENT definition BEFORE any content
    // mutation — a trade executed under v1 must stay explainable as v1.
    const touchesDefinition = STRATEGY_DEFINITION_FIELDS.some(
      (field) => input[field] !== undefined,
    );
    if (touchesDefinition) {
      const priorVersion = strategy.version ?? 1;
      strategyVersions.push({
        id: crypto.randomUUID(),
        strategyId: strategy.id,
        version: priorVersion,
        snapshot: structuredClone(strategy),
        reason: "Edited in the Playbook",
        createdAt: nowIso(),
      });
      strategy.version = priorVersion + 1;
    }

    if (input.description !== undefined) strategy.description = input.description;
    if (input.entryRules !== undefined) strategy.entryRules = input.entryRules;
    if (input.exitRules !== undefined) strategy.exitRules = input.exitRules;
    if (input.riskRules !== undefined) strategy.riskRules = input.riskRules;
    if (input.grade !== undefined) strategy.grade = input.grade;
    if (input.status !== undefined) strategy.status = input.status;
    if (input.color !== undefined) strategy.color = input.color;
    if (input.tags !== undefined) strategy.tags = input.tags;
    if (input.detailedDescription !== undefined) strategy.detailedDescription = input.detailedDescription;
    if (input.marketProfile !== undefined) strategy.marketProfile = input.marketProfile;
    if (input.marketConditions !== undefined) strategy.marketConditions = input.marketConditions;
    if (input.entryConditions !== undefined) strategy.entryConditions = input.entryConditions;
    if (input.confirmations !== undefined) strategy.confirmations = input.confirmations;
    if (input.invalidations !== undefined) strategy.invalidations = input.invalidations;
    if (input.risk !== undefined) strategy.risk = input.risk;
    if (input.tradeManagement !== undefined) strategy.tradeManagement = input.tradeManagement;
    if (input.exitPlan !== undefined) strategy.exitPlan = input.exitPlan;
    strategy.updatedAt = nowIso();
    return strategy;
  }

  /**
   * POST /strategies/:id/duplicate (§5 quick action) — a fresh DRAFT copy:
   * definition blocks deep-copied, grade reset (the copy is unproven),
   * setups and scoped checklists duplicated; history does NOT follow.
   */
  function duplicateStrategy(strategyId: string): Strategy {
    const source = data.strategies.find((s) => s.id === strategyId);
    if (!source) throw new MockError(404, "Strategy not found");
    const copy = createStrategy({
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
    });
    for (const setup of setups.filter((s) => s.strategyId === source.id)) {
      setups.push({
        ...structuredClone(setup),
        id: crypto.randomUUID(),
        strategyId: copy.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    for (const checklist of checklists.filter((c) => c.strategyId === source.id)) {
      checklists.push({
        ...structuredClone(checklist),
        id: crypto.randomUUID(),
        strategyId: copy.id,
        name: checklist.name,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    return copy;
  }

  function deleteStrategy(strategyId: string): { ok: true } {
    const index = data.strategies.findIndex((s) => s.id === strategyId);
    if (index === -1) throw new MockError(404, "Strategy not found");
    // FK-RESTRICT semantics: a strategy with history is paused, never erased —
    // the playbook evolves but the journal stays true (data-model.md V2 note).
    const used = data.trades.some((t) => t.strategyId === strategyId);
    if (used) {
      throw new MockError(409, "This strategy has trades attached — pause or retire it instead.");
    }
    // The playbook children of a deleted strategy have no reason to dangle.
    for (let i = setups.length - 1; i >= 0; i -= 1) {
      if (setups[i]!.strategyId === strategyId) setups.splice(i, 1);
    }
    for (let i = checklists.length - 1; i >= 0; i -= 1) {
      if (checklists[i]!.strategyId === strategyId) checklists.splice(i, 1);
    }
    data.strategies.splice(index, 1);
    return { ok: true };
  }

  // ── Professional Playbook: setups / checklists / rules / overview ────────

  function requireStrategy(strategyId: string): Strategy {
    const strategy = data.strategies.find((s) => s.id === strategyId);
    if (!strategy) throw new MockError(422, "Unknown strategy for this playbook item");
    return strategy;
  }

  function listSetups(): SetupsResponse {
    return { setups: [...setups].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  function createSetup(input: CreateSetupInput): Setup {
    requireStrategy(input.strategyId);
    const now = nowIso();
    const setup: Setup = {
      id: crypto.randomUUID(),
      userId: user.id,
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
    };
    setups.push(setup);
    return setup;
  }

  function updateSetup(setupId: string, input: UpdateSetupInput): Setup {
    const setup = setups.find((s) => s.id === setupId);
    if (!setup) throw new MockError(404, "Setup not found");
    if (input.strategyId !== undefined) requireStrategy(input.strategyId);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") throw new MockError(422, "Setup name cannot be empty");
      setup.name = name;
    }
    if (input.strategyId !== undefined) setup.strategyId = input.strategyId;
    if (input.status !== undefined) setup.status = input.status;
    if (input.description !== undefined) setup.description = input.description;
    if (input.context !== undefined) setup.context = input.context;
    if (input.marketCondition !== undefined) setup.marketCondition = input.marketCondition;
    if (input.trigger !== undefined) setup.trigger = input.trigger;
    if (input.confirmation !== undefined) setup.confirmation = input.confirmation;
    if (input.entryModel !== undefined) setup.entryModel = input.entryModel;
    if (input.stopModel !== undefined) setup.stopModel = input.stopModel;
    if (input.targetModel !== undefined) setup.targetModel = input.targetModel;
    if (input.invalidation !== undefined) setup.invalidation = input.invalidation;
    if (input.notes !== undefined) setup.notes = input.notes;
    if (input.tags !== undefined) setup.tags = input.tags;
    setup.updatedAt = nowIso();
    return setup;
  }

  function deleteSetup(setupId: string): { ok: true } {
    const index = setups.findIndex((s) => s.id === setupId);
    if (index === -1) throw new MockError(404, "Setup not found");
    const used = data.trades.some((t) => t.setupId === setupId);
    if (used) throw new MockError(409, "This setup has trades attached — pause it instead.");
    setups.splice(index, 1);
    return { ok: true };
  }

  function listChecklists(): ChecklistsResponse {
    return { checklists: [...checklists].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  function createChecklist(input: CreateChecklistInput): ChecklistTemplate {
    if (input.strategyId !== null && input.strategyId !== undefined) {
      requireStrategy(input.strategyId);
    }
    const now = nowIso();
    const checklist: ChecklistTemplate = {
      id: crypto.randomUUID(),
      userId: user.id,
      strategyId: input.strategyId ?? null,
      name: input.name.trim(),
      items: structuredClone(input.items),
      createdAt: now,
      updatedAt: now,
    };
    checklists.push(checklist);
    return checklist;
  }

  function updateChecklist(checklistId: string, input: UpdateChecklistInput): ChecklistTemplate {
    const checklist = checklists.find((c) => c.id === checklistId);
    if (!checklist) throw new MockError(404, "Checklist not found");
    if (input.strategyId !== undefined && input.strategyId !== null) {
      requireStrategy(input.strategyId);
    }
    if (input.strategyId !== undefined) checklist.strategyId = input.strategyId;
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") throw new MockError(422, "Checklist name cannot be empty");
      checklist.name = name;
    }
    if (input.items !== undefined) checklist.items = structuredClone(input.items);
    checklist.updatedAt = nowIso();
    return checklist;
  }

  function deleteChecklist(checklistId: string): { ok: true } {
    const index = checklists.findIndex((c) => c.id === checklistId);
    if (index === -1) throw new MockError(404, "Checklist not found");
    checklists.splice(index, 1);
    return { ok: true };
  }

  function listPlaybookRules(): PlaybookRulesResponse {
    return { rules: [...playbookRules].sort((a, b) => a.title.localeCompare(b.title)) };
  }

  function createPlaybookRule(input: CreatePlaybookRuleInput): PlaybookRule {
    if (input.scope === "STRATEGY") {
      if (!input.strategyId) throw new MockError(422, "A strategy-scoped rule needs a strategy");
      requireStrategy(input.strategyId);
    }
    const now = nowIso();
    const rule: PlaybookRule = {
      id: crypto.randomUUID(),
      userId: user.id,
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
    playbookRules.push(rule);
    return rule;
  }

  function updatePlaybookRule(ruleId: string, input: UpdatePlaybookRuleInput): PlaybookRule {
    const rule = playbookRules.find((r) => r.id === ruleId);
    if (!rule) throw new MockError(404, "Playbook rule not found");
    if (input.strategyId !== undefined && input.strategyId !== null) {
      requireStrategy(input.strategyId);
    }
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title === "") throw new MockError(422, "Rule title cannot be empty");
      rule.title = title;
    }
    if (input.detail !== undefined) rule.detail = input.detail;
    if (input.category !== undefined) rule.category = input.category;
    if (input.scope !== undefined) rule.scope = input.scope;
    if (input.strategyId !== undefined) rule.strategyId = input.strategyId;
    if (input.evaluatable !== undefined) rule.evaluatable = input.evaluatable;
    if (input.evaluationHint !== undefined) rule.evaluationHint = input.evaluationHint;
    if (input.active !== undefined) rule.active = input.active;
    rule.updatedAt = nowIso();
    return rule;
  }

  function deletePlaybookRule(ruleId: string): { ok: true } {
    const index = playbookRules.findIndex((r) => r.id === ruleId);
    if (index === -1) throw new MockError(404, "Playbook rule not found");
    playbookRules.splice(index, 1);
    return { ok: true };
  }

  /** GET /playbook/templates — the starting-point library (§18). */
  function listPlaybookTemplates(): PlaybookTemplatesResponse {
    return { templates: playbookTemplateCards() };
  }

  /** POST /playbook/templates/instantiate — creates a DRAFT from a template. */
  function instantiatePlaybookTemplate(input: InstantiateTemplateInput): Strategy {
    const payload = templateToCreateInput(input.key, input.name);
    if (!payload) throw new MockError(404, "Unknown playbook template");
    return createStrategy({ ...payload, status: "DRAFT" });
  }

  /**
   * GET /playbook/overview — ONE aggregate for the module (§5): counts,
   * recency, performance summary and §20 completeness health. All computed
   * from the stored trades/strategies — never invented client-side.
   */
  function playbookOverview(): PlaybookOverviewResponse {
    const live = data.trades.filter((t) => t.deletedAt === null);
    const closed = live.filter((t) => t.status === "CLOSED");
    const playbookClosed = closed.filter((t) => t.strategyId !== null);

    const byStatus = (status: Strategy["status"]) =>
      data.strategies.filter((s) => s.status === status).length;

    // Rule adherence (§5): followedPlan among closed playbook trades that
    // have an answer — missing answers never silently count as "followed".
    const graded = playbookClosed.filter((t) => t.followedPlan !== null);
    const followedPct =
      graded.length > 0
        ? (graded.filter((t) => t.followedPlan === true).length / graded.length) * 100
        : null;

    const netPnl = playbookClosed.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
    const wins = playbookClosed.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
    const sumR = playbookClosed.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0);

    const recentlyUpdated = [...data.strategies]
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
    for (const trade of live) {
      if (trade.strategyId === null) continue;
      const current = usage.get(trade.strategyId);
      usage.set(trade.strategyId, {
        lastTradeAt:
          current && current.lastTradeAt > trade.entryAt ? current.lastTradeAt : trade.entryAt,
        tradesCount: (current?.tradesCount ?? 0) + 1,
      });
    }
    const recentlyUsed = [...usage.entries()]
      .sort(([, a], [, b]) => b.lastTradeAt.localeCompare(a.lastTradeAt))
      .slice(0, 5)
      .map(([strategyId, info]) => {
        const strategy = data.strategies.find((s) => s.id === strategyId);
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
    const health = data.strategies.map((s) => {
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

    return {
      counts: {
        totalStrategies: data.strategies.length,
        active: byStatus("ACTIVE"),
        draft: byStatus("DRAFT"),
        paused: byStatus("PAUSED"),
        archived: byStatus("RETIRED"),
        totalSetups: setups.length,
        totalRules: playbookRules.length,
        totalChecklists: checklists.length,
      },
      recentlyUpdated,
      recentlyUsed,
      performanceSummary: {
        netPnl: toDecimalString(round2(netPnl)),
        currency: mainAccount.currency,
        trades: playbookClosed.length,
        winRate: playbookClosed.length > 0 ? round2((wins / playbookClosed.length) * 100) : null,
        expectancyR: playbookClosed.length > 0 ? toDecimalString(round2(sumR / playbookClosed.length)) : null,
        followedPlanPct: followedPct === null ? null : round2(followedPct),
      },
      health,
      meta: { generatedAt: nowIso() },
    };
  }

  /**
   * GET /strategies/stats — per-strategy aggregates computed from the CLOSED
   * trades, server-side (same contract as /stats/overview). The decay
   * detector window is the LAST 20 closed trades of each strategy.
   */
  function strategyStats(): StrategiesStatsResponse {
    const closed = closedTrades();
    const stats: StrategyStat[] = [];
    const candidates: { strategyId: string; name: string; last20Expectancy: number; sampleSize: number }[] = [];

    for (const strategy of data.strategies) {
      const own = closed
        .filter((t) => t.strategyId === strategy.id)
        .sort((a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt));
      if (own.length === 0) continue;

      const count = own.length;
      const wins = own.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
      const sumR = own.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0);
      const winRate = wins / count;
      const avgR = sumR / count;

      let cumR = 0;
      const sparkline = own.map((t) => {
        cumR += Number(t.rMultiple) ?? 0;
        return toDecimalString(round2(cumR));
      });

      const last = own.slice(-20);
      const last20Expectancy = last.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / last.length;

      stats.push({
        strategyId: strategy.id,
        trades: count,
        winRate: toDecimalString(round2(winRate)),
        avgR: toDecimalString(round2(avgR)),
        sparkline,
        last20Expectancy: toDecimalString(round2(last20Expectancy)),
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
              last20Expectancy: toDecimalString(round2(worst.last20Expectancy)),
              sampleSize: worst.sampleSize,
            },
    };
  }

  // ── Discipline screen (Phase 8): rules CRUD, violations, score, ledger ───

  function listRules(): RulesResponse {
    return { rules: [...data.rules].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
  }

  function createRule(input: CreateRuleInput): Rule {
    const rule: Rule = {
      id: crypto.randomUUID(),
      userId: user.id,
      type: input.type,
      params: input.params,
      severity: input.severity,
      accountId: input.accountId ?? null,
      isActive: input.isActive ?? true,
      createdAt: nowIso(),
    };
    data.rules.push(rule);
    return rule;
  }

  function updateRule(ruleId: string, input: UpdateRuleInput): Rule {
    const rule = data.rules.find((r) => r.id === ruleId);
    if (!rule) throw new MockError(404, "Rule not found");
    if (input.params !== undefined) rule.params = input.params;
    if (input.severity !== undefined) rule.severity = input.severity;
    if (input.isActive !== undefined) rule.isActive = input.isActive;
    return rule;
  }

  function deleteRule(ruleId: string): { ok: true } {
    const index = data.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) throw new MockError(404, "Rule not found");
    data.rules.splice(index, 1);
    // Orphaned violations keep their frozen context but drop out of the
    // joined view (same behavior as an API join on a deleted rule).
    return { ok: true };
  }

  const violationToView = (violation: RuleViolation): RuleViolationView | null => {
    const rule = data.rules.find((r) => r.id === violation.ruleId);
    if (!rule) return null;
    return {
      ...violation,
      ruleType: rule.type,
      ruleSeverity: rule.severity,
    };
  };

  function listViolations(): ViolationsResponse {
    const since = windowStart();
    const views = [...data.ruleViolations]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map(violationToView)
      .filter((v): v is RuleViolationView => v !== null);
    const windowCount = views.filter((v) => toTradingDateKey(v.occurredAt, USER_TZ) >= since).length;
    return { violations: views, windowStart: since, windowCount };
  }

  function acknowledgeViolation(
    violationId: string,
    input: AcknowledgeViolationInput,
  ): { violation: RuleViolationView } {
    const violation = data.ruleViolations.find((v) => v.id === violationId);
    if (!violation) throw new MockError(404, "Violation not found");
    if (violation.acknowledgedAt === null) violation.acknowledgedAt = nowIso();
    if (input.note !== undefined) violation.userNote = input.note;
    const view = violationToView(violation);
    if (view === null) throw new MockError(404, "Rule for this violation no longer exists");
    return { violation: view };
  }

  /**
   * GET /discipline/score — the Cosmoz Discipline Score with its current
   * month component breakdown (data-model.md "Tier-1 feature wiring"):
   * process only, deliberately decoupled from P&L.
   */
  function disciplineScore(): DisciplineScoreResponse {
    const since = windowStart();
    const windowTrades = data.trades.filter(
      (t) => t.tradingDate >= since && t.tradingDate <= todayKey() && t.status !== "CANCELLED",
    );
    const windowClosed = windowTrades.filter((t) => t.status === "CLOSED");
    const graded = windowClosed.filter((t) => t.decisionGrade !== null);

    const planAdherencePct = graded.length > 0
      ? (graded.filter((t) => t.followedPlan === true).length / graded.length) * 100
      : null;
    // Checklist completion: the graded trade's snapshot has every item true.
    const checklistComplete = graded.filter((t) => {
      const snap = t.checklistSnap;
      return snap !== null && typeof snap === "object" && !Array.isArray(snap) &&
        Object.values(snap).every((value) => value === true);
    }).length;
    const checklistCompletionPct = graded.length > 0 ? (checklistComplete / graded.length) * 100 : 0;

    const violationsCount = data.ruleViolations.filter((v) =>
      toTradingDateKey(v.occurredAt, USER_TZ) >= since,
    ).length;

    // Journaling consistency: % of the window's trading days with at least
    // one written reflection (lesson or note) — V1 trace of daily_journal.
    const tradingDays = new Set(windowClosed.map((t) => t.tradingDate));
    const journaledDays = new Set(
      windowClosed
        .filter((t) => (t.lessons !== null && t.lessons.trim() !== "") || (t.notes !== null && t.notes.trim() !== ""))
        .map((t) => t.tradingDate),
    );
    const journalingConsistencyPct = tradingDays.size > 0
      ? ([...tradingDays].filter((day) => journaledDays.has(day)).length / tradingDays.size) * 100
      : 0;

    const scored = data.dailyStats.filter((s) => s.disciplineScore !== null);
    const score = scored.length > 0
      ? scored.reduce((sum, s) => sum + Number(s.disciplineScore), 0) / scored.length
      : null;

    return {
      windowStart: since,
      score: score === null ? null : toDecimalString(round2(score)),
      planAdherencePct: planAdherencePct === null ? null : toDecimalString(round2(planAdherencePct)),
      checklistCompletionPct: toDecimalString(round2(checklistCompletionPct)),
      violationsCount,
      journalingConsistencyPct: toDecimalString(round2(journalingConsistencyPct)),
    };
  }

  /** GET /mistakes/ledger — per-mistake frequency + R cost over the window. */
  function mistakesLedger(since: string = windowStart()): MistakeLedgerResponse {
    const entries: MistakeLedgerResponse["entries"] = [];
    for (const mistake of data.mistakes) {
      const windowRows = data.tradeMistakes
        .filter((m) => m.mistakeId === mistake.id)
        .map((m) => ({ row: m, trade: data.trades.find((t) => t.id === m.tradeId) }))
        .filter((x): x is { row: typeof x.row; trade: Trade } => x.trade !== undefined && x.trade.tradingDate >= since);
      if (windowRows.length === 0) continue;
      const rCost = windowRows.reduce((sum, x) => sum + (Number(x.trade.rMultiple) ?? 0), 0);
      const lastSeenAt = windowRows.reduce<string | null>(
        (latest, x) => (latest === null || x.row.createdAt > latest ? x.row.createdAt : latest),
        null,
      );
      entries.push({
        mistakeId: mistake.id,
        key: mistake.key,
        label: mistake.label,
        category: mistake.category,
        severity: mistake.severity,
        count: windowRows.length,
        rCost: toDecimalString(round2(rCost)),
        lastSeenAt,
      });
    }
    // Most expensive first — cost dominates, then frequency.
    entries.sort((a, b) => Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)) || b.count - a.count);
    return { windowStart: since, entries };
  }

  // ── Analytics suite (Phase 9, GET /stats/analytics) ──────────────────────

  /** Group closed trades into an AnalyticsBucket (server-side aggregate). */
  function bucketOf(key: string, label: string, group: Trade[]): AnalyticsBucket {
    const count = group.length;
    const wins = group.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
    const avgR = count > 0 ? group.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / count : null;
    return {
      key,
      label,
      trades: count,
      wins,
      avgR: avgR === null ? null : toDecimalString(round2(avgR)),
      winRate: count > 0 ? toDecimalString(round2(wins / count)) : null,
    };
  }

  /**
   * GET /stats/analytics — every aggregate the analytics suite renders,
   * computed here so the client only formats (same contract as
   * /stats/overview). Each rate ships with its n.
   */
  function analytics(): AnalyticsResponse {
    const closed = [...closedTrades()].sort(
      (a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt),
    );

    // ── Cards ──────────────────────────────────────────────────────────────
    const wins = closed.filter((t) => (Number(t.pnlNet) ?? 0) > 0);
    const losses = closed.filter((t) => (Number(t.pnlNet) ?? 0) < 0);
    const grossProfit = wins.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0));
    const winRate = closed.length > 0 ? wins.length / closed.length : 0;
    const expectancy = closed.length > 0
      ? closed.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / closed.length
      : 0;
    const avgWinR = wins.length > 0 ? wins.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / wins.length : null;
    const avgLossR = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / losses.length)
      : null;
    const payoffRatio = avgWinR !== null && avgLossR !== null && avgLossR > 0 ? avgWinR / avgLossR : null;

    // Cumulative-R curve → max drawdown (R units) + recovery stats.
    let cumR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let troughIndex = -1;
    const cumulative: number[] = [];
    closed.forEach((trade, index) => {
      cumR += Number(trade.rMultiple) ?? 0;
      cumulative.push(cumR);
      if (cumR > peakR) peakR = cumR;
      const drawdown = cumR - peakR;
      if (drawdown < maxDrawdownR) {
        maxDrawdownR = drawdown;
        troughIndex = index;
      }
    });
    let recoveryTrades: number | null = null;
    let recoveryDays: number | null = null;
    if (troughIndex >= 0) {
      const recoveryIndex = cumulative.findIndex((value, index) => index > troughIndex && value >= peakR);
      if (recoveryIndex > troughIndex) {
        recoveryTrades = recoveryIndex - troughIndex;
        const from = new Date(`${closed[troughIndex]!.tradingDate}T00:00:00Z`).getTime();
        const to = new Date(`${closed[recoveryIndex]!.tradingDate}T00:00:00Z`).getTime();
        recoveryDays = Math.max(0, Math.round((to - from) / 86_400_000));
      }
    }

    // ── Heatmap + time buckets (UTC hours; weekday from the API tradingDate) ─
    const weekdayOf = (trade: Trade): number =>
      new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();
    const hourBucketOf = (trade: Trade): number => {
      const hour = new Date(trade.entryAt).getUTCHours();
      const index = ANALYTICS_HOUR_BUCKETS.findIndex((bucket) => hour >= bucket.from && hour < bucket.to);
      return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
    };

    const heatmap: HeatmapCell[] = [];
    for (const weekday of ANALYTICS_WEEKDAYS) {
      for (let bucket = 0; bucket < ANALYTICS_HOUR_BUCKETS.length; bucket += 1) {
        const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketOf(t) === bucket);
        heatmap.push({
          weekday: weekday.index,
          hourBucket: bucket,
          trades: cell.length,
          wins: cell.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length,
          avgR: cell.length === 0
            ? null
            : toDecimalString(round2(cell.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / cell.length)),
        });
      }
    }

    const hourBuckets: AnalyticsBucket[] = ANALYTICS_HOUR_BUCKETS.map((bucket, index) =>
      bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketOf(t) === index)),
    );

    const weekdayBuckets: AnalyticsBucket[] = ANALYTICS_WEEKDAYS.map((weekday) =>
      bucketOf(
        String(weekday.index),
        weekday.label,
        closed.filter((t) => weekdayOf(t) === weekday.index),
      ),
    );

    const sessionBuckets: AnalyticsBucket[] = ANALYTIC_SESSIONS.map((session) => {
      const hourSet = new Set(session.hours);
      return bucketOf(
        session.key,
        session.label,
        closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours())),
      );
    });

    // ── Emotions (worst average R first — friction surfaces on top) ────────
    const emotionBuckets = [...new Set(closed.map((t) => t.emotionBefore).filter((e): e is Emotion => e !== null))]
      .map((emotion) => bucketOf(emotion, EMOTION_LABELS[emotion], closed.filter((t) => t.emotionBefore === emotion)))
      .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));

    // ── Decision grade × outcome matrix (A → F) ────────────────────────────
    const gradeMatrix: GradeOutcomeRow[] = (["A", "B", "C", "D", "F"] as const).map((grade) => {
      const graded = closed.filter((t) => t.decisionGrade === grade);
      const cell = (group: Trade[]): GradeOutcomeCell | null => {
        if (group.length === 0) return null;
        return {
          count: group.length,
          avgR: toDecimalString(round2(group.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / group.length)),
        };
      };
      return {
        grade,
        win: cell(graded.filter((t) => (Number(t.pnlNet) ?? 0) > 0)),
        loss: cell(graded.filter((t) => (Number(t.pnlNet) ?? 0) < 0)),
      };
    });

    // ── Tilt timeline (loss streaks followed by size spikes) ───────────────
    const tilt: TiltPoint[] = [];
    let lossStreak = 0;
    let previousRisk: number | null = null;
    for (const trade of closed) {
      const risk = Number(trade.riskAmount ?? "0");
      const r = Number(trade.rMultiple) ?? 0;
      const isSpike =
        lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
      tilt.push({
        tradeId: trade.id,
        date: trade.tradingDate,
        riskAmount: trade.riskAmount ?? "0",
        rMultiple: trade.rMultiple ?? "0",
        priorLossStreak: lossStreak,
        isSpike,
      });
      lossStreak = r < 0 ? lossStreak + 1 : 0;
      previousRisk = risk > 0 ? risk : previousRisk;
    }

    // ── Sleep scatter (nightly DailyStat rows with a known duration) ───────
    const sleepScatter: SleepPoint[] = data.dailyStats
      .filter((s) => s.sleepHours !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({
        date: s.date,
        sleepHours: s.sleepHours ?? "0",
        pnlNet: s.pnlNet,
        tradesCount: s.tradesCount,
      }));

    // ── All-time mistake ledger + per-strategy R distributions ─────────────
    const mistakes = mistakesLedger("0000-01-01").entries;
    const strategyDistributions: StrategyDistribution[] = [];
    for (const strategy of data.strategies) {
      const rValues = closed
        .filter((t) => t.strategyId === strategy.id)
        .sort((a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt))
        .map((t) => t.rMultiple ?? "0");
      if (rValues.length === 0) continue;
      strategyDistributions.push({
        strategyId: strategy.id,
        name: strategy.name,
        grade: strategy.grade,
        color: strategy.color,
        rValues,
      });
    }

    return {
      currency: mainAccount.currency,
      cards: {
        winRate: toDecimalString(round2(winRate)),
        profitFactor: grossLoss > 0 ? toDecimalString(round2(grossProfit / grossLoss)) : null,
        expectancy: toDecimalString(round2(expectancy)),
        payoffRatio: payoffRatio === null ? null : toDecimalString(round2(payoffRatio)),
        maxDrawdownR: toDecimalString(round2(maxDrawdownR)),
        recoveryTrades,
        recoveryDays,
        sampleTrades: closed.length,
      },
      heatmap,
      hourBuckets,
      weekdayBuckets,
      sessionBuckets,
      emotionBuckets,
      gradeMatrix,
      tilt,
      sleepScatter,
      mistakes,
      strategyDistributions,
    };
  }

  // ── Analytics Suite (MASTER PROMPT — one filtered dataset, §5) ───────────

  /**
   * Resolve a named period preset into [from, to] trading-date keys using the
   * SERVER's trading-day clock (the client never derives "today" — same rule
   * as the session timeline). CUSTOM falls back to ALL when bounds are absent.
   */
  function resolvePeriodRange(filters: AnalyticsFilters): { from: string; to: string } {
    const today = todayKey();
    const parse = (key: string): Date => new Date(`${key}T00:00:00Z`);
    const format = (date: Date): string => date.toISOString().slice(0, 10);
    const shiftDays = (key: string, days: number): string => {
      const date = parse(key);
      date.setUTCDate(date.getUTCDate() + days);
      return format(date);
    };
    switch (filters.period) {
      case "TODAY":
        return { from: today, to: today };
      case "YESTERDAY": {
        const key = dateKeyOffset(-1);
        return { from: key, to: key };
      }
      case "THIS_WEEK":
      case "LAST_WEEK": {
        // Monday-first week containing (today | today-7).
        const anchor = filters.period === "THIS_WEEK" ? today : shiftDays(today, -7);
        const weekday = parse(anchor).getUTCDay(); // 0 = Sunday
        const back = weekday === 0 ? 6 : weekday - 1;
        const monday = shiftDays(anchor, -back);
        return { from: monday, to: filters.period === "THIS_WEEK" ? today : shiftDays(monday, 6) };
      }
      case "THIS_MONTH": {
        const from = `${today.slice(0, 7)}-01`;
        return { from, to: today };
      }
      case "LAST_MONTH": {
        const firstOfThisMonth = `${today.slice(0, 7)}-01`;
        const lastOfPrev = shiftDays(firstOfThisMonth, -1);
        return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
      }
      case "THIS_QUARTER": {
        const month = Number(today.slice(5, 7)) - 1;
        const quarterMonth = Math.floor(month / 3) * 3 + 1;
        return { from: `${today.slice(0, 4)}-${String(quarterMonth).padStart(2, "0")}-01`, to: today };
      }
      case "THIS_YEAR":
      case "YTD":
        return { from: `${today.slice(0, 4)}-01-01`, to: today };
      case "LAST_30":
        return { from: dateKeyOffset(-29), to: today };
      case "LAST_90":
        return { from: dateKeyOffset(-89), to: today };
      case "CUSTOM":
        if (filters.customFrom && filters.customTo && filters.customFrom <= filters.customTo) {
          return { from: filters.customFrom, to: filters.customTo };
        }
        return { from: "0000-01-01", to: "9999-12-31" };
      case "ALL":
      default:
        return { from: "0000-01-01", to: "9999-12-31" };
    }
  }

  /**
   * GET /stats/analytics-suite — the Analytics module's single dataset
   * definition. Every tab renders the SAME filtered closed-trade set; every
   * aggregate is computed here so the client only formats (product rule).
   * Open positions are excluded from performance stats and merely counted
   * (real-time vs historical separation, §38).
   */
  function analyticsSuite(filters: AnalyticsFilters, sims: number): AnalyticsSuiteResponse {
    const { from, to } = resolvePeriodRange(filters);

    // ── The dataset ────────────────────────────────────────────────────────
    const openTradesExcluded = data.trades.filter((t) => t.status === "OPEN").length;
    let closed = closedTrades().filter((t) => t.tradingDate >= from && t.tradingDate <= to);

    if (filters.accountId) closed = closed.filter((t) => t.accountId === filters.accountId);
    if (filters.instrumentId) closed = closed.filter((t) => t.instrumentId === filters.instrumentId);
    if (filters.assetClass) {
      closed = closed.filter((t) => instrumentById.get(t.instrumentId)?.assetClass === filters.assetClass);
    }
    if (filters.strategyId === "none") closed = closed.filter((t) => t.strategyId === null);
    else if (filters.strategyId) closed = closed.filter((t) => t.strategyId === filters.strategyId);
    if (filters.direction) closed = closed.filter((t) => t.direction === filters.direction);
    if (filters.session) {
      const session = ANALYTIC_SESSIONS.find((s) => s.key === filters.session);
      const hourSet = new Set(session?.hours ?? []);
      closed = closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours()));
    }
    if (filters.emotion) closed = closed.filter((t) => t.emotionBefore === filters.emotion);
    if (filters.exitReason) closed = closed.filter((t) => t.exitReason === filters.exitReason);
    if (filters.tagId) closed = closed.filter((t) => tradeTags.get(t.id)?.has(filters.tagId!) === true);

    closed = [...closed].sort((a, b) =>
      (a.tradingDate + (a.exitAt ?? a.entryAt)).localeCompare(b.tradingDate + (b.exitAt ?? b.entryAt)),
    );

    // ── Dataset meta (§5: WHAT DATASET AM I LOOKING AT?) ───────────────────
    const accountIds = new Set(closed.map((t) => t.accountId));
    const scopeCurrencies = new Set(
      data.accounts.filter((a) => accountIds.has(a.id)).map((a) => a.currency),
    );
    const singleCurrency = scopeCurrencies.size <= 1;
    const descriptorParts: string[] = [];
    if (filters.accountId) descriptorParts.push(data.accounts.find((a) => a.id === filters.accountId)?.name ?? "account");
    if (filters.instrumentId) descriptorParts.push(instrumentById.get(filters.instrumentId)?.symbol ?? "symbol");
    if (filters.assetClass) descriptorParts.push(filters.assetClass);
    if (filters.strategyId === "none") descriptorParts.push("Out of playbook");
    else if (filters.strategyId) descriptorParts.push(data.strategies.find((s) => s.id === filters.strategyId)?.name ?? "strategy");
    if (filters.direction) descriptorParts.push(filters.direction);
    if (filters.session) descriptorParts.push(ANALYTIC_SESSIONS.find((s) => s.key === filters.session)?.label ?? filters.session);
    if (filters.emotion) descriptorParts.push(EMOTION_LABELS[filters.emotion] ?? filters.emotion);
    if (filters.exitReason) descriptorParts.push(filters.exitReason);
    const warnings: string[] = [];
    if (closed.length === 0) warnings.push("No closed trades match the current filters.");
    else if (closed.length < 10) warnings.push("Small sample: rates and ratios below ~10 trades are statistically unreliable.");
    if (!singleCurrency) warnings.push("Multi-currency dataset: money figures are raw sums, not converted.");

    // ── Metric helpers ─────────────────────────────────────────────────────
    const rOf = (t: Trade): number => Number(t.rMultiple) ?? 0;
    const pnlOf = (t: Trade): number => Number(t.pnlNet) ?? 0;
    const winsOf = (group: Trade[]): Trade[] => group.filter((t) => pnlOf(t) > 0);
    const lossesOf = (group: Trade[]): Trade[] => group.filter((t) => pnlOf(t) < 0);
    const mean = (values: number[]): number | null =>
      values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
    const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
    const percentileOf = (values: number[], p: number): number | null => {
      if (values.length === 0) return null;
      const list = sorted(values);
      const pos = ((list.length - 1) * p) / 100;
      const low = Math.floor(pos);
      const high = Math.ceil(pos);
      return list[low]! + (list[high]! - list[low]!) * (pos - low);
    };
    const medianOf = (values: number[]): number | null => percentileOf(values, 50);
    const stdOf = (values: number[]): number | null => {
      if (values.length < 2) return null;
      const m = mean(values)!;
      return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
    };
    const durationMinOf = (t: Trade): number | null => {
      if (t.exitAt === null) return null;
      return Math.max(0, Math.round((new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60_000));
    };

    // ── Summary (§6/§8) ────────────────────────────────────────────────────
    const wins = winsOf(closed);
    const losses = lossesOf(closed);
    const breakeven = closed.length - wins.length - losses.length;
    const rValues = closed.map(rOf);
    const pnlValues = singleCurrency ? closed.map(pnlOf) : [];
    const grossProfit = singleCurrency ? wins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const grossLoss = singleCurrency ? Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
    const netPnl = singleCurrency ? closed.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const avgWinR = mean(wins.map(rOf));
    const avgLossR = mean(losses.map(rOf)) === null ? null : Math.abs(mean(losses.map(rOf))!);
    const payoffRatio = avgWinR !== null && avgLossR !== null && avgLossR > 0 ? avgWinR / avgLossR : null;

    // Cumulative R → R drawdown; equity curve → % drawdown.
    let cumR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    const cumByTrade: { trade: Trade; cumR: number }[] = [];
    closed.forEach((trade) => {
      cumR += rOf(trade);
      if (cumR > peakR) peakR = cumR;
      maxDrawdownR = Math.min(maxDrawdownR, cumR - peakR);
      cumByTrade.push({ trade, cumR });
    });

    const baseBalance = singleCurrency
      ? data.accounts.filter((a) => accountIds.has(a.id)).reduce((sum, a) => sum + Number(a.startingBalance), 0)
      : 0;
    let runningPeakEquity = baseBalance;
    let maxDrawdownPct = 0;
    const equityByDate = new Map<string, number>();
    const equity: AnalyticsSuiteResponse["equity"] = [];
    if (singleCurrency && closed.length > 0) {
      let equityNow = baseBalance;
      for (const { trade } of cumByTrade) {
        equityNow += pnlOf(trade);
        runningPeakEquity = Math.max(runningPeakEquity, equityNow);
        const ddPct = runningPeakEquity > 0 ? ((equityNow - runningPeakEquity) / runningPeakEquity) * 100 : 0;
        maxDrawdownPct = Math.min(maxDrawdownPct, ddPct);
        equityByDate.set(trade.tradingDate, equityNow);
        equity.push({
          date: trade.tradingDate,
          equity: toDecimalString(round2(equityNow)),
          drawdownPct: toDecimalString(round2(ddPct)),
        });
      }
    }

    const recoveryFactor = netPnl !== null && maxDrawdownR < 0 ? netPnl / Math.abs(maxDrawdownR) : null;

    // Sharpe / Sortino on DAILY R sums (calendar days from first to last
    // trade, zero on no-trade days), annualized √252, risk-free 0 — the
    // methodology travels with the payload (§8).
    let sharpe: number | null = null;
    let sortino: number | null = null;
    if (closed.length > 0) {
      const dailyMap = new Map<string, number>();
      for (const t of closed) dailyMap.set(t.tradingDate, (dailyMap.get(t.tradingDate) ?? 0) + rOf(t));
      const firstDate = closed[0]!.tradingDate;
      const lastDate = closed[closed.length - 1]!.tradingDate;
      const series: number[] = [];
      for (let key = firstDate; key <= lastDate; key = shiftDayKey(key)) {
        series.push(dailyMap.get(key) ?? 0);
        if (series.length > 400) break; // guard: dataset window cap
      }
      const dailyMean = mean(series);
      const dailyStd = stdOf(series);
      if (dailyMean !== null && dailyStd !== null && dailyStd > 0 && series.length >= 10) {
        sharpe = (dailyMean / dailyStd) * Math.sqrt(252);
      }
      const downside = Math.sqrt(mean(series.map((v) => Math.min(v, 0) ** 2)) ?? 0);
      if (dailyMean !== null && downside > 0 && series.length >= 10) {
        sortino = (dailyMean / downside) * Math.sqrt(252);
      }
    }
    const rMean = mean(rValues);
    const rStd = stdOf(rValues);
    const sqn = rMean !== null && rStd !== null && rStd > 0 && closed.length >= 10
      ? (rMean / rStd) * Math.sqrt(closed.length)
      : null;

    const durations = closed.map(durationMinOf).filter((d): d is number => d !== null);

    const summary: AnalyticsSuiteResponse["summary"] = {
      netPnl: netPnl === null ? null : toDecimalString(round2(netPnl)),
      grossProfit: grossProfit === null ? null : toDecimalString(round2(grossProfit)),
      grossLoss: grossLoss === null ? null : toDecimalString(round2(grossLoss)),
      winRate: closed.length > 0 ? toDecimalString(round2(wins.length / closed.length)) : null,
      lossRate: closed.length > 0 ? toDecimalString(round2(losses.length / closed.length)) : null,
      profitFactor: grossLoss !== null && grossLoss > 0 && grossProfit !== null
        ? toDecimalString(round2(grossProfit / grossLoss))
        : null,
      expectancyR: toDecimalString(round2(rMean ?? 0)),
      expectancyMoney: mean(pnlValues) === null ? null : toDecimalString(round2(mean(pnlValues)!)),
      avgR: rMean === null ? null : toDecimalString(round2(rMean)),
      medianR: medianOf(rValues) === null ? null : toDecimalString(round2(medianOf(rValues)!)),
      bestR: rValues.length === 0 ? null : toDecimalString(round2(Math.max(...rValues))),
      worstR: rValues.length === 0 ? null : toDecimalString(round2(Math.min(...rValues))),
      avgWinMoney: singleCurrency && wins.length > 0 ? toDecimalString(round2(mean(wins.map(pnlOf))!)) : null,
      avgLossMoney: singleCurrency && losses.length > 0 ? toDecimalString(round2(mean(losses.map(pnlOf))!)) : null,
      avgWinR: avgWinR === null ? null : toDecimalString(round2(avgWinR)),
      avgLossR: avgLossR === null ? null : toDecimalString(round2(avgLossR)),
      payoffRatio: payoffRatio === null ? null : toDecimalString(round2(payoffRatio)),
      maxDrawdownR: toDecimalString(round2(maxDrawdownR)),
      maxDrawdownPct: singleCurrency && closed.length > 0 ? toDecimalString(round2(maxDrawdownPct)) : null,
      recoveryFactor: recoveryFactor === null ? null : toDecimalString(round2(recoveryFactor)),
      sharpe: sharpe === null ? null : toDecimalString(round2(sharpe)),
      sortino: sortino === null ? null : toDecimalString(round2(sortino)),
      sqn: sqn === null ? null : toDecimalString(round2(sqn)),
      trades: closed.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      breakevenTrades: breakeven,
      avgDurationMin: durations.length > 0 ? Math.round(mean(durations)!) : null,
      sharpeNote:
        "Sharpe = mean daily ΣR ÷ stdev(daily ΣR) × √252, risk-free = 0. Daily series spans the full filter window (0R on no-trade days); null below 10 days.",
      sortinoNote:
        "Sortino uses the same daily ΣR series with downside deviation (√mean(min(0,d)²)), annualized √252 — penalizes only negative volatility.",
    };

    // ── Cumulative R + rolling (window 10) (§7/§9) ─────────────────────────
    const cumulativeR: AnalyticsSuiteResponse["cumulativeR"] = cumByTrade.map(({ trade, cumR: value }, index) => ({
      index,
      date: trade.tradingDate,
      symbol: instrumentById.get(trade.instrumentId)?.symbol ?? "?",
      r: toDecimalString(round2(rOf(trade))),
      cumR: toDecimalString(round2(value)),
    }));
    const ROLLING_WINDOW = 10;
    const rolling: AnalyticsSuiteResponse["rolling"] = cumByTrade.map((_, index) => {
      const start = Math.max(0, index - ROLLING_WINDOW + 1);
      const window = closed.slice(start, index + 1);
      const windowWins = winsOf(window).length;
      return {
        index,
        winRate: window.length === 0 ? null : toDecimalString(round2(windowWins / window.length)),
        avgR: toDecimalString(round2(mean(window.map(rOf)) ?? 0)),
      };
    });

    // ── Daily P&L (§7) ─────────────────────────────────────────────────────
    const dailyGroups = new Map<string, Trade[]>();
    for (const trade of closed) {
      const group = dailyGroups.get(trade.tradingDate) ?? [];
      group.push(trade);
      dailyGroups.set(trade.tradingDate, group);
    }
    const dailyPnl: AnalyticsSuiteResponse["dailyPnl"] = [...dailyGroups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, group]) => ({
        date,
        pnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
        r: toDecimalString(round2(group.reduce((sum, t) => sum + rOf(t), 0))),
        trades: group.length,
        wins: winsOf(group).length,
      }));

    // ── Histograms (§7 distribution) ───────────────────────────────────────
    const rHistogram: AnalyticsSuiteResponse["rHistogram"] = [];
    for (let edge = -2; edge < 4; edge += 0.5) {
      const lo = edge;
      const hi = edge + 0.5;
      const label = edge <= -2 ? "≤ -2R" : edge >= 3.5 ? "> +3.5R" : `${lo > 0 ? "+" : ""}${round1(lo)}R … ${hi > 0 ? "+" : ""}${round1(hi)}R`;
      const count = rValues.filter((r) =>
        edge <= -2 ? r <= -2 : edge >= 3.5 ? r > 3.5 : r > lo && r <= hi,
      ).length;
      rHistogram.push({ label, count, center: toDecimalString(round1((lo + hi) / 2)) });
    }
    const pnlHistogram: AnalyticsSuiteResponse["pnlHistogram"] = [];
    if (singleCurrency && pnlValues.length > 0) {
      const min = Math.min(...pnlValues);
      const max = Math.max(...pnlValues);
      const span = Math.max(max - min, 1);
      const step = niceStep(span / 10);
      const firstBin = Math.floor(min / step) * step;
      for (let edge = firstBin; edge < max; edge += step) {
        const count = pnlValues.filter((v) => v > edge && v <= edge + step).length;
        if (count === 0 && edge > max) break;
        pnlHistogram.push({
          label: `${Math.round(edge)}…${Math.round(edge + step)}`,
          count,
          center: toDecimalString(round2(edge + step / 2)),
        });
      }
    }
    const durationBuckets: readonly { label: string; test: (minutes: number) => boolean }[] = [
      { label: "< 5 min", test: (m) => m < 5 },
      { label: "5–15 min", test: (m) => m >= 5 && m < 15 },
      { label: "15–60 min", test: (m) => m >= 15 && m < 60 },
      { label: "1–4 h", test: (m) => m >= 60 && m < 240 },
      { label: "4–12 h", test: (m) => m >= 240 && m < 720 },
      { label: "> 12 h", test: (m) => m >= 720 },
    ];
    const durationHistogram: AnalyticsSuiteResponse["durationHistogram"] = durationBuckets.map((bucket) => ({
      label: bucket.label,
      count: durations.filter(bucket.test).length,
      center: null,
    }));

    // ── Drawdown periods (§11) ─────────────────────────────────────────────
    const drawdowns: AnalyticsSuiteResponse["drawdowns"] = [];
    {
      let peak = baseBalance;
      let peakDate: string | null = null;
      let inDrawdown = false;
      let ddStart: string | null = null;
      let troughEquity = baseBalance;
      let troughDate: string | null = null;
      let troughCumR = 0;
      let diggers: { id: string; date: string; symbol: string; r: string }[] = [];
      const flush = (recoveredDate: string | null, recoveryDays: number | null, recoveryTrades: number | null) => {
        if (peakDate === null || troughDate === null || ddStart === null) return;
        const drawdownMoney = singleCurrency ? peak - troughEquity : null;
        const drawdownR = troughCumR - peakRCum;
        if (drawdownMoney === null || Math.abs(drawdownMoney) > 0.009 || Math.abs(drawdownR) > 0.009) {
          drawdowns.push({
            id: `dd-${drawdowns.length + 1}`,
            peakDate,
            bottomDate: troughDate,
            recoveredDate,
            peakEquity: toDecimalString(round2(peak)),
            bottomEquity: toDecimalString(round2(troughEquity)),
            drawdownMoney: drawdownMoney === null ? null : toDecimalString(round2(-Math.abs(drawdownMoney))),
            drawdownR: toDecimalString(round2(drawdownR)),
            durationDays: Math.max(0, dayDiff(ddStart, troughDate)),
            recoveryDays,
            recoveryTrades,
            trades: diggers.slice(0, 12),
          });
        }
      };
      let peakRCum = 0;
      let tradeIndexAtPeak = 0;
      for (let index = 0; index < cumByTrade.length; index += 1) {
        const { trade, cumR: value } = cumByTrade[index]!;
        const equityNow = baseBalance + closed.slice(0, index + 1).reduce((sum, t) => sum + pnlOf(t), 0);
        if (equityNow > peak) {
          if (inDrawdown) flush(trade.tradingDate, dayDiff(ddStart!, trade.tradingDate), index - tradeIndexAtPeak);
          inDrawdown = false;
          peak = equityNow;
          peakDate = trade.tradingDate;
          peakRCum = value;
          tradeIndexAtPeak = index;
          continue;
        }
        if (!inDrawdown) {
          inDrawdown = true;
          ddStart = trade.tradingDate;
          troughEquity = equityNow;
          troughDate = trade.tradingDate;
          troughCumR = value;
          diggers = [];
        }
        if (equityNow <= troughEquity) {
          troughEquity = equityNow;
          troughDate = trade.tradingDate;
          troughCumR = value;
        }
        diggers.push({
          id: trade.id,
          date: trade.tradingDate,
          symbol: instrumentById.get(trade.instrumentId)?.symbol ?? "?",
          r: toDecimalString(round2(rOf(trade))),
        });
      }
      if (inDrawdown) flush(null, null, null); // still under water — honest nulls
      drawdowns.sort((a, b) => Number(a.drawdownR) - Number(b.drawdownR));
    }

    // ── Risk exposure (§10) ────────────────────────────────────────────────
    const riskValues = closed.map((t) => Number(t.riskAmount ?? "")).filter((v) => !Number.isNaN(v) && v > 0);
    const riskMean = mean(riskValues);
    const riskStd = stdOf(riskValues);
    const dailyRisk = new Map<string, number>();
    for (const t of closed) {
      const risk = Number(t.riskAmount ?? "");
      if (!Number.isNaN(risk) && risk > 0) dailyRisk.set(t.tradingDate, (dailyRisk.get(t.tradingDate) ?? 0) + risk);
    }
    let maxConcurrent = 0;
    for (const trade of closed) {
      const open = new Date(trade.entryAt).getTime();
      const close = trade.exitAt === null ? Number.POSITIVE_INFINITY : new Date(trade.exitAt).getTime();
      let concurrent = 0;
      for (const other of closed) {
        const otherOpen = new Date(other.entryAt).getTime();
        const otherClose = other.exitAt === null ? Number.POSITIVE_INFINITY : new Date(other.exitAt).getTime();
        if (otherOpen <= close && otherClose >= open) concurrent += 1;
      }
      maxConcurrent = Math.max(maxConcurrent, concurrent);
    }
    const plannedBuckets: readonly { label: string; test: (planned: number) => boolean }[] = [
      { label: "≤ 1R planned", test: (p) => p <= 1 },
      { label: "1–2R planned", test: (p) => p > 1 && p <= 2 },
      { label: "2–3R planned", test: (p) => p > 2 && p <= 3 },
      { label: "> 3R planned", test: (p) => p > 3 },
    ];
    const plannedTrades = closed.filter((t) => t.plannedRR !== null && !Number.isNaN(Number(t.plannedRR)));
    const plannedVsRealized = [
      ...plannedBuckets.map((bucket) => {
        const group = plannedTrades.filter((t) => bucket.test(Number(t.plannedRR)));
        return {
          bucket: bucket.label,
          trades: group.length,
          avgRealizedR: group.length === 0 ? null : toDecimalString(round2(mean(group.map(rOf))!)),
        };
      }),
      {
        bucket: "No plan",
        trades: closed.filter((t) => t.plannedRR === null).length,
        avgRealizedR: closed.filter((t) => t.plannedRR === null).length === 0
          ? null
          : toDecimalString(round2(mean(closed.filter((t) => t.plannedRR === null).map(rOf))!)),
      },
    ];

    // ── Strategy rows (§12) — factual comparisons, no ranking verdict ─────
    const strategyGroup = (id: string | null): Trade[] =>
      closed.filter((t) => (id === null ? t.strategyId === null : t.strategyId === id));
    const strategyIds = [...new Set(closed.map((t) => t.strategyId))];
    const strategies: AnalyticsSuiteResponse["strategies"] = strategyIds.map((id) => {
      const group = strategyGroup(id);
      const groupWins = winsOf(group);
      const groupLosses = lossesOf(group);
      const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
      const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
      let gCum = 0;
      let gPeak = 0;
      let gMaxDd = 0;
      for (const t of group) {
        gCum += rOf(t);
        gPeak = Math.max(gPeak, gCum);
        gMaxDd = Math.min(gMaxDd, gCum - gPeak);
      }
      const planned = group.filter((t) => t.followedPlan !== null);
      return {
        strategyId: id,
        name: id === null
          ? "Out of playbook"
          : data.strategies.find((s) => s.id === id)?.name ?? "Unknown strategy",
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
        profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
        expectancyR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
        netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
        avgWinR: groupWins.length === 0 ? null : toDecimalString(round2(mean(groupWins.map(rOf))!)),
        avgLossR: groupLosses.length === 0 ? null : toDecimalString(round2(Math.abs(mean(groupLosses.map(rOf))!))),
        maxDrawdownR: toDecimalString(round2(gMaxDd)),
        avgDurationMin: (() => {
          const values = group.map(durationMinOf).filter((d): d is number => d !== null);
          return values.length === 0 ? null : Math.round(mean(values)!);
        })(),
        followedPlanPct: planned.length === 0
          ? null
          : toDecimalString(round2(group.filter((t) => t.followedPlan === true).length / planned.length)),
      };
    });

    // ── Symbol / asset-class rows (§13) ────────────────────────────────────
    const instrumentOf = (t: Trade): Instrument | undefined => instrumentById.get(t.instrumentId);
    const symbolRowOf = (key: string, group: Trade[]): AnalyticsSymbolRow => {
      const groupWins = winsOf(group);
      const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
      const gl = singleCurrency ? Math.abs(lossesOf(group).reduce((sum, t) => sum + pnlOf(t), 0)) : null;
      return {
        instrumentId: instrumentOf(group[0]!)?.id ?? key,
        symbol: instrumentOf(group[0]!)?.symbol ?? key,
        assetClass: instrumentOf(group[0]!)?.assetClass ?? "?",
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
        profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
        netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
        avgR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
      };
    };
    const symbolsByInstrument = new Map<string, Trade[]>();
    for (const trade of closed) {
      const group = symbolsByInstrument.get(trade.instrumentId) ?? [];
      group.push(trade);
      symbolsByInstrument.set(trade.instrumentId, group);
    }
    const symbols = [...symbolsByInstrument.values()].map((group) => symbolRowOf(group[0]!.instrumentId, group));
    const assetClassGroups = new Map<string, Trade[]>();
    for (const trade of closed) {
      const key = instrumentOf(trade)?.assetClass ?? "?";
      const group = assetClassGroups.get(key) ?? [];
      group.push(trade);
      assetClassGroups.set(key, group);
    }
    const assetClasses = [...assetClassGroups.entries()].map(([key, group]) => symbolRowOf(key, group));

    // ── Direction rows (§15) ───────────────────────────────────────────────
    const directions: AnalyticsSuiteResponse["directions"] = (["BUY", "SELL"] as const).map((direction) => {
      const group = closed.filter((t) => t.direction === direction);
      const groupWins = winsOf(group);
      const groupLosses = lossesOf(group);
      const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
      const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
      const groupDurations = group.map(durationMinOf).filter((d): d is number => d !== null);
      return {
        direction,
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
        profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
        netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
        expectancyR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
        avgDurationMin: groupDurations.length === 0 ? null : Math.round(mean(groupDurations)!),
      };
    });

    // ── Time analytics (§14) — reuse the suite bucket machinery ────────────
    const weekdayOf = (trade: Trade): number => new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();
    const hourBucketOf = (trade: Trade): number => {
      const hour = new Date(trade.entryAt).getUTCHours();
      const index = ANALYTICS_HOUR_BUCKETS.findIndex((bucket) => hour >= bucket.from && hour < bucket.to);
      return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
    };
    const heatmap: HeatmapCell[] = [];
    for (const weekday of ANALYTICS_WEEKDAYS) {
      for (let bucket = 0; bucket < ANALYTICS_HOUR_BUCKETS.length; bucket += 1) {
        const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketOf(t) === bucket);
        heatmap.push({
          weekday: weekday.index,
          hourBucket: bucket,
          trades: cell.length,
          wins: cell.filter((t) => pnlOf(t) > 0).length,
          avgR: cell.length === 0
            ? null
            : toDecimalString(round2(cell.reduce((sum, t) => sum + rOf(t), 0) / cell.length)),
        });
      }
    }
    const hours: AnalyticsBucket[] = ANALYTICS_HOUR_BUCKETS.map((bucket, index) =>
      bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketOf(t) === index)),
    );
    const weekdays: AnalyticsBucket[] = ANALYTICS_WEEKDAYS.map((weekday) =>
      bucketOf(String(weekday.index), weekday.label, closed.filter((t) => weekdayOf(t) === weekday.index)),
    );
    const sessions: AnalyticsBucket[] = ANALYTIC_SESSIONS.map((session) => {
      const hourSet = new Set(session.hours);
      return bucketOf(session.key, session.label, closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours())));
    });

    // ── Psychology (§19) ───────────────────────────────────────────────────
    const emotionsBefore = [...new Set(closed.map((t) => t.emotionBefore).filter((e): e is Emotion => e !== null))]
      .map((emotion) => bucketOf(emotion, EMOTION_LABELS[emotion] ?? emotion, closed.filter((t) => t.emotionBefore === emotion)))
      .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
    const emotionsAfter = [...new Set(closed.map((t) => t.emotionAfter).filter((e): e is Emotion => e !== null))]
      .map((emotion) => bucketOf(emotion, EMOTION_LABELS[emotion] ?? emotion, closed.filter((t) => t.emotionAfter === emotion)))
      .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
    const confidenceBands = (["1–2", "3", "4–5"] as const).map((band) => {
      const group = closed.filter((t) =>
        band === "1–2" ? t.confidence !== null && t.confidence <= 2 : band === "3" ? t.confidence === 3 : t.confidence !== null && t.confidence >= 4,
      );
      return {
        band,
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(winsOf(group).length / group.length)) : null,
        avgR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
      };
    });
    const tilt: TiltPoint[] = [];
    {
      let lossStreak = 0;
      let previousRisk: number | null = null;
      for (const trade of closed) {
        const risk = Number(trade.riskAmount ?? "0");
        const r = rOf(trade);
        const isSpike = lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
        tilt.push({
          tradeId: trade.id,
          date: trade.tradingDate,
          riskAmount: trade.riskAmount ?? "0",
          rMultiple: trade.rMultiple ?? "0",
          priorLossStreak: lossStreak,
          isSpike,
        });
        lossStreak = r < 0 ? lossStreak + 1 : 0;
        previousRisk = risk > 0 ? risk : previousRisk;
      }
    }

    // ── Trade quality + MAE/MFE (§16–§18) ──────────────────────────────────
    const planFollowed = {
      followed: closed.filter((t) => t.followedPlan === true).length,
      violated: closed.filter((t) => t.followedPlan === false).length,
      unknown: closed.filter((t) => t.followedPlan === null).length,
    };
    const excursionTrades = closed.filter((t) => t.mfeR !== null || t.maeR !== null);
    const mfeValues = closed.map((t) => Number(t.mfeR ?? "")).filter((v) => !Number.isNaN(v));
    const maeValues = closed.map((t) => Number(t.maeR ?? "")).filter((v) => !Number.isNaN(v));
    const winningMfe = closed.filter((t) => t.mfeR !== null && pnlOf(t) > 0);
    const capturePct = (() => {
      const realized = winningMfe.reduce((sum, t) => sum + rOf(t), 0);
      const favorable = winningMfe.reduce((sum, t) => sum + Number(t.mfeR ?? "0"), 0);
      if (favorable <= 0) return null;
      return round2(Math.max(0, realized / favorable));
    })();
    const mfeHistogram = [0, 0.5, 1, 1.5, 2, 3, 5].map((edge, index, list) => {
      const next = list[index + 1];
      const label = next === undefined ? "> +5R" : `+${edge}…+${next}R`;
      const count = mfeValues.filter((v) => (next === undefined ? v > edge : v > edge && v <= next)).length;
      return { label, count, center: null };
    });
    const maeHistogram = [0, 0.25, 0.5, 1, 1.5, 2].map((edge, index, list) => {
      const next = list[index + 1];
      const label = next === undefined ? "< -2R" : `-${edge}…-${next}R`;
      const count = maeValues.filter((v) => (next === undefined ? v < -edge : v <= -edge && v > -next)).length;
      return { label, count, center: null };
    });

    // ── Mistakes ledger ON the filtered set (§20) ──────────────────────────
    const closedIds = new Set(closed.map((t) => t.id));
    const mistakeEntries: MistakeLedgerResponse["entries"] = [];
    for (const mistake of data.mistakes) {
      const rows = data.tradeMistakes
        .filter((m) => m.mistakeId === mistake.id)
        .map((m) => ({ row: m, trade: closed.find((t) => t.id === m.tradeId) }))
        .filter((x): x is { row: typeof x.row; trade: Trade } => x.trade !== undefined);
      if (rows.length === 0) continue;
      const rCost = rows.reduce((sum, x) => sum + rOf(x.trade), 0);
      const lastSeenAt = rows.reduce<string | null>(
        (latest, x) => (latest === null || x.row.createdAt > latest ? x.row.createdAt : latest),
        null,
      );
      mistakeEntries.push({
        mistakeId: mistake.id,
        key: mistake.key,
        label: mistake.label,
        category: mistake.category,
        severity: mistake.severity,
        count: rows.length,
        rCost: toDecimalString(round2(rCost)),
        lastSeenAt,
      });
    }
    mistakeEntries.sort((a, b) => Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)) || b.count - a.count);
    const violatingTrades = closed.filter((t) =>
      data.tradeMistakes.some((m) => m.tradeId === t.id && closedIds.has(t.id)),
    );
    const mistakes: AnalyticsSuiteResponse["mistakes"] = {
      entries: mistakeEntries,
      violatingTrades: violatingTrades.length,
      totalR: toDecimalString(round2(violatingTrades.reduce((sum, t) => sum + rOf(t), 0))),
    };

    // ── Economic-event context (§21) — only where the calendar reaches ─────
    const eventDates = data.ecoEvents.map((e) => e.scheduledAt.slice(0, 10)).sort();
    const calendarFrom = eventDates[0] ?? null;
    const calendarTo = eventDates[eventDates.length - 1] ?? null;
    const PHASES = [
      { key: "BEFORE", label: "Before event (4h→1h)" },
      { key: "DURING", label: "During release (±1h)" },
      { key: "AFTER", label: "After event (1h→4h)" },
      { key: "NONE", label: "No major event nearby" },
    ] as const;
    const phaseOf = (trade: Trade): string | null => {
      const instrument = instrumentOf(trade);
      if (instrument === undefined) return null;
      const entry = new Date(trade.entryAt).getTime();
      let best: { phase: string; distance: number } | null = null;
      for (const event of data.ecoEvents) {
        if (event.impact === "LOW") continue;
        if (event.currency !== instrument.quoteCurrency) continue;
        const deltaMin = (entry - new Date(event.scheduledAt).getTime()) / 60_000;
        const phase =
          Math.abs(deltaMin) <= 60 ? "DURING"
          : deltaMin < -60 && deltaMin >= -240 ? "BEFORE"
          : deltaMin > 60 && deltaMin <= 240 ? "AFTER"
          : null;
        if (phase === null) continue;
        const distance = Math.abs(deltaMin);
        if (best === null || distance < best.distance) best = { phase, distance };
      }
      return best?.phase ?? "NONE";
    };
    // "Classified" = a non-NONE phase within calendar coverage (§21 honesty).
    const classified = closed.filter((t) => phaseOf(t) !== null && phaseOf(t) !== "NONE");
    const phases: AnalyticsBucket[] = PHASES.map((phase) =>
      bucketOf(phase.key, phase.label, closed.filter((t) => phaseOf(t) === phase.key)),
    );
    const byImpact: AnalyticsBucket[] = (["HIGH", "MEDIUM"] as const).map((impact) => {
      const highImpactEvents = new Set(
        data.ecoEvents.filter((e) => e.impact === impact).map((e) => e.id),
      );
      // Trades within ±240 min of ANY event of this impact on their quote currency.
      const group = closed.filter((trade) => {
        const instrument = instrumentOf(trade);
        if (instrument === undefined) return false;
        const entry = new Date(trade.entryAt).getTime();
        return data.ecoEvents.some((event) =>
          highImpactEvents.has(event.id) &&
          event.currency === instrument.quoteCurrency &&
          Math.abs(entry - new Date(event.scheduledAt).getTime()) <= 240 * 60_000,
        );
      });
      return bucketOf(impact, `${impact} impact ±4h`, group);
    });

    // ── Advanced statistics (§24) ──────────────────────────────────────────
    const rSorted = sorted(rValues);
    const moments = (values: number[]): { skew: number | null; kurt: number | null } => {
      const m = mean(values);
      const s = stdOf(values);
      if (m === null || s === null || s === 0 || values.length < 3) return { skew: null, kurt: null };
      const m3 = mean(values.map((v) => (v - m) ** 3))!;
      const m4 = mean(values.map((v) => (v - m) ** 4))!;
      return { skew: m3 / s ** 3, kurt: m4 / s ** 4 - 3 };
    };
    const { skew, kurt } = moments(rValues);
    // Streak profile.
    let longestWin = 0;
    let longestLoss = 0;
    let currentWin = 0;
    let currentLoss = 0;
    const winStreaks: number[] = [];
    const lossStreaks: number[] = [];
    for (const trade of closed) {
      if (pnlOf(trade) > 0) {
        currentWin += 1;
        if (currentLoss > 0) lossStreaks.push(currentLoss);
        currentLoss = 0;
        longestWin = Math.max(longestWin, currentWin);
      } else if (pnlOf(trade) < 0) {
        currentLoss += 1;
        if (currentWin > 0) winStreaks.push(currentWin);
        currentWin = 0;
        longestLoss = Math.max(longestLoss, currentLoss);
      }
    }
    if (currentWin > 0) winStreaks.push(currentWin);
    if (currentLoss > 0) lossStreaks.push(currentLoss);

    // ── Monte Carlo (§25) — bootstrap of the filtered R list ───────────────
    const rng = mulberry32(20260930);
    const simulationCount = Math.max(100, Math.min(2000, sims));
    const finals: number[] = [];
    const maxDds: number[] = [];
    const paths: number[][] = Array.from({ length: Math.min(closed.length, 80) }, () => []);
    for (let run = 0; run < simulationCount; run += 1) {
      let cum = 0;
      let peak = 0;
      let dd = 0;
      for (let index = 0; index < closed.length; index += 1) {
        const sampled = rValues.length > 0 ? rValues[Math.floor(rng() * rValues.length)]! : 0;
        cum += sampled;
        peak = Math.max(peak, cum);
        dd = Math.min(dd, cum - peak);
        if (index < paths.length) paths[index]!.push(cum);
      }
      finals.push(cum);
      maxDds.push(dd);
    }
    const bandAt = (values: number[]): { p05: string; p25: string; p50: string; p75: string; p95: string } => ({
      p05: toDecimalString(round2(percentileOf(values, 5) ?? 0)),
      p25: toDecimalString(round2(percentileOf(values, 25) ?? 0)),
      p50: toDecimalString(round2(percentileOf(values, 50) ?? 0)),
      p75: toDecimalString(round2(percentileOf(values, 75) ?? 0)),
      p95: toDecimalString(round2(percentileOf(values, 95) ?? 0)),
    });

    // ── Reports (§26) ──────────────────────────────────────────────────────
    const reportRow = (key: string, group: Trade[]): AnalyticsReportRow => ({
      key,
      trades: group.length,
      netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
      r: toDecimalString(round2(group.reduce((sum, t) => sum + rOf(t), 0))),
      winRate: group.length > 0 ? toDecimalString(round2(winsOf(group).length / group.length)) : null,
    });
    const isoWeekOf = (dateKey: string): string => {
      const date = new Date(`${dateKey}T00:00:00Z`);
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
      return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    };
    const dailyReports = [...dailyGroups.entries()].map(([key, group]) => reportRow(key, group));
    const weeklyGroups = new Map<string, Trade[]>();
    const monthlyGroups = new Map<string, Trade[]>();
    for (const trade of closed) {
      const weekKey = isoWeekOf(trade.tradingDate);
      weeklyGroups.set(weekKey, [...(weeklyGroups.get(weekKey) ?? []), trade]);
      const monthKey = trade.tradingDate.slice(0, 7);
      monthlyGroups.set(monthKey, [...(monthlyGroups.get(monthKey) ?? []), trade]);
    }

    return {
      meta: {
        resolvedFrom: from === "0000-01-01" ? (closed[0]?.tradingDate ?? from) : from,
        resolvedTo: to === "9999-12-31" ? (closed[closed.length - 1]?.tradingDate ?? to) : to,
        descriptor: descriptorParts.length === 0 ? "All accounts · all symbols" : descriptorParts.join(" · "),
        closedTrades: closed.length,
        openTradesExcluded,
        warnings,
        singleCurrency,
      },
      currency: mainAccount.currency,
      summary,
      equity,
      cumulativeR,
      rolling,
      dailyPnl,
      rHistogram,
      pnlHistogram,
      durationHistogram,
      drawdowns: drawdowns.slice(0, 6),
      risk: {
        tradesWithRisk: riskValues.length,
        avgRiskMoney: riskMean === null ? null : toDecimalString(round2(riskMean)),
        maxRiskMoney: riskValues.length === 0 ? null : toDecimalString(round2(Math.max(...riskValues))),
        minRiskMoney: riskValues.length === 0 ? null : toDecimalString(round2(Math.min(...riskValues))),
        riskDeviationPct: riskMean !== null && riskStd !== null && riskMean > 0
          ? toDecimalString(round2((riskStd / riskMean) * 100))
          : null,
        maxDailyRisk: dailyRisk.size === 0 ? null : toDecimalString(round2(Math.max(...dailyRisk.values()))),
        maxConcurrentPositions: maxConcurrent,
        plannedVsRealized,
      },
      strategies,
      symbols,
      assetClasses,
      directions,
      sessions,
      hours,
      weekdays,
      heatmap,
      psychology: { emotionsBefore, emotionsAfter, confidenceBands, tilt },
      quality: {
        planFollowed,
        excursionAvailable: excursionTrades.length > 0,
        mfe: {
          avgR: mfeValues.length === 0 ? null : toDecimalString(round2(mean(mfeValues)!)),
          medianR: medianOf(mfeValues) === null ? null : toDecimalString(round2(medianOf(mfeValues)!)),
          capturePct: capturePct === null ? null : toDecimalString(capturePct),
        },
        mae: {
          avgR: maeValues.length === 0 ? null : toDecimalString(round2(mean(maeValues)!)),
          medianR: medianOf(maeValues) === null ? null : toDecimalString(round2(medianOf(maeValues)!)),
        },
        scatter: closed.map((t) => ({
          id: t.id,
          symbol: instrumentOf(t)?.symbol ?? "?",
          mfeR: t.mfeR,
          maeR: t.maeR,
          realizedR: toDecimalString(round2(rOf(t))),
        })),
        mfeHistogram,
        maeHistogram,
      },
      mistakes,
      events: {
        calendarCoverage: {
          from: calendarFrom,
          to: calendarTo,
          classifiedTrades: classified.length,
          unclassifiedTrades: closed.length - classified.length,
        },
        phases,
        byImpact,
      },
      advanced: {
        r: {
          mean: rMean === null ? null : toDecimalString(round2(rMean)),
          median: medianOf(rValues) === null ? null : toDecimalString(round2(medianOf(rValues)!)),
          stddev: rStd === null ? null : toDecimalString(round2(rStd)),
          variance: rStd === null ? null : toDecimalString(round2(rStd ** 2)),
          skewness: skew === null ? null : toDecimalString(round2(skew)),
          kurtosis: kurt === null ? null : toDecimalString(round2(kurt)),
          p05: percentileOf(rSorted, 5) === null ? null : toDecimalString(round2(percentileOf(rSorted, 5)!)),
          p25: percentileOf(rSorted, 25) === null ? null : toDecimalString(round2(percentileOf(rSorted, 25)!)),
          p75: percentileOf(rSorted, 75) === null ? null : toDecimalString(round2(percentileOf(rSorted, 75)!)),
          p95: percentileOf(rSorted, 95) === null ? null : toDecimalString(round2(percentileOf(rSorted, 95)!)),
        },
        streaks: {
          longestWin,
          longestLoss,
          avgWin: winStreaks.length === 0 ? null : toDecimalString(round1(mean(winStreaks)!)),
          avgLoss: lossStreaks.length === 0 ? null : toDecimalString(round1(mean(lossStreaks)!)),
        },
      },
      monteCarlo: {
        simulations: simulationCount,
        tradesPerRun: closed.length,
        bands: paths.map((values, index) => ({ index, ...bandAt(values) })),
        finalR: bandAt(finals),
        maxDrawdownR: {
          p50: toDecimalString(round2(percentileOf(maxDds, 50) ?? 0)),
          p95: toDecimalString(round2(percentileOf(maxDds, 95) ?? 0)),
          worst: maxDds.length === 0 ? "0" : toDecimalString(round2(Math.min(...maxDds))),
        },
        methodology:
          "Simulation, not a prediction: bootstrap resampling (with replacement) of the filtered trade R results, seeded and deterministic. Past sequence ≠ future sequence.",
      },
      reports: {
        daily: dailyReports,
        weekly: [...weeklyGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => reportRow(key, group)),
        monthly: [...monthlyGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => reportRow(key, group)),
      },
    };
  }

  // ── Session Live (trade-entry-ux.md §9) ──────────────────────────────────

  /**
   * GET /session/timeline — today's events (entries, exits, SL/TP
   * modifications, alerts) + logged emotions, all assembled SERVER-SIDE for
   * the server's trading date. The client never derives "today".
   */
  function sessionTimeline(): SessionTimelineResponse {
    const today = todayKey();
    const symbolOf = (tradeId: string): string => {
      const trade = data.trades.find((t) => t.id === tradeId);
      return trade ? (instrumentById.get(trade.instrumentId)?.symbol ?? "?") : "?";
    };

    const events: SessionTimelineResponse["events"] = [];

    for (const trade of data.trades) {
      if (trade.tradingDate !== today) continue;
      const symbol = instrumentById.get(trade.instrumentId)?.symbol ?? "?";
      events.push({
        id: `entry-${trade.id}`,
        at: trade.entryAt,
        kind: "ENTRY",
        label: `${symbol} · ${trade.direction} opened`,
        detail: `${trade.quantity} @ ${trade.entryPrice}`,
        severity: null,
      });
      if (trade.status === "CLOSED" && trade.exitAt !== null) {
        events.push({
          id: `exit-${trade.id}`,
          at: trade.exitAt,
          kind: "EXIT",
          label: `${symbol} · ${trade.direction} closed`,
          detail: trade.exitReason !== null ? `Exit ${trade.exitReason}` : null,
          severity: null,
        });
      }
    }

    for (const event of data.tradeEvents) {
      if (toTradingDateKey(event.createdAt, USER_TZ) !== today) continue;
      if (event.type !== "SL_MODIFIED" && event.type !== "TP_MODIFIED") continue;
      const payload = event.payload as { from?: string; to?: string } | null;
      const from = typeof payload?.from === "string" ? payload.from : "?";
      const to = typeof payload?.to === "string" ? payload.to : "?";
      events.push({
        id: event.id,
        at: event.createdAt,
        kind: event.type,
        label: `${symbolOf(event.tradeId)} · ${event.type === "SL_MODIFIED" ? "stop" : "target"} modified`,
        detail: `${from} → ${to}`,
        severity: null,
      });
    }

    for (const alert of data.alerts) {
      if (toTradingDateKey(alert.createdAt, USER_TZ) !== today) continue;
      events.push({
        id: `alert-${alert.id}`,
        at: alert.createdAt,
        kind: "ALERT",
        label: alert.title,
        detail: alert.message,
        severity: alert.severity,
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    const moods: SessionTimelineResponse["moods"] = [];
    for (const trade of data.trades) {
      // Entry emotion: belongs to the trade's own trading day.
      if (trade.tradingDate === today && trade.emotionBefore !== null) {
        moods.push({
          at: trade.entryAt,
          emotion: trade.emotionBefore,
          phase: "BEFORE",
          tradeId: trade.id,
        });
      }
      // Exit / in-trade emotion: the TAP's day is what matters — an in-trade
      // quick-log on a trade opened yesterday is still today's event.
      if (trade.emotionAfter !== null) {
        const at = trade.status === "OPEN" ? trade.updatedAt : (trade.exitAt ?? trade.updatedAt);
        if (trade.status === "OPEN" ? toTradingDateKey(at, USER_TZ) === today : trade.tradingDate === today) {
          moods.push({ at, emotion: trade.emotionAfter, phase: "AFTER", tradeId: trade.id });
        }
      }
    }
    moods.sort((a, b) => a.at.localeCompare(b.at));

    return { date: today, events, moods };
  }

  /** PATCH /trades/:id/notes — session note icon quick-save. */
  function updateNotes(tradeId: string, input: NotesUpdateInput): Trade {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    trade.notes = input.notes;
    trade.updatedAt = nowIso();
    return trade;
  }

  // ── Trade module: edit / delete / screenshots / profile ──────────────────

  /**
   * PATCH /trades/:id — journal correction. Closed trades get their results
   * recomputed server-side (§15); daily stats refresh for both the old and
   * the new trading date when the entry moved across days.
   */
  function updateTrade(tradeId: string, input: UpdateTradeInput): UpdateTradeResponse {
    const trade = data.trades.find((t) => t.id === tradeId && t.deletedAt === null);
    if (!trade) throw new MockError(404, "Trade not found");

    const previousDate = trade.tradingDate;
    if (input.instrumentId !== undefined) trade.instrumentId = input.instrumentId;
    if (input.direction !== undefined) trade.direction = input.direction;
    if (input.quantity !== undefined) trade.quantity = input.quantity;
    if (input.initialStop !== undefined) trade.initialStop = input.initialStop;
    if (input.initialTP !== undefined) trade.initialTP = input.initialTP;
    if (input.strategyId !== undefined) trade.strategyId = input.strategyId;
    if (input.fees !== undefined) trade.fees = input.fees;
    if (input.swap !== undefined) trade.swap = input.swap;
    if (input.entryPrice !== undefined) trade.entryPrice = input.entryPrice;
    if (input.entryAt !== undefined) {
      trade.entryAt = input.entryAt;
      trade.tradingDate = toTradingDateKey(input.entryAt, USER_TZ);
    }
    if (input.exitPrice !== undefined || input.exitAt !== undefined || input.exitReason !== undefined) {
      if (trade.status !== "CLOSED") throw new MockError(409, "Trade is not closed — close it first");
      if (input.exitPrice !== undefined) trade.exitPrice = input.exitPrice;
      if (input.exitAt !== undefined) trade.exitAt = input.exitAt;
      if (input.exitReason !== undefined) trade.exitReason = input.exitReason;
      if (trade.exitAt !== null && trade.exitAt < trade.entryAt) {
        throw new MockError(422, "exitAt must be after entryAt");
      }
    }

    // Risk amount follows the edited stop / quantity (server-side recompute).
    if (trade.initialStop !== null) {
      const instrument = instrumentById.get(trade.instrumentId);
      const contractSize = Number(instrument?.contractSize ?? "1");
      const perUnitRisk = Math.abs(Number(trade.entryPrice) - Number(trade.initialStop)) * Number(trade.quantity) * contractSize;
      trade.riskAmount = toDecimalString(round2(perUnitRisk));
    }
    if (trade.status === "CLOSED") applyResults(trade);
    trade.updatedAt = nowIso();

    if (trade.tradingDate !== previousDate) {
      refreshDailyStat(previousDate);
      refreshDailyStat(trade.tradingDate);
    } else {
      refreshDailyStat(trade.tradingDate);
    }
    return { trade };
  }

  /** DELETE /trades/:id — soft delete; aggregates refresh immediately. */
  function deleteTrade(tradeId: string): DeleteTradeResponse {
    const trade = data.trades.find((t) => t.id === tradeId && t.deletedAt === null);
    if (!trade) throw new MockError(404, "Trade not found");
    trade.deletedAt = nowIso();
    trade.updatedAt = trade.deletedAt;
    refreshDailyStat(trade.tradingDate);
    return { id: tradeId, deleted: true };
  }

  // ── Screenshots (module gallery) ───────────────────────────────────────────

  function listScreenshots(tradeId: string): TradeScreenshotsResponse {
    return { screenshots: [...(screenshotsByTrade.get(tradeId) ?? [])] };
  }

  function addScreenshot(tradeId: string, input: AddScreenshotInput): TradeScreenshot {
    const trade = data.trades.find((t) => t.id === tradeId && t.deletedAt === null);
    if (!trade) throw new MockError(404, "Trade not found");
    const screenshot: TradeScreenshot = {
      id: crypto.randomUUID(),
      tradeId,
      kind: input.kind,
      storageKey: input.dataUrl,
      caption: input.caption ?? null,
      annotations: null,
      createdAt: nowIso(),
    };
    const bucket = screenshotsByTrade.get(tradeId) ?? [];
    bucket.push(screenshot);
    screenshotsByTrade.set(tradeId, bucket);
    return screenshot;
  }

  function deleteScreenshot(tradeId: string, screenshotId: string): DeleteScreenshotResponse {
    const bucket = screenshotsByTrade.get(tradeId) ?? [];
    const index = bucket.findIndex((s) => s.id === screenshotId);
    if (index === -1) throw new MockError(404, "Screenshot not found");
    bucket.splice(index, 1);
    return { id: screenshotId, deleted: true };
  }

  // ── Profile (GET/PATCH /me) ────────────────────────────────────────────────

  function getProfile(): Profile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      baseCurrency: user.baseCurrency,
      username: user.username,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
    };
  }

  function updateProfile(input: ProfileUpdateInput): Profile {
    if (input.name !== undefined) user.name = input.name;
    if (input.email !== undefined) user.email = input.email;
    if (input.timezone !== undefined) {
      user.timezone = input.timezone;
      // Timezone has one source of truth (the profile) — keep the
      // Localization mirror in sync so the two screens never disagree.
      preferences.localization.timezone = input.timezone;
    }
    if (input.username !== undefined) user.username = input.username;
    if (input.bio !== undefined) user.bio = input.bio;
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
    return getProfile();
  }

  // ── Preferences (Settings module — GET/PATCH/reset per domain) ───────────

  function getPreferences(): UserPreferences {
    return structuredClone(preferences);
  }

  function updatePreferencesDomain(
    domain: PreferenceDomain,
    input: Record<string, unknown>,
  ): UserPreferences {
    // Server-side validation — the same zod schema the real NestJS API runs.
    const schema = PREFERENCE_DOMAIN_SCHEMAS[domain];
    const parsed = schema.parse(input);
    // TS limitation: union-keyed write needs the widened record view.
    const writable = preferences as Record<PreferenceDomain, UserPreferences[PreferenceDomain]>;
    writable[domain] = structuredClone(parsed);
    if (domain === "localization") {
      user.timezone = preferences.localization.timezone;
    }
    preferences.updatedAt = nowIso();
    return getPreferences();
  }

  function resetPreferencesDomain(domain: PreferenceDomain): UserPreferences {
    const writable = preferences as Record<PreferenceDomain, UserPreferences[PreferenceDomain]>;
    writable[domain] = structuredClone(DEFAULT_USER_PREFERENCES[domain]);
    if (domain === "localization") user.timezone = preferences.localization.timezone;
    preferences.updatedAt = nowIso();
    return getPreferences();
  }

  function deactivateAccount(): DeactivateAccountResponse {
    return { status: "DEACTIVATED", deactivatedAt: nowIso() };
  }

  function requestAccountDeletion(): RequestAccountDeletionResponse {
    const scheduled = new Date(Date.now() + 14 * 86_400_000);
    return { status: "SCHEDULED", scheduledFor: scheduled.toISOString() };
  }

  // ── Trade Review module (fusion with Goal) ────────────────────────────────
  // Goals: targets set by the trader; progress is COMPUTED here from real
  // trading behavior over a resolved calendar period — never self-entered.
  // Reviews: one post-trade review per trade (upsert), distinct from the
  // pre-reveal decisionGrade frozen on the trade.

  const METRIC_SHAPE: Record<
    GoalMetric,
    { direction: GoalDirection; unit: GoalUnit }
  > = {
    WIN_RATE: { direction: "HIGHER_IS_BETTER", unit: "PERCENT" },
    R_EARNED: { direction: "HIGHER_IS_BETTER", unit: "R" },
    AVG_R: { direction: "HIGHER_IS_BETTER", unit: "R" },
    PROFIT_TARGET: { direction: "HIGHER_IS_BETTER", unit: "MONEY" },
    DISCIPLINE_SCORE: { direction: "HIGHER_IS_BETTER", unit: "SCORE" },
    FOLLOWED_PLAN_PCT: { direction: "HIGHER_IS_BETTER", unit: "PERCENT" },
    MAX_TRADES_PER_DAY: { direction: "LOWER_IS_BETTER", unit: "COUNT" },
    MAX_DAILY_LOSS_R: { direction: "HIGHER_IS_BETTER", unit: "R" },
  };

  interface ResolvedPeriod {
    from: string;
    to: string;
    daysElapsed: number;
    daysTotal: number;
  }

  /** Calendar window for `period` containing the reference day (YYYY-MM-DD). */
  function resolvePeriodFor(period: GoalPeriod, refDay: string): { from: string; to: string } {
    const [y, m] = refDay.split("-").map(Number) as [number, number];
    const utc = (year: number, month: number, day: number): string =>
      new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

    if (period === "WEEK") {
      const weekday = new Date(`${refDay}T00:00:00Z`).getUTCDay();
      const mondayOffset = (weekday + 6) % 7;
      const from = shiftDayKey2(refDay, -mondayOffset);
      return { from, to: shiftDayKey2(from, 6) };
    }
    if (period === "MONTH") {
      return { from: utc(y, m, 1), to: utc(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()) };
    }
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    const qEndMonth = qStart + 2;
    return {
      from: utc(y, qStart, 1),
      to: utc(y, qEndMonth, new Date(Date.UTC(y, qEndMonth, 0)).getUTCDate()),
    };
  }

  /** Calendar period containing today (Toronto trading-day clock). */
  function resolvePeriod(period: GoalPeriod): ResolvedPeriod {
    const { from, to } = resolvePeriodFor(period, todayKey());
    const daysTotal = dayDiff(from, to) + 1;
    const daysElapsed = Math.min(daysTotal, Math.max(0, dayDiff(from, todayKey()) + 1));
    return { from, to, daysElapsed, daysTotal };
  }

  /** Next N calendar days from a YYYY-MM-DD key (UTC arithmetic, like shiftDayKey). */
  function shiftDayKey2(key: string, days: number): string {
    const date = new Date(`${key}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  /** The true previous calendar window (week/month/quarter before). */
  function previousWindow(period: ResolvedPeriod): { from: string; to: string } {
    return resolvePeriodFor(currentPeriodOf(period), shiftDayKey2(period.from, -1));
  }

  /** Which GoalPeriod a resolved window came from — recovered from length.
   *  Simpler and exact: previousWindow is called right after resolvePeriod,
   *  so we thread the GoalPeriod through instead. */
  function currentPeriodOf(period: ResolvedPeriod): GoalPeriod {
    return period.daysTotal <= 7 ? "WEEK" : period.daysTotal <= 31 ? "MONTH" : "QUARTER";
  }

  function computeMetricActual(
    metric: GoalMetric,
    from: string,
    to: string,
  ): { actual: number | null; sampleSize: number } {
    const trades = closedTrades().filter((t) => t.tradingDate >= from && t.tradingDate <= to);
    const stats = data.dailyStats.filter((s) => s.date >= from && s.date <= to && s.disciplineScore !== null);

    const sumR = trades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0);
    const perDayR = new Map<string, number>();
    for (const trade of trades) {
      perDayR.set(trade.tradingDate, (perDayR.get(trade.tradingDate) ?? 0) + (Number(trade.rMultiple) ?? 0));
    }

    switch (metric) {
      case "WIN_RATE": {
        const wins = trades.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
        return { actual: trades.length > 0 ? round1((wins / trades.length) * 100) : null, sampleSize: trades.length };
      }
      case "R_EARNED":
        return { actual: trades.length > 0 ? round2(sumR) : null, sampleSize: trades.length };
      case "AVG_R":
        return { actual: trades.length > 0 ? round2(sumR / trades.length) : null, sampleSize: trades.length };
      case "PROFIT_TARGET": {
        const net = trades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
        return { actual: trades.length > 0 ? round2(net) : null, sampleSize: trades.length };
      }
      case "DISCIPLINE_SCORE":
        return {
          actual: stats.length > 0 ? round1(stats.reduce((sum, s) => sum + Number(s.disciplineScore), 0) / stats.length) : null,
          sampleSize: stats.length,
        };
      case "FOLLOWED_PLAN_PCT": {
        const known = trades.filter((t) => t.followedPlan !== null);
        const followed = known.filter((t) => t.followedPlan === true).length;
        return { actual: known.length > 0 ? round1((followed / known.length) * 100) : null, sampleSize: known.length };
      }
      case "MAX_TRADES_PER_DAY": {
        const perDay = new Map<string, number>();
        for (const trade of trades) perDay.set(trade.tradingDate, (perDay.get(trade.tradingDate) ?? 0) + 1);
        const worst = Math.max(0, ...perDay.values());
        return { actual: trades.length > 0 ? worst : null, sampleSize: trades.length };
      }
      case "MAX_DAILY_LOSS_R": {
        const worst = Math.min(0, ...perDayR.values());
        return { actual: trades.length > 0 ? round2(worst) : null, sampleSize: trades.length };
      }
    }
  }

  function goalProgressFor(goal: Goal): GoalWithProgress {
    const shape = METRIC_SHAPE[goal.metric];
    const period = resolvePeriod(goal.period);
    const current = computeMetricActual(goal.metric, period.from, period.to);
    const prevWindow = previousWindow(period);
    const previous = computeMetricActual(goal.metric, prevWindow.from, prevWindow.to).actual;

    const timePct = Math.min(1, Math.max(0, period.daysElapsed) / period.daysTotal);
    let progressPct: number | null = null;
    let status: GoalStatus = "PENDING";

    if (current.actual !== null) {
      const actual = current.actual;
      if (shape.direction === "LOWER_IS_BETTER") {
        // A limit to respect ("max 3 trades/day") — maintained, not "achieved early".
        if (actual <= goal.target) {
          progressPct = 100;
          status = "ON_TRACK";
        } else {
          progressPct = Math.max(0, Math.min(100, round1((goal.target / actual) * 100)));
          status = "BEHIND";
        }
      } else if (goal.target < 0) {
        // A floor to respect ("worst day no worse than −2R").
        if (actual >= goal.target) {
          progressPct = 100;
          status = "ON_TRACK";
        } else {
          const depth = Math.abs(((goal.target - actual) / Math.abs(goal.target)) * 100);
          progressPct = Math.max(0, Math.min(100, round1(100 - depth)));
          status = "BEHIND";
        }
      } else {
        // A growth target — pace it against elapsed time.
        progressPct = Math.max(0, Math.min(100, round1((actual / goal.target) * 100)));
        if (actual >= goal.target) {
          status = "ACHIEVED";
        } else {
          const expected = timePct * 100;
          const ratio = expected > 0 ? progressPct / expected : progressPct > 0 ? 2 : 0;
          if (progressPct === 0 && timePct <= 0.15) status = "ON_TRACK";
          else if (ratio >= 0.9) status = "ON_TRACK";
          else if (ratio >= 0.55) status = "AT_RISK";
          else status = "BEHIND";
        }
      }
    }

    const fmt = (value: number): string => {
      if (shape.unit === "PERCENT") return `${round1(value)}%`;
      if (shape.unit === "R") return `${round2(value)}R`;
      if (shape.unit === "MONEY") return `$${Math.round(value).toLocaleString("en-US")}`;
      if (shape.unit === "COUNT") return `${Math.round(value)}`;
      return `${round1(value)}`;
    };
    const targetWord = shape.direction === "LOWER_IS_BETTER"
      ? "max"
      : goal.metric === "MAX_DAILY_LOSS_R"
        ? "floor"
        : "target";
    const detail = current.actual === null
      ? `No data yet this ${goal.period.toLowerCase()} — the sample is empty`
      : `${fmt(current.actual)} vs ${fmt(goal.target)} ${targetWord}`;

    return {
      goal,
      progress: {
        goalId: goal.id,
        metric: goal.metric,
        direction: shape.direction,
        unit: shape.unit,
        currency: shape.unit === "MONEY" ? mainAccount.currency : null,
        actual: current.actual,
        previous,
        progressPct,
        status,
        periodStart: period.from,
        periodEnd: period.to,
        daysElapsed: Math.min(period.daysElapsed, period.daysTotal),
        daysTotal: period.daysTotal,
        sampleSize: current.sampleSize,
        detail,
      },
    };
  }

  function listGoals(): GoalsResponse {
    syncGoalAlerts();
    return { goals: goals.map(goalProgressFor) };
  }

  function createGoal(input: CreateGoalInput): GoalWithProgress {
    const now = nowIso();
    const goal: Goal = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: input.title,
      metric: input.metric,
      target: input.target,
      period: input.period,
      color: input.color,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    goals.push(goal);
    return goalProgressFor(goal);
  }

  function updateGoal(goalId: string, input: UpdateGoalInput): GoalWithProgress {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) throw new MockError(404, "Goal not found");
    if (input.title !== undefined) goal.title = input.title;
    if (input.metric !== undefined) goal.metric = input.metric;
    if (input.target !== undefined) goal.target = input.target;
    if (input.period !== undefined) goal.period = input.period;
    if (input.color !== undefined) goal.color = input.color;
    if (input.active !== undefined) goal.active = input.active;
    goal.updatedAt = nowIso();
    return goalProgressFor(goal);
  }

  function deleteGoal(goalId: string): { ok: true } {
    const index = goals.findIndex((g) => g.id === goalId);
    if (index === -1) throw new MockError(404, "Goal not found");
    goals.splice(index, 1);
    return { ok: true };
  }

  // ── Goal → notification bridge ─────────────────────────────────────────────
  //
  // Goals are COMPUTED (never stored), so goal alerts are synced onto read
  // paths (listAlerts / listGoals / overview). Semantics per active goal with
  // data in the resolved period:
  //  - AT_RISK / BEHIND → ONE live "slipping" alert per goal per period,
  //    updated IN PLACE as the status tightens (no duplicates);
  //  - ACHIEVED → a one-time positive alert (deduped per goal + period);
  //  - ON_TRACK after a slipping episode → the risk alert is resolved and a
  //    one-time "back on track" notice lands.
  // Creation is gated by the Goals notification category (in-app channel per
  // event); resolving an obsolete risk alert is bookkeeping, not delivery,
  // so it happens regardless of preferences.

  type GoalAlertPayload = { goalId: string; kind: "AT_RISK" | "ACHIEVED"; periodStart: string };

  function findGoalAlert(goalId: string, kind: GoalAlertPayload["kind"], periodStart: string): Alert | undefined {
    return data.alerts.find((a) => {
      if (a.type !== "GOAL_STATUS" || a.dismissedAt !== null) return false;
      const payload = a.payload as Partial<GoalAlertPayload> | null;
      return payload?.goalId === goalId && payload?.kind === kind && payload?.periodStart === periodStart;
    });
  }

  function syncGoalAlerts(): void {
    const goalPrefs = preferences.notifications.goals;
    for (const goal of goals) {
      if (!goal.active) continue;
      const { progress: p } = goalProgressFor(goal);
      // Period moved (goal edited) — retire risk alerts pinned to older windows.
      for (const stale of data.alerts) {
        if (stale.type !== "GOAL_STATUS" || stale.dismissedAt !== null) continue;
        const stalePayload = stale.payload as Partial<GoalAlertPayload> | null;
        if (
          stalePayload?.goalId === goal.id &&
          stalePayload?.kind === "AT_RISK" &&
          stalePayload?.periodStart !== p.periodStart
        ) {
          stale.dismissedAt = nowIso();
        }
      }
      // PENDING = no data yet — never nag about an empty sample.
      if (p.actual === null || p.status === "PENDING") continue;

      const daysLeft = Math.max(0, p.daysTotal - p.daysElapsed);
      const dayWord = daysLeft === 1 ? "day" : "days";
      const pacing =
        p.progressPct === null
          ? ""
          : ` Pacing at ${Math.round(p.progressPct)}% with ${daysLeft} ${dayWord} left in the ${goal.period.toLowerCase()}.`;

      const slipping = p.status === "AT_RISK" || p.status === "BEHIND";
      const slipAlert = findGoalAlert(goal.id, "AT_RISK", p.periodStart);

      if (slipping) {
        const severity = p.status === "BEHIND" ? "ALERT" : "WARN";
        const title = p.status === "BEHIND" ? `Goal off pace — ${goal.title}` : `Goal at risk — ${goal.title}`;
        const message = `${p.detail}.${pacing}`;
        if (slipAlert) {
          // Same episode, status moved — rewrite the live alert in place.
          slipAlert.severity = severity;
          slipAlert.title = title;
          slipAlert.message = message;
          continue;
        }
        if (!goalPrefs.enabled || !goalPrefs.events.GOAL_AT_RISK.inApp) continue;
        data.alerts.push({
          id: crypto.randomUUID(),
          userId: goal.userId,
          type: "GOAL_STATUS",
          severity,
          title,
          message,
          payload: { goalId: goal.id, kind: "AT_RISK", periodStart: p.periodStart, status: p.status, progressPct: p.progressPct },
          tradeId: null,
          readAt: null,
          dismissedAt: null,
          createdAt: nowIso(),
        });
        continue;
      }

      // Not slipping anymore — retire the live risk alert (if any).
      if (slipAlert) slipAlert.dismissedAt = nowIso();
      if (p.status === "ON_TRACK" && slipAlert && goalPrefs.enabled && goalPrefs.events.GOAL_RECOVERED.inApp) {
        data.alerts.push({
          id: crypto.randomUUID(),
          userId: goal.userId,
          type: "GOAL_STATUS",
          severity: "NOTIFY",
          title: `Goal back on track — ${goal.title}`,
          message: `${p.detail}.${pacing}`,
          payload: { goalId: goal.id, kind: "ACHIEVED", periodStart: p.periodStart },
          tradeId: null,
          readAt: null,
          dismissedAt: null,
          createdAt: nowIso(),
        });
      }
      if (
        p.status === "ACHIEVED" &&
        goalPrefs.enabled &&
        goalPrefs.events.GOAL_ACHIEVED.inApp &&
        !findGoalAlert(goal.id, "ACHIEVED", p.periodStart)
      ) {
        data.alerts.push({
          id: crypto.randomUUID(),
          userId: goal.userId,
          type: "GOAL_STATUS",
          severity: "NOTIFY",
          title: `Goal achieved — ${goal.title}`,
          message: `${p.detail}. Target reached with ${daysLeft} ${dayWord} left in the ${goal.period.toLowerCase()}.`,
          payload: { goalId: goal.id, kind: "ACHIEVED", periodStart: p.periodStart },
          tradeId: null,
          readAt: null,
          dismissedAt: null,
          createdAt: nowIso(),
        });
      }
    }
  }

  function strategyNameFor(strategyId: string | null): string | null {
    if (strategyId === null) return null;
    return data.strategies.find((s) => s.id === strategyId)?.name ?? null;
  }

  function reviewRowForReview(review: TradeReview): ReviewRow {
    const trade = data.trades.find((t) => t.id === review.tradeId);
    if (!trade) throw new MockError(500, "Review references a missing trade");
    return {
      tradeId: review.tradeId,
      symbol: instrumentById.get(trade.instrumentId)?.symbol ?? "—",
      direction: trade.direction,
      tradingDate: trade.tradingDate,
      reviewStatus: "REVIEWED",
      decisionGrade: trade.decisionGrade,
      executionGrade: review.executionGrade,
      playbookMatch: review.playbookMatch,
      followedPlan: review.followedPlan,
      entryQuality: review.entryQuality,
      exitQuality: review.exitQuality,
      riskManagement: review.riskManagement,
      rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
      pnlNet: trade.pnlNet === null ? null : Number(trade.pnlNet),
      currency: mainAccount.currency,
      strategyName: strategyNameFor(trade.strategyId),
      setupName: trade.setupId ? (setups.find((s) => s.id === trade.setupId)?.name ?? null) : null,
      lesson: review.lessons,
      improvementNote: review.improvementNote,
      checklistResults: review.checklistResults,
      reviewedAt: review.reviewedAt,
    };
  }

  function pendingRowForTrade(trade: Trade): ReviewRow {
    return {
      tradeId: trade.id,
      symbol: instrumentById.get(trade.instrumentId)?.symbol ?? "—",
      direction: trade.direction,
      tradingDate: trade.tradingDate,
      reviewStatus: "PENDING",
      decisionGrade: trade.decisionGrade,
      executionGrade: null,
      playbookMatch: null,
      followedPlan: trade.followedPlan,
      entryQuality: null,
      exitQuality: null,
      riskManagement: null,
      rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
      pnlNet: trade.pnlNet === null ? null : Number(trade.pnlNet),
      currency: mainAccount.currency,
      strategyName: strategyNameFor(trade.strategyId),
      setupName: trade.setupId ? (setups.find((s) => s.id === trade.setupId)?.name ?? null) : null,
      lesson: trade.lessons,
      improvementNote: null,
      // The frozen checklist (if any) seeds the review workflow's pass/fail list.
      checklistResults:
        trade.checklistSnap && typeof trade.checklistSnap === "object" && !Array.isArray(trade.checklistSnap)
          ? Object.entries(trade.checklistSnap as Record<string, boolean>).map(([label, passed]) => ({
              label,
              passed: Boolean(passed),
            }))
          : null,
      reviewedAt: null,
    };
  }

  function listReviews(): ReviewsResponse {
    const reviewedTradeIds = new Set(reviews.map((r) => r.tradeId));
    const rows: ReviewRow[] = [
      ...reviews.map(reviewRowForReview),
      ...closedTrades()
        .filter((t) => !reviewedTradeIds.has(t.id))
        .map(pendingRowForTrade),
    ];
    rows.sort((a, b) => b.tradingDate.localeCompare(a.tradingDate));
    return { reviews: rows, meta: { generatedAt: nowIso() } };
  }

  function upsertReview(input: UpsertReviewInput): ReviewRow {
    const trade = data.trades.find((t) => t.id === input.tradeId && t.deletedAt === null);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "CLOSED") {
      throw new MockError(422, "Only closed trades can be reviewed");
    }

    const existing = reviews.find((r) => r.tradeId === input.tradeId);
    const now = nowIso();
    if (existing) {
      existing.executionGrade = input.executionGrade;
      existing.followedPlan = input.followedPlan;
      existing.playbookMatch = input.playbookMatch;
      existing.checklistResults = input.checklistResults ?? existing.checklistResults;
      existing.entryQuality = input.entryQuality ?? existing.entryQuality;
      existing.exitQuality = input.exitQuality ?? existing.exitQuality;
      existing.riskManagement = input.riskManagement ?? existing.riskManagement;
      existing.lessons = input.lessons;
      existing.improvementNote = input.improvementNote ?? existing.improvementNote;
      existing.updatedAt = now;
    } else {
      reviews.push({
        id: crypto.randomUUID(),
        userId: user.id,
        tradeId: input.tradeId,
        executionGrade: input.executionGrade,
        followedPlan: input.followedPlan,
        playbookMatch: input.playbookMatch,
        checklistResults: input.checklistResults ?? null,
        entryQuality: input.entryQuality ?? null,
        exitQuality: input.exitQuality ?? null,
        riskManagement: input.riskManagement ?? null,
        lessons: input.lessons,
        improvementNote: input.improvementNote ?? null,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    // Keep the trade's own written trace in sync so Analytics stays coherent.
    trade.lessons = input.lessons;
    trade.followedPlan = input.followedPlan;
    trade.updatedAt = now;

    return reviewRowForReview(reviews.find((r) => r.tradeId === input.tradeId)!);
  }

  function deleteReview(tradeId: string): { ok: true } {
    const index = reviews.findIndex((r) => r.tradeId === tradeId);
    if (index === -1) throw new MockError(404, "Review not found");
    reviews.splice(index, 1);
    return { ok: true };
  }

  function listLessons(): LessonsResponse {
    const reviewedTradeIds = new Set(reviews.map((r) => r.tradeId));
    const entries: LessonEntry[] = [];

    for (const review of reviews) {
      const trade = data.trades.find((t) => t.id === review.tradeId);
      if (!trade) continue;
      entries.push({
        id: review.id,
        source: "REVIEW",
        tradeId: review.tradeId,
        date: trade.tradingDate,
        text: review.lessons,
        symbol: instrumentById.get(trade.instrumentId)?.symbol ?? null,
        executionGrade: review.executionGrade,
        rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
        strategyName: strategyNameFor(trade.strategyId),
      });
    }
    for (const trade of closedTrades()) {
      if (trade.lessons === null || reviewedTradeIds.has(trade.id)) continue;
      entries.push({
        id: `note-${trade.id}`,
        source: "TRADE_NOTE",
        tradeId: trade.id,
        date: trade.tradingDate,
        text: trade.lessons,
        symbol: instrumentById.get(trade.instrumentId)?.symbol ?? null,
        executionGrade: trade.decisionGrade,
        rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
        strategyName: strategyNameFor(trade.strategyId),
      });
    }

    entries.sort((a, b) => b.date.localeCompare(a.date));
    return { lessons: entries };
  }

  function reviewOverview(): TradeReviewOverviewResponse {
    const closed = closedTrades();
    const reviewedCount = reviews.length;
    const pending = closed.length - reviewedCount;

    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const review of reviews) distribution[review.executionGrade] += 1;

    const meanQuality = (pick: (r: TradeReview) => number | null): number | null => {
      const values = reviews.map(pick).filter((v): v is number => v !== null);
      return values.length > 0 ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null;
    };

    // Review streak — consecutive trading days with ≥1 review, ending today
    // (or yesterday if today has none yet; the day is not over).
    const reviewDays = new Set(reviews.map((r) => toTradingDateKey(r.reviewedAt, USER_TZ)));
    let streakStart = todayKey();
    if (!reviewDays.has(streakStart)) streakStart = dateKeyOffset(-1);
    let reviewStreakDays = 0;
    if (reviewDays.has(streakStart)) {
      let cursor = streakStart;
      while (reviewDays.has(cursor)) {
        reviewStreakDays += 1;
        cursor = shiftDayKey2(cursor, -1);
      }
    }

    const gradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const weeklyGradeTrend: TradeReviewOverviewResponse["weeklyGradeTrend"] = [];
    const currentMondayOffset = (new Date(`${todayKey()}T00:00:00Z`).getUTCDay() + 6) % 7;
    const currentWeekStart = shiftDayKey2(todayKey(), -currentMondayOffset);
    for (let weekOffset = 7; weekOffset >= 0; weekOffset -= 1) {
      const weekStart = shiftDayKey2(currentWeekStart, -weekOffset * 7);
      const weekEnd = shiftDayKey2(weekStart, 6);
      const weekReviews = reviews.filter((r) => {
        const day = toTradingDateKey(r.reviewedAt, USER_TZ);
        return day >= weekStart && day <= weekEnd;
      });
      if (weekReviews.length === 0) continue;
      weeklyGradeTrend.push({
        weekStart,
        avgPoints: round2(weekReviews.reduce((sum, r) => sum + gradePoints[r.executionGrade]!, 0) / weekReviews.length),
        reviews: weekReviews.length,
      });
    }

    syncGoalAlerts();
    const progressRows = goals.filter((g) => g.active).map(goalProgressFor);
    const progressValues = progressRows.map((row) => row.progress.progressPct).filter((v): v is number => v !== null);
    const goalsSummary = {
      total: progressRows.length,
      achieved: progressRows.filter((row) => row.progress.status === "ACHIEVED").length,
      onTrack: progressRows.filter((row) => row.progress.status === "ON_TRACK").length,
      atRisk: progressRows.filter((row) => row.progress.status === "AT_RISK").length,
      behind: progressRows.filter((row) => row.progress.status === "BEHIND").length,
      avgProgressPct: progressValues.length > 0 ? round1(progressValues.reduce((s, v) => s + v, 0) / progressValues.length) : null,
    };

    const followedKnown = reviews.filter((r) => typeof r.followedPlan === "boolean");
    const followedCount = followedKnown.filter((r) => r.followedPlan === true).length;
    const lessons = listLessons().lessons;
    const pendingRows = listReviews().reviews
      .filter((row) => row.reviewStatus === "PENDING")
      .slice(0, 5);

    return {
      stats: {
        closedTrades: closed.length,
        reviewedTrades: reviewedCount,
        pendingReviews: Math.max(0, pending),
        reviewRatePct: closed.length > 0 ? round1((reviewedCount / closed.length) * 100) : 0,
        gradeDistribution: distribution,
        avgEntryQuality: meanQuality((r) => r.entryQuality),
        avgExitQuality: meanQuality((r) => r.exitQuality),
        avgRiskManagement: meanQuality((r) => r.riskManagement),
        lessonsCaptured: lessons.length,
        reviewStreakDays,
        followedPlanPct: followedKnown.length > 0 ? round1((followedCount / followedKnown.length) * 100) : null,
        offPlaybookCount: reviews.filter((r) => r.playbookMatch === "OFF_PLAYBOOK").length,
      },
      goalsSummary,
      weeklyGradeTrend,
      recentLessons: lessons.slice(0, 6),
      pendingQueuePreview: pendingRows,
      meta: { generatedAt: nowIso() },
    };
  }

  return {
    get data() { return data; },
    listTrades,
    listAccounts,
    listInstruments,
    listStrategies,
    createStrategy,
    updateStrategy,
    deleteStrategy,
    duplicateStrategy,
    strategyStats,
    listSetups,
    createSetup,
    updateSetup,
    deleteSetup,
    listChecklists,
    createChecklist,
    updateChecklist,
    deleteChecklist,
    listPlaybookRules,
    createPlaybookRule,
    updatePlaybookRule,
    deletePlaybookRule,
    listPlaybookTemplates,
    instantiatePlaybookTemplate,
    playbookOverview,
    // Trade Review module (fusion with Goal)
    reviewOverview,
    listReviews,
    upsertReview,
    deleteReview,
    listLessons,
    listGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    listTags,
    listAlerts,
    listEcoEvents,
    exportBackup,
    importBackup,
    markAlertRead,
    listSkippedTrades,
    createTrade,
    closeTrade,
    decide,
    getReview,
    updateReview,
    createTag,
    resolveMistake,
    updatePlan,
    updatePsychology,
    createSkippedTrade,
    settleSkippedTrade,
    rulesStatus,
    statsOverview,
    analytics,
    analyticsSuite,
    listRules,
    createRule,
    updateRule,
    deleteRule,
    listViolations,
    acknowledgeViolation,
    disciplineScore,
    mistakesLedger,
    sessionTimeline,
    updateNotes,
    updateTrade,
    deleteTrade,
    listScreenshots,
    addScreenshot,
    deleteScreenshot,
    getProfile,
    updateProfile,
    getPreferences,
    updatePreferencesDomain,
    resetPreferencesDomain,
    deactivateAccount,
    requestAccountDeletion,
  };
}

export type MockStore = ReturnType<typeof createMockStore>;

/** Browser-session singleton — handlers and fixtures share one store. */
export const mockStore: MockStore = createMockStore();
