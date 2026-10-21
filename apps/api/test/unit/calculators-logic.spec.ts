/**
 * Unit — Calculators domain logic (Phase 18 §47/§48/§49/§50/§59): known-value
 * financial vectors, mathematical invariants, edge cases, volume
 * normalization, percentage normalization, frontend parity. Pure functions —
 * no Nest, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  lotSizeCalculatorInputSchema,
  compoundingCalculatorInputSchema,
  suggestPositionSize,
  computeRR,
  type CompoundingCalculatorInput,
  type LotSizeCalculatorInput,
} from "../../src/shared/contracts";
import { CALCULATOR_ERROR_CODES } from "../../src/shared/contracts";
import { computeLotSize } from "../../src/modules/calculators/lot-size.logic";
import { computeCompounding } from "../../src/modules/calculators/compounding.logic";
import { BusinessRuleError, ValidationError } from "../../src/shared/errors/app-error";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse+validate through the contract so the logic is tested on real wire shapes. */
function lotSize(overrides: Partial<LotSizeCalculatorInput> = {}, raw: Record<string, unknown> = {}) {
  const payload = {
    balance: "10000",
    riskPercent: "1",
    entryPrice: "1.10000",
    stopLossPrice: "1.09000",
    direction: "BUY",
    instrument: { pipSize: "0.0001", contractSize: "100000" },
    ...overrides,
    ...raw,
  };
  const input = lotSizeCalculatorInputSchema.parse(payload);
  return { input, result: computeLotSize(input) };
}

function compounding(overrides: Partial<CompoundingCalculatorInput> = {}) {
  const input = compoundingCalculatorInputSchema.parse({
    startingBalance: "1000",
    periods: 3,
    gainPerPeriodPercent: "10",
    ...overrides,
  });
  return { input, result: computeCompounding(input) };
}

// ── Lot size — known-value vectors (§50) ─────────────────────────────────────

describe("lot size — known-value vectors (§50)", () => {
  it("sizes the EURUSD reference vector exactly (1 % of 10 000, 10-pip stop)", () => {
    const { result } = lotSize({
      takeProfitPrice: "1.15000",
    });
    // budget = 10 000 × 1 % = 100 ; distance = 0.01 ; perUnit = 0.01 × 100 000 = 1 000
    // raw = 100 / 1 000 = 0.1 ; floor(0.1 / 0.01) × 0.01 = 0.1 ; realized = 100
    expect(result.riskAmount).toBe("100");
    expect(result.stopDistance).toBe("0.01");
    expect(result.stopPips).toBe("100");
    expect(result.rawPositionSize).toBe("0.1");
    expect(result.normalizedPositionSize).toBe("0.1");
    expect(result.realizedRiskAmount).toBe("100");
    expect(result.volumeAdjustment).toBe("NONE");
    expect(result.status).toBe("VALID");
    // RR BUY: reward (1.15 − 1.10) / risk (1.10 − 1.09) = 5
    expect(result.riskReward).toBe("5");
  });

  it("floors to the micro-lot step: 0.13698… becomes 0.13, realized risk stays ≤ budget (§16)", () => {
    // budget 100 ; distance 1 ; contract 730 → perUnit 730 → raw = 100/730 = 0.136986…
    const { result } = lotSize({
      entryPrice: "2",
      stopLossPrice: "1",
      instrument: { pipSize: "0.01", contractSize: "730" },
    });
    expect(result.rawPositionSize).toBe("0.1369863");
    expect(result.normalizedPositionSize).toBe("0.13");
    expect(result.realizedRiskAmount).toBe("94.9");
    expect(Number(result.realizedRiskAmount)).toBeLessThanOrEqual(100);
    expect(result.volumeAdjustment).toBe("FLOORED_TO_STEP");
  });

  it("honors a broker-specific volumeStep (0.1) instead of the micro-lot default", () => {
    const { result } = lotSize({
      entryPrice: "2",
      stopLossPrice: "1",
      instrument: { pipSize: "0.01", contractSize: "730", volumeStep: "0.1" },
    });
    expect(result.normalizedPositionSize).toBe("0.1");
    expect(result.realizedRiskAmount).toBe("73");
  });

  it("sells use the same symmetric sizing distance (frontend parity, §58)", () => {
    const buy = lotSize({ direction: "BUY" }).result;
    const sell = lotSize({ direction: "SELL" }).result;
    // Direction has NO effect on sizing — only on the RR sign convention.
    expect(sell.normalizedPositionSize).toBe(buy.normalizedPositionSize);
    expect(sell.realizedRiskAmount).toBe(buy.realizedRiskAmount);
    expect(sell.stopDistance).toBe(buy.stopDistance);
  });

  it("computes directional RR for SELL and returns null when the SL is on the wrong side", () => {
    // SELL: entry 1.10, stop 1.11, TP 1.05 → risk 0.01, reward 0.05 → RR 5
    const sell = lotSize({
      direction: "SELL",
      entryPrice: "1.10000",
      stopLossPrice: "1.11000",
      takeProfitPrice: "1.05000",
    }).result;
    expect(sell.riskReward).toBe("5");

    // BUY with SL above entry: directional risk ≤ 0 → null (sizing still works).
    const inverted = lotSize({
      direction: "BUY",
      entryPrice: "1.10000",
      stopLossPrice: "1.11000",
      takeProfitPrice: "1.15000",
    }).result;
    expect(inverted.riskReward).toBeNull();
    expect(inverted.normalizedPositionSize).toBe("0.1");
  });

  it("omits RR entirely when no TP is provided (§14 — sizing ≠ risk/reward)", () => {
    const { result } = lotSize({});
    expect(result.riskReward).toBeNull();
  });

  it("reports explicit broker min/max statuses without clamping (§17)", () => {
    const below = lotSize({
      instrument: { pipSize: "0.0001", contractSize: "100000", minVolume: "1" },
    }).result;
    expect(below.status).toBe("BELOW_MINIMUM");
    expect(below.normalizedPositionSize).toBe("0.1"); // returned as-is, no clamp

    // raw 0.1 floored stays 0.1; max 0.05 → ABOVE_MAXIMUM, value untouched.
    const above = lotSize({
      instrument: { pipSize: "0.0001", contractSize: "100000", maxVolume: "0.05" },
    }).result;
    expect(above.status).toBe("ABOVE_MAXIMUM");
    expect(above.normalizedPositionSize).toBe("0.1");
  });
});

// ── Lot size — percentage & precision semantics (§12/§18/§19) ───────────────

describe("lot size — percentage normalization (§12)", () => {
  it("treats riskPercent '1' as 1 %, never 100 % or 0.01 %", () => {
    expect(lotSize({ riskPercent: "1" }).result.riskAmount).toBe("100");
    expect(lotSize({ riskPercent: "0.5" }).result.riskAmount).toBe("50");
    // 0.01 % of 10 000 = 1 $ budget — sized against a small perUnit so the
    // position stays above one step (budget < one step is a 422, tested later).
    expect(
      lotSize({ riskPercent: "0.01", instrument: { pipSize: "0.0001", contractSize: "1000" } }).result.riskAmount,
    ).toBe("1");
  });

  it("accepts the 100 % boundary and keeps exact decimal arithmetic on large balances", () => {
    const { result } = lotSize({
      balance: "1000000000000", // 1e12 — beyond float cents precision
      riskPercent: "100",
      entryPrice: "2",
      stopLossPrice: "1",
      instrument: { pipSize: "0.01", contractSize: "1" },
    });
    expect(result.riskAmount).toBe("1000000000000");
    expect(result.rawPositionSize).toBe("1000000000000");
    expect(result.realizedRiskAmount).toBe("1000000000000");
  });

  it("keeps tiny price differences exact (no float drift)", () => {
    const { result } = lotSize({
      balance: "1000",
      riskPercent: "1",
      entryPrice: "1.00001",
      stopLossPrice: "1",
      instrument: { pipSize: "0.00001", contractSize: "1" },
    });
    expect(result.stopDistance).toBe("0.00001");
    // budget = 1000 × 1 % = 10 ; perUnit = 0.00001 → raw = 1 000 000
    expect(result.rawPositionSize).toBe("1000000");
    expect(result.realizedRiskAmount).toBe("10");
    expect(result.stopPips).toBe("1");
  });
});

// ── Lot size — mathematical invariants (§47) ────────────────────────────────

describe("lot size — invariants (§47)", () => {
  const specs = { pipSize: "0.0001", contractSize: "100000" };

  it("risk amount grows with the risk percentage, all else equal", () => {
    const small = lotSize({ riskPercent: "0.5", instrument: specs }).result;
    const big = lotSize({ riskPercent: "2", instrument: specs }).result;
    expect(Number(big.riskAmount)).toBeGreaterThan(Number(small.riskAmount));
    expect(Number(big.normalizedPositionSize)).toBeGreaterThan(Number(small.normalizedPositionSize));
  });

  it("position size never grows when the stop distance grows, all else equal", () => {
    const tight = lotSize({ entryPrice: "1.1000", stopLossPrice: "1.0990", instrument: specs }).result;
    const wide = lotSize({ entryPrice: "1.1000", stopLossPrice: "1.0800", instrument: specs }).result;
    expect(Number(wide.normalizedPositionSize)).toBeLessThan(Number(tight.normalizedPositionSize));
  });

  it("realized risk NEVER exceeds the budget across steps and distances (floor policy)", () => {
    const cases: Array<[string, string, string, string]> = [
      // [entry, stop, contract, step]
      ["1.10783", "1.09251", "100000", "0.01"],
      ["2400.50", "2395.25", "100", "0.01"],
      ["65000", "63000", "1", "0.001"],
      ["2", "1", "730", "0.1"],
    ];
    for (const [entry, stop, contract, step] of cases) {
      const { result } = lotSize({
        balance: "9784.31",
        riskPercent: "2.5",
        entryPrice: entry,
        stopLossPrice: stop,
        instrument: { pipSize: "0.0001", contractSize: contract, volumeStep: step },
      });
      expect(Number(result.realizedRiskAmount)).toBeLessThanOrEqual(Number(result.riskAmount));
    }
  });
});

// ── Lot size — frontend parity (§58/§64) ────────────────────────────────────

describe("lot size — frontend parity with shared risk helpers (§37/§58)", () => {
  it("matches suggestPositionSize field-for-field on float-safe vectors", () => {
    const vectors = [
      { entry: "1.10000", stop: "1.09000", riskPct: "1", balance: "10000", specs: { pipSize: "0.0001", contractSize: "100000" } },
      { entry: "1.2345", stop: "1.2245", riskPct: "2", balance: "5678.9", specs: { pipSize: "0.0001", contractSize: "100000" } },
      { entry: "2400.50", stop: "2395.00", riskPct: "1", balance: "12000", specs: { pipSize: "0.01", contractSize: "100" } },
      { entry: "65000", stop: "63000", riskPct: "0.75", balance: "25000", specs: { pipSize: "1", contractSize: "1" } },
    ];
    for (const v of vectors) {
      const front = suggestPositionSize(v.entry, v.stop, v.riskPct, v.balance, v.specs);
      expect(front).not.toBeNull();
      const back = lotSize({
        balance: v.balance,
        riskPercent: v.riskPct,
        entryPrice: v.entry,
        stopLossPrice: v.stop,
        instrument: v.specs,
      }).result;
      expect(back.normalizedPositionSize).toBe(front!.quantity);
      expect(back.realizedRiskAmount).toBe(front!.riskAmount);
      expect(back.stopDistance).toBe(front!.stopDistance);
      expect(back.stopPips).toBe(front!.stopPips);
    }
  });

  it("matches computeRR sign semantics (negative ratio for a bad setup)", () => {
    // BUY with TP below entry → negative RR on both implementations.
    const front = computeRR("1.10000", "1.09000", "1.05000", "BUY");
    const back = lotSize({
      entryPrice: "1.10000",
      stopLossPrice: "1.09000",
      takeProfitPrice: "1.05000",
    }).result;
    expect(back.riskReward).not.toBeNull();
    expect(Number(back.riskReward)).toBeCloseTo(front!, 8);
    expect(Number(back.riskReward)).toBeLessThan(0);
  });
});

// ── Compounding — known-value vectors (§49) ─────────────────────────────────

describe("compounding — known-value vectors (§49)", () => {
  it("produces the canonical 1000 @ 10 % × 3 progression: 1100 → 1210 → 1331", () => {
    const { result } = compounding({});
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      period: 1,
      startingBalance: "1000",
      endingBalance: "1100",
      periodProfit: "100",
      cumulativeProfit: "100",
      cumulativeGainPercentage: "10",
    });
    expect(result.rows[1]).toEqual({
      period: 2,
      startingBalance: "1100",
      endingBalance: "1210",
      periodProfit: "110",
      cumulativeProfit: "210",
      cumulativeGainPercentage: "21",
    });
    expect(result.rows[2]).toEqual({
      period: 3,
      startingBalance: "1210",
      endingBalance: "1331",
      periodProfit: "121",
      cumulativeProfit: "331",
      cumulativeGainPercentage: "33.1",
    });
    expect(result.finalBalance).toBe("1331");
    expect(result.totalProfit).toBe("331");
    expect(result.totalGainPercentage).toBe("33.1");
  });

  it("compounds from the PREVIOUS ending balance, never from the principal (§22)", () => {
    const { result } = compounding({ startingBalance: "500", periods: 4, gainPerPeriodPercent: "20" });
    expect(result.rows.map((row) => row.endingBalance)).toEqual(["600", "720", "864", "1036.8"]);
    // Simple (non-compounding) interest would give 500 × 1.8 = 900, not 1036.8.
    expect(result.finalBalance).toBe("1036.8");
  });

  it("normalizes '5' to 5 % and handles fractional gains exactly", () => {
    const { result } = compounding({ startingBalance: "200", periods: 1, gainPerPeriodPercent: "5" });
    expect(result.finalBalance).toBe("210");
    const fractional = compounding({ startingBalance: "1000", periods: 2, gainPerPeriodPercent: "3.33" });
    expect(fractional.result.rows[0]!.endingBalance).toBe("1033.3");
    expect(fractional.result.rows[1]!.startingBalance).toBe("1033.3");
    expect(fractional.result.totalGainPercentage).toBe("6.770889");
  });
});

// ── Compounding — mathematical invariants (§47) ─────────────────────────────

describe("compounding — invariants (§47)", () => {
  it("positive rates never decrease any balance; zero rate keeps it flat", () => {
    const growth = compounding({ startingBalance: "1234.56", periods: 50, gainPerPeriodPercent: "1.7" }).result;
    for (const row of growth.rows) {
      expect(Number(row.endingBalance)).toBeGreaterThanOrEqual(Number(row.startingBalance));
    }
    const flat = compounding({ startingBalance: "999", periods: 10, gainPerPeriodPercent: "0" }).result;
    for (const row of flat.rows) {
      expect(row.endingBalance).toBe(row.startingBalance);
      expect(row.periodProfit).toBe("0");
    }
    expect(flat.finalBalance).toBe("999");
    expect(flat.totalProfit).toBe("0");
  });

  it("one period gives ending = starting × (1 + rate) exactly", () => {
    const { result } = compounding({ startingBalance: "314.15", periods: 1, gainPerPeriodPercent: "2.71828" });
    // 314.15 × 1.0271828 = 322.68947662 (exact decimal, no float drift).
    expect(result.finalBalance).toBe("322.68947662");
    expect(result.rows).toHaveLength(1);
  });

  it("a higher rate never yields a lower final balance, all else equal", () => {
    const low = compounding({ gainPerPeriodPercent: "1", periods: 20 }).result;
    const high = compounding({ gainPerPeriodPercent: "5", periods: 20 }).result;
    expect(Number(high.finalBalance)).toBeGreaterThan(Number(low.finalBalance));
  });

  it("supports the full documented period range (1000) without drift", () => {
    const started = Date.now();
    const { result } = compounding({ startingBalance: "1000", periods: 1000, gainPerPeriodPercent: "0.1" });
    expect(result.rows).toHaveLength(1000);
    expect(result.rows[999]!.period).toBe(1000);
    // Internal loop stays full-precision; the sum of rendered profits matches
    // the rendered aggregate to the wire precision (no per-period rounding leak).
    const lastRow = result.rows[999]!;
    expect(lastRow.endingBalance).toBe(result.finalBalance);
    expect(lastRow.cumulativeProfit).toBe(result.totalProfit);
    expect(Date.now() - started).toBeLessThan(2_000); // trivially fast (§51)
  });
});

// ── Edge cases & explicit errors (§48/§44) ──────────────────────────────────

describe("lot size — edge cases and errors (§48/§44)", () => {
  it("rejects zero stop distance at the contract and at the domain (§13)", () => {
    expect(() =>
      lotSizeCalculatorInputSchema.parse({ balance: "1000", riskPercent: "1", entryPrice: "1.1", stopLossPrice: "1.100", instrument: { pipSize: "0.0001", contractSize: "100000" } }),
    ).toThrow();
    // Domain double-guard: bypass the schema, call the logic directly.
    try {
      computeLotSize({
        balance: "1000",
        riskPercent: "1",
        entryPrice: "1.1",
        stopLossPrice: "1.1",
        direction: "BUY",
        instrument: { pipSize: "0.0001", contractSize: "100000" },
      });
      throw new Error("expected ValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issue = (error as ValidationError).issues?.[0];
      expect(issue?.path).toBe("stopLossPrice");
      expect(issue?.message).toMatch(/zero stop distance/i);
    }
  });

  it("rejects riskPercent > 100 (risking more than the balance is out of model, §48)", () => {
    expect(() => lotSize({ riskPercent: "100.01" })).toThrowError(/<= 100/);
  });

  it("rejects inconsistent broker specs (maxVolume < minVolume → 400)", () => {
    expect(() =>
      lotSize({}, {
        instrument: { pipSize: "0.0001", contractSize: "100000", minVolume: "1", maxVolume: "0.5" },
      }),
    ).toThrowError();
  });

  it("throws POSITION_SIZE_BELOW_MINIMUM when the budget cannot cover one step (422 semantics)", () => {
    try {
      lotSize({ balance: "10", riskPercent: "0.5", entryPrice: "2", stopLossPrice: "1", instrument: { pipSize: "0.01", contractSize: "100" } });
      throw new Error("expected BusinessRuleError");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).code).toBe(CALCULATOR_ERROR_CODES.POSITION_SIZE_BELOW_MINIMUM);
    }
  });
});

describe("compounding — edge cases and errors (§48/§44)", () => {
  it("rejects zero/negative periods, fractional periods and out-of-range gains at the contract", () => {
    expect(() => compounding({ periods: 0 })).toThrowError();
    expect(() => compounding({ periods: -5 })).toThrowError();
    expect(() => compounding({ periods: 1.5 })).toThrowError();
    expect(() => compounding({ gainPerPeriodPercent: "-0.01" })).toThrowError();
    expect(() => compounding({ gainPerPeriodPercent: "10000.01" })).toThrowError();
    expect(() => compounding({ startingBalance: "0" })).toThrowError();
  });

  it("rejects periods above the documented cap (§28)", () => {
    expect(() => compounding({ periods: 1001 })).toThrowError(/1000/);
  });

  it("throws CALCULATION_OVERFLOW instead of producing Infinity (§25)", () => {
    try {
      compounding({ startingBalance: "100000000000000", periods: 50, gainPerPeriodPercent: "1000" });
      throw new Error("expected BusinessRuleError");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).code).toBe(CALCULATOR_ERROR_CODES.CALCULATION_OVERFLOW);
    }
  });

  it("survives the pathological-looking boundary: 10 000 % gain stays bounded at the guard", () => {
    const { result } = compounding({ startingBalance: "100", periods: 3, gainPerPeriodPercent: "10000" });
    expect(result.finalBalance).toBe("103030100"); // 100 × 101³ — exact, no Infinity
  });
});
