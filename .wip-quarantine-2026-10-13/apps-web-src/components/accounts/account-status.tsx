"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AccountsDict } from "@/i18n/dictionaries/en/accounts";
import type {
  AccountType,
  SynchronizationStatus,
  TradingConnectionStatus,
  TradingProviderPermission,
} from "@cosmoz/shared";

/**
 * Reusable status presentation for the Accounts module (§54) — one place
 * owns how connection, synchronization, environment and permission states
 * render, so the vocabulary cannot drift between surfaces.
 * Status NEVER relies on color alone: every badge carries its text label
 * (module mandate §49) and an sr-only spelled-out state.
 */

const CONNECTION_DOT: Record<TradingConnectionStatus, string> = {
  CONNECTED: "bg-profit",
  CONNECTING: "bg-warning",
  DISCONNECTED: "bg-muted-foreground/60",
  ERROR: "bg-loss",
};

const SYNC_DOT: Record<SynchronizationStatus, string> = {
  LIVE: "bg-profit",
  SYNCING: "bg-accent",
  DELAYED: "bg-warning",
  STALE: "bg-warning",
  ERROR: "bg-loss",
  UNKNOWN: "bg-muted-foreground/60",
};

/** Small status chip: semantic dot + normal-case sans label. */
function StatusChip({
  dotClassName,
  label,
  testid,
  pulse = false,
}: {
  dotClassName: string;
  label: string;
  testid?: string;
  pulse?: boolean;
}) {
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center gap-1.5 text-xs text-foreground"
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", dotClassName, pulse && "animate-pulse")}
      />
      <span className="sr-only">Status: </span>
      {label}
    </span>
  );
}

export function ConnectionStatusBadge({
  status,
  dict,
  testid,
}: {
  status: TradingConnectionStatus;
  dict: AccountsDict;
  testid?: string;
}) {
  return (
    <StatusChip
      dotClassName={CONNECTION_DOT[status]}
      label={dict.status.connection[status]}
      testid={testid}
      pulse={status === "CONNECTING"}
    />
  );
}

export function SyncStatusBadge({
  status,
  dict,
  testid,
}: {
  status: SynchronizationStatus;
  dict: AccountsDict;
  testid?: string;
}) {
  return (
    <StatusChip
      dotClassName={SYNC_DOT[status]}
      label={dict.status.synchronization[status]}
      testid={testid}
      pulse={status === "SYNCING"}
    />
  );
}

/**
 * Environment badge — DEMO and LIVE must stay visually and semantically
 * distinct (§9): LIVE/PROP_FIRM get the ink treatment (stronger border,
 * full ink), DEMO stays muted mono.
 */
export function EnvironmentBadge({
  environment,
  dict,
  testid,
}: {
  environment: AccountType;
  dict: AccountsDict;
  testid?: string;
}) {
  const label = dict.status.environment[environment];
  const strong = environment !== "DEMO";
  return (
    <span
      data-testid={testid}
      data-environment={environment}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        strong
          ? "border-foreground/70 text-foreground"
          : "border-border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/** Read-only access scope marker — the module's core trust signal. */
export function ReadOnlyBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <ShieldCheck className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Provider permission label mapping (READ_* → human words). */
export function permissionLabel(dict: AccountsDict, permission: TradingProviderPermission): string {
  const labels: Record<TradingProviderPermission, string> = {
    READ_ACCOUNT: dict.wizard.permissionsStep.grantedItems.account,
    READ_BALANCE: dict.wizard.permissionsStep.grantedItems.balance,
    READ_EQUITY: dict.wizard.permissionsStep.grantedItems.equity,
    READ_POSITIONS: dict.wizard.permissionsStep.grantedItems.positions,
    READ_ORDERS: dict.wizard.permissionsStep.grantedItems.orders,
    READ_DEALS: dict.wizard.permissionsStep.grantedItems.deals,
    READ_HISTORY: dict.wizard.permissionsStep.grantedItems.history,
  };
  return labels[permission];
}
