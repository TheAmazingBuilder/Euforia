import { z } from "zod";
import {
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
} from "./primitives";
import { directionSchema, emotionSchema, gradeSchema, tradeStatusSchema } from "../enums";

/**
 * AI coach chat contract - Priorité 3, feature 11. The client builds a
 * compact DATA snapshot of the user's journal from the queries it already
 * holds, then posts it with the conversation. The server route composes the
 * system prompt around the snapshot and calls the LLM. Validated with the
 * same zod schemas on both sides (mirrors the backup contract).
 */

/** One recent closed trade, projected to coach-relevant fields only. */
export const coachTradeContextSchema = z.object({
  instrument: z.string().min(1),
  direction: directionSchema,
  entryAt: isoDateTimeSchema,
  status: tradeStatusSchema,
  strategy: z.string().nullable(),
  rMultiple: decimalStringSchema.nullable(),
  pnlNet: decimalStringSchema.nullable(),
  emotionBefore: emotionSchema.nullable(),
  followedPlan: z.boolean().nullable(),
  decisionGrade: gradeSchema.nullable(),
});

export type CoachTradeContext = z.infer<typeof coachTradeContextSchema>;

/**
 * The data snapshot attached to every chat request. Compact on purpose -
 * the whole context must stay small enough to inline in the LLM prompt.
 */
export const coachContextSchema = z.object({
  currency: z.string().min(1),
  /** ISO date (YYYY-MM-DD) of the newest trade in the snapshot. */
  dataAsOf: dateKeySchema.nullable(),
  totals: z.object({
    /** All journaled trades (any status). */
    trades: z.number().int().min(0),
    /** Trades with status CLOSED. */
    closedTrades: z.number().int().min(0),
    /** Ratio 0–1 over closed trades. */
    winRate: decimalStringSchema.nullable(),
    netPnl: decimalStringSchema,
    expectancy: decimalStringSchema,
    profitFactor: decimalStringSchema.nullable(),
    maxDrawdownPct: decimalStringSchema,
    /** Average Cosmoz discipline index (null when no data). */
    disciplineScore: decimalStringSchema.nullable(),
  }),
  strategies: z
    .object({
      name: z.string().min(1),
      trades: z.number().int().min(0),
      winRate: decimalStringSchema,
      avgR: decimalStringSchema,
      /** Average R over the strategy's last 20 closed trades (decay detector). */
      last20Expectancy: decimalStringSchema.nullable(),
      status: z.string().min(1),
    })
    .array()
    .max(10),
  /** Most expensive mistakes in the 30-day window, sorted by |R| desc. */
  topMistakes: z
    .object({
      label: z.string().min(1),
      category: z.string().min(1),
      count: z.number().int().min(0),
      rCost: decimalStringSchema,
    })
    .array()
    .max(6),
  /** Latest rule violations (already filtered to the 30-day window). */
  violations: z
    .object({
      ruleType: z.string().min(1),
      severity: z.string().min(1),
      occurredAt: isoDateTimeSchema,
    })
    .array()
    .max(8),
  /** emotionBefore distribution over closed trades, most frequent first. */
  emotions: z
    .object({
      emotion: emotionSchema,
      count: z.number().int().min(0),
    })
    .array()
    .max(6),
  /** The 14 most recent trades, newest first. */
  recentTrades: z.array(coachTradeContextSchema).max(14),
});

export type CoachContext = z.infer<typeof coachContextSchema>;

/** One turn of the conversation (system prompt is composed server-side). */
export const coachChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export type CoachChatMessage = z.infer<typeof coachChatMessageSchema>;

/** POST /api/coach/chat - request body. */
export const coachChatRequestSchema = z.object({
  /** Full visible conversation, oldest first (client caps the window). */
  messages: z.array(coachChatMessageSchema).min(1).max(16),
  context: coachContextSchema,
});

export type CoachChatRequest = z.infer<typeof coachChatRequestSchema>;

/** POST /api/coach/chat - response body. */
export const coachChatResponseSchema = z.object({
  reply: z.string().min(1),
});

export type CoachChatResponse = z.infer<typeof coachChatResponseSchema>;
