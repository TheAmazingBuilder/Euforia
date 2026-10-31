"use client";

import * as React from "react";
import Link from "next/link";
import { ChartColumn } from "lucide-react";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsSuite } from "@/lib/api/queries/stats";
import { formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Strategy Performance (§19): one row per strategy from the SAME filtered
 * analytics dataset the Analytics module uses - trades, win rate, profit
 * factor, expectancy, avg win/loss, max drawdown, duration, plan adherence.
 * NO overall "best strategy" score (§19): small samples are flagged instead.
 */

type StrategyRow = AnalyticsSuiteResponse["strategies"][number];

export function PerformancePanel() {
  const { dict } = useI18n();
  const V = dict.playbook.performance;
  const suite = useAnalyticsSuite({ period: "ALL" });

  if (suite.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={V.loadingAria}>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (suite.isError || !suite.data) {
    return (
      <Card className="bg-surface">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {V.errorBody}
        </CardContent>
      </Card>
    );
  }

  const rows: StrategyRow[] = [...suite.data.strategies]
    .filter((row) => row.strategyId !== null)
    .sort((a, b) => b.trades - a.trades);
  const currency = suite.data.currency;

  if (rows.length === 0) {
    return (
      <Card className="bg-surface">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <ChartColumn className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 font-heading text-lg font-semibold">{V.emptyTitle}</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {V.emptyBody}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface" data-testid="performance-table">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">{V.thStrategy}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thTrades}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thWinRate}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thPF}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thExpectancy}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thAvgWin}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thAvgLoss}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thMaxDD}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thDuration}</th>
              <th className="px-3 py-2.5 text-right font-medium">{V.thPlan}</th>
              <th className="px-4 py-2.5 text-right font-medium">{V.thNetPnl}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const smallSample = row.trades < 5;
              const expectancy = Number(row.expectancyR);
              const expectancyKnown = row.expectancyR !== null && Number.isFinite(expectancy);
              return (
                <tr key={row.strategyId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{row.name}</span>
                      {smallSample ? (
                        <Badge
                          variant="outline"
                          className="border-warning/40 px-1.5 py-0 text-[10px] text-warning"
                          title={V.smallSampleTitle}
                        >
                          n&lt;5
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <NumCell value={String(row.trades)} />
                  <NumCell value={formatPercent(row.winRate, 1)} />
                  <NumCell value={formatNumber(row.profitFactor, 2)} />
                  <NumCell
                    value={formatR(row.expectancyR)}
                    tone={expectancyKnown ? (expectancy >= 0 ? "profit" : "loss") : undefined}
                  />
                  <NumCell value={formatR(row.avgWinR)} tone="profit" />
                  <NumCell
                    value={row.avgLossR === null ? "-" : formatR(-Math.abs(Number(row.avgLossR)))}
                    tone="loss"
                  />
                  <NumCell value={formatR(row.maxDrawdownR)} tone="loss" />
                  <NumCell
                    value={formatDuration(row.avgDurationMin, {
                      min: V.unitMin,
                      hour: V.unitHour,
                      day: V.unitDay,
                    })}
                  />
                  <NumCell value={formatPercent(row.followedPlanPct, 1)} />
                  <td
                    className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                      row.netPnl !== null && Number(row.netPnl) >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {row.netPnl === null ? "-" : formatSignedMoney(row.netPnl, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <p>
          {V.footnoteA} {currency} {V.footnoteB}
        </p>
        <Link href="/analytics?tab=strategy" className="text-accent underline-offset-2 hover:underline">
          {V.openAnalytics}
        </Link>
      </div>
    </div>
  );
}

function NumCell({ value, tone }: { value: string; tone?: "profit" | "loss" }) {
  return (
    <td
      className={`px-3 py-2.5 text-right font-mono tabular-nums ${
        tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-foreground"
      }`}
    >
      {value}
    </td>
  );
}

function formatDuration(
  minutes: number | null | undefined,
  units: { min: string; hour: string; day: string },
): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "-";
  if (minutes < 60) return `${Math.round(minutes)}${units.min}`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}${units.hour}`;
  return `${(hours / 24).toFixed(1)}${units.day}`;
}
