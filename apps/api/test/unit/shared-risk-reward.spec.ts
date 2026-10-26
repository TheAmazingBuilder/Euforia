/**
 * Unit - shared Risk/Reward expectancy engine (utils/risk-reward.ts): the
 * frontend LIVE-ESTIMATE layer behind the TOOLS > Risk/Reward Calculator &
 * Win Rate Cheat Sheet. Pure math, no I/O. Covers the spec §13.1 test matrix
 * (Tests A–L) plus the edge cases introduced by the implementation.
 */
import { describe, expect, it } from "vitest";

import {
  buildRiskRewardMatrix,
  computeBreakEvenWinRate,
  computeExpectancy,
  computePercentOfBalance,
  computeRewardAmount,
  computeRewardMultiple,
  computeRiskPerTrade,
  RR_DEFAULT_RATIOS,
  RR_DEFAULT_WIN_RATES,
  RR_EXTRA_RATIOS,
} from "../../../../packages/shared/src/utils/risk-reward";

// ── Test A - risk amount (percent mode) ──────────────────────────────────────

describe("risk amount", () => {
  it("A - $1,000 balance at 2% risk → $20", () => {
    expect(computeRiskPerTrade({ mode: "percent", balance: 1000, riskPercent: 2, fixedRiskAmount: 0 })).toBe(20);
  });

  it("H - percent and fixed modes agree on the same monetary risk", () => {
    const percent = computeRiskPerTrade({ mode: "percent", balance: 1000, riskPercent: 2, fixedRiskAmount: 0 });
    const fixed = computeRiskPerTrade({ mode: "fixed", balance: 1000, riskPercent: 0, fixedRiskAmount: 20 });
    expect(percent).toBe(20);
    expect(fixed).toBe(20);
  });

  it("rejects non-positive balance, out-of-range percent and non-positive fixed risk", () => {
    expect(computeRiskPerTrade({ mode: "percent", balance: 0, riskPercent: 2, fixedRiskAmount: 0 })).toBeNull();
    expect(computeRiskPerTrade({ mode: "percent", balance: 1000, riskPercent: 0, fixedRiskAmount: 0 })).toBeNull();
    expect(computeRiskPerTrade({ mode: "percent", balance: 1000, riskPercent: 101, fixedRiskAmount: 0 })).toBeNull();
    expect(computeRiskPerTrade({ mode: "fixed", balance: 1000, riskPercent: 0, fixedRiskAmount: 0 })).toBeNull();
    expect(computeRiskPerTrade({ mode: "fixed", balance: 1000, riskPercent: 0, fixedRiskAmount: -5 })).toBeNull();
    expect(computeRiskPerTrade({ mode: "percent", balance: Number.NaN, riskPercent: 2, fixedRiskAmount: 0 })).toBeNull();
  });
});

// ── Test B - reward amount ───────────────────────────────────────────────────

describe("reward amount", () => {
  it("B - $20 risk at reward multiple 3 → $60", () => {
    expect(computeRewardAmount(20, 3)).toBe(60);
  });

  it("rejects zero/negative risk and out-of-range multiples", () => {
    expect(computeRewardAmount(0, 3)).toBeNull();
    expect(computeRewardAmount(20, 0)).toBeNull();
    expect(computeRewardAmount(20, -1)).toBeNull();
    expect(computeRewardAmount(20, 1001)).toBeNull();
  });
});

// ── Reward multiple from monetary SL/TP amounts ──────────────────────────────

describe("reward multiple from amounts", () => {
  it("$20 stop / $60 take profit → R = 3 (displayed 1:3)", () => {
    expect(computeRewardMultiple(20, 60)).toBe(3);
  });

  it("zero stop-loss is reported, never absorbed as Infinity", () => {
    expect(computeRewardMultiple(0, 60)).toBeNull();
    expect(computeRewardMultiple(20, 0)).toBeNull();
    expect(computeRewardMultiple(-20, 60)).toBeNull();
  });

  it("non-integer ratios pass through untouched", () => {
    expect(computeRewardMultiple(30, 100)).toBeCloseTo(3.333333, 6);
  });
});

// ── Tests C & D - break-even threshold ───────────────────────────────────────

describe("break-even win rate", () => {
  it("C - R = 1 → 50%", () => {
    expect(computeBreakEvenWinRate(1)).toBe(0.5);
  });

  it("D - R = 3 → 25%", () => {
    expect(computeBreakEvenWinRate(3)).toBe(0.25);
  });

  it("R = 2 → 33.33…% and R = 5 → 16.67…% (spec §5.2 examples)", () => {
    expect(computeBreakEvenWinRate(2)).toBeCloseTo(1 / 3, 12);
    expect(computeBreakEvenWinRate(5)).toBeCloseTo(1 / 6, 12);
  });

  it("rejects invalid multiples", () => {
    expect(computeBreakEvenWinRate(0)).toBeNull();
    expect(computeBreakEvenWinRate(-3)).toBeNull();
  });
});

// ── Percent of balance ───────────────────────────────────────────────────────

describe("percent of balance", () => {
  it("$20 on $1,000 → 2% ratio", () => {
    expect(computePercentOfBalance(20, 1000)).toBe(0.02);
  });

  it("rejects an invalid balance", () => {
    expect(computePercentOfBalance(20, 0)).toBeNull();
  });
});

// ── Tests E–G - matrix cells ─────────────────────────────────────────────────

describe("expectancy - spec §13.1 matrix cells", () => {
  it("E - losing cell: $20 risk, R=2, 20% over 100 trades → −$800 (LOSS)", () => {
    // NOTE (spec §13.1 Test E discrepancy): the spec states "Reward multiple: 2"
    // but its printed amounts ($1,200 gross / −$400 net) correspond to R=3.
    // The primary formula P = N×L×[pR − (1−p)] (spec §6) gives −$800 for R=2.
    // Mathematical correctness wins (spec, Final Instruction); the R=3 variant
    // reproducing the spec's literal −$400 vector is asserted right below.
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 20, trades: 100 });
    expect(cell).not.toBeNull();
    expect(cell!.wins).toBe(20); // 100 × 20%
    expect(cell!.losses).toBe(80);
    expect(cell!.grossProfit).toBe(800); // 20 × $40
    expect(cell!.grossLoss).toBe(1600); // 80 × $20
    expect(cell!.net).toBe(-800);
    expect(cell!.netDecimal).toBe("-800");
    expect(cell!.outcome).toBe("loss");
  });

  it("E' - the spec's literal −$400 vector (R=3): gross $1,200 − losses $1,600 (LOSS)", () => {
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 3, winRatePercent: 20, trades: 100 });
    expect(cell).not.toBeNull();
    expect(cell!.grossProfit).toBe(1200); // 20 × $60
    expect(cell!.grossLoss).toBe(1600); // 80 × $20
    expect(cell!.net).toBe(-400);
    expect(cell!.outcome).toBe("loss");
  });

  it("F - break-even cell: $20 risk, R=1, 50% over 100 trades → $0 (BREAK EVEN)", () => {
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 1, winRatePercent: 50, trades: 100 });
    expect(cell).not.toBeNull();
    expect(cell!.grossProfit).toBe(1000);
    expect(cell!.grossLoss).toBe(1000);
    expect(cell!.net).toBe(0);
    expect(cell!.netDecimal).toBe("0");
    expect(cell!.outcome).toBe("breakeven");
  });

  it("G - profitable cell: $20 risk, R=3, 40% over 100 trades → +$1,200 (PROFIT)", () => {
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 3, winRatePercent: 40, trades: 100 });
    expect(cell).not.toBeNull();
    expect(cell!.grossProfit).toBe(2400); // 40 × $60
    expect(cell!.grossLoss).toBe(1200); // 60 × $20
    expect(cell!.net).toBe(1200);
    expect(cell!.netDecimal).toBe("1200");
    expect(cell!.outcome).toBe("profit");
  });

  it("closed form P = N × L × [pR − (1 − p)] matches the two-step computation", () => {
    const risk = 35.5;
    const R = 2.75;
    const p = 0.47;
    const N = 340;
    const cell = computeExpectancy({ riskAmount: risk, rewardMultiple: R, winRatePercent: p * 100, trades: N });
    const closed = N * risk * (p * R - (1 - p));
    expect(cell!.net).toBeCloseTo(closed, 6);
  });
});

// ── Test I - invalid inputs ──────────────────────────────────────────────────

describe("expectancy - invalid inputs", () => {
  it("zero risk, invalid multiple, out-of-range win rate, bad trade counts → null", () => {
    expect(computeExpectancy({ riskAmount: 0, rewardMultiple: 2, winRatePercent: 50, trades: 100 })).toBeNull();
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 0, winRatePercent: 50, trades: 100 })).toBeNull();
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: -1, trades: 100 })).toBeNull();
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 101, trades: 100 })).toBeNull();
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 50, trades: 0 })).toBeNull();
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 50, trades: -10 })).toBeNull();
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 50, trades: 99.5 })).toBeNull();
    expect(
      computeExpectancy({ riskAmount: Number.NaN, rewardMultiple: 2, winRatePercent: 50, trades: 100 }),
    ).toBeNull();
    expect(
      computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: Number.POSITIVE_INFINITY, trades: 100 }),
    ).toBeNull();
  });

  it("trade count above the 1,000,000 cap → null", () => {
    expect(computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 50, trades: 1_000_001 })).toBeNull();
  });
});

// ── Test J - fractional expected wins ────────────────────────────────────────

describe("expectancy - fractional expected wins", () => {
  it("33.3% of 100 trades keeps 33.3 expected wins - NO premature rounding", () => {
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 2, winRatePercent: 33.3, trades: 100 });
    expect(cell).not.toBeNull();
    expect(cell!.wins).toBeCloseTo(33.3, 10);
    expect(cell!.losses).toBeCloseTo(66.7, 10);
    // 33.3 × $40 − 66.7 × $20 = 1332 − 1334 = −2
    expect(cell!.net).toBeCloseTo(-2, 6);
    expect(cell!.outcome).toBe("loss");
  });

  it("7 wins out of 12 trades at 58.333…% stays fractional", () => {
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 1, winRatePercent: 100 * (7 / 12), trades: 12 });
    expect(cell).not.toBeNull();
    expect(cell!.wins).toBeCloseTo(7, 10);
    // 7 winning × $20 − 5 losing × $20 = +$40 - above the 50% break-even at R=1.
    expect(cell!.net).toBeCloseTo(40, 9);
    expect(cell!.outcome).toBe("profit");
  });
});

// ── Test K - near-zero precision & classification ────────────────────────────

describe("expectancy - near-zero classification", () => {
  it("theoretical break-even at R=3 / 25% over 100 trades classifies as BREAK EVEN despite float noise", () => {
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 3, winRatePercent: 25, trades: 100 });
    expect(cell).not.toBeNull();
    expect(Math.abs(cell!.net)).toBeLessThan(1e-6);
    expect(cell!.outcome).toBe("breakeven");
    expect(cell!.netDecimal).toBe("0");
  });

  it("a tiny GENUINE negative beyond tolerance stays LOSS (never rounded to break even)", () => {
    // 10 trades, R=1, p=49.99999% → net = 10×20×(0.4999999 − 0.5000001)… = −0.00008
    const cell = computeExpectancy({ riskAmount: 20, rewardMultiple: 1, winRatePercent: 49.999, trades: 1000 });
    expect(cell).not.toBeNull();
    expect(cell!.net).toBeLessThan(0);
    expect(cell!.outcome).toBe("loss");
  });
});

// ── Test L - matrix completeness ─────────────────────────────────────────────

describe("matrix builder - completeness", () => {
  it("every default row × column combination computes with the correct classification", () => {
    const matrix = buildRiskRewardMatrix({
      riskAmount: 20,
      trades: 100,
      winRates: RR_DEFAULT_WIN_RATES,
      rewardMultiples: RR_DEFAULT_RATIOS,
    });
    expect(matrix).toHaveLength(RR_DEFAULT_RATIOS.length);
    for (const row of matrix) {
      expect(row.cells).toHaveLength(RR_DEFAULT_WIN_RATES.length);
      for (const cell of row.cells) {
        expect(cell.expectancy).not.toBeNull();
        const be = computeBreakEvenWinRate(row.rewardMultiple)!;
        const expected: "loss" | "breakeven" | "profit" =
          cell.winRatePercent / 100 > be ? "profit" : cell.winRatePercent / 100 < be ? "loss" : "breakeven";
        expect(cell.expectancy!.outcome).toBe(expected);
      }
    }
  });

  it("supports the extra ratios 1:6, 1:8, 1:10", () => {
    const matrix = buildRiskRewardMatrix({
      riskAmount: 20,
      trades: 100,
      winRates: [50],
      rewardMultiples: RR_EXTRA_RATIOS,
    });
    expect(matrix.map((row) => row.rewardMultiple)).toEqual([6, 8, 10]);
    // At 50% win rate, every R > 1 is profitable.
    for (const row of matrix) {
      expect(row.cells[0]!.expectancy!.outcome).toBe("profit");
    }
  });

  it("propagates per-cell null instead of a fabricated result on invalid inputs", () => {
    const matrix = buildRiskRewardMatrix({
      riskAmount: 20,
      trades: 100,
      winRates: [150], // invalid column - must surface as null, not a fake cell
      rewardMultiples: [1],
    });
    expect(matrix[0]!.cells[0]!.expectancy).toBeNull();
  });
});
