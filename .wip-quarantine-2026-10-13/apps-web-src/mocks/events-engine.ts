import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventDeleteInput,
  CalendarEventUpdateInput,
  EventCalendar,
  EventCalendarCreateInput,
  EventCalendarDeleteInput,
  EventCalendarUpdateInput,
  EventsBoardResponse,
} from "@cosmoz/shared";

import {
  calendarEventCreateInputSchema,
  calendarEventDeleteInputSchema,
  calendarEventUpdateInputSchema,
  eventCalendarCreateInputSchema,
  eventCalendarDeleteInputSchema,
  eventCalendarUpdateInputSchema,
} from "@cosmoz/shared";
import { MockError } from "@/mocks/store";

/**
 * Events engine (mock backend) — the personal calendar. Calendars live in
 * three sidebar groups (MY / FAVORITES / OTHER) and own an identity ink;
 * events are timed pills or all-day/multi-day bars. Seeds generate dates
 * RELATIVE TO NOW (mirroring the reference month: standups, all-day bars,
 * birthdays, travel spans) so the grid is always alive. Per-session
 * in-memory state, Zod-validated at the handler edge.
 */

let calendarSeq = 0;
let eventSeq = 0;

type CalendarSeed = Omit<EventCalendar, "order">;

const CALENDAR_SEEDS: CalendarSeed[] = [
  { id: "cal-personal", name: "Personal", color: "green", group: "MY" },
  { id: "cal-work", name: "Work", color: "blue", group: "MY" },
  { id: "cal-family", name: "Family", color: "purple", group: "MY" },
  { id: "cal-travel", name: "Travel", color: "cyan", group: "OTHER" },
  { id: "cal-reminders", name: "Reminders", color: "orange", group: "OTHER" },
  { id: "cal-deadlines", name: "Deadlines", color: "red", group: "OTHER" },
];

let calendars: EventCalendar[] = CALENDAR_SEEDS.map((seed, index) => ({
  ...seed,
  order: index,
}));

// ── Relative date helpers ────────────────────────────────────────────────────

function atTime(dayOffset: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

/** Day boundary (local midnight) N days from today — for all-day spans. */
function startOfDay(dayOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfDay(dayOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

type EventSeed = Omit<CalendarEvent, "id">;

const EVENT_SEEDS: EventSeed[] = [
  // Today — the highlighted column
  { calendarId: "cal-personal", title: "Gym Session", start: atTime(0, 7, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-work", title: "Sprint Planning", start: atTime(0, 10, 0), end: null, allDay: false, location: null, notes: null },
  // Yesterday
  { calendarId: "cal-work", title: "Team Standup", start: atTime(-1, 9, 0), end: null, allDay: false, location: null, notes: null },
  // This week
  { calendarId: "cal-work", title: "Sprint Planning", start: atTime(1, 16, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-reminders", title: "Pay Rent", start: startOfDay(2), end: endOfDay(2), allDay: true, location: null, notes: null },
  { calendarId: "cal-travel", title: "Flight to Berlin", start: atTime(2, 14, 20), end: atTime(3, 9, 40), allDay: false, location: "TXL", notes: null },
  { calendarId: "cal-reminders", title: "City Marathon", start: startOfDay(3), end: endOfDay(3), allDay: true, location: null, notes: null },
  { calendarId: "cal-work", title: "1:1 with Sam", start: atTime(5, 11, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-reminders", title: "Water Plants", start: startOfDay(7), end: endOfDay(7), allDay: true, location: null, notes: null },
  { calendarId: "cal-family", title: "Book Club", start: atTime(8, 18, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-work", title: "Design Review", start: atTime(9, 13, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-personal", title: "Dentist", start: atTime(9, 16, 30), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-deadlines", title: "Release v2.4", start: startOfDay(10), end: endOfDay(10), allDay: true, location: null, notes: null },
  { calendarId: "cal-travel", title: "Hotel Check-in", start: atTime(12, 15, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-family", title: "Mom's Birthday", start: startOfDay(13), end: endOfDay(13), allDay: true, location: null, notes: null },
  { calendarId: "cal-work", title: "Retrospective", start: atTime(14, 15, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-personal", title: "Haircut", start: atTime(16, 12, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-family", title: "Jon's Birthday", start: startOfDay(17), end: endOfDay(17), allDay: true, location: null, notes: null },
  { calendarId: "cal-work", title: "Client Demo", start: atTime(18, 10, 30), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-reminders", title: "Send Invoices", start: startOfDay(18), end: endOfDay(18), allDay: true, location: null, notes: null },
  { calendarId: "cal-travel", title: "Summer Festival", start: startOfDay(20), end: endOfDay(22), allDay: true, location: null, notes: null },
  { calendarId: "cal-travel", title: "Renew Passport", start: atTime(21, 15, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-personal", title: "Yoga Class", start: atTime(23, 9, 0), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-work", title: "Roadmap Sync", start: atTime(25, 9, 30), end: null, allDay: false, location: null, notes: null },
  { calendarId: "cal-travel", title: "Road Trip", start: startOfDay(27), end: endOfDay(28), allDay: true, location: null, notes: null },
];

let events: CalendarEvent[] = EVENT_SEEDS.map((seed) => ({
  ...seed,
  id: `evt-${(eventSeq += 1)}`,
}));

// ── Lookups ──────────────────────────────────────────────────────────────────

function findCalendar(calendarId: string): EventCalendar {
  const calendar = calendars.find((candidate) => candidate.id === calendarId);
  if (!calendar) {
    throw new MockError(404, "Calendar not found");
  }
  return calendar;
}

function findEvent(eventId: string): CalendarEvent {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) {
    throw new MockError(404, "Event not found");
  }
  return event;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function eventsBoard(): EventsBoardResponse {
  return {
    calendars: [...calendars].sort(
      (a, b) => a.group.localeCompare(b.group) || a.order - b.order,
    ),
    events: [...events].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

// ── Calendar mutations ───────────────────────────────────────────────────────

export function createEventCalendar(input: unknown): EventCalendar {
  const data = eventCalendarCreateInputSchema.parse(input) as EventCalendarCreateInput;
  calendarSeq += 1;
  const calendar: EventCalendar = {
    id: `cal-custom-${calendarSeq}-${Date.now()}`,
    name: data.name,
    color: data.color,
    group: data.group,
    order: calendars.filter((candidate) => candidate.group === data.group).length,
  };
  calendars.push(calendar);
  return calendar;
}

export function updateEventCalendar(input: unknown): EventCalendar {
  const data = eventCalendarUpdateInputSchema.parse(input) as EventCalendarUpdateInput;
  const calendar = findCalendar(data.calendarId);
  if (data.name !== undefined) calendar.name = data.name;
  if (data.color !== undefined) calendar.color = data.color;
  if (data.group !== undefined && data.group !== calendar.group) {
    calendar.group = data.group;
    calendar.order = calendars.filter(
      (candidate) => candidate.group === data.group && candidate.id !== calendar.id,
    ).length;
  }
  return calendar;
}

export function deleteEventCalendar(input: unknown): { ok: boolean; removedEvents: number } {
  const data = eventCalendarDeleteInputSchema.parse(input) as EventCalendarDeleteInput;
  const calendar = findCalendar(data.calendarId);
  const removedEvents = events.filter((event) => event.calendarId === calendar.id).length;
  events = events.filter((event) => event.calendarId !== calendar.id);
  calendars = calendars.filter((candidate) => candidate.id !== calendar.id);
  return { ok: true, removedEvents };
}

// ── Event mutations ──────────────────────────────────────────────────────────

export function createCalendarEvent(input: unknown): CalendarEvent {
  const data = calendarEventCreateInputSchema.parse(input) as CalendarEventCreateInput;
  findCalendar(data.calendarId); // foreign-key realism
  eventSeq += 1;
  const event: CalendarEvent = {
    id: `evt-custom-${eventSeq}-${Date.now()}`,
    calendarId: data.calendarId,
    title: data.title,
    start: data.start,
    end: data.end ?? null,
    allDay: data.allDay ?? false,
    location: data.location ?? null,
    notes: data.notes ?? null,
  };
  events.push(event);
  return event;
}

export function updateCalendarEvent(input: unknown): CalendarEvent {
  const data = calendarEventUpdateInputSchema.parse(input) as CalendarEventUpdateInput;
  const event = findEvent(data.eventId);
  if (data.calendarId !== undefined) findCalendar(data.calendarId);
  if (data.calendarId !== undefined) event.calendarId = data.calendarId;
  if (data.title !== undefined) event.title = data.title;
  if (data.start !== undefined) event.start = data.start;
  if (data.end !== undefined) event.end = data.end;
  if (data.allDay !== undefined) event.allDay = data.allDay;
  if (data.location !== undefined) event.location = data.location;
  if (data.notes !== undefined) event.notes = data.notes;
  return event;
}

export function deleteCalendarEvent(input: unknown): { ok: boolean } {
  const data = calendarEventDeleteInputSchema.parse(input) as CalendarEventDeleteInput;
  const event = findEvent(data.eventId);
  events = events.filter((candidate) => candidate.id !== event.id);
  return { ok: true };
}
