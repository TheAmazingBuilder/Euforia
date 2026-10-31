/**
 * Events - presentation helpers for the user-owned personal calendar.
 * Persisted types and validation are shared with the NestJS API.
 */
import type {
  PersonalCalendar,
  PersonalCalendarEvent,
  PersonalCalendarGroup,
  PersonalEventColor,
  PersonalEventsState,
} from "@cosmoz/shared";

export type EventColor = PersonalEventColor;
export type CalendarGroup = PersonalCalendarGroup;
export type EventsCalendar = PersonalCalendar;
export type CalEvent = PersonalCalendarEvent;
export type EventsState = PersonalEventsState;

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
