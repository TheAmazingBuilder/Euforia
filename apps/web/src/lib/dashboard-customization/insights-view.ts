import type {
  AnalyticsSuiteResponse,
  Currency,
  PerformanceBreakdownWidgetConfig,
  TradingInsightMetric,
  TradingInsightReliability,
} from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR, parseDecimal } from "@cosmoz/shared";

/**
 * Phase 05 widget view-models — PURE presentation helpers between the
 * analytics-suite payload and the insight widgets. The client never
 * re-derives analytics here: rows are projected from server-computed suite
 * sections, and the only arithmetic is display ordering, a display cap and
 * the week-over-week DELTA the trend card labels (a subtraction of two
 * server values, not a recomputation).
 */

/** The dashboard-level suite fetch status passed down to suite-fed widgets. */
export interface SuiteStatus {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// ── Performance breakdown (§9A) ─────────────────────────────────────────────

export const BREAKDOWN_MAX_ROWS = 8;

export interface BreakdownRow {
  key: string;
  label: string;
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  avgR: number | null;
  netPnl: number | null;
  avgDurationMin: number | null;
}

export interface BreakdownModel {
  rows: BreakdownRow[];
  /** Honest truncation: how many further rows exist beyond the cap. */
  truncated: number;
  /** null = every column is available; otherwise the money column shows "—". */
  moneyNote: string | null;
}

type BreakdownDimension = PerformanceBreakdownWidgetConfig["dimension"];

export const BREAKDOWN_DIMENSION_LABELS: Record<BreakdownDimension, string> = {
  STRATEGY: "Strategy",
  INSTRUMENT: "Instrument",
  DIRECTION: "Direction",
  WEEKDAY: "Weekday",
  HOUR: "Entry hour",
  DURATION: "Holding duration",
  ASSET_CLASS: "Asset class",
};

export function breakdownModelOf(
  suite: AnalyticsSuiteResponse,
  dimension: BreakdownDimension,
): BreakdownModel {
  const moneyNote =
    suite.meta.singleCurrency === false
      ? "Mixed-currency scope — money columns are unavailable; R, counts and rates stay computed."
      : null;
  let rows: BreakdownRow[];
  switch (dimension) {
    case "STRATEGY":
      rows = suite.strategies.map((row) => ({
        key: row.strategyId ?? "none",
        label: row.name,
        trades: row.trades,
        winRate: parseDecimal(row.winRate),
        profitFactor: parseDecimal(row.profitFactor),
        avgR: parseDecimal(row.expectancyR),
        netPnl: parseDecimal(row.netPnl),
        avgDurationMin: row.avgDurationMin,
      }));
      break;
    case "INSTRUMENT":
      rows = suite.symbols.map((row) => ({
        key: row.instrumentId,
        label: row.symbol,
        trades: row.trades,
        winRate: parseDecimal(row.winRate),
        profitFactor: parseDecimal(row.profitFactor),
        avgR: parseDecimal(row.avgR),
        netPnl: parseDecimal(row.netPnl),
        avgDurationMin: null,
      }));
      break;
    case "ASSET_CLASS":
      rows = suite.assetClasses.map((row) => ({
        key: row.assetClass,
        label: row.assetClass,
        trades: row.trades,
        winRate: parseDecimal(row.winRate),
        profitFactor: parseDecimal(row.profitFactor),
        avgR: parseDecimal(row.avgR),
        netPnl: parseDecimal(row.netPnl),
        avgDurationMin: null,
      }));
      break;
    case "DIRECTION":
      rows = suite.directions.map((row) => ({
        key: row.direction,
        label: row.direction === "BUY" ? "Long (BUY)" : "Short (SELL)",
        trades: row.trades,
        winRate: parseDecimal(row.winRate),
        profitFactor: parseDecimal(row.profitFactor),
        avgR: parseDecimal(row.expectancyR),
        netPnl: parseDecimal(row.netPnl),
        avgDurationMin: row.avgDurationMin,
      }));
      break;
    case "WEEKDAY":
      rows = suite.weekdays.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        trades: bucket.trades,
        winRate: parseDecimal(bucket.winRate),
        profitFactor: null,
        avgR: parseDecimal(bucket.avgR),
        netPnl: null,
        avgDurationMin: null,
      }));
      break;
    case "HOUR":
      rows = suite.hours.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        trades: bucket.trades,
        winRate: parseDecimal(bucket.winRate),
        profitFactor: null,
        avgR: parseDecimal(bucket.avgR),
        netPnl: null,
        avgDurationMin: null,
      }));
      break;
    case "DURATION":
      rows = suite.durations.buckets.map((bucket) => ({
        key: bucket.label,
        label: bucket.label,
        trades: bucket.trades,
        winRate: parseDecimal(bucket.winRate),
        profitFactor: null,
        avgR: parseDecimal(bucket.avgR),
        netPnl: parseDecimal(bucket.netPnl),
        avgDurationMin: null,
      }));
      break;
  }
  // Display ordering only (busiest populations first, ties alphabetical) —
  // this is presentation, never a ranking verdict.
  rows = [...rows].sort((a, b) => b.trades - a.trades || a.label.localeCompare(b.label));
  return {
    rows: rows.slice(0, BREAKDOWN_MAX_ROWS),
    truncated: Math.max(0, rows.length - BREAKDOWN_MAX_ROWS),
    moneyNote,
  };
}

// ── Weekly performance trend (§9F) ──────────────────────────────────────────

export const TREND_MAX_WEEKS = 6;

export interface TrendRow {
  /** ISO week key from the server (e.g. "2026-W11") — clearly labeled dates. */
  key: string;
  trades: number;
  netPnl: number | null;
  r: number;
  winRate: number | null;
  /** R delta vs the PREVIOUS week in the list (null for the first row). */
  rDelta: number | null;
}

export function trendModelOf(suite: AnalyticsSuiteResponse): { rows: TrendRow[]; currency: Currency } {
  const weekly = [...suite.reports.weekly].sort((a, b) => a.key.localeCompare(b.key));
  const recent = weekly.slice(-TREND_MAX_WEEKS);
  const rows: TrendRow[] = recent.map((row, index) => {
    const previous = index > 0 ? recent[index - 1] : undefined;
    return {
      key: row.key,
      trades: row.trades,
      netPnl: parseDecimal(row.netPnl),
      r: parseDecimal(row.r) ?? 0,
      winRate: parseDecimal(row.winRate),
      rDelta: previous ? (parseDecimal(row.r) ?? 0) - (parseDecimal(previous.r) ?? 0) : null,
    };
  });
  return { rows, currency: suite.currency };
}

// ── Behavioral insights (§9D) ───────────────────────────────────────────────

const RELIABILITY_COPY: Record<TradingInsightReliability, { label: string; hint: string }> = {
  EARLY_OBSERVATION: {
    label: "Early observation",
    hint: "Few observations back this finding so far.",
  },
  REPEATED_PATTERN: {
    label: "Repeated pattern",
    hint: "A moderate number of observations back this finding.",
  },
  STRONG_EVIDENCE: {
    label: "Strong historical evidence",
    hint: "A large number of observations back this finding.",
  },
};

export function reliabilityCopy(reliability: TradingInsightReliability): { label: string; hint: string } {
  return RELIABILITY_COPY[reliability];
}

/** Format one typed insight metric for display. Money needs the scope
 * currency; the engine already nulled it under multi-currency. */
export function insightMetricText(metric: TradingInsightMetric, currency: Currency | null): string {
  if (metric.value === null) return "—";
  switch (metric.kind) {
    case "R":
      return formatR(metric.value);
    case "MONEY":
      return currency ? formatMoney(metric.value, currency) : "—";
    case "PERCENT":
      return formatPercent(metric.value, 1);
    case "COUNT":
      return formatNumber(metric.value, 0);
  }
}

/** The widget's empty state must explain WHY it is empty — never a fake
 * finding (spec §3/§9D). */
export const INSIGHTS_EMPTY_COPY =
  "No finding met the reporting thresholds for this scope yet. Comparisons need at least 5 observations per group — small samples stay silent instead of becoming conclusions.";
