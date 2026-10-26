import { z } from "zod";
import { emotionSchema } from "../enums";
import { dateKeySchema, decimalStringSchema, uuidSchema } from "./primitives";

/**
 * DailyJournal - data-model.md "Domaine 6". One per (userId, date).
 * Pre-market columns are queryable (sleep, energy, focus, mood, plan) so the
 * analytics can correlate them with outcomes; post-market is free review.
 */
export const dailyJournalSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  /** User's local trading day (YYYY-MM-DD, timezone applied API-side). */
  date: dateKeySchema,
  // ── Pre-market ──
  sleepHours: decimalStringSchema.nullable(),
  /** 1–5. */
  energy: z.number().int().min(1).max(5).nullable(),
  /** 1–5. */
  focus: z.number().int().min(1).max(5).nullable(),
  moodPre: emotionSchema.nullable(),
  /** Intentions, levels to watch. */
  planText: z.string().nullable(),
  // ── Post-market ──
  moodPost: emotionSchema.nullable(),
  reviewText: z.string().nullable(),
  lessons: z.string().nullable(),
  bestTradeId: uuidSchema.nullable(),
  worstTradeId: uuidSchema.nullable(),
});

export type DailyJournal = z.infer<typeof dailyJournalSchema>;
