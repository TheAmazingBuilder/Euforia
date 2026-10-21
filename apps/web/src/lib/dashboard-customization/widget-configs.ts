import {
  dashboardWidgetConfigSchema,
  type ActivityHeatmapWidgetConfig,
  type AnalyticsSuiteResponse,
  type DashboardWidgetConfig,
  type DashboardWidgetKey,
  type HeatmapWidgetConfig,
  type LongShortWidgetConfig,
  type MetricsCardWidgetConfig,
  type PnlBandWidgetConfig,
  type PerformanceBreakdownWidgetConfig,
  type StrategyCompareWidgetConfig,
  WIDGET_CONFIG_VERSION,
} from "@cosmoz/shared";

import { parseDecimal } from "@cosmoz/shared";

/**
 * Widget configuration system (Phase 02 §5) — the typed layer between the
 * shared config schemas and the registry/renderers.
 *
 * Responsibilities:
 *  - defaults per configurable widget type;
 *  - SAFE resolution of a stored config: migrate → validate → repair.
 *    An invalid or outdated stored config never crashes the dashboard —
 *    it falls back to the widget's defaults (the settings dialog is where
 *    the user gets validation feedback, not the render path);
 *  - the metric catalog (§7/§10): every metric is a SERVER-computed field
 *    of the analytics suite — no client-side financial formula exists here;
 *  - previous-period mapping (§11) and metric-aware comparison semantics.
 *
 * Pure data + pure functions: no React, no I/O — fully unit-testable.
 */

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PNL_BAND_CONFIG: PnlBandWidgetConfig = {
  kind: "PNL_BAND",
  v: WIDGET_CONFIG_VERSION,
  range: 30,
  cumulativeType: "AREA",
  showAvgLine: true,
  showEndMarker: true,
  showZeroLine: true,
};

export const DEFAULT_HEATMAP_CONFIG: HeatmapWidgetConfig = {
  kind: "HEATMAP",
  v: WIDGET_CONFIG_VERSION,
  showCellValues: true,
};

export const DEFAULT_METRICS_CARD_CONFIG: MetricsCardWidgetConfig = {
  kind: "METRICS_CARD",
  v: WIDGET_CONFIG_VERSION,
  period: "THIS_MONTH",
  metrics: ["NET_PNL", "WIN_RATE", "PROFIT_FACTOR", "EXPECTANCY_R"],
  comparison: "PREVIOUS",
  notation: "STANDARD",
  decimals: 2,
};

export const DEFAULT_STRATEGY_COMPARE_CONFIG: StrategyCompareWidgetConfig = {
  kind: "STRATEGY_COMPARE",
  v: WIDGET_CONFIG_VERSION,
  strategyIds: [],
};

export const DEFAULT_LONG_SHORT_CONFIG: LongShortWidgetConfig = {
  kind: "LONG_SHORT",
  v: WIDGET_CONFIG_VERSION,
  metrics: ["TRADES", "NET_PNL", "WIN_RATE", "PROFIT_FACTOR", "EXPECTANCY_R"],
};

export const DEFAULT_ACTIVITY_HEATMAP_CONFIG: ActivityHeatmapWidgetConfig = {
  kind: "ACTIVITY_HEATMAP",
  v: WIDGET_CONFIG_VERSION,
  metric: "AVG_R",
};

export const DEFAULT_PERFORMANCE_BREAKDOWN_CONFIG: PerformanceBreakdownWidgetConfig = {
  kind: "PERFORMANCE_BREAKDOWN",
  v: WIDGET_CONFIG_VERSION,
  dimension: "STRATEGY",
};

/**
 * Default config per widget type. Non-configurable widgets return null.
 * A fresh STRATEGY_COMPARE starts empty: the settings dialog is where the
 * user picks strategies (an empty selection renders a purposeful hint —
 * never a fabricated comparison).
 */
export function defaultWidgetConfig(type: DashboardWidgetKey): DashboardWidgetConfig | null {
  switch (type) {
    case "PNL_BAND":
      return { ...DEFAULT_PNL_BAND_CONFIG };
    case "HEATMAP":
      return { ...DEFAULT_HEATMAP_CONFIG };
    case "METRICS_CARD":
      return { ...DEFAULT_METRICS_CARD_CONFIG, metrics: [...DEFAULT_METRICS_CARD_CONFIG.metrics] };
    case "STRATEGY_COMPARE":
      return { ...DEFAULT_STRATEGY_COMPARE_CONFIG, strategyIds: [] };
    case "LONG_SHORT":
      return { ...DEFAULT_LONG_SHORT_CONFIG, metrics: [...DEFAULT_LONG_SHORT_CONFIG.metrics] };
    case "ACTIVITY_HEATMAP":
      return { ...DEFAULT_ACTIVITY_HEATMAP_CONFIG };
    case "PERFORMANCE_BREAKDOWN":
      return { ...DEFAULT_PERFORMANCE_BREAKDOWN_CONFIG };
    default:
      return null;
  }
}

/** Widgets that expose a settings panel (§6) — registry-linked truth. */
export function isConfigurable(type: DashboardWidgetKey): boolean {
  return defaultWidgetConfig(type) !== null;
}

// ── Safe resolution (validate → migrate → repair) ────────────────────────────

export type ConfigResolution =
  | { status: "ok"; config: DashboardWidgetConfig }
  | { status: "repaired"; config: DashboardWidgetConfig; reason: string }
  | { status: "none" };

/**
 * Resolve a stored raw config against the widget type:
 *  1. absent → the widget defaults (status "repaired" is NOT reported —
 *     absence is the pre-Phase-02 normal state, not a defect);
 *  2. unknown version → defaults (a future version's semantics cannot be
 *     guessed — never silently reinterpret);
 *  3. schema-invalid → defaults, with the first zod issue as the reason;
 *  4. valid → parsed config as-is.
 * The shared item-level superRefine also rejects kind/type mismatches.
 */
export function resolveWidgetConfig(
  type: DashboardWidgetKey,
  raw: unknown,
): ConfigResolution {
  const fallback = defaultWidgetConfig(type);
  if (raw === undefined || raw === null) {
    return fallback ? { status: "ok", config: fallback } : { status: "none" };
  }
  if (!fallback) {
    return { status: "repaired", reason: "Widget does not support configuration", config: fallback! };
  }
  const candidate = raw as { v?: unknown };
  if (candidate.v !== WIDGET_CONFIG_VERSION) {
    return {
      status: "repaired",
      reason: `Config version ${String(candidate.v)} is not supported — defaults applied`,
      config: fallback,
    };
  }
  const parsed = dashboardWidgetConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "repaired",
      reason: parsed.error.issues[0]?.message ?? "Invalid configuration — defaults applied",
      config: fallback,
    };
  }
  if (parsed.data.kind !== type) {
    return {
      status: "repaired",
      reason: `Config belongs to "${parsed.data.kind}", not "${type}" — defaults applied`,
      config: fallback,
    };
  }
  // Catalog-level validation the structural schema cannot express: a
  // metrics card whose ids the catalog does not know would render nothing
  // but noise — treat it like any invalid config (§7 "unknown metric ids").
  if (parsed.data.kind === "METRICS_CARD") {
    const unknown = parsed.data.metrics.filter((id) => getMetricDefinition(id) === null);
    if (unknown.length > 0) {
      return {
        status: "repaired",
        reason: `Unknown metric id(s): ${unknown.join(", ")} — defaults applied`,
        config: fallback,
      };
    }
    if (parsed.data.period === "CUSTOM") {
      const { customFrom, customTo } = parsed.data;
      if (!customFrom || !customTo || customFrom > customTo) {
        return {
          status: "repaired",
          reason: "CUSTOM period requires customFrom and customTo (from ≤ to) — defaults applied",
          config: fallback,
        };
      }
    }
  }
  return { status: "ok", config: parsed.data };
}

/**
 * Validate a config PAYLOAD for `type` (settings-dialog save path). Returns
 * the first issue message, or null when the payload is acceptable. Same
 * rules as the read path (resolveWidgetConfig) so what the dialog accepts
 * is exactly what the model layer persists — one contract, no drift.
 */
export function validateWidgetConfigPayload(
  type: DashboardWidgetKey,
  raw: unknown,
): string | null {
  const parsed = dashboardWidgetConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid configuration.";
  }
  if (parsed.data.kind !== type) {
    return `This panel edits ${type} settings.`;
  }
  if (parsed.data.kind === "METRICS_CARD") {
    const unknown = parsed.data.metrics.filter((id) => getMetricDefinition(id) === null);
    if (unknown.length > 0) {
      return `Unknown metric id(s): ${unknown.join(", ")}`;
    }
    if (parsed.data.period === "CUSTOM") {
      const { customFrom, customTo } = parsed.data;
      if (!customFrom || !customTo || customFrom > customTo) {
        return "CUSTOM period requires customFrom and customTo (from ≤ to).";
      }
    }
  }
  return null;
}

// ── Metric catalog (§7 KPI selection / §12 analytics widgets) ────────────────

/**
 * Every metric maps ONE server-computed field — the client formats, it
 * never re-derives (analytics golden rule). `higherIsBetter` drives the
 * comparison sentiment (§11: an increase is NOT always an improvement —
 * drawdown growing toward -∞ is a deterioration; gross loss shrinking is
 * an improvement). null = neutral (sample-size metrics).
 */
export type MetricUnit = "MONEY" | "R" | "PERCENT" | "COUNT" | "MINUTES";

export interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  unit: MetricUnit;
  /** Signed semantics for comparisons; null = neutral (counts, durations). */
  higherIsBetter: boolean | null;
  /** Ratio 0–1 rendered via formatPercent (win/loss rates). */
  isRatio?: boolean;
  /** Signed display (explicit +/−) — P&L-style metrics. */
  signed?: boolean;
  /** Field path on AnalyticsSuiteResponse["summary"] (all total-window metrics). */
  summaryField?: keyof AnalyticsSuiteResponse["summary"];
  /** Field path on an analytics direction row (BUY/SELL populations). */
  directionField?: keyof AnalyticsSuiteResponse["directions"][number];
  /** Field path on an analytics strategy row (per-strategy table columns). */
  strategyField?: keyof AnalyticsSuiteResponse["strategies"][number];
}

export const METRIC_CATALOG: readonly MetricDefinition[] = [
  {
    id: "NET_PNL",
    label: "Net P&L",
    description: "Net result across all closed trades in the period.",
    unit: "MONEY",
    higherIsBetter: true,
    signed: true,
    summaryField: "netPnl",
    directionField: "netPnl",
    strategyField: "netPnl",
  },
  {
    id: "GROSS_PROFIT",
    label: "Gross profit",
    description: "Sum of winning trades' results.",
    unit: "MONEY",
    higherIsBetter: true,
    summaryField: "grossProfit",
  },
  {
    id: "GROSS_LOSS",
    label: "Gross loss",
    description: "Sum of losing trades' results (absolute).",
    unit: "MONEY",
    higherIsBetter: false,
    summaryField: "grossLoss",
  },
  {
    id: "WIN_RATE",
    label: "Win rate",
    description: "Winning trades over eligible closed trades.",
    unit: "PERCENT",
    higherIsBetter: true,
    isRatio: true,
    summaryField: "winRate",
    directionField: "winRate",
    strategyField: "winRate",
  },
  {
    id: "LOSS_RATE",
    label: "Loss rate",
    description: "Losing trades over eligible closed trades.",
    unit: "PERCENT",
    higherIsBetter: false,
    isRatio: true,
    summaryField: "lossRate",
  },
  {
    id: "PROFIT_FACTOR",
    label: "Profit factor",
    description: "Gross profit over absolute gross loss.",
    unit: "R",
    higherIsBetter: true,
    summaryField: "profitFactor",
    directionField: "profitFactor",
    strategyField: "profitFactor",
  },
  {
    id: "EXPECTANCY_R",
    label: "Expectancy (R)",
    description: "Average R per closed trade.",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "expectancyR",
    directionField: "expectancyR",
    strategyField: "expectancyR",
  },
  {
    id: "EXPECTANCY_MONEY",
    label: "Expectancy (money)",
    description: "Average money result per closed trade.",
    unit: "MONEY",
    higherIsBetter: true,
    signed: true,
    summaryField: "expectancyMoney",
  },
  {
    id: "AVG_R",
    label: "Average R",
    description: "Mean realized R multiple.",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "avgR",
  },
  {
    id: "MEDIAN_R",
    label: "Median R",
    description: "Median realized R multiple.",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "medianR",
  },
  {
    id: "BEST_R",
    label: "Best trade (R)",
    description: "Highest realized R in the period.",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "bestR",
  },
  {
    id: "WORST_R",
    label: "Worst trade (R)",
    description: "Lowest realized R in the period — closer to zero is better.",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "worstR",
  },
  {
    id: "AVG_WIN_MONEY",
    label: "Average win",
    description: "Mean money result of winning trades.",
    unit: "MONEY",
    higherIsBetter: true,
    summaryField: "avgWinMoney",
  },
  {
    id: "AVG_LOSS_MONEY",
    label: "Average loss",
    description: "Mean money result of losing trades (negative).",
    unit: "MONEY",
    higherIsBetter: true,
    signed: true,
    summaryField: "avgLossMoney",
  },
  {
    id: "AVG_WIN_R",
    label: "Average win (R)",
    description: "Mean R of winning trades.",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "avgWinR",
  },
  {
    id: "AVG_LOSS_R",
    label: "Average loss (R)",
    description: "Mean R of losing trades (positive magnitude) — lower is better.",
    unit: "R",
    higherIsBetter: false,
    summaryField: "avgLossR",
  },
  {
    id: "PAYOFF_RATIO",
    label: "Payoff ratio",
    description: "Average win R over average loss R.",
    unit: "R",
    higherIsBetter: true,
    summaryField: "payoffRatio",
  },
  {
    id: "MAX_DRAWDOWN_R",
    label: "Max drawdown (R)",
    description: "Worst peak-to-trough decline of the cumulative-R curve (≤ 0).",
    unit: "R",
    higherIsBetter: true,
    signed: true,
    summaryField: "maxDrawdownR",
  },
  {
    id: "MAX_DRAWDOWN_PCT",
    label: "Max drawdown (%)",
    description: "Worst equity peak-to-trough decline in percent (≤ 0).",
    unit: "PERCENT",
    higherIsBetter: true,
    signed: true,
    summaryField: "maxDrawdownPct",
    strategyField: "maxDrawdownR",
  },
  {
    id: "RECOVERY_FACTOR",
    label: "Recovery factor",
    description: "Net P&L over the worst drawdown — higher recovers faster.",
    unit: "R",
    higherIsBetter: true,
    summaryField: "recoveryFactor",
  },
  {
    id: "SHARPE",
    label: "Sharpe",
    description: "Annualized Sharpe over daily R sums (methodology in the Analytics module).",
    unit: "R",
    higherIsBetter: true,
    summaryField: "sharpe",
  },
  {
    id: "SORTINO",
    label: "Sortino",
    description: "Downside-risk-adjusted return (methodology in the Analytics module).",
    unit: "R",
    higherIsBetter: true,
    summaryField: "sortino",
  },
  {
    id: "SQN",
    label: "SQN",
    description: "System Quality Number — mean(R) ÷ std(R) × √n.",
    unit: "R",
    higherIsBetter: true,
    summaryField: "sqn",
  },
  {
    id: "TRADES",
    label: "Closed trades",
    description: "Number of eligible closed trades in the population.",
    unit: "COUNT",
    higherIsBetter: null,
    summaryField: "trades",
    directionField: "trades",
    strategyField: "trades",
  },
  {
    id: "WINNING_TRADES",
    label: "Winning trades",
    description: "Trades closed with a positive result.",
    unit: "COUNT",
    higherIsBetter: true,
    summaryField: "winningTrades",
  },
  {
    id: "LOSING_TRADES",
    label: "Losing trades",
    description: "Trades closed with a negative result.",
    unit: "COUNT",
    higherIsBetter: false,
    summaryField: "losingTrades",
  },
  {
    id: "BREAKEVEN_TRADES",
    label: "Breakeven trades",
    description: "Closed trades with a flat result.",
    unit: "COUNT",
    higherIsBetter: null,
    summaryField: "breakevenTrades",
  },
  {
    id: "AVG_DURATION",
    label: "Avg holding time",
    description: "Mean holding duration in minutes.",
    unit: "MINUTES",
    higherIsBetter: null,
    summaryField: "avgDurationMin",
    directionField: "avgDurationMin",
    strategyField: "avgDurationMin",
  },
] as const;

const METRICS_BY_ID = new Map(METRIC_CATALOG.map((metric) => [metric.id, metric]));

/** Stable catalog lookup — unknown ids never render. */
export function getMetricDefinition(id: string): MetricDefinition | null {
  return METRICS_BY_ID.get(id) ?? null;
}

/** Metrics usable in the METRICS_CARD (summary-backed entries). */
export const METRICS_CARD_CATALOG: readonly MetricDefinition[] = METRIC_CATALOG.filter(
  (metric) => metric.summaryField !== undefined,
);

/** Metrics usable in the LONG_SHORT widget (direction-row-backed entries). */
export const LONG_SHORT_CATALOG: readonly MetricDefinition[] = METRIC_CATALOG.filter(
  (metric) => metric.directionField !== undefined,
);

/** KPI ids the shipped metrics card starts with. */
export const DEFAULT_METRIC_IDS = DEFAULT_METRICS_CARD_CONFIG.metrics;

// ── Periods & previous-period comparison (§11) ──────────────────────────────

export const METRICS_CARD_PERIODS: readonly { value: MetricsCardWidgetConfig["period"]; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "LAST_WEEK", label: "Last week" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "THIS_QUARTER", label: "This quarter" },
  { value: "THIS_YEAR", label: "This year" },
  { value: "LAST_30", label: "Last 30 days" },
  { value: "LAST_90", label: "Last 90 days" },
  { value: "YTD", label: "Year to date" },
  { value: "ALL", label: "All time" },
  { value: "CUSTOM", label: "Custom range" },
];

/**
 * Server-resolved previous equivalents ONLY — the server owns period
 * resolution against the trading-day clock, so the client never does its
 * own date math (no timezone drift, no overlapping windows). Presets
 * without an entry show an explicit "comparison unavailable" state.
 */
export const PREVIOUS_PERIOD_MAP: Partial<Record<MetricsCardWidgetConfig["period"], AnalyticsFiltersInput>> = {
  TODAY: { period: "YESTERDAY" },
  THIS_WEEK: { period: "LAST_WEEK" },
  THIS_MONTH: { period: "LAST_MONTH" },
};

export interface AnalyticsFiltersInput {
  period: MetricsCardWidgetConfig["period"];
  customFrom?: string;
  customTo?: string;
}

/** The filters a metrics card fetches for its configured period. */
export function filtersForPeriod(config: MetricsCardWidgetConfig): AnalyticsFiltersInput {
  if (config.period === "CUSTOM") {
    return { period: "CUSTOM", customFrom: config.customFrom, customTo: config.customTo };
  }
  return { period: config.period };
}

/** Previous-period filters when the preset supports a comparison, else null. */
export function previousPeriodFilters(config: MetricsCardWidgetConfig): AnalyticsFiltersInput | null {
  if (config.comparison !== "PREVIOUS") return null;
  if (config.period === "CUSTOM") return null; // equivalent-window shifting is server-side territory
  return PREVIOUS_PERIOD_MAP[config.period] ?? null;
}

// ── Comparison math (metric-aware semantics) ────────────────────────────────

export type ComparisonSentiment = "IMPROVED" | "DETERIORATED" | "NEUTRAL";

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  /** current − previous (null when either side is missing). */
  absDelta: number | null;
  /** % change vs |previous| (null when the baseline is 0/missing — never
   * an infinite or misleading ratio). */
  pctDelta: number | null;
  direction: "UP" | "DOWN" | "FLAT";
  sentiment: ComparisonSentiment | null;
}

/** Epsilon below which a delta reads as flat (avoids float-noise arrows). */
const FLAT_EPSILON = 1e-9;

/**
 * Compare one metric across two server-computed periods. Missing sides
 * (null fields, empty previous period, multi-currency money) propagate as
 * "unavailable" — never fabricated, never an Infinity.
 */
export function compareMetric(
  metric: MetricDefinition,
  current: number | null,
  previous: number | null,
): MetricComparison {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return {
      current,
      previous,
      absDelta: null,
      pctDelta: null,
      direction: "FLAT",
      sentiment: null,
    };
  }
  const absDelta = current - previous;
  const pctDelta =
    previous !== 0 && Number.isFinite(previous) ? (absDelta / Math.abs(previous)) * 100 : null;
  const direction =
    Math.abs(absDelta) < FLAT_EPSILON ? "FLAT" : absDelta > 0 ? "UP" : "DOWN";
  const sentiment: ComparisonSentiment | null =
    metric.higherIsBetter === null || direction === "FLAT"
      ? "NEUTRAL"
      : (absDelta > 0) === metric.higherIsBetter
        ? "IMPROVED"
        : "DETERIORATED";
  return { current, previous, absDelta, pctDelta, direction, sentiment };
}

/** Read a metric's numeric value off a suite summary (null when absent). */
export function summaryMetricValue(summary: AnalyticsSuiteResponse["summary"], metricId: string): number | null {
  const metric = getMetricDefinition(metricId);
  if (!metric?.summaryField) return null;
  return parseDecimal(summary[metric.summaryField] as string | number | null | undefined);
}

/** Read a metric's numeric value off a direction row (null when absent). */
export function directionMetricValue(
  row: AnalyticsSuiteResponse["directions"][number] | undefined,
  metricId: string,
): number | null {
  const metric = getMetricDefinition(metricId);
  if (!row || !metric?.directionField) return null;
  return parseDecimal(row[metric.directionField] as string | number | null | undefined);
}

/** Read a metric's numeric value off a strategy row (null when absent). */
export function strategyMetricValue(
  row: AnalyticsSuiteResponse["strategies"][number] | undefined,
  metricId: string,
): number | null {
  const metric = getMetricDefinition(metricId);
  if (!row || !metric?.strategyField) return null;
  return parseDecimal(row[metric.strategyField] as string | number | null | undefined);
}

// ── Config equality (dirty tracking) ────────────────────────────────────────

/** Deterministic stringify (sorted keys) — configs are tiny plain objects. */
export function configEquals(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
