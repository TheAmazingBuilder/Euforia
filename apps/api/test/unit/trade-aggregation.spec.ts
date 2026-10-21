/**
 * Unit — Trade aggregation (Phase 4 §47).
 *
 * The authoritative financial implementation must be exact (no float drift),
 * symmetric for BUY/SELL, correct across partial closes, scale-in and
 * scale-out, and honest about unknown costs (§20: nothing invented).
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  aggregateExecutions,
  tradingDateKey,
  type AggregationExecution,
} from "../../src/modules/trading/trade-aggregation.service";

function at(iso: string): Date {
  return new Date(iso);
}

function execution(overrides: Partial<AggregationExecution> & { role: "ENTRY" | "EXIT" }): AggregationExecution {
  return {
    side: undefined as never,
    volume: "1",
    price: "100",
    profit: null,
    commission: null,
    swap: null,
    executedAt: at("2026-03-02T10:00:00.000Z"),
    ...overrides,
  } as AggregationExecution;
}

describe("aggregateExecutions — lifecycle & quantities", () => {
  it("an entry-only trade is OPEN with no exit aggregates", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "0.5", price: "2000", executedAt: at("2026-03-02T10:00:00Z") }),
    ]);
    expect(result.status).toBe("OPEN");
    expect(result.quantity.toFixed()).toBe("0.5");
    expect(result.closedQuantity.toFixed()).toBe("0");
    expect(result.entryPrice?.toFixed()).toBe("2000");
    expect(result.exitPrice).toBeNull();
    expect(result.exitAt).toBeNull();
    expect(result.entryAt?.toISOString()).toBe("2026-03-02T10:00:00.000Z");
  });

  it("a trade with a full exit is CLOSED with exitAt", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100", executedAt: at("2026-03-02T10:00:00Z") }),
      execution({ role: "EXIT", volume: "1", price: "110", profit: "10", executedAt: at("2026-03-02T12:00:00Z") }),
    ]);
    expect(result.status).toBe("CLOSED");
    expect(result.exitPrice?.toFixed()).toBe("110");
    expect(result.exitAt?.toISOString()).toBe("2026-03-02T12:00:00.000Z");
  });

  it("a partial exit stays OPEN (closedQuantity < quantity)", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100" }),
      execution({ role: "EXIT", volume: "0.4", price: "105", profit: "2" }),
    ]);
    expect(result.status).toBe("OPEN");
    expect(result.closedQuantity.toFixed()).toBe("0.4");
    expect(result.exitPrice?.toFixed()).toBe("105");
  });
});

describe("aggregateExecutions — weighted prices (§17/§19)", () => {
  it("weights scale-in entries by volume", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100" }),
      execution({ role: "ENTRY", volume: "3", price: "200" }),
    ]);
    // (1×100 + 3×200) / 4 = 175
    expect(result.entryPrice?.toFixed()).toBe("175");
    expect(result.quantity.toFixed()).toBe("4");
  });

  it("weights multiple exit legs by volume", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100" }),
      execution({ role: "EXIT", volume: "0.6", price: "110" }),
      execution({ role: "EXIT", volume: "0.4", price: "90" }),
    ]);
    // (0.6×110 + 0.4×90) / 1 = 102
    expect(result.exitPrice?.toFixed()).toBe("102");
    expect(result.closedQuantity.toFixed()).toBe("1");
  });
});

describe("aggregateExecutions — P&L, fees, swap (§20/§46)", () => {
  it("computes net = gross − fees + swap with provider-signed values", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100", commission: "-2", swap: "-0.5" }),
      execution({ role: "EXIT", volume: "1", price: "110", profit: "10", commission: "-2", swap: "-0.5" }),
    ]);
    expect(result.fees.toFixed()).toBe("4"); // −(−2 + −2)
    expect(result.swap.toFixed()).toBe("-1");
    expect(result.pnlGross?.toFixed()).toBe("10");
    expect(result.pnlNet?.toFixed()).toBe("5"); // 10 − 4 + (−1)
  });

  it("handles long and short symmetrically (P&L comes from the provider, not direction math)", () => {
    const long = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100" }),
      execution({ role: "EXIT", volume: "1", price: "110", profit: "10" }),
    ]);
    const short = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "110" }),
      execution({ role: "EXIT", volume: "1", price: "100", profit: "10" }),
    ]);
    expect(long.pnlNet?.toFixed()).toBe("10");
    expect(short.pnlNet?.toFixed()).toBe("10");
  });

  it("never invents P&L: all-unknown profits yield null gross and net", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100" }),
      execution({ role: "EXIT", volume: "1", price: "110", profit: null }),
    ]);
    expect(result.pnlGross).toBeNull();
    expect(result.pnlNet).toBeNull();
    expect(result.rMultiple).toBeNull();
  });

  it("unknown (null) profit legs contribute zero once one leg is known (MT5 entry deals)", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "1", price: "100", profit: null }),
      execution({ role: "EXIT", volume: "1", price: "110", profit: "10" }),
    ]);
    expect(result.pnlGross?.toFixed()).toBe("10");
  });

  it("computes rMultiple only from a positive riskAmount", () => {
    const withRisk = aggregateExecutions(
      [
        execution({ role: "ENTRY", volume: "1", price: "100" }),
        execution({ role: "EXIT", volume: "1", price: "110", profit: "50" }),
      ],
      { riskAmount: "10" },
    );
    expect(withRisk.rMultiple?.toFixed()).toBe("5");

    const zeroRisk = aggregateExecutions(
      [execution({ role: "ENTRY", volume: "1", price: "100" })],
      { riskAmount: "0" },
    );
    expect(zeroRisk.rMultiple).toBeNull();
  });

  it("is exact in decimal arithmetic (no float drift)", () => {
    const result = aggregateExecutions([
      execution({ role: "ENTRY", volume: "0.1", price: "0.1" }),
      execution({ role: "ENTRY", volume: "0.2", price: "0.2" }),
    ]);
    // 0.1×0.1 + 0.2×0.2 = 0.05; / 0.3 = 0.16666666… → exact Decimal division
    expect(result.entryPrice).toBeInstanceOf(Prisma.Decimal);
    expect(result.quantity.toFixed()).toBe("0.3");
  });
});

describe("tradingDateKey (§22/§56 — server-side, never browser time)", () => {
  it("maps a UTC instant to the user's local trading day", () => {
    // 2026-03-02T23:30Z is 2026-03-03 in Asia/Tokyo and 2026-03-02 in UTC.
    const instant = at("2026-03-02T23:30:00.000Z");
    expect(tradingDateKey(instant, "Asia/Tokyo")).toBe("2026-03-03");
    expect(tradingDateKey(instant, "UTC")).toBe("2026-03-02");
    expect(tradingDateKey(instant, "America/Toronto")).toBe("2026-03-02");
  });

  it("falls back to UTC for invalid timezones", () => {
    const instant = at("2026-03-02T10:00:00.000Z");
    expect(tradingDateKey(instant, "Not/AZone")).toBe("2026-03-02");
    expect(tradingDateKey(instant, null)).toBe("2026-03-02");
  });
});
