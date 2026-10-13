"use client";

import * as React from "react";
import type { AnalyticsExtendedResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard, MethodNote } from "@/components/analytics/metric-card";
import { HistogramChart } from "@/components/analytics/panels-charts";
import { BucketBars } from "@/components/analytics/bucket-bars";
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Consistency tab (MASTER PROMPT §26) — stability of risk, sizing, frequency,
 * strategy usage, session focus and planned RR. Every figure arrives
 * server-computed on the SAME filtered dataset; scores are DESCRIPTIVE
 * (100 = uniform), never a quality verdict. Labels resolve through
 * dict.analytics.consistency (the dict.* pattern).
 */

type Extended = AnalyticsExtendedResponse;

export function ConsistencyTab({ data }: { data: Extended }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["consistency"] = dict.analytics.consistency;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  const consistency = data.consistency;
  const money = data.meta.singleCurrency;
  const currency = data.currency;

  const riskValue = (raw: string | null): string => {
    if (raw === null) return "—";
    return money ? formatMoney(raw, currency) : raw;
  };

  if (data.meta.closedTrades === 0) {
    return (
      <div data-testid="analytics-tab-consistency">
        <Card className="bg-surface">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{T.empty}</CardContent>
        </Card>
      </div>
    );
  }

  const maxStrategyShare = Math.max(
    ...consistency.strategyFocus.rows.map((row) => Number(row.sharePct)),
    1,
  );

  return (
    <div className="space-y-4" data-testid="analytics-tab-consistency">
      <MethodNote>{T.intro}</MethodNote>

      {/* Per-dimension consistency scores (server-computed, descriptive). */}
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-base font-semibold">{T.scoresTitle}</h2>
          <p className="text-xs text-muted-foreground">{T.scoresDesc}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
          {consistency.scores.map((score) => (
            <MetricCard
              key={score.key}
              label={score.key.replaceAll("_", " ")}
              value={String(score.score)}
              definition={score.detail}
              tone={score.score >= 70 ? "profit" : score.score >= 40 ? "warning" : "loss"}
            />
          ))}
        </div>
      </section>

      {/* Risk + Sizing — the two sizing-stability dimensions. */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.riskTitle}</CardTitle>
            <CardDescription className="text-xs">{T.riskDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.riskMedian}</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{riskValue(consistency.risk.median)}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.riskAvg}</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{riskValue(consistency.risk.avg)}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.riskDeviation}</p>
                <p
                  className={cn(
                    "mt-1 font-mono text-lg font-semibold tabular-nums",
                    consistency.risk.deviationPct !== null && Number(consistency.risk.deviationPct) > 50
                      ? "text-warning"
                      : "text-foreground",
                  )}
                >
                  {consistency.risk.deviationPct === null ? "—" : `${formatNumber(consistency.risk.deviationPct, 1)} %`}
                </p>
              </div>
            </div>
            {consistency.risk.buckets.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {T.riskDistTitle}
                </p>
                <HistogramChart
                  bins={consistency.risk.buckets}
                  ariaLabel={T.riskDistTitle}
                  className="h-40"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.sizingTitle}</CardTitle>
            <CardDescription className="text-xs">{T.sizingDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-raised p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.sizingCv}</p>
              <p
                className={cn(
                  "mt-1 font-mono text-lg font-semibold tabular-nums",
                  consistency.sizing.cvPct !== null && Number(consistency.sizing.cvPct) > 60 ? "text-warning" : "text-foreground",
                )}
              >
                {consistency.sizing.cvPct === null ? "—" : `${formatNumber(consistency.sizing.cvPct, 1)} %`}
              </p>
            </div>
            {consistency.sizing.buckets.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {T.sizingDistTitle}
                </p>
                <HistogramChart
                  bins={consistency.sizing.buckets}
                  ariaLabel={T.sizingDistTitle}
                  className="h-40"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Frequency + Planned RR. */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.frequencyTitle}</CardTitle>
            <CardDescription className="text-xs">{T.frequencyDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.activeDays}</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{consistency.frequency.activeDays}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.avgPerDay}</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                  {consistency.frequency.avgPerDay === null ? "—" : formatNumber(consistency.frequency.avgPerDay, 1)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.maxPerDay}</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{consistency.frequency.maxPerDay}</p>
              </div>
            </div>
            {consistency.frequency.dailyBuckets.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {T.freqDistTitle}
                </p>
                <HistogramChart
                  bins={consistency.frequency.dailyBuckets}
                  ariaLabel={T.freqDistTitle}
                  className="h-40"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.rrTitle}</CardTitle>
            <CardDescription className="text-xs">{T.rrDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-raised p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.rrWithPlan}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{consistency.rr.withPlan}</p>
            </div>
            {consistency.rr.buckets.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {T.rrDistTitle}
                </p>
                <HistogramChart
                  bins={consistency.rr.buckets}
                  ariaLabel={T.rrDistTitle}
                  className="h-40"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Strategy usage + Session focus — where the entries concentrate. */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.strategyTitle}</CardTitle>
            <CardDescription className="text-xs">{T.strategyDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {consistency.strategyFocus.rows.map((row) => (
              <div key={row.name} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-medium">{row.name}</span>
                  <span className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
                    <span className="text-muted-foreground">{row.trades}</span>
                    <span>{formatPercent(Number(row.sharePct) / 100, 1)}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      row.name === "Out of playbook" ? "bg-warning" : "bg-accent",
                    )}
                    style={{ width: `${(Number(row.sharePct) / maxStrategyShare) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.sessionTitle}</CardTitle>
            <CardDescription className="text-xs">{T.sessionDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <BucketBars
              buckets={consistency.sessionFocus.buckets}
              ariaLabel={`${T.sessionTitle} — ${SH.tradesSuffix}`}
              height={200}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
