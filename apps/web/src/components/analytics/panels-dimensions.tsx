"use client";

import * as React from "react";
import type { AnalyticsBucket, AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BucketBars, LOW_SAMPLE_N } from "@/components/analytics/bucket-bars";
import { RHeatmap } from "@/components/analytics/r-heatmap";
import { AbComparator } from "@/components/analytics/ab-comparator";
import { MethodNote } from "@/components/analytics/metric-card";
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Strategy / Market / Time / Psychology tabs (MASTER PROMPT §12, §13, §14,
 * §15, §19). Comparisons are FACTUAL — the module never declares a "best
 * strategy" and psychology wording stays correlational ("observed in this
 * dataset"), never causal (§19). Labels resolve through dict.analytics.*
 * (the dict.* pattern) — machine composition stays in the component.
 */

type Suite = AnalyticsSuiteResponse;

interface RowClickProps {
  /** Drill-through: apply a dimension filter to the WHOLE module (§33). */
  onDrillToStrategy?: (strategyId: string | null) => void;
  onDrillToSymbol?: (instrumentId: string) => void;
}

function sampleTone(trades: number): string {
  return trades < LOW_SAMPLE_N ? "text-warning" : "text-muted-foreground";
}

export function StrategyTab({ suite, onDrillToStrategy }: RowClickProps & { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["dimensions"]["strategy"] = dict.analytics.dimensions.strategy;
  return (
    <div className="space-y-4" data-testid="analytics-tab-strategy">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.title}</CardTitle>
          <CardDescription className="text-xs">
            {T.desc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.strategies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{T.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{T.thStrategy}</th>
                    <th className="py-2 pr-3 font-medium">{T.thTrades}</th>
                    <th className="py-2 pr-3 font-medium">{T.thWinRate}</th>
                    <th className="py-2 pr-3 font-medium">{T.thPF}</th>
                    <th className="py-2 pr-3 font-medium">{T.thExpectancy}</th>
                    <th className="py-2 pr-3 font-medium">{T.thNetPnl}</th>
                    <th className="py-2 pr-3 font-medium">{T.thMaxDD}</th>
                    <th className="py-2 pr-3 font-medium">{T.thAvgHold}</th>
                    <th className="py-2 font-medium">{T.thPlanFollowed}</th>
                  </tr>
                </thead>
                <tbody>
                  {suite.strategies.map((row) => (
                    <tr
                      key={row.strategyId ?? "none"}
                      className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                      onClick={() => onDrillToStrategy?.(row.strategyId)}
                      title={T.rowTitle}
                    >
                      <td className="py-2.5 pr-3 text-xs font-medium">{row.name}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{row.trades}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                        {row.winRate === null ? "—" : formatPercent(row.winRate, 0)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                        {row.profitFactor === null ? "—" : formatNumber(row.profitFactor, 2)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pr-3 font-mono text-xs tabular-nums",
                          row.expectancyR === null ? "" : Number(row.expectancyR) >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {row.expectancyR === null ? "—" : formatR(row.expectancyR)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pr-3 font-mono text-xs tabular-nums",
                          row.netPnl === null ? "" : Number(row.netPnl) >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, suite.currency)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-loss">
                        {formatR(row.maxDrawdownR)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                        {row.avgDurationMin === null
                          ? "—"
                          : row.avgDurationMin < 60
                            ? `${row.avgDurationMin}m`
                            : `${Math.round(row.avgDurationMin / 60)}h`}
                      </td>
                      <td className="py-2.5 font-mono text-xs tabular-nums">
                        {row.followedPlanPct === null ? "—" : formatPercent(row.followedPlanPct, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <MethodNote>
              {T.methodNote}
            </MethodNote>
          </div>
        </CardContent>
      </Card>

      <AbComparator suite={suite} />
    </div>
  );
}

export function MarketTab({ suite, onDrillToSymbol }: RowClickProps & { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["dimensions"]["market"] = dict.analytics.dimensions.market;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  return (
    <div className="space-y-4" data-testid="analytics-tab-market">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.bySymbolTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.bySymbolDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.symbols.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{T.symbolsEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{T.thSymbol}</th>
                    <th className="py-2 pr-3 font-medium">{T.thClass}</th>
                    <th className="py-2 pr-3 font-medium">{T.thTrades}</th>
                    <th className="py-2 pr-3 font-medium">{T.thWinRate}</th>
                    <th className="py-2 pr-3 font-medium">{T.thPF}</th>
                    <th className="py-2 pr-3 font-medium">{T.thAvgR}</th>
                    <th className="py-2 font-medium">{T.thNetPnl}</th>
                  </tr>
                </thead>
                <tbody>
                  {suite.symbols.map((row) => (
                    <tr
                      key={row.instrumentId}
                      className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                      onClick={() => onDrillToSymbol?.(row.instrumentId)}
                      title={T.rowTitle}
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs font-semibold">{row.symbol}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{row.assetClass}</td>
                      <td className={cn("py-2.5 pr-3 font-mono text-xs tabular-nums", sampleTone(row.trades))}>
                        {row.trades}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                        {row.winRate === null ? "—" : formatPercent(row.winRate, 0)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                        {row.profitFactor === null ? "—" : formatNumber(row.profitFactor, 2)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pr-3 font-mono text-xs tabular-nums",
                          row.avgR === null ? "" : Number(row.avgR) >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {row.avgR === null ? "—" : formatR(row.avgR)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 font-mono text-xs tabular-nums",
                          row.netPnl === null ? "" : Number(row.netPnl) >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, suite.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.byClassTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.byClassDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.assetClasses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{T.noData}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {suite.assetClasses.map((row) => (
                <div key={row.assetClass} className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {row.assetClass}
                  </p>
                  <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{row.trades}</p>
                  <p
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      row.netPnl === null ? "text-muted-foreground" : Number(row.netPnl) >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, suite.currency)}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {row.winRate === null ? "—" : formatPercent(row.winRate, 0)} {SH.winSuffix} ·{" "}
                    {row.avgR === null ? "—" : formatR(row.avgR)} {SH.avgLower}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BucketPanel({ title, description, buckets }: { title: string; description: string; buckets: AnalyticsBucket[] }) {
  const { dict } = useI18n();
  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <BucketBars
          buckets={buckets}
          ariaLabel={`${title} — ${dict.analytics.dimensions.time.bucketAriaTail}`.replace(/\s+/g, " ").trim()}
          height={220}
        />
      </CardContent>
    </Card>
  );
}

export function TimeTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["dimensions"]["time"] = dict.analytics.dimensions.time;
  return (
    <div className="space-y-4" data-testid="analytics-tab-time">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.heatmapTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.heatmapDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RHeatmap cells={suite.heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <BucketPanel
          title={T.bySession}
          description={T.bySessionDesc}
          buckets={suite.sessions}
        />
        <BucketPanel
          title={T.byWeekday}
          description={T.byWeekdayDesc}
          buckets={suite.weekdays}
        />
      </div>
      <BucketPanel
        title={T.byHour}
        description={T.byHourDesc}
        buckets={suite.hours}
      />
    </div>
  );
}

export function PsychologyTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["dimensions"]["psychology"] = dict.analytics.dimensions.psychology;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  const psychology = suite.psychology;
  return (
    <div className="space-y-4" data-testid="analytics-tab-psychology">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <BucketPanel
          title={T.beforeTitle}
          description={T.beforeDesc}
          buckets={psychology.emotionsBefore}
        />
        <BucketPanel
          title={T.afterTitle}
          description={T.afterDesc}
          buckets={psychology.emotionsAfter}
        />
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.confidenceTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.confidenceDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {psychology.confidenceBands.map((band) => (
              <div key={band.band} className="rounded-lg border border-border bg-surface-raised p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {T.confidencePrefix} {band.band}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{band.trades}</p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {band.winRate === null ? "—" : formatPercent(band.winRate, 0)} {SH.winSuffix}
                </p>
                <p
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    band.avgR === null ? "text-muted-foreground" : Number(band.avgR) >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {band.avgR === null ? "—" : formatR(band.avgR)} {SH.avgLower}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <MethodNote>
              {T.methodNote}
            </MethodNote>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
