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
  parseDecimal,
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

/** Ledger delta PILL: tinted semantic ink on its own chip so it can sit
 * right next to the value — the label line stays clean, nothing is
 * cramped. Direction reads at a glance (arrow + color). */
function DeltaMark({
  delta,
  format,
  size = "sm",
}: {
  delta: KpiDelta;
  format: (value: string) => string;
  size?: "sm" | "lg";
}) {
  if (delta.direction === "FLAT" || delta.value === null) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-raised font-mono font-medium tabular-nums leading-none text-muted-foreground",
          size === "lg" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        )}
      >
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change vs previous period</span>
      </span>
    );
  }
  const Icon = delta.direction === "UP" ? ArrowUpRight : ArrowDownRight;
  const up = delta.direction === "UP";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-mono font-semibold tabular-nums leading-none",
        size === "lg" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        up
          ? "border-profit/30 bg-profit/10 text-profit"
          : "border-loss/30 bg-loss/10 text-loss",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {/* The arrow is decorative for assistive tech - the direction must
          also be spoken (Phase 10: color/shape cues are never the ONLY cue). */}
      <span className="sr-only">{up ? "Up" : "Down"} vs previous period: </span>
      {format(delta.value)}
    </span>
  );
}

/** Sign-aware tint behind hero cells — token-driven gradient that reacts
 * to the metric's direction (profit when ahead, loss when behind). */
function heroTint(token: "--profit" | "--loss" | "--accent"): string {
  return `linear-gradient(120deg, color-mix(in srgb, var(${token}) 10%, transparent), transparent 58%)`;
}

interface KpiCellProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta?: KpiDelta;
  formatDelta?: (value: string) => string;
  sparkline?: string[];
  sparklineColor?: string;
  sparklineLabel?: string;
  className?: string;
}

/** Compact KPI cell (row 2 of the band, span 3 of 12). The delta pill
 * sits NEXT TO the value on one baseline — never against the label. */
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
    <div className={cn("stat-cell stat-kpi flex flex-col gap-2", className)}>
      <span className="ledger-label">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <span className="font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
          {value}
        </span>
        {delta && formatDelta ? <DeltaMark delta={delta} format={formatDelta} /> : null}
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

interface HeroCellProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta: KpiDelta;
  formatDelta: (value: string) => string;
  sparkline?: string[];
  sparklineColor: string;
  sparklineLabel: string;
  tintToken: "--profit" | "--loss" | "--accent";
}

/** Hero cell (row 1 of the band, span 6 of 12): oversized headline value,
 * delta pill beside it, tinted corner gradient and a wider sparkline. */
function HeroCell({
  label,
  value,
  sub,
  delta,
  formatDelta,
  sparkline,
  sparklineColor,
  sparklineLabel,
  tintToken,
}: HeroCellProps) {
  return (
    <div
      className="stat-cell stat-hero flex flex-col gap-2.5"
      style={{ backgroundImage: heroTint(tintToken) }}
    >
      <span className="ledger-label">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
          {value}
        </span>
        <DeltaMark delta={delta} format={formatDelta} size="lg" />
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground sm:text-xs">{sub}</div> : null}
      {sparkline ? (
        <Sparkline
          points={sparkline}
          color={sparklineColor}
          className="mt-auto h-9 w-full"
          ariaLabel={sparklineLabel}
        />
      ) : (
        <div className="mt-auto" />
      )}
    </div>
  );
}

/** Top KPI band — ONE ruled ledger band on a 12-column grid:
 * row 1 = two hero cells (Net P&L, Discipline score), row 2 = four KPI
 * cells (Win rate, Profit factor, Expectancy, Hesitation cost). All
 * aggregates come from GET /stats/overview (server-computed). Deltas
 * compare THIS WEEK vs LAST WEEK (server window); sparklines draw one
 * point per weekly bucket. */
export function KpiRow({ overview }: { overview: StatsOverviewResponse }) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is an intentional dependency even though the tokens are
  // read from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const pnlPositive = (parseDecimal(overview.netPnl) ?? 0) >= 0;
  const profitFactorValue =
    overview.profitFactor === null ? null : parseDecimal(overview.profitFactor);
  const expectancyPositive = (parseDecimal(overview.expectancy) ?? 0) >= 0;
  const hesitationR = parseDecimal(overview.hesitationCost.rCost) ?? 0;

  return (
    <>
      <section aria-label="Key performance indicators" className="stat-strip reveal-stagger">
        {/* ── Row 1 — heroes (span 6 each) ─────────────────────────── */}
        <HeroCell
          label="Net P&L"
          value={formatSignedMoney(overview.netPnl, overview.currency)}
          sub="Net across all closed trades"
          delta={overview.deltas.netPnl}
          formatDelta={(value) => `${signedFormat(value, 1)} %`}
          sparkline={overview.sparklines.netPnl}
          sparklineColor={pnlPositive ? theme.profit : theme.loss}
          sparklineLabel="Cumulative net P&L over the recent window"
          tintToken={pnlPositive ? "--profit" : "--loss"}
        />
        <HeroCell
          label="Discipline score"
          value={
            overview.disciplineScore === null
              ? "-"
              : formatNumber(overview.disciplineScore, 0)
          }
          sub="Euforia Index · /100"
          delta={overview.deltas.disciplineScore}
          formatDelta={(value) => `${signedFormat(value, 1)} pts`}
          sparkline={overview.sparklines.disciplineScore}
          sparklineColor={theme.accent}
          sparklineLabel="Discipline score over the recent window"
          tintToken="--accent"
        />
        {/* ── Row 2 — KPI cells (span 3 each) ──────────────────────── */}
        <KpiCell
          label="Win rate"
          value={formatPercent(overview.winRate)}
          delta={overview.deltas.winRate}
          formatDelta={(value) => `${signedFormat(value, 1)} pp`}
          sparkline={overview.sparklines.winRate}
          sparklineColor={theme.accent}
          sparklineLabel="Rolling win rate over the recent window"
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
          sparkline={overview.sparklines.profitFactor}
          sparklineColor={
            profitFactorValue !== null && profitFactorValue >= 1
              ? theme.profit
              : theme.loss
          }
          sparklineLabel="Rolling profit factor over the recent window"
        />
        <KpiCell
          label="Expectancy"
          value={formatR(overview.expectancy)}
          sub="Avg R per closed trade"
          delta={overview.deltas.expectancy}
          formatDelta={(value) => formatR(value)}
          sparkline={overview.sparklines.expectancy}
          sparklineColor={expectancyPositive ? theme.profit : theme.loss}
          sparklineLabel="Rolling expectancy over the recent window"
        />
        <KpiCell
          label="Hesitation cost"
          value={formatR(-hesitationR)}
          sub={`${overview.hesitationCost.settledCount} missed ${overview.hesitationCost.settledCount === 1 ? "entry" : "entries"} · Regret Registry`}
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
