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

import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/dashboard/sparkline";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta: KpiDelta;
  formatDelta: (value: string) => string;
  sparkline: string[];
  sparklineColor: string;
  sparklineLabel: string;
  className?: string;
}

/** Signed display formatting for delta values ("0.12" → "+0.12"). */
function signedFormat(value: string, digits: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  if (parsed === 0) return formatNumber(0, digits);
  return `${parsed > 0 ? "+" : "-"}${formatNumber(Math.abs(parsed), digits)}`;
}

function DeltaBadge({ delta, format }: { delta: KpiDelta; format: (value: string) => string }) {
  if (delta.direction === "FLAT" || delta.value === null) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change vs previous period</span>
      </span>
    );
  }
  const Icon = delta.direction === "UP" ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        delta.direction === "UP" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {format(delta.value)}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  formatDelta,
  sparkline,
  sparklineColor,
  sparklineLabel,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("gap-2 bg-surface px-4 py-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <DeltaBadge delta={delta} format={formatDelta} />
      </div>
      <div className="font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
        {value}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
      <Sparkline
        points={sparkline}
        color={sparklineColor}
        className="mt-auto h-7 w-full"
        ariaLabel={sparklineLabel}
      />
    </Card>
  );
}

/** Top KPI band — all aggregates come from GET /stats/overview (server-computed). */
export function KpiRow({ overview }: { overview: StatsOverviewResponse }) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is an intentional dependency even though the tokens are
  // read from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const kpis: KpiCardProps[] = [
    {
      label: "Net P&L",
      value: formatSignedMoney(overview.netPnl, overview.currency),
      delta: overview.deltas.netPnl,
      formatDelta: (value) => `${signedFormat(value, 1)} %`,
      sparkline: overview.sparklines.netPnl,
      sparklineColor: theme.profit,
      sparklineLabel: "Cumulative net P&L over the recent window",
    },
    {
      label: "Win rate",
      value: formatPercent(overview.winRate),
      delta: overview.deltas.winRate,
      formatDelta: (value) => `${signedFormat(value, 1)} pp`,
      sparkline: overview.sparklines.winRate,
      sparklineColor: theme.accent,
      sparklineLabel: "Rolling win rate over the recent window",
    },
    {
      label: "Profit factor",
      value:
        overview.profitFactor === null
          ? "-"
          : formatNumber(overview.profitFactor, 2),
      sub: (
        <>
          Benchmark&nbsp;<span className="font-mono">2,00</span>
        </>
      ),
      delta: overview.deltas.profitFactor,
      formatDelta: (value) => signedFormat(value, 2),
      sparkline: overview.sparklines.profitFactor,
      sparklineColor: theme.accent,
      sparklineLabel: "Rolling profit factor over the recent window",
    },
    {
      label: "Expectancy",
      value: formatR(overview.expectancy),
      sub: "Avg R per closed trade",
      delta: overview.deltas.expectancy,
      formatDelta: (value) => formatR(value),
      sparkline: overview.sparklines.expectancy,
      sparklineColor: theme.accent,
      sparklineLabel: "Rolling expectancy over the recent window",
    },
    {
      label: "Discipline score",
      value:
        overview.disciplineScore === null
          ? "-"
          : formatNumber(overview.disciplineScore, 0),
      sub: "Cosmoz Index · /100",
      delta: overview.deltas.disciplineScore,
      formatDelta: (value) => `${signedFormat(value, 1)} pts`,
      sparkline: overview.sparklines.disciplineScore,
      sparklineColor: theme.accent,
      sparklineLabel: "Discipline score over the recent window",
      className: "col-span-2 xl:col-span-1",
    },
  ];

  return (
    <section aria-label="Key performance indicators" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} {...kpi} />
      ))}
    </section>
  );
}
