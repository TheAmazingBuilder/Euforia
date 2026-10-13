"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatNumber, type KpiDelta } from "@cosmoz/shared";

import { Sparkline } from "@/components/dashboard/sparkline";
import { cn } from "@/lib/utils";

/** Signed display formatting for delta values ("0.12" → "+0.12"). */
export function signedFormat(value: string, digits: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  if (parsed === 0) return formatNumber(0, digits);
  return `${parsed > 0 ? "+" : "-"}${formatNumber(Math.abs(parsed), digits)}`;
}

/** Ledger delta: quiet mono ink where only the arrow carries semantic color —
 * the record stays calm; direction reads at a glance. `upIsGood: false`
 * flips the semantics for metrics where UP is bad (avg loss, drawdown). */
export function DeltaMark({
  delta,
  format,
  upIsGood = true,
}: {
  delta: KpiDelta;
  format: (value: string) => string;
  upIsGood?: boolean;
}) {
  if (delta.direction === "FLAT" || delta.value === null) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change vs previous period</span>
      </span>
    );
  }
  const Icon = delta.direction === "UP" ? ArrowUpRight : ArrowDownRight;
  const good = (delta.direction === "UP") === upIsGood;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono text-[11px] font-medium tabular-nums text-muted-foreground",
        good ? "[&_svg]:text-profit" : "[&_svg]:text-loss",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {format(delta.value)}
    </span>
  );
}

interface KpiCellProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  /** Optional — cells without a comparable baseline render no delta mark. */
  delta?: KpiDelta;
  formatDelta?: (value: string) => string;
  /** Semantic of the delta's direction (default: UP is good). */
  deltaUpIsGood?: boolean;
  sparkline?: string[];
  sparklineColor?: string;
  sparklineLabel?: string;
  /** Extra classes for the mono value itself (P&L inks, …). */
  valueClassName?: string;
  /** Bottom-slot visual (MiniBars / meters) replacing the sparkline spacer. */
  children?: React.ReactNode;
  /** "hero" = money cells of the first band (larger value + taller sparkline). */
  variant?: "default" | "hero";
  className?: string;
}

/**
 * One ruled cell of a stat strip — the atomic KPI unit shared by every
 * dashboard band (primary strip, performance strip, product band).
 * Layout: label row → value with its delta riding the baseline → sub →
 * sparkline pinned to the bottom so every cell shares the same rhythm.
 */
export function KpiCell({
  label,
  value,
  sub,
  delta,
  formatDelta,
  deltaUpIsGood,
  sparkline,
  sparklineColor = "currentColor",
  sparklineLabel,
  valueClassName,
  children,
  variant = "default",
  className,
}: KpiCellProps) {
  const hero = variant === "hero";
  return (
    <div className={cn("stat-cell flex flex-col gap-2", className)}>
      <span className="ledger-label">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span
          className={cn(
            "font-mono font-semibold tabular-nums tracking-tight",
            hero ? "text-2xl sm:text-[1.7rem] sm:leading-9" : "text-xl sm:text-2xl",
            valueClassName,
          )}
        >
          {value}
        </span>
        {delta && formatDelta ? (
          <DeltaMark delta={delta} format={formatDelta} upIsGood={deltaUpIsGood} />
        ) : null}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
      {children ? (
        <div className="mt-auto">{children}</div>
      ) : sparkline ? (
        <Sparkline
          points={sparkline}
          color={sparklineColor}
          className={cn("mt-auto w-full", hero ? "h-9" : "h-7")}
          ariaLabel={sparklineLabel}
        />
      ) : (
        <div className="mt-auto" />
      )}
    </div>
  );
}
