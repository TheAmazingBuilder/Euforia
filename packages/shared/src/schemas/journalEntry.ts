import { z } from "zod";
import { emotionSchema } from "../enums";
import { dateKeySchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * JournalEntry — one written record in the trader's log: the note, the
 * lesson, the honest observation. Distinct from trades (executions) and
 * DailyJournal (per-day physiology): this is the searchable written log.
 */

export const journalEntrySchema = z.object({
  id: uuidSchema,
  /** Trading-date key (user timezone) the entry belongs to. */
  date: dateKeySchema,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  /** Free-form annotations, lowercase canonical, max 6. */
  tags: z.array(z.string().min(1).max(24)).max(6),
  /** Optional pre-trade emotion context. */
  mood: emotionSchema.nullable(),
  /** Optional link to an execution (Phase 2 — trade-threaded entries). */
  relatedTradeId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const journalListResponseSchema = z.object({
  entries: z.array(journalEntrySchema),
  /** Total across the whole log (before filters) for the counter. */
  total: z.number().int().min(0),
});

export type JournalListResponse = z.infer<typeof journalListResponseSchema>;

export const createJournalEntryInputSchema = z.object({
  date: dateKeySchema,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
  mood: emotionSchema.nullable().default(null),
  relatedTradeId: uuidSchema.nullable().default(null),
});

export type CreateJournalEntryInput = z.input<typeof createJournalEntryInputSchema>;

export const updateJournalEntryInputSchema = z.object({
  date: dateKeySchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(6).optional(),
  mood: emotionSchema.nullable().optional(),
  /** Link / relink / unlink the entry to an execution (null = unlink). */
  relatedTradeId: uuidSchema.nullable().optional(),
});

export type UpdateJournalEntryInput = z.input<typeof updateJournalEntryInputSchema>;

/** Sort orders supported by GET /journal. */
export type JournalSort = "newest" | "oldest" | "title";

/** Query params accepted by GET /journal (search + filters + sort). */
export interface JournalQuery {
  /** Free-text search across title and body (case-insensitive). */
  q?: string;
  /** Exact tag match (case-insensitive). */
  tag?: string;
  /** Linkage filter: "true" = tied to a trade, "false" = free-standing. */
  linked?: string;
  /** Exact mood match (case-insensitive), e.g. "CALM". */
  mood?: string;
  /** Sort order — default "newest". */
  sort?: JournalSort;
}
