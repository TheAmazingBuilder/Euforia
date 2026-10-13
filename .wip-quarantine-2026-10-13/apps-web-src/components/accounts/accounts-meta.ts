import type {
  AccountType,
  SynchronizationStatus,
  TradingConnectionStatus,
  TradingProviderPermission,
} from "@cosmoz/shared";

/**
 * Accounts module — reusable status presentation (spec §54) and shared
 * metadata. Connection states, sync states and environments are NEVER
 * communicated by color alone: every badge pairs a dot/icon with explicit
 * text (spec §49).
 */

// ── Environment (spec §9 — Demo vs Live, visually + semantically distinct) ──

export const ENVIRONMENT_META: Record<
  AccountType,
  { label: string; long: string; className: string }
> = {
  DEMO: {
    label: "Demo",
    long: "Demo account — virtual funds",
    className: "border-dashed text-muted-foreground",
  },
  LIVE: {
    label: "Live",
    long: "Live account — real trading capital",
    className:
      "border-transparent bg-foreground text-background dark:bg-foreground dark:text-background",
  },
  PROP_FIRM: {
    label: "Prop",
    long: "Prop firm evaluation account",
    className: "border-transparent bg-accent text-accent-foreground",
  },
};

// ── Connection lifecycle (spec §27 — its own axis) ─────────────────────────

export const CONNECTION_META: Record<
  TradingConnectionStatus,
  { label: string; dotClass: string; pulse?: boolean }
> = {
  CONNECTED: {
    label: "Connected",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  CONNECTING: {
    label: "Connecting…",
    dotClass: "bg-amber-500 dark:bg-amber-400",
    pulse: true,
  },
  DISCONNECTED: {
    label: "Disconnected",
    dotClass: "bg-muted-foreground/50",
  },
  ERROR: {
    label: "Connection error",
    dotClass: "bg-red-500 dark:bg-red-400",
  },
};

// ── Synchronization lifecycle (spec §26, §55) ──────────────────────────────

export const SYNC_META: Record<
  SynchronizationStatus,
  { label: string; dotClass: string; pulse?: boolean; warn?: boolean }
> = {
  LIVE: {
    label: "Live",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  SYNCING: {
    label: "Syncing",
    dotClass: "bg-sky-500 dark:bg-sky-400",
    pulse: true,
  },
  DELAYED: {
    label: "Delayed",
    dotClass: "bg-amber-500 dark:bg-amber-400",
    warn: true,
  },
  STALE: {
    label: "Stale",
    dotClass: "bg-orange-500 dark:bg-orange-400",
    warn: true,
  },
  ERROR: {
    label: "Sync error",
    dotClass: "bg-red-500 dark:bg-red-400",
    warn: true,
  },
  UNKNOWN: {
    label: "Not synchronized",
    dotClass: "bg-muted-foreground/50",
  },
};

// ── Permissions (spec §16, §17 — read-only first) ──────────────────────────

export const PERMISSION_META: Record<TradingProviderPermission, string> = {
  READ_ACCOUNT: "Account information",
  READ_BALANCE: "Balance & equity",
  READ_EQUITY: "Equity",
  READ_POSITIONS: "Open positions",
  READ_ORDERS: "Orders",
  READ_DEALS: "Deals & executions",
  READ_HISTORY: "Trading history",
};

/** Execution permissions that Cosmoz intentionally does NOT request (§16). */
export const EXCLUDED_EXECUTION_PERMISSIONS = [
  "Order placement",
  "Order modification",
  "Position closing",
] as const;

/** Trust copy shown wherever connectivity is presented (spec §16). */
export const READ_ONLY_NOTICE =
  "Cosmoz uses read-only access to synchronize your trading data. It cannot place, modify, or close trades.";

export function statusTone(
  pnl: number,
): "text-emerald-600 dark:text-emerald-400" | "text-red-600 dark:text-red-400" | "text-muted-foreground" {
  if (pnl > 0) return "text-emerald-600 dark:text-emerald-400";
  if (pnl < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}
