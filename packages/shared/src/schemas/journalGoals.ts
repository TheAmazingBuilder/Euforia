import { z } from "zod";

/**
 * JournalGoals — the writing cadence the trader commits to (Journal page).
 * Targets are per calendar period in the user's timezone; 0 disables a
 * period's bar (the honest "no target set" state).
 */

export const journalGoalsSchema = z.object({
  /** Entries per trading day (e.g. 1). */
  entriesPerDay: z.number().int().min(0).max(50),
  /** Entries per calendar month (e.g. 20). */
  entriesPerMonth: z.number().int().min(0).max(500),
  /** Entries per calendar year (e.g. 240). */
  entriesPerYear: z.number().int().min(0).max(5000),
});

export type JournalGoals = z.infer<typeof journalGoalsSchema>;

export const updateJournalGoalsInputSchema = journalGoalsSchema.partial();
export type UpdateJournalGoalsInput = z.input<typeof updateJournalGoalsInputSchema>;
