"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Freshness, MonitoringStatus } from "@cosmoz/shared";

/**
 * Shared display primitives for the Monitoring center. Status colors stay on
 * semantic tokens (destructive reserved for DOWN/stale breaches, P&L green/
 * red never used here); numbers always render in font-mono.
 */

export const statusVariant: Record<
  MonitoringStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  OPERATIONAL: "default",
  DEGRADED: "secondary",
  DOWN: "destructive",
  UNKNOWN: "outline",
};

export function StatusBadge({
  status,
  className,
  testId,
}: {
  status: MonitoringStatus;
  className?: string;
  testId?: string;
}) {
  return (
    <Badge variant={statusVariant[status]} className={cn("gap-1", className)} data-testid={testId}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          status === "OPERATIONAL" && "bg-emerald-500",
          status === "DEGRADED" && "bg-amber-500",
          status === "DOWN" && "bg-destructive",
          status === "UNKNOWN" && "bg-muted-foreground",
        )}
      />
      {status === "OPERATIONAL" ? "Operational" : status === "DEGRADED" ? "Degraded" : status === "DOWN" ? "Down" : "Unknown"}
    </Badge>
  );
}

export function FreshnessBadge({
  freshness,
  className,
}: {
  freshness: Freshness;
  className?: string;
}) {
  const variant =
    freshness === "LIVE"
      ? "default"
      : freshness === "DELAYED"
        ? "secondary"
        : freshness === "STALE"
          ? "destructive"
          : "outline";
  return (
    <Badge variant={variant} className={className}>
      {freshness === "UNKNOWN" ? "No data" : freshness}
    </Badge>
  );
}

/** A label/value metric line - value always mono. */
export function MetricLine({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-mono text-xs tabular-nums",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** The observation that justifies a status (§4) - rendered as a quiet note. */
export function EvidenceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/70">Evidence · </span>
      {children}
    </p>
  );
}

/** Age in human form from epoch ms - "320 ms ago", "4 s ago", "2 min ago". */
export function ageLabel(ageMs: number | null): string {
  if (ageMs === null) return "-";
  if (ageMs < 1_000) return `${Math.max(0, Math.round(ageMs))} ms ago`;
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)} s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)} min ago`;
  return `${Math.floor(ageMs / 3_600_000)} h ago`;
}

/**
 * Age of an ISO timestamp against the useNowMs clock (null-safe). Date.now()
 * is impure and forbidden during render - panels always derive ages from the
 * clock tick through this helper.
 */
export function ageFromIso(iso: string | null, nowMs: number | null): number | null {
  if (iso === null || nowMs === null) return null;
  return nowMs - Date.parse(iso);
}

/**
 * Clock context - the view provides its useNowMs tick once; every panel
 * derives ages from it instead of calling Date.now() during render.
 */
export const NowClockContext = React.createContext<number | null>(null);

export function useNowClock(): number | null {
  return React.useContext(NowClockContext);
}

/** Duration in human form. */
export function durationLabel(msValue: number | null): string {
  if (msValue === null) return "-";
  if (msValue < 1_000) return `${Math.round(msValue)} ms`;
  if (msValue < 60_000) return `${(msValue / 1_000).toFixed(1)} s`;
  return `${Math.floor(msValue / 60_000)} min ${Math.round((msValue % 60_000) / 1_000)} s`;
}
