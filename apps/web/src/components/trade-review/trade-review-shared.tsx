"use client";

import { AlertTriangle, Flame, Minus, Trophy, TrendingDown, TrendingUp, Target } from "lucide-react";
import type { GoalColor, GoalMetric, GoalPeriod, GoalStatus, PlaybookMatch } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Trade Review shared vocabulary - the colorful layer of the module.
 * Every grade, status and goal color resolves here so the four tabs stay
 * visually coherent.
 */

// ── Execution grades (A–F) ───────────────────────────────────────────────────

export const GRADE_STYLES: Record<string, string> = {
  A: "border-border bg-muted/30 text-foreground",
  B: "border-border bg-muted/20 text-foreground",
  C: "border-border bg-muted/10 text-muted-foreground",
  D: "border-border bg-muted/10 text-muted-foreground",
  F: "border-border bg-muted/10 text-muted-foreground",
};

export const GRADE_BAR: Record<string, string> = {
  A: "bg-foreground/80",
  B: "bg-foreground/65",
  C: "bg-foreground/50",
  D: "bg-foreground/35",
  F: "bg-foreground/25",
};

// ── Goal palette (vivid gradients, one per color key) ───────────────────────

export const GOAL_GRADIENTS: Record<GoalColor, string> = {
  VIOLET: "bg-foreground/85",
  CYAN: "bg-foreground/75",
  EMERALD: "bg-foreground/65",
  AMBER: "bg-foreground/55",
  ROSE: "bg-foreground/45",
  SKY: "bg-foreground/35",
  FUCHSIA: "bg-foreground/25",
  LIME: "bg-foreground/15",
};

export const GOAL_DOTS: Record<GoalColor, string> = {
  VIOLET: "bg-foreground/85",
  CYAN: "bg-foreground/75",
  EMERALD: "bg-foreground/65",
  AMBER: "bg-foreground/55",
  ROSE: "bg-foreground/45",
  SKY: "bg-foreground/35",
  FUCHSIA: "bg-foreground/25",
  LIME: "bg-foreground/15",
};

// ── Goal statuses ────────────────────────────────────────────────────────────

export const GOAL_STATUS: Record<
  GoalStatus,
  { label: string; badge: string; icon: typeof Target }
> = {
  ACHIEVED: { label: "Achieved", badge: "border-border bg-muted/30 text-foreground", icon: Trophy },
  ON_TRACK: { label: "On track", badge: "border-border bg-muted/20 text-foreground", icon: TrendingUp },
  AT_RISK: { label: "At risk", badge: "border-border bg-muted/10 text-muted-foreground", icon: AlertTriangle },
  BEHIND: { label: "Behind", badge: "border-border bg-muted/10 text-muted-foreground", icon: TrendingDown },
  PENDING: { label: "No data yet", badge: "border-border bg-muted/10 text-muted-foreground", icon: Minus },
};

// ── Goal metrics ─────────────────────────────────────────────────────────────

export const METRIC_META: Record<GoalMetric, { label: string; hint: string }> = {
  WIN_RATE: { label: "Win rate", hint: "% of closed trades that finish positive" },
  R_EARNED: { label: "R earned", hint: "Total R accumulated over the period" },
  AVG_R: { label: "Average R", hint: "Mean R per closed trade" },
  PROFIT_TARGET: { label: "Net P&L", hint: "Net profit in account currency" },
  DISCIPLINE_SCORE: { label: "Discipline score", hint: "Euforia Index - process, not profit" },
  FOLLOWED_PLAN_PCT: { label: "Followed plan", hint: "% of trades executed as planned" },
  MAX_TRADES_PER_DAY: { label: "Max trades per day", hint: "A ceiling - your worst day must stay under it" },
  MAX_DAILY_LOSS_R: { label: "Worst daily loss", hint: "A floor - no day may lose more R than the limit" },
};

export const PERIOD_LABELS: Record<GoalPeriod, string> = {
  WEEK: "This week",
  MONTH: "This month",
  QUARTER: "This quarter",
};

// ── Playbook match ───────────────────────────────────────────────────────────

export const PLAYBOOK_MATCH_META: Record<PlaybookMatch, { label: string; className: string }> = {
  MATCHED: { label: "Matched", className: "border-border bg-muted/30 text-foreground" },
  PARTIAL: { label: "Partial", className: "border-border bg-muted/15 text-muted-foreground" },
  OFF_PLAYBOOK: { label: "Off playbook", className: "border-dashed border-border bg-muted/10 text-muted-foreground" },
};

// ── Review source chips (lessons library) ────────────────────────────────────

export const SOURCE_META = {
  REVIEW: { label: "Review", className: "border-border bg-muted/30 text-foreground" },
  TRADE_NOTE: { label: "Trade note", className: "border-border bg-muted/20 text-muted-foreground" },
  JOURNAL: { label: "Journal", className: "border-border bg-muted/10 text-muted-foreground" },
} as const;

/** Formats a number in the metric's natural unit (server-derived). */
export function formatGoalUnit(value: number, unit: string): string {
  if (unit === "PERCENT") return `${value.toFixed(1)}%`;
  if (unit === "R") return `${value > 0 ? "+" : ""}${value.toFixed(2)}R`;
  if (unit === "MONEY") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (unit === "COUNT") return `${Math.round(value)}`;
  return value.toFixed(1);
}

export function GradeBadge({ grade, className }: { grade: string | null; className?: string }) {
  if (!grade) {
    return (
      <Badge variant="outline" className={cn("border-dashed text-muted-foreground", className)}>
        -
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-xs font-bold", GRADE_STYLES[grade], className)}
      data-testid="execution-grade"
      data-grade={grade}
    >
      {grade}
    </Badge>
  );
}

export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  const meta = GOAL_STATUS[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", meta.badge, className)} data-testid="goal-status" data-status={status}>
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

/** The review streak chip - flame, amber, honest when cold. */
export function ReviewStreak({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-muted-foreground" data-testid="review-streak">
      <Flame className={cn("size-4", days === 0 && "text-muted-foreground")} aria-hidden="true" />
      {days === 0 ? "No streak yet" : `${days}-day streak`}
    </span>
  );
}
