"use client";

import Link from "next/link";
import { ArrowRight, Flag } from "lucide-react";
import { formatMoney, formatNumber, formatR, type MonthlyGoal, type MonthlyGoalsResponse } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatGoalValue(
  value: string,
  unit: MonthlyGoal["unit"],
  currency: MonthlyGoalsResponse["currency"],
): string {
  switch (unit) {
    case "CURRENCY":
      return formatMoney(value, currency);
    case "PERCENT":
      return `${formatNumber(value, 1)} %`;
    case "R":
      return formatR(value);
    case "COUNT":
    default:
      return formatNumber(value, 0);
  }
}

interface GoalRowProps {
  goal: MonthlyGoal;
  currency: MonthlyGoalsResponse["currency"];
}

function GoalRow({ goal, currency }: GoalRowProps) {
  const target = Number(goal.target);
  const current = Number(goal.current);
  const isLowerBetter = goal.direction === "LOWER_IS_BETTER";
  const met = isLowerBetter ? current <= target : current >= target;
  const breached = isLowerBetter && current > target;

  const rawRatio = target > 0 ? current / target : 0;
  const fillPct = Math.min(Math.max(rawRatio, 0), 1) * 100;
  const labelPct = Math.round(rawRatio * 100);

  return (
    <div
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0"
      data-testid={`goal-row-${goal.key.toLowerCase()}`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{goal.label}</div>
        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatGoalValue(goal.current, goal.unit, currency)}
          {" / "}
          {formatGoalValue(goal.target, goal.unit, currency)}
          {isLowerBetter ? " cap" : ""}
        </div>
      </div>
      <div
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          breached ? "text-loss" : met ? "text-profit" : "text-foreground",
        )}
      >
        {labelPct}%
      </div>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-border/60">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            breached ? "bg-loss" : met ? "bg-profit" : "bg-accent",
          )}
          style={{ width: `${fillPct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(fillPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.label} progress`}
          data-testid={`goal-fill-${goal.key.toLowerCase()}`}
        />
      </div>
    </div>
  );
}

/** Monthly goals card — month-to-date progress against the seeded targets. */
export function MonthlyGoalsCard({ goals }: { goals: MonthlyGoalsResponse }) {
  const onTrack = goals.goals.filter((goal) => {
    const target = Number(goal.target);
    const current = Number(goal.current);
    return goal.direction === "LOWER_IS_BETTER" ? current <= target : current >= target;
  }).length;

  return (
    <Card className="bg-surface" data-testid="goals-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Flag className="size-4 text-accent" aria-hidden="true" />
          Monthly goals
        </CardTitle>
        <CardDescription>
          {goals.monthLabel} · {onTrack}/{goals.goals.length} on track
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {goals.goals.map((goal) => (
            <GoalRow key={goal.key} goal={goal} currency={goals.currency} />
          ))}
        </div>
        <Link
          href="/goals"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
        >
          Manage goals
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
