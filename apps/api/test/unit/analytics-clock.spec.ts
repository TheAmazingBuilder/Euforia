/**
 * Unit - Analytics clock (Phase 8 §7 TIME RANGE MODEL): the 13 period
 * presets resolved SERVER-SIDE on the user's trading-day clock, plus the
 * date-key helpers the engines rely on.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_FROM,
  ALL_TO,
  dayDiff,
  isoWeekOf,
  resolvePeriodRange,
  shiftDayKey,
  todayKeyFor,
  weekStartKey,
} from "../../src/modules/analytics/domain/analytics-clock";

const TODAY = "2026-10-07"; // a Wednesday

describe("todayKeyFor", () => {
  it("resolves the trading-day key in the user timezone (UTC-5 → previous day before 05:00Z)", () => {
    // 2026-10-07T02:00:00Z = 2026-10-06T22:00 in America/Toronto (DST, EDT = UTC-4)
    const key = todayKeyFor("America/Toronto", new Date("2026-10-07T02:00:00.000Z"));
    expect(key).toBe("2026-10-06");
  });

  it("resolves UTC timezone deterministically", () => {
    const key = todayKeyFor("UTC", new Date("2026-10-07T02:00:00.000Z"));
    expect(key).toBe("2026-10-07");
  });

  it("falls back to UTC for an invalid timezone", () => {
    const key = todayKeyFor("Mars/Olympus", new Date("2026-10-07T02:00:00.000Z"));
    expect(key).toBe("2026-10-07");
  });
});

describe("resolvePeriodRange", () => {
  it("TODAY → [today, today]", () => {
    expect(resolvePeriodRange({ period: "TODAY" }, TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it("YESTERDAY → the single previous day", () => {
    expect(resolvePeriodRange({ period: "YESTERDAY" }, TODAY)).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("THIS_WEEK → Monday-first, capped at today", () => {
    expect(resolvePeriodRange({ period: "THIS_WEEK" }, TODAY)).toEqual({
      from: "2026-10-05", // Monday
      to: TODAY,
    });
  });

  it("LAST_WEEK → the full previous Monday-Sunday window", () => {
    expect(resolvePeriodRange({ period: "LAST_WEEK" }, TODAY)).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
  });

  it("THIS_MONTH → month start to today", () => {
    expect(resolvePeriodRange({ period: "THIS_MONTH" }, TODAY)).toEqual({
      from: "2026-10-01",
      to: TODAY,
    });
  });

  it("LAST_MONTH → the complete previous month", () => {
    expect(resolvePeriodRange({ period: "LAST_MONTH" }, TODAY)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("THIS_QUARTER → quarter start (Jan/Apr/Jul/Oct) to today", () => {
    expect(resolvePeriodRange({ period: "THIS_QUARTER" }, TODAY)).toEqual({
      from: "2026-10-01",
      to: TODAY,
    });
    expect(resolvePeriodRange({ period: "THIS_QUARTER" }, "2026-05-15")).toEqual({
      from: "2026-04-01",
      to: "2026-05-15",
    });
    expect(resolvePeriodRange({ period: "THIS_QUARTER" }, "2026-02-15")).toEqual({
      from: "2026-01-01",
      to: "2026-02-15",
    });
  });

  it("THIS_YEAR and YTD → January 1st to today", () => {
    expect(resolvePeriodRange({ period: "THIS_YEAR" }, TODAY)).toEqual({
      from: "2026-01-01",
      to: TODAY,
    });
    expect(resolvePeriodRange({ period: "YTD" }, TODAY)).toEqual(resolvePeriodRange({ period: "THIS_YEAR" }, TODAY));
  });

  it("LAST_30 → inclusive 30-day window", () => {
    expect(resolvePeriodRange({ period: "LAST_30" }, TODAY)).toEqual({
      from: "2026-09-08",
      to: TODAY,
    });
  });

  it("LAST_90 → inclusive 90-day window", () => {
    expect(resolvePeriodRange({ period: "LAST_90" }, TODAY)).toEqual({
      from: "2026-07-10",
      to: TODAY,
    });
  });

  it("CUSTOM with valid inclusive bounds is respected", () => {
    expect(
      resolvePeriodRange({ period: "CUSTOM", customFrom: "2026-03-02", customTo: "2026-03-06" }, TODAY),
    ).toEqual({ from: "2026-03-02", to: "2026-03-06" });
  });

  it("CUSTOM with inverted or missing bounds falls back to ALL sentinels", () => {
    expect(resolvePeriodRange({ period: "CUSTOM", customFrom: "2026-03-06", customTo: "2026-03-02" }, TODAY)).toEqual({
      from: ALL_FROM,
      to: ALL_TO,
    });
    expect(resolvePeriodRange({ period: "CUSTOM", customFrom: "2026-03-02" }, TODAY)).toEqual({
      from: ALL_FROM,
      to: ALL_TO,
    });
  });

  it("ALL → sentinel keys the meta layer resolves back to dataset bounds", () => {
    expect(resolvePeriodRange({ period: "ALL" }, TODAY)).toEqual({ from: ALL_FROM, to: ALL_TO });
  });
});

describe("date-key helpers", () => {
  it("shiftDayKey performs UTC calendar arithmetic", () => {
    expect(shiftDayKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("dayDiff is a signed inclusive calendar distance", () => {
    expect(dayDiff("2026-03-02", "2026-03-06")).toBe(4);
    expect(dayDiff("2026-03-06", "2026-03-02")).toBe(-4);
  });

  it("weekStartKey anchors Monday (Sunday rolls back 6 days)", () => {
    expect(weekStartKey("2026-10-07")).toBe("2026-10-05"); // Wednesday → Monday
    expect(weekStartKey("2026-10-11")).toBe("2026-10-05"); // Sunday → Monday
  });

  it("isoWeekOf produces ISO-8601 week keys", () => {
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01");
    expect(isoWeekOf("2024-12-30")).toBe("2025-W01"); // ISO year rollover
  });
});
