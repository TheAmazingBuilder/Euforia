"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trendModelOf, type SuiteStatus } from "@/lib/dashboard-customization/insights-view";

/**
 * Performance trend comparison widget (Phase 05 §9F) — the suite's weekly
 * report rollups side by side. Equivalent metrics, clearly labeled dates,
 * the week-over-week R delta shown as a labeled difference (a subtraction
 * of two server values). Measured history only — the card never projects
 * the trend forward.
 */

export function PerformanceTrendWidget({
  suite,
  status,
}: {
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  const model = React.useMemo(() => (suite ? trendModelOf(suite) : null), [suite]);
  const multiCurrency = suite?.meta.singleCurrency === false;

  return (
    <Card className="bg-surface" data-testid="performance-trend-widget">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Weekly performance trend</CardTitle>
          <CardDescription className="text-xs">
            Recent weekly rollups under the active filters — labeled dates, identical metric definitions.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading weekly trend">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The trend could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : !model || model.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="performance-trend-empty">
            No completed week in this scope yet — the trend fills in as weeks close.
          </p>
        ) : (
          <>
            {multiCurrency && (
              <p className="mb-2 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-muted-foreground" role="note">
                Mixed-currency scope — money is unavailable; R, counts and rates stay computed.
              </p>
            )}
            <div className="overflow-x-auto" data-testid="performance-trend-table">
              <table className="w-full min-w-[480px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="pb-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Week
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Trades
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Net P&L
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      R total
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Δ R vs prev.
                    </th>
                    <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Win rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((row) => (
                    <tr key={row.key} className="border-b border-border/60">
                      <td className="py-2 pr-3 text-sm font-medium">{row.key}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{formatNumber(row.trades, 0)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">
                        {multiCurrency || row.netPnl === null ? "—" : formatMoney(row.netPnl, model.currency)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">{formatR(row.r)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">
                        {row.rDelta === null ? "—" : formatR(row.rDelta)}
                      </td>
                      <td className="py-2 text-right font-mono text-sm tabular-nums">
                        {row.winRate === null ? "—" : formatPercent(row.winRate, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Measured history, not a forecast — past weekly sequences do not predict future ones.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
