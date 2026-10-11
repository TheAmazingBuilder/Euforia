/**
 * Unit — review streak (freeze-aware) + weekly grade trend (Phase 6).
 *
 * Faithful semantics of the product's honest gamification ledger: one grace
 * day per Mon–Sun calendar week, frozen days reported separately, never
 * counted as reviewed.
 */
import { describe, expect, it } from "vitest";

import {
  computeReviewStreak,
  computeWeeklyGradeTrend,
  mondayOfKey,
  shiftDayKey,
} from "../../src/modules/trade-review/domain/review-streak";

function keys(...days: string[]): Set<string> {
  return new Set(days);
}

describe("review streak (§71 semantics)", () => {
  it("counts today's review as a 1-day streak", () => {
    const streak = computeReviewStreak({ todayKey: "2026-03-10", reviewDayKeys: keys("2026-03-10") });
    expect(streak.currentDays).toBe(1);
    expect(streak.frozenDays).toBe(0);
    expect(streak.effectiveDays).toBe(1);
    expect(streak.longestStreak).toBe(1);
  });

  it("walks a continuous chain back from today", () => {
    const streak = computeReviewStreak({
      todayKey: "2026-03-10",
      reviewDayKeys: keys("2026-03-10", "2026-03-09", "2026-03-08"),
    });
    expect(streak.currentDays).toBe(3);
    expect(streak.effectiveDays).toBe(3);
  });

  it("starts from yesterday when today has no review yet", () => {
    const streak = computeReviewStreak({
      todayKey: "2026-03-10",
      reviewDayKeys: keys("2026-03-09", "2026-03-08"),
    });
    expect(streak.currentDays).toBe(2);
  });

  it("freezes ONE missed day inside a continuous chain (grace)", () => {
    const streak = computeReviewStreak({
      todayKey: "2026-03-10",
      reviewDayKeys: keys("2026-03-10", "2026-03-09", "2026-03-07", "2026-03-06"),
    });
    expect(streak.currentDays).toBe(4);
    expect(streak.frozenDays).toBe(1);
    expect(streak.effectiveDays).toBe(5);
  });

  it("grants at most one freeze per Mon–Sun calendar week", () => {
    // 2026-03-09 is a Monday; 03-11 and 03-13 both miss in the same week —
    // only the first gap may be frozen.
    const streak = computeReviewStreak({
      todayKey: "2026-03-13",
      reviewDayKeys: keys("2026-03-13", "2026-03-12", "2026-03-10", "2026-03-09"),
    });
    expect(streak.frozenDays).toBe(1);
    expect(streak.freezesUsedThisWeek).toBe(1);
  });

  it("breaks the chain when the week's grace is already spent", () => {
    const streak = computeReviewStreak({
      todayKey: "2026-03-13",
      reviewDayKeys: keys("2026-03-13", "2026-03-11", "2026-03-09"),
    });
    // 03-12 misses: freeze available → chain continues to 03-11; 03-10 misses
    // but the week already used its grace → chain stops.
    expect(streak.currentDays).toBe(2);
    expect(streak.frozenDays).toBe(1);
    expect(streak.effectiveDays).toBe(3);
  });

  it("reports the best pure run across the whole history", () => {
    const streak = computeReviewStreak({
      todayKey: "2026-03-10",
      reviewDayKeys: keys("2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04", "2026-03-10"),
    });
    expect(streak.currentDays).toBe(1);
    expect(streak.longestStreak).toBe(4);
  });

  it("is honest with an empty history", () => {
    const streak = computeReviewStreak({ todayKey: "2026-03-10", reviewDayKeys: keys() });
    expect(streak.currentDays).toBe(0);
    expect(streak.effectiveDays).toBe(0);
    expect(streak.freezesUsedThisWeek).toBe(0);
    expect(streak.longestStreak).toBe(0);
  });
});

describe("day-key helpers", () => {
  it("shifts across month boundaries", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("finds the Monday of a week", () => {
    expect(mondayOfKey("2026-03-11")).toBe("2026-03-09"); // Wednesday
    expect(mondayOfKey("2026-03-15")).toBe("2026-03-09"); // Sunday
    expect(mondayOfKey("2026-03-09")).toBe("2026-03-09"); // Monday itself
  });
});

describe("weekly grade trend", () => {
  it("averages grade points per Monday-based week, oldest first, max 8", () => {
    const trend = computeWeeklyGradeTrend(
      [
        { dayKey: "2026-03-09", grade: "A" }, // current week (Mon)
        { dayKey: "2026-03-10", grade: "B" },
        { dayKey: "2026-03-02", grade: "F" }, // previous week
        { dayKey: "2026-01-05", grade: "A" }, // far past — outside 8 weeks
      ],
      "2026-03-11",
    );
    expect(trend).toHaveLength(2);
    expect(trend[0]).toEqual({ weekStart: "2026-03-02", avgPoints: 1, reviews: 1 });
    expect(trend[1]).toEqual({ weekStart: "2026-03-09", avgPoints: 4.5, reviews: 2 });
  });

  it("skips weeks without reviews and caps the window at 8 weeks", () => {
    const trend = computeWeeklyGradeTrend([{ dayKey: "2026-03-10", grade: "C" }], "2026-03-10");
    expect(trend).toHaveLength(1);
    expect(trend[0]).toEqual({ weekStart: "2026-03-09", avgPoints: 3, reviews: 1 });
  });
});
