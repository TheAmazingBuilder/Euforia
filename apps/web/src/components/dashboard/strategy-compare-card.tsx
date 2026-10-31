"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import type { AnalyticsSuiteResponse, Currency, StrategyCompareWidgetConfig } from "@cosmoz/shared";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatR,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrategies } from "@/lib/api/queries";
import type { SuiteStatus } from "@/lib/dashboard-customization/insights-view";
import {
  getMetricDefinition,
  strategyMetricValue,
} from "@/lib/dashboard-customization/widget-configs";

/**
 * Strategy comparison widget (Phase 02 §12.1) - side-by-side playbook
 * strategies on the server-computed per-strategy rows of the analytics
 * suite. The user picks the populations; the widget never ranks or
 * re-derives - factual rows with their sample sizes (statistical honesty:
 * every rate ships with its n).
 */

const COLUMNS: readonly { metricId: string; label: string }[] = [
  { metricId: "TRADES", label: "Trades" },
  { metricId: "NET_PNL", label: "Net P&L" },
  { metricId: "WIN_RATE", label: "Win rate" },
  { metricId: "PROFIT_FACTOR", label: "PF" },
  { metricId: "EXPECTANCY_R", label: "Expectancy" },
  { metricId: "AVG_DURATION", label: "Avg time" },
];

export function StrategyCompareWidget({
  config,
  suite,
  status,
}: {
  config: StrategyCompareWidgetConfig;
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  // Phase 05 §10: the dashboard-level, filter-aware suite fetch IS the data
  // source (the previous ALL-window fetch ignored the global filters).
  const strategies = useStrategies();
  const currency = suite?.currency;


  // Resolve configured ids against BOTH sources: the playbook catalog for
  // names, the suite rows for numbers. A configured strategy with no suite
  // row (no closed trades at all) renders an explicit empty row.
  const rows = config.strategyIds.map((strategyId) => {
    const name =
      strategyId === "none"
        ? "Out of playbook"
        : (strategies.data?.strategies.find((strategy) => strategy.id === strategyId)?.name ?? "Unknown strategy");
    const row = suite?.strategies.find((candidate) =>
      strategyId === "none" ? candidate.strategyId === null : candidate.strategyId === strategyId,
    );
    return { strategyId, name, row };
  });

  return (
    <Card className="bg-surface" data-testid="strategy-compare-widget">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Strategy comparison</CardTitle>
          <CardDescription className="text-xs">
            Playbook populations under the active filters - factual rows, no ranking.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading || strategies.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading strategy comparison">
            {config.strategyIds.slice(0, 4).map((id) => (
              <Skeleton key={id} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The comparison could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="strategy-compare-empty">
            No strategy selected yet - open the widget settings to pick populations.
          </p>
        ) : (
          <div className="overflow-x-auto" data-testid="strategy-compare-table">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="pb-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Strategy
                  </th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.metricId}
                      scope="col"
                      className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.strategyId}
                    className="border-b border-border/60 last:border-0"
                    data-testid="strategy-compare-row"
                    data-strategy={row.strategyId}
                  >
                    <th scope="row" className="max-w-[160px] truncate py-2 pr-3 text-xs font-medium" title={row.name}>
                      {row.name}
                    </th>
                    {COLUMNS.map((column) => (
                      <td key={column.metricId} className="py-2 pr-3 text-right font-mono text-xs tabular-nums">
                        {formatStrategyCell(column.metricId, row.row, currency)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Cell formatting - shared formatters over server fields, "-" when absent. */
function formatStrategyCell(metricId: string, row: Parameters<typeof strategyMetricValue>[0], currency: Currency | undefined): string {
  const metric = getMetricDefinition(metricId);
  const value = strategyMetricValue(row, metricId);
  if (!metric || value === null) return "-";
  switch (metric.unit) {
    case "MONEY":
      return currency ? formatMoney(value, currency) : formatNumber(value, 2);
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
