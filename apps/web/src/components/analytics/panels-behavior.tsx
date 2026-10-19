"use client";

import * as React from "react";
import type { AnalyticsFilters, AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";
import { CalendarClock, Download, FileDown, Gauge, Sigma, Timer } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard, MethodNote } from "@/components/analytics/metric-card";
import { useOcrAnalytics } from "@/lib/api/queries";
import { ExcursionScatter, HistogramChart, MonteCarloChart } from "@/components/analytics/panels-charts";
import { QuarterlyReportDialog } from "@/components/analytics/quarterly-report-dialog";
import { ExportCenter } from "@/components/analytics/export-center";
import { SnapshotsPanel } from "@/components/analytics/snapshots-panel";
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { recognitionFieldLabel } from "@/i18n/dictionaries/en/recognition";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Trade Quality / Mistakes & Rules / Economic Events / Advanced Statistics /
 * Monte Carlo / Reports tabs (MASTER PROMPT §16–§18, §20, §21, §24, §25, §26).
 * Simulations are always labelled SIMULATION; missing data is declared, never
 * fabricated (§34). Labels resolve through dict.analytics.* — machine
 * composition stays in the component (the dict.* pattern).
 */

import { csvCell } from "@cosmoz/shared";

type Suite = AnalyticsSuiteResponse;

/** CSV export of the filtered dataset (§26 — export where the app supports it). */
function exportCsv(suite: Suite): void {
  const header = ["index", "date", "symbol", "r", "cumR"];
  const rows = suite.cumulativeR.map((point) => [
    String(point.index + 1),
    point.date,
    csvCell(point.symbol),
    csvCell(point.r),
    csvCell(point.cumR),
  ]);
  const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cosmoz-analytics-${suite.meta.resolvedFrom}_${suite.meta.resolvedTo}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * OCR quality card (engine quality §3.2) — the Import & Recognition funnel
 * and the correction hot-spots, fed by GET /ocr/analytics. Rendered inside
 * the Quality tab: recognition quality is a quality signal of the journal
 * itself.
 */
function OcrQualityCard() {
  const { dict } = useI18n();
  const R = dict.recognition;
  const analytics = useOcrAnalytics(30);

  if (analytics.isLoading || analytics.isError) return null;
  const data = analytics.data;
  if (!data || data.funnel.uploads === 0) return null;

  const completion = data.funnel.uploads > 0 ? data.funnel.confirmed / data.funnel.uploads : null;
  return (
    <Card className="bg-surface" data-testid="analytics-ocr-quality">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">{R.analytics.cardTitle}</CardTitle>
        <CardDescription className="text-xs">{R.analytics.cardHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <p className="ledger-label">{R.analytics.uploads}</p>
            <p className="font-mono text-xl tabular-nums">{data.funnel.uploads}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="ledger-label">{R.analytics.confirmed}</p>
            <p className="font-mono text-xl tabular-nums">
              {data.funnel.confirmed}
              {completion !== null ? <span className="text-sm text-muted-foreground"> · {formatPercent(completion, 0)}</span> : null}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="ledger-label">{R.analytics.imported}</p>
            <p className="font-mono text-xl tabular-nums text-accent">{data.funnel.importedTrades}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="ledger-label">{R.analytics.avgConfidence}</p>
            <p className="font-mono text-xl tabular-nums">
              {data.avgConfidence === null ? "—" : `${Math.round(data.avgConfidence * 100)}%`}
            </p>
          </div>
        </div>
        {data.correctionsByField.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="ledger-label">{R.analytics.correctionsTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.correctionsByField.slice(0, 6).map((entry) => (
                <span
                  key={entry.field}
                  className="rounded-sm border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                >
                  {recognitionFieldLabel(dict.recognition, entry.field)} ×{entry.corrections}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {data.correctionRate !== null ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="ledger-label">{R.analytics.correctionRate}</p>
            <p className="mt-1 font-mono text-xl tabular-nums">{formatPercent(data.correctionRate, 0)}</p>
            {data.avgDurationMs !== null ? (
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {R.analytics.avgDuration} {(data.avgDurationMs / 1000).toFixed(1)}{R.analytics.seconds}
              </p>
            ) : null}
          </div>
        ) : null}
        {data.platformDistribution.length > 0 || data.typeDistribution.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="ledger-label">{R.analytics.distributions}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.platformDistribution.slice(0, 5).map((entry) => (
                <span
                  key={entry.platform}
                  className="stamp stamp-ink !text-[9px]"
                  data-testid="analytics-platform-distribution"
                >
                  {entry.platform.replace(/_/g, " ")} ×{entry.count}
                </span>
              ))}
              {data.typeDistribution.slice(0, 5).map((entry) => (
                <span key={entry.type} className="rounded-sm border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {entry.type.replace(/_/g, " ")} ×{entry.count}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function QualityTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["behavior"]["quality"] = dict.analytics.behavior.quality;
  const quality = suite.quality;
  const followedPct = quality.planFollowed.followed + quality.planFollowed.violated > 0
    ? quality.planFollowed.followed / (quality.planFollowed.followed + quality.planFollowed.violated)
    : null;

  return (
    <div className="space-y-4" data-testid="analytics-tab-quality">
      <OcrQualityCard />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <MetricCard
          label={T.planFollowed}
          value={followedPct === null ? "—" : formatPercent(followedPct, 0)}
          definition={T.planFollowedDef}
          tone={followedPct !== null && Number(followedPct) >= 0.8 ? "profit" : "neutral"}
          sub={`${quality.planFollowed.followed} ${T.followedWord} · ${quality.planFollowed.violated} ${T.violatedWord} · ${quality.planFollowed.unknown} ${T.unknownWord}`}
          insufficient={followedPct === null}
        />
        <MetricCard
          label={T.avgMfe}
          value={quality.mfe.avgR === null ? "—" : `+${formatNumber(quality.mfe.avgR, 2)}R`}
          definition={T.avgMfeDef}
          insufficient={quality.mfe.avgR === null}
        />
        <MetricCard
          label={T.avgMae}
          value={quality.mae.avgR === null ? "—" : formatR(quality.mae.avgR)}
          definition={T.avgMaeDef}
          insufficient={quality.mae.avgR === null}
        />
        <MetricCard
          label={T.mfeCapture}
          value={quality.mfe.capturePct === null ? "—" : formatPercent(quality.mfe.capturePct, 0)}
          definition={T.mfeCaptureDef}
          tone={quality.mfe.capturePct !== null && Number(quality.mfe.capturePct) >= 0.6 ? "profit" : "neutral"}
          insufficient={quality.mfe.capturePct === null}
        />
      </div>

      {!quality.excursionAvailable && (
        <MethodNote>
          {T.excursionNote}
        </MethodNote>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.scatterTitle}</CardTitle>
            <CardDescription className="text-xs">
              {T.scatterDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quality.excursionAvailable ? (
              <ExcursionScatter scatter={quality.scatter} className="h-64" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {T.scatterEmpty}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 sm:space-y-4">
          <Card className="bg-surface">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">{T.mfeDistTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <HistogramChart bins={quality.mfeHistogram} ariaLabel={T.mfeDistAria} color="profit" className="h-36" />
            </CardContent>
          </Card>
          <Card className="bg-surface">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">{T.maeDistTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <HistogramChart bins={quality.maeHistogram} ariaLabel={T.maeDistAria} color="loss" className="h-36" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function MistakesTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["behavior"]["mistakes"] = dict.analytics.behavior.mistakes;
  const mistakes = suite.mistakes;
  return (
    <div className="space-y-4" data-testid="analytics-tab-mistakes">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label={T.tradesFlagged}
          value={String(mistakes.violatingTrades)}
          definition={T.tradesFlaggedDef}
          sub={`${suite.summary.trades} ${T.tradesInDataset}`}
        />
        <MetricCard
          label={T.sumRFlagged}
          value={formatR(mistakes.totalR)}
          definition={T.sumRFlaggedDef}
          tone={Number(mistakes.totalR) < 0 ? "loss" : "neutral"}
        />
        <MetricCard
          label={T.distinctMistakes}
          value={String(mistakes.entries.length)}
          definition={T.distinctMistakesDef}
        />
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.costTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.costDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mistakes.entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {T.empty}
            </p>
          ) : (
            <div className="space-y-2.5">
              {mistakes.entries.map((entry) => {
                const width = Math.min(
                  100,
                  (Math.abs(Number(entry.rCost)) /
                    Math.max(...mistakes.entries.map((e) => Math.abs(Number(e.rCost))), 1)) * 100,
                );
                return (
                  <div key={entry.mistakeId} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{entry.label}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {entry.category.toLowerCase()} · {T.sev} {entry.severity}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
                        <span className="text-muted-foreground">×{entry.count}</span>
                        <span className={Number(entry.rCost) < 0 ? "text-loss" : "text-profit"}>
                          {formatR(entry.rCost)}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={cn("h-full rounded-full", Number(entry.rCost) < 0 ? "bg-loss/60" : "bg-profit/60")}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-1">
                <MethodNote>
                  {T.methodNote}
                </MethodNote>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function EventsTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["behavior"]["events"] = dict.analytics.behavior.events;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  const events = suite.events;
  const coverage = events.calendarCoverage;
  const covered = coverage.classifiedTrades > 0;
  return (
    <div className="space-y-4" data-testid="analytics-tab-events">
      {!covered && (
        <Card className="bg-surface">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {T.coveragePrefix}{" "}
              <span className="font-mono">{coverage.from ?? "?"} → {coverage.to ?? "?"}</span>
              {coverage.unclassifiedTrades > 0 && <> — {coverage.unclassifiedTrades} {T.tradesOutsideTail}</>}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
              {T.phasesTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {T.phasesDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.phases.map((phase) => (
              <div key={phase.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <span className="min-w-0 truncate text-xs">{phase.label}</span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  <span className={cn(phase.trades < 10 && "text-warning")}>{phase.trades} {SH.tradesSuffix}</span>
                  <span>{phase.winRate === null ? "—" : formatPercent(phase.winRate, 0)} {SH.winSuffix}</span>
                  <span className={phase.avgR === null ? "text-muted-foreground" : Number(phase.avgR) >= 0 ? "text-profit" : "text-loss"}>
                    {phase.avgR === null ? "—" : formatR(phase.avgR)}
                  </span>
                </span>
              </div>
            ))}
            <MethodNote>
              {T.methodNote}
            </MethodNote>
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
              {T.impactTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {T.impactDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.byImpact.map((impact) => (
              <div key={impact.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <span className="text-xs font-medium">{impact.label}</span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  <span className={cn(impact.trades < 10 && "text-warning")}>{impact.trades} {SH.tradesSuffix}</span>
                  <span>{impact.winRate === null ? "—" : formatPercent(impact.winRate, 0)} {SH.winSuffix}</span>
                  <span className={impact.avgR === null ? "text-muted-foreground" : Number(impact.avgR) >= 0 ? "text-profit" : "text-loss"}>
                    {impact.avgR === null ? "—" : formatR(impact.avgR)}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AdvancedTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["behavior"]["advanced"] = dict.analytics.behavior.advanced;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  const advanced = suite.advanced;
  const summary = suite.summary;
  return (
    <div className="space-y-4" data-testid="analytics-tab-advanced">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label={T.sharpe}
          value={summary.sharpe === null ? "—" : formatNumber(summary.sharpe, 2)}
          definition={summary.sharpeNote}
          tone={summary.sharpe !== null && Number(summary.sharpe) >= 1 ? "profit" : "neutral"}
          insufficient={summary.sharpe === null}
        />
        <MetricCard
          label={T.sortino}
          value={summary.sortino === null ? "—" : formatNumber(summary.sortino, 2)}
          definition={summary.sortinoNote}
          tone={summary.sortino !== null && Number(summary.sortino) >= 1.5 ? "profit" : "neutral"}
          insufficient={summary.sortino === null}
        />
        <MetricCard
          label={T.sqn}
          value={summary.sqn === null ? "—" : formatNumber(summary.sqn, 2)}
          definition={T.sqnDef}
          tone={summary.sqn !== null && Number(summary.sqn) >= 2 ? "profit" : "neutral"}
          insufficient={summary.sqn === null}
        />
        <MetricCard
          label={T.stddevR}
          value={advanced.r.stddev === null ? "—" : formatNumber(advanced.r.stddev, 2)}
          definition={T.stddevRDef}
          insufficient={advanced.r.stddev === null}
        />
        <MetricCard
          label={T.skewKurtosis}
          value={`${advanced.r.skewness === null ? "—" : formatNumber(advanced.r.skewness, 2)} / ${advanced.r.kurtosis === null ? "—" : formatNumber(advanced.r.kurtosis, 2)}`}
          definition={T.skewKurtosisDef}
          insufficient={advanced.r.skewness === null}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Sigma className="size-4 text-muted-foreground" aria-hidden="true" />
              {T.profileTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {T.profileDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-xs tabular-nums sm:grid-cols-3">
              {[
                [T.statMean, advanced.r.mean],
                [T.statMedian, advanced.r.median],
                [T.statStddev, advanced.r.stddev],
                [T.statVariance, advanced.r.variance],
                [T.statP05, advanced.r.p05],
                [T.statP25, advanced.r.p25],
                [T.statP75, advanced.r.p75],
                [T.statP95, advanced.r.p95],
                [T.statSkewness, advanced.r.skewness],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{value === null || value === undefined ? "—" : formatNumber(value as string, 2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
              {T.streaksTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {T.streaksDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-surface-raised p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.longestWinRun}</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-profit">{advanced.streaks.longestWin}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {SH.avgLower} {advanced.streaks.avgWin === null ? "—" : formatNumber(advanced.streaks.avgWin, 1)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{T.longestLossRun}</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-loss">{advanced.streaks.longestLoss}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {SH.avgLower} {advanced.streaks.avgLoss === null ? "—" : formatNumber(advanced.streaks.avgLoss, 1)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function MonteCarloTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["behavior"]["monteCarlo"] = dict.analytics.behavior.monteCarlo;
  const mc = suite.monteCarlo;
  return (
    <div className="space-y-4" data-testid="analytics-tab-montecarlo">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            {T.title}{" "}
            <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-warning">
              {T.simulationBadge}
            </span>
          </CardTitle>
          <CardDescription className="text-xs">{mc.methodology}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mc.tradesPerRun === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {T.empty}
            </p>
          ) : (
            <>
              <MonteCarloChart monteCarlo={mc} className="h-64" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{T.runs}</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">{mc.simulations}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{mc.tradesPerRun} {T.tradesEach}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{T.finalR}</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatR(mc.finalR.p05)} / {formatR(mc.finalR.p50)} / {formatR(mc.finalR.p95)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{T.maxDD}</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-loss">
                    {formatR(mc.maxDrawdownR.p50)} / {formatR(mc.maxDrawdownR.p95)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{T.worstDD}</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-loss">{formatR(mc.maxDrawdownR.worst)}</p>
                </div>
              </div>
              <MethodNote>
                {T.methodNote}
              </MethodNote>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsTab({
  suite,
  filters,
}: {
  suite: Suite;
  filters: AnalyticsFilters;
}) {
  const { dict } = useI18n();
  const T: AnalyticsDict["behavior"]["reports"] = dict.analytics.behavior.reports;
  const money = suite.meta.singleCurrency;
  const currency = suite.currency;
  const [range, setRange] = React.useState<"daily" | "weekly" | "monthly">("monthly");
  const rows = suite.reports[range];
  const [reportOpen, setReportOpen] = React.useState(false);

  return (
    <div className="space-y-4" data-testid="analytics-tab-reports">
      <Card className="bg-surface">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="font-heading text-base font-semibold">{T.title}</CardTitle>
            <CardDescription className="text-xs">
              {T.desc}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {(["daily", "weekly", "monthly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRange(option)}
                  aria-pressed={range === option}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                    range === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {T.ranges[option]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-testid="quarterly-report-open"
            >
              <FileDown className="size-3.5" aria-hidden="true" />
              {T.quarterlyPdf}
            </button>
            <button
              type="button"
              onClick={() => exportCsv(suite)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-testid="analytics-export-csv"
            >
              <Download className="size-3.5" aria-hidden="true" />
              CSV
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{T.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{range === "weekly" ? T.isoWeek : range === "monthly" ? T.month : T.day}</th>
                    <th className="py-2 pr-3 font-medium">{T.thTrades}</th>
                    <th className="py-2 pr-3 font-medium">{T.thWinRate}</th>
                    <th className="py-2 pr-3 font-medium">{T.thSumR}</th>
                    {money && <th className="py-2 font-medium">{T.thNetPnl}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-xs">{row.key}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{row.trades}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                        {row.winRate === null ? "—" : formatPercent(row.winRate, 0)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pr-3 font-mono text-xs tabular-nums",
                          Number(row.r) >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {formatR(row.r)}
                      </td>
                      {money && (
                        <td
                          className={cn(
                            "py-2.5 font-mono text-xs tabular-nums",
                            row.netPnl === null ? "" : Number(row.netPnl) >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, currency)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <MethodNote>
              {T.moneyNoteA}
              {formatMoney("1", currency)}
              {T.moneyNoteB}
              {currency}
              {T.moneyNoteC}
            </MethodNote>
          </div>
        </CardContent>
      </Card>

      <QuarterlyReportDialog open={reportOpen} onOpenChange={setReportOpen} suite={suite} />

      {/* Dashboard Customization Phase 08 — export center + snapshots. Both
          render from the SAME filtered server dataset (one truth). */}
      <ExportCenter suite={suite} />
      <SnapshotsPanel suite={suite} filters={filters} />
    </div>
  );
}
