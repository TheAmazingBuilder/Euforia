import { z } from "zod";

/**
 * Events contracts - the independent calendar module (Academy section).
 * A month-grid personal calendar: colored calendars grouped in the sidebar
 * (MY / FAVORITES / OTHER), timed events as pills and all-day/multi-day
 * events as full-width bars. The mock engine generates dates RELATIVE TO
 * NOW so the current month always carries live content.
 */

export const eventCalendarColorSchema = z.enum([
  "green",
  "blue",
  "purple",
  "cyan",
  "orange",
  "red",
  "amber",
  "rose",
  "indigo",
  "teal",
]);
export type EventCalendarColor = z.infer<typeof eventCalendarColorSchema>;

export const eventCalendarGroupSchema = z.enum(["MY", "FAVORITES", "OTHER"]);
export type EventCalendarGroup = z.infer<typeof eventCalendarGroupSchema>;

export type EventCalendar = {
  id: string;
  name: string;
  /** Identity ink - the client maps it to a semantic CSS var. */
  color: EventCalendarColor;
  group: EventCalendarGroup;
  /** Stable order inside its group. */
  order: number;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  /** ISO instant - start. */
  start: string;
  /** ISO instant - null for single-day events. */
  end: string | null;
  /** All-day bars render full-width without a clock prefix. */
  allDay: boolean;
  location: string | null;
  notes: string | null;
};

export type EventsBoardResponse = {
  calendars: EventCalendar[];
  events: CalendarEvent[];
};

export const eventCalendarCreateInputSchema = z.object({
  name: z.string().min(1).max(40),
  color: eventCalendarColorSchema,
  group: eventCalendarGroupSchema,
});
export type EventCalendarCreateInput = z.infer<typeof eventCalendarCreateInputSchema>;

/** Rename/recolor or move between groups (starring = FAVORITES). */
export const eventCalendarUpdateInputSchema = z.object({
  calendarId: z.string().min(1),
  name: z.string().min(1).max(40).optional(),
  color: eventCalendarColorSchema.optional(),
  group: eventCalendarGroupSchema.optional(),
});
export type EventCalendarUpdateInput = z.infer<typeof eventCalendarUpdateInputSchema>;

/** Removing a calendar cascades to its events (confirmed in the UI). */
export const eventCalendarDeleteInputSchema = z.object({
  calendarId: z.string().min(1),
});
export type EventCalendarDeleteInput = z.infer<typeof eventCalendarDeleteInputSchema>;

export const calendarEventCreateInputSchema = z.object({
  calendarId: z.string().min(1),
  title: z.string().min(1).max(120),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateInputSchema>;

export const calendarEventUpdateInputSchema = z.object({
  eventId: z.string().min(1),
  calendarId: z.string().min(1).optional(),
  title: z.string().min(1).max(120).optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CalendarEventUpdateInput = z.infer<typeof calendarEventUpdateInputSchema>;

export const calendarEventDeleteInputSchema = z.object({
  eventId: z.string().min(1),
});
export type CalendarEventDeleteInput = z.infer<typeof calendarEventDeleteInputSchema>;
