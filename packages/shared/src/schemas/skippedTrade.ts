import { z } from "zod";
import { directionSchema, outcomeSchema, skipReasonSchema } from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * SkippedTrade - data-model.md "Domaine 5" (Ghost Trades / Registre des Regrets).
 * Powers Discipline Saved (Σ|R| of would-have-lost) and Hesitation Cost
 * (Σ R of would-have-won). `strategyId: null` = skipped out-of-playbook setup.
 */
export const skippedTradeSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  instrumentId: uuidSchema,
  strategyId: uuidSchema.nullable(),
  /** What you would have traded; null = not recorded. */
  direction: directionSchema.nullable(),
  /** Moment of the observation (UTC). */
  seenAt: isoDateTimeSchema,
  reason: skipReasonSchema,
  /** Self-assessed hypothetical outcome. */
  outcomeGuess: outcomeSchema.nullable(),
  /** Estimated R if evaluated (signed). */
  hypotheticalR: decimalStringSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export type SkippedTrade = z.infer<typeof skippedTradeSchema>;
