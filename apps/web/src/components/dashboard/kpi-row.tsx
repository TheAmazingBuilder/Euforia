"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useTheme } from "next-themes";
import type { KpiDelta, StatsOverviewResponse } from "@cosmoz/shared";
import {
  formatNumber,
  formatPercent,
  formatR,
  formatSignedMoney,
} from "@cosmoz/shared";

import { Sparkline } from "@/components/dashboard/sparkline";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { cn } from "@/lib/utils";

/** Signed display formatting for delta values ("0.12" → "+0.12"). */
function signedFormat(value: string, digits: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  if (parsed === 0) return formatNumber(0, digits);
  return `${parsed > 0 ? "+" : "-"}${formatNumber(Math.abs(parsed), digits)}`;
}

/** Ledger delta: quiet mono ink where only the arrow carries semantic color —
 * the record stays calm; direction reads at a glance. */
function DeltaMark({ delta, format }: { delta: KpiDelta; format: (value: string) => string }) {
  if (delta.direction === "FLAT" || delta.value === null) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change vs previous period</span>
      </span>
    );
  }
  const Icon = delta.direction === "UP" ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono text-[11px] font-medium tabular-nums text-muted-foreground",
        delta.direction === "UP" ? "[&_svg]:text-profit" : "[&_svg]:text-loss",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {format(delta.value)}
    </span>
  );
}

interface KpiCellProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta: KpiDelta;
  formatDelta: (value: string) => string;
  sparkline?: string[];
  sparklineColor?: string;
  sparklineLabel?: string;
  className?: string;
}

function KpiCell({
  label,
  value,
  sub,
  delta,
  formatDelta,
  sparkline,
  sparklineColor = "currentColor",
  sparklineLabel,
  className,
}: KpiCellProps) {
  return (
    <div className={cn("stat-cell flex flex-col gap-1.5", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="ledger-label">{label}</span>
        <DeltaMark delta={delta} format={formatDelta} />
      </div>
      <div className="font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
        {value}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
      {sparkline ? (
        <Sparkline
          points={sparkline}
          color={sparklineColor}
          className="mt-auto h-7 w-full"
          ariaLabel={sparklineLabel}
        />
      ) : (
        <div className="mt-auto" />
      )}
    </div>
  );
}

/** Top KPI band — one ruled strip (the record's totals row), not five cards.
 * All aggregates come from GET /stats/overview (server-computed). Deltas
 * compare THIS WEEK vs LAST WEEK (server window) and the sparklines draw
 * one point per weekly bucket. */
export function KpiRow({ overview }: { overview: StatsOverviewResponse }) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is an intentional dependency even though the tokens are
  // read from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  return (
    <>
      <section
        aria-label="Key performance indicators"
        className="stat-strip reveal-stagger grid-cols-2 max-sm:grid"
      >
      <KpiCell
        label="Net P&L"
        value={formatSignedMoney(overview.netPnl, overview.currency)}
        delta={overview.deltas.netPnl}
        formatDelta={(value) => `${signedFormat(value, 1)} %`}
        sparkline={overview.sparklines.netPnl}
        sparklineColor={theme.profit}
        sparklineLabel="Cumulative net P&L over the recent window"
      />
      <KpiCell
        label="Win rate"
        value={formatPercent(overview.winRate)}
        delta={overview.deltas.winRate}
        formatDelta={(value) => `${signedFormat(value, 1)} pp`}
      />
      <KpiCell
        label="Profit factor"
        value={
          overview.profitFactor === null
            ? "-"
            : formatNumber(overview.profitFactor, 2)
        }
        sub={
          <>
            Benchmark&nbsp;<span className="font-mono">2,00</span>
          </>
        }
        delta={overview.deltas.profitFactor}
        formatDelta={(value) => signedFormat(value, 2)}
      />
      <KpiCell
        label="Expectancy"
        value={formatR(overview.expectancy)}
        sub="Avg R per closed trade"
        delta={overview.deltas.expectancy}
        formatDelta={(value) => formatR(value)}
      />
      <KpiCell
        label="Discipline score"
        value={
          overview.disciplineScore === null
            ? "-"
            : formatNumber(overview.disciplineScore, 0)
        }
        sub="Cosmoz Index · /100"
        delta={overview.deltas.disciplineScore}
        formatDelta={(value) => `${signedFormat(value, 1)} pts`}
        className="max-sm:col-span-2"
      />
      </section>
      <p
        data-testid="kpi-window-note"
        className="-mt-2 text-[11px] text-muted-foreground sm:text-right"
      >
        Arrows: this week vs last week ({overview.deltaWindowDays}-day window) · sparklines: weekly buckets
      </p>
    </>
  );
}
