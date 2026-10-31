"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, BellRing, Minus, Target, TrendingUp, Trophy } from "lucide-react";
import type { GoalStatus, GoalWithProgress } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GOAL_DOTS,
  GOAL_GRADIENTS,
  GoalStatusBadge,
  PERIOD_LABELS,
} from "@/components/trade-review/trade-review-shared";
import { useGoals } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/** Urgency order - slipping goals surface first, achieved last. */
const URGENCY: GoalStatus[] = ["AT_RISK", "BEHIND", "ON_TRACK", "PENDING", "ACHIEVED"];
const MAX_ROWS = 4;

function sortGoals(goals: GoalWithProgress[]): GoalWithProgress[] {
  return [...goals].sort((a, b) => {
    const rank = URGENCY.indexOf(a.progress.status) - URGENCY.indexOf(b.progress.status);
    if (rank !== 0) return rank;
    const aPct = a.progress.progressPct;
    const bPct = b.progress.progressPct;
    if (aPct === null && bPct === null) return 0;
    if (aPct === null) return 1;
    if (bPct === null) return -1;
    return aPct - bPct; // most urgent (lowest) first within a status
  });
}

/** One counter tile - the whole tile navigates to the Goals tab. */
function PaceCounter({
  label,
  value,
  tone,
  icon: Icon,
  hint,
  emphasize = false,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof Target;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3 py-2.5",
        emphasize ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-surface-raised",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("size-3.5", tone)} aria-hidden="true" />
        {label}
      </span>
      <span className={cn("font-mono text-2xl font-semibold tabular-nums leading-none", tone)}>
        {value}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
    </span>
  );
}

function GoalsPaceSkeleton() {
  return (
    <CardContent className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <Skeleton className="h-[76px] rounded-lg" />
        <Skeleton className="h-[76px] rounded-lg" />
        <Skeleton className="h-[76px] rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </CardContent>
  );
}

/**
 * Dashboard « Goals on pace » - powered by the goal→notification bridge:
 * the counters and statuses come from the same server-computed progress
 * the bridge watches, so what the bell says and what this card says can
 * never disagree. The at-risk counter is clickable → Goals tab.
 */
export function GoalsPaceCard() {
  const goalsQuery = useGoals();
  const goals = React.useMemo(
    () => (goalsQuery.data?.goals ?? []).filter((entry) => entry.goal.active),
    [goalsQuery.data],
  );

  const atRisk = goals.filter((g) => g.progress.status === "AT_RISK" || g.progress.status === "BEHIND").length;
  const onTrack = goals.filter((g) => g.progress.status === "ON_TRACK").length;
  const achieved = goals.filter((g) => g.progress.status === "ACHIEVED").length;
  const rows = sortGoals(goals).slice(0, MAX_ROWS);
  const moreCount = goals.length - rows.length;

  return (
    <Card className="bg-surface" data-testid="dashboard-goals-pace">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Target className="size-4 text-accent" aria-hidden="true" />
          Goals on pace
        </CardTitle>
        <CardDescription>
          Targets measured against real behavior - the same statuses your notification bell watches.
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/journal?tab=goals">
              Manage goals
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      {goalsQuery.isLoading ? (
        <GoalsPaceSkeleton />
      ) : goalsQuery.isError ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Goal progress could not be loaded. Open the Goals tab to review your targets.
          </p>
        </CardContent>
      ) : goals.length === 0 ? (
        <CardContent>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8 text-center">
            <Target className="size-6 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No goals yet</p>
              <p className="text-xs text-muted-foreground">
                Set a target - the coach watches pacing and raises an alert the moment it slips.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/journal?tab=goals">Set your first goal</Link>
            </Button>
          </div>
        </CardContent>
      ) : (
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Counters - every tile navigates to the Goals tab */}
            <div className="grid grid-cols-3 gap-2 lg:col-span-4 lg:grid-cols-1" data-testid="dashboard-goals-counters">
              <Link href="/journal?tab=goals" aria-label={`${onTrack} goals on track - open the Goals tab`} className="transition-opacity hover:opacity-85">
                <PaceCounter label="On track" value={onTrack} tone="text-sky-400" icon={TrendingUp} hint="pacing at or ahead of plan" />
              </Link>
              <Link
                href="/journal?tab=goals"
                aria-label={`${atRisk} goals at risk - open the Goals tab`}
                data-testid="dashboard-goals-atrisk"
                className="transition-opacity hover:opacity-85"
              >
                <PaceCounter label="At risk" value={atRisk} tone={atRisk > 0 ? "text-amber-500" : "text-muted-foreground"} icon={BellRing} hint={atRisk > 0 ? "slipping - alerts raised" : "nothing slipping"} emphasize={atRisk > 0} />
              </Link>
              <Link href="/journal?tab=goals" aria-label={`${achieved} goals achieved - open the Goals tab`} className="transition-opacity hover:opacity-85">
                <PaceCounter label="Achieved" value={achieved} tone="text-emerald-500" icon={Trophy} hint="hit this period" />
              </Link>
            </div>

            {/* Slipping-first goal rows */}
            <div className="space-y-1.5 lg:col-span-8" data-testid="dashboard-goals-list">
              {rows.map(({ goal, progress }) => {
                const daysLeft = Math.max(0, progress.daysTotal - progress.daysElapsed);
                return (
                  <Link
                    key={goal.id}
                    href="/journal?tab=goals"
                    data-testid="dashboard-goal-row"
                    className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-surface-raised"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", GOAL_DOTS[goal.color])} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{goal.title}</span>
                        <GoalStatusBadge status={progress.status} className="hidden shrink-0 sm:inline-flex" />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {progress.detail} · {PERIOD_LABELS[goal.period].toLowerCase()} · {daysLeft}d left
                      </p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", GOAL_GRADIENTS[goal.color])}
                          style={{ width: `${progress.progressPct ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {progress.progressPct === null ? "-" : `${Math.round(progress.progressPct)}%`}
                      </span>
                    </div>
                  </Link>
                );
              })}
              {moreCount > 0 && (
                <Link
                  href="/journal?tab=goals"
                  className="flex items-center gap-1.5 px-2 pt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Minus className="size-3" aria-hidden="true" />
                  {moreCount} more in Trade Review
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
