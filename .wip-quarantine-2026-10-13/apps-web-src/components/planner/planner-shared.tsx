"use client";

/**
 * Trade Planner — shared primitives (status badges, readiness chips,
 * direction mark, stable-code → dict mappers). Presentational only.
 */

import * as React from "react";
import { CheckCircle2, CircleDashed, OctagonX } from "lucide-react";
import type { Direction, PlanReadiness, TradePlanStatus } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import type { Dictionary } from "@/i18n/dictionaries/en";

/** Status → badge variant. Never color-only: the label is always present. */
const STATUS_VARIANT: Record<TradePlanStatus, "secondary" | "default" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  READY: "default",
  EXECUTED: "outline",
  CANCELLED: "destructive",
  EXPIRED: "outline",
};

export function PlanStatusBadge({ status }: { status: TradePlanStatus }) {
  const { dict } = useI18n();
  return (
    <Badge variant={STATUS_VARIANT[status]} data-testid={`planner-status-${status.toLowerCase()}`}>
      {dict.planner.status[status]}
    </Badge>
  );
}

/** Direction mark — accent-only (no P&L green/red; same rule as trades). */
export function DirectionMark({ direction, className }: { direction: Direction; className?: string }) {
  const { dict } = useI18n();
  return (
    <span
      className={cn(
        "font-mono text-xs font-semibold tabular-nums",
        direction === "BUY" ? "text-profit" : "text-loss",
        className,
      )}
    >
      {direction === "BUY" ? dict.planner.editor.directionBuy : dict.planner.editor.directionSell}
    </span>
  );
}

/** Readiness chip with an icon + text — state is never carried by color alone. */
export function ReadinessChip({ readiness, compact = false }: { readiness: PlanReadiness; compact?: boolean }) {
  const { dict } = useI18n();
  const R = dict.planner.readiness;
  const config =
    readiness.status === "READY"
      ? { Icon: CheckCircle2, className: "text-profit", label: R.READY, testid: "planner-readiness-ready" }
      : readiness.status === "BLOCKED"
        ? { Icon: OctagonX, className: "text-loss", label: R.BLOCKED, testid: "planner-readiness-blocked" }
        : { Icon: CircleDashed, className: "text-muted-foreground", label: R.NOT_READY, testid: "planner-readiness-not-ready" };
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.className)}
      data-testid={config.testid}
    >
      <config.Icon className="size-3.5" aria-hidden />
      {config.label}
      {!compact && (
        <span className="font-mono tabular-nums text-muted-foreground">
          {readiness.completed}/{readiness.total}
        </span>
      )}
      <span className="sr-only">{config.label}</span>
    </span>
  );
}

/** Stable server code → dict message, with the raw code as last resort. */
export function blockerMessage(dict: Dictionary, code: string): string {
  const map = dict.planner.blockers as Record<string, string>;
  return map[code] ?? code;
}

export function detailMessage(dict: Dictionary, code: string | null): string | null {
  if (!code) return null;
  const map = dict.planner.details as Record<string, string>;
  return map[code] ?? code;
}

/** "8 / 10" progress text composition (dict.* pattern — components compose). */
export function requiredProgressText(dict: Dictionary, done: number, total: number): string {
  return dict.planner.readiness.requiredProgress
    .replace("{done}", String(done))
    .replace("{total}", String(total));
}

export function countText(template: string, count: number): string {
  return template.replace("{count}", String(count));
}
