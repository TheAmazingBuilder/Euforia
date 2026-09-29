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
import { MethodNote } from "@/components/analytics/metric-card";
import { cn } from "@/lib/utils";

/**
 * Strategy / Market / Time / Psychology tabs (MASTER PROMPT §12, §13, §14,
 * §15, §19). Comparisons are FACTUAL — the module never declares a "best
 * strategy" and psychology wording stays correlational ("observed in this
 * dataset"), never causal (§19).
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
  return (
    <div className="space-y-4" data-testid="analytics-tab-strategy">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Strategy performance</CardTitle>
          <CardDescription className="text-xs">
            Factual comparison of playbook strategies and out-of-playbook trades. Click a row to filter the whole module
            on that strategy. The module deliberately does NOT crown a “best” strategy — sample sizes differ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.strategies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No strategies in this dataset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Strategy</th>
                    <th className="py-2 pr-3 font-medium">Trades</th>
                    <th className="py-2 pr-3 font-medium">Win rate</th>
                    <th className="py-2 pr-3 font-medium">PF</th>
                    <th className="py-2 pr-3 font-medium">Expectancy</th>
                    <th className="py-2 pr-3 font-medium">Net P&L</th>
                    <th className="py-2 pr-3 font-medium">Max DD (R)</th>
                    <th className="py-2 pr-3 font-medium">Avg hold</th>
                    <th className="py-2 font-medium">Plan followed</th>
                  </tr>
                </thead>
                <tbody>
                  {suite.strategies.map((row) => (
                    <tr
                      key={row.strategyId ?? "none"}
                      className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                      onClick={() => onDrillToStrategy?.(row.strategyId)}
                      title="Filter the module on this strategy"
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
              PF = gross profit ÷ |gross loss|. Rows below 10 trades are small samples — compare shapes, not decimals.
            </MethodNote>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function MarketTab({ suite, onDrillToSymbol }: RowClickProps & { suite: Suite }) {
  return (
    <div className="space-y-4" data-testid="analytics-tab-market">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">By symbol</CardTitle>
          <CardDescription className="text-xs">
            Where your edge lives — click a row to filter the whole module on that symbol.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.symbols.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No symbols in this dataset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Symbol</th>
                    <th className="py-2 pr-3 font-medium">Class</th>
                    <th className="py-2 pr-3 font-medium">Trades</th>
                    <th className="py-2 pr-3 font-medium">Win rate</th>
                    <th className="py-2 pr-3 font-medium">PF</th>
                    <th className="py-2 pr-3 font-medium">Avg R</th>
                    <th className="py-2 font-medium">Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {suite.symbols.map((row) => (
                    <tr
                      key={row.instrumentId}
                      className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/60"
                      onClick={() => onDrillToSymbol?.(row.instrumentId)}
                      title="Filter the module on this symbol"
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
          <CardTitle className="font-heading text-base font-semibold">By asset class</CardTitle>
          <CardDescription className="text-xs">
            Aggregated exposure result per market family (forex, metals, crypto, synthetics…).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.assetClasses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>
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
                    {row.winRate === null ? "—" : formatPercent(row.winRate, 0)} win ·{" "}
                    {row.avgR === null ? "—" : formatR(row.avgR)} avg
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
  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <BucketBars buckets={buckets} ariaLabel={`${title} — average R per bucket with sample sizes`} height={220} />
      </CardContent>
    </Card>
  );
}

export function TimeTab({ suite }: { suite: Suite }) {
  return (
    <div className="space-y-4" data-testid="analytics-tab-time">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Weekday × hour heatmap</CardTitle>
          <CardDescription className="text-xs">
            Average R by weekday and UTC hour bucket. Cells below 10 trades are visually flagged — small samples are not
            edges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RHeatmap cells={suite.heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <BucketPanel
          title="By session"
          description="Asia / London / New York — derived from the entry hour (UTC)."
          buckets={suite.sessions}
        />
        <BucketPanel
          title="By weekday"
          description="Monday first — does your performance have a weekly rhythm?"
          buckets={suite.weekdays}
        />
      </div>
      <BucketPanel
        title="By hour bucket"
        description="Average R across the six UTC hour buckets of the trading day."
        buckets={suite.hours}
      />
    </div>
  );
}

export function PsychologyTab({ suite }: { suite: Suite }) {
  const psychology = suite.psychology;
  return (
    <div className="space-y-4" data-testid="analytics-tab-psychology">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <BucketPanel
          title="Emotion before entry"
          description="Average R per pre-trade emotion, weakest first — friction surfaces on top."
          buckets={psychology.emotionsBefore}
        />
        <BucketPanel
          title="Emotion after close"
          description="How the trade left you — compare with the before-entry state."
          buckets={psychology.emotionsAfter}
        />
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Confidence bands</CardTitle>
          <CardDescription className="text-xs">
            Outcomes by self-reported confidence (1–5) at entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {psychology.confidenceBands.map((band) => (
              <div key={band.band} className="rounded-lg border border-border bg-surface-raised p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Confidence {band.band}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{band.trades}</p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {band.winRate === null ? "—" : formatPercent(band.winRate, 0)} win
                </p>
                <p
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    band.avgR === null ? "text-muted-foreground" : Number(band.avgR) >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {band.avgR === null ? "—" : formatR(band.avgR)} avg
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <MethodNote>
              These are observations in this dataset only. Higher confidence historically associated with better
              (or worse) outcomes is a correlation — it does not prove the emotion causes the result.
            </MethodNote>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
