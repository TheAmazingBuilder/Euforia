"use client";

import { AlertTriangle, Flame, Minus, Trophy, TrendingDown, TrendingUp, Target } from "lucide-react";
import type { GoalColor, GoalMetric, GoalPeriod, GoalStatus, PlaybookMatch } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Trade Review shared vocabulary — the colorful layer of the module.
 * Every grade, status and goal color resolves here so the four tabs stay
 * visually coherent.
 */

// ── Execution grades (A–F) ───────────────────────────────────────────────────

export const GRADE_STYLES: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  B: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  C: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  D: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  F: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export const GRADE_BAR: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-sky-500",
  C: "bg-amber-500",
  D: "bg-orange-500",
  F: "bg-rose-500",
};

// ── Goal palette (vivid gradients, one per color key) ───────────────────────

export const GOAL_GRADIENTS: Record<GoalColor, string> = {
  VIOLET: "from-violet-500 to-purple-600",
  CYAN: "from-cyan-500 to-sky-600",
  EMERALD: "from-emerald-500 to-teal-600",
  AMBER: "from-amber-500 to-orange-500",
  ROSE: "from-rose-500 to-pink-600",
  SKY: "from-sky-500 to-blue-600",
  FUCHSIA: "from-fuchsia-500 to-purple-600",
  LIME: "from-lime-500 to-emerald-500",
};

export const GOAL_DOTS: Record<GoalColor, string> = {
  VIOLET: "bg-violet-500",
  CYAN: "bg-cyan-500",
  EMERALD: "bg-emerald-500",
  AMBER: "bg-amber-500",
  ROSE: "bg-rose-500",
  SKY: "bg-sky-500",
  FUCHSIA: "bg-fuchsia-500",
  LIME: "bg-lime-500",
};

// ── Goal statuses ────────────────────────────────────────────────────────────

export const GOAL_STATUS: Record<
  GoalStatus,
  { label: string; badge: string; icon: typeof Target }
> = {
  ACHIEVED: { label: "Achieved", badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: Trophy },
  ON_TRACK: { label: "On track", badge: "bg-sky-500/15 text-sky-400 border-sky-500/30", icon: TrendingUp },
  AT_RISK: { label: "At risk", badge: "bg-amber-500/15 text-amber-500 border-amber-500/30", icon: AlertTriangle },
  BEHIND: { label: "Behind", badge: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: TrendingDown },
  PENDING: { label: "No data yet", badge: "bg-muted text-muted-foreground border-border", icon: Minus },
};

// ── Goal metrics ─────────────────────────────────────────────────────────────

export const METRIC_META: Record<GoalMetric, { label: string; hint: string }> = {
  WIN_RATE: { label: "Win rate", hint: "% of closed trades that finish positive" },
  R_EARNED: { label: "R earned", hint: "Total R accumulated over the period" },
  AVG_R: { label: "Average R", hint: "Mean R per closed trade" },
  PROFIT_TARGET: { label: "Net P&L", hint: "Net profit in account currency" },
  DISCIPLINE_SCORE: { label: "Discipline score", hint: "Euforia Index — process, not profit" },
  FOLLOWED_PLAN_PCT: { label: "Followed plan", hint: "% of trades executed as planned" },
  MAX_TRADES_PER_DAY: { label: "Max trades per day", hint: "A ceiling — your worst day must stay under it" },
  MAX_DAILY_LOSS_R: { label: "Worst daily loss", hint: "A floor — no day may lose more R than the limit" },
};

export const PERIOD_LABELS: Record<GoalPeriod, string> = {
  WEEK: "This week",
  MONTH: "This month",
  QUARTER: "This quarter",
};

// ── Playbook match ───────────────────────────────────────────────────────────

export const PLAYBOOK_MATCH_META: Record<PlaybookMatch, { label: string; className: string }> = {
  MATCHED: { label: "Matched", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  PARTIAL: { label: "Partial", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  OFF_PLAYBOOK: { label: "Off playbook", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

// ── Review source chips (lessons library) ────────────────────────────────────

export const SOURCE_META = {
  REVIEW: { label: "Review", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  TRADE_NOTE: { label: "Trade note", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  JOURNAL: { label: "Journal", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
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
        —
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

/** The review streak chip — flame, amber, honest when cold. */
export function ReviewStreak({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-amber-500" data-testid="review-streak">
      <Flame className={cn("size-4", days === 0 && "text-muted-foreground")} aria-hidden="true" />
      {days === 0 ? "No streak yet" : `${days}-day streak`}
    </span>
  );
}
