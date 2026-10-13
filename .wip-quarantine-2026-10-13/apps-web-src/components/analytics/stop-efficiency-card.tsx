"use client";

import * as React from "react";
import { MoveVertical, Percent, Scissors } from "lucide-react";
import type { Trade } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatR } from "@cosmoz/shared";
import { cn } from "@/lib/utils";

/**
 * Stop efficiency (Priority 2 #6): reads the MAE/MFE excursions the server
 * already froze on each closed trade and turns them into stop-tuning hints —
 * how deep losing trades actually went, how much of the favorable excursion
 * winners captured, and what moving the stop did. 100% client-side (same
 * spirit as the What-If replay it complements). Honest about sample size:
 * never a rate without its n.
 */

const MAE_BUCKETS: { max: number; label: string }[] = [
  { max: 0.25, label: "≤ 0.25R" },
  { max: 0.5, label: "≤ 0.5R" },
  { max: 0.75, label: "≤ 0.75R" },
  { max: 1.0, label: "≤ 1R" },
  { max: Number.POSITIVE_INFINITY, label: "> 1R" },
];

const MFE_BUCKETS: { max: number; label: string }[] = [
  { max: 0.5, label: "≤ 0.5R" },
  { max: 1.0, label: "≤ 1R" },
  { max: 2.0, label: "≤ 2R" },
  { max: 3.0, label: "≤ 3R" },
  { max: Number.POSITIVE_INFINITY, label: "> 3R" },
];

function bucketize(values: number[], buckets: { max: number; label: string }[]): { label: string; count: number }[] {
  return buckets.map((bucket, index) => {
    const lower = index === 0 ? 0 : buckets[index - 1]!.max;
    return {
      label: bucket.label,
      count: values.filter((value) => value > lower && value <= bucket.max).length,
    };
  });
}

function ExcursionBars({
  title,
  hint,
  buckets,
  testId,
}: {
  title: string;
  hint: string;
  buckets: { label: string; count: number }[];
  testId: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">n {total}</span>
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      <ul className="space-y-1.5">
        {buckets.map((bucket) => (
          <li key={bucket.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {bucket.label}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-raised">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: total > 0 ? `${(bucket.count / total) * 100}%` : "0%" }}
              />
            </span>
            <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
              {bucket.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StopEfficiencyCard({ trades }: { trades: Trade[] }) {
  const stats = React.useMemo(() => {
    const closed = trades.filter((t) => t.status === "CLOSED");
    const losers = closed.filter(
      (t) => (Number(t.rMultiple) ?? 0) < 0 && t.maeR !== null,
    );
    const winners = closed.filter(
      (t) => (Number(t.rMultiple) ?? 0) >= 0 && t.mfeR !== null,
    );

    const maeValues = losers.map((t) => Number(t.maeR));
    const shallowLosers = losers.filter((t) => (Number(t.maeR) ?? 0) <= 0.5);
    // If a −0.5R hard stop had existed, shallow trades would have lost ~0.5R
    // instead of their actual R — a conservative "what the stop saved" proxy.
    const savedR = shallowLosers.reduce(
      (sum, t) => sum + Math.abs(Number(t.rMultiple) ?? 0) - 0.5,
      0,
    );

    const mfeValues = winners.map((t) => Number(t.mfeR));
    const finalR = winners.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0);
    const totalMfe = mfeValues.reduce((sum, value) => sum + value, 0);
    const captureRatio = totalMfe > 0 ? Math.max(0, Math.min(1, finalR / totalMfe)) : null;

    const moved = closed.filter(
      (t) => t.initialStop !== null && t.finalStop !== null && t.finalStop !== t.initialStop,
    );
    const neverMoved = closed.filter((t) => !(t.initialStop !== null && t.finalStop !== null && t.finalStop !== t.initialStop));
    const avgRMoved = moved.length > 0
      ? moved.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / moved.length
      : null;
    const avgRNever = neverMoved.length > 0
      ? neverMoved.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / neverMoved.length
      : null;

    return {
      losers,
      winners,
      maeBuckets: bucketize(maeValues, MAE_BUCKETS),
      mfeBuckets: bucketize(mfeValues, MFE_BUCKETS),
      shallowPct: losers.length > 0 ? (shallowLosers.length / losers.length) * 100 : null,
      savedR,
      captureRatio,
      movedCount: moved.length,
      avgRMoved,
      avgRNever,
      closedCount: closed.length,
    };
  }, [trades]);

  if (stats.losers.length === 0 && stats.winners.length === 0) {
    return null;
  }

  const lowN = stats.losers.length < 10 || stats.winners.length < 10;

  return (
    <Card className="card-hover bg-surface" data-testid="stop-efficiency">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">Stop efficiency</CardTitle>
        <CardDescription>
          Where losing trades actually stopped (MAE) and how much of the move winners gave back
          (MFE) — the data to tune your stops with, complementary to the replay above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <ExcursionBars
            title="Losers — adverse excursion"
            hint="Depth each losing trade reached against you before the exit. A tall top bucket means stops are being honored late."
            buckets={stats.maeBuckets}
            testId="mae-buckets"
          />
          <ExcursionBars
            title="Winners — favorable excursion"
            hint="How far winners traveled in your favor. Compare with the final R captured to spot exits given back too early."
            buckets={stats.mfeBuckets}
            testId="mfe-buckets"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {stats.shallowPct !== null && stats.shallowPct >= 30 && stats.savedR > 0 ? (
            <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-muted-foreground">
              <Scissors className="size-3.5 text-accent" aria-hidden="true" />
              <span className="font-mono tabular-nums text-foreground">
                {stats.shallowPct.toFixed(0)}%
              </span>
              of losers never went past −0.5R — a harder stop would have saved ≈
              <span className="font-mono font-medium tabular-nums text-profit">
                {formatR(stats.savedR)}
              </span>
            </span>
          ) : null}
          {stats.captureRatio !== null ? (
            <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-muted-foreground">
              <Percent className="size-3.5 text-accent" aria-hidden="true" />
              winners captured
              <span className="font-mono font-medium tabular-nums text-foreground">
                {(stats.captureRatio * 100).toFixed(0)}%
              </span>
              of their favorable excursion
            </span>
          ) : null}
          {stats.avgRMoved !== null && stats.avgRNever !== null ? (
            <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-muted-foreground">
              <MoveVertical className="size-3.5 text-accent" aria-hidden="true" />
              moved stops avg
              <span
                className={cn(
                  "font-mono font-medium tabular-nums",
                  stats.avgRMoved >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatR(stats.avgRMoved)}
              </span>
              vs
              <span
                className={cn(
                  "font-mono font-medium tabular-nums",
                  stats.avgRNever >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatR(stats.avgRNever)}
              </span>
              never moved
            </span>
          ) : null}
          {lowN ? (
            <span className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              low n — read as a hint, not a law
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
