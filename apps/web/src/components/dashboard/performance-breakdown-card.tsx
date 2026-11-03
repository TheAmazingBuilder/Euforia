"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import type { AnalyticsSuiteResponse, PerformanceBreakdownWidgetConfig } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BREAKDOWN_DIMENSION_LABELS,
  BREAKDOWN_MAX_ROWS,
  breakdownModelOf,
  type SuiteStatus,
} from "@/lib/dashboard-customization/insights-view";

/**
 * Performance breakdown widget (Phase 05 §9A) - ONE factual table over the
 * server-computed suite rows of the configured dimension. The widget never
 * re-derives metrics, never ranks populations: display order is "busiest
 * first", every rate ships with its sample size, and mixed-currency scopes
 * show "-" for money with an explanatory note instead of a raw sum.
 */

interface Row {
  label: string;
  trades: string;
  winRate: string;
  profitFactor: string;
  avgR: string;
  netPnl: string;
  avgDuration: string;
}

function cell(value: string): string {
  return value;
}

export function PerformanceBreakdownWidget({
  config,
  suite,
  status,
}: {
  config: PerformanceBreakdownWidgetConfig;
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  const model = React.useMemo(
    () => (suite ? breakdownModelOf(suite, config.dimension) : null),
    [suite, config.dimension],
  );

  const rows: Row[] = React.useMemo(() => {
    if (!model) return [];
    return model.rows.map((row) => ({
      label: row.label,
      trades: formatNumber(row.trades, 0),
      winRate: row.winRate === null ? "-" : formatPercent(row.winRate, 1),
      profitFactor: row.profitFactor === null ? "-" : formatNumber(row.profitFactor, 2),
      avgR: row.avgR === null ? "-" : formatR(row.avgR),
      netPnl:
        row.netPnl === null || suite === null || !suite.meta.singleCurrency
          ? "-"
          : formatMoney(row.netPnl, suite.currency),
      avgDuration:
        row.avgDurationMin === null
          ? "-"
          : row.avgDurationMin >= 60
            ? `${formatNumber(row.avgDurationMin / 60, 1)} h`
            : `${formatNumber(row.avgDurationMin, 0)} min`,
    }));
  }, [model, suite]);

  return (
    <Card className="bg-surface" data-testid="performance-breakdown-widget">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Performance breakdown</CardTitle>
          <CardDescription className="text-xs">
            {BREAKDOWN_DIMENSION_LABELS[config.dimension]} populations under the active filters - factual
            rows, no ranking.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading performance breakdown">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The breakdown could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : !model || model.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="performance-breakdown-empty">
            No closed trades in this scope yet - the breakdown fills in as the journal grows.
          </p>
        ) : (
          <>
            {model.moneyNote && (
              <p className="mb-2 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-muted-foreground" role="note">
                {model.moneyNote}
              </p>
            )}
            <div className="overflow-x-auto" data-testid="performance-breakdown-table">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="pb-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {BREAKDOWN_DIMENSION_LABELS[config.dimension]}
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Trades
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Win rate
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Profit factor
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Avg R
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Net P&L
                    </th>
                    <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Avg time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-border/60">
                      <td className="max-w-[180px] truncate py-2 pr-3 text-sm font-medium">{row.label}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{cell(row.trades)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{cell(row.winRate)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{cell(row.profitFactor)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{cell(row.avgR)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{cell(row.netPnl)}</td>
                      <td className="py-2 text-right font-mono text-sm tabular-nums">{cell(row.avgDuration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {model.truncated > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{model.truncated} more {model.truncated === 1 ? "row" : "rows"} beyond the {BREAKDOWN_MAX_ROWS} displayed
                - available in the Analytics module.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
