"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCcw } from "lucide-react";
import type { Currency, MetricsCardWidgetConfig } from "@cosmoz/shared";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatR,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardFilters } from "@cosmoz/shared";
import { useAnalyticsSuite } from "@/lib/api/queries";
import { isDefaultFilters } from "@/lib/dashboard-customization/filters";
import { cn } from "@/lib/utils";
import {
  compareMetric,
  filtersForPeriod,
  getMetricDefinition,
  previousPeriodFilters,
  summaryMetricValue,
  type MetricDefinition,
} from "@/lib/dashboard-customization/widget-configs";

/**
 * Performance metrics card (Phase 02 §7/§10/§11) — the configurable KPI
 * widget. Metrics are picked from the shared catalog (server-computed
 * fields of the analytics suite — the client never re-derives), aggregated
 * over a per-widget period, with an optional comparison against the
 * previous equivalent period (server-resolved presets only).
 *
 * Formatting preferences (§8) affect presentation only — the underlying
 * numbers come from the server at full precision.
 */

const PERIOD_LABELS: Record<MetricsCardWidgetConfig["period"], string> = {
  TODAY: "today",
  YESTERDAY: "yesterday",
  THIS_WEEK: "this week",
  LAST_WEEK: "last week",
  THIS_MONTH: "this month",
  LAST_MONTH: "last month",
  THIS_QUARTER: "this quarter",
  THIS_YEAR: "this year",
  LAST_30: "the last 30 days",
  LAST_90: "the last 90 days",
  YTD: "year to date",
  ALL: "all time",
  CUSTOM: "the selected range",
};

interface MetricsCardWidgetProps {
  config: MetricsCardWidgetConfig;
  /** The authoritative global filter context (Phase 03 §7/§8 — the
   * registry note in full): when the global bar restricts the DATE
   * dimension, it wins over this widget's own period setting (the global
   * bar is the authoritative context); the widget-level period applies
   * only while the global period is ALL. Account/instrument/strategy/
   * direction always merge on top of the widget's query. */
  globalFilters?: DashboardFilters;
}

export function MetricsCardWidget({ config, globalFilters }: MetricsCardWidgetProps) {
  const globalActive = globalFilters !== undefined && !isDefaultFilters(globalFilters);
  // Global non-date dimensions merge on top; the date dimension follows the
  // documented precedence (global set → global wins; else widget's own).
  const baseFilters = globalActive
    ? (() => {
        const { period, customFrom, customTo, ...dimensions } = globalFilters!;
        const own = filtersForPeriod(config);
        const dateGlobal = period !== "ALL";
        return {
          ...(dateGlobal ? { period, customFrom, customTo } : own),
          ...dimensions,
        };
      })()
    : filtersForPeriod(config);
  // The previous-period baseline is a WIDGET-level feature: under global
  // filters the "previous equivalent" of a server-resolved preset is not
  // derived client-side — the comparison is disabled rather than faked.
  const previous = globalActive ? null : previousPeriodFilters(config);

  const current = useAnalyticsSuite(baseFilters, 50);
  const previousQuery = useAnalyticsSuite(
    previous
      ? { period: previous.period, customFrom: previous.customFrom, customTo: previous.customTo }
      : { period: "ALL" },
    50,
    { enabled: previous !== null },
  );

  const data = current.data;
  const previousData = previous ? previousQuery.data : undefined;
  const currency = data?.currency;

  const metrics = config.metrics
    .map((id) => getMetricDefinition(id))
    .filter((metric): metric is MetricDefinition => metric !== null);

  const multiCurrency = data?.meta.singleCurrency === false;
  const empty = data !== undefined && data.meta.closedTrades === 0;

  return (
    <Card className="bg-surface" data-testid="metrics-card-widget" data-period={config.period}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Performance metrics</CardTitle>
          <CardDescription className="text-xs">
            {globalActive ? (
              <span data-testid="metrics-card-global-note">
                Global filters applied
                {baseFilters.period !== "ALL" ? ` · ${PERIOD_LABELS[baseFilters.period] ?? baseFilters.period}` : ""}
                {baseFilters.customFrom && baseFilters.customTo ? ` · ${baseFilters.customFrom} → ${baseFilters.customTo}` : ""}
                {" · widget period ignored while the global date range is set"}
              </span>
            ) : (
              <>
                {config.period === "CUSTOM" && config.customFrom && config.customTo
                  ? `${config.customFrom} → ${config.customTo}`
                  : PERIOD_LABELS[config.period]}
                {config.comparison === "PREVIOUS" && previous
                  ? ` · vs ${PERIOD_LABELS[previous.period]}`
                  : ""}
              </>
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {current.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading metrics">
            {config.metrics.slice(0, 8).map((id) => (
              <Skeleton key={id} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : current.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The metrics could not load.</p>
            <Button variant="outline" size="sm" onClick={() => void current.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="metrics-card-empty">
            No closed trades in this period - nothing to measure yet.
          </p>
        ) : data ? (
          <>
            {multiCurrency && (
              <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                Multi-currency dataset - money metrics are unavailable; R-based and rate metrics still compare cleanly.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="metrics-card-grid">
              {metrics.map((metric) => {
                const value = summaryMetricValue(data.summary, metric.id);
                const previousValue =
                  previousData && previousData.meta.closedTrades > 0
                    ? summaryMetricValue(previousData.summary, metric.id)
                    : null;
                const comparison =
                  config.comparison === "PREVIOUS" && previous
                    ? compareMetric(metric, value, previousValue)
                    : null;
                return (
                  <MetricCell
                    key={metric.id}
                    metric={metric}
                    value={value}
                    comparison={comparison}
                    currency={currency}
                    notation={config.notation}
                    decimals={config.decimals}
                  />
                );
              })}
            </div>
            <p className="mt-3 text-right text-[11px] text-muted-foreground">
              {data.meta.closedTrades} closed trade{data.meta.closedTrades === 1 ? "" : "s"} in the window
              {previous && previousQuery.data
                ? ` · baseline ${previousQuery.data.meta.closedTrades}`
                : config.comparison === "PREVIOUS" && previous && !previousQuery.data
                  ? " · baseline loading…"
                  : ""}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** One KPI cell — label, formatted value, optional comparison pill. */
function MetricCell({
  metric,
  value,
  comparison,
  currency,
  notation,
  decimals,
}: {
  metric: MetricDefinition;
  value: number | null;
  comparison: ReturnType<typeof compareMetric> | null;
  currency: Currency | undefined;
  notation: MetricsCardWidgetConfig["notation"];
  decimals: MetricsCardWidgetConfig["decimals"];
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-background/40 p-3"
      data-testid="metrics-card-cell"
      data-metric={metric.id}
    >
      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={metric.description}>
        {metric.label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-lg font-semibold tabular-nums tracking-tight">
          {formatMetricValue(metric, value, currency, notation, decimals)}
        </span>
        {comparison && <ComparisonPill comparison={comparison} metric={metric} currency={currency} notation={notation} decimals={decimals} />}
      </div>
      {comparison && comparison.previous !== null && comparison.absDelta !== null && (
        <span className="text-[11px] text-muted-foreground" data-testid="metrics-card-baseline">
          prev. {formatMetricValue(metric, comparison.previous, currency, notation, decimals)}
        </span>
      )}
      {comparison && comparison.absDelta === null && (
        <span className="text-[11px] text-muted-foreground">no previous baseline</span>
      )}
    </div>
  );
}

/**
 * Comparison pill (§11) — metric-aware improvement semantics: UP is only
 * tinted profit when the metric's increase is actually a good thing.
 */
function ComparisonPill({
  comparison,
  metric,
  currency,
  notation,
  decimals,
}: {
  comparison: ReturnType<typeof compareMetric>;
  metric: MetricDefinition;
  currency: Currency | undefined;
  notation: MetricsCardWidgetConfig["notation"];
  decimals: MetricsCardWidgetConfig["decimals"];
}) {
  if (comparison.sentiment === null || comparison.absDelta === null) {
    return null;
  }
  if (comparison.direction === "FLAT") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change vs previous period</span>
      </span>
    );
  }
  const improved = comparison.sentiment === "IMPROVED";
  const Icon = comparison.direction === "UP" ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums leading-none",
        improved ? "border-profit/30 bg-profit/10 text-profit" : "border-loss/30 bg-loss/10 text-loss",
      )}
      data-testid="metrics-card-delta"
      data-sentiment={comparison.sentiment}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="sr-only">{improved ? "Improved" : "Deteriorated"}: </span>
      {formatDeltaValue(metric, comparison.absDelta, currency, notation, decimals)}
      {comparison.pctDelta !== null && (
        <span className="font-normal opacity-80">
          ({comparison.pctDelta > 0 ? "+" : "-"}
          {formatNumber(Math.abs(comparison.pctDelta), 1)} %)
        </span>
      )}
    </span>
  );
}

/** Presentation formatting per unit — shared Intl helpers, nothing new. */
function formatMetricValue(
  metric: MetricDefinition,
  value: number | null,
  currency: Currency | undefined,
  notation: MetricsCardWidgetConfig["notation"],
  decimals: MetricsCardWidgetConfig["decimals"],
): string {
  if (value === null || !Number.isFinite(value)) return "-";
  switch (metric.unit) {
    case "MONEY": {
      if (!currency) return "-";
      const digits = decimals;
      return metric.signed
        ? formatSigned(value, (amount) =>
            notation === "COMPACT"
              ? formatMoneyCompact(Math.abs(amount), currency, { digits })
              : formatMoney(Math.abs(amount), currency, { digits }),
          )
        : notation === "COMPACT"
          ? formatMoneyCompact(value, currency, { digits })
          : formatMoney(value, currency, { digits });
    }
    case "R":
      return metric.signed ? formatR(value) : formatNumber(value, decimals);
    case "PERCENT":
      return formatPercent(value, decimals);
    case "COUNT":
      return formatNumber(value, 0);
    case "MINUTES":
      return `${formatNumber(value, 0)} min`;
    default:
      return formatNumber(value, decimals);
  }
}

function formatDeltaValue(
  metric: MetricDefinition,
  delta: number,
  currency: Currency | undefined,
  notation: MetricsCardWidgetConfig["notation"],
  decimals: MetricsCardWidgetConfig["decimals"],
): string {
  switch (metric.unit) {
    case "PERCENT":
      // Rates are ratios — the delta is rendered in percentage points.
      return `${delta > 0 ? "+" : "-"}${formatNumber(Math.abs(delta * 100), decimals)} pp`;
    case "MONEY":
      return metric.signed
        ? formatSigned(delta, (amount) =>
            currency
              ? notation === "COMPACT"
                ? formatMoneyCompact(Math.abs(amount), currency, { digits: decimals })
                : formatMoney(Math.abs(amount), currency, { digits: decimals })
              : formatNumber(Math.abs(amount), decimals),
          )
        : formatNumber(delta, decimals);
    case "R":
      return formatR(delta);
    case "COUNT":
      return `${delta > 0 ? "+" : "-"}${formatNumber(Math.abs(delta), 0)}`;
    case "MINUTES":
      return `${delta > 0 ? "+" : "-"}${formatNumber(Math.abs(delta), 0)} min`;
    default:
      return formatNumber(delta, decimals);
  }
}

/** Explicit sign wrapper: "+1 234,50 $" / "-780,00 $". */
function formatSigned(value: number, formatAbsolute: (amount: number) => string): string {
  return `${value < 0 ? "-" : "+"}${formatAbsolute(Math.abs(value))}`;
}
