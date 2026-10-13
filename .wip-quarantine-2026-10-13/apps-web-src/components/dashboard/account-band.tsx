"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { AccountBandResponse, MonthlyGoal } from "@cosmoz/shared";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatR,
  formatSignedMoney,
  parseDecimal,
} from "@cosmoz/shared";
import type { EChartsCoreOption } from "echarts/core";

import { Button } from "@/components/ui/button";
import { EChart } from "@/components/charts/echart";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountBand } from "@/lib/api/queries";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import { cn } from "@/lib/utils";

/** Short date label for axes + tooltips ("Sep 12") — same idiom as pnl-charts. */
const axisDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Long month label for the band caption ("September 2026"). */
const monthLabelFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/** Signed display for plain numbers ("12,3" → "+12,3"). */
function signedNumber(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value === 0) return formatNumber(0, digits);
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value), digits)}`;
}

/** Direction pill — same ledger language as the Band 1 DeltaMark, scoped
 * to this band (month-over-month comparisons only). */
function TrendPill({ direction, value }: { direction: "UP" | "DOWN" | "FLAT"; value: string }) {
  if (direction === "FLAT") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change vs last month</span>
      </span>
    );
  }
  const up = direction === "UP";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold leading-none tabular-nums",
        up ? "border-profit/30 bg-profit/10 text-profit" : "border-loss/30 bg-loss/10 text-loss",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {value}
    </span>
  );
}

interface LedgerKpiProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  pill?: React.ReactNode;
  sparkline?: string[];
  sparklineColor?: string;
  sparklineLabel?: string;
}

/** Compact ledger cell — Band 1's KpiCell grammar (label → value+pill →
 * sub → sparkline), reused inside the gap-px band. */
function LedgerKpi({ label, value, sub, pill, sparkline, sparklineColor = "currentColor", sparklineLabel }: LedgerKpiProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="ledger-label">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <span className="font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
          {value}
        </span>
        {pill}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
      {sparkline ? (
        <Sparkline
          points={sparkline}
          color={sparklineColor}
          className="mt-auto h-8 w-full"
          ariaLabel={sparklineLabel}
        />
      ) : (
        <div className="mt-auto" />
      )}
    </div>
  );
}

/** Chart-cell header: ledger label + right-aligned mono annotation. */
function ChartCellHeader({ label, annotation }: { label: string; annotation?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="ledger-label">{label}</span>
      {annotation ? (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{annotation}</span>
      ) : null}
    </div>
  );
}

/** Equity curve — the classic performance line (starting balance anchored),
 * profit ink when ahead / loss ink when behind, glow + gradient area and a
 * dashed baseline at the starting balance. */
function EquityBandChart({ data, theme }: { data: AccountBandResponse; theme: ChartTheme }) {
  const option = React.useMemo<EChartsCoreOption>(() => {
    const series = data.equityCurve.map((point) => ({
      name: axisDay.format(new Date(`${point.date}T00:00:00Z`)),
      value: Number(point.equity),
      dd: Number(point.drawdownPct),
    }));
    const last = series[series.length - 1];
    const starting = parseDecimal(data.startingBalance) ?? 0;
    const values = series.map((point) => point.value);
    const min = Math.min(...values, starting);
    const max = Math.max(...values, starting);
    const pad = Math.max((max - min) * 0.08, 1);
    const ahead = (last?.value ?? starting) >= starting;
    const ink = ahead ? theme.profit : theme.loss;

    return {
      grid: { left: 8, right: 68, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { name: string; data: { value: number; dd: number } }[];
          const point = typed?.[0];
          if (!point) return "";
          const ddText = point.data.dd >= 0 ? "0.00" : formatNumber(point.data.dd, 2);
          return `${point.name}<br/><b>${formatMoney(point.data.value, data.currency)}</b><br/>drawdown ${ddText} %`;
        },
      },
      xAxis: {
        type: "category",
        data: series.map((point) => point.name),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: Math.floor((min - pad) * 100) / 100,
        max: Math.ceil((max + pad) * 100) / 100,
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
          formatter: (value: number) => formatMoneyCompact(value, data.currency),
        },
      },
      series: [
        {
          id: "band-equity",
          type: "line",
          data: series,
          smooth: 0.2,
          symbol: "none",
          lineStyle: {
            color: ink,
            width: 2,
            shadowColor: withAlpha(ink, 0.4),
            shadowBlur: 9,
            shadowOffsetY: 4,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(ink, 0.3) },
                { offset: 0.6, color: withAlpha(ink, 0.1) },
                { offset: 1, color: withAlpha(ink, 0.02) },
              ],
            },
          },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: theme.border, type: "dashed", width: 1 },
            data: [{ yAxis: starting }],
          },
          markPoint:
            last !== undefined
              ? {
                  silent: true,
                  symbol: "circle",
                  symbolSize: 7,
                  itemStyle: {
                    color: ink,
                    borderColor: theme.surfaceRaised,
                    borderWidth: 2,
                    shadowColor: withAlpha(ink, 0.5),
                    shadowBlur: 8,
                  },
                  label: { show: false },
                  data: [{ coord: [last.name, last.value] }],
                }
              : undefined,
          endLabel: {
            show: last !== undefined,
            formatter: () => formatMoneyCompact(last?.value ?? 0, data.currency),
            color: ink,
            fontFamily: theme.monoFont,
            fontSize: 11,
            fontWeight: "bold",
            offset: [6, 0],
          },
        },
      ],
    };
  }, [data, theme]);

  return (
    <EChart
      option={option}
      className="mt-3 h-44 w-full sm:h-52"
      ariaLabel="Account equity curve from the starting balance to today"
    />
  );
}

/** Underwater drawdown — the equity curve's shadow: area between the running
 * peak and the current equity, loss ink, max-DD marked with a dashed line. */
function DrawdownBandChart({ data, theme }: { data: AccountBandResponse; theme: ChartTheme }) {
  const option = React.useMemo<EChartsCoreOption>(() => {
    const series = data.equityCurve.map((point) => ({
      name: axisDay.format(new Date(`${point.date}T00:00:00Z`)),
      value: Number(point.drawdownPct),
    }));
    const values = series.map((point) => point.value);
    const minDd = Math.min(-1, ...values);
    const maxDd = Math.min(0, ...values);
    const pad = Math.max(Math.abs(minDd) * 0.12, 0.25);

    return {
      grid: { left: 8, right: 14, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { name: string; data: { value: number } }[];
          const point = typed?.[0];
          if (!point) return "";
          return `${point.name}<br/><b>${formatNumber(point.data.value, 2)} %</b> underwater`;
        },
      },
      xAxis: {
        type: "category",
        data: series.map((point) => point.name),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 10, fontFamily: theme.monoFont, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: minDd - pad,
        max: 0,
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
          formatter: (value: number) => `${formatNumber(value, 0)} %`,
        },
      },
      series: [
        {
          id: "band-drawdown",
          type: "line",
          data: series,
          smooth: 0.2,
          symbol: "none",
          lineStyle: { color: theme.loss, width: 1.5 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(theme.loss, 0.04) },
                { offset: 1, color: withAlpha(theme.loss, 0.38) },
              ],
            },
          },
          markLine:
            maxDd < 0
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: theme.warning, type: "dashed", width: 1.2 },
                  label: {
                    show: true,
                    position: "insideEndTop",
                    formatter: () => `max ${formatNumber(maxDd, 1)} %`,
                    color: theme.warning,
                    fontFamily: theme.monoFont,
                    fontSize: 9,
                    fontWeight: 600,
                  },
                  data: [{ yAxis: maxDd }],
                }
              : undefined,
        },
      ],
    };
  }, [data, theme]);

  return (
    <EChart
      option={option}
      className="mt-3 h-44 w-full sm:h-52"
      ariaLabel="Underwater drawdown chart — decline from the running equity peak"
    />
  );
}

/** One goal row: label + mono current/target, token-colored progress bar,
 * source note underneath. */
function GoalRow({ goal, currency }: { goal: MonthlyGoal; currency: AccountBandResponse["currency"] }) {
  const progress = parseDecimal(goal.progress) ?? 0;
  const current = parseDecimal(goal.current) ?? 0;
  const target = parseDecimal(goal.target) ?? 0;
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));

  let valueText: string;
  let fillClass: string;
  if (goal.key === "profit") {
    valueText = `${formatSignedMoney(current, currency, { digits: 0 })} / ${formatMoney(target, currency, { digits: 0 })}`;
    fillClass = pct >= 100 ? "bg-profit" : "bg-accent";
  } else if (goal.key === "winRate") {
    valueText = `${formatPercent(current)} / ${formatPercent(target, 0)}`;
    fillClass = pct >= 100 ? "bg-profit" : "bg-accent";
  } else {
    valueText = `${formatNumber(current, 2)} % / ${formatNumber(target, 0)} %`;
    fillClass = pct >= 80 ? "bg-loss" : pct >= 50 ? "bg-warning" : "bg-profit";
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{goal.label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{valueText}</span>
      </div>
      <div
        className="goal-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${goal.label} progress`}
      >
        <div className={cn("goal-fill", fillClass)} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground">{goal.note}</div>
    </div>
  );
}

function GoalsPanel({ data, monthLabel }: { data: AccountBandResponse; monthLabel: string }) {
  return (
    <div className="flex h-full flex-col gap-3.5" data-testid="account-band-goals">
      <ChartCellHeader label={`Monthly goals — ${monthLabel}`} />
      {data.goals.map((goal) => (
        <GoalRow key={goal.key} goal={goal} currency={data.currency} />
      ))}
    </div>
  );
}

/** Recent executions — symbol + direction + date on the left, signed result
 * (or OPEN pill) + R on the right. Two-line rows so 390px never overflows. */
function RecentTradesPanel({ data }: { data: AccountBandResponse }) {
  return (
    <div className="flex h-full flex-col" data-testid="account-band-recent">
      <div className="flex items-center justify-between gap-2 pb-1">
        <ChartCellHeader label="Recent trades" />
        <Link
          href="/trades"
          className="shrink-0 text-[11px] font-medium text-accent hover:underline"
        >
          Open the journal →
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {data.recentTrades.map((trade) => {
          const pnl = parseDecimal(trade.pnlNet);
          const positive = (pnl ?? 0) >= 0;
          return (
            <li key={trade.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold tracking-tight text-foreground">
                    {trade.symbol}
                  </span>
                  <span className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                    {trade.direction}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {axisDay.format(new Date(`${trade.tradingDate}T00:00:00Z`))}
                  {" · "}
                  {trade.status === "OPEN" ? "open" : "closed"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {trade.status === "OPEN" || pnl === null ? (
                  <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-semibold leading-none text-accent">
                    OPEN
                  </span>
                ) : (
                  <span
                    className={cn(
                      "font-mono text-xs font-semibold tabular-nums",
                      positive ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatSignedMoney(trade.pnlNet, data.currency)}
                  </span>
                )}
                <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {trade.rMultiple === null ? "—" : formatR(trade.rMultiple)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccountBandSkeleton() {
  return (
    <div
      className="ledger-band"
      aria-busy="true"
      aria-label="Loading account ledger"
      data-testid="account-band-skeleton"
    >
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-3" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-3" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-3" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-3" />
      <Skeleton className="h-[264px] rounded-lg bg-surface-raised col-span-2 sm:col-span-8" />
      <Skeleton className="h-[264px] rounded-lg bg-surface-raised col-span-2 sm:col-span-4" />
      <Skeleton className="h-[236px] rounded-lg bg-surface-raised col-span-2 sm:col-span-5" />
      <Skeleton className="h-[236px] rounded-lg bg-surface-raised col-span-2 sm:col-span-7" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-2 sm:col-span-4" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-2" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-2" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-2" />
      <Skeleton className="h-[140px] rounded-lg bg-surface-raised col-span-1 sm:col-span-2" />
    </div>
  );
}

function BandError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground"
      data-testid="account-band-error"
    >
      The account ledger could not load its aggregates.
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/**
 * Bande 2 — "The ledger": account & activity register on a 12-column
 * gap-px grid. Row 1 = journal KPIs (trades logged, usage time, avg daily
 * win rate, avg planned R:R); row 2 = classic equity curve + underwater
 * drawdown; row 3 = monthly goals + recent trades; row 4 = balance, gross
 * profit/loss, trades this month, average win, average loss. All aggregates
 * come from GET /stats/account-band (server-computed) — nothing here
 * touches the existing Band 1 components.
 */
export function AccountBand() {
  const { data, isLoading, isError, refetch } = useAccountBand();

  if (isLoading) return <AccountBandSkeleton />;
  if (isError || !data) return <BandError onRetry={() => void refetch()} />;

  return <BandContent data={data} />;
}

function BandContent({ data }: { data: AccountBandResponse }) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is an intentional dependency even though the tokens are
  // read from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const monthLabel = monthLabelFmt.format(new Date());
  const starting = parseDecimal(data.startingBalance) ?? 0;
  const balance = parseDecimal(data.balance) ?? 0;
  const balancePct = starting !== 0 ? ((balance - starting) / starting) * 100 : 0;
  const ahead = balance >= starting;
  const equityValues = data.equityCurve.map((point) => point.equity);
  const equityPeak = equityValues.length > 0 ? Math.max(...equityValues.map((v) => parseDecimal(v) ?? 0)) : 0;

  const grossProfit = parseDecimal(data.grossProfit) ?? 0;
  const grossLoss = parseDecimal(data.grossLoss) ?? 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  const monthDelta =
    data.monthTrades === data.lastMonthTrades
      ? "FLAT"
      : data.monthTrades > data.lastMonthTrades
        ? "UP"
        : "DOWN";
  const monthDiff = signedNumber(data.monthTrades - data.lastMonthTrades, 0);

  const bandTint = `linear-gradient(120deg, color-mix(in srgb, var(${ahead ? "--profit" : "--loss"}) 10%, transparent), transparent 58%)`;

  return (
    <section aria-label="Account ledger band" data-testid="account-band" className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="ledger-label">The ledger — account &amp; activity</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{monthLabel}</span>
      </div>

      <div className="ledger-band reveal-stagger">
        {/* ── Row 1 — journal KPIs (span 3 each) ─────────────────────── */}
        <div className="col-span-1 sm:col-span-3">
          <LedgerKpi
            label="Trades logged"
            value={formatNumber(data.totalTrades, 0)}
            sub={`${data.openTrades} open · ${data.closedTrades} closed`}
            sparkline={data.weeklyTradeCounts.map((count) => String(count))}
            sparklineColor={theme.accent}
            sparklineLabel="Trades logged per week over the last 8 weeks"
          />
        </div>
        <div className="col-span-1 sm:col-span-3">
          <LedgerKpi
            label="Usage time"
            value={`${formatNumber(data.usageDays, 0)} d`}
            sub={`${data.activeDays} active days${data.firstTradeDate ? ` · first ${axisDay.format(new Date(`${data.firstTradeDate}T00:00:00Z`))}` : ""}`}
            sparkline={data.weeklyActiveDays.map((days) => String(days))}
            sparklineColor={theme.accent}
            sparklineLabel="Active trading days per week over the last 8 weeks"
          />
        </div>
        <div className="col-span-1 sm:col-span-3">
          <LedgerKpi
            label="Avg daily win rate"
            value={formatPercent(data.avgDailyWinRate)}
            sub={`mean of traded days · ${data.avgDailyWinRateDays} days`}
          />
        </div>
        <div className="col-span-1 sm:col-span-3">
          <LedgerKpi
            label="Avg planned R:R"
            value={data.avgPlannedRR === null ? "-" : formatNumber(data.avgPlannedRR, 2)}
            sub={`reward : risk · ${data.avgPlannedRRCount} trades`}
          />
        </div>

        {/* ── Row 2 — equity curve (span 8) + drawdown (span 4) ──────── */}
        <div className="col-span-2 sm:col-span-8" data-testid="account-band-equity">
          <ChartCellHeader
            label="Equity curve"
            annotation={equityPeak > 0 ? `peak ${formatMoneyCompact(equityPeak, data.currency)}` : undefined}
          />
          {data.equityCurve.length > 1 ? (
            <EquityBandChart data={data} theme={theme} />
          ) : (
            <div className="mt-3 flex h-44 items-center justify-center text-xs text-muted-foreground sm:h-52">
              Not enough closed trades to plot the curve yet.
            </div>
          )}
        </div>
        <div className="col-span-2 sm:col-span-4" data-testid="account-band-drawdown">
          <ChartCellHeader
            label="Underwater drawdown"
            annotation={`max ${formatNumber(data.maxDrawdownPct, 1)} %`}
          />
          {data.equityCurve.length > 1 ? (
            <DrawdownBandChart data={data} theme={theme} />
          ) : (
            <div className="mt-3 flex h-44 items-center justify-center text-xs text-muted-foreground sm:h-52">
              Not enough closed trades to plot the drawdown yet.
            </div>
          )}
        </div>

        {/* ── Row 3 — monthly goals (span 5) + recent trades (span 7) ── */}
        <div className="col-span-2 sm:col-span-5">
          <GoalsPanel data={data} monthLabel={monthLabel} />
        </div>
        <div className="col-span-2 sm:col-span-7">
          <RecentTradesPanel data={data} />
        </div>

        {/* ── Row 4 — the ledger strip (4 + 2 + 2 + 2 + 2) ───────────── */}
        <div
          className="col-span-2 sm:col-span-4"
          style={{ backgroundImage: bandTint }}
        >
          <LedgerKpi
            label="Total balance"
            value={formatMoney(data.balance, data.currency)}
            sub={`${formatMoney(data.startingBalance, data.currency, { digits: 0 })} starting · ${signedNumber(balancePct, 1)} %`}
            sparkline={equityValues}
            sparklineColor={ahead ? theme.profit : theme.loss}
            sparklineLabel="Equity over the whole journal"
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <LedgerKpi
            label="Profit / Loss"
            value={
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-sm font-semibold tabular-nums text-profit sm:text-base">
                  +{formatNumber(grossProfit, 0)}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-loss sm:text-base">
                  -{formatNumber(grossLoss, 0)}
                </span>
              </span>
            }
            sub={profitFactor === null ? "no losses yet" : `profit factor ${formatNumber(profitFactor, 2)}`}
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <LedgerKpi
            label="Total trades"
            value={formatNumber(data.monthTrades, 0)}
            sub={`this month · last month: ${data.lastMonthTrades}`}
            pill={<TrendPill direction={monthDelta} value={monthDiff} />}
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <LedgerKpi
            label="Avg win"
            value={data.avgWin === null ? "-" : formatMoney(data.avgWin, data.currency)}
            sub="per winning trade"
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <LedgerKpi
            label="Avg loss"
            value={data.avgLoss === null ? "-" : formatMoney(data.avgLoss, data.currency)}
            sub="per losing trade"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground sm:text-right">
        Default account · ledger figures on closed trades · win-rate average over traded days ·
        R:R planned before entry · goals follow the prop-firm config when set
      </p>
    </section>
  );
}
