"use client";

import * as React from "react";
import {
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  OctagonAlert,
  Timer,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import type {
  AccountType,
  Currency,
  SynchronizationStatus,
  TradingConnectionStatus,
} from "@cosmoz/shared";
import { formatMoney } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Accounts presentation atoms (Accounts prompt §54) — the ONLY place where
 * connection / synchronization / environment status is rendered, so the
 * module can never show two different visual languages for the same state.
 *
 * Design (Le Registre): environments are rubber stamps; statuses are dot +
 * icon + text (never color-only — §49); numerals stay mono and tabular.
 */

// ── Formatting ───────────────────────────────────────────────────────────────

/** Account-currency money, always 2 digits — §53 precision, never rounded away. */
export const money = (value: string | null | undefined, currency: Currency): string =>
  formatMoney(value, currency, { digits: 2 });

/** Relative freshness ("just now", "42s ago", "3m ago", "1h 04m ago", date). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `${hours}h ${String(rest).padStart(2, "0")}m ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

// ── Environment badge (rubber stamp — DEMO / LIVE / PROP) ────────────────────

const ENVIRONMENT_META: Record<AccountType, { label: string; stamp: string; title: string }> = {
  DEMO: { label: "Demo", stamp: "stamp-ink", title: "Demo account — virtual funds" },
  LIVE: { label: "Live", stamp: "stamp-accent", title: "Live account — real trading capital" },
  PROP_FIRM: { label: "Prop", stamp: "stamp-warn", title: "Prop-firm challenge account" },
};

export function EnvironmentBadge({ environment }: { environment: AccountType }) {
  const meta = ENVIRONMENT_META[environment];
  return (
    <span
      data-testid="account-environment"
      data-environment={environment}
      title={meta.title}
      className={cn("stamp -rotate-1", meta.stamp)}
    >
      {meta.label}
    </span>
  );
}

// ── Connection status (§27 — its own axis, never merged with sync) ───────────

export function ConnectionStatus({
  status,
  className,
}: {
  status: TradingConnectionStatus;
  className?: string;
}) {
  const meta: Record<
    TradingConnectionStatus,
    { label: string; icon: React.ReactNode; dot: string }
  > = {
    CONNECTED: {
      label: "Connected",
      icon: null,
      dot: "bg-profit",
    },
    CONNECTING: {
      label: "Connecting",
      icon: <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />,
      dot: "bg-warning",
    },
    DISCONNECTED: {
      label: "Disconnected",
      icon: <Unplug className="size-3.5" aria-hidden="true" />,
      dot: "bg-muted-foreground/40",
    },
    ERROR: {
      label: "Connection error",
      icon: <OctagonAlert className="size-3.5" aria-hidden="true" />,
      dot: "bg-loss",
    },
  };
  const state = meta[status];
  return (
    <span
      data-testid="account-connection-status"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        status === "CONNECTED"
          ? "text-foreground"
          : status === "ERROR"
            ? "text-loss"
            : "text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", state.dot)} />
      {state.icon}
      {state.label}
    </span>
  );
}

// ── Synchronization status (§26 — LIVE/SYNCING/DELAYED/STALE/ERROR) ──────────

export function SyncStatus({
  status,
  lastSyncAt,
  className,
}: {
  status: SynchronizationStatus;
  lastSyncAt: string | null;
  className?: string;
}) {
  const meta: Record<
    SynchronizationStatus,
    { label: string; icon: React.ReactNode; dot: string; muted?: boolean }
  > = {
    LIVE: {
      label: "Live",
      icon: null,
      dot: "bg-profit",
    },
    SYNCING: {
      label: "Syncing",
      icon: <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />,
      dot: "bg-warning",
    },
    DELAYED: {
      label: "Delayed",
      icon: <Timer className="size-3.5" aria-hidden="true" />,
      dot: "bg-warning",
    },
    STALE: {
      label: "Stale",
      icon: <TriangleAlert className="size-3.5" aria-hidden="true" />,
      dot: "bg-muted-foreground/40",
      muted: true,
    },
    ERROR: {
      label: "Sync error",
      icon: <OctagonAlert className="size-3.5" aria-hidden="true" />,
      dot: "bg-loss",
    },
    UNKNOWN: {
      label: "Not synced yet",
      icon: <CircleDashed className="size-3.5" aria-hidden="true" />,
      dot: "bg-muted-foreground/40",
      muted: true,
    },
  };
  const state = meta[status];
  return (
    <span
      data-testid="account-sync-status"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        state.muted ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", state.dot)} />
      {state.icon}
      {state.label}
      <span className="text-muted-foreground">· Synced {relativeTime(lastSyncAt)}</span>
    </span>
  );
}

// ── Read-only trust line (§16 — the critical trust feature) ──────────────────

export function ReadOnlyNotice({ className }: { className?: string }) {
  return (
    <p
      data-testid="accounts-read-only-notice"
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-profit" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">Read-only access.</span>{" "}
        Cosmoz synchronizes your trading data — it cannot place, modify, or close
        trades. Credentials never leave the backend.
      </span>
    </p>
  );
}
