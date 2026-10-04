/**
 * Unit tests — deal→trade reconstruction (Phase 4 §17–§19, §27, §28).
 * Pure aggregation semantics over normalized Phase 3 deals.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { groupByPosition, reconstructCycle } from "../../src/modules/trades/trade-reconstruction.service";
import type { DealRow } from "../../src/modules/accounts/accounts.repository";

function deal(overrides: Partial<DealRow> & Pick<DealRow, "externalDealId" | "side" | "volume">): DealRow {
  return {
    id: crypto.randomUUID(),
    accountId: "00000000-0000-4000-8000-000000000001",
    symbol: "EURUSD",
    price: new Prisma.Decimal("1.0000"),
    profit: new Prisma.Decimal("0"),
    commission: null,
    swap: null,
    positionId: "pos-1",
    executedAt: new Date("2026-01-05T09:30:00.000Z"),
    syncedAt: new Date("2026-01-05T09:30:00.000Z"),
    ...overrides,
  };
}

const d = (offsetMinutes: number): Date => new Date(Date.parse("2026-01-05T09:30:00.000Z") + offsetMinutes * 60_000);

describe("groupByPosition", () => {
  it("groups deals by position and ignores balance operations", () => {
    const cycles = groupByPosition([
      deal({ externalDealId: "d1", side: "BUY", volume: new Prisma.Decimal("0.2"), positionId: "pos-1", executedAt: d(0) }),
      deal({ externalDealId: "d2", side: "SELL", volume: new Prisma.Decimal("0"), symbol: null, positionId: null, profit: new Prisma.Decimal("1000"), executedAt: d(1) }),
      deal({ externalDealId: "d3", side: "SELL", volume: new Prisma.Decimal("0.2"), positionId: "pos-1", executedAt: d(2) }),
      deal({ externalDealId: "d4", side: "BUY", volume: new Prisma.Decimal("0.1"), positionId: "pos-2", executedAt: d(3) }),
    ]);
    expect(cycles.map((cycle) => cycle.positionId)).toEqual(["pos-1", "pos-2"]);
    expect(cycles[0]?.deals).toHaveLength(2);
  });

  it("returns deals in execution order within a cycle", () => {
    const cycles = groupByPosition([
      deal({ externalDealId: "late", side: "SELL", volume: new Prisma.Decimal("0.2"), positionId: "pos-1", executedAt: d(9) }),
      deal({ externalDealId: "early", side: "BUY", volume: new Prisma.Decimal("0.2"), positionId: "pos-1", executedAt: d(0) }),
    ]);
    expect(cycles[0]?.deals.map((deal) => deal.externalDealId)).toEqual(["early", "late"]);
  });
});

describe("reconstructCycle — §17 execution aggregation", () => {
  it("rebuilds a closed BUY trade with weighted prices and provider costs", () => {
    const trade = reconstructCycle({
      positionId: "pos-1",
      symbol: "EURUSD",
      deals: [
        deal({ externalDealId: "in1", side: "BUY", volume: new Prisma.Decimal("0.1"), price: new Prisma.Decimal("1.0000"), commission: new Prisma.Decimal("-1"), executedAt: d(0) }),
        deal({ externalDealId: "in2", side: "BUY", volume: new Prisma.Decimal("0.1"), price: new Prisma.Decimal("1.2000"), commission: new Prisma.Decimal("-1"), executedAt: d(5) }),
        deal({ externalDealId: "out1", side: "SELL", volume: new Prisma.Decimal("0.2"), price: new Prisma.Decimal("1.1000"), profit: new Prisma.Decimal("90"), commission: new Prisma.Decimal("-1"), executedAt: d(60) }),
      ],
    });
    expect(trade.status).toBe("CLOSED");
    expect(trade.direction).toBe("BUY");
    expect(trade.quantity).toBe("0.2");
    // Weighted entry: (0.1×1.0 + 0.1×1.2) / 0.2 = 1.1 (scale-in, §19).
    expect(trade.entryPrice).toBe("1.1");
    expect(trade.exitPrice).toBe("1.1");
    // Provider supplies the costs (§20): fees = |−3| = 3, net = 90 − 3 − 0.
    expect(trade.fees).toBe("3");
    expect(trade.pnlGross).toBe("90");
    expect(trade.pnlNet).toBe("87");
    expect(trade.exits).toHaveLength(1);
    expect(trade.exitAt?.toISOString()).toBe(d(60).toISOString());
  });

  it("rebuilds partial exits as preserved legs (§18 — no flattening)", () => {
    const trade = reconstructCycle({
      positionId: "pos-1",
      symbol: "EURUSD",
      deals: [
        deal({ externalDealId: "in1", side: "BUY", volume: new Prisma.Decimal("1.0"), price: new Prisma.Decimal("2.0000"), executedAt: d(0) }),
        deal({ externalDealId: "out1", side: "SELL", volume: new Prisma.Decimal("0.4"), price: new Prisma.Decimal("2.1000"), profit: new Prisma.Decimal("40"), executedAt: d(10) }),
        deal({ externalDealId: "out2", side: "SELL", volume: new Prisma.Decimal("0.6"), price: new Prisma.Decimal("2.2000"), profit: new Prisma.Decimal("60"), executedAt: d(20) }),
      ],
    });
    expect(trade.status).toBe("CLOSED");
    expect(trade.quantity).toBe("1");
    // Weighted exit: (0.4×2.1 + 0.6×2.2) / 1.0 = 2.16.
    expect(trade.exitPrice).toBe("2.16");
    expect(trade.exits.map((exit) => exit.quantity)).toEqual(["0.4", "0.6"]);
    expect(trade.pnlGross).toBe("100");
  });

  it("keeps an under-closed position OPEN with entry aggregates", () => {
    const trade = reconstructCycle({
      positionId: "pos-1",
      symbol: "EURUSD",
      deals: [
        deal({ externalDealId: "in1", side: "SELL", volume: new Prisma.Decimal("0.3"), price: new Prisma.Decimal("1.5000"), executedAt: d(0) }),
        deal({ externalDealId: "out1", side: "BUY", volume: new Prisma.Decimal("0.1"), price: new Prisma.Decimal("1.4500"), profit: new Prisma.Decimal("5"), executedAt: d(10) }),
      ],
    });
    expect(trade.status).toBe("OPEN");
    expect(trade.direction).toBe("SELL");
    expect(trade.quantity).toBe("0.3");
    // No finalized exit yet — the aggregated exit fields stay null (§11),
    // while the partial leg itself is preserved as an exit row.
    expect(trade.exitPrice).toBeNull();
    expect(trade.exitAt).toBeNull();
    expect(trade.exits).toHaveLength(1);
  });

  it("sums signed swap into the provider cost view", () => {
    const trade = reconstructCycle({
      positionId: "pos-1",
      symbol: "XAUUSD",
      deals: [
        deal({ externalDealId: "in1", side: "BUY", volume: new Prisma.Decimal("1"), price: new Prisma.Decimal("2000"), commission: new Prisma.Decimal("-2"), swap: new Prisma.Decimal("-0.5"), executedAt: d(0) }),
        deal({ externalDealId: "out1", side: "SELL", volume: new Prisma.Decimal("1"), price: new Prisma.Decimal("2010"), profit: new Prisma.Decimal("1000"), commission: new Prisma.Decimal("-2"), swap: new Prisma.Decimal("-0.5"), executedAt: d(10) }),
      ],
    });
    expect(trade.fees).toBe("4");
    expect(trade.swap).toBe("-1");
    expect(trade.pnlGross).toBe("1000");
    // net = gross − fees − swap_signed = 1000 − 4 − (−1) = 997.
    expect(trade.pnlNet).toBe("997");
  });
});
