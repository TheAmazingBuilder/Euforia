/**
 * Stats logic tests — pure computations over synthetic rows (no DB).
 * Verifies the algorithms the frontend renders: overview aggregates, equity
 * curve, deltas, sparklines, ghost trend, analytics cards + heatmap + tilt,
 * mistake ledger, suite summary/filters/histograms/Monte Carlo determinism.
 */
import { describe, expect, it } from "vitest";
import {
  analyticsResponseSchema,
  analyticsSuiteResponseSchema,
  statsOverviewResponseSchema,
} from "../../src/shared/contracts";
import type { AnalyticsFilters } from "../../src/shared/contracts";
import {
  niceStep,
  percentileOf,
  resolvePeriodRange,
  type StatsContext,
  type StatsTradeRow,
} from "../../src/modules/stats/stats.helpers";
import { computeAnalytics, computeStatsOverview } from "../../src/modules/stats/stats.overview";
import { computeAnalyticsSuite } from "../../src/modules/stats/stats.suite";

// ── Synthetic fixture ───────────────────────────────────────────────────────

let seq = 0;
let ACC = "";
let INS = "";
const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function trade(overrides: Partial<StatsTradeRow> & { r: number; pnl: number }): StatsTradeRow {
  seq += 1;
  const id = uid(seq);
  return {
    id,
    accountId: ACC,
    instrumentId: INS,
    strategyId: null,
    status: "CLOSED",
    direction: "BUY",
    entryAt: `${overrides.tradingDate ?? "2026-09-10"}T14:30:00.000Z`,
    exitAt: `${overrides.tradingDate ?? "2026-09-10"}T16:00:00.000Z`,
    exitReason: "TP",
    pnlNet: String(overrides.pnl),
    rMultiple: String(overrides.r),
    riskAmount: "100",
    plannedRR: "2",
    followedPlan: true,
    decisionGrade: "A",
    emotionBefore: "CALM",
    emotionAfter: "RELIEVED",
    confidence: 4,
    mfeR: null,
    maeR: null,
    tradingDate: overrides.tradingDate ?? "2026-09-10",
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => !["r", "pnl"].includes(k))),
  } as StatsTradeRow;
}

const baseContext = (): StatsContext => {
  seq = 0;
  ACC = uid(4001);
  INS = uid(5001);
  return {
  trades: [
    trade({ r: 2, pnl: 200, tradingDate: "2026-09-10" }),
    trade({ r: -1, pnl: -100, tradingDate: "2026-09-11" }),
    trade({ r: 1.5, pnl: 150, tradingDate: "2026-09-12" }),
    trade({ r: 3, pnl: 300, tradingDate: "2026-09-15" }),
    trade({ r: -0.5, pnl: -50, tradingDate: "2026-09-16" }),
  ],
  instruments: new Map([[INS, { id: INS, symbol: "EURUSD", assetClass: "FOREX", quoteCurrency: "USD" }]]),
  accounts: [{ id: ACC, name: "Main", currency: "USD", startingBalance: "10000" }],
  dailyStats: [
    { date: "2026-09-10", tradesCount: 1, pnlNet: "200", disciplineScore: "88.00", sleepHours: "7.5" },
    { date: "2026-09-11", tradesCount: 1, pnlNet: "-100", disciplineScore: "72.00", sleepHours: "6.0" },
  ],
  skippedTrades: [
    { reason: "FEAR", outcomeGuess: "WOULD_HAVE_WON", hypotheticalR: "1.8", seenAt: "2026-09-12T15:00:00.000Z" },
    { reason: "DISCIPLINE", outcomeGuess: "WOULD_HAVE_LOST", hypotheticalR: "-1.2", seenAt: "2026-09-12T16:00:00.000Z" },
  ],
  mistakes: [
    { id: uid(9001), key: "moved_stop", label: "Moved stop", category: "MANAGEMENT", severity: 4 },
  ],
  tradeMistakes: [
    { tradeId: uid(2), mistakeId: uid(9001), createdAt: "2026-09-11T18:00:00.000Z" },
  ],
  strategies: [
    { id: uid(8001), name: "London Breakout", grade: "B", color: "#3b82f6" },
  ],
  ecoEvents: [
    { id: uid(7001), impact: "HIGH", currency: "USD", scheduledAt: "2026-09-10T14:00:00.000Z" },
  ],
  tradeTags: new Map(),
  timezone: "UTC",
  currency: "USD",
  startingBalance: "10000",
  };
}

describe("stats helpers", () => {
  it("niceStep rounds to human steps", () => {
    expect(niceStep(0.37)).toBe(0.5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(31)).toBe(50);
  });

  it("percentileOf interpolates", () => {
    expect(percentileOf([10, 20, 30, 40], 50)).toBe(25);
    expect(percentileOf([], 50)).toBeNull();
  });

  it("resolvePeriodRange ALL is unbounded, TODAY is a single day", () => {
    const all = resolvePeriodRange({ period: "ALL" } as AnalyticsFilters, "UTC");
    expect(all.from).toBe("0000-01-01");
    const today = resolvePeriodRange({ period: "TODAY" } as AnalyticsFilters, "UTC");
    expect(today.from).toBe(today.to);
  });
});

describe("stats overview", () => {
  it("computes the aggregate KPIs and validates against the shared schema", () => {
    const ctx = baseContext();
    const out = statsOverviewResponseSchema.parse(computeStatsOverview(ctx));
    // netPnl = 200 - 100 + 150 + 300 - 50 = 500
    expect(out.netPnl).toBe("500");
    // wins 3 / 5
    expect(out.winRate).toBe("0.6");
    // equity ends at 10500
    expect(out.equityCurve.at(-1)!.equity).toBe("10500");
    expect(out.equityPeak).toBe("10550");
    expect(out.currency).toBe("USD");
    expect(out.deltaWindowDays).toBe(7);
    // disciplineSaved = |−1.2| ; hesitationCost = |1.8|
    expect(out.disciplineSaved.rSaved).toBe("1.2");
    expect(out.hesitationCost.rCost).toBe("1.8");
    expect(out.ghostTrend).toHaveLength(30);
  });

  it("empty dataset yields zeroed honest aggregates", () => {
    const ctx = { ...baseContext(), trades: [], skippedTrades: [] };
    const out = statsOverviewResponseSchema.parse(computeStatsOverview(ctx));
    expect(out.netPnl).toBe("0");
    expect(out.profitFactor).toBeNull();
    expect(out.equityCurve).toEqual([]);
    expect(out.disciplineSaved.settledCount).toBe(0);
  });
});

describe("stats analytics", () => {
  it("computes cards, buckets, grade matrix, tilt and ledger", () => {
    const ctx = baseContext();
    const out = analyticsResponseSchema.parse(computeAnalytics(ctx));
    expect(out.cards.sampleTrades).toBe(5);
    expect(out.cards.maxDrawdownR).toBe("-1"); // 2 → 1 (one -1R loss)
    expect(out.heatmap.length).toBeGreaterThan(0);
    expect(out.emotionBuckets.length).toBe(1);
    expect(out.gradeMatrix).toHaveLength(5);
    expect(out.tilt.every((p) => p.priorLossStreak >= 0)).toBe(true);
    expect(out.mistakes).toHaveLength(1);
    expect(out.mistakes[0]!.key).toBe("moved_stop");
    expect(out.strategyDistributions).toEqual([]); // strategy s1 has no trades
  });

  it("sleep scatter maps dailyStat rows with sleepHours", () => {
    const out = analyticsResponseSchema.parse(computeAnalytics(baseContext()));
    expect(out.sleepScatter).toHaveLength(2);
    expect(out.sleepScatter[0]!.sleepHours).toBe("7.5");
  });
});

describe("analytics suite", () => {
  it("computes the full filtered dataset and validates against the schema", () => {
    const ctx = baseContext();
    const out = analyticsSuiteResponseSchema.parse(
      computeAnalyticsSuite(ctx, { period: "ALL" } as AnalyticsFilters, 100),
    );
    expect(out.meta.closedTrades).toBe(5);
    expect(out.meta.openTradesExcluded).toBe(0);
    expect(out.meta.singleCurrency).toBe(true);
    expect(out.summary.trades).toBe(5);
    expect(out.summary.winningTrades).toBe(3);
    expect(out.summary.netPnl).toBe("500");
    expect(out.cumulativeR).toHaveLength(5);
    expect(out.cumulativeR.at(-1)!.cumR).toBe("5"); // 2 - 1 + 1.5 + 3 - 0.5
    expect(out.rolling).toHaveLength(5);
    expect(out.directions).toHaveLength(2);
    expect(out.monteCarlo.simulations).toBe(100);
    expect(out.monteCarlo.bands.length).toBeLessThanOrEqual(5); // min(trades, 80)
    expect(out.reports.daily.length).toBeGreaterThan(0);
  });

  it("filters by strategy none and by tag", () => {
    const ctx = baseContext();
    ctx.trades[0]!.strategyId = uid(8001);
    const filtered = analyticsSuiteResponseSchema.parse(
      computeAnalyticsSuite(ctx, { period: "ALL", strategyId: "none" } as AnalyticsFilters, 100),
    );
    expect(filtered.meta.closedTrades).toBe(4);

    ctx.tradeTags.set(ctx.trades[1]!.id, new Set([uid(6001)]));
    const byTag = analyticsSuiteResponseSchema.parse(
      computeAnalyticsSuite(ctx, { period: "ALL", tagId: uid(6001) } as AnalyticsFilters, 100),
    );
    expect(byTag.meta.closedTrades).toBe(1);
  });

  it("multi-currency dataset nulls money figures and warns", () => {
    const ctx = baseContext();
    ctx.accounts.push({ id: "acc-2", name: "EU", currency: "EUR", startingBalance: "5000" });
    ctx.trades[2]!.accountId = "acc-2";
    const out = analyticsSuiteResponseSchema.parse(
      computeAnalyticsSuite(ctx, { period: "ALL" } as AnalyticsFilters, 100),
    );
    expect(out.meta.singleCurrency).toBe(false);
    expect(out.summary.netPnl).toBeNull();
    expect(out.meta.warnings.some((w) => w.includes("Multi-currency"))).toBe(true);
  });

  it("monte carlo is deterministic for a fixed seed", () => {
    const ctx = baseContext();
    const a = computeAnalyticsSuite(ctx, { period: "ALL" } as AnalyticsFilters, 150);
    const b = computeAnalyticsSuite(ctx, { period: "ALL" } as AnalyticsFilters, 150);
    expect(a.monteCarlo.finalR).toEqual(b.monteCarlo.finalR);
  });
});
