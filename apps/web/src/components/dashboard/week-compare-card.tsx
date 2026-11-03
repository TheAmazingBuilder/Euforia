"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Currency, WeekCompareSide } from "@cosmoz/shared";
import { formatSignedMoney, parseDecimal } from "@cosmoz/shared";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { cn } from "@/lib/utils";

/** Strip geometry - 7 slots of 100 units, bars centered in their slot.
 * `preserveAspectRatio="none"` keeps the slot grid aligned with the
 * day-number row underneath (both are equal-width columns). */
const SLOT_W = 100;
const VB_W = SLOT_W * 7;
const VB_H = 48;
const BAR_W = 52;

function dayOfMonth(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

/**
 * Baseline-centered mini bands - one column per day, profit above the
 * baseline, loss below, scaled to the largest absolute day across BOTH
 * weeks so the two strips share an honest visual scale.
 */
function WeekBands({
  side,
  maxAbs,
  colorProfit,
  colorLoss,
  muted = false,
  testId,
  ariaLabel,
}: {
  side: WeekCompareSide;
  maxAbs: number;
  colorProfit: string;
  colorLoss: string;
  muted?: boolean;
  testId: string;
  ariaLabel: string;
}) {
  const mid = VB_H / 2;
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      className="h-14 w-full"
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <line
        x1={0}
        x2={VB_W}
        y1={mid}
        y2={mid}
        stroke="currentColor"
        className="text-border"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {side.days.map((day, index) => {
        const value = parseDecimal(day.pnlNet) ?? 0;
        const up = value >= 0;
        const height = maxAbs > 0 ? (Math.abs(value) / maxAbs) * (mid - 4) : 0;
        return (
          <rect
            key={day.date}
            data-testid="dashboard-week-band"
            data-value={value}
            x={SLOT_W * index + (SLOT_W - BAR_W) / 2}
            width={BAR_W}
            y={up ? mid - height : mid}
            height={Math.max(height, value === 0 ? 1.5 : 0)}
            rx={2.5}
            fill={up ? colorProfit : colorLoss}
            opacity={muted ? 0.38 : 1}
          />
        );
      })}
    </svg>
  );
}

/** One week row: label + totals, band strip, day-of-month grid. */
function WeekRow({
  label,
  side,
  maxAbs,
  currency,
  colorProfit,
  colorLoss,
  muted = false,
  testId,
  ariaLabel,
}: {
  label: string;
  side: WeekCompareSide;
  maxAbs: number;
  currency: Currency;
  colorProfit: string;
  colorLoss: string;
  muted?: boolean;
  testId: string;
  ariaLabel: string;
}) {
  return (
    <div className={cn(muted && "opacity-80")} data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="ledger-label">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm font-semibold tabular-nums">
          {formatSignedMoney(side.totalPnl, currency)}
          <span className="text-[11px] font-normal text-muted-foreground">
            {side.tradesCount} {side.tradesCount === 1 ? "trade" : "trades"}
            {side.winRate !== null ? ` · WR ${Number(side.winRate).toFixed(1)}%` : ""}
          </span>
        </span>
      </div>
      <WeekBands
        side={side}
        maxAbs={maxAbs}
        colorProfit={colorProfit}
        colorLoss={colorLoss}
        muted={muted}
        testId={`${testId}-bands`}
        ariaLabel={ariaLabel}
      />
      <div className="grid grid-cols-7 text-center font-mono text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
        {side.days.map((day) => (
          <span key={day.date}>{dayOfMonth(day.date)}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * « This week vs last week » - two aligned mini-sparkline band strips fed
 * by the server-computed weeklyCompare (same rolling 7-day window as the
 * KPI arrows, zero-filled). No client-side aggregation: the card renders.
 */
export function WeekCompareCard({
  weeklyCompare,
  currency,
}: {
  weeklyCompare: {
    thisWeek: WeekCompareSide;
    prevWeek: WeekCompareSide;
    deltaPnlPct: string | null;
  };
  currency: Currency;
}) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is an intentional dependency: tokens are read from the
  // DOM, so the memo must re-run on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo(() => getChartTheme(), [resolvedTheme]);

  const maxAbs = Math.max(
    ...weeklyCompare.thisWeek.days.map((d) => Math.abs(parseDecimal(d.pnlNet) ?? 0)),
    ...weeklyCompare.prevWeek.days.map((d) => Math.abs(parseDecimal(d.pnlNet) ?? 0)),
    1,
  );
  const delta = weeklyCompare.deltaPnlPct === null ? null : parseDecimal(weeklyCompare.deltaPnlPct);

  return (
    <Card className="bg-surface" data-testid="dashboard-week-compare">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">This week vs last week</CardTitle>
        <CardDescription>
          Daily net P&L bands over the same 7-day window as the KPI arrows - both strips scaled to
          the biggest absolute day.
        </CardDescription>
        <CardAction>
          {delta === null ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] font-medium leading-none text-muted-foreground"
              data-testid="dashboard-week-delta"
            >
              <Minus className="size-3" aria-hidden="true" />
              <span className="sr-only">No comparison baseline yet</span>
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold leading-none tabular-nums",
                delta > 0
                  ? "border-profit/30 bg-profit/10 text-profit"
                  : delta < 0
                    ? "border-loss/30 bg-loss/10 text-loss"
                    : "border-border bg-surface-raised text-muted-foreground",
              )}
              data-testid="dashboard-week-delta"
            >
              {delta > 0 ? (
                <ArrowUpRight className="size-3" aria-hidden="true" />
              ) : delta < 0 ? (
                <ArrowDownRight className="size-3" aria-hidden="true" />
              ) : (
                <Minus className="size-3" aria-hidden="true" />
              )}
              {/* Direction spoken for assistive tech - the arrow is
                  aria-hidden, color must never be the only cue (Phase 10). */}
              <span className="sr-only">
                {delta > 0 ? "Up" : delta < 0 ? "Down" : "Unchanged"} vs last week: 
              </span>
              {`${Math.abs(delta).toFixed(1)} %`}
            </span>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <WeekRow
          label="This week"
          side={weeklyCompare.thisWeek}
          maxAbs={maxAbs}
          currency={currency}
          colorProfit={theme.profit}
          colorLoss={theme.loss}
          testId="dashboard-week-compare-this"
          ariaLabel="Daily net P&L over the last seven days"
        />
        <div className="border-t border-dashed border-border pt-4">
          <WeekRow
            label="Previous week"
            side={weeklyCompare.prevWeek}
            maxAbs={maxAbs}
            currency={currency}
            colorProfit={theme.profit}
            colorLoss={theme.loss}
            muted
            testId="dashboard-week-compare-prev"
            ariaLabel="Daily net P&L over the seven days before that"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Day of month under each band · today is the last column of the current strip.
        </p>
      </CardContent>
    </Card>
  );
}
