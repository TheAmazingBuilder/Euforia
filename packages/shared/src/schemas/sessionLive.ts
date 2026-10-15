import { z } from "zod";

import { emotionSchema } from "../enums";
import { marketIntervalSchema } from "./market";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Session Live domain — the trading-session lifecycle, saved analyses and
 * key levels (MASTER PROMPT §5–§8, §20, §41–§45, V1 roadmap Phases 1/5/6/11).
 *
 * Product rules encoded here:
 *  - A Trading Session DOCUMENTS activity; it never executes anything.
 *  - External events keep their source attribution ("Source: MT5").
 *  - Saved analyses are historical snapshots (bias, scenarios, levels,
 *    indicator/drawing configuration) — restore reloads the chart context.
 *  - Key levels are trader documentation; the chart overlay is opt-in.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

/** The trader's directional stance — interpretation, never market fact. */
export const marketBiasSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export type MarketBias = z.infer<typeof marketBiasSchema>;

/** Macro trading window the session runs in (documentation, not a gate). */
export const tradingWindowSchema = z.enum(["LONDON", "NEW_YORK", "ASIAN", "SYDNEY", "OTHER"]);
export type TradingWindow = z.infer<typeof tradingWindowSchema>;

/** Deliberately minimal lifecycle (§7: no unnecessary statuses). */
export const tradingSessionStatusSchema = z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]);
export type TradingSessionStatus = z.infer<typeof tradingSessionStatusSchema>;

/** Kinds of events a session timeline can carry (§6/Phase 6 minimum set). */
export const sessionLiveEventKindSchema = z.enum([
  "SESSION_STARTED",
  "SESSION_ENDED",
  "ANALYSIS_SAVED",
  "NOTE_ADDED",
  "TRADE_DETECTED",
  "POSITION_UPDATED",
  "LEVEL_ADDED",
  "BIAS_CHANGED",
]);
export type SessionLiveEventKind = z.infer<typeof sessionLiveEventKindSchema>;

// ── Session events ───────────────────────────────────────────────────────────

export const sessionLiveEventSchema = z.object({
  id: uuidSchema,
  at: isoDateTimeSchema,
  kind: sessionLiveEventKindSchema,
  label: z.string().max(200),
  detail: z.string().max(400).nullable(),
  /** Where an externally-originated event came from, e.g. "MT5", "Journal". */
  source: z.string().max(40).nullable(),
});
export type SessionLiveEvent = z.infer<typeof sessionLiveEventSchema>;

// ── Trading session ──────────────────────────────────────────────────────────

export const tradingSessionSchema = z.object({
  id: uuidSchema,
  status: tradingSessionStatusSchema,
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  primarySymbol: z.string().min(1),
  primaryTimeframe: marketIntervalSchema,
  tradingWindow: tradingWindowSchema,
  strategyId: uuidSchema.nullable(),
  setupId: uuidSchema.nullable(),
  marketBias: marketBiasSchema,
  sessionObjective: z.string().max(400).nullable(),
  notes: z.string().max(4000).nullable(),
  riskPerTradePct: z.number().min(0).max(100).nullable(),
  dailyRiskLimitPct: z.number().min(0).max(100).nullable(),
  /** Chronological (oldest first). */
  events: z.array(sessionLiveEventSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TradingSession = z.infer<typeof tradingSessionSchema>;

/** POST /session-live/sessions — every field optional (§6: never force). */
export const startSessionInputSchema = z.object({
  primarySymbol: z.string().max(20).optional(),
  primaryTimeframe: marketIntervalSchema.optional(),
  tradingWindow: tradingWindowSchema.optional(),
  strategyId: uuidSchema.nullable().optional(),
  setupId: uuidSchema.nullable().optional(),
  marketBias: marketBiasSchema.optional(),
  sessionObjective: z.string().max(400).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  riskPerTradePct: z.number().min(0).max(100).nullable().optional(),
  dailyRiskLimitPct: z.number().min(0).max(100).nullable().optional(),
});
export type StartSessionInput = z.infer<typeof startSessionInputSchema>;

/** PATCH /session-live/sessions/:id — bias / objective / notes while active. */
export const updateSessionInputSchema = z.object({
  marketBias: marketBiasSchema.optional(),
  sessionObjective: z.string().max(400).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

/** POST /session-live/sessions/:id/end */
export const endSessionInputSchema = z.object({
  notes: z.string().max(4000).nullable().optional(),
});
export type EndSessionInput = z.infer<typeof endSessionInputSchema>;

// ── Session summary (§43 — only metrics supported by real data) ─────────────

export const sessionSummarySchema = z.object({
  durationMinutes: z.number().int().min(0),
  /** Unique symbols traded during the session window. */
  markets: z.array(z.string()),
  tradeCount: z.number().int().min(0),
  /** Sum of realized P&L on trades closed in the window; null when none closed. */
  netPnl: z.number().nullable(),
  /** Mean R on closed trades with a computable risk amount; null otherwise. */
  avgR: z.number().nullable(),
  violationsCount: z.number().int().min(0),
  ecoEventsCount: z.number().int().min(0),
  notesCount: z.number().int().min(0),
  analysesCount: z.number().int().min(0),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

// ── Session timeline mood strip (additive seam closure) ─────────────────────

/**
 * One logged emotion on a session timeline mood strip — derived from the
 * journal Trade's psychology columns (emotionBefore / emotionAfter /
 * confidence), never fabricated. Shape mirrors the B5 `sessionMoodSchema`
 * (api.ts) with an ADDITIVE optional `confidence` so existing wire payloads
 * stay valid.
 */
export const sessionLiveMoodSchema = z.object({
  at: isoDateTimeSchema,
  emotion: emotionSchema,
  /** BEFORE = at entry; AFTER = in-trade / exit quick-log. */
  phase: z.enum(["BEFORE", "AFTER"]),
  tradeId: uuidSchema.nullable(),
  /** 1–5 when the trader logged it — absent on older payloads. */
  confidence: z.number().int().min(1).max(5).nullable().optional(),
});
export type SessionLiveMood = z.infer<typeof sessionLiveMoodSchema>;

// ── Key levels (§20 — trader documentation) ──────────────────────────────────

export const keyLevelKindSchema = z.enum([
  "SUPPORT",
  "RESISTANCE",
  "PREV_DAY_HIGH",
  "PREV_DAY_LOW",
  "SESSION_OPEN",
  "WEEKLY_HIGH",
  "WEEKLY_LOW",
  "ASIAN_HIGH",
  "ASIAN_LOW",
  "CUSTOM",
]);
export type KeyLevelKind = z.infer<typeof keyLevelKindSchema>;

export const keyLevelSchema = z.object({
  id: uuidSchema,
  symbol: z.string().min(1),
  kind: keyLevelKindSchema,
  price: z.number(),
  note: z.string().max(200).nullable(),
  createdAt: isoDateTimeSchema,
});
export type KeyLevel = z.infer<typeof keyLevelSchema>;

export const createKeyLevelInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  kind: keyLevelKindSchema,
  price: z.number(),
  note: z.string().max(200).nullable().optional(),
});
export type CreateKeyLevelInput = z.infer<typeof createKeyLevelInputSchema>;

export const updateKeyLevelInputSchema = z
  .object({
    kind: keyLevelKindSchema.optional(),
    price: z.number().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .refine((value) => value.kind !== undefined || value.price !== undefined || value.note !== undefined, {
    message: "Provide at least one level field",
  });
export type UpdateKeyLevelInput = z.infer<typeof updateKeyLevelInputSchema>;

// ── Chart configuration (indicators + drawings, restored by analyses) ────────

/** V1 indicator set (§16 — real calculations only, no fakes). */
export const indicatorKindSchema = z.enum(["EMA", "SMA", "VWAP", "BB", "RSI", "MACD", "ATR", "VOLUME"]);
export type IndicatorKind = z.infer<typeof indicatorKindSchema>;

export const indicatorParamsSchema = z.object({
  length: z.number().int().min(2).max(500).optional(),
  fast: z.number().int().min(2).max(200).optional(),
  slow: z.number().int().min(3).max(400).optional(),
  signal: z.number().int().min(2).max(200).optional(),
  stdDev: z.number().min(0.5).max(6).optional(),
});
export type IndicatorParams = z.infer<typeof indicatorParamsSchema>;

export const indicatorConfigSchema = z.object({
  id: z.string().min(1).max(64),
  kind: indicatorKindSchema,
  visible: z.boolean().default(true),
  params: indicatorParamsSchema.optional(),
});
export type IndicatorConfig = z.infer<typeof indicatorConfigSchema>;

/** Drawing anchor — bucket-open time (ms) + price. Max 2 points per object. */
export const drawingPointSchema = z.object({ t: z.number(), y: z.number() });
export type DrawingPoint = z.infer<typeof drawingPointSchema>;

export const drawingKindSchema = z.enum(["HLINE", "TREND", "RAY", "RECT", "TEXT", "MEASURE", "FIB"]);
export type DrawingKind = z.infer<typeof drawingKindSchema>;

export const drawingObjectSchema = z.object({
  id: z.string().min(1).max(64),
  kind: drawingKindSchema,
  points: z.array(drawingPointSchema).min(1).max(2),
  text: z.string().max(200).nullable().optional(),
  createdAt: isoDateTimeSchema.optional(),
});
export type DrawingObject = z.infer<typeof drawingObjectSchema>;

// ── Saved analysis (§41–§42, Phase 11) ───────────────────────────────────────

export const savedAnalysisSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema.nullable(),
  symbol: z.string().min(1),
  timeframe: marketIntervalSchema,
  createdAt: isoDateTimeSchema,
  /** Objective context frozen at save time. */
  priceAtSave: z.number().nullable(),
  bias: marketBiasSchema,
  bullishScenario: z.string().max(2000).nullable(),
  bearishScenario: z.string().max(2000).nullable(),
  strategyId: uuidSchema.nullable(),
  setupId: uuidSchema.nullable(),
  notes: z.string().max(4000).nullable(),
  indicators: z.array(indicatorConfigSchema),
  drawings: z.array(drawingObjectSchema),
  /** Snapshot copied at save time (the live level list may drift afterwards). */
  levels: z.array(keyLevelSchema),
});
export type SavedAnalysis = z.infer<typeof savedAnalysisSchema>;

export const createSavedAnalysisInputSchema = z.object({
  sessionId: uuidSchema.nullable().optional(),
  symbol: z.string().min(1).max(20),
  timeframe: marketIntervalSchema,
  priceAtSave: z.number().nullable().optional(),
  bias: marketBiasSchema,
  bullishScenario: z.string().max(2000).nullable().optional(),
  bearishScenario: z.string().max(2000).nullable().optional(),
  strategyId: uuidSchema.nullable().optional(),
  setupId: uuidSchema.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  indicators: z.array(indicatorConfigSchema).max(12).optional(),
  drawings: z.array(drawingObjectSchema).max(100).optional(),
  levels: z.array(keyLevelSchema).max(50).optional(),
});
export type CreateSavedAnalysisInput = z.infer<typeof createSavedAnalysisInputSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

/** GET /session-live/sessions — active session + history (newest first). */
export const sessionLiveStateResponseSchema = z.object({
  active: tradingSessionSchema.nullable(),
  history: z.array(tradingSessionSchema),
});
export type SessionLiveStateResponse = z.infer<typeof sessionLiveStateResponseSchema>;

export const tradingSessionResponseSchema = z.object({ session: tradingSessionSchema });
export type TradingSessionResponse = z.infer<typeof tradingSessionResponseSchema>;

export const endSessionResponseSchema = z.object({
  session: tradingSessionSchema,
  summary: sessionSummarySchema,
});
export type EndSessionResponse = z.infer<typeof endSessionResponseSchema>;

export const savedAnalysesResponseSchema = z.object({ analyses: z.array(savedAnalysisSchema) });
export type SavedAnalysesResponse = z.infer<typeof savedAnalysesResponseSchema>;

export const savedAnalysisResponseSchema = z.object({ analysis: savedAnalysisSchema });
export type SavedAnalysisResponse = z.infer<typeof savedAnalysisResponseSchema>;

export const keyLevelsResponseSchema = z.object({ levels: z.array(keyLevelSchema) });
export type KeyLevelsResponse = z.infer<typeof keyLevelsResponseSchema>;

export const keyLevelResponseSchema = z.object({ level: keyLevelSchema });
export type KeyLevelResponse = z.infer<typeof keyLevelResponseSchema>;

export const deleteResponseSchema = z.object({ ok: z.boolean() });
export type DeleteResponse = z.infer<typeof deleteResponseSchema>;
