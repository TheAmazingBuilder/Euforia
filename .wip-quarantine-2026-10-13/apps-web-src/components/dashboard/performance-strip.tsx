"use client";

import * as React from "react";
import type { KpiDelta, StatsOverviewResponse, WeekOverWeekMetric } from "@cosmoz/shared";
import { formatMoney, formatNumber } from "@cosmoz/shared";

import { KpiCell, signedFormat } from "@/components/dashboard/kpi-cell";
import { MiniBars, MiniMeter, MiniSpark, MiniSplitMeter } from "@/components/dashboard/mini-visuals";
import { useChartTheme } from "@/lib/utils/chart-theme";

/** Week-over-week metric → the KpiCell delta shape (% change + direction). */
function wowDelta(metric: WeekOverWeekMetric | undefined): KpiDelta | undefined {
  if (!metric) return undefined;
  return { value: metric.changePct, direction: metric.direction };
}

/** "+12.4%" — the WoW delta reads as a percentage of the previous week. */
const formatWowPct = (value: string) => `${signedFormat(value, 1)}%`;

/**
 * Trade-performance strip — the second ruled band of the dashboard: trade
 * count with its per-day activity bars, per-trade economics (R:R rendered as
 * a win/loss balance bar, average win / loss in their P&L inks) and the live
 * drawdown against its historical cap. Every figure comes from
 * GET /stats/overview (server-computed) — each cell also carries its
 * week-over-week arrow (% vs the previous rolling week) and, where the
 * visual slot is free, the 8-week mini sparkline.
 */
export function PerformanceStrip({ overview }: { overview: StatsOverviewResponse }) {
  // Re-reads tokens when the data-theme attribute flips (post-write, no race).
  const theme = useChartTheme();
  const wow = overview.weekOverWeek;

  const tradesPerDay = overview.dailyPnl.slice(-14).map((point) => point.tradesCount);
  const win = overview.avgWin === null ? null : Number(overview.avgWin);
  const loss = overview.avgLoss === null ? null : Number(overview.avgLoss);
  // Win share of the combined average trade — the visual R:R.
  const rrRatio = win !== null && loss !== null && win + loss > 0 ? win / (win + loss) : null;
  const maxDd = Math.abs(Number(overview.maxDrawdownPct));
  const ddRatio = maxDd > 0 ? Math.abs(Number(overview.currentDrawdownPct)) / maxDd : 0;
  const ddNearCap = ddRatio >= 0.6;

  const winSpark = wow?.avgWin.sparkline.filter((v): v is string => v !== null).length ?? 0;
  const lossSpark = wow?.avgLoss.sparkline.filter((v): v is string => v !== null).length ?? 0;

  return (
    <section
      aria-label="Trade performance"
      className="stat-strip reveal-stagger grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      data-testid="performance-strip"
    >
      <KpiCell
        label="Total trades"
        value={formatNumber(overview.totalTrades, 0)}
        sub="Closed · book of record"
        delta={wowDelta(wow?.totalTrades)}
        formatDelta={formatWowPct}
      >
        <MiniBars
          points={tradesPerDay}
          color={theme.accent}
          className="h-7 w-full"
          ariaLabel="Trades per day over the last 14 days"
        />
      </KpiCell>
      <KpiCell
        label="Avg R:R"
        value={
          overview.avgRR === null ? "-" : `${formatNumber(overview.avgRR, 2)} : 1`
        }
        sub="Avg win / avg loss"
        delta={wowDelta(wow?.avgRR)}
        formatDelta={formatWowPct}
      >
        {rrRatio !== null ? (
          <MiniSplitMeter
            ratio={rrRatio}
            leadClassName="bg-profit/80"
            trailClassName="bg-loss/75"
            ariaLabel="Average win share versus average loss"
          />
        ) : null}
      </KpiCell>
      <KpiCell
        label="Avg win"
        value={
          overview.avgWin === null
            ? "-"
            : formatMoney(overview.avgWin, overview.currency)
        }
        sub={<span data-testid="avg-win-sub">Per winning trade</span>}
        valueClassName="text-profit"
        delta={wowDelta(wow?.avgWin)}
        formatDelta={formatWowPct}
      >
        <MiniSpark
          points={(wow?.avgWin.sparkline ?? []).map((v) => (v === null ? null : Number(v)))}
          color={theme.profit}
          className="h-6 w-full"
          ariaLabel={`Average win over the last 8 weeks (${winSpark} weeks with data)`}
        />
      </KpiCell>
      <KpiCell
        label="Avg loss"
        value={
          overview.avgLoss === null
            ? "-"
            : formatMoney(overview.avgLoss, overview.currency)
        }
        sub={<span data-testid="avg-loss-sub">Per losing trade</span>}
        valueClassName="text-loss"
        delta={wowDelta(wow?.avgLoss)}
        formatDelta={formatWowPct}
        deltaUpIsGood={false}
      >
        <MiniSpark
          points={(wow?.avgLoss.sparkline ?? []).map((v) => (v === null ? null : Number(v)))}
          color={theme.loss}
          className="h-6 w-full"
          ariaLabel={`Average loss over the last 8 weeks (${lossSpark} weeks with data)`}
        />
      </KpiCell>
      <KpiCell
        label="Drawdown now"
        value={`${formatNumber(overview.currentDrawdownPct, 2)} %`}
        sub={
          <>
            Max&nbsp;<span className="font-mono">{formatNumber(overview.maxDrawdownPct, 1)} %</span>
            &nbsp;· from peak
          </>
        }
        delta={wowDelta(wow?.drawdownPct)}
        formatDelta={formatWowPct}
        deltaUpIsGood={false}
        className="max-lg:col-span-2"
      >
        <MiniMeter
          ratio={ddRatio}
          fillClassName={ddNearCap ? "bg-warning" : "bg-loss/70"}
          ariaLabel="Current drawdown as a share of the maximum drawdown"
        />
      </KpiCell>
    </section>
  );
}
