"use client";

import * as React from "react";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";
import { CalendarClock, Download, Gauge, Sigma, Timer } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard, MethodNote } from "@/components/analytics/metric-card";
import { ExcursionScatter, HistogramChart, MonteCarloChart } from "@/components/analytics/panels-charts";
import { cn } from "@/lib/utils";

/**
 * Trade Quality / Mistakes & Rules / Economic Events / Advanced Statistics /
 * Monte Carlo / Reports tabs (MASTER PROMPT §16–§18, §20, §21, §24, §25, §26).
 * Simulations are always labelled SIMULATION; missing data is declared, never
 * fabricated (§34).
 */

type Suite = AnalyticsSuiteResponse;

/** CSV export of the filtered dataset (§26 — export where the app supports it). */
function exportCsv(suite: Suite): void {
  const header = ["index", "date", "symbol", "r", "cumR"];
  const rows = suite.cumulativeR.map((point) => [
    String(point.index + 1),
    point.date,
    point.symbol,
    point.r,
    point.cumR,
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

export function QualityTab({ suite }: { suite: Suite }) {
  const quality = suite.quality;
  const followedPct = quality.planFollowed.followed + quality.planFollowed.violated > 0
    ? quality.planFollowed.followed / (quality.planFollowed.followed + quality.planFollowed.violated)
    : null;

  return (
    <div className="space-y-4" data-testid="analytics-tab-quality">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <MetricCard
          label="Plan followed"
          value={followedPct === null ? "—" : formatPercent(followedPct, 0)}
          definition="Share of self-reports where the executed trade matched the plan, among trades with a known flag (unknown excluded from the ratio, shown separately)."
          tone={followedPct !== null && Number(followedPct) >= 0.8 ? "profit" : "neutral"}
          sub={`${quality.planFollowed.followed} followed · ${quality.planFollowed.violated} violated · ${quality.planFollowed.unknown} unknown`}
          insufficient={followedPct === null}
        />
        <MetricCard
          label="Avg MFE"
          value={quality.mfe.avgR === null ? "—" : `+${formatNumber(quality.mfe.avgR, 2)}R`}
          definition="Maximum Favorable Excursion — best open profit reached before exit, averaged in R. Requires intratrade excursion data."
          insufficient={quality.mfe.avgR === null}
        />
        <MetricCard
          label="Avg MAE"
          value={quality.mae.avgR === null ? "—" : formatR(quality.mae.avgR)}
          definition="Maximum Adverse Excursion — worst open drawdown suffered before exit, averaged in R."
          insufficient={quality.mae.avgR === null}
        />
        <MetricCard
          label="MFE capture"
          value={quality.mfe.capturePct === null ? "—" : formatPercent(quality.mfe.capturePct, 0)}
          definition="On winners: Σ realized R ÷ Σ MFE R. How much of the available favorable move your exits actually captured."
          tone={quality.mfe.capturePct !== null && Number(quality.mfe.capturePct) >= 0.6 ? "profit" : "neutral"}
          insufficient={quality.mfe.capturePct === null}
        />
      </div>

      {!quality.excursionAvailable && (
        <MethodNote>
          MAE/MFE analysis requires intratrade price data — this dataset has no excursion records.
        </MethodNote>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">Excursions vs realized R</CardTitle>
            <CardDescription className="text-xs">
              Each dot is a trade. MFE high + realized low = gave back profit; MAE deep = stop placement pressure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quality.excursionAvailable ? (
              <ExcursionScatter scatter={quality.scatter} className="h-64" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                MAE requires intratrade price data.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 sm:space-y-4">
          <Card className="bg-surface">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">MFE distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <HistogramChart bins={quality.mfeHistogram} ariaLabel="Distribution of maximum favorable excursion in R" color="profit" className="h-36" />
            </CardContent>
          </Card>
          <Card className="bg-surface">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">MAE distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <HistogramChart bins={quality.maeHistogram} ariaLabel="Distribution of maximum adverse excursion in R" color="loss" className="h-36" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function MistakesTab({ suite }: { suite: Suite }) {
  const mistakes = suite.mistakes;
  return (
    <div className="space-y-4" data-testid="analytics-tab-mistakes">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          label="Trades flagged"
          value={String(mistakes.violatingTrades)}
          definition="Closed trades in the dataset carrying at least one mistake from the catalog."
          sub={`${suite.summary.trades} trades in dataset`}
        />
        <MetricCard
          label="Σ R on flagged trades"
          value={formatR(mistakes.totalR)}
          definition="Sum of R over the flagged trades. A negative total is the observable cost of the mistakes — realized only, no invented counterfactual."
          tone={Number(mistakes.totalR) < 0 ? "loss" : "neutral"}
        />
        <MetricCard
          label="Distinct mistakes"
          value={String(mistakes.entries.length)}
          definition="How many different mistake types occurred in this dataset."
        />
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Cost of mistakes</CardTitle>
          <CardDescription className="text-xs">
            Recomputed on the FILTERED dataset (the dashboard ledger shows a fixed 30-day window). Sorted by |cost|.
            “Cost” here = realized P&L of the trades carrying the mistake — no counterfactual is claimed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mistakes.entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No mistakes recorded in this dataset — either a clean run, or no flags were raised on these trades.
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
                          {entry.category.toLowerCase()} · sev {entry.severity}
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
                  A positive ΣR on a flagged trade does NOT make the mistake harmless — it means the violating trade
                  happened to win. The flag tracks process, not outcome.
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
  const events = suite.events;
  const coverage = events.calendarCoverage;
  const covered = coverage.classifiedTrades > 0;
  return (
    <div className="space-y-4" data-testid="analytics-tab-events">
      {!covered && (
        <Card className="bg-surface">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Economic-event analysis requires calendar data covering the trade dates. The calendar in this build spans{" "}
              <span className="font-mono">{coverage.from ?? "?"} → {coverage.to ?? "?"}</span>
              {coverage.unclassifiedTrades > 0 && <> — {coverage.unclassifiedTrades} trade(s) fall outside it.</>}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
              Phase around releases
            </CardTitle>
            <CardDescription className="text-xs">
              Entry timing relative to the nearest HIGH/MEDIUM release on the instrument quote currency:
              before (4h→1h), during (±1h), after (1h→4h), or no release nearby.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.phases.map((phase) => (
              <div key={phase.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <span className="min-w-0 truncate text-xs">{phase.label}</span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  <span className={cn(phase.trades < 10 && "text-warning")}>{phase.trades} trades</span>
                  <span>{phase.winRate === null ? "—" : formatPercent(phase.winRate, 0)} win</span>
                  <span className={phase.avgR === null ? "text-muted-foreground" : Number(phase.avgR) >= 0 ? "text-profit" : "text-loss"}>
                    {phase.avgR === null ? "—" : formatR(phase.avgR)}
                  </span>
                </span>
              </div>
            ))}
            <MethodNote>
              Historical association only — trading around releases is not inherently good or bad; this shows what
              happened in YOUR sample.
            </MethodNote>
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
              By impact (±4h window)
            </CardTitle>
            <CardDescription className="text-xs">
              Trades entered within four hours of any HIGH or MEDIUM release on their quote currency.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.byImpact.map((impact) => (
              <div key={impact.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <span className="text-xs font-medium">{impact.label}</span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  <span className={cn(impact.trades < 10 && "text-warning")}>{impact.trades} trades</span>
                  <span>{impact.winRate === null ? "—" : formatPercent(impact.winRate, 0)} win</span>
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
  const advanced = suite.advanced;
  const summary = suite.summary;
  return (
    <div className="space-y-4" data-testid="analytics-tab-advanced">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Sharpe"
          value={summary.sharpe === null ? "—" : formatNumber(summary.sharpe, 2)}
          definition={summary.sharpeNote}
          tone={summary.sharpe !== null && Number(summary.sharpe) >= 1 ? "profit" : "neutral"}
          insufficient={summary.sharpe === null}
        />
        <MetricCard
          label="Sortino"
          value={summary.sortino === null ? "—" : formatNumber(summary.sortino, 2)}
          definition={summary.sortinoNote}
          tone={summary.sortino !== null && Number(summary.sortino) >= 1.5 ? "profit" : "neutral"}
          insufficient={summary.sortino === null}
        />
        <MetricCard
          label="SQN"
          value={summary.sqn === null ? "—" : formatNumber(summary.sqn, 2)}
          definition="System Quality Number = mean(R) ÷ std(R) × √n. Rough reading: < 1.6 poor, 1.6–1.9 below average, 2.0–2.4 average, 2.5–2.9 good, 3+ excellent. Null below 10 trades."
          tone={summary.sqn !== null && Number(summary.sqn) >= 2 ? "profit" : "neutral"}
          insufficient={summary.sqn === null}
        />
        <MetricCard
          label="Std dev of R"
          value={advanced.r.stddev === null ? "—" : formatNumber(advanced.r.stddev, 2)}
          definition="Dispersion of per-trade R around the mean. Higher = lumpier, harder-to-stomach equity."
          insufficient={advanced.r.stddev === null}
        />
        <MetricCard
          label="Skew / Kurtosis"
          value={`${advanced.r.skewness === null ? "—" : formatNumber(advanced.r.skewness, 2)} / ${advanced.r.kurtosis === null ? "—" : formatNumber(advanced.r.kurtosis, 2)}`}
          definition="Skewness: asymmetry of the R distribution (negative = fat left tail). Kurtosis is EXCESS kurtosis: tails vs a normal distribution (0 = normal-like, positive = fat tails)."
          insufficient={advanced.r.skewness === null}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Sigma className="size-4 text-muted-foreground" aria-hidden="true" />
              R distribution profile
            </CardTitle>
            <CardDescription className="text-xs">
              Percentiles and moments of the per-trade R series.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-xs tabular-nums sm:grid-cols-3">
              {[
                ["Mean", advanced.r.mean],
                ["Median", advanced.r.median],
                ["Std dev", advanced.r.stddev],
                ["Variance", advanced.r.variance],
                ["P05", advanced.r.p05],
                ["P25", advanced.r.p25],
                ["P75", advanced.r.p75],
                ["P95", advanced.r.p95],
                ["Skewness", advanced.r.skewness],
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
              Streaks
            </CardTitle>
            <CardDescription className="text-xs">
              Consecutive win/loss runs — what your equity actually puts you through.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-surface-raised p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Longest win run</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-profit">{advanced.streaks.longestWin}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  avg {advanced.streaks.avgWin === null ? "—" : formatNumber(advanced.streaks.avgWin, 1)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Longest loss run</p>
                <p className="font-mono text-2xl font-semibold tabular-nums text-loss">{advanced.streaks.longestLoss}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  avg {advanced.streaks.avgLoss === null ? "—" : formatNumber(advanced.streaks.avgLoss, 1)}
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
  const mc = suite.monteCarlo;
  return (
    <div className="space-y-4" data-testid="analytics-tab-montecarlo">
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Monte Carlo simulation{" "}
            <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-warning">
              Simulation
            </span>
          </CardTitle>
          <CardDescription className="text-xs">{mc.methodology}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mc.tradesPerRun === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Not enough trades to run a simulation.
            </p>
          ) : (
            <>
              <MonteCarloChart monteCarlo={mc} className="h-64" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Runs</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">{mc.simulations}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{mc.tradesPerRun} trades each</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Final ΣR (P05 / P50 / P95)</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatR(mc.finalR.p05)} / {formatR(mc.finalR.p50)} / {formatR(mc.finalR.p95)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Max DD (P50 / P95)</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-loss">
                    {formatR(mc.maxDrawdownR.p50)} / {formatR(mc.maxDrawdownR.p95)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Worst simulated DD</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-loss">{formatR(mc.maxDrawdownR.worst)}</p>
                </div>
              </div>
              <MethodNote>
                Reshuffling the SAME results shows the range of equity paths this edge could have produced — it says
                nothing about future sequences. A profitable mean with a brutal P95 drawdown is the normal shape of
                trading; size positions for the bands, not the midpoint.
              </MethodNote>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsTab({ suite }: { suite: Suite }) {
  const money = suite.meta.singleCurrency;
  const currency = suite.currency;
  const [range, setRange] = React.useState<"daily" | "weekly" | "monthly">("monthly");
  const rows = suite.reports[range];

  return (
    <div className="space-y-4" data-testid="analytics-tab-reports">
      <Card className="bg-surface">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="font-heading text-base font-semibold">Period reports</CardTitle>
            <CardDescription className="text-xs">
              Rollups of the FILTERED dataset — daily, weekly (ISO) and monthly. Export gives you the trade-level R
              sequence as CSV.
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
                  {option}
                </button>
              ))}
            </div>
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
            <p className="py-8 text-center text-sm text-muted-foreground">No rows for this range in the dataset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{range === "weekly" ? "ISO week" : range === "monthly" ? "Month" : "Day"}</th>
                    <th className="py-2 pr-3 font-medium">Trades</th>
                    <th className="py-2 pr-3 font-medium">Win rate</th>
                    <th className="py-2 pr-3 font-medium">ΣR</th>
                    {money && <th className="py-2 font-medium">Net P&L</th>}
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
              Money columns appear only on single-currency datasets ({formatMoney("1", currency)} = 1 {currency}).
            </MethodNote>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
