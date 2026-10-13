"use client";

import * as React from "react";
import type {
  IntegrationCategory,
  IntegrationScope,
  IntegrationState,
  IntegrationStatus,
  IntegrationView,
} from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Integration Hub shared atoms (t49). Ruled-ledger primitives only: hairline
 * rows, mono data, one ink per meaning. No icon tiles, no glow, no pills
 * without semantics — the status chip is the single piece of status chrome.
 */

// ── Status vocabulary (§5) ───────────────────────────────────────────────────

export const STATUS_META: Record<
  IntegrationStatus,
  { label: string; dot: string; text: string; ring: string }
> = {
  CONNECTED: { label: "Connected", dot: "bg-profit", text: "text-profit", ring: "border-profit/40 bg-profit/10" },
  SYNCING: { label: "Syncing", dot: "bg-accent", text: "text-accent", ring: "border-accent/40 bg-accent/10" },
  DEGRADED: { label: "Degraded", dot: "bg-warning", text: "text-warning", ring: "border-warning/40 bg-warning/10" },
  DISCONNECTED: { label: "Disconnected", dot: "bg-muted-foreground/40", text: "text-muted-foreground", ring: "border-border bg-transparent" },
  AUTH_REQUIRED: { label: "Auth required", dot: "bg-warning", text: "text-warning", ring: "border-warning/40 bg-warning/10" },
  ERROR: { label: "Error", dot: "bg-loss", text: "text-loss", ring: "border-loss/40 bg-loss/10" },
};

export function StatusPill({
  status,
  className,
  testId,
}: {
  status: IntegrationStatus;
  className?: string;
  testId?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
        meta.ring,
        meta.text,
        className,
      )}
      data-testid={testId}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ── Scopes (§19) ─────────────────────────────────────────────────────────────

export const SCOPE_LABEL: Record<IntegrationScope, string> = {
  READ_ACCOUNT: "Read account",
  READ_POSITIONS: "Read positions",
  READ_ORDERS: "Read orders",
  READ_EXECUTIONS: "Read executions",
  READ_MARKET_DATA: "Read market data",
  READ_ECONOMIC_DATA: "Read economic data",
  READ_NEWS: "Read news",
  SEND_NOTIFICATIONS: "Send notifications",
  EXPORT_BACKUP: "Export backup",
};

export function ScopeChips({ scopes, className }: { scopes: IntegrationScope[]; className?: string }) {
  if (scopes.length === 0) {
    return (
      <span className={cn("font-mono text-[11px] text-muted-foreground", className)}>
        No scopes required
      </span>
    );
  }
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Granted permissions">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground"
        >
          {SCOPE_LABEL[scope]}
        </span>
      ))}
    </span>
  );
}

// ── Time + staleness (§23) ───────────────────────────────────────────────────

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return TIME_FORMAT.format(new Date(iso));
}

export function formatRelative(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const deltaMs = Math.max(nowMs - new Date(iso).getTime(), 0);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** §23 — a scheduled integration that missed its sync window flags as stale. */
export function isStale(state: IntegrationState, nowMs: number): boolean {
  const { staleAfterMs } = state.health;
  if (staleAfterMs === null || state.sync.lastSuccessAt === null) return false;
  if (state.status === "DISCONNECTED" || state.status === "AUTH_REQUIRED") return false;
  return nowMs - new Date(state.sync.lastSuccessAt).getTime() > staleAfterMs;
}

// ── Latency sparkline (§23 health surface) ───────────────────────────────────

export function LatencySpark({
  series,
  degraded,
  label,
}: {
  series: number[];
  degraded?: boolean;
  label: string;
}) {
  const width = 72;
  const height = 22;
  const max = Math.max(...series, 1);
  const min = Math.min(...series);
  const range = Math.max(max - min, 1);
  const coords = series.map((value, index) => {
    const x = series.length > 1 ? (index / (series.length - 1)) * width : width;
    const y = height - 2 - ((value - min) / range) * (height - 4);
    return [x, y] as const;
  });
  const path = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords.at(-1);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={cn("shrink-0", degraded ? "text-warning" : "text-muted-foreground/70")}
    >
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.25" />
      {last ? (
        <circle cx={last[0]} cy={last[1]} r="1.75" fill="currentColor" className="text-foreground" />
      ) : null}
    </svg>
  );
}

// ── Provider identity + ruled meta (static catalog half) ─────────────────────

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  TRADING_ACCOUNT: "Trading account",
  BROKER: "Broker",
  EXCHANGE: "Exchange",
  MARKET_DATA: "Market data",
  ECONOMIC_DATA: "Economic data",
  MARKET_NEWS: "Market news",
  CHARTING: "Charting",
  COMMUNICATION: "Communication",
  NOTIFICATIONS: "Notifications",
  EXTERNAL_SERVICE: "External service",
};

export function ProviderIdentity({
  view,
  compact = false,
}: {
  view: IntegrationView;
  compact?: boolean;
}) {
  const { provider } = view;
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p
          className={cn(
            "font-heading font-semibold tracking-tight text-foreground",
            compact ? "text-sm" : "text-sm sm:text-base",
          )}
        >
          {provider.name}
        </p>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {provider.vendor}
        </span>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {CATEGORY_LABEL[provider.category]}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{provider.tagline}</p>
    </div>
  );
}

/** Licensing / retention / rate limit / retry — the provider's operating rules. */
export function ProviderMeta({ view }: { view: IntegrationView }) {
  const { provider } = view;
  const cells: { label: string; value: string }[] = [
    { label: "Licensing", value: `${provider.licensing.level} — ${provider.licensing.note}` },
    { label: "Retention", value: provider.retention },
    { label: "Rate limit", value: provider.rateLimit },
    { label: "Retry policy", value: provider.retryPolicy },
  ];
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
      {cells.map((cell) => (
        <div key={cell.label} className="space-y-1 bg-surface px-3 py-2.5">
          <dt className="ledger-label text-[10px]">{cell.label}</dt>
          <dd className="font-mono text-[11px] leading-relaxed text-foreground/90">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Sync + health readouts (§13) ─────────────────────────────────────────────

export function SyncReadout({
  view,
  nowMs,
  className,
}: {
  view: IntegrationView;
  nowMs: number;
  className?: string;
}) {
  const { state } = view;
  const stale = isStale(state, nowMs);
  return (
    <div className={cn("flex items-start gap-5 font-mono text-xs tabular-nums", className)}>
      <div className="space-y-0.5">
        <p className="ledger-label text-[10px]">LAST SYNC</p>
        <p className="text-foreground" title={formatTime(state.sync.lastSuccessAt)}>
          {formatRelative(state.sync.lastSuccessAt, nowMs)}
          {stale ? <span className="ml-1.5 font-semibold text-warning">STALE</span> : null}
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="ledger-label text-[10px]">RECORDS</p>
        <p className="text-foreground">
          {state.sync.recordsProcessed === null
            ? "—"
            : `${state.sync.recordsProcessed}${
                state.sync.recordsFailed ? ` · ${state.sync.recordsFailed} failed` : ""
              }`}
        </p>
      </div>
      <div className="hidden space-y-0.5 sm:block">
        <p className="ledger-label text-[10px]">RETRIES</p>
        <p className={cn(state.sync.retryCount > 0 ? "text-warning" : "text-foreground")}>
          {state.sync.retryCount}
        </p>
      </div>
    </div>
  );
}

export function HealthReadout({ view, className }: { view: IntegrationView; className?: string }) {
  const { health } = view.state;
  const latest = health.latencyMs ?? health.latencySeries.at(-1) ?? null;
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <LatencySpark
        series={health.latencySeries.length > 1 ? health.latencySeries : [0, latest ?? 0]}
        degraded={latest !== null && latest > 200}
        label={`Latency samples for ${view.provider.name}`}
      />
      <div className="space-y-0.5 font-mono text-xs tabular-nums">
        <p className="ledger-label text-[10px]">LATENCY</p>
        <p className="text-foreground">{latest === null ? "—" : `${latest} ms`}</p>
      </div>
      {health.quotaUsed !== null && health.quotaLimit !== null ? (
        <div className="hidden space-y-0.5 font-mono text-xs tabular-nums sm:block">
          <p className="ledger-label text-[10px]">QUOTA</p>
          <p className="text-foreground">
            {health.quotaUsed}/{health.quotaLimit}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── Hub-wide action wiring (dialogs live once, rows raise intents) ──────────

export interface HubActions {
  openConnect: (view: IntegrationView) => void;
  openTest: (view: IntegrationView) => void;
  openDisconnect: (view: IntegrationView) => void;
  syncNow: (view: IntegrationView) => void;
  /** Provider currently running a sync — its row renders the SYNCING state. */
  syncingId: string | null;
}

const HubActionsContext = React.createContext<HubActions | null>(null);

export function HubActionsProvider({
  value,
  children,
}: {
  value: HubActions;
  children: React.ReactNode;
}) {
  return <HubActionsContext.Provider value={value}>{children}</HubActionsContext.Provider>;
}

export function useHubActions(): HubActions {
  const context = React.useContext(HubActionsContext);
  if (!context) throw new Error("useHubActions must be used inside the Integration Hub");
  return context;
}
