"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatNumber, formatPercent, formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SuiteStatus } from "@/lib/dashboard-customization/insights-view";

/**
 * Loss-streak analysis widget (Phase 05 §9E) — current and historical
 * loss-streak information straight from the suite's streakProfile section.
 * The breakeven rule (breakeven neither extends nor breaks a run) is the
 * engine's documented convention and travels with the payload - the widget
 * renders it verbatim so the definition is always visible next to the data.
 */

export function LossStreaksWidget({
  suite,
  status,
}: {
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  const profile = suite?.streakProfile ?? null;
  const maxOccurrences = React.useMemo(
    () => (profile ? Math.max(1, ...profile.distribution.map((entry) => entry.occurrences)) : 1),
    [profile],
  );

  return (
    <Card className="bg-surface" data-testid="loss-streaks-widget">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Loss streaks</CardTitle>
          <CardDescription className="text-xs">
            Consecutive net-negative runs within the filtered scope.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading loss streaks">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The streak profile could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : !profile ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No closed-trade data in this scope yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2" data-testid="loss-streaks-summary">
              <div className="rounded-lg border border-border bg-surface-raised p-2.5 text-center">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current</p>
                <p className="font-mono text-xl font-semibold tabular-nums">{profile.currentLossStreak}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-2.5 text-center">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Longest (range)</p>
                <p className="font-mono text-xl font-semibold tabular-nums">{profile.longestLossStreak}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-raised p-2.5 text-center">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Average</p>
                <p className="font-mono text-xl font-semibold tabular-nums">
                  {profile.averageLossStreak === null ? "-" : formatNumber(profile.averageLossStreak, 1)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Streak lengths in this range
              </p>
              {profile.distribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">No loss streak yet in this scope.</p>
              ) : (
                <ul className="space-y-1" data-testid="loss-streaks-distribution">
                  {profile.distribution.map((entry) => (
                    <li key={entry.length} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {entry.length} {entry.length === 1 ? "loss" : "losses"}
                      </span>
                      <span
                        className="h-2.5 rounded-sm bg-accent/70"
                        style={{ width: `${Math.max(4, (entry.occurrences / maxOccurrences) * 100)}%` }}
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs tabular-nums">×{entry.occurrences}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-raised p-3" data-testid="loss-streaks-after">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                After ≥{profile.afterStreak.minStreak}-loss streaks (next {profile.afterStreak.windowTrades} trades)
              </p>
              {profile.afterStreak.trades === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  No qualifying streak with follow-up trades in this scope yet.
                </p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                  <span className="text-sm">
                    <span className="mr-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Trades</span>
                    <span className="font-mono font-medium tabular-nums">{profile.afterStreak.trades}</span>
                  </span>
                  <span className="text-sm">
                    <span className="mr-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Win rate</span>
                    <span className="font-mono font-medium tabular-nums">
                      {profile.afterStreak.winRate === null ? "-" : formatPercent(profile.afterStreak.winRate, 1)}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="mr-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Avg R</span>
                    <span className="font-mono font-medium tabular-nums">
                      {profile.afterStreak.avgR === null ? "-" : formatR(profile.afterStreak.avgR)}
                    </span>
                  </span>
                </div>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">{profile.rule}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
