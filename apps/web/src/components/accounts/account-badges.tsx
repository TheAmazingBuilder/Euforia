"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleSlash,
  Compass,
  HelpCircle,
  Loader2,
  RefreshCcw,
  TriangleAlert,
  WifiOff,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { connectionStatusMeta, syncStatusMeta } from "@/lib/api/queries";

/**
 * Presentation mapping for the two status axes (Phase 02). Domain values are
 * backend-owned; these components only translate them into label + icon +
 * tone. Icon + text always travel together - color is never the only signal.
 */

export type Tone = "positive" | "warning" | "negative" | "muted" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  positive: "border-transparent bg-profit/10 text-profit",
  warning: "border-transparent bg-warning/10 text-warning",
  negative: "border-transparent bg-loss/10 text-loss",
  muted: "border-border bg-muted text-muted-foreground",
  info: "border-transparent bg-accent/10 text-accent",
};

const CONNECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CONNECTED: CheckCircle2,
  CONNECTING: Loader2,
  ERROR: XCircle,
  DISCONNECTED: WifiOff,
};

const SYNC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SYNCING: RefreshCcw,
  LIVE: CheckCircle2,
  DELAYED: TriangleAlert,
  STALE: Compass,
  ERROR: XCircle,
  UNKNOWN: HelpCircle,
};

export function ConnectionStatusBadge({
  status,
  className,
  testId,
}: {
  status: string;
  className?: string;
  testId?: string;
}) {
  const meta = connectionStatusMeta(status);
  const Icon = CONNECTION_ICONS[status] ?? CircleSlash;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", TONE_CLASSES[meta.tone], className)}
      data-testid={testId}
      data-status={status}
    >
      <Icon className={cn("size-3", status === "CONNECTING" && "animate-spin")} aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function SyncStatusBadge({
  status,
  className,
  testId,
}: {
  status: string;
  className?: string;
  testId?: string;
}) {
  const meta = syncStatusMeta(status);
  const Icon = SYNC_ICONS[status] ?? HelpCircle;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", TONE_CLASSES[meta.tone], className)}
      data-testid={testId}
      data-status={status}
    >
      <Icon className={cn("size-3", status === "SYNCING" && "animate-spin")} aria-hidden />
      {meta.label}
    </Badge>
  );
}

/**
 * The simulated-provider stamp - rendered on EVERY surface backed by a
 * provider with isMock: true. Financial data must never read as real while
 * the mock adapter produced it (Phase 02 acceptance: no fixture balance
 * renders without a visible demo marker).
 */
export function SimulatedProviderBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border-warning/40 bg-warning/10 font-medium text-warning", className)}
      data-testid="account-simulated-badge"
    >
      <TriangleAlert className="size-3" aria-hidden />
      Simulated provider
    </Badge>
  );
}

/** Environment stamp - Demo / Live / Prop (AccountSwitcher convention). */
export function EnvironmentStamp({ environment }: { environment: string }) {
  const label = environment === "PROP_FIRM" ? "PROP" : environment;
  return (
    <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}
