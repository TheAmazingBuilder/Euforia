import { describe, expect, it } from "vitest";
import type { MetricsCardWidgetConfig, PnlBandWidgetConfig } from "@cosmoz/shared";

import {
  compareMetric,
  configEquals,
  defaultWidgetConfig,
  directionMetricValue,
  filtersForPeriod,
  getMetricDefinition,
  isConfigurable,
  METRICS_CARD_CATALOG,
  previousPeriodFilters,
  resolveWidgetConfig,
  summaryMetricValue,
} from "../widget-configs";

describe("defaults per widget type", () => {
  it("returns a versioned config for every configurable widget", () => {
    const configurableTypes = [
      "PNL_BAND",
      "HEATMAP",
      "METRICS_CARD",
      "STRATEGY_COMPARE",
      "LONG_SHORT",
      "ACTIVITY_HEATMAP",
    ] as const;
    for (const type of configurableTypes) {
      const config = defaultWidgetConfig(type);
      expect(config, type).not.toBeNull();
      expect(config!.kind, type).toBe(type);
      expect(config!.v, type).toBe(1);
    }
  });

  it("returns null for non-configurable widgets", () => {
    expect(defaultWidgetConfig("EQUITY_ROW")).toBeNull();
    expect(defaultWidgetConfig("GOALS_PACE")).toBeNull();
    expect(defaultWidgetConfig("WEEK_COMPARE")).toBeNull();
    expect(defaultWidgetConfig("BEST_WORST")).toBeNull();
    expect(defaultWidgetConfig("ALERTS")).toBeNull();
    expect(isConfigurable("EQUITY_ROW")).toBe(false);
    expect(isConfigurable("METRICS_CARD")).toBe(true);
  });

  it("ships a sensible metrics card default selection", () => {
    const config = defaultWidgetConfig("METRICS_CARD") as MetricsCardWidgetConfig;
    expect(config.metrics.length).toBeGreaterThanOrEqual(1);
    expect(config.metrics).toEqual(["NET_PNL", "WIN_RATE", "PROFIT_FACTOR", "EXPECTANCY_R"]);
    expect(config.comparison).toBe("PREVIOUS");
    expect(config.notation).toBe("STANDARD");
    expect(config.decimals).toBe(2);
  });
});

describe("resolveWidgetConfig — validate → migrate → repair", () => {
  it("keeps a valid stored config as-is", () => {
    const stored: PnlBandWidgetConfig = {
      kind: "PNL_BAND",
      v: 1,
      range: 7,
      cumulativeType: "BAR",
      showAvgLine: false,
      showEndMarker: true,
      showZeroLine: false,
    };
    const resolution = resolveWidgetConfig("PNL_BAND", stored);
    expect(resolution.status).toBe("ok");
    expect(resolution.status === "ok" && resolution.config).toEqual(stored);
  });

  it("treats an absent config as the defaults (pre-Phase-02 documents)", () => {
    const resolution = resolveWidgetConfig("PNL_BAND", undefined);
    expect(resolution.status).toBe("ok");
    expect(resolution.status === "ok" && resolution.config).toEqual(defaultWidgetConfig("PNL_BAND"));
  });

  it("repairs an unsupported config version instead of guessing semantics", () => {
    const resolution = resolveWidgetConfig("HEATMAP", { kind: "HEATMAP", v: 99, showCellValues: false });
    expect(resolution.status).toBe("repaired");
    expect(resolution.status === "repaired" && resolution.config).toEqual(defaultWidgetConfig("HEATMAP"));
  });

  it("repairs an invalid option value with the defaults and a reason", () => {
    const resolution = resolveWidgetConfig("PNL_BAND", {
      kind: "PNL_BAND",
      v: 1,
      range: 42,
      cumulativeType: "MANDELBROT",
      showAvgLine: true,
      showEndMarker: true,
      showZeroLine: true,
    });
    expect(resolution.status).toBe("repaired");
    expect(resolution.status === "repaired" && resolution.config).toEqual(defaultWidgetConfig("PNL_BAND"));
    expect(resolution.status === "repaired" && resolution.reason).toBeTruthy();
  });

  it("rejects a config whose kind does not match the widget type", () => {
    const resolution = resolveWidgetConfig("HEATMAP", {
      kind: "PNL_BAND",
      v: 1,
      range: 30,
      cumulativeType: "AREA",
      showAvgLine: true,
      showEndMarker: true,
      showZeroLine: true,
    });
    expect(resolution.status).toBe("repaired");
  });

  it("rejects unknown metric ids in a metrics card config", () => {
    const resolution = resolveWidgetConfig("METRICS_CARD", {
      kind: "METRICS_CARD",
      v: 1,
      period: "THIS_MONTH",
      metrics: ["NET_PNL", "MOON_PHASES"],
      comparison: "OFF",
      notation: "STANDARD",
      decimals: 2,
    });
    expect(resolution.status).toBe("repaired");
  });

  it("enforces the CUSTOM period date keys at resolution time", () => {
    const missingDates = resolveWidgetConfig("METRICS_CARD", {
      kind: "METRICS_CARD",
      v: 1,
      period: "CUSTOM",
      metrics: ["NET_PNL"],
      comparison: "OFF",
      notation: "STANDARD",
      decimals: 2,
    });
    expect(missingDates.status).toBe("repaired");

    const validRange = resolveWidgetConfig("METRICS_CARD", {
      kind: "METRICS_CARD",
      v: 1,
      period: "CUSTOM",
      customFrom: "2026-01-01",
      customTo: "2026-01-31",
      metrics: ["NET_PNL"],
      comparison: "OFF",
      notation: "STANDARD",
      decimals: 2,
    });
    expect(validRange.status).toBe("ok");
  });
});

describe("metric catalog", () => {
  it("backs every metrics-card metric with a summary field", () => {
    for (const metric of METRICS_CARD_CATALOG) {
      expect(metric.summaryField, metric.id).toBeDefined();
    }
  });

  it("defines improvement semantics for every metric (null = neutral counts)", () => {
    for (const metric of METRICS_CARD_CATALOG) {
      const defined =
        metric.higherIsBetter === true || metric.higherIsBetter === false || metric.higherIsBetter === null;
      expect(defined, metric.id).toBe(true);
    }
  });

  it("keeps the finance semantics honest — drawdowns closer to zero are better", () => {
    expect(getMetricDefinition("MAX_DRAWDOWN_R")?.higherIsBetter).toBe(true);
    expect(getMetricDefinition("GROSS_LOSS")?.higherIsBetter).toBe(false);
    expect(getMetricDefinition("NET_PNL")?.higherIsBetter).toBe(true);
    expect(getMetricDefinition("TRADES")?.higherIsBetter).toBeNull();
  });

  it("resolves ids stably and never for unknown ids", () => {
    expect(getMetricDefinition("NET_PNL")?.label).toBe("Net P&L");
    expect(getMetricDefinition("NOT_A_METRIC")).toBeNull();
  });
});

describe("period filters and previous-period mapping", () => {
  it("builds server filters from the config period", () => {
    expect(filtersForPeriod({ ...defaultWidgetConfig("METRICS_CARD"), kind: "METRICS_CARD", v: 1 } as MetricsCardWidgetConfig).period).toBe("THIS_MONTH");
    const custom = filtersForPeriod({
      kind: "METRICS_CARD",
      v: 1,
      period: "CUSTOM",
      customFrom: "2026-01-01",
      customTo: "2026-01-31",
      metrics: ["NET_PNL"],
      comparison: "OFF",
      notation: "STANDARD",
      decimals: 2,
    });
    expect(custom).toEqual({ period: "CUSTOM", customFrom: "2026-01-01", customTo: "2026-01-31" });
  });

  it("maps ONLY the server-resolved presets to a previous period", () => {
    expect(previousPeriodFilters({ ...defaultWidgetConfig("METRICS_CARD"), kind: "METRICS_CARD", v: 1 } as MetricsCardWidgetConfig))
      .toEqual({ period: "LAST_MONTH" });
    expect(
      previousPeriodFilters({
        kind: "METRICS_CARD",
        v: 1,
        period: "THIS_WEEK",
        metrics: ["NET_PNL"],
        comparison: "PREVIOUS",
        notation: "STANDARD",
        decimals: 2,
      }),
    ).toEqual({ period: "LAST_WEEK" });
    // No invented baselines: presets the server cannot resolve natively.
    expect(
      previousPeriodFilters({
        kind: "METRICS_CARD",
        v: 1,
        period: "LAST_30",
        metrics: ["NET_PNL"],
        comparison: "PREVIOUS",
        notation: "STANDARD",
        decimals: 2,
      }),
    ).toBeNull();
    expect(
      previousPeriodFilters({
        kind: "METRICS_CARD",
        v: 1,
        period: "ALL",
        metrics: ["NET_PNL"],
        comparison: "PREVIOUS",
        notation: "STANDARD",
        decimals: 2,
      }),
    ).toBeNull();
    // Comparison OFF → no previous fetch at all.
    expect(
      previousPeriodFilters({
        kind: "METRICS_CARD",
        v: 1,
        period: "THIS_MONTH",
        metrics: ["NET_PNL"],
        comparison: "OFF",
        notation: "STANDARD",
        decimals: 2,
      }),
    ).toBeNull();
  });
});

describe("compareMetric — metric-aware comparison semantics", () => {
  const netPnl = getMetricDefinition("NET_PNL")!;
  const grossLoss = getMetricDefinition("GROSS_LOSS")!;
  const drawdown = getMetricDefinition("MAX_DRAWDOWN_R")!;
  const trades = getMetricDefinition("TRADES")!;

  it("computes absolute and percentage deltas", () => {
    const result = compareMetric(netPnl, 1500, 1000);
    expect(result.absDelta).toBe(500);
    expect(result.pctDelta).toBeCloseTo(50, 6);
    expect(result.direction).toBe("UP");
    expect(result.sentiment).toBe("IMPROVED");
  });

  it("never divides by a zero baseline", () => {
    const result = compareMetric(netPnl, 500, 0);
    expect(result.absDelta).toBe(500);
    expect(result.pctDelta).toBeNull();
    expect(result.direction).toBe("UP");
  });

  it("reports an unavailable comparison when either side is missing", () => {
    expect(compareMetric(netPnl, null, 100).sentiment).toBeNull();
    expect(compareMetric(netPnl, 100, null).sentiment).toBeNull();
    expect(compareMetric(netPnl, null, null).absDelta).toBeNull();
  });

  it("flags a rising gross loss as a deterioration (§11: up ≠ always better)", () => {
    const result = compareMetric(grossLoss, 900, 400);
    expect(result.direction).toBe("UP");
    expect(result.sentiment).toBe("DETERIORATED");
  });

  it("flags a shallower drawdown as an improvement (−2 000 → −1 000)", () => {
    const result = compareMetric(drawdown, -1000, -2000);
    expect(result.direction).toBe("UP");
    expect(result.sentiment).toBe("IMPROVED");
    const deeper = compareMetric(drawdown, -3000, -2000);
    expect(deeper.direction).toBe("DOWN");
    expect(deeper.sentiment).toBe("DETERIORATED");
  });

  it("keeps neutral metrics neutral regardless of direction", () => {
    const result = compareMetric(trades, 40, 30);
    expect(result.direction).toBe("UP");
    expect(result.sentiment).toBe("NEUTRAL");
  });

  it("reads tiny deltas as flat (no float-noise arrows)", () => {
    const result = compareMetric(netPnl, 100.0000000001, 100);
    expect(result.direction).toBe("FLAT");
    expect(result.sentiment).toBe("NEUTRAL");
  });
});

describe("suite value readers", () => {
  const summary = {
    netPnl: "1234.5",
    winRate: "0.554",
    profitFactor: null,
    trades: 64,
  } as never;

  it("reads summary fields through the catalog", () => {
    expect(summaryMetricValue(summary, "NET_PNL")).toBe(1234.5);
    expect(summaryMetricValue(summary, "WIN_RATE")).toBeCloseTo(0.554, 6);
    expect(summaryMetricValue(summary, "TRADES")).toBe(64);
    expect(summaryMetricValue(summary, "PROFIT_FACTOR")).toBeNull();
  });

  it("returns null for metrics without a summary field", () => {
    // directionMetricValue/strategyMetricValue expect row objects — a
    // missing row (undefined) stays null, never a fabricated value.
    expect(directionMetricValue(undefined, "NET_PNL")).toBeNull();
    expect(summaryMetricValue(summary, "NOT_A_METRIC")).toBeNull();
  });
});

describe("config equality", () => {
  it("compares configs structurally, key order independent", () => {
    expect(
      configEquals(
        { kind: "HEATMAP", v: 1, showCellValues: true },
        { v: 1, showCellValues: true, kind: "HEATMAP" },
      ),
    ).toBe(true);
    expect(configEquals({ kind: "HEATMAP", v: 1, showCellValues: true }, { kind: "HEATMAP", v: 1, showCellValues: false })).toBe(false);
    expect(configEquals(undefined, undefined)).toBe(true);
    expect(configEquals(undefined, { kind: "HEATMAP", v: 1, showCellValues: true })).toBe(false);
  });

  it("distinguishes metric order (display order matters)", () => {
    expect(
      configEquals(
        { kind: "METRICS_CARD", v: 1, period: "ALL", metrics: ["A", "B"], comparison: "OFF", notation: "STANDARD", decimals: 2 },
        { kind: "METRICS_CARD", v: 1, period: "ALL", metrics: ["B", "A"], comparison: "OFF", notation: "STANDARD", decimals: 2 },
      ),
    ).toBe(false);
  });
});
