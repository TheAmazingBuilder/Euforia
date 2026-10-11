import { z } from "zod";
import {
  currencySchema,
  directionSchema,
  ruleTypeSchema,
} from "../enums";
import {
  decimalStringSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives";
import { timeframeSchema } from "./settings";
import { marketBiasSchema } from "./sessionLive";

/**
 * Trade Planner module — planned trades as first-class entities, distinct
 * from executed trades (Trade). Cosmoz plans, calculates and validates;
 * execution stays external. A plan never places orders.
 *
 * Reuse map (nothing duplicated):
 * - direction: directionSchema (BUY/SELL) — same enum as Trade
 * - timeframe: timeframeSchema — same enum as trading preferences
 * - marketBias: marketBiasSchema — same enum as Session Live / SavedAnalysis
 * - strategy/setup links: playbook domain remains canonical
 * - risk math: server recomputes with computeRR / suggestPositionSize from
 *   utils/risk.ts — the SAME canonical engine the trade form uses
 * - checklist source: ChecklistTemplate (global + per-strategy) is composed
 *   INTO the plan checklist at creation; templates stay untouched
 */

// ── Enums ────────────────────────────────────────────────────────────────────

/** Plan lifecycle (spec §7). EXECUTED means "executed externally" — the
 *  user flips it manually; Cosmoz never trades. */
export const tradePlanStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "EXECUTED",
  "CANCELLED",
  "EXPIRED",
]);
export type TradePlanStatus = z.infer<typeof tradePlanStatusSchema>;

export const planChecklistCategorySchema = z.enum([
  "MARKET_CONTEXT",
  "SETUP",
  "RISK",
  "NEWS_SESSION",
  "DISCIPLINE",
]);
export type PlanChecklistCategory = z.infer<typeof planChecklistCategorySchema>;

/** AUTO items are evaluated by the server from plan data (objective checks);
 *  MANUAL items are self-reported trader confirmations (spec §45). */
export const planChecklistItemKindSchema = z.enum(["MANUAL", "AUTO"]);
export type PlanChecklistItemKind = z.infer<typeof planChecklistItemKindSchema>;

export const planChecklistItemStateSchema = z.enum([
  "UNCHECKED",
  "CHECKED",
  "PASSED",
  "FAILED",
  "NOT_APPLICABLE",
]);
export type PlanChecklistItemState = z.infer<typeof planChecklistItemStateSchema>;

export const planReadinessStatusSchema = z.enum(["NOT_READY", "READY", "BLOCKED"]);
export type PlanReadinessStatus = z.infer<typeof planReadinessStatusSchema>;

/** Risk limit states (spec §30) — never color-only, always paired with a
 *  textual chip in the UI. */
export const riskLimitStateSchema = z.enum([
  "WITHIN_LIMIT",
  "WARNING",
  "LIMIT_REACHED",
  "DATA_UNAVAILABLE",
]);
export type RiskLimitState = z.infer<typeof riskLimitStateSchema>;

// ── Checklist ────────────────────────────────────────────────────────────────

/**
 * One checklist row on a plan. `code` carries the stable semantic identity of
 * AUTO checks (blocker codes read through the dictionary); `detail` carries
 * the last evaluation outcome code for AUTO items (also dict-mapped). Labels
 * for default items are server data, exactly like ChecklistTemplate items.
 */
export const planChecklistItemSchema = z.object({
  id: z.string().min(1).max(80),
  code: z.string().min(1).max(60).nullable(),
  category: planChecklistCategorySchema,
  label: z.string().min(1).max(200),
  kind: planChecklistItemKindSchema,
  required: z.boolean(),
  state: planChecklistItemStateSchema,
  /** Last AUTO evaluation outcome code (e.g. "RR_BELOW_MIN") — null for MANUAL. */
  detail: z.string().max(60).nullable(),
});
export type PlanChecklistItem = z.infer<typeof planChecklistItemSchema>;

/**
 * Readiness — the system must explain WHY (spec §47). `blockers` holds the
 * stable codes of failed required AUTO checks; messages live in dictionaries.
 */
export const planReadinessSchema = z.object({
  status: planReadinessStatusSchema,
  blockers: z.array(z.string().max(60)),
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  requiredCompleted: z.number().int().min(0),
  requiredTotal: z.number().int().min(0),
});
export type PlanReadiness = z.infer<typeof planReadinessSchema>;

// ── Entity ───────────────────────────────────────────────────────────────────

export const tradePlanSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  instrumentId: uuidSchema,
  direction: directionSchema,
  timeframe: timeframeSchema,
  marketBias: marketBiasSchema,
  /** Playbook link — the strategy/setup remain the canonical definitions. */
  strategyId: uuidSchema.nullable(),
  setupId: uuidSchema.nullable(),
  entryPrice: positiveDecimalStringSchema,
  stopLoss: positiveDecimalStringSchema.nullable(),
  takeProfit: positiveDecimalStringSchema.nullable(),
  /** Percent of account risked — config input, plain number. */
  riskPercent: z.number().min(0).max(100),
  // ── Server-computed risk fields (never accepted from clients) ────────────
  accountBalance: decimalStringSchema,
  riskAmount: decimalStringSchema.nullable(),
  positionSize: decimalStringSchema.nullable(),
  riskRewardRatio: z.number().nullable(),
  // ── Planning content ──────────────────────────────────────────────────────
  thesis: z.string().max(8000).nullable(),
  invalidation: z.string().max(2000).nullable(),
  notes: z.string().max(4000).nullable(),
  checklist: z.array(planChecklistItemSchema).max(40),
  readiness: planReadinessSchema,
  status: tradePlanStatusSchema,
  /** Future plan-vs-actual link (architecture prepared, not consumed in V1). */
  executedTradeId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  readyAt: isoDateTimeSchema.nullable(),
  executedAt: isoDateTimeSchema.nullable(),
});
export type TradePlan = z.infer<typeof tradePlanSchema>;

// ── Inputs ───────────────────────────────────────────────────────────────────

export const createTradePlanInputSchema = z
  .object({
    instrumentId: uuidSchema,
    direction: directionSchema,
    timeframe: timeframeSchema,
    marketBias: marketBiasSchema,
    strategyId: uuidSchema.nullable().optional(),
    setupId: uuidSchema.nullable().optional(),
    entryPrice: positiveDecimalStringSchema,
    stopLoss: positiveDecimalStringSchema.nullable().optional(),
    takeProfit: positiveDecimalStringSchema.nullable().optional(),
    riskPercent: z.number().min(0.01).max(100).optional(),
    thesis: z.string().max(8000).nullable().optional(),
    invalidation: z.string().max(2000).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((value) => value.setupId == null || value.strategyId != null, {
    message: "A setup requires its strategy",
    path: ["setupId"],
  });
export type CreateTradePlanInput = z.infer<typeof createTradePlanInputSchema>;

/** Manual checklist state patch — AUTO items are server-authoritative and
 *  ignore client-sent states. */
export const planChecklistStatePatchSchema = z.object({
  id: z.string().min(1).max(80),
  state: planChecklistItemStateSchema,
});
export type PlanChecklistStatePatch = z.infer<typeof planChecklistStatePatchSchema>;

export const updateTradePlanInputSchema = z
  .object({
    instrumentId: uuidSchema.optional(),
    direction: directionSchema.optional(),
    timeframe: timeframeSchema.optional(),
    marketBias: marketBiasSchema.optional(),
    strategyId: uuidSchema.nullable().optional(),
    setupId: uuidSchema.nullable().optional(),
    entryPrice: positiveDecimalStringSchema.optional(),
    stopLoss: positiveDecimalStringSchema.nullable().optional(),
    takeProfit: positiveDecimalStringSchema.nullable().optional(),
    riskPercent: z.number().min(0.01).max(100).optional(),
    thesis: z.string().max(8000).nullable().optional(),
    invalidation: z.string().max(2000).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    checklistStates: z.array(planChecklistStatePatchSchema).max(40).optional(),
    /** Explicit lifecycle transition — validated against the current status. */
    status: tradePlanStatusSchema.optional(),
    /** Executed-trade link — accepted ONLY together with a status → EXECUTED
     *  transition (the server rejects it in any other situation). */
    executedTradeId: uuidSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one plan field",
  });
export type UpdateTradePlanInput = z.infer<typeof updateTradePlanInputSchema>;

export const deleteTradePlanResponseSchema = z.object({ ok: z.literal(true) });
export type DeleteTradePlanResponse = z.infer<typeof deleteTradePlanResponseSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const tradePlansResponseSchema = z.object({
  plans: z.array(tradePlanSchema),
});
export type TradePlansResponse = z.infer<typeof tradePlansResponseSchema>;

export const tradePlanResponseSchema = z.object({ plan: tradePlanSchema });
export type TradePlanResponse = z.infer<typeof tradePlanResponseSchema>;

// ── Risk & Money Management summary (spec §22–§36) ──────────────────────────

/**
 * One row of the exposure tables. `kind` separates ACTUAL open positions
 * (risk committed at entry) from PLANNED risk (READY plans, not yet executed)
 * — the two are never summed silently (spec §26/§27).
 */
export const riskExposureRowSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["OPEN_POSITION", "READY_PLAN"]),
  symbol: z.string(),
  direction: directionSchema,
  status: z.string(),
  riskAmount: decimalStringSchema.nullable(),
  riskPct: z.number().nullable(),
  /** Strategy name for plans / instrument name for positions (display). */
  label: z.string().nullable(),
});
export type RiskExposureRow = z.infer<typeof riskExposureRowSchema>;

export const riskExposureBlockSchema = z.object({
  rows: z.array(riskExposureRowSchema),
  totalRiskAmount: decimalStringSchema,
  totalRiskPct: z.number(),
  count: z.number().int().min(0),
});
export type RiskExposureBlock = z.infer<typeof riskExposureBlockSchema>;

/**
 * GET /planner/risk — the ONE aggregate Risk & Money Management dataset.
 * Composes EXISTING engines (no new math): balance from the account,
 * daily risk budget from the discipline rulesStatus methodology, position
 * risk from Trade.riskAmount, planned risk from READY plans, drawdown from
 * the closed-trade equity curve.
 */
export const plannerRiskResponseSchema = z.object({
  currency: currencySchema,
  account: z.object({
    balance: decimalStringSchema,
    startingBalance: decimalStringSchema,
    equityPeak: decimalStringSchema.nullable(),
  }),
  /** The user's configured risk frame (Settings → Risk — read, never written here). */
  preferences: z.object({
    defaultRiskPct: z.number(),
    maxRiskPct: z.number(),
    dailyLossLimitPct: z.number(),
    maxOpenPositions: z.number().int().min(1),
  }),
  daily: z.object({
    date: z.string(),
    /** Risk committed today (Σ trade.riskAmount / balance × 100) — same
     *  methodology as /rules/status riskBudgetSpentPct. */
    riskBudgetSpentPct: z.number(),
    realizedPnl: decimalStringSchema,
    /** Today's realized LOSS as % of balance (0 when the day is green). */
    realizedLossPct: z.number(),
    lossLimitPct: z.number(),
    state: riskLimitStateSchema,
    tradesToday: z.number().int().min(0),
  }),
  openRisk: riskExposureBlockSchema,
  plannedRisk: riskExposureBlockSchema,
  drawdown: z.object({
    /** Negative when under the peak, 0 at/above it, null without data. */
    currentPct: z.number().nullable(),
    maxPct: z.number().nullable(),
    state: riskLimitStateSchema,
  }),
  meta: z.object({ generatedAt: isoDateTimeSchema }),
});
export type PlannerRiskResponse = z.infer<typeof plannerRiskResponseSchema>;

/** Re-exported so the client can label Rules Engine limits without its own copy. */
export const plannerRuleTypeSchema = ruleTypeSchema;
export type PlannerRuleType = z.infer<typeof plannerRuleTypeSchema>;
