import { z } from "zod";

import { marketIntervalSchema } from "./market";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Replay domain - the first-class historical replay module (REPLAY MASTER
 * PROMPT). A ReplaySession plays a HISTORICAL market window candle by
 * candle while the trader records decisions, simulated trades and notes.
 *
 * Product rules encoded here (master prompt §2, §24, §31, §37):
 *  - A replay simulation is NOT a real trade. Nothing in this module can
 *    reach a broker - there is no execution path by construction.
 *  - Replay performance stays separate from real trading performance and
 *    is always labeled SIMULATED.
 *  - Replay market times are historical coordinates (epoch ms, like candle
 *    `t`), not wall-clock instants; bookkeeping fields (createdAt…) are
 *    ISO-8601 wall clock.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

/** Session lifecycle (§32) - deliberately minimal. */
export const replayStatusSchema = z.enum(["DRAFT", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]);
export type ReplayStatus = z.infer<typeof replayStatusSchema>;

/** Client playback state (§17) - coarse, checkpointed on pause/leave. */
export const replayPlaybackStateSchema = z.enum(["READY", "PLAYING", "PAUSED", "COMPLETED"]);
export type ReplayPlaybackState = z.infer<typeof replayPlaybackStateSchema>;

/** Trade direction - simulation vocabulary mirrors the journal (BUY/SELL). */
export const replayDirectionSchema = z.enum(["BUY", "SELL"]);
export type ReplayDirection = z.infer<typeof replayDirectionSchema>;

/** Decision kinds (§25) - the market-context → decision → outcome bridge. */
export const replayDecisionKindSchema = z.enum([
  "ENTER",
  "WAIT",
  "MOVE_STOP",
  "EXIT",
  "SKIP_SETUP",
]);
export type ReplayDecisionKind = z.infer<typeof replayDecisionKindSchema>;

// ── Configuration (§14) ──────────────────────────────────────────────────────

/**
 * What the trader selected before starting: the historical window, the
 * starting point inside it, and optional context. Times are ms epoch -
 * chart-space coordinates. No timezone control: the whole app renders
 * market time in UTC (Session Live convention) - a timezone field here
 * would be a fake control (§14: never create fake controls).
 */
export const replayConfigSchema = z.object({
  symbol: z.string().min(1).max(20),
  interval: marketIntervalSchema,
  /** Historical window bounds served by the dataset (bucket-open basis). */
  fromMs: z.number().int().positive(),
  toMs: z.number().int().positive(),
  /** Playhead position when the replay starts - inside the window. */
  startAtMs: z.number().int().positive(),
  strategyId: uuidSchema.nullable(),
  setupId: uuidSchema.nullable(),
  /** Optional account context - must belong to the owner (§36). */
  tradingAccountId: uuidSchema.nullable(),
  startingBalance: decimalStringSchema.nullable(),
  riskPerTradePct: z.number().min(0).max(100).nullable(),
});
export type ReplayConfig = z.infer<typeof replayConfigSchema>;

// ── Simulated trade (§23/§24) ────────────────────────────────────────────────

export const replayTradeSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  symbol: z.string().min(1).max(20),
  direction: replayDirectionSchema,
  entryPrice: decimalStringSchema,
  stopLoss: decimalStringSchema.nullable(),
  takeProfit: decimalStringSchema.nullable(),
  quantity: decimalStringSchema,
  /** Authoritative server-side computation (|entry − stop| × qty × contract). */
  riskAmount: decimalStringSchema.nullable(),
  note: z.string().max(1000).nullable(),
  /** Historical market time the position was opened at (replay clock). */
  openedAtMs: z.number().int().nonnegative(),
  /** Null while the simulation is still open. */
  closedAtMs: z.number().int().nonnegative().nullable(),
  exitPrice: decimalStringSchema.nullable(),
  /** Server-computed net simulated P&L (account currency). */
  pnl: decimalStringSchema.nullable(),
  /** Server-computed R multiple - null without a computable risk amount. */
  rMultiple: decimalStringSchema.nullable(),
});
export type ReplayTrade = z.infer<typeof replayTradeSchema>;

// ── Decision (§25) ───────────────────────────────────────────────────────────

export const replayDecisionSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  kind: replayDecisionKindSchema,
  atMs: z.number().int().nonnegative(),
  note: z.string().max(1000).nullable(),
  strategyId: uuidSchema.nullable(),
  setupId: uuidSchema.nullable(),
});
export type ReplayDecision = z.infer<typeof replayDecisionSchema>;

// ── Note (§28) ───────────────────────────────────────────────────────────────

export const replayNoteSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  atMs: z.number().int().nonnegative(),
  body: z.string().min(1).max(4000),
});
export type ReplayNote = z.infer<typeof replayNoteSchema>;

// ── Result (§30) - only metrics backed by real recorded data ─────────────────

export const replayResultSchema = z.object({
  /** Historical span actually replayed. */
  durationMs: z.number().int().nonnegative(),
  simulatedTrades: z.number().int().nonnegative(),
  closedTrades: z.number().int().nonnegative(),
  winningTrades: z.number().int().nonnegative(),
  losingTrades: z.number().int().nonnegative(),
  /** Win rate over CLOSED trades only (0-100); null without closed trades. */
  winRatePct: z.number().min(0).max(100).nullable(),
  netPnl: z.number().nullable(),
  /** Mean R over closed trades with a computable risk amount; else null. */
  avgR: z.number().nullable(),
  /** Max peak-to-trough of the simulated equity curve; null without data. */
  maxDrawdown: z.number().nullable(),
  /** Total planned risk of recorded trades (account currency); else null. */
  riskUsed: z.number().nullable(),
  decisionCount: z.number().int().nonnegative(),
  noteCount: z.number().int().nonnegative(),
});
export type ReplayResult = z.infer<typeof replayResultSchema>;

// ── Session ──────────────────────────────────────────────────────────────────

export const replaySessionSchema = z.object({
  id: uuidSchema,
  status: replayStatusSchema,
  config: replayConfigSchema,
  /** Resume checkpoint (§33) - persisted on pause/leave, never per tick. */
  currentMs: z.number().int().nonnegative(),
  /** Denormalized playback state for list cards and resume UX. */
  playbackState: replayPlaybackStateSchema,
  lastPlayedAt: isoDateTimeSchema.nullable(),
  /** List-view counters (children are fetched by the detail endpoint). */
  counts: z.object({
    trades: z.number().int().nonnegative(),
    decisions: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
  }),
  /** Present once the replay is COMPLETED (§30). */
  result: replayResultSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ReplaySession = z.infer<typeof replaySessionSchema>;

// ── Inputs ───────────────────────────────────────────────────────────────

/** Strictly positive price/quantity decimal string. */
function positiveDecimal() {
  return decimalStringSchema.refine((value) => Number(value) > 0, "Must be > 0");
}

/** POST /replay/sessions - the New Replay form (§14). */
export const createReplaySessionInputSchema = z
  .object({
    symbol: z.string().min(1).max(20),
    interval: marketIntervalSchema,
    fromMs: z.number().int().positive(),
    toMs: z.number().int().positive(),
    startAtMs: z.number().int().positive().optional(),
    strategyId: uuidSchema.nullable().optional(),
    setupId: uuidSchema.nullable().optional(),
    tradingAccountId: uuidSchema.nullable().optional(),
    startingBalance: decimalStringSchema.nullable().optional(),
    riskPerTradePct: z.number().min(0).max(100).nullable().optional(),
  })
  .refine((input) => input.toMs > input.fromMs, {
    message: "toMs must be after fromMs",
  })
  .refine(
    (input) => input.startAtMs === undefined || (input.startAtMs >= input.fromMs && input.startAtMs < input.toMs),
    { message: "startAtMs must sit inside the historical window" },
  )
  // Bound the dataset: a replay window is a working session, not a warehouse
  // query (§41 - do not make PostgreSQL a market-data warehouse accidentally).
  .refine((input) => input.toMs - input.fromMs <= 120 * 24 * 60 * 60 * 1000, {
    message: "Historical window is limited to 120 days",
  });
export type CreateReplaySessionInput = z.infer<typeof createReplaySessionInputSchema>;

/** PATCH /replay/sessions/:id - rename context while DRAFT/IN_PROGRESS. */
export const updateReplaySessionInputSchema = z.object({
  strategyId: uuidSchema.nullable().optional(),
  setupId: uuidSchema.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});
export type UpdateReplaySessionInput = z.infer<typeof updateReplaySessionInputSchema>;

/** POST /replay/sessions/:id/trades - open a simulated position. */
export const createReplayTradeInputSchema = z.object({
  direction: replayDirectionSchema,
  entryPrice: positiveDecimal(),
  stopLoss: decimalStringSchema.nullable().optional(),
  takeProfit: decimalStringSchema.nullable().optional(),
  quantity: positiveDecimal(),
  note: z.string().max(1000).nullable().optional(),
  /** Replay-clock entry time - clamped into the session window server-side. */
  openedAtMs: z.number().int().nonnegative().optional(),
});
export type CreateReplayTradeInput = z.infer<typeof createReplayTradeInputSchema>;

/** POST /replay/sessions/:id/trades/:tradeId/close - settle a simulation. */
export const closeReplayTradeInputSchema = z.object({
  exitPrice: decimalStringSchema.refine((value) => Number(value) !== 0, "Must be non-zero"),
  closedAtMs: z.number().int().nonnegative().optional(),
  note: z.string().max(1000).nullable().optional(),
});
export type CloseReplayTradeInput = z.infer<typeof closeReplayTradeInputSchema>;

/** POST /replay/sessions/:id/decisions - record a decision marker. */
export const createReplayDecisionInputSchema = z.object({
  kind: replayDecisionKindSchema,
  atMs: z.number().int().nonnegative().optional(),
  note: z.string().max(1000).nullable().optional(),
  strategyId: uuidSchema.nullable().optional(),
  setupId: uuidSchema.nullable().optional(),
});
export type CreateReplayDecisionInput = z.infer<typeof createReplayDecisionInputSchema>;

/** POST /replay/sessions/:id/notes - timestamped observation. */
export const createReplayNoteInputSchema = z.object({
  body: z.string().min(1).max(4000),
  atMs: z.number().int().nonnegative().optional(),
});
export type CreateReplayNoteInput = z.infer<typeof createReplayNoteInputSchema>;

/** POST /replay/sessions/:id/advance - persist the resume checkpoint (§51). */
export const advanceReplayInputSchema = z.object({
  currentMs: z.number().int().nonnegative(),
  playbackState: replayPlaybackStateSchema,
});
export type AdvanceReplayInput = z.infer<typeof advanceReplayInputSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const replaySessionsResponseSchema = z.object({
  sessions: z.array(replaySessionSchema),
});
export type ReplaySessionsResponse = z.infer<typeof replaySessionsResponseSchema>;

export const replaySessionResponseSchema = z.object({
  session: replaySessionSchema,
});
export type ReplaySessionResponse = z.infer<typeof replaySessionResponseSchema>;

/** GET /replay/sessions/:id - the workspace payload (session + children). */
export const replayDetailResponseSchema = z.object({
  session: replaySessionSchema,
  trades: z.array(replayTradeSchema),
  decisions: z.array(replayDecisionSchema),
  notes: z.array(replayNoteSchema),
});
export type ReplayDetailResponse = z.infer<typeof replayDetailResponseSchema>;

export const replayTradeResponseSchema = z.object({ trade: replayTradeSchema });
export type ReplayTradeResponse = z.infer<typeof replayTradeResponseSchema>;

export const replayDecisionResponseSchema = z.object({ decision: replayDecisionSchema });
export type ReplayDecisionResponse = z.infer<typeof replayDecisionResponseSchema>;

export const replayNoteResponseSchema = z.object({ note: replayNoteSchema });
export type ReplayNoteResponse = z.infer<typeof replayNoteResponseSchema>;

/** Overview metrics (§13) - backed by the user's real replay data only. */
export const replayOverviewResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  simulatedTrades: z.number().int().nonnegative(),
  /** Mean win rate across COMPLETED sessions with closed trades; else null. */
  avgWinRatePct: z.number().nullable(),
  /** Best completed session by net simulated P&L; null without data. */
  bestSessionId: uuidSchema.nullable(),
  bestSessionNetPnl: z.number().nullable(),
});
export type ReplayOverviewResponse = z.infer<typeof replayOverviewResponseSchema>;
