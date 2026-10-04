/**
 * Unit tests — Trading Core authoritative calculations (Phase 4 §46).
 * These functions are THE single financial implementation: their exact
 * outputs are the contract every consumer must observe.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  computeRiskForTrade,
  computeTradeResults,
  resolvePositionSize,
  tradingDateOf,
  wire,
} from "../../src/modules/trades/trade-calculations";

const FX = { contractSize: "100000" }; // EURUSD-like

describe("wire (decimal-string canonicalizer)", () => {
  it("strips trailing zeros and normalizes negative zero", () => {
    expect(wire("12.50")).toBe("12.5");
    expect(wire("0.00")).toBe("0");
    expect(wire(-0)).toBe("0");
    expect(wire("250")).toBe("250");
    expect(wire(new Prisma.Decimal("1.08520000"), 8)).toBe("1.0852");
  });

  it("rounds to the requested precision (half-up)", () => {
    expect(wire("2.475")).toBe("2.48");
    expect(wire("-2.475")).toBe("-2.48");
  });
});

describe("computeTradeResults — the authoritative P&L (§15/§46)", () => {
  it("computes BUY gross/net with fees and swap", () => {
    const results = computeTradeResults(
      {
        direction: "BUY",
        entryPrice: "1.0850",
        exitPrice: "1.0900",
        quantity: "0.5",
        initialStop: null,
        fees: "2.5",
        swap: "0",
        riskAmount: "100",
        mfePrice: null,
        maePrice: null,
      },
      FX.contractSize,
    );
    // Δ = 0.005 × 0.5 × 100000 = 250 net of costs; gross adds costs back.
    expect(results.pnlNet).toBe("247.5");
    expect(results.pnlGross).toBe("250");
    expect(results.rMultiple).toBe(wire(new Prisma.Decimal("247.5").dividedBy("100")));
  });

  it("computes SELL direction (Δ = entry − exit)", () => {
    const win = computeTradeResults(
      {
        direction: "SELL",
        entryPrice: "1.0850",
        exitPrice: "1.0800",
        quantity: "1",
        initialStop: null,
        fees: "0",
        swap: "0",
        riskAmount: null,
        mfePrice: null,
        maePrice: null,
      },
      FX.contractSize,
    );
    expect(win.pnlNet).toBe("500");
    const loss = computeTradeResults(
      {
        direction: "SELL",
        entryPrice: "1.0850",
        exitPrice: "1.0900",
        quantity: "1",
        initialStop: null,
        fees: "0",
        swap: "-1.5",
        riskAmount: null,
        mfePrice: null,
        maePrice: null,
      },
      FX.contractSize,
    );
    expect(loss.pnlNet).toBe("-498.5");
  });

  it("yields null results without an exit (open trade, §11)", () => {
    const results = computeTradeResults(
      {
        direction: "BUY",
        entryPrice: "1.0850",
        exitPrice: null,
        quantity: "0.5",
        initialStop: "1.0800",
        fees: "0",
        swap: "0",
        riskAmount: "100",
        mfePrice: null,
        maePrice: null,
      },
      FX.contractSize,
    );
    expect(results).toEqual({ pnlGross: null, pnlNet: null, rMultiple: null, mfeR: null, maeR: null });
  });

  it("converts MFE/MAE prices to R against the initial stop distance", () => {
    const results = computeTradeResults(
      {
        direction: "BUY",
        entryPrice: "1.0850",
        exitPrice: "1.0900",
        quantity: "0.5",
        initialStop: "1.0800",
        fees: "0",
        swap: "0",
        riskAmount: "100",
        mfePrice: "1.0900",
        maePrice: "1.0825",
      },
      FX.contractSize,
    );
    expect(results.mfeR).toBe("1");
    expect(results.maeR).toBe("0.5");
  });

  it("keeps R conversions null without a stop or without risk", () => {
    const noStop = computeTradeResults(
      {
        direction: "BUY",
        entryPrice: "1.0850",
        exitPrice: "1.0900",
        quantity: "0.5",
        initialStop: null,
        fees: "0",
        swap: "0",
        riskAmount: null,
        mfePrice: "1.0900",
        maePrice: "1.0825",
      },
      FX.contractSize,
    );
    expect(noStop.mfeR).toBeNull();
    expect(noStop.rMultiple).toBeNull();
  });
});

describe("computeRiskForTrade", () => {
  it("returns |entry − stop| × quantity × contractSize", () => {
    expect(
      computeRiskForTrade({ entryPrice: "1.0850", initialStop: "1.0800", quantity: "0.1", contractSize: "100000" }),
    ).toBe("50");
  });

  it("is null without a stop or on degenerate inputs", () => {
    expect(
      computeRiskForTrade({ entryPrice: "1.0850", initialStop: null, quantity: "0.1", contractSize: "100000" }),
    ).toBeNull();
    expect(
      computeRiskForTrade({ entryPrice: "1.0850", initialStop: "1.0850", quantity: "0.1", contractSize: "100000" }),
    ).toBeNull();
  });
});

describe("resolvePositionSize — capture sizing (§15 semantics)", () => {
  it("keeps the client quantity and derives the risked amount", () => {
    const size = resolvePositionSize({
      size: { mode: "quantity", quantity: "0.10" },
      entryPrice: "1.0850",
      initialStop: "1.0800",
      contractSize: "100000",
      balance: "10000",
    });
    expect(size.quantity).toBe("0.10");
    expect(size.riskAmount).toBe("50");
  });

  it("floors risk-budgeted quantities to 0.01 so risk never exceeds budget", () => {
    const size = resolvePositionSize({
      size: { mode: "risk_amount", riskAmount: "100" },
      entryPrice: "1.0850",
      initialStop: "1.0800",
      contractSize: "100000",
      balance: "10000",
    });
    // perUnit = 0.005 × 100000 = 500 → 100 / 500 = 0.2
    expect(size.quantity).toBe("0.2");
    expect(size.riskAmount).toBe("100");
  });

  it("derives the budget from the balance for risk_percent", () => {
    const size = resolvePositionSize({
      size: { mode: "risk_percent", riskPercent: "1" },
      entryPrice: "1.0850",
      initialStop: "1.0800",
      contractSize: "100000",
      balance: "10000",
    });
    expect(size.quantity).toBe("0.2");
    expect(size.riskAmount).toBe("100");
  });

  it("falls back to the minimal unit without a stop (documented limitation)", () => {
    const size = resolvePositionSize({
      size: { mode: "risk_amount", riskAmount: "250" },
      entryPrice: "1.0850",
      initialStop: null,
      contractSize: "100000",
      balance: "10000",
    });
    expect(size.quantity).toBe("0.01");
    expect(size.riskAmount).toBe("250");
  });
});

describe("tradingDateOf — server-side trading day (§22/§56)", () => {
  it("localizes a UTC timestamp to the user's trading day", () => {
    // 23:30 UTC is already the NEXT day in Toronto.
    expect(tradingDateOf("2026-09-17T23:30:00.000Z", "America/Toronto").toISOString().slice(0, 10)).toBe("2026-09-17");
    expect(tradingDateOf("2026-09-17T04:30:00.000Z", "America/Toronto").toISOString().slice(0, 10)).toBe("2026-09-17");
    // Same instant in Paris is 2026-09-18 (02:30 local).
    expect(tradingDateOf("2026-09-18T00:30:00.000Z", "Europe/Paris").toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  it("fails loudly on an unknown timezone (a silent wrong day corrupts aggregates)", () => {
    expect(() => tradingDateOf("2026-09-17T12:00:00.000Z", "Mars/Olympus")).toThrow();
  });
});
