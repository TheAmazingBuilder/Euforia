"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Database,
  Globe,
  Radio,
  Server,
  Webhook,
} from "lucide-react";

import type { AlertSeverity, FreshnessConfig, FreshnessPhase, HealthStatus, SystemEventKind, SystemEventLevel } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Shared visual atoms for the Monitoring console. Every status shown here is
 * computed from real evidence server-side (§4) — the atoms only render what
 * the snapshot asserts, with the evidence line right beside it.
 */

// ── Status vocabulary ────────────────────────────────────────────────────────

export const HEALTH_META: Record<HealthStatus, { label: string; dot: string; text: string; chip: string }> = {
  operational: { label: "Operational", dot: "bg-profit", text: "text-profit", chip: "border-profit/40 bg-profit/10" },
  degraded: { label: "Degraded", dot: "bg-warning", text: "text-warning", chip: "border-warning/40 bg-warning/10" },
  down: { label: "Down", dot: "bg-loss", text: "text-loss", chip: "border-loss/40 bg-loss/10" },
  unknown: { label: "Unknown", dot: "bg-muted-foreground", text: "text-muted-foreground", chip: "border-border bg-muted" },
};

export function HealthPill({ status, className }: { status: HealthStatus; className?: string }) {
  const meta = HEALTH_META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
        meta.chip,
        meta.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        severity === "critical" && "border-loss/40 bg-loss/10 text-loss",
        severity === "warning" && "border-warning/40 bg-warning/10 text-warning",
        severity === "info" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {severity}
    </span>
  );
}

const LEVEL_STYLE: Record<SystemEventLevel, string> = {
  INFO: "border-border bg-muted text-muted-foreground",
  WARN: "border-warning/40 bg-warning/10 text-warning",
  ERROR: "border-loss/40 bg-loss/10 text-loss",
};

export function LevelBadge({ level }: { level: SystemEventLevel }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide", LEVEL_STYLE[level])}>
      {level}
    </span>
  );
}

/** §6/§17 — LIVE / DELAYED / STALE badge from the configurable thresholds. */
export function FreshnessBadge({ phase }: { phase: FreshnessPhase }) {
  const meta = {
    live: { label: "LIVE", className: "border-profit/40 bg-profit/10 text-profit" },
    delayed: { label: "DELAYED", className: "border-warning/40 bg-warning/10 text-warning" },
    stale: { label: "STALE DATA", className: "border-loss/40 bg-loss/10 text-loss" },
    unknown: { label: "NO DATA", className: "border-border bg-muted text-muted-foreground" },
  }[phase];
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide", meta.className)}>
      {meta.label}
    </span>
  );
}

/** §6/§17 — classify a data age against the configurable thresholds. */
export function classifyFreshness(ageMs: number | null, config: FreshnessConfig): FreshnessPhase {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  if (ageMs <= config.liveMaxMs) return "live";
  if (ageMs <= config.delayedMaxMs) return "delayed";
  return "stale";
}

/** Compact age copy — "320ms ago", "4s ago", "2m ago". */
export function ageLabel(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "—";
  if (ageMs < 1_000) return `${Math.max(0, Math.round(ageMs / 100)) * 100}ms ago`;
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return `${Math.floor(ageMs / 86_400_000)}d ago`;
}

// ── Layout atoms ─────────────────────────────────────────────────────────────

export function Panel({ title, right, children, className, testId }: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section aria-label={title} data-testid={testId} className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="ledger-label">{title}</p>
        {right}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** §4 — the evidence line that justifies a status, rendered as first-class UI. */
export function EvidenceLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Evidence — </span>
      {children}
    </p>
  );
}

export function MetricCell({ label, value, tone, mono = true }: {
  label: string;
  value: React.ReactNode;
  tone?: "profit" | "loss" | "warning" | "muted";
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="ledger-label text-[10px]">{label}</p>
      <p className={cn(
        "mt-0.5 truncate text-sm font-semibold tabular-nums",
        mono && "font-mono",
        tone === "profit" && "text-profit",
        tone === "loss" && "text-loss",
        tone === "warning" && "text-warning",
        (!tone || tone === "muted") && "text-foreground",
      )}>
        {value}
      </p>
    </div>
  );
}

export function StatusDot({ status }: { status: HealthStatus }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", HEALTH_META[status].dot)} aria-hidden="true" />;
}

// ── System events (§15) ──────────────────────────────────────────────────────

export const EVENT_KIND_META: Record<SystemEventKind, { label: string }> = {
  "connection-change": { label: "Connection change" },
  "sync-failure": { label: "Sync failure" },
  "provider-change": { label: "Provider change" },
  "config-change": { label: "Config change" },
  "system-error": { label: "System error" },
  degradation: { label: "Degradation" },
  recovery: { label: "Recovery" },
};

// ── Misc formatting ──────────────────────────────────────────────────────────

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Status-code distribution as a proportional stacked bar (§9). */
export function StatusCodeBars({ statusCodes }: { statusCodes: Record<string, number> }) {
  const entries = Object.entries(statusCodes).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No requests in this window yet.</p>;
  }
  const tone = (code: string): string =>
    code.startsWith("2") ? "bg-profit" : code.startsWith("4") ? (code === "429" ? "bg-warning" : "bg-loss") : code.startsWith("5") ? "bg-loss" : "bg-muted-foreground";
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Status code distribution">
        {entries.map(([code, count]) => (
          <div key={code} className={cn("h-full", tone(code))} style={{ width: `${(count / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map(([code, count]) => (
          <span key={code} className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span className={cn("size-2 rounded-full", tone(code))} aria-hidden="true" />
            {code} × {count}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Icon for a component id — small, muted, consistent. */
export function ComponentGlyph({ id, className }: { id: string; className?: string }) {
  const glyph =
    id === "api" ? Globe :
    id === "database" ? Database :
    id === "market-data" ? Radio :
    id === "websockets" ? Radio :
    id === "brokers" ? Server :
    id === "queue" ? Webhook :
    id === "notifications" ? AlertTriangle :
    id === "integrations" ? Webhook :
    Server;
  return React.createElement(glyph, { className: cn("size-4 shrink-0 text-muted-foreground", className), "aria-hidden": "true" });
}

export function TrendArrow({ dir }: { dir: "up" | "down" }) {
  return dir === "up"
    ? <ArrowUpRight className="size-3.5 text-loss" aria-hidden="true" />
    : <ArrowDownRight className="size-3.5 text-profit" aria-hidden="true" />;
}

export function AckedMark() {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Check className="size-3" aria-hidden="true" /> Acknowledged
    </span>
  );
}
