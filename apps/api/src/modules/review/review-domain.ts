/**
 * Goal/review domain helpers (B8) - metric shapes, calendar period
 * resolution and the freeze-aware streak walk. 1:1 port of the mock
 * engine (`mocks/store.ts` Trade Review module) so live numbers match
 * MSW numbers for the same data.
 */
import type { GoalDirection, GoalMetric, GoalPeriod, GoalUnit } from "../../shared/contracts";

export const METRIC_SHAPE: Record<GoalMetric, { direction: GoalDirection; unit: GoalUnit }> = {
  WIN_RATE: { direction: "HIGHER_IS_BETTER", unit: "PERCENT" },
  R_EARNED: { direction: "HIGHER_IS_BETTER", unit: "R" },
  AVG_R: { direction: "HIGHER_IS_BETTER", unit: "R" },
  PROFIT_TARGET: { direction: "HIGHER_IS_BETTER", unit: "MONEY" },
  DISCIPLINE_SCORE: { direction: "HIGHER_IS_BETTER", unit: "SCORE" },
  FOLLOWED_PLAN_PCT: { direction: "HIGHER_IS_BETTER", unit: "PERCENT" },
  MAX_TRADES_PER_DAY: { direction: "LOWER_IS_BETTER", unit: "COUNT" },
  MAX_DAILY_LOSS_R: { direction: "HIGHER_IS_BETTER", unit: "R" },
};

export interface ResolvedPeriod {
  from: string;
  to: string;
  daysElapsed: number;
  daysTotal: number;
}

export function shiftDayKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayDiff(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** Calendar window for `period` containing the reference day (YYYY-MM-DD). */
export function resolvePeriodFor(period: GoalPeriod, refDay: string): { from: string; to: string } {
  const [y, m] = refDay.split("-").map(Number) as [number, number];
  const utc = (year: number, month: number, day: number): string =>
    new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

  if (period === "WEEK") {
    const weekday = new Date(`${refDay}T00:00:00Z`).getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    const from = shiftDayKey(refDay, -mondayOffset);
    return { from, to: shiftDayKey(from, 6) };
  }
  if (period === "MONTH") {
    return { from: utc(y, m, 1), to: utc(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()) };
  }
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  const qEndMonth = qStart + 2;
  return {
    from: utc(y, qStart, 1),
    to: utc(y, qEndMonth, new Date(Date.UTC(y, qEndMonth, 0)).getUTCDate()),
  };
}

/** Calendar period containing `today`, with elapsed/total day counts. */
export function resolvePeriod(period: GoalPeriod, today: string): ResolvedPeriod {
  const { from, to } = resolvePeriodFor(period, today);
  const daysTotal = dayDiff(from, to) + 1;
  const daysElapsed = Math.min(daysTotal, Math.max(0, dayDiff(from, today) + 1));
  return { from, to, daysElapsed, daysTotal };
}

/** The true previous calendar window (week/month/quarter before). */
export function previousWindow(period: ResolvedPeriod): { from: string; to: string } {
  const recovered: GoalPeriod =
    period.daysTotal <= 7 ? "WEEK" : period.daysTotal <= 31 ? "MONTH" : "QUARTER";
  return resolvePeriodFor(recovered, shiftDayKey(period.from, -1));
}

export function mondayOf(dayKey: string): string {
  const offset = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDayKey(dayKey, -offset);
}

export interface StreakResult {
  currentDays: number;
  frozenDays: number;
  effectiveDays: number;
  freezesUsedThisWeek: 0 | 1;
  gracePerWeek: 1;
  longestStreak: number;
}

/**
 * Review streak with an HONEST freeze: one grace day per calendar week
 * (Mon–Sun). The chain walks back from today (or yesterday); a single
 * missed day is forgiven - counted as FROZEN, never as reviewed - only
 * when the chain stays continuous around it and that calendar week has
 * not already consumed its grace day.
 */
export function computeStreak(reviewDays: Set<string>, today: string): StreakResult {
  let streakStart = today;
  if (!reviewDays.has(streakStart)) streakStart = shiftDayKey(today, -1);
  let currentDays = 0;
  let frozenDays = 0;
  const frozenWeeks = new Set<string>();
  if (reviewDays.has(streakStart)) {
    let cursor = streakStart;
    for (;;) {
      if (reviewDays.has(cursor)) {
        currentDays += 1;
        cursor = shiftDayKey(cursor, -1);
        continue;
      }
      const previousDay = shiftDayKey(cursor, -1);
      if (reviewDays.has(previousDay)) {
        const weekKey = mondayOf(cursor);
        if (!frozenWeeks.has(weekKey)) {
          frozenWeeks.add(weekKey);
          frozenDays += 1;
          cursor = previousDay;
          continue;
        }
      }
      break;
    }
  }
  // Best pure run across the whole history (no freeze credit).
  const sortedReviewDays = [...reviewDays].sort();
  let longestStreak = 0;
  let run = 0;
  let previousDay: string | null = null;
  for (const day of sortedReviewDays) {
    run = previousDay !== null && shiftDayKey(previousDay, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previousDay = day;
  }
  return {
    currentDays,
    frozenDays,
    effectiveDays: currentDays + frozenDays,
    freezesUsedThisWeek: frozenWeeks.has(mondayOf(today)) ? 1 : 0,
    gracePerWeek: 1,
    longestStreak,
  };
}
