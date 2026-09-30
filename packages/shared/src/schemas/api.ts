import { z } from "zod";
import {
  assetClassSchema,
  currencySchema,
  directionSchema,
  emotionSchema,
  exitReasonSchema,
  gradeSchema,
  mistakeCategorySchema,
  outcomeSchema,
  ruleTypeSchema,
  severitySchema,
  shotKindSchema,
  strategyGradeSchema,
  tagCategorySchema,
  tradeStatusSchema,
} from "../enums";
import {
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";
import {
  tradeSchema,
  tradeEventSchema,
  tradeScreenshotSchema,
  detectedMistakeSummarySchema,
} from "./trade";
import { alertSchema } from "./alert";
import { skippedTradeSchema } from "./skippedTrade";
import { instrumentSchema } from "./instrument";
import { strategySchema } from "./strategy";
import { accountSchema } from "./account";
import { ruleSchema, ruleViolationViewSchema } from "./rule";
import { tagSchema } from "./tag";
import { ecoEventSchema } from "./eco-event";

/**
 * API read models & endpoint payloads — the contract implemented by the
 * NestJS API (and by the MSW mocks in V1). Source: trade-entry-ux.md §12–13.
 * P&L is WITHHELD until the decision is submitted (§13) — the payloads below
 * encode that mechanism structurally.
 */

// ── Create / close trades ────────────────────────────────────────────────────

/**
 * Hard contract (trade-entry-ux.md §5 + §12): closing a trade responds
 * WITHOUT any P&L field. Only the decision endpoint reveals results.
 */
export const awaitingDecisionResponseSchema = z.object({
  id: uuidSchema,
  awaitingDecision: z.literal(true),
});

export type AwaitingDecisionResponse = z.infer<typeof awaitingDecisionResponseSchema>;

/** POST /trades response: full trade when created open, withheld payload when closed. */
export const createTradeResponseSchema = z.union([
  tradeSchema,
  awaitingDecisionResponseSchema,
]);

export type CreateTradeResponse = z.infer<typeof createTradeResponseSchema>;

// ── Lists ────────────────────────────────────────────────────────────────────

export const tradesListQuerySchema = z.object({
  status: tradeStatusSchema.optional(),
  /** "true" = graded (decisionGrade set), "false" = awaiting a grade. */
  graded: z.enum(["true", "false"]).optional(),
  accountId: uuidSchema.optional(),
});

export type TradesListQuery = z.infer<typeof tradesListQuerySchema>;

/**
 * One row of the trade log. Identical to the Trade entity plus the tag join
 * projection (optional) so the trade module can render tag chips without a
 * review request per row.
 */
export const tradesListRowSchema = tradeSchema.extend({
  tagIds: z.array(uuidSchema).optional(),
});

export type TradesListRow = z.infer<typeof tradesListRowSchema>;

export const tradesListResponseSchema = z.object({
  trades: z.array(tradesListRowSchema),
  total: z.number().int().min(0),
});

export type TradesListResponse = z.infer<typeof tradesListResponseSchema>;

export const instrumentsResponseSchema = z.object({
  instruments: z.array(instrumentSchema),
});

export type InstrumentsResponse = z.infer<typeof instrumentsResponseSchema>;

export const strategiesResponseSchema = z.object({
  strategies: z.array(strategySchema),
});

export type StrategiesResponse = z.infer<typeof strategiesResponseSchema>;

export const accountsResponseSchema = z.object({
  accounts: z.array(accountSchema),
});

export type AccountsResponse = z.infer<typeof accountsResponseSchema>;

/** GET /tags — the user's (and seeded system) tag catalog for the capture form. */
export const tagsResponseSchema = z.object({
  tags: z.array(tagSchema),
});

export type TagsResponse = z.infer<typeof tagsResponseSchema>;

export const alertsResponseSchema = z.object({
  alerts: z.array(alertSchema),
  unreadCount: z.number().int().min(0),
});

export type AlertsResponse = z.infer<typeof alertsResponseSchema>;

/** GET /eco-events — economic calendar window (±weeks around today). */
export const ecoEventsResponseSchema = z.object({
  events: z.array(ecoEventSchema),
});

export type EcoEventsResponse = z.infer<typeof ecoEventsResponseSchema>;

/** POST /import/backup — result counts after merging a backup payload. */
export const importBackupResponseSchema = z.object({
  imported: z.object({
    trades: z.number().int().min(0),
    strategies: z.number().int().min(0),
    tags: z.number().int().min(0),
  }),
});

export type ImportBackupResponse = z.infer<typeof importBackupResponseSchema>;

export const skippedTradesResponseSchema = z.object({
  skippedTrades: z.array(skippedTradeSchema),
});

export type SkippedTradesResponse = z.infer<typeof skippedTradesResponseSchema>;

// ── Discipline banner (GET /rules/status) ────────────────────────────────────

export const ruleStatusLimitSchema = z.object({
  ruleId: uuidSchema,
  type: ruleTypeSchema,
  severity: severitySchema,
  /** The configured threshold (units depend on type: count, %, R…). */
  limit: decimalStringSchema,
  /** Today's current value for that rule. */
  current: decimalStringSchema,
});

export type RuleStatusLimit = z.infer<typeof ruleStatusLimitSchema>;

export const rulesStatusResponseSchema = z.object({
  date: dateKeySchema,
  accountId: uuidSchema.nullable(),
  tradesToday: z.number().int().min(0),
  lossesToday: z.number().int().min(0),
  /** % of the daily risk budget already consumed (0–100+). */
  riskBudgetSpentPct: decimalStringSchema,
  limits: z.array(ruleStatusLimitSchema),
});

export type RulesStatusResponse = z.infer<typeof rulesStatusResponseSchema>;

// ── Open-trade mutations ─────────────────────────────────────────────────────

/** PATCH /trades/:id/plan — modify SL/TP on an open trade. */
export const planUpdateInputSchema = z
  .object({
    stop: positiveDecimalStringSchema.optional(),
    tp: positiveDecimalStringSchema.optional(),
  })
  .refine((value) => value.stop !== undefined || value.tp !== undefined, {
    message: "Provide at least one of stop / tp",
  });

export type PlanUpdateInput = z.infer<typeof planUpdateInputSchema>;

export const planUpdateResponseSchema = z.object({
  trade: tradeSchema,
  /** Server-forged event (client never writes TradeEvents). */
  event: tradeEventSchema,
});

export type PlanUpdateResponse = z.infer<typeof planUpdateResponseSchema>;

/** PATCH /trades/:id/psychology — in-trade emotion taps. */
export const psychologyUpdateInputSchema = z
  .object({
    emotionBefore: emotionSchema.optional(),
    emotionAfter: emotionSchema.optional(),
    confidence: z.number().int().min(1).max(5).optional(),
  })
  .refine(
    (value) =>
      value.emotionBefore !== undefined ||
      value.emotionAfter !== undefined ||
      value.confidence !== undefined,
    { message: "Provide at least one psychology field" },
  );

export type PsychologyUpdateInput = z.infer<typeof psychologyUpdateInputSchema>;

/** PATCH /trades/:id/notes — the session card's note icon quick-save. */
export const notesUpdateInputSchema = z.object({
  notes: z.string().max(2000),
});

export type NotesUpdateInput = z.infer<typeof notesUpdateInputSchema>;

export const notesUpdateResponseSchema = z.object({
  trade: tradeSchema,
});

export type NotesUpdateResponse = z.infer<typeof notesUpdateResponseSchema>;

// ── Session Live (GET /session/timeline, trade-entry-ux.md §9) ────────────

/**
 * One row of today's session event timeline — computed SERVER-SIDE from
 * trades, server-forged TradeEvents and alerts; the client never assembles
 * it (the trading date comes from the API, never computed client-side).
 */
export const sessionEventSchema = z.object({
  id: uuidSchema,
  at: isoDateTimeSchema,
  kind: z.enum(["ENTRY", "EXIT", "SL_MODIFIED", "TP_MODIFIED", "ALERT"]),
  /** Short headline, e.g. "BOOM500 · BUY opened". */
  label: z.string().min(1),
  /** Optional mono detail, e.g. "0.42 lots @ 4,182.55". */
  detail: z.string().nullable(),
  /** Only ALERT rows carry the source alert's severity. */
  severity: severitySchema.nullable(),
});

export type SessionEvent = z.infer<typeof sessionEventSchema>;

/** A logged emotion for the compact mood strip (1-tap psychology taps). */
export const sessionMoodSchema = z.object({
  at: isoDateTimeSchema,
  emotion: emotionSchema,
  /** BEFORE = at entry; AFTER = in-trade / exit quick-log. */
  phase: z.enum(["BEFORE", "AFTER"]),
  tradeId: uuidSchema.nullable(),
});

export type SessionMood = z.infer<typeof sessionMoodSchema>;

export const sessionTimelineResponseSchema = z.object({
  /** Server-computed trading date — the client never derives "today". */
  date: dateKeySchema,
  /** Chronological (oldest first). */
  events: z.array(sessionEventSchema),
  moods: z.array(sessionMoodSchema),
});

export type SessionTimelineResponse = z.infer<typeof sessionTimelineResponseSchema>;

// ── Session logbook (timestamped in-session notes) ────────────────────────

/**
 * One timestamped note logged DURING the trading session — the running
 * commentary the trader leaves for the post-market review (levels watched,
 * why an entry was taken, hesitation moments). One flat list per trading
 * day, server-stamped, reviewable next to the timeline.
 */
export const sessionNoteSchema = z.object({
  id: uuidSchema,
  /** Server-resolved trading date the note belongs to. */
  date: dateKeySchema,
  /** Wall-clock timestamp when the note was logged. */
  at: isoDateTimeSchema,
  text: z.string().min(1).max(2000),
});

export type SessionNote = z.infer<typeof sessionNoteSchema>;

export const sessionNotesResponseSchema = z.object({
  /** Chronological (oldest first). */
  notes: z.array(sessionNoteSchema),
});
export type SessionNotesResponse = z.infer<typeof sessionNotesResponseSchema>;

export const createSessionNoteInputSchema = z.object({
  text: z.string().trim().min(1, "Note is empty").max(2000),
});
export type CreateSessionNoteInput = z.infer<typeof createSessionNoteInputSchema>;

// ── Review (Act 3) ───────────────────────────────────────────────────────────

/** Detected mistake with its join id (needed for PATCH confirm/dismiss). */
export const reviewMistakeSchema = detectedMistakeSummarySchema.extend({
  /** TradeMistake join-row id. */
  id: uuidSchema,
  note: z.string().nullable(),
});

export type ReviewMistake = z.infer<typeof reviewMistakeSchema>;

export const reviewResponseSchema = z.object({
  trade: tradeSchema,
  detectedMistakes: z.array(reviewMistakeSchema),
  /** Current trade ↔ tag join ids (reflect screen preselects these). */
  tagIds: z.array(uuidSchema),
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

/**
 * PATCH /trades/:id/review — Act 3 persistence for the fields with no
 * dedicated endpoint. MFE/MAE are USER-OBSERVED PRICES (inputs), never
 * computed R — the server recomputes mfeR/maeR from the prices (§13).
 * All fields optional; at least one required.
 */
export const reviewUpdateInputSchema = z
  .object({
    mfePrice: positiveDecimalStringSchema.optional(),
    maePrice: positiveDecimalStringSchema.optional(),
    /** The lesson — stored on Trade.lessons. */
    lesson: z.string().max(5000).optional(),
    /** Full replacement set of tag ids (TradeTag join rows). */
    tagIds: z.array(uuidSchema).optional(),
  })
  .refine(
    (value) =>
      value.mfePrice !== undefined ||
      value.maePrice !== undefined ||
      value.lesson !== undefined ||
      value.tagIds !== undefined,
    { message: "Provide at least one review field" },
  );

export type ReviewUpdateInput = z.infer<typeof reviewUpdateInputSchema>;

export const reviewUpdateResponseSchema = z.object({
  /** Updated trade — MFE/MAE-derived R recomputed server-side. */
  trade: tradeSchema,
});

export type ReviewUpdateResponse = z.infer<typeof reviewUpdateResponseSchema>;

/** PATCH /alerts/:id/read — inbox read state; returns the updated alert. */
export const markAlertReadResponseSchema = z.object({
  alert: alertSchema,
});

export type MarkAlertReadResponse = z.infer<typeof markAlertReadResponseSchema>;

// ── Tags (inline creation, Act 3 / capture "Add details") ────────────────────

/** POST /tags — inline tag creation (reflect screen + capture details). */
export const createTagInputSchema = z.object({
  name: z.string().min(1).max(40),
  category: tagCategorySchema.optional(),
});

export type CreateTagInput = z.infer<typeof createTagInputSchema>;

/** PATCH /trades/:id/mistakes/:mistakeId */
export const resolveMistakeInputSchema = z.object({
  confirmed: z.boolean(),
});

export type ResolveMistakeInput = z.infer<typeof resolveMistakeInputSchema>;

export const resolveMistakeResponseSchema = reviewMistakeSchema;

export type ResolveMistakeResponse = z.infer<typeof resolveMistakeResponseSchema>;

// ── Ghost trades ─────────────────────────────────────────────────────────────

export const createSkippedTradeInputSchema = z.object({
  instrumentId: uuidSchema,
  strategyId: uuidSchema.optional(),
  direction: directionSchema.nullable().optional(),
  /** Moment of the observation; absent = server stamps now (UTC). */
  seenAt: isoDateTimeSchema.optional(),
  reason: z.enum(["DISCIPLINE", "FEAR", "OUT_OF_PLAYBOOK", "NO_SETUP", "MISSED_EXECUTION"]),
  notes: z.string().max(2000).optional(),
});

export type CreateSkippedTradeInput = z.infer<typeof createSkippedTradeInputSchema>;

export const settleSkippedTradeInputSchema = z.object({
  outcomeGuess: outcomeSchema,
  /** Estimated R when the user can quantify it. */
  hypotheticalR: decimalStringSchema.optional(),
});

export type SettleSkippedTradeInput = z.infer<typeof settleSkippedTradeInputSchema>;

// ── Playbook (GET /strategies/stats) ─────────────────────────────────────────

/**
 * Per-strategy aggregates computed SERVER-SIDE from the closed trades
 * (the client never derives aggregates — same rule as /stats/overview).
 */
export const strategyStatSchema = z.object({
  strategyId: uuidSchema,
  /** Closed trades attributed to this strategy (all-time). */
  trades: z.number().int().min(0),
  /** Ratio 0–1 (render via formatPercent). */
  winRate: decimalStringSchema,
  /** Average R per closed trade = expectancy. */
  avgR: decimalStringSchema,
  /** Cumulative-R equity sparkline, chronological, decimal strings. */
  sparkline: z.array(decimalStringSchema),
  /**
   * Average R over the strategy's LAST 20 closed trades — the decay
   * detector window. null when the strategy has no closed trades.
   */
  last20Expectancy: decimalStringSchema.nullable(),
});

export type StrategyStat = z.infer<typeof strategyStatSchema>;

export const strategiesStatsResponseSchema = z.object({
  stats: z.array(strategyStatSchema),
  /**
   * The underperforming strategy the coach banner calls out — COMPUTED
   * (most negative last-20 expectancy among strategies with enough
   * sample), never a hardcoded name. null = nobody is underperforming.
   */
  underperforming: z
    .object({
      strategyId: uuidSchema,
      name: z.string().min(1),
      last20Expectancy: decimalStringSchema,
      sampleSize: z.number().int().min(0),
    })
    .nullable(),
});

export type StrategiesStatsResponse = z.infer<typeof strategiesStatsResponseSchema>;

// ── Discipline screen (rules / violations / score / mistakes) ────────────────

export const rulesResponseSchema = z.object({
  rules: z.array(ruleSchema),
});

export type RulesResponse = z.infer<typeof rulesResponseSchema>;

/** GET /violations — the log, newest first, with the rolling-window aggregate. */
export const violationsResponseSchema = z.object({
  violations: z.array(ruleViolationViewSchema),
  /** Start of the aggregate window (30 days back), `YYYY-MM-DD`. */
  windowStart: dateKeySchema,
  /** Violations that occurred inside the window. */
  windowCount: z.number().int().min(0),
});

export type ViolationsResponse = z.infer<typeof violationsResponseSchema>;

export const acknowledgeViolationResponseSchema = z.object({
  violation: ruleViolationViewSchema,
});

export type AcknowledgeViolationResponse = z.infer<typeof acknowledgeViolationResponseSchema>;

/**
 * GET /discipline/score — the Cosmoz Discipline Score (indexCosmoz):
 * process composite, deliberately decoupled from P&L. Components cover the
 * rolling 30-day window and are computed server-side.
 */
export const disciplineScoreResponseSchema = z.object({
  /** Start of the aggregation window (30 days back), `YYYY-MM-DD`. */
  windowStart: dateKeySchema,
  /** Average Cosmoz Index across scored days (null when no data yet). */
  score: decimalStringSchema.nullable(),
  /** % of graded trades in the window that followed the plan (null = none graded). */
  planAdherencePct: decimalStringSchema.nullable(),
  /** % of the window's graded trades with a completed checklist snapshot. */
  checklistCompletionPct: decimalStringSchema,
  /** RULE_VIOLATION events inside the window (from the violation table). */
  violationsCount: z.number().int().min(0),
  /** % of the window's trading days with at least one written reflection. */
  journalingConsistencyPct: decimalStringSchema,
});

export type DisciplineScoreResponse = z.infer<typeof disciplineScoreResponseSchema>;

/** GET /mistakes/ledger — per-mistake frequency + R cost over the window. */
export const mistakeLedgerEntrySchema = z.object({
  mistakeId: uuidSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  category: mistakeCategorySchema,
  /** Catalog severity 1–5. */
  severity: z.number().int().min(1).max(5),
  /** Occurrences inside the window (rows in trade_mistakes). */
  count: z.number().int().min(0),
  /** Σ R over the trades carrying this mistake (cost ≤ 0 ideally). */
  rCost: decimalStringSchema,
  lastSeenAt: isoDateTimeSchema.nullable(),
});

export type MistakeLedgerEntry = z.infer<typeof mistakeLedgerEntrySchema>;

export const mistakeLedgerResponseSchema = z.object({
  /** Start of the aggregation window (30 days back), `YYYY-MM-DD`. */
  windowStart: dateKeySchema,
  /** Sorted by |rCost| descending — the most expensive mistakes first. */
  entries: z.array(mistakeLedgerEntrySchema),
});

export type MistakeLedgerResponse = z.infer<typeof mistakeLedgerResponseSchema>;

// ── Analytics overview (GET /stats/overview) ─────────────────────────────────

export const equityPointSchema = z.object({
  date: dateKeySchema,
  equity: decimalStringSchema,
});

export type EquityPoint = z.infer<typeof equityPointSchema>;

export const dailyPnlPointSchema = z.object({
  date: dateKeySchema,
  pnlNet: decimalStringSchema,
  tradesCount: z.number().int().min(0),
});

export type DailyPnlPoint = z.infer<typeof dailyPnlPointSchema>;

/**
 * KPI change vs the previous comparable period — computed SERVER-SIDE so the
 * client never derives aggregates (same rule as the KPIs themselves).
 */
export const kpiDeltaSchema = z.object({
  /**
   * Signed delta in the KPI's own unit (net P&L → %, win rate → percentage
   * points, profit factor → ratio units, expectancy → R, discipline → points).
   * null when the previous period has no baseline to compare against.
   */
  value: decimalStringSchema.nullable(),
  direction: z.enum(["UP", "DOWN", "FLAT"]),
});

export type KpiDelta = z.infer<typeof kpiDeltaSchema>;

/**
 * Per-KPI sparkline series over the recent window (chronological, oldest
 * first). Server-computed rolling aggregates, decimal strings.
 */
export const kpiSparklinesSchema = z.object({
  netPnl: z.array(decimalStringSchema),
  winRate: z.array(decimalStringSchema),
  profitFactor: z.array(decimalStringSchema),
  expectancy: z.array(decimalStringSchema),
  disciplineScore: z.array(decimalStringSchema),
});

export type KpiSparklines = z.infer<typeof kpiSparklinesSchema>;

/**
 * Discipline Saved — Σ|R| preserved by SETTLED would-have-lost ghost trades
 * (data-model.md "Domaine 5") plus how many such ghosts were settled.
 */
export const disciplineSavedSchema = z.object({
  rSaved: decimalStringSchema,
  settledCount: z.number().int().min(0),
});

export type DisciplineSaved = z.infer<typeof disciplineSavedSchema>;

/**
 * Hesitation Cost — Σ R missed by SETTLED would-have-won ghost trades (the
 * mirror of Discipline Saved in the Regret Registry) plus their count.
 */
export const hesitationCostSchema = z.object({
  rCost: decimalStringSchema,
  settledCount: z.number().int().min(0),
});

export type HesitationCost = z.infer<typeof hesitationCostSchema>;

/**
 * Daily fear-vs-discipline skip counts over the last 30 days,
 * zero-filled — feeds the Regret Registry trend sparkline.
 */
export const ghostTrendPointSchema = z.object({
  date: dateKeySchema,
  fear: z.number().int().min(0),
  discipline: z.number().int().min(0),
});

export type GhostTrendPoint = z.infer<typeof ghostTrendPointSchema>;

// ── Weekly comparison bands (this week vs previous week) ──────────────────

/** One zero-filled calendar day inside a week-compare strip. */
export const weekCompareDaySchema = z.object({
  date: dateKeySchema,
  pnlNet: decimalStringSchema,
  tradesCount: z.number().int().min(0),
});

export type WeekCompareDay = z.infer<typeof weekCompareDaySchema>;

/**
 * One side of the week-vs-week comparison — the SAME rolling 7-day window
 * as the KPI deltas, zero-filled so both strips always draw 7 bands.
 * Computed SERVER-SIDE (aggregation principle); the client only renders.
 */
export const weekCompareSideSchema = z.object({
  days: z.array(weekCompareDaySchema).length(7),
  totalPnl: decimalStringSchema,
  /** null when the week has no closed trades yet. */
  winRate: decimalStringSchema.nullable(),
  tradesCount: z.number().int().min(0),
});

export type WeekCompareSide = z.infer<typeof weekCompareSideSchema>;

export const statsOverviewResponseSchema = z.object({
  currency: currencySchema,
  netPnl: decimalStringSchema,
  /** Ratio 0–1 (render via formatPercent). */
  winRate: decimalStringSchema,
  /** null when there are no losing trades yet. */
  profitFactor: decimalStringSchema.nullable(),
  /** Average R per closed trade. */
  expectancy: decimalStringSchema,
  /** Average Cosmoz Index across days (null when no data). */
  disciplineScore: decimalStringSchema.nullable(),
  equityCurve: z.array(equityPointSchema),
  dailyPnl: z.array(dailyPnlPointSchema),
  /** Highest equity ever reached (starting balance included). */
  equityPeak: decimalStringSchema,
  /** Worst peak-to-trough decline in % (≤ 0). */
  maxDrawdownPct: decimalStringSchema,
  deltas: z.object({
    netPnl: kpiDeltaSchema,
    winRate: kpiDeltaSchema,
    profitFactor: kpiDeltaSchema,
    expectancy: kpiDeltaSchema,
    disciplineScore: kpiDeltaSchema,
  }),
  /** Size of the delta comparison window in days (7 = week vs week). */
  deltaWindowDays: z.number().int().min(1),
  sparklines: kpiSparklinesSchema,
  /** Σ|R| saved by settled would-have-lost ghost trades + their count. */
  disciplineSaved: disciplineSavedSchema,
  /** Σ R missed by settled would-have-won ghost trades (Regret Registry). */
  hesitationCost: hesitationCostSchema,
  /** Last 30 days of fear-vs-discipline skip counts, zero-filled. */
  ghostTrend: z.array(ghostTrendPointSchema),
  /** This week vs last week — 7 zero-filled day bands per week (server-computed). */
  weeklyCompare: z.object({
    thisWeek: weekCompareSideSchema,
    prevWeek: weekCompareSideSchema,
    /** Signed % change of totalPnl (null when no previous-week baseline). */
    deltaPnlPct: decimalStringSchema.nullable(),
  }),
});

export type StatsOverviewResponse = z.infer<typeof statsOverviewResponseSchema>;

// ── Analytics suite (GET /stats/analytics) ───────────────────────────────────

/**
 * One grouped aggregate row used across the analytics suite (hour buckets,
 * weekdays, sessions, emotions). Aggregates are computed SERVER-SIDE; every
 * rate ships with its `trades` count — statistical honesty is a product
 * principle, never render a rate without its n.
 */
export const analyticsBucketSchema = z.object({
  /** Stable grouping key ("13", "MON", "ASIA", "FOMO"…). */
  key: z.string().min(1),
  /** Ready-to-render display label. */
  label: z.string().min(1),
  trades: z.number().int().min(0),
  wins: z.number().int().min(0),
  /** Average R per trade; null when the bucket is empty. */
  avgR: decimalStringSchema.nullable(),
  /** Win ratio 0–1; null when the bucket is empty. */
  winRate: decimalStringSchema.nullable(),
});

export type AnalyticsBucket = z.infer<typeof analyticsBucketSchema>;

/** Weekday (rows) × UTC hour bucket (columns) cell of the Overview heatmap. */
export const heatmapCellSchema = z.object({
  /** 0 = Sunday … 6 = Saturday (derived from the API tradingDate). */
  weekday: z.number().int().min(0).max(6),
  /** Index into ANALYTICS_HOUR_BUCKETS. */
  hourBucket: z.number().int().min(0).max(5),
  trades: z.number().int().min(0),
  wins: z.number().int().min(0),
  /** Average R per trade; null when the cell is empty. */
  avgR: decimalStringSchema.nullable(),
});

export type HeatmapCell = z.infer<typeof heatmapCellSchema>;

/** One cell of the decision-grade × outcome matrix. */
export const gradeOutcomeCellSchema = z.object({
  count: z.number().int().min(0),
  avgR: decimalStringSchema,
});

export type GradeOutcomeCell = z.infer<typeof gradeOutcomeCellSchema>;

/**
 * The poker-logic proof: a decision grade assigned BEFORE the reveal must
 * not predict the outcome better than chance — if it does, the grader saw
 * the result (hindsight bias). Rows ordered A → F.
 */
export const gradeOutcomeRowSchema = z.object({
  grade: gradeSchema,
  win: gradeOutcomeCellSchema.nullable(),
  loss: gradeOutcomeCellSchema.nullable(),
});

export type GradeOutcomeRow = z.infer<typeof gradeOutcomeRowSchema>;

/**
 * Tilt timeline point — one chronological closed trade with its committed
 * risk and the loss streak that preceded it. `isSpike` flags the classic
 * pattern: a bigger-than-previous risk right after ≥ 2 consecutive losses.
 */
export const tiltPointSchema = z.object({
  tradeId: uuidSchema,
  date: dateKeySchema,
  riskAmount: decimalStringSchema,
  rMultiple: decimalStringSchema,
  /** Consecutive losses immediately before this trade. */
  priorLossStreak: z.number().int().min(0),
  isSpike: z.boolean(),
});

export type TiltPoint = z.infer<typeof tiltPointSchema>;

/** Sleep-vs-P&L scatter point (from the nightly DailyStat materialization). */
export const sleepPointSchema = z.object({
  date: dateKeySchema,
  sleepHours: decimalStringSchema,
  pnlNet: decimalStringSchema,
  tradesCount: z.number().int().min(0),
});

export type SleepPoint = z.infer<typeof sleepPointSchema>;

/** Per-strategy closed-trade R values (chronological) for the small multiples. */
export const strategyDistributionSchema = z.object({
  strategyId: uuidSchema,
  name: z.string().min(1),
  grade: strategyGradeSchema.nullable(),
  color: z.string().nullable(),
  rValues: z.array(decimalStringSchema),
});

export type StrategyDistribution = z.infer<typeof strategyDistributionSchema>;

/**
 * Summary cards band of the Overview tab. Complements /stats/overview with
 * the analytics-only ratios; all values are server-computed decimal strings.
 */
export const analyticsCardsSchema = z.object({
  winRate: decimalStringSchema,
  profitFactor: decimalStringSchema.nullable(),
  /** Average R per closed trade. */
  expectancy: decimalStringSchema,
  /** Realized R:R — average winning R ÷ average losing R. */
  payoffRatio: decimalStringSchema.nullable(),
  /** Worst peak-to-trough decline of the cumulative-R curve (≤ 0). */
  maxDrawdownR: decimalStringSchema,
  /** Closed trades to climb back to the prior peak; null = not recovered yet. */
  recoveryTrades: z.number().int().min(0).nullable(),
  /** Calendar days from trough back to the prior peak; null = not recovered. */
  recoveryDays: z.number().int().min(0).nullable(),
  /** Total closed trades in the sample (the global n). */
  sampleTrades: z.number().int().min(0),
});

export type AnalyticsCards = z.infer<typeof analyticsCardsSchema>;

/**
 * GET /stats/analytics — one response feeding the whole analytics suite:
 * summary cards, heatmap, time buckets, psychology correlations, all-time
 * mistake ledger and per-strategy R distributions. The client renders; it
 * never re-derives these aggregates.
 */
export const analyticsResponseSchema = z.object({
  currency: currencySchema,
  cards: analyticsCardsSchema,
  heatmap: z.array(heatmapCellSchema),
  /** Average R per UTC hour bucket (see ANALYTICS_HOUR_BUCKETS). */
  hourBuckets: z.array(analyticsBucketSchema),
  /** Average R per weekday, Monday first. */
  weekdayBuckets: z.array(analyticsBucketSchema),
  /** Average R per trading session (Asia / London / New York). */
  sessionBuckets: z.array(analyticsBucketSchema),
  /** Average R per pre-trade emotion, worst first. */
  emotionBuckets: z.array(analyticsBucketSchema),
  gradeMatrix: z.array(gradeOutcomeRowSchema),
  /** Chronological closed trades for the tilt timeline. */
  tilt: z.array(tiltPointSchema),
  /** Days with a known sleep duration, chronological. */
  sleepScatter: z.array(sleepPointSchema),
  /** All-time mistake ledger (same shape as the 30-day /mistakes/ledger). */
  mistakes: z.array(mistakeLedgerEntrySchema),
  strategyDistributions: z.array(strategyDistributionSchema),
});

export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;

// ── Trade module: edit, delete, screenshots ─────────────────────────────────

/**
 * PATCH /trades/:id — journal correction from the trade module. All fields
 * optional (partial update); for CLOSED trades the server recomputes
 * pnlGross / pnlNet / rMultiple from the edited legs (§15: results are
 * always server-computed, never trusted from the client).
 */
export const updateTradeInputSchema = z
  .object({
    instrumentId: uuidSchema.optional(),
    direction: directionSchema.optional(),
    entryPrice: positiveDecimalStringSchema.optional(),
    entryAt: isoDateTimeSchema.optional(),
    quantity: positiveDecimalStringSchema.optional(),
    initialStop: positiveDecimalStringSchema.nullable().optional(),
    initialTP: positiveDecimalStringSchema.nullable().optional(),
    /** null = detach from the playbook. */
    strategyId: uuidSchema.nullable().optional(),
    fees: nonNegativeDecimalStringSchema.optional(),
    swap: decimalStringSchema.optional(),
    /** Closed trades only — correcting the recorded exit. */
    exitPrice: positiveDecimalStringSchema.optional(),
    exitAt: isoDateTimeSchema.optional(),
    exitReason: exitReasonSchema.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: "Provide at least one field to update" },
  );

export type UpdateTradeInput = z.infer<typeof updateTradeInputSchema>;

/** PATCH /trades/:id response — the corrected trade projection. */
export const updateTradeResponseSchema = z.object({
  trade: tradeSchema,
});

export type UpdateTradeResponse = z.infer<typeof updateTradeResponseSchema>;

/** DELETE /trades/:id — soft delete (undo window is a later concern). */
export const deleteTradeResponseSchema = z.object({
  id: uuidSchema,
  deleted: z.literal(true),
});

export type DeleteTradeResponse = z.infer<typeof deleteTradeResponseSchema>;

// ── Trade screenshots (module gallery) ──────────────────────────────────────

/** GET /trades/:id/screenshots — chart evidence for the detail drawer. */
export const tradeScreenshotsResponseSchema = z.object({
  screenshots: z.array(tradeScreenshotSchema),
});

export type TradeScreenshotsResponse = z.infer<typeof tradeScreenshotsResponseSchema>;

/** POST /trades/:id/screenshots — upload (data URL stored by the mock API). */
export const addScreenshotInputSchema = z.object({
  kind: shotKindSchema,
  /** Data URL — real deployments swap this for object-storage keys. */
  dataUrl: z.string().min(1).max(8_000_000),
  caption: z.string().max(300).optional(),
});

export type AddScreenshotInput = z.infer<typeof addScreenshotInputSchema>;

/** DELETE /trades/:id/screenshots/:screenshotId. */
export const deleteScreenshotResponseSchema = z.object({
  id: uuidSchema,
  deleted: z.literal(true),
});

export type DeleteScreenshotResponse = z.infer<typeof deleteScreenshotResponseSchema>;

// ── Profile (GET/PATCH /me) ─────────────────────────────────────────────────

export const profileSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string().min(1).max(80),
  /** IANA timezone — drives the trading-day keys server-side. */
  timezone: z.string().min(1),
  baseCurrency: currencySchema,
  /** Public handle — unique server-side, optional, `@`-less. */
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, "Letters, digits, _ and - only").nullable(),
  /** Short free-form bio (≤ 280 chars), shown on the profile. */
  bio: z.string().max(280).nullable(),
  /** Avatar image — data URL in V1 mocks, CDN URL with the real API. */
  avatarUrl: z.string().max(600_000).nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

export const profileUpdateInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  timezone: z.string().min(1).optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, "Letters, digits, _ and - only").nullable().optional(),
  bio: z.string().max(280).nullable().optional(),
  avatarUrl: z.string().max(600_000).nullable().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;

// ── Analytics Suite (GET /stats/analytics-suite) ────────────────────────────
// Professional Analytics module — ONE endpoint = ONE dataset definition so
// every tab of the module renders the exact same filtered trade set (MASTER
// PROMPT §5). All aggregates are computed SERVER-SIDE on CLOSED trades only;
// open positions never leak into performance statistics (§38).

/** Named date presets resolved SERVER-SIDE against the trading-day clock. */
export const analyticsPeriodSchema = z.enum([
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "LAST_30",
  "LAST_90",
  "YTD",
  "ALL",
  "CUSTOM",
]);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;

/** Global filter query — every field optional; absent = unfiltered. */
export const analyticsFiltersSchema = z.object({
  period: analyticsPeriodSchema.default("ALL"),
  /** Required when period = CUSTOM (trading-date keys, inclusive). */
  customFrom: dateKeySchema.optional(),
  customTo: dateKeySchema.optional(),
  accountId: uuidSchema.optional(),
  instrumentId: uuidSchema.optional(),
  assetClass: assetClassSchema.optional(),
  /** "none" = out-of-playbook trades (strategyId null). */
  strategyId: uuidSchema.or(z.literal("none")).optional(),
  direction: directionSchema.optional(),
  /** Session key from ANALYTIC_SESSIONS (derived from the entry hour, UTC). */
  session: z.enum(["ASIA", "LONDON", "NEW_YORK"]).optional(),
  emotion: emotionSchema.optional(),
  exitReason: exitReasonSchema.optional(),
  tagId: uuidSchema.optional(),
});
export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;

/** Dataset descriptor — the "WHAT DATASET AM I LOOKING AT?" line (§5). */
export const analyticsDatasetMetaSchema = z.object({
  resolvedFrom: dateKeySchema,
  resolvedTo: dateKeySchema,
  /** Human-readable filter echo, ready to render (server is the truth). */
  descriptor: z.string().min(1),
  closedTrades: z.number().int().min(0),
  openTradesExcluded: z.number().int().min(0),
  /** Non-fatal dataset observations (multi-currency, tiny sample…). */
  warnings: z.array(z.string()),
  /** Money aggregates are only meaningful within one currency. */
  singleCurrency: z.boolean(),
});
export type AnalyticsDatasetMeta = z.infer<typeof analyticsDatasetMetaSchema>;

/**
 * Summary band (§6/§8). Every ratio can be null when the sample cannot
 * support it — the client renders "—" with the n, never a fake zero.
 * `sharpeNote`/`sortinoNote` carry the exact methodology (§8: never present a
 * Sharpe without explaining how it was computed).
 */
export const analyticsSummarySchema = z.object({
  netPnl: decimalStringSchema.nullable(),
  grossProfit: decimalStringSchema.nullable(),
  grossLoss: decimalStringSchema.nullable(),
  /** Ratios 0–1. */
  winRate: decimalStringSchema.nullable(),
  lossRate: decimalStringSchema.nullable(),
  profitFactor: decimalStringSchema.nullable(),
  /** Expectancy: per-trade mean of R (primary) and mean money P&L. */
  expectancyR: decimalStringSchema,
  expectancyMoney: decimalStringSchema.nullable(),
  avgR: decimalStringSchema.nullable(),
  medianR: decimalStringSchema.nullable(),
  bestR: decimalStringSchema.nullable(),
  worstR: decimalStringSchema.nullable(),
  avgWinMoney: decimalStringSchema.nullable(),
  avgLossMoney: decimalStringSchema.nullable(),
  avgWinR: decimalStringSchema.nullable(),
  avgLossR: decimalStringSchema.nullable(),
  payoffRatio: decimalStringSchema.nullable(),
  maxDrawdownR: decimalStringSchema,
  maxDrawdownPct: decimalStringSchema.nullable(),
  recoveryFactor: decimalStringSchema.nullable(),
  /** Annualization: √252 over daily R sums, risk-free = 0 (see notes). */
  sharpe: decimalStringSchema.nullable(),
  sortino: decimalStringSchema.nullable(),
  /** System Quality Number — mean(R) ÷ std(R) × √n, on the filtered set. */
  sqn: decimalStringSchema.nullable(),
  trades: z.number().int().min(0),
  winningTrades: z.number().int().min(0),
  losingTrades: z.number().int().min(0),
  breakevenTrades: z.number().int().min(0),
  /** Mean holding time in minutes (null when exits are missing). */
  avgDurationMin: z.number().int().nullable(),
  sharpeNote: z.string(),
  sortinoNote: z.string(),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

/** Equity/balance point with the running drawdown for the overlay (§7/§11). */
export const analyticsEquityPointSchema = z.object({
  date: dateKeySchema,
  equity: decimalStringSchema,
  /** Peak-to-now decline in % at this point (≤ 0). */
  drawdownPct: decimalStringSchema,
});
export type AnalyticsEquityPoint = z.infer<typeof analyticsEquityPointSchema>;

/** Per-trade cumulative-R sequence (chronological) for the R curve + rolling. */
export const analyticsRPointSchema = z.object({
  index: z.number().int().min(0),
  date: dateKeySchema,
  symbol: z.string(),
  r: decimalStringSchema,
  cumR: decimalStringSchema,
});
export type AnalyticsRPoint = z.infer<typeof analyticsRPointSchema>;

/** Rolling window point (§7 rolling metrics). */
export const analyticsRollingPointSchema = z.object({
  index: z.number().int().min(0),
  winRate: decimalStringSchema.nullable(),
  avgR: decimalStringSchema.nullable(),
});
export type AnalyticsRollingPoint = z.infer<typeof analyticsRollingPointSchema>;

/** Daily P&L row over the filtered window (zero-filled days with activity). */
export const analyticsDailyPointSchema = z.object({
  date: dateKeySchema,
  pnl: decimalStringSchema.nullable(),
  r: decimalStringSchema,
  trades: z.number().int().min(0),
  wins: z.number().int().min(0),
});
export type AnalyticsDailyPoint = z.infer<typeof analyticsDailyPointSchema>;

/** Histogram bin (P&L, R, duration…) — ready to render. */
export const analyticsHistogramBinSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().min(0),
  /** Bin center for charts (null = non-numeric bucket). */
  center: decimalStringSchema.nullable(),
});
export type AnalyticsHistogramBin = z.infer<typeof analyticsHistogramBinSchema>;

/**
 * Drawdown period (§11): Peak → Start → Bottom → Recovery with the trades
 * that dug the hole (drill-down §33). `recovered*` stay null while the
 * equity is still under the period peak — no invented recovery dates.
 */
export const analyticsDrawdownPeriodSchema = z.object({
  id: z.string().min(1),
  peakDate: dateKeySchema,
  bottomDate: dateKeySchema,
  recoveredDate: dateKeySchema.nullable(),
  peakEquity: decimalStringSchema,
  bottomEquity: decimalStringSchema,
  drawdownMoney: decimalStringSchema.nullable(),
  drawdownR: decimalStringSchema,
  durationDays: z.number().int().min(0),
  recoveryDays: z.number().int().min(0).nullable(),
  recoveryTrades: z.number().int().min(0).nullable(),
  trades: z.array(
    z.object({
      id: uuidSchema,
      date: dateKeySchema,
      symbol: z.string(),
      r: decimalStringSchema,
    }),
  ),
});
export type AnalyticsDrawdownPeriod = z.infer<typeof analyticsDrawdownPeriodSchema>;

/** Risk exposure block (§10) — planned-vs-actual when the data allows it. */
export const analyticsRiskSchema = z.object({
  tradesWithRisk: z.number().int().min(0),
  avgRiskMoney: decimalStringSchema.nullable(),
  maxRiskMoney: decimalStringSchema.nullable(),
  minRiskMoney: decimalStringSchema.nullable(),
  /** Std of per-trade risk ÷ mean, in % — how consistent the sizing is. */
  riskDeviationPct: decimalStringSchema.nullable(),
  /** Daily / weekly / monthly risk budgets actually consumed (Σ risk/day). */
  maxDailyRisk: decimalStringSchema.nullable(),
  maxConcurrentPositions: z.number().int().min(0),
  /** plannedRR vs realized R on trades that carried a plan. */
  plannedVsRealized: z.array(
    z.object({
      bucket: z.string().min(1),
      trades: z.number().int().min(0),
      avgRealizedR: decimalStringSchema.nullable(),
    }),
  ),
});
export type AnalyticsRisk = z.infer<typeof analyticsRiskSchema>;

/** Per-strategy factual rows (§12) — NO overall ranking verdict. */
export const analyticsStrategyRowSchema = z.object({
  strategyId: z.string().nullable(),
  name: z.string().min(1),
  trades: z.number().int().min(0),
  winRate: decimalStringSchema.nullable(),
  profitFactor: decimalStringSchema.nullable(),
  expectancyR: decimalStringSchema.nullable(),
  netPnl: decimalStringSchema.nullable(),
  avgWinR: decimalStringSchema.nullable(),
  avgLossR: decimalStringSchema.nullable(),
  maxDrawdownR: decimalStringSchema,
  avgDurationMin: z.number().int().nullable(),
  followedPlanPct: decimalStringSchema.nullable(),
});
export type AnalyticsStrategyRow = z.infer<typeof analyticsStrategyRowSchema>;

/** Per-symbol / asset-class rows (§13). */
export const analyticsSymbolRowSchema = z.object({
  instrumentId: uuidSchema,
  symbol: z.string().min(1),
  assetClass: z.string().min(1),
  trades: z.number().int().min(0),
  winRate: decimalStringSchema.nullable(),
  profitFactor: decimalStringSchema.nullable(),
  netPnl: decimalStringSchema.nullable(),
  avgR: decimalStringSchema.nullable(),
});
export type AnalyticsSymbolRow = z.infer<typeof analyticsSymbolRowSchema>;

/** Direction comparison (§15). */
export const analyticsDirectionRowSchema = z.object({
  direction: directionSchema,
  trades: z.number().int().min(0),
  winRate: decimalStringSchema.nullable(),
  profitFactor: decimalStringSchema.nullable(),
  netPnl: decimalStringSchema.nullable(),
  expectancyR: decimalStringSchema.nullable(),
  avgDurationMin: z.number().int().nullable(),
});
export type AnalyticsDirectionRow = z.infer<typeof analyticsDirectionRowSchema>;

/** Psychology block (§19) — correlation wording lives in the UI, not here. */
export const analyticsPsychologySchema = z.object({
  emotionsBefore: z.array(analyticsBucketSchema),
  emotionsAfter: z.array(analyticsBucketSchema),
  confidenceBands: z.array(
    z.object({
      band: z.string().min(1),
      trades: z.number().int().min(0),
      winRate: decimalStringSchema.nullable(),
      avgR: decimalStringSchema.nullable(),
    }),
  ),
  tilt: z.array(tiltPointSchema),
});
export type AnalyticsPsychology = z.infer<typeof analyticsPsychologySchema>;

/** Trade-quality block (§16–§18): plan adherence + MAE/MFE where present. */
export const analyticsQualitySchema = z.object({
  planFollowed: z.object({
    followed: z.number().int().min(0),
    violated: z.number().int().min(0),
    unknown: z.number().int().min(0),
  }),
  /** MAE/MFE need intratrade excursions; absent → available=false (§34). */
  excursionAvailable: z.boolean(),
  mfe: z.object({
    avgR: decimalStringSchema.nullable(),
    medianR: decimalStringSchema.nullable(),
    /** avg |realized R| ÷ avg MFE R — exit efficiency, 0–1+. */
    capturePct: decimalStringSchema.nullable(),
  }),
  mae: z.object({
    avgR: decimalStringSchema.nullable(),
    medianR: decimalStringSchema.nullable(),
  }),
  /** Scatter: MFE vs realized + MAE vs realized (per trade). */
  scatter: z.array(
    z.object({
      id: uuidSchema,
      symbol: z.string(),
      mfeR: decimalStringSchema.nullable(),
      maeR: decimalStringSchema.nullable(),
      realizedR: decimalStringSchema,
    }),
  ),
  mfeHistogram: z.array(analyticsHistogramBinSchema),
  maeHistogram: z.array(analyticsHistogramBinSchema),
});
export type AnalyticsQuality = z.infer<typeof analyticsQualitySchema>;

/** Mistakes & rules block (§20) — ledger recomputed on the FILTERED set. */
export const analyticsMistakesSchema = z.object({
  entries: z.array(mistakeLedgerEntrySchema),
  violatingTrades: z.number().int().min(0),
  totalR: decimalStringSchema,
});
export type AnalyticsMistakes = z.infer<typeof analyticsMistakesSchema>;

/** Economic-event context (§21) — only where calendar coverage exists. */
export const analyticsEventsSchema = z.object({
  /** Calendar data only covers its rolling window — honesty first (§34). */
  calendarCoverage: z.object({
    from: dateKeySchema.nullable(),
    to: dateKeySchema.nullable(),
    classifiedTrades: z.number().int().min(0),
    unclassifiedTrades: z.number().int().min(0),
  }),
  phases: z.array(analyticsBucketSchema),
  byImpact: z.array(analyticsBucketSchema),
});
export type AnalyticsEvents = z.infer<typeof analyticsEventsSchema>;

/** Advanced statistics block (§24) with the full distribution profile. */
export const analyticsAdvancedSchema = z.object({
  r: z.object({
    mean: decimalStringSchema.nullable(),
    median: decimalStringSchema.nullable(),
    stddev: decimalStringSchema.nullable(),
    variance: decimalStringSchema.nullable(),
    skewness: decimalStringSchema.nullable(),
    kurtosis: decimalStringSchema.nullable(),
    p05: decimalStringSchema.nullable(),
    p25: decimalStringSchema.nullable(),
    p75: decimalStringSchema.nullable(),
    p95: decimalStringSchema.nullable(),
  }),
  /** Consecutive win/loss streak profile. */
  streaks: z.object({
    longestWin: z.number().int().min(0),
    longestLoss: z.number().int().min(0),
    avgWin: decimalStringSchema.nullable(),
    avgLoss: decimalStringSchema.nullable(),
  }),
});
export type AnalyticsAdvanced = z.infer<typeof analyticsAdvancedSchema>;

/** Monte Carlo (§25) — SIMULATION, never a prediction; methodology noted. */
export const analyticsMonteCarloSchema = z.object({
  simulations: z.number().int().min(1),
  tradesPerRun: z.number().int().min(0),
  /** Percentile bands of the cumulative-R path, per trade index. */
  bands: z.array(
    z.object({
      index: z.number().int().min(0),
      p05: decimalStringSchema,
      p25: decimalStringSchema,
      p50: decimalStringSchema,
      p75: decimalStringSchema,
      p95: decimalStringSchema,
    }),
  ),
  finalR: z.object({ p05: decimalStringSchema, p50: decimalStringSchema, p95: decimalStringSchema }),
  maxDrawdownR: z.object({ p50: decimalStringSchema, p95: decimalStringSchema, worst: decimalStringSchema }),
  methodology: z.string(),
});
export type AnalyticsMonteCarlo = z.infer<typeof analyticsMonteCarloSchema>;

/** Report rollups (§26) — daily / weekly / monthly aggregates. */
export const analyticsReportRowSchema = z.object({
  key: z.string().min(1),
  trades: z.number().int().min(0),
  netPnl: decimalStringSchema.nullable(),
  r: decimalStringSchema,
  winRate: decimalStringSchema.nullable(),
});
export type AnalyticsReportRow = z.infer<typeof analyticsReportRowSchema>;

export const analyticsSuiteResponseSchema = z.object({
  meta: analyticsDatasetMetaSchema,
  currency: currencySchema,
  summary: analyticsSummarySchema,
  equity: z.array(analyticsEquityPointSchema),
  cumulativeR: z.array(analyticsRPointSchema),
  rolling: z.array(analyticsRollingPointSchema),
  dailyPnl: z.array(analyticsDailyPointSchema),
  rHistogram: z.array(analyticsHistogramBinSchema),
  pnlHistogram: z.array(analyticsHistogramBinSchema),
  durationHistogram: z.array(analyticsHistogramBinSchema),
  drawdowns: z.array(analyticsDrawdownPeriodSchema),
  risk: analyticsRiskSchema,
  strategies: z.array(analyticsStrategyRowSchema),
  symbols: z.array(analyticsSymbolRowSchema),
  assetClasses: z.array(analyticsSymbolRowSchema),
  directions: z.array(analyticsDirectionRowSchema),
  sessions: z.array(analyticsBucketSchema),
  hours: z.array(analyticsBucketSchema),
  weekdays: z.array(analyticsBucketSchema),
  heatmap: z.array(heatmapCellSchema),
  psychology: analyticsPsychologySchema,
  quality: analyticsQualitySchema,
  mistakes: analyticsMistakesSchema,
  events: analyticsEventsSchema,
  advanced: analyticsAdvancedSchema,
  monteCarlo: analyticsMonteCarloSchema,
  reports: z.object({
    daily: z.array(analyticsReportRowSchema),
    weekly: z.array(analyticsReportRowSchema),
    monthly: z.array(analyticsReportRowSchema),
  }),
});
export type AnalyticsSuiteResponse = z.infer<typeof analyticsSuiteResponseSchema>;
