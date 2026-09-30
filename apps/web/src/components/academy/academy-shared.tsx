"use client";

import * as React from "react";
import {
  Activity,
  Brain,
  CandlestickChart,
  ChartColumn,
  Coins,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  ShieldAlert,
  Swords,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import type { AcademyLevel } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Shared Academy primitives — category icon registry, level badge and the
 * ruled progress bar. Icon names arrive from the API as strings; this
 * registry is the single client-side mapping.
 */

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Coins,
  ShieldAlert,
  TrendingUp,
  Activity,
  CandlestickChart,
  ChartColumn,
  Gauge,
  Swords,
  Layers,
  Brain,
  GitBranch,
  FlaskConical,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = CATEGORY_ICONS[icon] ?? FlaskConical;
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

const LEVEL_LABELS: Record<AcademyLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export function LevelBadge({ level, className }: { level: AcademyLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        level === "BEGINNER" && "border-profit/40 text-profit",
        level === "INTERMEDIATE" && "border-warning/40 text-warning",
        level === "ADVANCED" && "border-loss/40 text-loss",
        className,
      )}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

/** Ruled progress bar — hairline track, ink fill, mono percentage outside. */
export function ProgressBar({
  percent,
  className,
  testid,
  label,
}: {
  percent: number;
  className?: string;
  testid?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${clamped}%` }} data-testid={testid} />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{clamped}%</span>
    </div>
  );
}

/** Section heading in the ledger annotation style. */
export function AcademySectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("ledger-label", className)}>{children}</h2>;
}
