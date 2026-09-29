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
  DEFAULT_USER_PREFERENCES,
  tradingPreferencesSchema,
  riskPreferencesSchema,
  journalPreferencesSchema,
  notificationPreferencesSchema,
  appearancePreferencesSchema,
  academyPreferencesSchema,
  privacyPreferencesSchema,
  localizationPreferencesSchema,
} from "@cosmoz/shared";

import { buildFixtureData, USER_TZ, type FixtureData } from "./fixtures";
import { integrationEngine } from "./integration-engine";

/** Per-domain validation schemas — one source of truth, used by the handler. */
const PREFERENCE_DOMAIN_SCHEMAS = {
  trading: tradingPreferencesSchema,
  risk: riskPreferencesSchema,
  journal: journalPreferencesSchema,
  notifications: notificationPreferencesSchema,
  appearance: appearancePreferencesSchema,
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

    const trade: Trade = {
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
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
    };
    data.strategies.push(strategy);
    return strategy;
  }

  function updateStrategy(strategyId: string, input: UpdateStrategyInput): Strategy {
    const strategy = data.strategies.find((s) => s.id === strategyId);
    if (!strategy) throw new MockError(404, "Strategy not found");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name === "") throw new MockError(422, "Strategy name cannot be empty");
      strategy.name = name;
    }
    if (input.description !== undefined) strategy.description = input.description;
    if (input.entryRules !== undefined) strategy.entryRules = input.entryRules;
    if (input.exitRules !== undefined) strategy.exitRules = input.exitRules;
    if (input.riskRules !== undefined) strategy.riskRules = input.riskRules;
    if (input.grade !== undefined) strategy.grade = input.grade;
    if (input.status !== undefined) strategy.status = input.status;
    if (input.color !== undefined) strategy.color = input.color;
    return strategy;
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
    data.strategies.splice(index, 1);
    return { ok: true };
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

  return {
    get data() { return data; },
    listTrades,
    listAccounts,
    listInstruments,
    listStrategies,
    createStrategy,
    updateStrategy,
    deleteStrategy,
    strategyStats,
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
