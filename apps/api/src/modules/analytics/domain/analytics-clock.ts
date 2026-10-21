/**
 * Analytics trading-day clock (Phase 8 §7 — TIME RANGE MODEL).
 *
 * Pure date-key helpers. All aggregation windows are resolved SERVER-SIDE
 * against the USER's trading-day clock (the client never derives "today").
 * Date keys are `YYYY-MM-DD` in the user timezone; arithmetic on keys is
 * plain UTC calendar math on the key itself (keys are day labels, not
 * instants — no timezone ambiguity after resolution).
 *
 * The period presets and their fallbacks mirror the shared contract
 * (`analyticsPeriodSchema`) and the frontend reference semantics verbatim:
 * CUSTOM with absent/inverted bounds falls back to ALL, ALL uses sentinel
 * keys that the meta layer resolves back to real dataset bounds.
 */
import { tradingDateKey } from "../../trading/trade-aggregation.service";

export const ALL_FROM = "0000-01-01";
export const ALL_TO = "9999-12-31";

export type AnalyticsPeriod =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "THIS_YEAR"
  | "LAST_30"
  | "LAST_90"
  | "YTD"
  | "ALL"
  | "CUSTOM";

export interface PeriodFilters {
  period: AnalyticsPeriod;
  customFrom?: string | undefined;
  customTo?: string | undefined;
}

/** The user's current trading-day key (server clock → user timezone). */
export function todayKeyFor(timezone: string, now: Date = new Date()): string {
  return tradingDateKey(now, timezone);
}

/** Next/previous calendar-day key (UTC date arithmetic on YYYY-MM-DD). */
export function shiftDayKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar-day distance between two date keys. */
export function dayDiff(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * Resolve a named period preset into an inclusive [from, to] trading-date
 * window. Monday-first weeks; quarters start Jan/Apr/Jul/Oct; LAST_30/LAST_90
 * are inclusive 30/90-day windows ending today.
 */
export function resolvePeriodRange(filters: PeriodFilters, today: string): { from: string; to: string } {
  const parse = (key: string): Date => new Date(`${key}T00:00:00Z`);
  switch (filters.period) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const key = shiftDayKey(today, -1);
      return { from: key, to: key };
    }
    case "THIS_WEEK":
    case "LAST_WEEK": {
      // Monday-first week containing (today | today−7).
      const anchor = filters.period === "THIS_WEEK" ? today : shiftDayKey(today, -7);
      const weekday = parse(anchor).getUTCDay(); // 0 = Sunday
      const back = weekday === 0 ? 6 : weekday - 1;
      const monday = shiftDayKey(anchor, -back);
      return { from: monday, to: filters.period === "THIS_WEEK" ? today : shiftDayKey(monday, 6) };
    }
    case "THIS_MONTH": {
      const from = `${today.slice(0, 7)}-01`;
      return { from, to: today };
    }
    case "LAST_MONTH": {
      const firstOfThisMonth = `${today.slice(0, 7)}-01`;
      const lastOfPrev = shiftDayKey(firstOfThisMonth, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    case "THIS_QUARTER": {
      const month = Number(today.slice(5, 7)) - 1;
      const quarterMonth = Math.floor(month / 3) * 3 + 1;
      return {
        from: `${today.slice(0, 4)}-${String(quarterMonth).padStart(2, "0")}-01`,
        to: today,
      };
    }
    case "THIS_YEAR":
    case "YTD":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "LAST_30":
      return { from: shiftDayKey(today, -29), to: today };
    case "LAST_90":
      return { from: shiftDayKey(today, -89), to: today };
    case "CUSTOM":
      if (filters.customFrom && filters.customTo && filters.customFrom <= filters.customTo) {
        return { from: filters.customFrom, to: filters.customTo };
      }
      return { from: ALL_FROM, to: ALL_TO };
    case "ALL":
    default:
      return { from: ALL_FROM, to: ALL_TO };
  }
}

/** Monday-anchored week key of a trading date (the sparkline bucketing). */
export function weekStartKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = Sunday
  const backToMonday = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - backToMonday);
  return date.toISOString().slice(0, 10);
}

/** ISO-8601 week key ("2026-W03") of a trading date (the weekly report rollup). */
export function isoWeekOf(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
