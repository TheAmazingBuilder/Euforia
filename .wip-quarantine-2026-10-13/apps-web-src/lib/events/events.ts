/**
 * Events module — pure domain layer (no React, no DOM).
 *
 * The calendar is a frontend-only module reproduced from the product spec:
 * month grid, mini-month navigator, color-coded calendar lists as filters.
 * All date math is LOCAL (no server round-trip), seeded with the demo month
 * (October 2026) exactly as specified. Colors never hardcode hex in TS —
 * they reference the design-system CSS variables declared in globals.css
 * (Academy category hues), so both themes stay readable.
 */

export type EventColor =
  | "blue"
  | "teal"
  | "green"
  | "yellow"
  | "orange"
  | "pink";

export type CalendarList = {
  id: string;
  /** EN display copy — seed data convention (server-data strings stay EN). */
  name: string;
  /** Which section of the rail owns the list. */
  section: "mine" | "other";
  /** CSS color for the list dot (var() reference, never raw hex). */
  dotColor: string;
};

export type EventItem = {
  id: string;
  title: string;
  /** Calendar date key — "YYYY-MM-DD", compared as a plain string. */
  date: string;
  /** 24h "HH:MM" or null for untimed (all-day style) events. */
  time: string | null;
  color: EventColor;
  listId: string;
};

/** A {year, month} pair — month is 0-indexed (Date convention). */
export type YearMonth = { year: number; month: number };

/* ------------------------------------------------------------------ */
/* Color tokens — var() references only (hard rule: no hex outside     */
/* globals.css). Backgrounds are mixed against transparency so both    */
/* themes keep contrast.                                               */
/* ------------------------------------------------------------------ */

/** Pill foreground/background per event color. */
export const EVENT_PILL_COLOR: Record<
  EventColor,
  { fg: string; bg: string }
> = {
  blue: {
    fg: "var(--cat-ta)",
    bg: "color-mix(in srgb, var(--cat-ta) 16%, transparent)",
  },
  teal: {
    fg: "var(--cat-mgmt)",
    bg: "color-mix(in srgb, var(--cat-mgmt) 16%, transparent)",
  },
  green: {
    fg: "var(--cat-indicators)",
    bg: "color-mix(in srgb, var(--cat-indicators) 18%, transparent)",
  },
  yellow: {
    fg: "var(--cat-fund)",
    bg: "color-mix(in srgb, var(--cat-fund) 18%, transparent)",
  },
  orange: {
    fg: "var(--cat-candles)",
    bg: "color-mix(in srgb, var(--cat-candles) 18%, transparent)",
  },
  pink: {
    fg: "var(--cat-strategies)",
    bg: "color-mix(in srgb, var(--cat-strategies) 18%, transparent)",
  },
};

/** Reverse lookup — pick the event color matching a list dot (var() string). */
export const EVENT_COLOR_BY_VAR: Record<string, EventColor> = Object.fromEntries(
  (Object.entries(EVENT_PILL_COLOR) as [EventColor, { fg: string }][]).map(
    ([color, value]) => [value.fg, color],
  ),
) as Record<string, EventColor>;

/** Event color for a calendar list — used when creating events from the UI. */
export function colorFromList(dotColor: string): EventColor {
  return EVENT_COLOR_BY_VAR[dotColor] ?? "blue";
}

/** Session-unique id for a freshly created event (in-memory state only). */
export function nextEventId(): string {
  return `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Choices offered by the "New Calendar" popover (dot colors). */
export const NEW_LIST_COLOR_CHOICES: EventColor[] = [
  "blue",
  "teal",
  "green",
  "yellow",
  "orange",
  "pink",
];

/* ------------------------------------------------------------------ */
/* Seed — demo month: October 2026, verbatim from the module spec.     */
/* ------------------------------------------------------------------ */

export const SEED_LISTS: CalendarList[] = [
  { id: "personal", name: "Personal", section: "mine", dotColor: "var(--cat-mgmt)" },
  { id: "work", name: "Work", section: "mine", dotColor: "var(--cat-ta)" },
  { id: "family", name: "Family", section: "mine", dotColor: "var(--cat-pa)" },
  { id: "travel", name: "Travel", section: "other", dotColor: "var(--cat-patterns)" },
  { id: "reminders", name: "Reminders", section: "other", dotColor: "var(--cat-candles)" },
  { id: "deadlines", name: "Deadlines", section: "other", dotColor: "var(--cat-risk)" },
];

const OCT = "2026-10-";

export const SEED_EVENTS: EventItem[] = [
  { id: "ev-01", title: "Team Standup", date: `${OCT}01`, time: "09:00", color: "blue", listId: "work" },
  { id: "ev-02", title: "Gym Session", date: `${OCT}02`, time: "07:00", color: "teal", listId: "personal" },
  { id: "ev-03", title: "Sprint Planning", date: `${OCT}03`, time: "10:00", color: "blue", listId: "work" },
  { id: "ev-04", title: "Pay Rent", date: `${OCT}04`, time: null, color: "orange", listId: "deadlines" },
  { id: "ev-05", title: "Flight to Berlin", date: `${OCT}05`, time: "14:20", color: "teal", listId: "travel" },
  { id: "ev-06", title: "City Marathon", date: `${OCT}06`, time: null, color: "yellow", listId: "reminders" },
  { id: "ev-07", title: "Design Review", date: `${OCT}08`, time: "13:00", color: "blue", listId: "work" },
  { id: "ev-08", title: "Dentist", date: `${OCT}08`, time: "16:30", color: "green", listId: "personal" },
  { id: "ev-09", title: "Mom's Birthday", date: `${OCT}10`, time: null, color: "pink", listId: "family" },
  { id: "ev-10", title: "1:1 with Sam", date: `${OCT}11`, time: "11:00", color: "blue", listId: "work" },
  { id: "ev-11", title: "Water Plants", date: `${OCT}13`, time: null, color: "yellow", listId: "reminders" },
  { id: "ev-12", title: "Book Club", date: `${OCT}14`, time: "18:00", color: "green", listId: "personal" },
  { id: "ev-13", title: "Release v2.4", date: `${OCT}15`, time: null, color: "blue", listId: "work" },
  { id: "ev-14", title: "Hotel Check-in", date: `${OCT}16`, time: "15:00", color: "teal", listId: "travel" },
  { id: "ev-15", title: "Retrospective", date: `${OCT}18`, time: "15:00", color: "blue", listId: "work" },
  { id: "ev-16", title: "Haircut", date: `${OCT}20`, time: "12:00", color: "green", listId: "personal" },
  { id: "ev-17", title: "Jon's Birthday", date: `${OCT}21`, time: null, color: "pink", listId: "family" },
  { id: "ev-18", title: "Client Demo", date: `${OCT}22`, time: "10:30", color: "blue", listId: "work" },
  { id: "ev-19", title: "Send Invoices", date: `${OCT}22`, time: null, color: "orange", listId: "deadlines" },
  { id: "ev-20", title: "Summer Festival", date: `${OCT}24`, time: null, color: "yellow", listId: "reminders" },
  { id: "ev-21", title: "Renew Passport", date: `${OCT}25`, time: null, color: "orange", listId: "deadlines" },
  { id: "ev-22", title: "Yoga Class", date: `${OCT}27`, time: "09:00", color: "green", listId: "personal" },
  { id: "ev-23", title: "Roadmap Sync", date: `${OCT}29`, time: "09:30", color: "blue", listId: "work" },
  { id: "ev-24", title: "Road Trip", date: `${OCT}31`, time: null, color: "teal", listId: "travel" },
];

/** The demo month the seed data lives in — shown in the module docs. */
export const SEED_MONTH: YearMonth = { year: 2026, month: 9 };

/* ------------------------------------------------------------------ */
/* Date helpers — local-time arithmetic, YYYY-MM-DD string keys.       */
/* ------------------------------------------------------------------ */

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Local Date → "YYYY-MM-DD" key. */
export function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Today as a "YYYY-MM-DD" key (local timezone). */
export function todayDateKey(): string {
  return dateKeyOf(new Date());
}

/** "YYYY-MM-DD" → local Date anchored at midday (immune to DST shifts). */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** YearMonth → "YYYY-MM-DD" key for a given day. */
export function keyOf({ year, month }: YearMonth, day: number): string {
  return dateKeyOf(new Date(year, month, day));
}

/**
 * The 42 date keys of a month grid: 6 weeks, weeks starting on Sunday,
 * leading and trailing days from the adjacent months included.
 */
export function monthGridKeys({ year, month }: YearMonth): string[] {
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const start = new Date(year, month, 1 - firstWeekday);
  const keys: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    keys.push(dateKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }
  return keys;
}

/** Month title in EN, e.g. "October 2026". */
export function monthTitle({ year, month }: YearMonth): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(year, month, 1),
  );
}

/** Weekday labels for the grid header, Sunday-first: ["Sun", …, "Sat"]. */
export function weekdayLabels(): string[] {
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  // 2026-10-04 is a Sunday — a stable anchor independent from "today".
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 9, 4 + i)));
}

/** Two-letter weekday labels for the mini month: ["Su", "Mo", …, "Sa"]. */
export function miniWeekdayLabels(): string[] {
  return weekdayLabels().map((label) => label.slice(0, 2));
}

/** Previous / next month arithmetic (handles year rollover). */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Long date for dialogs, e.g. "Friday, October 2, 2026". */
export function longDate(key: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dateFromKey(key));
}

/** Day-of-month number from a key. */
export function dayNumberOf(key: string): number {
  return dateFromKey(key).getDate();
}

/* ------------------------------------------------------------------ */
/* Event queries                                                       */
/* ------------------------------------------------------------------ */

/** Events of one day, timed first (by time), untimed after — the seed order. */
export function eventsForDay(events: EventItem[], key: string): EventItem[] {
  return events
    .filter((event) => event.date === key)
    .sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
}

/** Events visible under a set of enabled list ids. */
export function filterByLists(events: EventItem[], enabled: ReadonlySet<string>): EventItem[] {
  return events.filter((event) => enabled.has(event.listId));
}

/** Maximum events rendered in a day cell before the "+N more" fallback. */
export const MAX_EVENTS_PER_CELL = 3;
