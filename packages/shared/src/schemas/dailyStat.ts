import { z } from "zod";
import { emotionSchema } from "../enums";
import { dateKeySchema, decimalStringSchema, uuidSchema } from "./primitives";

/**
 * DailyStat - data-model.md "Domaine 8". CALCULATED by a nightly job
 * (never user-entered); fuel for heatmaps, pre-mortems, coach AI and goals.
 * Exception to "never store computed": avoids re-aggregating on every render.
 */
export const dailyStatSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  date: dateKeySchema,
  tradesCount: z.number().int().min(0),
  winsCount: z.number().int().min(0),
  lossesCount: z.number().int().min(0),
  pnlNet: decimalStringSchema,
  rEarned: decimalStringSchema,
  /** ⭐ Cosmoz Index: plan conformity, violations, checklist, regularity - decoupled from P&L. */
  disciplineScore: decimalStringSchema.nullable(),
  mistakesCount: z.number().int().min(0),
  violationsCount: z.number().int().min(0),
  ghostTradesCount: z.number().int().min(0),
  /** Discipline Saved - ghost trades that would have lost. */
  savedR: decimalStringSchema.nullable(),
  /** Hesitation Cost - ghost trades that would have won. */
  hesitatedR: decimalStringSchema.nullable(),
  /** Denormalized from DailyJournal for 1-query correlations. */
  sleepHours: decimalStringSchema.nullable(),
  moodPre: emotionSchema.nullable(),
});

export type DailyStat = z.infer<typeof dailyStatSchema>;
