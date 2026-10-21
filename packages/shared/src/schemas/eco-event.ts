import { z } from "zod";
import { impactSchema } from "../enums";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * EcoEvent — economic-calendar entry (Priorité 3, feature 10). A scheduled
 * macro release that can move the instruments the trader plays (FX, gold,
 * indices). Times are ISO UTC; the UI renders them in the user timezone.
 * `actual` stays null until the release happens (mock: past events filled).
 */
export const ecoEventSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1),
  /** Currency most affected — ISO 4217 code (USD, EUR, GBP, CAD...). */
  currency: z.string().length(3),
  impact: impactSchema,
  scheduledAt: isoDateTimeSchema,
  /** Released value — null = not yet released. */
  actual: z.string().nullable(),
  forecast: z.string().nullable(),
  previous: z.string().nullable(),
});

export type EcoEvent = z.infer<typeof ecoEventSchema>;
