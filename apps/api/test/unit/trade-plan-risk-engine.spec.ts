/**
 * Unit — planned-risk engine (Phase 5 §13/§17/§19/§20 + edge cases §53).
 *
 * Deterministic cases over pure Decimal math: no database, no clock. The
 * reference instrument mirrors the seeded EURUSD catalog row
 * (pip 0.0001, contract 100000, min/step 0.01, max 100, quote USD).
 */
import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { computePlannedRisk } from "../../src/modules/trade-planning/domain/risk-engine";
import type { InstrumentSpecification } from "../../src/modules/trade-planning/domain/ports";

const EURUSD: InstrumentSpecification = {
  symbol: "EURUSD",
  name: "Euro / US Dollar",
  assetClass: "FOREX",
  quoteCurrency: "USD",
  pipSize: new Decimal("0.0001"),
  contractSize: new Decimal("100000"),
  minVolume: new Decimal("0.01"),
  maxVolume: new Decimal("100"),
  volumeStep: new Decimal("0.01"),
};

const BASE = {
  direction: "BUY" as const,
  entryPrice: new Decimal("1.08500"),
  stopLoss: new Decimal("1.08000"),
  takeProfit: new Decimal("1.09500") as Decimal | null,
  balance: new Decimal("10000") as Decimal | null,
  specs: EURUSD as InstrumentSpecification | null,
  fxRate: new Decimal(1) as Decimal | null,
};

function issues(r: ReturnType<typeof computePlannedRisk>) {
  return r.issues.map((i) => i.code);
}

describe("risk engine — deterministic reference cases (§49)", () => {
  it("risk_percent: 10k balance × 1% with a 50-pip stop → exactly 0.20 lots risking 100", () => {
    const r = computePlannedRisk({ ...BASE, sizeMode: "risk_percent", sizeValue: new Decimal("1") });
    expect(r.positionSize?.toFixed()).toBe("0.2");
    expect(r.riskAmount?.toFixed()).toBe("100");
    expect(r.riskPercent?.toFixed()).toBe("1");
    expect(r.stopDistance?.toFixed()).toBe("0.005");
    expect(r.stopPips?.toFixed()).toBe("50");
    expect(r.potentialLoss?.toFixed()).toBe("100");
    // Reward 0.01 over risk 0.005 → exactly 2R (§20).
    expect(r.rrRatio?.toFixed()).toBe("2");
    // 0.2 lots = 20 000 units × 0.01 reward distance = exactly 200.
    expect(r.potentialProfit?.toFixed()).toBe("200");
    expect(r.issues).toEqual([]);
  });

  it("risk_amount: 100 fixed → same size, derives the percent", () => {
    const r = computePlannedRisk({ ...BASE, sizeMode: "risk_amount", sizeValue: new Decimal("100") });
    expect(r.positionSize?.toFixed()).toBe("0.2");
    expect(r.riskAmount?.toFixed()).toBe("100");
    expect(r.riskPercent?.toFixed()).toBe("1");
    expect(r.issues).toEqual([]);
  });

  it("quantity: 0.5 lots → 250 at risk = 2.5% of 10k", () => {
    const r = computePlannedRisk({ ...BASE, sizeMode: "quantity", sizeValue: new Decimal("0.5") });
    expect(r.riskAmount?.toFixed()).toBe("250");
    expect(r.riskPercent?.toFixed()).toBe("2.5");
    expect(r.positionSize?.toFixed()).toBe("0.5");
    expect(r.issues).toEqual([]);
  });

  it("SELL direction mirrors distances (§8/§11)", () => {
    const r = computePlannedRisk({
      ...BASE,
      direction: "SELL",
      entryPrice: new Decimal("1.08500"),
      stopLoss: new Decimal("1.09000"),
      takeProfit: new Decimal("1.07500"),
      sizeMode: "risk_percent",
      sizeValue: new Decimal("1"),
    });
    expect(r.stopDistance?.toFixed()).toBe("0.005");
    expect(r.stopPips?.toFixed()).toBe("50");
    expect(r.rrRatio?.toFixed()).toBe("2");
    expect(r.riskAmount?.toFixed()).toBe("100");
  });
});

describe("risk engine — deterministic flooring (§17)", () => {
  it("floors the suggested size to the volume step so risk never exceeds budget", () => {
    // Budget 100.40 → raw 0.2008 → floor 0.20 → risk 100.00 (≤ budget).
    const r = computePlannedRisk({
      ...BASE,
      sizeMode: "risk_percent",
      sizeValue: new Decimal("1.004"),
    });
    expect(r.positionSize?.toFixed()).toBe("0.2");
    expect(r.riskAmount?.toFixed()).toBe("100");
  });

  it("uses the catalog step, not a hardcoded 0.01, when one exists", () => {
    const us30: InstrumentSpecification = {
      symbol: "US30",
      name: "Dow Jones 30",
      assetClass: "INDEX",
      quoteCurrency: "USD",
      pipSize: new Decimal("1"),
      contractSize: new Decimal("1"),
      minVolume: new Decimal("0.1"),
      maxVolume: new Decimal("100"),
      volumeStep: new Decimal("0.1"),
    };
    const r = computePlannedRisk({
      direction: "BUY",
      entryPrice: new Decimal("39000"),
      stopLoss: new Decimal("38990"),
      takeProfit: null,
      sizeMode: "risk_percent",
      sizeValue: new Decimal("1"),
      balance: new Decimal("5000"),
      specs: us30,
      fxRate: new Decimal(1),
    });
    // Budget 50 / (10 × 1) = 5.0 → stays on the 0.1 grid.
    expect(r.positionSize?.toFixed()).toBe("5");
    expect(r.riskAmount?.toFixed()).toBe("50");
  });
});

describe("risk engine — directional integrity (§11/§12)", () => {
  it("rejects a stop on the wrong side of entry for BUY", () => {
    const r = computePlannedRisk({ ...BASE, stopLoss: new Decimal("1.09000"), sizeMode: "quantity", sizeValue: new Decimal("1") });
    expect(issues(r)).toContain("STOP_LOSS_INVALID_DIRECTION");
    expect(r.riskAmount).toBeNull();
  });

  it("rejects SL = entry (zero risk distance is meaningless)", () => {
    const r = computePlannedRisk({ ...BASE, stopLoss: new Decimal("1.08500"), sizeMode: "quantity", sizeValue: new Decimal("1") });
    expect(issues(r)).toContain("STOP_LOSS_INVALID_DIRECTION");
  });

  it("rejects a target on the wrong side of entry for BUY", () => {
    const r = computePlannedRisk({ ...BASE, takeProfit: new Decimal("1.07000"), sizeMode: "quantity", sizeValue: new Decimal("1") });
    expect(issues(r)).toContain("TAKE_PROFIT_INVALID_DIRECTION");
    expect(r.rrRatio).toBeNull();
  });

  it("rejects TP = entry (zero reward distance is meaningless)", () => {
    const r = computePlannedRisk({ ...BASE, takeProfit: new Decimal("1.08500"), sizeMode: "quantity", sizeValue: new Decimal("1") });
    expect(issues(r)).toContain("TAKE_PROFIT_INVALID_DIRECTION");
  });

  it("flags a missing stop and computes no money risk (never invents risk)", () => {
    const r = computePlannedRisk({ ...BASE, stopLoss: null, sizeMode: "quantity", sizeValue: new Decimal("1") });
    expect(issues(r)).toContain("STOP_LOSS_MISSING");
    expect(r.riskAmount).toBeNull();
    expect(r.rrRatio).toBeNull();
  });

  it("warns (not blocks) when only the target is missing", () => {
    const r = computePlannedRisk({ ...BASE, takeProfit: null, sizeMode: "quantity", sizeValue: new Decimal("1") });
    const tpIssue = r.issues.find((i) => i.code === "RISK_REWARD_UNAVAILABLE");
    expect(tpIssue?.severity).toBe("WARNING");
    expect(r.rrRatio).toBeNull();
    // 1 lot × 0.005 distance × 100000 contract × 1 fx = exactly 500.
    expect(r.riskAmount?.toFixed()).toBe("500");
  });
});

describe("risk engine — instrument specs & currency (§15/§16)", () => {
  it("quantity mode without specs keeps distance metrics, warns on money", () => {
    const r = computePlannedRisk({ ...BASE, specs: null, sizeMode: "quantity", sizeValue: new Decimal("1") });
    const specIssue = r.issues.find((i) => i.code === "INSTRUMENT_SPECIFICATION_MISSING");
    expect(specIssue?.severity).toBe("WARNING");
    expect(r.riskAmount).toBeNull();
    expect(r.stopDistance?.toFixed()).toBe("0.005");
  });

  it("risk modes without specs are blocked (sizing impossible)", () => {
    const r = computePlannedRisk({ ...BASE, specs: null, sizeMode: "risk_percent", sizeValue: new Decimal("1") });
    const specIssue = r.issues.find((i) => i.code === "INSTRUMENT_SPECIFICATION_MISSING");
    expect(specIssue?.severity).toBe("ERROR");
    expect(r.positionSize).toBeNull();
    expect(r.riskAmount).toBeNull();
  });

  it("cross-currency without a rate never fabricates money values (§16)", () => {
    const r = computePlannedRisk({ ...BASE, fxRate: null, sizeMode: "quantity", sizeValue: new Decimal("1") });
    const fxIssue = r.issues.find((i) => i.code === "CURRENCY_CONVERSION_UNAVAILABLE");
    expect(fxIssue?.severity).toBe("WARNING");
    expect(r.riskAmount).toBeNull();
    // The RR ratio is currency-free and stays computable (§19).
    expect(r.rrRatio?.toFixed()).toBe("2");
  });

  it("applies the fx multiplier when one is provided", () => {
    const r = computePlannedRisk({
      ...BASE,
      specs: { ...EURUSD, quoteCurrency: "EUR" },
      fxRate: new Decimal("1.1"),
      sizeMode: "quantity",
      sizeValue: new Decimal("1"),
    });
    expect(r.riskAmount?.toFixed()).toBe("550");
    expect(r.riskPercent?.toFixed()).toBe("5.5");
  });
});

describe("risk engine — volume constraints (§17)", () => {
  it("flags a budget too small for the minimum size", () => {
    // Budget 0.50 / 500 = 0.001 → floors to 0 → below minimum.
    const r = computePlannedRisk({ ...BASE, sizeMode: "risk_percent", sizeValue: new Decimal("0.005") });
    expect(issues(r)).toContain("POSITION_SIZE_BELOW_MINIMUM");
    expect(r.positionSize).toBeNull();
  });

  it("flags sizes above the instrument maximum", () => {
    // 1% of 10M / 500 = 200 lots > max 100.
    const r = computePlannedRisk({
      ...BASE,
      balance: new Decimal("10000000"),
      sizeMode: "risk_percent",
      sizeValue: new Decimal("1"),
    });
    expect(issues(r)).toContain("POSITION_SIZE_ABOVE_MAXIMUM");
    expect(r.positionSize?.toFixed()).toBe("200");
  });
});

describe("risk engine — edge cases (§53)", () => {
  it("zero balance blocks risk-percent sizing", () => {
    const r = computePlannedRisk({ ...BASE, balance: new Decimal("0"), sizeMode: "risk_percent", sizeValue: new Decimal("1") });
    expect(issues(r)).toContain("BALANCE_UNAVAILABLE");
  });

  it("negative balance is treated as no balance", () => {
    const r = computePlannedRisk({ ...BASE, balance: new Decimal("-5"), sizeMode: "risk_amount", sizeValue: new Decimal("100") });
    expect(issues(r)).toContain("BALANCE_UNAVAILABLE");
    expect(r.riskPercent).toBeNull();
  });

  it("decimal precision: 0.05 × 0.1 × 3 is exactly 0.015 (float would drift)", () => {
    const specs: InstrumentSpecification = {
      ...EURUSD,
      contractSize: new Decimal("3"),
      pipSize: new Decimal("0.01"),
    };
    const r = computePlannedRisk({
      direction: "BUY",
      entryPrice: new Decimal("0.10"),
      stopLoss: new Decimal("0.05"),
      takeProfit: null,
      sizeMode: "quantity",
      sizeValue: new Decimal("0.1"),
      balance: new Decimal("100"),
      specs,
      fxRate: new Decimal(1),
    });
    expect(r.riskAmount?.toFixed()).toBe("0.015");
  });

  it("very large budgets stay on the Decimal grid without float artifacts", () => {
    const r = computePlannedRisk({
      ...BASE,
      balance: new Decimal("999999999999"),
      sizeMode: "risk_percent",
      sizeValue: new Decimal("0.01"),
    });
    // Budget = 9999999999.99 → /500 = 19999999.9999 → floored to the step.
    expect(r.positionSize).not.toBeNull();
    expect(r.riskAmount?.lessThanOrEqualTo(9999999999.99)).toBe(true);
  });
});
