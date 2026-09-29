"use client";

import * as React from "react";
import type {
  AnalyticsSuiteResponse,
} from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";
import { TrendingDown } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard, MethodNote } from "@/components/analytics/metric-card";
import {
  CumulativeRChart,
  DailyPnlChart,
  EquityChart,
  HistogramChart,
  RollingChart,
} from "@/components/analytics/panels-charts";
import { cn } from "@/lib/utils";

/**
 * Overview / Performance / Risk tabs (MASTER PROMPT §6, §7, §8, §9, §10, §11).
 * All numbers arrive server-computed; tone (profit/loss) is P&L semantics only.
 */

type Suite = AnalyticsSuiteResponse;

function moneyTone(value: string | null): "profit" | "loss" | "neutral" {
  if (value === null) return "neutral";
  return Number(value) > 0 ? "profit" : Number(value) < 0 ? "loss" : "neutral";
}

function rTone(value: string | null): "profit" | "loss" | "neutral" {
  if (value === null) return "neutral";
  return Number(value) > 0 ? "profit" : Number(value) < 0 ? "loss" : "neutral";
}

const durationLabel = (minutes: number | null): string => {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
};

export function OverviewTab({ suite }: { suite: Suite }) {
  const s = suite.summary;
  const currency = suite.currency;
  const money = suite.meta.singleCurrency;
  const small = s.trades < 10;

  return (
    <div className="space-y-4" data-testid="analytics-tab-overview">
      {/* Executive KPI band — every card carries its definition (§6). */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Net P&L"
          value={money ? formatSignedMoney(s.netPnl ?? "0", currency) : "—"}
          definition="Sum of realized P&L (net of fees, swap and commissions) over all closed trades in the filtered dataset."
          tone={moneyTone(money ? s.netPnl : null)}
          sub={`${s.trades} closed trades`}
        />
        <MetricCard
          label="Win rate"
          value={s.winRate === null ? "—" : formatPercent(s.winRate, 1)}
          definition="Winning trades ÷ total closed trades. A win is a trade with strictly positive net P&L; break-evens count in the denominator only."
          tone={s.winRate !== null && Number(s.winRate) >= 0.5 ? "profit" : "neutral"}
          sub={`${s.winningTrades}W / ${s.losingTrades}L / ${s.breakevenTrades}BE`}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label="Profit factor"
          value={s.profitFactor === null ? "—" : formatNumber(s.profitFactor, 2)}
          definition="Gross profit ÷ |gross loss|. Above 1.5 is generally considered healthy; zero-loss datasets return null (infinite) by design."
          tone={s.profitFactor !== null && Number(s.profitFactor) >= 1.5 ? "profit" : "neutral"}
          sub="Healthy ≥ 1.50 · Optimal ≥ 2.00"
          insufficient={s.profitFactor === null}
        />
        <MetricCard
          label="Expectancy"
          value={formatR(s.expectancyR)}
          definition="Average R per closed trade — the mean of all R multiples. The statistical amount you expect to gain or lose per trade at this sample's risk."
          tone={rTone(s.expectancyR)}
          sub={money ? `${formatSignedMoney(s.expectancyMoney ?? "0", currency)} per trade` : "per closed trade"}
        />
        <MetricCard
          label="Max drawdown"
          value={s.maxDrawdownPct === null ? formatR(s.maxDrawdownR) : `${formatNumber(s.maxDrawdownPct, 2)} %`}
          definition="Worst peak-to-trough decline of the equity curve (in % when equity exists, otherwise expressed in R). Peak is the highest equity reached before the decline."
          tone="loss"
          sub={`Max DD in R: ${formatR(s.maxDrawdownR)}`}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label="Payoff ratio"
          value={s.payoffRatio === null ? "—" : formatNumber(s.payoffRatio, 2)}
          definition="Average winning R ÷ |average losing R|. Values above 1 mean winners are larger than losers on average."
          tone={s.payoffRatio !== null && Number(s.payoffRatio) >= 1 ? "profit" : "neutral"}
          sub={`Avg win ${formatR(s.avgWinR)} / loss ${formatR(s.avgLossR === null ? null : `-${s.avgLossR}`)}`}
          insufficient={s.payoffRatio === null}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        <Card className="bg-surface lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">Equity curve</CardTitle>
            <CardDescription className="text-xs">
              Balance of the filtered accounts (starting balance included) with the drawdown overlay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suite.equity.length > 1 ? (
              <EquityChart points={suite.equity} currency={currency} className="h-64" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Not enough closed trades in this dataset to draw an equity curve.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">Cumulative R</CardTitle>
            <CardDescription className="text-xs">
              R multiples compounded trade by trade — risk-normalized performance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suite.cumulativeR.length > 0 ? (
              <CumulativeRChart points={suite.cumulativeR} className="h-64" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No closed trades to plot.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <MetricCard
          label="Average R"
          value={s.avgR === null ? "—" : formatR(s.avgR)}
          definition="Arithmetic mean of the R multiples — same as expectancy, shown on the R scale."
          tone={rTone(s.avgR)}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label="Median R"
          value={s.medianR === null ? "—" : formatR(s.medianR)}
          definition="50th percentile of R. When the median sits far from the mean, outliers drive the expectancy."
          tone={rTone(s.medianR)}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label="Avg duration"
          value={durationLabel(s.avgDurationMin)}
          definition="Mean holding time from entry to exit over the filtered closed trades."
        />
      </div>

      {small && (
        <MethodNote>
          Small dataset ({s.trades} trades): ratios on this page are historically observed in this sample only —
          they are not statistically stable estimates.
        </MethodNote>
      )}
    </div>
  );
}

export function PerformanceTab({ suite }: { suite: Suite }) {
  const s = suite.summary;
  const money = suite.meta.singleCurrency;

  return (
    <div className="space-y-4" data-testid="analytics-tab-performance">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">R-multiple distribution</CardTitle>
            <CardDescription className="text-xs">
              How results spread in R — a fat left tail is where discipline breaks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.trades > 0 ? (
              <HistogramChart bins={suite.rHistogram} ariaLabel="Distribution of trade R multiples" className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No closed trades in this dataset.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Best: <span className="font-mono text-profit">{formatR(s.bestR)}</span></span>
              <span>Worst: <span className="font-mono text-loss">{formatR(s.worstR)}</span></span>
              <span>Mean: <span className="font-mono">{formatR(s.avgR)}</span></span>
              <span>Median: <span className="font-mono">{formatR(s.medianR)}</span></span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">P&L distribution</CardTitle>
            <CardDescription className="text-xs">
              {money
                ? "Money results net of fees — check whether performance depends on a few exceptional trades."
                : "Unavailable when the dataset spans several currencies (§30/§31)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {money && s.trades > 0 ? (
              <HistogramChart bins={suite.pnlHistogram} ariaLabel="Distribution of net P&L per trade" className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {money ? "No closed trades in this dataset." : "Multi-currency dataset — P&L histogram is not rendered."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">Daily P&L</CardTitle>
            <CardDescription className="text-xs">
              Realized daily results over the filtered window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suite.dailyPnl.length > 0 && money ? (
              <DailyPnlChart points={suite.dailyPnl} className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No daily activity to plot.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">Duration distribution</CardTitle>
            <CardDescription className="text-xs">
              Holding-time buckets — compare with your playbook intended timeframe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.trades > 0 ? (
              <HistogramChart bins={suite.durationHistogram} ariaLabel="Distribution of trade durations" className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No closed trades in this dataset.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Rolling metrics (last 10 trades)</CardTitle>
          <CardDescription className="text-xs">
            Windowed win rate and average R — shows form changes without full-history noise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.rolling.length >= 10 ? (
            <RollingChart points={suite.rolling} className="h-56" />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Not enough trades to calculate this metric reliably (10+ needed).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function RiskTab({ suite }: { suite: Suite }) {
  const s = suite.summary;
  const risk = suite.risk;
  const currency = suite.currency;
  const money = suite.meta.singleCurrency;

  return (
    <div className="space-y-4" data-testid="analytics-tab-risk">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Avg risk / trade"
          value={money && risk.avgRiskMoney !== null ? formatMoney(risk.avgRiskMoney, currency) : "—"}
          definition="Mean planned money risk (risk at entry) over trades that carried a risk amount."
          sub={`${risk.tradesWithRisk} of ${s.trades} trades carry risk data`}
          insufficient={risk.avgRiskMoney === null}
        />
        <MetricCard
          label="Max risk"
          value={money && risk.maxRiskMoney !== null ? formatMoney(risk.maxRiskMoney, currency) : "—"}
          definition="Largest single-trade risk in the dataset."
          insufficient={risk.maxRiskMoney === null}
        />
        <MetricCard
          label="Risk deviation"
          value={risk.riskDeviationPct === null ? "—" : `${formatNumber(risk.riskDeviationPct, 1)} %`}
          definition="Standard deviation of per-trade risk ÷ mean — how consistent your sizing is. Lower = steadier exposure."
          tone={risk.riskDeviationPct !== null && Number(risk.riskDeviationPct) > 50 ? "warning" : "neutral"}
          insufficient={risk.riskDeviationPct === null}
        />
        <MetricCard
          label="Max daily risk"
          value={money && risk.maxDailyRisk !== null ? formatMoney(risk.maxDailyRisk, currency) : "—"}
          definition="Largest Σ planned risk committed on a single trading day."
          insufficient={risk.maxDailyRisk === null}
        />
        <MetricCard
          label="Max concurrent"
          value={String(risk.maxConcurrentPositions)}
          definition="Highest number of positions open at the same time in the dataset (overlapping entry→exit windows)."
        />
        <MetricCard
          label="Recovery factor"
          value={s.recoveryFactor === null ? "—" : formatNumber(s.recoveryFactor, 2)}
          definition="Net profit ÷ |max drawdown in R| — how much reward the strategy produced per unit of its worst pain. Sign convention: positive when net P&L is positive."
          tone={rTone(s.recoveryFactor)}
          insufficient={s.recoveryFactor === null}
        />
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Drawdown periods</CardTitle>
          <CardDescription className="text-xs">
            Each major decline: peak → bottom → recovery, with the trades that dug the hole. Click a row for the trade list.
            Open drawdowns honestly show “not recovered yet”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.drawdowns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No drawdown period in this dataset — the equity never declined from a prior peak.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Peak</th>
                    <th className="py-2 pr-3 font-medium">Bottom</th>
                    <th className="py-2 pr-3 font-medium">Drawdown</th>
                    <th className="py-2 pr-3 font-medium">In R</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 font-medium">Recovery</th>
                  </tr>
                </thead>
                <tbody>
                  {suite.drawdowns.map((drawdown) => (
                    <React.Fragment key={drawdown.id}>
                      <tr>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">
                          <span className="flex items-center gap-1.5">
                            <TrendingDown className="size-3.5 text-loss" aria-hidden="true" />
                            {drawdown.peakDate}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{drawdown.bottomDate}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-loss">
                          {money && drawdown.drawdownMoney !== null
                            ? formatSignedMoney(drawdown.drawdownMoney, currency)
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-loss">
                          {formatR(drawdown.drawdownR)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{drawdown.durationDays}d</td>
                        <td className="py-2.5 text-xs">
                          {drawdown.recoveredDate === null ? (
                            <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                              Not recovered yet
                            </span>
                          ) : (
                            <span className="font-mono text-xs tabular-nums">
                              {drawdown.recoveredDate} · {drawdown.recoveryDays}d · {drawdown.recoveryTrades} trades
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr aria-hidden="true">
                        <td colSpan={6} className="pb-3 pt-0">
                          <div className="flex flex-wrap gap-1.5">
                            {drawdown.trades.map((trade) => (
                              <span
                                key={trade.id}
                                className={cn(
                                  "rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                                  Number(trade.r) < 0 ? "text-loss" : "text-profit",
                                )}
                              >
                                {trade.symbol} {trade.date} {formatR(trade.r)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Planned R:R vs realized R</CardTitle>
          <CardDescription className="text-xs">
            Does the outcome follow the plan? Deviation is exposed, never judged (§16).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {risk.plannedVsRealized.map((bucket) => (
              <div key={bucket.bucket} className="rounded-lg border border-border bg-surface-raised p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {bucket.bucket}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{bucket.trades}</p>
                <p
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    bucket.avgRealizedR === null
                      ? "text-muted-foreground"
                      : Number(bucket.avgRealizedR) >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {bucket.avgRealizedR === null ? "no trades" : `avg ${formatR(bucket.avgRealizedR)}`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
