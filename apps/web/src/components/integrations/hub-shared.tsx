"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  Landmark,
  Newspaper,
  Radio,
  TrendingUp,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { IntegrationKind, IntegrationStatus } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared presentation atoms for the Integration Hub. Semantic tokens only;
 * JetBrains Mono (`font-mono`) for every number/timestamp.
 */

export const KIND_META: Record<
  IntegrationKind,
  { label: string; icon: LucideIcon }
> = {
  BROKER: { label: "Broker", icon: Landmark },
  EXCHANGE: { label: "Exchange", icon: ArrowLeftRight },
  MARKET_DATA: { label: "Market data", icon: Radio },
  ECONOMIC: { label: "Economic data", icon: CalendarClock },
  NEWS: { label: "News", icon: Newspaper },
  CHARTING: { label: "Charting", icon: TrendingUp },
  NOTIFICATION: { label: "Notifications", icon: BellRing },
  EXTERNAL: { label: "External", icon: Webhook },
};

export const STATUS_META: Record<
  IntegrationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  CONNECTED: { label: "Connected", variant: "default" },
  SYNCING: { label: "Syncing", variant: "secondary" },
  DEGRADED: { label: "Degraded", variant: "secondary" },
  DISCONNECTED: { label: "Disconnected", variant: "outline" },
  AUTH_REQUIRED: { label: "Authentication required", variant: "destructive" },
  ERROR: { label: "Error", variant: "destructive" },
};

export function StatusBadge({
  status,
  testid,
}: {
  status: IntegrationStatus;
  testid?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} data-testid={testid}>
      {meta.label}
    </Badge>
  );
}

export function KindChip({ kind }: { kind: IntegrationKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Compact sync summary - the §13 bookkeeping, one readable line. */
export function SyncLine({
  sync,
  latencyMs,
  className,
}: {
  sync: {
    lastSuccessAt: string | null;
    lastDurationMs: number | null;
    recordsProcessed: number;
    recordsFailed: number;
    cursor: string | null;
    nextRetryAt: string | null;
  };
  latencyMs: number | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span>
        last sync{" "}
        <span className="text-foreground">
          {sync.lastSuccessAt === null ? "never" : sync.lastSuccessAt.slice(11, 19)} UTC
        </span>
      </span>
      {latencyMs !== null && (
        <span>
          latency <span className="text-foreground">{latencyMs} ms</span>
        </span>
      )}
      <span>
        records{" "}
        <span className="text-foreground">
          {sync.recordsProcessed.toLocaleString("en-US")}
          {sync.recordsFailed > 0 ? ` · ${sync.recordsFailed} failed` : ""}
        </span>
      </span>
      {sync.cursor !== null && (
        <span>
          cursor <span className="text-foreground">{sync.cursor}</span>
        </span>
      )}
      {sync.nextRetryAt !== null && (
        <span>
          next retry{" "}
          <span className="text-foreground">{sync.nextRetryAt.slice(11, 19)} UTC</span>
        </span>
      )}
    </div>
  );
}

export const PERMISSION_LABELS: Record<string, string> = {
  READ_ACCOUNT: "Read account",
  READ_POSITIONS: "Read positions",
  READ_ORDERS: "Read orders",
  READ_EXECUTIONS: "Read executions",
  READ_MARKET_DATA: "Read market data",
  READ_ECONOMIC_DATA: "Read economic data",
  READ_NEWS: "Read news",
  WEBHOOK_INBOUND: "Inbound webhooks",
};
