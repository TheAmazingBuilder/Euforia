import { z } from "zod";

/** User-owned calendar colors; economic events use a separate contract. */
export const personalEventColorSchema = z.enum([
  "blue",
  "cyan",
  "green",
  "purple",
  "teal",
  "orange",
  "red",
  "pink",
  "yellow",
]);
export type PersonalEventColor = z.infer<typeof personalEventColorSchema>;

export const personalCalendarGroupSchema = z.enum(["mine", "favorites", "other"]);
export type PersonalCalendarGroup = z.infer<typeof personalCalendarGroupSchema>;

export const personalCalendarSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(40),
  color: personalEventColorSchema,
  group: personalCalendarGroupSchema,
  visible: z.boolean(),
});
export type PersonalCalendar = z.infer<typeof personalCalendarSchema>;

export const personalCalendarEventSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(80),
    calendarId: z.string().trim().min(1).max(120),
    date: z.string().refine((value) => {
      const parsed = new Date(value + "T00:00:00.000Z");
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, "Expected a valid YYYY-MM-DD date."),
    allDay: z.boolean(),
    time: z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, "Expected HH:MM").optional(),
    favorite: z.boolean().optional(),
  })
  .refine((event) => event.allDay || event.time !== undefined, {
    message: "A timed event must have a time.",
    path: ["time"],
  });
export type PersonalCalendarEvent = z.infer<typeof personalCalendarEventSchema>;

/** One personal board per user; all references are validated before persistence. */
export const personalEventsStateSchema = z
  .object({
    calendars: z.array(personalCalendarSchema).max(40),
    events: z.array(personalCalendarEventSchema).max(2000),
  })
  .superRefine((state, context) => {
    const calendarIds = new Set<string>();
    for (const [index, calendar] of state.calendars.entries()) {
      if (calendarIds.has(calendar.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["calendars", index, "id"],
          message: "Calendar IDs must be unique.",
        });
      }
      calendarIds.add(calendar.id);
    }

    const eventIds = new Set<string>();
    for (const [index, event] of state.events.entries()) {
      if (eventIds.has(event.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "id"],
          message: "Event IDs must be unique.",
        });
      }
      eventIds.add(event.id);
      if (!calendarIds.has(event.calendarId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "calendarId"],
          message: "The event must belong to a calendar in this board.",
        });
      }
    }
  });
export type PersonalEventsState = z.infer<typeof personalEventsStateSchema>;

export type PersonalEventsBoardResponse = {
  state: PersonalEventsState | null;
  updatedAt?: string;
};

export type PersonalEventsBoardSaveResponse = {
  state: PersonalEventsState;
  updatedAt: string;
};
