import { z } from "zod";
import {
  currencySchema,
  directionSchema,
  emotionSchema,
  mistakeCategorySchema,
  outcomeSchema,
  ruleTypeSchema,
  severitySchema,
  tagCategorySchema,
  tradeStatusSchema,
} from "../enums";
import {
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";
import { tradeSchema, tradeEventSchema, detectedMistakeSummarySchema } from "./trade";
import { alertSchema } from "./alert";
import { skippedTradeSchema } from "./skippedTrade";
import { instrumentSchema } from "./instrument";
import { strategySchema } from "./strategy";
import { accountSchema } from "./account";
import { ruleSchema, ruleViolationViewSchema } from "./rule";
import { tagSchema } from "./tag";

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

export const tradesListResponseSchema = z.object({
  trades: z.array(tradeSchema),
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
  sparklines: kpiSparklinesSchema,
  /** Σ|R| saved by settled would-have-lost ghost trades + their count. */
  disciplineSaved: disciplineSavedSchema,
  /** Σ R missed by settled would-have-won ghost trades (Regret Registry). */
  hesitationCost: hesitationCostSchema,
  /** Last 30 days of fear-vs-discipline skip counts, zero-filled. */
  ghostTrend: z.array(ghostTrendPointSchema),
});

export type StatsOverviewResponse = z.infer<typeof statsOverviewResponseSchema>;
