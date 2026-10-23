"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import type { AnalyticsSuiteResponse, Currency, LongShortWidgetConfig } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SuiteStatus } from "@/lib/dashboard-customization/insights-view";
import { cn } from "@/lib/utils";
import {
  directionMetricValue,
  getMetricDefinition,
} from "@/lib/dashboard-customization/widget-configs";

/**
 * Long-vs-short widget (Phase 02 §12.2) — the server's BUY/SELL populations
 * side by side. Each side carries its own sample size; an empty population
 * renders "-" with an explicit note — never a fabricated zero.
 */

export function LongShortWidget({
  config,
  suite,
  status,
}: {
  config: LongShortWidgetConfig;
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  // Phase 05 §10: the dashboard-level fetch IS the data source — one shared,
  // filter-aware suite query (the widget's previous ALL-window fetch ignored
  // the global filter context; that wiring gap is closed).
  const currency = suite?.currency;
  const directions = suite?.directions ?? [];
  const longRow = directions.find((row) => row.direction === "BUY");
  const shortRow = directions.find((row) => row.direction === "SELL");

  return (
    <Card className="bg-surface" data-testid="long-short-widget">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Long vs short</CardTitle>
          <CardDescription className="text-xs">BUY and SELL populations under the active filters, side by side.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading long-short comparison">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The comparison could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="long-short-grid">
            <DirectionColumn
              title="Long (BUY)"
              row={longRow}
              config={config}
              currency={currency}
              testId="long-short-long"
            />
            <DirectionColumn
              title="Short (SELL)"
              row={shortRow}
              config={config}
              currency={currency}
              testId="long-short-short"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DirectionColumn({
  title,
  row,
  config,
  currency,
  testId,
}: {
  title: string;
  row: Parameters<typeof directionMetricValue>[0];
  config: LongShortWidgetConfig;
  currency: Currency | undefined;
  testId: string;
}) {
  const empty = !row || row.trades === 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3",
        empty && "opacity-75",
      )}
      data-testid={testId}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {row ? `${row.trades} trade${row.trades === 1 ? "" : "s"}` : "no trades"}
        </span>
      </div>
      {empty ? (
        <p className="py-3 text-xs text-muted-foreground">
          No eligible closed trades in this direction - nothing to compare.
        </p>
      ) : (
        <dl className="space-y-1.5">
          {config.metrics.map((metricId) => {
            const metric = getMetricDefinition(metricId);
            const value = directionMetricValue(row, metricId);
            return (
              <div key={metricId} className="flex items-baseline justify-between gap-2" data-testid="long-short-metric">
                <dt className="truncate text-xs text-muted-foreground">{metric?.label ?? metricId}</dt>
                <dd className="font-mono text-xs font-semibold tabular-nums">{formatDirectionValue(metricId, value, currency)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

function formatDirectionValue(metricId: string, value: number | null, currency: Currency | undefined): string {
  const metric = getMetricDefinition(metricId);
  if (!metric || value === null) return "-";
  switch (metric.unit) {
    case "MONEY":
      return currency ? formatMoney(value, currency, { digits: 0 }) : formatNumber(value, 0);
    case "PERCENT":
      return formatPercent(value, 1);
    case "R":
      return metric.id === "EXPECTANCY_R" ? formatR(value) : formatNumber(value, 2);
    case "COUNT":
      return formatNumber(value, 0);
    case "MINUTES":
      return formatNumber(value, 0) + "m";
    default:
      return formatNumber(value, 2);
  }
}
