import { z } from "zod";
import { emotionSchema } from "../enums";
import { dateKeySchema, decimalStringSchema, uuidSchema } from "./primitives";
import { dailyJournalSchema } from "./dailyJournal";

/**
 * Journal API payloads - Phase 10. The daily journal itself lives in
 * dailyJournal.ts; this file adds the read models & endpoint contracts.
 * The "today" date is ALWAYS server-computed (never derived client-side).
 */

// ── Upsert ───────────────────────────────────────────────────────────────────

/**
 * PUT /journal/:date - create-or-replace the day's entry. All fields are
 * nullable so the editor can save partial entries (pre-market in the
 * morning, post-market review at night) without losing untouched columns.
 */
export const journalUpsertInputSchema = z.object({
  // ── Pre-market ──
  sleepHours: decimalStringSchema.nullable(),
  /** 1–5. */
  energy: z.number().int().min(1).max(5).nullable(),
  /** 1–5. */
  focus: z.number().int().min(1).max(5).nullable(),
  moodPre: emotionSchema.nullable(),
  /** Intentions, levels to watch, session plan. */
  planText: z.string().max(4000).nullable(),
  // ── Post-market ──
  moodPost: emotionSchema.nullable(),
  reviewText: z.string().max(8000).nullable(),
  lessons: z.string().max(4000).nullable(),
  /** Today's best/worst trade - must belong to that trading day (validated API-side). */
  bestTradeId: uuidSchema.nullable(),
  worstTradeId: uuidSchema.nullable(),
});

export type JournalUpsertInput = z.infer<typeof journalUpsertInputSchema>;

// ── Read models ──────────────────────────────────────────────────────────────

/** GET /journal/today - the server's trading date + today's entry (or null). */
export const journalTodayResponseSchema = z.object({
  date: dateKeySchema,
  journal: dailyJournalSchema.nullable(),
});

export type JournalTodayResponse = z.infer<typeof journalTodayResponseSchema>;

/**
 * One history row: the journal entry joined with SERVER-computed day
 * aggregates (trades, closed counts and signed day P&L for that trading
 * date). The client never aggregates (data-model.md §15).
 */
export const journalHistoryRowSchema = z.object({
  journal: dailyJournalSchema,
  trades: z.number().int().min(0),
  closed: z.number().int().min(0),
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  /** Signed sum of pnlNet over closed trades that day - "0" when none. */
  pnlNet: decimalStringSchema,
});

export type JournalHistoryRow = z.infer<typeof journalHistoryRowSchema>;

/** GET /journals - full history, newest first, capped API-side. */
export const journalsListResponseSchema = z.object({
  journals: z.array(journalHistoryRowSchema),
});

export type JournalsListResponse = z.infer<typeof journalsListResponseSchema>;

/**
 * GET /journal/:date/day - the day context the editor needs: the entry (or
 * null) + that day's closed trades (for the best/worst pickers), computed
 * server-side for the requested calendar date.
 */
export const journalDayResponseSchema = z.object({
  date: dateKeySchema,
  journal: dailyJournalSchema.nullable(),
  trades: z.array(
    z.object({
      id: uuidSchema,
      symbol: z.string(),
      direction: z.enum(["BUY", "SELL"]),
      status: z.enum(["PLANNED", "OPEN", "CLOSED", "CANCELLED"]),
      pnlNet: decimalStringSchema.nullable(),
      /** 0 = never revealed in this context - kept for tooltip hint only. */
      revealed: z.boolean(),
    }),
  ),
});

export type JournalDayResponse = z.infer<typeof journalDayResponseSchema>;
