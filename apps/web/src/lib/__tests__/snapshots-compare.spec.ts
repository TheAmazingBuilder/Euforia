import { describe, expect, it } from "vitest";
import {
  comparePerformanceSnapshots,
  SNAPSHOT_SCHEMA_VERSION,
  type PerformanceSnapshot,
} from "@cosmoz/shared";

/**
 * Phase 08 — the pure snapshot-comparison engine (shared by API tests and
 * the web compare view). Rules under test (spec §8):
 *   - absolute diff = B − A in the metric's own unit;
 *   - relative % ONLY when mathematically meaningful (base ≠ 0; never for
 *     winRate (percentage-point space) or trade counts);
 *   - direction semantics carried per metric (bigger drawdown is NOT an
 *     improvement — higherIsBetter=false);
 *   - currency honesty: mismatched or multi-currency contexts mark money
 *     rows not comparable + warn, ratio/R/count rows stay comparable;
 *   - schema-version mismatch degrades the whole comparison + warns.
 */

function snapshot(overrides: Partial<PerformanceSnapshot> = {}): PerformanceSnapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "A",
    notes: "",
    capturedAt: "2026-10-19T10:00:00.000Z",
    period: "ALL",
    periodFrom: "0000-01-01",
    periodTo: "9999-12-31",
    scope: {},
    descriptor: "All closed trades",
    currency: "USD",
    singleCurrency: true,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    metrics: {
      netPnl: "200",
      winRate: "0.5",
      profitFactor: "1.5",
      trades: 2,
      avgR: "1",
      expectancyR: "1",
      maxDrawdownR: "-3",
      maxDrawdownPct: "-5",
    },
    ...overrides,
  };
}

function withMetrics(
  base: PerformanceSnapshot,
  metrics: Partial<PerformanceSnapshot["metrics"]>,
): PerformanceSnapshot {
  return { ...base, metrics: { ...base.metrics, ...metrics } };
}

describe("comparePerformanceSnapshots — money + ratio rows", () => {
  const a = snapshot();
  const b = withMetrics(snapshot({ id: "22222222-2222-4222-8222-222222222222", name: "B" }), {
    netPnl: "350",
    winRate: "0.6",
    profitFactor: "2",
    trades: 4,
    avgR: "1.25",
    maxDrawdownR: "-2",
  });

  it("computes absolute diffs in the metric's own unit (B − A)", () => {
    const result = comparePerformanceSnapshots(a, b);
    const netPnl = result.rows.find((row) => row.metric === "netPnl")!;
    expect(netPnl.absoluteDiff).toBe("150"); // 350 − 200
    expect(netPnl.comparable).toBe(true);
    expect(netPnl.unit).toBe("money");
    const avgR = result.rows.find((row) => row.metric === "avgR")!;
    expect(avgR.absoluteDiff).toBe("0.25"); // 1.25 − 1
  });

  it("gives relative % only where mathematically meaningful", () => {
    const result = comparePerformanceSnapshots(a, b);
    const netPnl = result.rows.find((row) => row.metric === "netPnl")!;
    expect(netPnl.relativeDiffPct).toBe("75"); // 150 / 200 × 100
    const winRate = result.rows.find((row) => row.metric === "winRate")!;
    expect(winRate.absoluteDiff).toBe("0.1"); // +10 percentage points
    expect(winRate.relativeDiffPct).toBeNull(); // never % on winRate
    const trades = result.rows.find((row) => row.metric === "trades")!;
    expect(trades.absoluteDiff).toBe("2");
    expect(trades.relativeDiffPct).toBeNull(); // counts stay absolute
  });

  it("suppresses relative % when the base value is 0 (undefined ratio)", () => {
    const zeroBase = withMetrics(a, { netPnl: "0" });
    const result = comparePerformanceSnapshots(zeroBase, b);
    const netPnl = result.rows.find((row) => row.metric === "netPnl")!;
    expect(netPnl.absoluteDiff).toBe("350");
    expect(netPnl.relativeDiffPct).toBeNull();
  });

  it("carries direction semantics (drawdown: higher is WORSE)", () => {
    const result = comparePerformanceSnapshots(a, b);
    const dd = result.rows.find((row) => row.metric === "maxDrawdownR")!;
    expect(dd.higherIsBetter).toBe(false);
    expect(dd.absoluteDiff).toBe("1"); // −2 − (−3): drawdown shrank
    const net = result.rows.find((row) => row.metric === "netPnl")!;
    expect(net.higherIsBetter).toBe(true);
  });
});

describe("comparePerformanceSnapshots — currency honesty (§8)", () => {
  it("refuses money rows across different currencies + warns; keeps ratio/R rows", () => {
    const eur = snapshot({ currency: "EUR" });
    const result = comparePerformanceSnapshots(eur, snapshot());
    expect(result.compatible).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    const netPnl = result.rows.find((row) => row.metric === "netPnl")!;
    expect(netPnl.comparable).toBe(false);
    expect(netPnl.absoluteDiff).toBeNull();
    const winRate = result.rows.find((row) => row.metric === "winRate")!;
    expect(winRate.comparable).toBe(true);
    expect(winRate.absoluteDiff).not.toBeNull();
  });

  it("refuses money rows when either side spans multiple currencies", () => {
    const multi = snapshot({ singleCurrency: false, currency: null });
    const result = comparePerformanceSnapshots(multi, snapshot());
    expect(result.compatible).toBe(false);
    const netPnl = result.rows.find((row) => row.metric === "netPnl")!;
    expect(netPnl.comparable).toBe(false);
  });
});

describe("comparePerformanceSnapshots — schema-version guard (§9)", () => {
  it("marks the comparison incompatible + warns when versions differ", () => {
    const older = snapshot({ schemaVersion: SNAPSHOT_SCHEMA_VERSION - 1 });
    const result = comparePerformanceSnapshots(older, snapshot());
    expect(result.compatible).toBe(false);
    expect(result.warnings.some((warning) => warning.includes("Schema versions differ"))).toBe(true);
    // Rows still show the ORIGINAL captured values — never reinterpreted.
    const netPnl = result.rows.find((row) => row.metric === "netPnl")!;
    expect(netPnl.comparable).toBe(false);
    expect(netPnl.a).toBe(older.metrics.netPnl);
    expect(netPnl.b).toBe(snapshot().metrics.netPnl);
  });
});

describe("comparePerformanceSnapshots — missing metrics (null honesty)", () => {
  it("marks rows not comparable when a value was unavailable at capture", () => {
    const noProfitFactor = withMetrics(snapshot(), { profitFactor: null });
    const result = comparePerformanceSnapshots(noProfitFactor, snapshot());
    const pf = result.rows.find((row) => row.metric === "profitFactor")!;
    expect(pf.comparable).toBe(false);
    expect(pf.a).toBeNull();
    expect(pf.b).toBe("1.5");
    expect(pf.absoluteDiff).toBeNull();
  });
});
