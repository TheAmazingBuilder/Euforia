/**
 * Unit — plan-vs-actual comparison engine (Phase 6 §12/§27/§28/§54/§55/§67).
 *
 * The engine produces OBJECTIVE deviations only — no quality scores, no
 * tolerance labels (§55/§56). Financial math runs on decimal strings.
 */
import { describe, expect, it } from "vitest";

import {
  comparePlanAgainstTrade,
  type ComparisonPlanInput,
  type ComparisonTradeInput,
} from "../../src/modules/trade-review/domain/plan-vs-actual";

const EURUSD_SPECS = { pipSize: "0.0001" };

/** Canonical EURUSD plan: BUY 1.08500 / SL 1.08000 / TP 1.09500, 100 risk, 2R. */
function plan(overrides: Partial<ComparisonPlanInput> = {}): ComparisonPlanInput {
  return {
    direction: "BUY",
    entryPrice: "1.08500",
    stopLoss: "1.08000",
    takeProfit: "1.09500",
    riskAmount: "100",
    positionSize: "1",
    rrRatio: "2",
    ...overrides,
  };
}

function trade(overrides: Partial<ComparisonTradeInput> = {}): ComparisonTradeInput {
  return {
    direction: "BUY",
    entryPrice: "1.08500",
    initialStop: "1.08000",
    initialTP: "1.09500",
    riskAmount: "100",
    quantity: "1",
    rMultiple: "2",
    ...overrides,
  };
}

describe("plan-vs-actual — exact adherence (§67)", () => {
  it("reports zero deviations when the trade realized the plan exactly", () => {
    const result = comparePlanAgainstTrade(plan(), trade(), EURUSD_SPECS, "SNAPSHOT");
    expect(result.hasPlan).toBe(true);
    expect(result.basedOn).toBe("SNAPSHOT");
    expect(result.direction.match).toBe(true);
    for (const leg of [result.entry, result.stop, result.target, result.risk, result.size]) {
      expect(leg.available).toBe(true);
      expect(leg.deviation).toBe("0");
    }
    expect(result.entry.deviationPips).toBe(0);
    expect(result.rMultiple.deviation).toBe("0");
  });
});

describe("plan-vs-actual — deviations (§67)", () => {
  it("computes entry deviation in price space and pips", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ entryPrice: "1.08560" }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.entry.deviation).toBe("0.0006"); // 6 pips late
    expect(result.entry.deviationPips).toBe(6);
  });

  it("computes stop deviation (moved stop)", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ initialStop: "1.08150" }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.stop.deviation).toBe("0.0015");
    expect(result.stop.deviationPips).toBe(15);
  });

  it("computes risk deviation in money", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ riskAmount: "140" }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.risk.deviation).toBe("40");
    // Pips are a price-space unit — a money leg has none.
    expect(result.risk.deviationPips).toBeNull();
  });

  it("computes size deviation (planned lots vs filled quantity)", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ quantity: "1.4" }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.size.deviation).toBe("0.4");
  });

  it("reports the planned-RR vs realized-R gap with canonical semantics (§28)", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ rMultiple: "1.4" }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.rMultiple.planned).toBe("2");
    expect(result.rMultiple.actual).toBe("1.4");
    expect(result.rMultiple.deviation).toBe("-0.6");
  });

  it("flags a direction mismatch without inventing a quality judgment", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ direction: "SELL", entryPrice: "1.08560" }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.direction.match).toBe(false);
    // Entry deviation still computed — SELL at 1.0856 vs planned 1.085.
    expect(result.entry.deviation).toBe("0.0006");
  });
});

describe("plan-vs-actual — missing legs (§67: no fabrication)", () => {
  it("marks legs unavailable when the plan has no stop/target", () => {
    const result = comparePlanAgainstTrade(
      plan({ stopLoss: null, takeProfit: null, rrRatio: null }),
      trade(),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.stop.available).toBe(false);
    expect(result.stop.planned).toBeNull();
    // Decimal wire convention: trailing zeros normalized ("1.08000" → "1.08").
    expect(result.stop.actual).toBe("1.08");
    expect(result.stop.deviation).toBeNull();
    expect(result.target.available).toBe(false);
    expect(result.rMultiple.available).toBe(false);
  });

  it("marks legs unavailable when the trade lacks the fact (sync trade risk)", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ riskAmount: null, rMultiple: null, initialStop: null, initialTP: null }),
      EURUSD_SPECS,
      "SNAPSHOT",
    );
    expect(result.risk.available).toBe(false);
    expect(result.risk.planned).toBe("100");
    expect(result.risk.actual).toBeNull();
    expect(result.stop.available).toBe(false);
    expect(result.target.available).toBe(false);
    expect(result.rMultiple.available).toBe(false);
    // Entry/size remain computable.
    expect(result.entry.available).toBe(true);
    expect(result.size.available).toBe(true);
  });

  it("handles the no-plan trade — review still functions (§67)", () => {
    const result = comparePlanAgainstTrade(null, trade(), EURUSD_SPECS, "NONE");
    expect(result.hasPlan).toBe(false);
    expect(result.basedOn).toBe("NONE");
    expect(result.direction.planned).toBeNull();
    expect(result.direction.match).toBeNull();
    expect(result.entry.planned).toBeNull();
    expect(result.entry.actual).toBe("1.085");
    expect(result.entry.available).toBe(false);
    expect(result.entry.deviation).toBeNull();
  });

  it("null pips when the catalog does not know the symbol (still price-space)", () => {
    const result = comparePlanAgainstTrade(
      plan(),
      trade({ entryPrice: "1.08560" }),
      { pipSize: null },
      "SNAPSHOT",
    );
    expect(result.entry.deviation).toBe("0.0006");
    expect(result.entry.deviationPips).toBeNull();
  });
});

describe("plan-vs-actual — decimal integrity (§40)", () => {
  it("keeps exact decimal arithmetic (no binary-float drift)", () => {
    const result = comparePlanAgainstTrade(
      plan({ entryPrice: "0.1" }),
      trade({ entryPrice: "0.10005" }),
      { pipSize: "0.0001" },
      "SNAPSHOT",
    );
    // 0.10005 − 0.1 === 0.00005 exactly (a float would drift).
    expect(result.entry.deviation).toBe("0.00005");
    expect(result.entry.deviationPips).toBe(0.5);
  });
});
