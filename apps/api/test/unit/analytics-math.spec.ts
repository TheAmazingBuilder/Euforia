/**
 * Unit — Analytics math (Phase 8): the numeric canon of the analytics
 * engine. These formulas are the system's shared definition (frontend
 * contract semantics) — changing one of them changes every chart.
 */
import { describe, expect, it } from "vitest";
import {
  mean,
  medianOf,
  moments,
  mulberry32,
  niceStep,
  percentileOf,
  round1,
  round2,
  stdOf,
  uuidV5,
} from "../../src/modules/analytics/domain/analytics-math";

describe("rounding", () => {
  it("round2 keeps 2 decimals as a number", () => {
    expect(round2(1.005)).toBe(1.0);
    // Number(−2.675) is −2.674999… in IEEE-754 → toFixed yields −2.67 (mock-parity).
    expect(round2(-2.675)).toBe(-2.67);
    expect(round2(0)).toBe(0);
  });

  it("round1 keeps 1 decimal as a number", () => {
    expect(round1(2.25)).toBe(2.3);
    expect(round1(-0.04)).toBe(-0);
  });
});

describe("mean", () => {
  it("returns null on an empty list (no-data semantics, §54)", () => {
    expect(mean([])).toBeNull();
  });

  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("percentileOf — linear interpolation between order statistics", () => {
  it("is null on empty input", () => {
    expect(percentileOf([], 50)).toBeNull();
  });

  it("returns exact members at integer positions", () => {
    expect(percentileOf([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("interpolates linearly for fractional positions", () => {
    // pos = (5−1)×0.25 = 1 → exact member
    expect(percentileOf([10, 20, 30, 40, 50], 25)).toBe(20);
    // pos = (3−1)×0.5 = 1 → exact member
    expect(percentileOf([1, 2, 3, 4], 50)).toBe(2.5);
    // interpolation between neighbors
    expect(percentileOf([0, 10], 25)).toBe(2.5);
  });

  it("medianOf delegates to the 50th percentile", () => {
    expect(medianOf([5, 1, 9, 3])).toBe(4);
  });
});

describe("stdOf — SAMPLE deviation (n−1)", () => {
  it("is null below 2 values", () => {
    expect(stdOf([4])).toBeNull();
  });

  it("uses the n−1 denominator", () => {
    expect(stdOf([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });

  it("is 0 for a constant series", () => {
    expect(stdOf([3, 3, 3])).toBe(0);
  });
});

describe("moments — skewness / excess kurtosis", () => {
  it("is null below 3 values or zero variance", () => {
    expect(moments([1, 2]).skew).toBeNull();
    expect(moments([2, 2, 2]).kurt).toBeNull();
  });

  it("reports 0 skew for a symmetric distribution", () => {
    const { skew } = moments([-2, -1, 0, 1, 2]);
    expect(skew).toBeCloseTo(0, 10);
  });

  it("reports a right-skewed sample positively", () => {
    const { skew } = moments([-5, -4, -4, -3, 0, 20]);
    expect(skew).toBeGreaterThan(0.5);
  });
});

describe("niceStep — human histogram steps", () => {
  it("snaps to 1/2/2.5/5/10 × 10^k", () => {
    expect(niceStep(0.02)).toBe(0.02);
    expect(niceStep(0.13)).toBe(0.2);
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(2.4)).toBe(2.5);
    expect(niceStep(2.6)).toBe(5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(60)).toBe(100);
  });
});

describe("mulberry32 — deterministic PRNG", () => {
  it("produces identical sequences for identical seeds (§52 reproducibility)", () => {
    const a = mulberry32(20260930);
    const b = mulberry32(20260930);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("uuidV5 — deterministic group identity for uncataloged symbols", () => {
  it("is stable for the same (name, namespace) pair", () => {
    expect(uuidV5("BOOM500", "6f0a1a86-9d92-4a2c-8f57-52f4d1f9a1c7")).toBe(
      uuidV5("BOOM500", "6f0a1a86-9d92-4a2c-8f57-52f4d1f9a1c7"),
    );
  });

  it("differs across symbols and namespaces, and is a valid uuid shape", () => {
    const ns = "6f0a1a86-9d92-4a2c-8f57-52f4d1f9a1c7";
    const a = uuidV5("BOOM500", ns);
    const b = uuidV5("CRASH500", ns);
    expect(a).not.toBe(b);
    expect(uuidV5("BOOM500", "00000000-0000-4000-8000-000000000000")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
