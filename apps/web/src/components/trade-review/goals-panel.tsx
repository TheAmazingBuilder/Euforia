"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { BellRing, CalendarDays, Pencil, Plus, Target, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { GoalWithProgress } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api/client";
import { useDeleteGoal, useGoals } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import {
  GOAL_GRADIENTS,
  GoalStatusBadge,
  METRIC_META,
  PERIOD_LABELS,
  formatGoalUnit,
} from "@/components/trade-review/trade-review-shared";
import { GoalFormDialog } from "@/components/trade-review/goal-form-dialog";

/**
 * Goals tab - the "targets vs real behavior" workspace. Every card renders
 * the trader's target next to the ACTUAL value computed server-side from
 * closed trades and daily stats over the resolved calendar period; progress
 * bars are paced against elapsed days so "behind" is honest, not vibes.
 */

export function GoalsPanel() {
  const goalsQuery = useGoals();
  const searchParams = useSearchParams();

  // Deep-link from a GOAL_STATUS inbox alert: /journal?tab=goals&goal=<id>
  // highlights the card and scrolls it into view.
  const highlightedGoalId = searchParams.get("goal");
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (highlightedGoalId === null) return;
    const timer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [highlightedGoalId, goalsQuery.data]);
  const deleteGoal = useDeleteGoal();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<GoalWithProgress | null>(null);

  const goals = goalsQuery.data?.goals ?? [];
  const isLoading = goalsQuery.isLoading;

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };
  const openEdit = (row: GoalWithProgress) => {
    setEditTarget(row);
    setFormOpen(true);
  };

  const confirmDelete = (row: GoalWithProgress) => {
    if (!window.confirm(`Delete "${row.goal.title}"? Progress history leaves with it.`)) return;
    deleteGoal.mutate(row.goal.id, {
      onSuccess: () => toast.success("Goal deleted", { description: row.goal.title }),
      onError: (error) => toast.error("Could not delete the goal", { description: apiErrorMessage(error, "Unexpected error - try again.") }),
    });
  };

  return (
    <div className="space-y-4" data-testid="goals-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Goals vs. real behavior</h2>
          <p className="text-sm text-muted-foreground">
            Targets are yours; the actual numbers are computed from your closed trades and daily stats - you cannot
            cheat the progress bar.
          </p>
          <p
            className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="goals-alerts-hint"
          >
            <BellRing className="size-3 text-accent" aria-hidden="true" />
            A goal that slips to “At risk” raises an alert in your notification inbox - tune it in Settings →
            Notifications → Goals.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="goal-create">
          <Plus className="size-4" aria-hidden="true" />
          New goal
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Target className="size-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">No goals yet</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Set your first target - win rate, R earned, discipline, trade limits - and track it against what you
                actually do.
              </p>
            </div>
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              Create a goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="goals-grid">
          {goals.map(({ goal, progress }) => {
            const trendUp = progress.previous !== null && progress.actual !== null && progress.actual > progress.previous;
            const trendDown =
              progress.previous !== null && progress.actual !== null && progress.actual < progress.previous;
            const periodPct = Math.min(100, Math.round((progress.daysElapsed / progress.daysTotal) * 100));

            return (
              <Card
                key={goal.id}
                className={cn(
                  "relative overflow-hidden",
                  goal.id === highlightedGoalId && "ring-2 ring-accent ring-offset-2 ring-offset-background",
                )}
                data-testid="goal-card"
                data-metric={goal.metric}
                data-status={progress.status}
              >
                {goal.id === highlightedGoalId && <div ref={highlightRef} aria-hidden="true" />}
                {/* The colorful signature - a gradient spine per goal color */}
                <span
                  className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r", GOAL_GRADIENTS[goal.color])}
                  aria-hidden="true"
                />
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold leading-snug">{goal.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                      {METRIC_META[goal.metric].label}
                    </Badge>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" aria-hidden="true" />
                      {PERIOD_LABELS[goal.period]}
                    </span>
                  </CardDescription>
                  <CardAction>
                    <GoalStatusBadge status={progress.status} />
                  </CardAction>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-mono text-2xl font-bold tabular-nums" data-testid="goal-actual">
                      {progress.actual === null ? "-" : formatGoalUnit(progress.actual, progress.unit)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      target {formatGoalUnit(goal.target, progress.unit)}
                    </p>
                  </div>

                  {/* Progress bar: goal fill vs elapsed-time ticks */}
                  <div>
                    <div
                      className="relative h-2.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={progress.progressPct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      data-testid="goal-progress"
                      data-progress={progress.progressPct ?? 0}
                    >
                      <div
                        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", GOAL_GRADIENTS[goal.color])}
                        style={{ width: `${progress.progressPct ?? 0}%` }}
                      />
                      {/* The "now" marker - where the period should be by time alone */}
                      <span
                        className="absolute top-0 h-full w-0.5 bg-foreground/50"
                        style={{ left: `${periodPct}%` }}
                        aria-hidden="true"
                        title={`${progress.daysElapsed}/${progress.daysTotal} days elapsed`}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span data-testid="goal-detail">{progress.detail}</span>
                      <span className="inline-flex items-center gap-1">
                        {trendUp && <TrendingUp className="size-3 text-profit" aria-hidden="true" />}
                        {trendDown && <TrendingDown className="size-3 text-loss" aria-hidden="true" />}
                        {progress.previous !== null && `was ${formatGoalUnit(progress.previous, progress.unit)}`}
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>
                    day {progress.daysElapsed}/{progress.daysTotal} · n={progress.sampleSize}
                  </span>
                  <span className="flex gap-1">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit({ goal, progress })} aria-label="Edit goal">
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-loss"
                      onClick={() => confirmDelete({ goal, progress })}
                      aria-label="Delete goal"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </span>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} editTarget={editTarget} />
    </div>
  );
}
