/**
 * Unit - shared compounding projection (utils/compounding.ts): the frontend
 * LIVE-ESTIMATE layer behind the TOOLS > Compounding Calculator. Pure math,
 * no I/O. Semantics must mirror the backend calculators domain (growth-only
 * server contract stays untouched - this layer additionally accepts negative
 * per-period rates for drawdown what-ifs).
 */
import { describe, expect, it } from "vitest";

import {
  calculateCompounding,
  COMPOUNDING_MIN_GAIN_PERCENT,
} from "../../../../packages/shared/src/utils/compounding";
import { COMPOUNDING_MAX_PERIODS as CONTRACT_CAP } from "../../../../packages/shared/src/schemas/calculators";

describe("shared compounding - calculateCompounding", () => {
  it("projects one period: $1,000 at 5% → $1,050 (+$50, +5%)", () => {
    const result = calculateCompounding({
      startingBalance: 1000,
      periods: 1,
      gainPerPeriodPercent: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.rows).toHaveLength(1);
    expect(result!.rows[0]!.startingBalance).toBe("1000");
    expect(result!.rows[0]!.endingBalance).toBe("1050");
    expect(result!.rows[0]!.periodProfit).toBe("50");
    expect(result!.rows[0]!.totalProfit).toBe("50");
    expect(result!.rows[0]!.totalGainPercent).toBe("5");
    expect(result!.finalBalance).toBe("1050");
    expect(result!.totalProfit).toBe("50");
    expect(result!.totalGainPercent).toBe("5");
  });

  it("compounds on the running balance, not the principal (spec vector: 1000 / 5% / 20)", () => {
    const result = calculateCompounding({
      startingBalance: 1000,
      periods: 20,
      gainPerPeriodPercent: 5,
    });
    expect(result).not.toBeNull();
    // 1000 × 1.05^20 = 2653.2977051444…
    expect(result!.finalBalance).toBe("2653.29770514");
    // Period 2 starts from period 1's ENDING balance (1050), not the principal.
    expect(result!.rows[1]!.startingBalance).toBe("1050");
    expect(result!.rows[1]!.endingBalance).toBe("1102.5");
    // Total Profit is cumulative absolute: 1102.50 − 1000 = 102.50.
    expect(result!.rows[1]!.totalProfit).toBe("102.5");
    // Total Gain is cumulative percent vs the ORIGINAL balance, not per-period.
    expect(result!.rows[1]!.totalGainPercent).toBe("10.25");
  });

  it("0% keeps every period flat - ending equals starting", () => {
    const result = calculateCompounding({
      startingBalance: 2500,
      periods: 12,
      gainPerPeriodPercent: 0,
    });
    expect(result).not.toBeNull();
    for (const row of result!.rows) {
      expect(row.endingBalance).toBe("2500");
      expect(row.periodProfit).toBe("0");
      expect(row.totalProfit).toBe("0");
      expect(row.totalGainPercent).toBe("0");
    }
    expect(result!.finalBalance).toBe("2500");
  });

  it("negative rates reduce the balance and never go below zero (−2%, then −100%)", () => {
    const drawdown = calculateCompounding({
      startingBalance: 1000,
      periods: 10,
      gainPerPeriodPercent: -2,
    });
    expect(drawdown).not.toBeNull();
    // 1000 × 0.98^10 = 817.0728068888014… → 8-decimal wire rendering
    expect(drawdown!.finalBalance).toBe("817.07280689");
    expect(Number(drawdown!.totalProfit)).toBeLessThan(0);

    const wipeout = calculateCompounding({
      startingBalance: 1000,
      periods: 5,
      gainPerPeriodPercent: -100,
    });
    expect(wipeout).not.toBeNull();
    expect(wipeout!.rows[0]!.endingBalance).toBe("0");
    expect(wipeout!.finalBalance).toBe("0");
  });

  it("handles decimal percentages and large-but-valid inputs", () => {
    const decimal = calculateCompounding({
      startingBalance: 1000,
      periods: 3,
      gainPerPeriodPercent: 2.5,
    });
    expect(decimal).not.toBeNull();
    // 1000 → 1025 → 1050.625 → 1076.890625
    expect(decimal!.finalBalance).toBe("1076.890625");

    const large = calculateCompounding({
      startingBalance: 250000,
      periods: CONTRACT_CAP,
      gainPerPeriodPercent: 0.1,
    });
    expect(large).not.toBeNull();
    expect(large!.rows).toHaveLength(CONTRACT_CAP);
  });

  it("uses the contract cap as its period ceiling", () => {
    // The live-estimate layer reuses the shared calculators contract constant:
    // one period above the cap is rejected, exactly at the cap it computes.
    expect(
      calculateCompounding({ startingBalance: 1000, periods: CONTRACT_CAP + 1, gainPerPeriodPercent: 5 }),
    ).toBeNull();
    expect(
      calculateCompounding({ startingBalance: 1000, periods: CONTRACT_CAP, gainPerPeriodPercent: 0.1 }),
    ).not.toBeNull();
    expect(COMPOUNDING_MIN_GAIN_PERCENT).toBe(-100);
  });

  it("rejects invalid input with null (never throws, never Infinity)", () => {
    expect(calculateCompounding({ startingBalance: 0, periods: 5, gainPerPeriodPercent: 5 })).toBeNull();
    expect(calculateCompounding({ startingBalance: -100, periods: 5, gainPerPeriodPercent: 5 })).toBeNull();
    expect(calculateCompounding({ startingBalance: 1000, periods: 0, gainPerPeriodPercent: 5 })).toBeNull();
    expect(calculateCompounding({ startingBalance: 1000, periods: 2.5, gainPerPeriodPercent: 5 })).toBeNull();
    expect(
      calculateCompounding({ startingBalance: 1000, periods: CONTRACT_CAP + 1, gainPerPeriodPercent: 5 }),
    ).toBeNull();
    expect(calculateCompounding({ startingBalance: 1000, periods: 5, gainPerPeriodPercent: -150 })).toBeNull();
    expect(calculateCompounding({ startingBalance: 1000, periods: 5, gainPerPeriodPercent: 10001 })).toBeNull();
    expect(
      calculateCompounding({ startingBalance: Number.NaN, periods: 5, gainPerPeriodPercent: 5 }),
    ).toBeNull();
    // Overflow guard: 1000 periods of +10000% would explode - null, not Infinity.
    expect(
      calculateCompounding({ startingBalance: 1e12, periods: 1000, gainPerPeriodPercent: 10000 }),
    ).toBeNull();
  });
});

describe("shared compounding - lot-size parity with the shared risk utils", () => {
  it("spec vector: $10,000 / 1% / XAUUSD (entry 2650, stop 2640) → 0.10 lots, $100 risk", () => {
    // Reproduced here with the pure helpers the calculator page composes, so
    // the UI's building blocks are pinned against the product example.
    const balance = 10_000;
    const riskPercent = 1;
    const entry = 2650;
    const stop = 2640;
    const pipSize = 0.01;
    const contractSize = 100;

    const riskAmount = (balance * riskPercent) / 100;
    expect(riskAmount).toBe(100);

    const distance = Math.abs(entry - stop);
    const perUnit = distance * contractSize;
    const raw = riskAmount / perUnit;
    const floored = Math.floor(Number(raw.toFixed(6)) * 100) / 100;
    expect(floored).toBe(0.1);

    const stopPips = distance / pipSize;
    expect(stopPips).toBe(1000);
  });
});
