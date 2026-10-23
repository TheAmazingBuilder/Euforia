"use client";

import * as React from "react";

import { Bell, BellOff, RotateCcw, Trash2 } from "lucide-react";

import type { OryonAlert } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { useFeedStatus } from "@/lib/realtime/market";
import { cn } from "@/lib/utils";

import { useOryonAlerts } from "@/components/oryon/oryon-alerts-context";

/**
 * Oryon price-alert management panel (Phase 5 spec §8) — lives in the
 * EXISTING utility rail as a third tab (no new top-level navigation).
 *
 * Honest states: empty list, evaluating (feed live), paused (feed offline —
 * the client cannot evaluate what it cannot see), plus the per-alert
 * lifecycle chips (Active / Triggered / Disabled). The scope note states the
 * integration boundary in plain copy: browser-local records, evaluated only
 * while the workspace is open, in-app notification only.
 *
 * Actions mirror what the actual boundary can safely perform: re-arm,
 * enable/disable, delete. There is NO edit control implying server-side
 * persistence, and a failed local operation is impossible to mis-present —
 * the store only commits what it validated.
 */
export function OryonAlertsPanel() {
  const dict = useDict();
  const S = dict.oryon.alerts;
  const { store } = useOryonAlerts();
  const { phase } = useFeedStatus();
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot);

  const alerts = React.useMemo(() => sortAlerts(snapshot.alerts), [snapshot.alerts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4" data-testid="oryon-alerts-panel">
      <div className="mb-3 flex items-center gap-2">
        <span
          data-testid="oryon-alerts-feed-status"
          data-phase={phase}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            phase === "live"
              ? "border-border bg-surface-raised text-foreground"
              : "border-border bg-surface text-muted-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              phase === "live" ? "bg-primary" : "bg-muted-foreground/60",
            )}
          />
          {phase === "live" ? S.feedLive : S.feedPaused}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center" data-testid="oryon-alerts-empty">
          <p className="text-xs font-medium text-foreground">{S.empty}</p>
          <p className="text-[11px] text-muted-foreground">{S.emptyHint}</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] leading-snug text-muted-foreground">{S.scopeNote}</p>
    </div>
  );
}

/** Triggered first (recent first), then active, then disabled — stable. */
function sortAlerts(alerts: readonly OryonAlert[]): OryonAlert[] {
  const rank = (alert: OryonAlert): number =>
    alert.status === "triggered" ? 0 : alert.status === "active" ? 1 : 2;
  return [...alerts].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (a.status === "triggered" && b.status === "triggered") {
      return (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0);
    }
    return b.createdAt - a.createdAt;
  });
}

function AlertRow({ alert }: { alert: OryonAlert }) {
  const dict = useDict();
  const S = dict.oryon.alerts;
  const { removeAlert, toggleAlert, rearmAlert } = useOryonAlerts();

  const statusChip =
    alert.status === "active"
      ? { label: S.statusActive, className: "border-border bg-surface-raised text-foreground", dot: "bg-primary" }
      : alert.status === "triggered"
        ? { label: S.statusTriggered, className: "border-primary/30 bg-primary/10 text-primary", dot: "bg-primary" }
        : { label: S.statusDisabled, className: "border-border bg-surface text-muted-foreground", dot: "bg-muted-foreground/60" };

  const time =
    alert.status === "triggered" && alert.triggeredAt !== null
      ? formatAlertTime(alert.triggeredAt)
      : formatAlertTime(alert.createdAt);

  const arrow = alert.condition === "crosses_above" ? "▲" : "▼";

  return (
    <li
      data-testid="oryon-alert-row"
      data-alert-id={alert.id}
      data-status={alert.status}
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5",
        alert.status === "disabled" && "opacity-60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-foreground">{alert.symbol}</span>
          <span aria-hidden className="font-mono text-[10px] text-muted-foreground">
            {arrow}
          </span>
          <span className="font-mono text-xs tabular-nums text-foreground">{alert.targetPrice}</span>
          <span
            data-testid="oryon-alert-status"
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
              statusChip.className,
            )}
          >
            <span aria-hidden className={cn("size-1 rounded-full", statusChip.dot)} />
            {statusChip.label}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {alert.label !== null ? `${alert.label} · ` : ""}
          {alert.status === "triggered" ? `${S.triggeredAtLabel} ` : `${S.createdAtLabel} `}
          {time}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {alert.status === "triggered" ? (
          <RowButton
            testid="oryon-alert-rearm"
            label={S.rearmHint}
            onClick={() => rearmAlert(alert.id)}
            icon={RotateCcw}
          />
        ) : (
          <RowButton
            testid="oryon-alert-toggle"
            label={alert.status === "active" ? S.disableHint : S.enableHint}
            onClick={() => toggleAlert(alert.id)}
            icon={alert.status === "active" ? BellOff : Bell}
          />
        )}
        <RowButton
          testid="oryon-alert-delete"
          label={S.deleteHint}
          onClick={() => removeAlert(alert.id)}
          icon={Trash2}
        />
      </span>
    </li>
  );
}

function RowButton({
  testid,
  label,
  onClick,
  icon: Icon,
}: {
  testid: string;
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testid}
      onClick={onClick}
      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Icon className="size-3" aria-hidden />
    </button>
  );
}

/** Compact local time — the established app convention (formatOpenedAt). */
function formatAlertTime(ts: number): string {
  if (!Number.isFinite(ts)) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}
