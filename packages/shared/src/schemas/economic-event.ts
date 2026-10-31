import { z } from "zod";
import { dateKeySchema, isoDateTimeSchema } from "./primitives";

/**
 * Economic calendar - macro events (rate decisions, inflation prints,
 * employment data…) that a disciplined trader plans the week around.
 * Times travel as UTC ISO; the client renders them in the user timezone.
 * `actual` is filled once the figure is released (null = upcoming).
 */

export const eventImpactSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type EventImpact = z.infer<typeof eventImpactSchema>;

export const economicEventSchema = z.object({
  /** Deterministic id (weekKey + slug) - stable across refetches. */
  id: z.string().min(1),
  /** UTC ISO-8601 with Z suffix (primitives contract). */
  dateTime: isoDateTimeSchema,
  /** ISO currency code of the impacted economy (USD, EUR…). */
  currency: z.string().length(3),
  title: z.string().min(1),
  impact: eventImpactSchema,
  /** Released value ("0.3%", "261k") - null until published. */
  actual: z.string().nullable(),
  forecast: z.string().nullable(),
  previous: z.string().nullable(),
});

export type EconomicEvent = z.infer<typeof economicEventSchema>;

/** GET /calendar/economic?week=YYYY-MM-DD - one trading week of events. */
export const economicCalendarResponseSchema = z.object({
  /** Monday of the requested week (trading-date key, user timezone). */
  weekStart: dateKeySchema,
  weekEnd: dateKeySchema,
  events: z.array(economicEventSchema),
});

export type EconomicCalendarResponse = z.infer<typeof economicCalendarResponseSchema>;
