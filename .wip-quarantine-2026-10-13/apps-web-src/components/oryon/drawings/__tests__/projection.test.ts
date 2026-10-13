import { describe, expect, it } from "vitest";

import {
  buildTimeline,
  logicalToTime,
  logicalToX,
  timeToLogical,
  timeToX,
  xToLogical,
  xToTime,
} from "@/components/oryon/drawings/projection";

/**
 * Projection math tests — the time↔logical↔x mapping MUST reproduce
 * Lightweight Charts' index-based placement exactly (linear within the
 * visible logical range), interpolate inside the data, and extrapolate
 * with the median spacing outside it.
 */

const MIN = 60_000;

/** 10 bars, one per minute, starting at t=1000. */
const regular = buildTimeline(
  Array.from({ length: 10 }, (_, i) => 1000 + i * MIN),
);

/** Bars with a session gap: 0, 1m, 2m, 60m, 61m, 62m. */
const gapped = buildTimeline([
  0, 1 * MIN, 2 * MIN, 60 * MIN, 61 * MIN, 62 * MIN,
]);

describe("buildTimeline", () => {
  it("computes the median spacing (robust against session gaps)", () => {
    expect(regular.medianSpacing).toBe(MIN);
    // gaps: 1m, 1m, 58m, 1m, 1m → sorted → median = 1m
    expect(gapped.medianSpacing).toBe(MIN);
  });

  it("handles empty and single-bar inputs", () => {
    expect(buildTimeline([]).count).toBe(0);
    expect(buildTimeline([]).medianSpacing).toBeNull();
    const single = buildTimeline([42]);
    expect(single.count).toBe(1);
    expect(single.medianSpacing).toBeNull();
  });
});

describe("timeToLogical", () => {
  it("maps bar times to their integer index", () => {
    expect(timeToLogical(regular, 1000)).toBe(0);
    expect(timeToLogical(regular, 1000 + 5 * MIN)).toBe(5);
    expect(timeToLogical(regular, 1000 + 9 * MIN)).toBe(9);
  });

  it("interpolates fractional logical indices between bars", () => {
    expect(timeToLogical(regular, 1000 + 2.5 * MIN)).toBeCloseTo(2.5, 10);
  });

  it("extrapolates beyond the edges with the median spacing", () => {
    expect(timeToLogical(regular, 1000 - 2 * MIN)).toBeCloseTo(-2, 10);
    expect(timeToLogical(regular, 1000 + 11 * MIN)).toBeCloseTo(11, 10);
  });

  it("returns null for unmappable inputs (no bars, single bar offset)", () => {
    expect(timeToLogical(buildTimeline([]), 1234)).toBeNull();
    expect(timeToLogical(buildTimeline([1000]), 1000)).toBe(0);
    expect(timeToLogical(buildTimeline([1000]), 2000)).toBeNull();
    expect(timeToLogical(regular, Number.NaN)).toBeNull();
  });
});

describe("logicalToTime", () => {
  it("inverts timeToLogical inside the data", () => {
    expect(logicalToTime(regular, 0)).toBe(1000);
    expect(logicalToTime(regular, 3)).toBe(1000 + 3 * MIN);
    expect(logicalToTime(regular, 3.5)).toBe(1000 + 3.5 * MIN);
  });

  it("extrapolates beyond the edges", () => {
    expect(logicalToTime(regular, -1)).toBe(1000 - MIN);
    expect(logicalToTime(regular, 10)).toBe(1000 + 10 * MIN);
  });

  it("returns null when there is no data (or single bar with offset)", () => {
    expect(logicalToTime(buildTimeline([]), 1)).toBeNull();
    expect(logicalToTime(buildTimeline([1000]), 0)).toBe(1000);
    expect(logicalToTime(buildTimeline([1000]), 0.5)).toBeNull();
  });

  it("round-trips through timeToLogical across the gap case", () => {
    const t = 61.5 * MIN; // halfway inside the second session
    const logical = timeToLogical(gapped, t);
    expect(logical).not.toBeNull();
    expect(logicalToTime(gapped, logical!)).toBeCloseTo(t, 6);
  });
});

describe("logical↔x linear map", () => {
  const projection = { from: 2, to: 7, width: 500 };

  it("maps range edges to 0 and width", () => {
    expect(logicalToX(projection, 2)).toBe(0);
    expect(logicalToX(projection, 7)).toBe(500);
  });

  it("is linear in between and invertible", () => {
    expect(logicalToX(projection, 4.5)).toBe(250);
    expect(xToLogical(projection, 250)).toBeCloseTo(4.5, 10);
    expect(xToLogical(projection, 0)).toBeCloseTo(2, 10);
  });

  it("extrapolates outside the visible window (anchors off-screen)", () => {
    expect(logicalToX(projection, 0)).toBe(-200);
    expect(logicalToX(projection, 9)).toBe(700);
  });

  it("returns null on degenerate ranges", () => {
    expect(logicalToX({ from: 5, to: 5, width: 500 }, 1)).toBeNull();
    expect(logicalToX({ from: 0, to: 5, width: 0 }, 1)).toBeNull();
    expect(xToLogical({ from: 0, to: 5, width: 0 }, 100)).toBeNull();
  });
});

describe("time↔x end-to-end", () => {
  // Bars 0..9 → x 0..800 (logical range [0, 10] across 800 px).
  const projection = { from: 0, to: 10, width: 800 };

  it("round-trips time → x → time", () => {
    const t = 1000 + 4 * MIN;
    const x = timeToX(regular, projection, t);
    expect(x).toBeCloseTo(4 * 80, 6);
    expect(xToTime(regular, projection, x!)).toBeCloseTo(t, 6);
  });

  it("keeps anchors attached beyond the loaded data (PRD §8.3)", () => {
    const future = 1000 + 12 * MIN;
    const x = timeToX(regular, projection, future);
    expect(x).not.toBeNull();
    expect(xToTime(regular, projection, x!)).toBeCloseTo(future, 6);
  });

  it("handles gapped series — interpolation follows BAR spacing, not clock", () => {
    // Within the gap (2m→60m) a time maps fractionally between the bars.
    const t = 31 * MIN; // midpoint of the gap between index 2 and 3
    const x = timeToX(gapped, projection, t);
    expect(x).not.toBeNull();
    // xToTime returns the interpolated logical position — NOT t itself
    // (the gap is compressed, exactly like Lightweight Charts renders it).
    const back = xToTime(gapped, projection, x!)!;
    expect(timeToLogical(gapped, back)).toBeCloseTo(timeToLogical(gapped, t)!, 6);
  });

  it("returns null without data — callers skip, never fake", () => {
    expect(timeToX(buildTimeline([]), projection, 1000)).toBeNull();
    expect(xToTime(buildTimeline([]), projection, 100)).toBeNull();
  });
});
