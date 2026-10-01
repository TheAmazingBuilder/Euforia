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
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Overview / Performance / Risk tabs (MASTER PROMPT §6, §7, §8, §9, §10, §11).
 * All numbers arrive server-computed; tone (profit/loss) is P&L semantics only.
 * Labels and definitions resolve through dict.analytics.* — machine composition
 * stays in the component (the dict.* pattern).
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
  const { dict } = useI18n();
  const T: AnalyticsDict["overview"] = dict.analytics.overview;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  const s = suite.summary;
  const currency = suite.currency;
  const money = suite.meta.singleCurrency;
  const small = s.trades < 10;

  return (
    <div className="space-y-4" data-testid="analytics-tab-overview">
      {/* Executive KPI band — every card carries its definition (§6). */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label={T.netPnl}
          value={money ? formatSignedMoney(s.netPnl ?? "0", currency) : "—"}
          definition={T.netPnlDef}
          tone={moneyTone(money ? s.netPnl : null)}
          sub={`${s.trades} ${SH.closedTrades}`}
        />
        <MetricCard
          label={T.winRate}
          value={s.winRate === null ? "—" : formatPercent(s.winRate, 1)}
          definition={T.winRateDef}
          tone={s.winRate !== null && Number(s.winRate) >= 0.5 ? "profit" : "neutral"}
          sub={`${s.winningTrades}W / ${s.losingTrades}L / ${s.breakevenTrades}BE`}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label={T.profitFactor}
          value={s.profitFactor === null ? "—" : formatNumber(s.profitFactor, 2)}
          definition={T.profitFactorDef}
          tone={s.profitFactor !== null && Number(s.profitFactor) >= 1.5 ? "profit" : "neutral"}
          sub={T.profitFactorSub}
          insufficient={s.profitFactor === null}
        />
        <MetricCard
          label={T.expectancy}
          value={formatR(s.expectancyR)}
          definition={T.expectancyDef}
          tone={rTone(s.expectancyR)}
          sub={money ? `${formatSignedMoney(s.expectancyMoney ?? "0", currency)} ${T.perTradeSuffix}` : T.perClosedTrade}
        />
        <MetricCard
          label={T.maxDrawdown}
          value={s.maxDrawdownPct === null ? formatR(s.maxDrawdownR) : `${formatNumber(s.maxDrawdownPct, 2)} %`}
          definition={T.maxDrawdownDef}
          tone="loss"
          sub={`${T.maxDDinRPrefix} ${formatR(s.maxDrawdownR)}`}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label={T.payoffRatio}
          value={s.payoffRatio === null ? "—" : formatNumber(s.payoffRatio, 2)}
          definition={T.payoffRatioDef}
          tone={s.payoffRatio !== null && Number(s.payoffRatio) >= 1 ? "profit" : "neutral"}
          sub={`${T.avgWinWord} ${formatR(s.avgWinR)} / ${T.lossWord} ${formatR(s.avgLossR === null ? null : `-${s.avgLossR}`)}`}
          insufficient={s.payoffRatio === null}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        <Card className="bg-surface lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.equityTitle}</CardTitle>
            <CardDescription className="text-xs">
              {T.equityDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suite.equity.length > 1 ? (
              <EquityChart points={suite.equity} currency={currency} className="h-64" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {T.equityEmpty}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.cumulativeRTitle}</CardTitle>
            <CardDescription className="text-xs">
              {T.cumulativeRDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suite.cumulativeR.length > 0 ? (
              <CumulativeRChart points={suite.cumulativeR} className="h-64" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{T.cumulativeREmpty}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <MetricCard
          label={T.averageR}
          value={s.avgR === null ? "—" : formatR(s.avgR)}
          definition={T.averageRDef}
          tone={rTone(s.avgR)}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label={T.medianR}
          value={s.medianR === null ? "—" : formatR(s.medianR)}
          definition={T.medianRDef}
          tone={rTone(s.medianR)}
          insufficient={s.trades === 0}
        />
        <MetricCard
          label={T.avgDuration}
          value={durationLabel(s.avgDurationMin)}
          definition={T.avgDurationDef}
        />
      </div>

      {small && (
        <MethodNote>
          {T.smallDatasetA}
          {s.trades}
          {T.smallDatasetB}
        </MethodNote>
      )}
    </div>
  );
}

export function PerformanceTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["performance"] = dict.analytics.performance;
  const s = suite.summary;
  const money = suite.meta.singleCurrency;

  return (
    <div className="space-y-4" data-testid="analytics-tab-performance">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.rDistTitle}</CardTitle>
            <CardDescription className="text-xs">
              {T.rDistDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.trades > 0 ? (
              <HistogramChart bins={suite.rHistogram} ariaLabel={T.rDistAria} className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{T.noClosedTrades}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>{T.best} <span className="font-mono text-profit">{formatR(s.bestR)}</span></span>
              <span>{T.worst} <span className="font-mono text-loss">{formatR(s.worstR)}</span></span>
              <span>{T.mean} <span className="font-mono">{formatR(s.avgR)}</span></span>
              <span>{T.median} <span className="font-mono">{formatR(s.medianR)}</span></span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.pnlDistTitle}</CardTitle>
            <CardDescription className="text-xs">
              {money ? T.pnlDistDescMoney : T.pnlDistDescMulti}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {money && s.trades > 0 ? (
              <HistogramChart bins={suite.pnlHistogram} ariaLabel={T.pnlDistAria} className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {money ? T.noClosedTrades : T.pnlDistEmptyMulti}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.dailyPnlTitle}</CardTitle>
            <CardDescription className="text-xs">
              {T.dailyPnlDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suite.dailyPnl.length > 0 && money ? (
              <DailyPnlChart points={suite.dailyPnl} className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{T.dailyPnlEmpty}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{T.durationTitle}</CardTitle>
            <CardDescription className="text-xs">
              {T.durationDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.trades > 0 ? (
              <HistogramChart bins={suite.durationHistogram} ariaLabel={T.durationAria} className="h-52" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{T.noClosedTrades}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.rollingTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.rollingDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.rolling.length >= 10 ? (
            <RollingChart points={suite.rolling} className="h-56" />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {T.rollingEmpty}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function RiskTab({ suite }: { suite: Suite }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["risk"] = dict.analytics.risk;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  const s = suite.summary;
  const risk = suite.risk;
  const currency = suite.currency;
  const money = suite.meta.singleCurrency;

  return (
    <div className="space-y-4" data-testid="analytics-tab-risk">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label={T.avgRisk}
          value={money && risk.avgRiskMoney !== null ? formatMoney(risk.avgRiskMoney, currency) : "—"}
          definition={T.avgRiskDef}
          sub={`${risk.tradesWithRisk} ${T.ofWord} ${s.trades} ${T.carryRiskData}`}
          insufficient={risk.avgRiskMoney === null}
        />
        <MetricCard
          label={T.maxRisk}
          value={money && risk.maxRiskMoney !== null ? formatMoney(risk.maxRiskMoney, currency) : "—"}
          definition={T.maxRiskDef}
          insufficient={risk.maxRiskMoney === null}
        />
        <MetricCard
          label={T.riskDeviation}
          value={risk.riskDeviationPct === null ? "—" : `${formatNumber(risk.riskDeviationPct, 1)} %`}
          definition={T.riskDeviationDef}
          tone={risk.riskDeviationPct !== null && Number(risk.riskDeviationPct) > 50 ? "warning" : "neutral"}
          insufficient={risk.riskDeviationPct === null}
        />
        <MetricCard
          label={T.maxDailyRisk}
          value={money && risk.maxDailyRisk !== null ? formatMoney(risk.maxDailyRisk, currency) : "—"}
          definition={T.maxDailyRiskDef}
          insufficient={risk.maxDailyRisk === null}
        />
        <MetricCard
          label={T.maxConcurrent}
          value={String(risk.maxConcurrentPositions)}
          definition={T.maxConcurrentDef}
        />
        <MetricCard
          label={T.recoveryFactor}
          value={s.recoveryFactor === null ? "—" : formatNumber(s.recoveryFactor, 2)}
          definition={T.recoveryFactorDef}
          tone={rTone(s.recoveryFactor)}
          insufficient={s.recoveryFactor === null}
        />
      </div>

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.drawdownsTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.drawdownsDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suite.drawdowns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {T.drawdownsEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{T.thPeak}</th>
                    <th className="py-2 pr-3 font-medium">{T.thBottom}</th>
                    <th className="py-2 pr-3 font-medium">{T.thDrawdown}</th>
                    <th className="py-2 pr-3 font-medium">{T.thInR}</th>
                    <th className="py-2 pr-3 font-medium">{T.thDuration}</th>
                    <th className="py-2 font-medium">{T.thRecovery}</th>
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
                              {SH.notRecoveredYet}
                            </span>
                          ) : (
                            <span className="font-mono text-xs tabular-nums">
                              {drawdown.recoveredDate} · {drawdown.recoveryDays}d · {drawdown.recoveryTrades} {SH.tradesSuffix}
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
          <CardTitle className="font-heading text-base font-semibold">{T.plannedRRTitle}</CardTitle>
          <CardDescription className="text-xs">
            {T.plannedRRDesc}
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
                  {bucket.avgRealizedR === null ? SH.noTrades : `${SH.avgLower} ${formatR(bucket.avgRealizedR)}`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
