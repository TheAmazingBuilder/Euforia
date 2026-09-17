import { z } from "zod";
import {
  currencySchema,
  directionSchema,
  emotionSchema,
  outcomeSchema,
  ruleTypeSchema,
  severitySchema,
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
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

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
});

export type StatsOverviewResponse = z.infer<typeof statsOverviewResponseSchema>;
