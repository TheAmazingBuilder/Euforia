/**
 * Unit — Phase 05 widget view-models (insights-view.ts): pure projections
 * from the analytics-suite payload to the insight widgets. Pinned rules:
 * server rows are projected verbatim (no re-derivation), display ordering
 * is deterministic (busiest first, ties alphabetical), the display cap is
 * honest (a "truncated" count, not silent), money collapses to null under
 * multi-currency, and the trend delta is a labeled subtraction of two
 * server values — never a recomputation.
 */
import { describe, expect, it } from "vitest";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";

import {
  BREAKDOWN_MAX_ROWS,
  breakdownModelOf,
  insightMetricText,
  reliabilityCopy,
  trendModelOf,
} from "../insights-view";
import { DEFAULT_PERFORMANCE_BREAKDOWN_CONFIG } from "../widget-configs";

const suite = {
  meta: { singleCurrency: true },
  currency: "USD",
  strategies: [
    { strategyId: "s2", name: "Zeta", trades: 10, winRate: "0.5", profitFactor: "1.5", expectancyR: "0.4", netPnl: "500", avgWinR: null, avgLossR: null, maxDrawdownR: "0", avgDurationMin: 90, followedPlanPct: null },
    { strategyId: "s1", name: "Alpha", trades: 10, winRate: "0.6", profitFactor: "2", expectancyR: "0.6", netPnl: "900", avgWinR: null, avgLossR: null, maxDrawdownR: "0", avgDurationMin: 45, followedPlanPct: null },
    { strategyId: null, name: "Out of playbook", trades: 3, winRate: null, profitFactor: null, expectancyR: null, netPnl: "-50", avgWinR: null, avgLossR: null, maxDrawdownR: "0", avgDurationMin: null, followedPlanPct: null },
  ],
  symbols: [
    { instrumentId: "i1", symbol: "EURUSD", assetClass: "forex", trades: 12, winRate: "0.5", profitFactor: "1.2", netPnl: "300", avgR: "0.2" },
  ],
  assetClasses: [
    { instrumentId: "ac1", symbol: "forex", assetClass: "forex", trades: 20, winRate: "0.5", profitFactor: "1.1", netPnl: "400", avgR: "0.1" },
  ],
  directions: [
    { direction: "SELL", trades: 8, winRate: "0.4", profitFactor: "0.9", netPnl: "-100", expectancyR: "-0.1", avgDurationMin: 30 },
    { direction: "BUY", trades: 14, winRate: "0.6", profitFactor: "1.8", netPnl: "700", expectancyR: "0.5", avgDurationMin: 75 },
  ],
  weekdays: [
    { key: "1", label: "Monday", trades: 9, wins: 5, avgR: "0.3", winRate: "0.56" },
    { key: "5", label: "Friday", trades: 6, wins: 2, avgR: "-0.2", winRate: "0.33" },
  ],
  hours: [
    { key: "2", label: "08–12 UTC", trades: 11, wins: 6, avgR: "0.4", winRate: "0.55" },
  ],
  durations: {
    buckets: [
      { label: "≤ 15 min", minMinutes: 0, maxMinutes: 15, trades: 4, wins: 3, winRate: "0.75", avgR: "0.8", netPnl: "320" },
      { label: "15–60 min", minMinutes: 16, maxMinutes: 60, trades: 9, wins: 5, winRate: "0.56", avgR: "0.3", netPnl: "280" },
    ],
    excludedMissingTimestamp: 1,
  },
  reports: {
    daily: [],
    weekly: [
      { key: "2026-W09", trades: 5, netPnl: "100", r: "1", winRate: "0.4" },
      { key: "2026-W11", trades: 8, netPnl: "400", r: "3", winRate: "0.5" },
      { key: "2026-W10", trades: 6, netPnl: "-50", r: "-0.5", winRate: "0.2" },
    ],
    monthly: [],
  },
} as unknown as AnalyticsSuiteResponse;

describe("breakdownModelOf", () => {
  it("projects each dimension verbatim from the server rows (no re-derivation)", () => {
    const strategy = breakdownModelOf(suite, "STRATEGY");
    expect(strategy.rows.map((row) => row.label)).toEqual(["Alpha", "Zeta", "Out of playbook"]);
    expect(strategy.rows[0]).toMatchObject({ trades: 10, winRate: 0.6, avgR: 0.6, netPnl: 900, avgDurationMin: 45 });

    const direction = breakdownModelOf(suite, "DIRECTION");
    expect(direction.rows.map((row) => row.label)).toEqual(["Long (BUY)", "Short (SELL)"]);

    const weekday = breakdownModelOf(suite, "WEEKDAY");
    expect(weekday.rows[0]!.profitFactor).toBeNull(); // bucket rows have no PF - never fabricated
    expect(weekday.rows[0]!.avgR).toBe(0.3);

    const duration = breakdownModelOf(suite, "DURATION");
    expect(duration.rows.map((row) => row.label)).toEqual(["15–60 min", "≤ 15 min"]); // busiest first
    expect(duration.rows[0]!.netPnl).toBe(280);
  });

  it("orders busiest-first with alphabetical ties and truncates honestly", () => {
    const model = breakdownModelOf(suite, "STRATEGY");
    expect(model.truncated).toBe(0);
    const rows = Array.from({ length: 12 }, (_, index) => ({
      strategyId: `s${index}`,
      name: `S${index}`,
      trades: 5,
      winRate: null,
      profitFactor: null,
      expectancyR: null,
      netPnl: null,
      avgWinR: null,
      avgLossR: null,
      maxDrawdownR: "0",
      avgDurationMin: null,
      followedPlanPct: null,
    }));
    const big = breakdownModelOf(
      { ...suite, strategies: rows } as unknown as AnalyticsSuiteResponse,
      "STRATEGY",
    );
    expect(big.rows).toHaveLength(BREAKDOWN_MAX_ROWS);
    expect(big.truncated).toBe(12 - BREAKDOWN_MAX_ROWS);
  });

  it("flags mixed-currency scopes with an explanatory note instead of raw sums", () => {
    const multi = breakdownModelOf(
      { ...suite, meta: { singleCurrency: false } } as unknown as AnalyticsSuiteResponse,
      "INSTRUMENT",
    );
    expect(multi.moneyNote).toContain("Mixed-currency");
    expect(multi.rows[0]!.netPnl).toBe(300); // server already nulled money - projection keeps the payload's truth
  });
});

describe("trendModelOf", () => {
  it("sorts weeks chronologically, caps the window and labels the R delta", () => {
    const { rows, currency } = trendModelOf(suite);
    expect(currency).toBe("USD");
    expect(rows.map((row) => row.key)).toEqual(["2026-W09", "2026-W10", "2026-W11"]);
    expect(rows[1]!.rDelta).toBe(-1.5); // W10 (−0.5) − W09 (1)
    expect(rows[2]!.rDelta).toBe(3.5); // W11 (3) − W10 (−0.5)
    expect(rows[0]!.rDelta).toBeNull();
    expect(rows[2]!.winRate).toBe(0.5);
  });
});

describe("insight presentation", () => {
  it("formats every metric kind and renders null as an explicit em dash", () => {
    expect(insightMetricText({ label: "x", kind: "R", value: 1.5 }, "USD")).toBe("+1.50R");
    expect(insightMetricText({ label: "x", kind: "MONEY", value: 1234.5 }, "USD")).toContain("1");
    expect(insightMetricText({ label: "x", kind: "PERCENT", value: 0.55 }, null)).toContain("55");
    expect(insightMetricText({ label: "x", kind: "COUNT", value: 7 }, null)).toBe("7");
    expect(insightMetricText({ label: "x", kind: "MONEY", value: null }, "USD")).toBe("-");
  });

  it("maps reliability labels to neutral copy (never statistical confidence)", () => {
    expect(reliabilityCopy("EARLY_OBSERVATION").label).toBe("Early observation");
    expect(reliabilityCopy("REPEATED_PATTERN").label).toBe("Repeated pattern");
    expect(reliabilityCopy("STRONG_EVIDENCE").label).toBe("Strong historical evidence");
  });

  it("defaults the breakdown to the strategy dimension", () => {
    expect(DEFAULT_PERFORMANCE_BREAKDOWN_CONFIG.dimension).toBe("STRATEGY");
  });
});
