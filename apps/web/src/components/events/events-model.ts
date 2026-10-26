/**
 * Events - data model for the trading calendar module (Academy section).
 * Calendars are grouped (My Calendars / Favorites / Other) and double as
 * the filter axis; events are pills on the month grid and can be dragged
 * between days with the cursor or a finger. The whole state persists 100%
 * locally - same local-by-design contract as Tasky.
 */

export type EventColor =
  | "blue"
  | "cyan"
  | "green"
  | "purple"
  | "teal"
  | "orange"
  | "red"
  | "pink"
  | "yellow";

export type CalendarGroup = "mine" | "favorites" | "other";

export type EventsCalendar = {
  id: string;
  name: string;
  color: EventColor;
  group: CalendarGroup;
  visible: boolean;
};

export type CalEvent = {
  id: string;
  title: string;
  calendarId: string;
  /** ISO date - the day cell the event sits on. */
  date: string;
  allDay: boolean;
  /** "HH:MM" - omitted for all-day events. */
  time?: string;
  favorite?: boolean;
};

/** Tailwind classes per color - dot (sidebar), pill (grid), checked box. */
export const EVENT_COLORS: Record<EventColor, { dot: string; pill: string; check: string }> = {
  blue: { dot: "bg-blue-500", pill: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/50", check: "bg-blue-500" },
  cyan: { dot: "bg-cyan-500", pill: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/50", check: "bg-cyan-500" },
  green: { dot: "bg-green-500", pill: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/50", check: "bg-green-500" },
  purple: { dot: "bg-purple-500", pill: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/50", check: "bg-purple-500" },
  teal: { dot: "bg-teal-500", pill: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/50", check: "bg-teal-500" },
  orange: { dot: "bg-orange-500", pill: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/50", check: "bg-orange-500" },
  red: { dot: "bg-red-500", pill: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/50", check: "bg-red-500" },
  pink: { dot: "bg-pink-500", pill: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/50", check: "bg-pink-500" },
  yellow: { dot: "bg-yellow-500", pill: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/50", check: "bg-yellow-500" },
};

export const COLOR_KEYS = Object.keys(EVENT_COLORS) as EventColor[];

export const GROUP_LABELS: Record<CalendarGroup, string> = {
  mine: "My Calendars",
  favorites: "Favorites",
  other: "Other",
};

export const GROUP_ORDER: CalendarGroup[] = ["mine", "favorites", "other"];

function seedCalendars(): EventsCalendar[] {
  return [
    { id: "personal", name: "Personal", color: "blue", group: "mine", visible: true },
    { id: "work", name: "Work", color: "cyan", group: "mine", visible: true },
    { id: "family", name: "Family", color: "purple", group: "mine", visible: false },
    { id: "health", name: "Health", color: "green", group: "favorites", visible: true },
    { id: "finance", name: "Finance", color: "yellow", group: "favorites", visible: true },
    { id: "travel", name: "Travel", color: "teal", group: "other", visible: true },
    { id: "reminders", name: "Reminders", color: "orange", group: "other", visible: true },
    { id: "deadlines", name: "Deadlines", color: "red", group: "other", visible: false },
  ];
}

/** October 2026 seed - mirrors the product reference day for day. */
function seedEvents(): CalEvent[] {
  return [
    { id: "e1", title: "Team Standup", calendarId: "work", date: "2026-10-01", allDay: false, time: "09:00" },
    { id: "e2", title: "Gym Session", calendarId: "health", date: "2026-10-02", allDay: false, time: "07:00" },
    { id: "e3", title: "Sprint Planning", calendarId: "work", date: "2026-10-03", allDay: false, time: "10:00" },
    { id: "e4", title: "Pay Rent", calendarId: "finance", date: "2026-10-04", allDay: true },
    { id: "e5", title: "Flight to Berlin", calendarId: "travel", date: "2026-10-05", allDay: false, time: "14:20" },
    { id: "e6", title: "City Marathon", calendarId: "reminders", date: "2026-10-06", allDay: true },
    { id: "e7", title: "Design Review", calendarId: "work", date: "2026-10-08", allDay: false, time: "13:00" },
    { id: "e8", title: "Dentist", calendarId: "health", date: "2026-10-08", allDay: false, time: "16:30" },
    { id: "e9", title: "Mom's Birthday", calendarId: "family", date: "2026-10-10", allDay: true, favorite: true },
    { id: "e10", title: "1:1 with Sam", calendarId: "work", date: "2026-10-11", allDay: false, time: "11:00" },
    { id: "e11", title: "Water Plants", calendarId: "reminders", date: "2026-10-13", allDay: true },
    { id: "e12", title: "Book Club", calendarId: "family", date: "2026-10-14", allDay: false, time: "18:00" },
    { id: "e13", title: "Release v2.4", calendarId: "work", date: "2026-10-15", allDay: true },
    { id: "e14", title: "Hotel Check-in", calendarId: "travel", date: "2026-10-16", allDay: false, time: "15:00" },
    { id: "e15", title: "Retrospective", calendarId: "work", date: "2026-10-18", allDay: false, time: "15:00" },
    { id: "e16", title: "Haircut", calendarId: "reminders", date: "2026-10-20", allDay: false, time: "12:00" },
    { id: "e17", title: "Jon's Birthday", calendarId: "family", date: "2026-10-21", allDay: true, favorite: true },
    { id: "e18", title: "Client Demo", calendarId: "work", date: "2026-10-22", allDay: false, time: "10:30" },
    { id: "e19", title: "Send Invoices", calendarId: "deadlines", date: "2026-10-22", allDay: true },
    { id: "e20", title: "Summer Festival", calendarId: "family", date: "2026-10-24", allDay: true },
    { id: "e21", title: "Renew Passport", calendarId: "deadlines", date: "2026-10-25", allDay: true },
    { id: "e22", title: "Yoga Class", calendarId: "health", date: "2026-10-27", allDay: false, time: "09:00" },
    { id: "e23", title: "Roadmap Sync", calendarId: "work", date: "2026-10-29", allDay: false, time: "09:30" },
    { id: "e24", title: "Road Trip", calendarId: "travel", date: "2026-10-31", allDay: true },
  ];
}

export type EventsState = {
  calendars: EventsCalendar[];
  events: CalEvent[];
};

const STORAGE_KEY = "cosmoz.events.state.v1";

export function loadEventsState(): EventsState {
  if (typeof window === "undefined") {
    return { calendars: seedCalendars(), events: seedEvents() };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { calendars: seedCalendars(), events: seedEvents() };
    const parsed = JSON.parse(raw) as Partial<EventsState>;
    if (Array.isArray(parsed.calendars) && Array.isArray(parsed.events)) {
      return { calendars: parsed.calendars as EventsCalendar[], events: parsed.events as CalEvent[] };
    }
  } catch {
    // Corrupted snapshot - fall through to the seed.
  }
  return { calendars: seedCalendars(), events: seedEvents() };
}

export function saveEventsState(state: EventsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable - the calendar still works for the session.
  }
}

/* ── Date helpers ──────────────────────────────────────────────────────── */

export function isoOf(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateOf(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** 6-week month matrix (Sun-first), each cell ISO-dated with inMonth flag. */
export function monthMatrix(year: number, month: number): { iso: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ iso: isoOf(day), inMonth: day.getMonth() === month });
  }
  return cells;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function dayNum(iso: string): number {
  return dateOf(iso).getDate();
}

export function isToday(iso: string): boolean {
  return iso === isoOf(new Date());
}

export type SortMode = "time" | "title" | "calendar";

export const SORT_LABELS: Record<SortMode, string> = {
  time: "Sort by time",
  title: "Sort by title",
  calendar: "Sort by calendar",
};

/** Sorts a day's events per the active mode - stable, mutating nothing. */
export function sortEvents(
  events: CalEvent[],
  mode: SortMode,
  calendarName: (id: string) => string,
): CalEvent[] {
  const sorted = [...events];
  if (mode === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (mode === "calendar") {
    sorted.sort((a, b) => calendarName(a.calendarId).localeCompare(calendarName(b.calendarId)));
  } else {
    sorted.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? 1 : -1; // timed first
      const at = a.time ?? "";
      const bt = b.time ?? "";
      if (at !== bt) return at.localeCompare(bt);
      return a.title.localeCompare(b.title);
    });
  }
  return sorted;
}

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
