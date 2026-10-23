import { describe, expect, it } from "vitest";
import type { AnalyticsSuiteResponse, PerformanceSnapshot } from "@cosmoz/shared";

import {
  accountsCsv,
  CSV_EOL,
  snapshotCsv,
  suiteReportsCsv,
  suiteStrategiesCsv,
  suiteSummaryCsv,
  suiteSymbolsCsv,
} from "@/lib/export/builders";

/**
 * Phase 08 — CSV export builders. Contract under test:
 *   - stable documented columns; missing values = EMPTY cell;
 *   - multi-currency honesty: NO money values exported (columns dropped);
 *   - every cell passes the shared csvCell (RFC 4180 + formula guard) —
 *     a leading "=" in user text can never execute as a spreadsheet formula;
 *   - scope echo (descriptor / resolved window / currency) present;
 *   - snapshot export is the frozen capture with full context.
 */

function suite(overrides: Partial<AnalyticsSuiteResponse> = {}): AnalyticsSuiteResponse {
  const base = {
    meta: {
      resolvedFrom: "2026-03-01",
      resolvedTo: "2026-03-31",
      descriptor: "All closed trades · ALL",
      closedTrades: 2,
      openTradesExcluded: 1,
      warnings: [],
      anomalies: [],
      singleCurrency: true,
    },
    currency: "USD",
    summary: {
      netPnl: "200",
      grossProfit: "500",
      grossLoss: "300",
      winRate: "0.5",
      lossRate: "0.5",
      profitFactor: "1.67",
      expectancyR: "1",
      expectancyMoney: "100",
      avgR: "1",
      medianR: "1",
      bestR: "5",
      worstR: "-3",
      avgWinMoney: "500",
      avgLossMoney: "300",
      avgWinR: "5",
      avgLossR: "-3",
      payoffRatio: "1.67",
      maxDrawdownR: "-3",
      maxDrawdownPct: "-5",
      recoveryFactor: "2",
      sharpe: "1.2",
      sortino: "1.5",
      sqn: "0.9",
      trades: 2,
      winningTrades: 1,
      losingTrades: 1,
      breakevenTrades: 0,
      avgDurationMin: 150,
      sharpeNote: "√252 over daily R sums, risk-free 0",
      sortinoNote: "downside deviation, risk-free 0",
    },
    reports: {
      daily: [{ key: "2026-03-02", trades: 1, netPnl: "500", r: "5", winRate: "1" }],
      weekly: [],
      monthly: [{ key: "2026-03", trades: 2, netPnl: "200", r: "2", winRate: "0.5" }],
    },
  } as unknown as AnalyticsSuiteResponse;
  return { ...base, ...overrides } as AnalyticsSuiteResponse;
}

describe("suiteSummaryCsv - summary export", () => {
  it("exports stable columns, scope echo and one row per metric", () => {
    const csv = suiteSummaryCsv(suite());
    const lines = csv.split(CSV_EOL);
    expect(lines[0]).toBe("metric,value,unit,currency,period_from,period_to,descriptor");
    const rows = lines.slice(1).filter((line) => line.length > 0);
    const metrics = rows.map((line) => line.split(",")[0]);
    expect(metrics).toContain("net_pnl");
    expect(metrics).toContain("open_trades_excluded");
    expect(metrics).toContain("sharpe");
    const netPnlRow = rows.find((line) => line.startsWith("net_pnl,"))!;
    expect(netPnlRow).toBe("net_pnl,200,money,USD,2026-03-01,2026-03-31,All closed trades · ALL");
  });

  it("drops money VALUES on multi-currency (empty cells, currency column empty)", () => {
    const multi = suite();
    (multi.meta as { singleCurrency: boolean }).singleCurrency = false;
    const csv = suiteSummaryCsv(multi);
    const netPnlRow = csv.split(CSV_EOL).find((line) => line.startsWith("net_pnl,"))!;
    const cells = netPnlRow.split(",");
    expect(cells[1]).toBe(""); // no fabricated combined total
    expect(cells[3]).toBe(""); // no currency claim
  });
});

describe("suiteStrategiesCsv / suiteSymbolsCsv - breakdown exports", () => {
  it("exports one row per strategy with money columns in single currency", () => {
    const withStrategy = suite();
    (withStrategy as { strategies: unknown[] }).strategies = [
      {
        strategyId: "33333333-3333-4333-8333-333333333333",
        name: "London breakout",
        trades: 2,
        winRate: "0.5",
        profitFactor: "1.67",
        expectancyR: "1",
        netPnl: "200",
        avgWinR: "5",
        avgLossR: "-3",
        maxDrawdownR: "-3",
        avgDurationMin: 150,
        followedPlanPct: "0.75",
      },
    ];
    const csv = suiteStrategiesCsv(withStrategy);
    const lines = csv.split(CSV_EOL);
    expect(lines[0]!).toContain("net_pnl,currency");
    expect(lines[1]).toBe(
      "London breakout,33333333-3333-4333-8333-333333333333,2,0.5,1.67,1,200,USD,5,-3,-3,0.75,150,2026-03-01,2026-03-31",
    );
  });

  it("NEUTRALIZES formula injection in user-controlled strategy names", () => {
    const hostile = suite();
    (hostile as { strategies: unknown[] }).strategies = [
      {
        strategyId: null,
        name: '=HYPERLINK("http://evil.example","click")',
        trades: 1,
        winRate: "1",
        profitFactor: null,
        expectancyR: "2",
        netPnl: "50",
        avgWinR: "2",
        avgLossR: null,
        maxDrawdownR: "0",
        avgDurationMin: 30,
        followedPlanPct: null,
      },
    ];
    const csv = suiteStrategiesCsv(hostile);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).not.toContain("\n=HYPERLINK(");
  });

  it("drops money columns entirely on multi-currency strategies export", () => {
    const multi = suite();
    (multi.meta as { singleCurrency: boolean }).singleCurrency = false;
    (multi as { strategies: unknown[] }).strategies = [
      {
        strategyId: null,
        name: "mixed scope",
        trades: 3,
        winRate: "0.33",
        profitFactor: null,
        expectancyR: "0.2",
        netPnl: null,
        avgWinR: null,
        avgLossR: null,
        maxDrawdownR: "-1",
        avgDurationMin: null,
        followedPlanPct: null,
      },
    ];
    const csv = suiteStrategiesCsv(multi);
    const header = csv.split(CSV_EOL)[0]!;
    expect(header).not.toContain("net_pnl");
    expect(header).not.toContain("currency");
  });
});

describe("suiteReportsCsv - rollup exports", () => {
  it("exports monthly rollup rows with bucket label", () => {
    const csv = suiteReportsCsv(suite(), "monthly");
    const lines = csv.split(CSV_EOL).filter((line) => line.length > 0);
    expect(lines[0]).toBe("bucket,key,trades,net_pnl,currency,sum_r,win_rate");
    expect(lines[1]).toBe("monthly,2026-03,2,200,USD,2,0.5");
  });
});

describe("suiteSymbolsCsv - symbol breakdown export", () => {
  it("exports one row per symbol with the scope echo", () => {
    const withSymbols = suite();
    (withSymbols as { symbols: unknown[] }).symbols = [
      {
        instrumentId: "44444444-4444-4444-8444-444444444444",
        symbol: "EURUSD",
        assetClass: "FOREX",
        trades: 2,
        winRate: "0.5",
        profitFactor: "1.67",
        netPnl: "200",
        avgR: "1",
      },
    ];
    const csv = suiteSymbolsCsv(withSymbols);
    const lines = csv.split(CSV_EOL).filter((line) => line.length > 0);
    expect(lines[0]).toBe(
      "symbol,asset_class,trades,win_rate,profit_factor,net_pnl,currency,avg_r,period_from,period_to",
    );
    expect(lines[1]).toBe(
      "EURUSD,FOREX,2,0.5,1.67,200,USD,1,2026-03-01,2026-03-31",
    );
  });
});

describe("accountsCsv - account-level summary", () => {
  it("exports one row per account with currency and default flag", () => {
    const csv = accountsCsv([
      {
        name: "FTMO Challenge 2",
        type: "LIVE",
        broker: "FTMO",
        currency: "USD",
        startingBalance: "100000",
        isDefault: true,
      },
    ]);
    const lines = csv.split(CSV_EOL).filter((line) => line.length > 0);
    expect(lines[0]).toBe("account,type,broker,currency,starting_balance,is_default");
    expect(lines[1]).toBe("FTMO Challenge 2,LIVE,FTMO,USD,100000,true");
  });
});

describe("snapshotCsv - frozen capture export", () => {
  it("exports the capture context block + metric rows", () => {
    const snapshot = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "March reference",
      notes: "=danger in notes",
      capturedAt: "2026-10-19T10:00:00.000Z",
      period: "ALL",
      periodFrom: "0000-01-01",
      periodTo: "9999-12-31",
      scope: {},
      descriptor: "All closed trades",
      currency: "USD",
      singleCurrency: true,
      schemaVersion: 1,
      metrics: {
        netPnl: "200",
        winRate: "0.5",
        profitFactor: "1.67",
        trades: 2,
        avgR: "1",
        expectancyR: "1",
        maxDrawdownR: "-3",
        maxDrawdownPct: "-5",
      },
    } as unknown as PerformanceSnapshot;
    const csv = snapshotCsv(snapshot);
    const lines = csv.split(CSV_EOL).filter((line) => line.length > 0);
    expect(lines[0]).toBe("captured_at,2026-10-19T10:00:00.000Z");
    expect(lines).toContain("period_from,0000-01-01");
    expect(lines).toContain("schema_version,1");
    // Notes pass through csvCell — formula-neutralized (leading "=") + quoted.
    expect(csv).toContain("'=danger in notes");
    expect(lines).toContain("net_pnl,200,money,USD");
  });

  it("exports NO money value on multi-currency captures", () => {
    const snapshot = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "mixed",
      notes: "",
      capturedAt: "2026-10-19T10:00:00.000Z",
      period: "ALL",
      periodFrom: "0000-01-01",
      periodTo: "9999-12-31",
      scope: {},
      descriptor: "Multi-currency",
      currency: null,
      singleCurrency: false,
      schemaVersion: 1,
      metrics: {
        netPnl: null,
        winRate: "0.5",
        profitFactor: null,
        trades: 2,
        avgR: "1",
        expectancyR: "1",
        maxDrawdownR: "-3",
        maxDrawdownPct: null,
      },
    } as unknown as PerformanceSnapshot;
    const csv = snapshotCsv(snapshot);
    const netPnlLine = csv.split(CSV_EOL).find((line) => line.startsWith("net_pnl,"))!;
    expect(netPnlLine).toBe("net_pnl,,money,");
  });
});
