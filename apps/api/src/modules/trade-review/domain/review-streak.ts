/**
 * Review streak + weekly grade trend (Phase 6 — workspace overview).
 *
 * Faithful port of the product's established semantics (the frontend mock is
 * the product spec until the real backend replaces it — §71):
 *
 *   - Streak with an HONEST freeze: one grace day per calendar week (Mon–Sun).
 *     A missed day is forgiven — counted as FROZEN, never as reviewed — only
 *     if the chain stays continuous around it and that calendar week has not
 *     already consumed its grace day. Numbers reported separately so the
 *     gamification never lies.
 *   - Weekly grade trend: Monday-based weeks, A=5 … F=1 points, average
 *     rounded to 2 decimals, oldest → newest, current week included, max 8
 *     weeks, weeks without reviews skipped.
 *
 * Pure domain functions on DAY KEYS ("YYYY-MM-DD") — the caller converts
 * instants to the user's trading-day keys (timezone-aware), keeping this
 * module free of framework and clock concerns (§75).
 */

/** Grade points mirror the product rule: A=5 … F=1. */
const GRADE_POINTS: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

export const GRACE_DAYS_PER_WEEK = 1;
export const TREND_WEEKS = 8;

// ── day-key helpers (UTC math on "YYYY-MM-DD" strings — date keys are zoneless) ──

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/** Monday of the calendar week (Mon–Sun) containing the day key. */
export function mondayOfKey(dayKey: string): string {
  const offset = (new Date(`${dayKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return shiftDayKey(dayKey, -offset);
}

// ── streak ──

export interface ReviewStreakResult {
  /** Days with at least one review in the current chain. */
  currentDays: number;
  /** Grace days consumed by the current chain. */
  frozenDays: number;
  /** What the badge shows: currentDays + frozenDays. */
  effectiveDays: number;
  /** Grace days used inside the current calendar week (0 or 1). */
  freezesUsedThisWeek: number;
  gracePerWeek: 1;
  /** Best pure run (no freeze credit) across the whole history. */
  longestStreak: number;
}

/**
 * Walk the freeze-aware chain back from today (or yesterday, if today has no
 * review yet) through the given review day keys.
 */
export function computeReviewStreak(params: {
  todayKey: string;
  reviewDayKeys: ReadonlySet<string>;
}): ReviewStreakResult {
  const { todayKey, reviewDayKeys } = params;

  let streakStart = todayKey;
  if (!reviewDayKeys.has(streakStart)) streakStart = shiftDayKey(streakStart, -1);

  let currentDays = 0;
  let frozenDays = 0;
  const frozenWeeks = new Set<string>();

  if (reviewDayKeys.has(streakStart)) {
    let cursor = streakStart;
    for (;;) {
      if (reviewDayKeys.has(cursor)) {
        currentDays += 1;
        cursor = shiftDayKey(cursor, -1);
        continue;
      }
      const previousDay = shiftDayKey(cursor, -1);
      if (reviewDayKeys.has(previousDay)) {
        const weekKey = mondayOfKey(cursor);
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
  const sortedDays = [...reviewDayKeys].sort();
  let longestStreak = 0;
  let run = 0;
  let previousDay: string | null = null;
  for (const day of sortedDays) {
    run = previousDay !== null && shiftDayKey(previousDay, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previousDay = day;
  }

  return {
    currentDays,
    frozenDays,
    effectiveDays: currentDays + frozenDays,
    freezesUsedThisWeek: frozenWeeks.has(mondayOfKey(todayKey)) ? 1 : 0,
    gracePerWeek: GRACE_DAYS_PER_WEEK,
    longestStreak,
  };
}

// ── weekly grade trend ──

export interface GradeDayPoint {
  /** Trading-day key of the review completion (user timezone). */
  dayKey: string;
  /** Execution grade of the review ("A"…"F"). */
  grade: string;
}

export interface WeeklyGradePoint {
  weekStart: string;
  avgPoints: number;
  reviews: number;
}

/**
 * Weekly average execution grade over the last 8 Monday-based weeks
 * (current week included), oldest → newest, weeks without reviews skipped.
 */
export function computeWeeklyGradeTrend(
  points: readonly GradeDayPoint[],
  todayKey: string,
): WeeklyGradePoint[] {
  const currentWeekStart = mondayOfKey(todayKey);
  const trend: WeeklyGradePoint[] = [];

  for (let weekOffset = TREND_WEEKS - 1; weekOffset >= 0; weekOffset -= 1) {
    const weekStart = shiftDayKey(currentWeekStart, -weekOffset * 7);
    const weekEnd = shiftDayKey(weekStart, 6);
    const weekPoints = points.filter((p) => p.dayKey >= weekStart && p.dayKey <= weekEnd);
    if (weekPoints.length === 0) continue;
    const sum = weekPoints.reduce((acc, p) => acc + (GRADE_POINTS[p.grade] ?? 0), 0);
    trend.push({
      weekStart,
      avgPoints: Number((sum / weekPoints.length).toFixed(2)),
      reviews: weekPoints.length,
    });
  }

  return trend;
}
