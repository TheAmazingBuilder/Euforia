/**
 * Unit - pre-trade validation battery (Phase 5 §21/§22/§23).
 * Composition checks: the engine's findings flow through, the checklist gate
 * and the risk-limit gate add their own, and pass/fail is decided by ERROR
 * severity only (warnings never block).
 */
import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { runValidationBattery } from "../../src/modules/trade-planning/domain/trade-plan-validator";
import type { InstrumentSpecification } from "../../src/modules/trade-planning/domain/ports";
import type { TradePlanChecklistSnapshot } from "../../src/shared/contracts";

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

const CLEAN = {
  direction: "BUY" as const,
  entryPrice: new Decimal("1.08500"),
  stopLoss: new Decimal("1.08000") as Decimal | null,
  takeProfit: new Decimal("1.09500") as Decimal | null,
  sizeMode: "risk_percent" as const,
  sizeValue: new Decimal("1"),
  balance: new Decimal("10000") as Decimal | null,
  specs: EURUSD as InstrumentSpecification | null,
  fxRate: new Decimal(1) as Decimal | null,
  checklist: null as TradePlanChecklistSnapshot | null,
  limits: { maxRiskPercentPerTrade: null, maxRiskAmountPerTrade: null },
};

function checklist(items: Array<[boolean, boolean]>): TradePlanChecklistSnapshot {
  return {
    templateId: null,
    templateName: "Pre-entry discipline",
    items: items.map(([required, checked], index) => ({
      id: `item-${index}`,
      label: `Item ${index}`,
      required,
      checked,
    })),
  };
}

describe("validation battery - pass path", () => {
  it("a clean plan passes with zero issues", () => {
    const result = runValidationBattery(CLEAN);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.risk.positionSize?.toFixed()).toBe("0.2");
  });

  it("warnings do not block: no target, no checklist", () => {
    const result = runValidationBattery({ ...CLEAN, takeProfit: null });
    expect(result.passed).toBe(true);
    expect(result.issues.map((i) => i.code)).toEqual(["RISK_REWARD_UNAVAILABLE"]);
  });
});

describe("validation battery - checklist gate (§23/§24)", () => {
  it("an unchecked required item blocks with a structured finding", () => {
    const result = runValidationBattery({
      ...CLEAN,
      checklist: checklist([
        [true, true],
        [true, false],
        [false, false],
      ]),
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0]!;
    expect(issue.code).toBe("CHECKLIST_INCOMPLETE");
    expect(issue.severity).toBe("ERROR");
    expect(issue.field).toBe("checklist");
    expect(issue.message).toContain("1 required checklist item");
  });

  it("unchecked optional items never block", () => {
    const result = runValidationBattery({
      ...CLEAN,
      checklist: checklist([
        [true, true],
        [false, false],
      ]),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("a fully checked required set passes", () => {
    const result = runValidationBattery({
      ...CLEAN,
      checklist: checklist([
        [true, true],
        [true, true],
      ]),
    });
    expect(result.passed).toBe(true);
  });
});

describe("validation battery - risk-limit gate (§22)", () => {
  it("a configured per-trade percent limit blocks when exceeded", () => {
    const result = runValidationBattery({
      ...CLEAN,
      limits: { maxRiskPercentPerTrade: new Decimal("0.5"), maxRiskAmountPerTrade: null },
    });
    expect(result.passed).toBe(false);
    const issue = result.issues.find((i) => i.code === "RISK_LIMIT_EXCEEDED");
    expect(issue?.severity).toBe("ERROR");
    expect(issue?.field).toBe("size");
  });

  it("a configured per-trade amount limit blocks when exceeded", () => {
    const result = runValidationBattery({
      ...CLEAN,
      limits: { maxRiskPercentPerTrade: null, maxRiskAmountPerTrade: new Decimal("50") },
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("RISK_LIMIT_EXCEEDED");
  });

  it("risk exactly at the limit is not an excess", () => {
    const result = runValidationBattery({
      ...CLEAN,
      limits: { maxRiskPercentPerTrade: new Decimal("1"), maxRiskAmountPerTrade: null },
    });
    expect(result.issues.map((i) => i.code)).not.toContain("RISK_LIMIT_EXCEEDED");
    expect(result.passed).toBe(true);
  });

  it("no limits configured → no invented rules (§22)", () => {
    const result = runValidationBattery(CLEAN);
    expect(result.issues.map((i) => i.code)).not.toContain("RISK_LIMIT_EXCEEDED");
  });
});

describe("validation battery - engine findings flow through", () => {
  it("an inverted stop fails the battery", () => {
    const result = runValidationBattery({ ...CLEAN, stopLoss: new Decimal("1.09000") });
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("STOP_LOSS_INVALID_DIRECTION");
  });

  it("a missing catalog row fails risk-percent sizing", () => {
    const result = runValidationBattery({ ...CLEAN, specs: null });
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("INSTRUMENT_SPECIFICATION_MISSING");
  });
});
