"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Award,
  Bell,
  BellOff,
  Brain,
  CheckCheck,
  ChevronDown,
  Gauge,
  History,
  Info,
  Layers,
  LineChart,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type { Alert } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertRulesManager } from "@/components/notifications/alert-rules-manager";
import { useAlerts, useDismissAlert, useMarkAlertRead } from "@/lib/api/queries";
import { alertEventObservation } from "@/lib/notifications/alert-rule-summary";
import { cn } from "@/lib/utils";

/**
 * Notification center — the topbar bell opens a popover inbox fed by the
 * discipline engine (GET /alerts). Module upgrades: alerts GROUP BY TYPE
 * with counters (noise control), an ARCHIVE tab (read + dismissed history,
 * beyond the 20 active rows) and goal alerts DEEP-LINK to the Goals tab
 * filtered on the goal. Phase 07: METRIC_THRESHOLD events (user-defined
 * alert rules) ride the same inbox with a unit-formatted observation
 * detail, a DISMISS row action (audit history kept) and an entry point to
 * the alert-rules manager. Same severity palette as the dashboard feed.
 */

/** Alert type → icon (discipline semantics, not P&L). */
const TYPE_ICON: Record<Alert["type"], LucideIcon> = {
  RULE_VIOLATION: ShieldAlert,
  TILT_WARNING: Brain,
  RISK_BUDGET: Gauge,
  STRATEGY_DECAY: TrendingDown,
  STREAK: Bell,
  DISCIPLINE_WIN: Award,
  GOAL_STATUS: Target,
  METRIC_THRESHOLD: LineChart,
  SYSTEM: Info,
};

/** Alert type → short human label for the grouped view. */
const TYPE_LABEL: Record<Alert["type"], string> = {
  RULE_VIOLATION: "Rule violations",
  TILT_WARNING: "Tilt warnings",
  RISK_BUDGET: "Risk budget",
  STRATEGY_DECAY: "Strategy decay",
  STREAK: "Streaks",
  DISCIPLINE_WIN: "Discipline wins",
  GOAL_STATUS: "Goals",
  METRIC_THRESHOLD: "Metric alerts",
  SYSTEM: "System",
};

/** Severity → dot color (dashboard feed parity). */
const SEVERITY_DOT: Record<Alert["severity"], string> = {
  NOTIFY: "bg-accent",
  WARN: "bg-warning",
  ALERT: "bg-loss",
  LOCK: "bg-loss",
};

/** Compact relative time — "now", "12m", "3h", "5d" (mono, tabular). */
function relativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Machine-readable goal link from a GOAL_STATUS / METRIC_THRESHOLD payload
 * (defensive) — goal alerts deep-link to the Goals tab (spec §8). */
function goalIdOf(alert: Alert): string | null {
  if (alert.type !== "GOAL_STATUS" && alert.type !== "METRIC_THRESHOLD") return null;
  if (alert.payload === null || typeof alert.payload !== "object") return null;
  if ("goalId" in alert.payload) {
    const value = (alert.payload as Record<string, unknown>).goalId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** Unit-formatted observation of a METRIC_THRESHOLD payload (defensive). */
function metricObservationOf(alert: Alert): string | null {
  if (alert.type !== "METRIC_THRESHOLD" || alert.payload === null) return null;
  if (typeof alert.payload !== "object") return null;
  const payload = alert.payload as Record<string, unknown>;
  return alertEventObservation({
    observedValue: typeof payload.observedValue === "number" ? payload.observedValue : null,
    threshold: typeof payload.threshold === "number" ? payload.threshold : null,
    unit: typeof payload.unit === "string" ? payload.unit : null,
  });
}

interface AlertRowProps {
  alert: Alert;
  now: number;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpen: (alert: Alert) => void;
  readPending: boolean;
}

function AlertRow({ alert, now, onRead, onDismiss, onOpen, readPending }: AlertRowProps) {
  const isUnread = alert.readAt === null;
  const Icon = TYPE_ICON[alert.type];
  const goalId = goalIdOf(alert);
  const observation = metricObservationOf(alert);
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="notification-item"
      onClick={() => {
        if (isUnread && !readPending) onRead(alert.id);
        onOpen(alert);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (isUnread && !readPending) onRead(alert.id);
          onOpen(alert);
        }
      }}
      aria-label={
        isUnread ? `Mark "${alert.title}" as read` : alert.title
      }
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        isUnread && "bg-accent/[0.04]",
      )}
    >
      <span className="relative mt-0.5 shrink-0">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-lg border border-border bg-surface",
            isUnread ? "text-accent" : "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-popover",
            SEVERITY_DOT[alert.severity],
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
            )}
          >
            {alert.title}
          </span>
          <time
            dateTime={alert.createdAt}
            className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            {relativeTime(alert.createdAt, now)}
          </time>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
          {alert.message}
        </span>
        {observation !== null && (
          <span className="mt-1 block font-mono text-[11px] tabular-nums text-foreground/80">
            {observation}
          </span>
        )}
        {goalId !== null && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-accent">
            <Target className="size-3" aria-hidden="true" />
            Open in Goals
          </span>
        )}
      </span>
      {alert.dismissedAt === null ? (
        <button
          type="button"
          aria-label={`Dismiss "${alert.title}"`}
          data-testid="notification-dismiss"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(alert.id);
          }}
          className="mt-1 shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <BellOff className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        <Badge variant="outline" className="mt-1 shrink-0 text-[10px]">
          dismissed
        </Badge>
      )}
    </div>
  );
}

type InboxMode = "active" | "grouped" | "history";

export function NotificationCenter() {
  const router = useRouter();
  const { data } = useAlerts();
  const markRead = useMarkAlertRead();
  const dismissAlert = useDismissAlert();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<InboxMode>("active");
  const [collapsed, setCollapsed] = React.useState<Set<Alert["type"]>>(new Set());
  const [rulesOpen, setRulesOpen] = React.useState(false);

  // Goal-status toasts — GOAL_STATUS alerts arriving MID-SESSION surface as a
  // toast (warning for slipping, success for back-on-track / achieved). The
  // first snapshot only ARMS the baseline: landing on an already-slipping
  // goal never floods the screen, the state is already in the inbox
  // (same mechanics as the Session Live price-event toaster).
  const seenGoalAlertIdsRef = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    const goalAlerts = (data?.alerts ?? []).filter(
      (alert) => alert.type === "GOAL_STATUS" && alert.dismissedAt === null,
    );
    if (seenGoalAlertIdsRef.current === null) {
      seenGoalAlertIdsRef.current = new Set(goalAlerts.map((alert) => alert.id));
      return;
    }
    for (const alert of goalAlerts) {
      if (seenGoalAlertIdsRef.current.has(alert.id)) continue;
      seenGoalAlertIdsRef.current.add(alert.id);
      const options = { description: alert.message, duration: 10_000 } as const;
      if (alert.severity === "NOTIFY") toast.success(alert.title, options);
      else toast.warning(alert.title, options);
    }
  }, [data]);

  // Ticking clock for relative times — re-render once a minute while open.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const alerts = React.useMemo(() => data?.alerts ?? [], [data]);
  const live = React.useMemo(
    () => alerts.filter((alert) => alert.dismissedAt === null),
    [alerts],
  );
  const archived = React.useMemo(
    () =>
      alerts
        .filter((alert) => alert.dismissedAt !== null || alert.readAt !== null)
        .sort((a, b) => (b.dismissedAt ?? b.readAt ?? b.createdAt).localeCompare(a.dismissedAt ?? a.readAt ?? a.createdAt)),
    [alerts],
  );
  const unread = live.filter((alert) => alert.readAt === null);
  const unreadCount = data?.unreadCount ?? 0;

  // Grouped view — live alerts bucketed by type, newest first, with counts.
  const grouped = React.useMemo(() => {
    const buckets = new Map<Alert["type"], Alert[]>();
    for (const alert of live) {
      buckets.set(alert.type, [...(buckets.get(alert.type) ?? []), alert]);
    }
    return [...buckets.entries()].sort(
      (a, b) => (b[1][0]?.createdAt ?? "").localeCompare(a[1][0]?.createdAt ?? ""),
    );
  }, [live]);

  const markAllRead = () => {
    for (const alert of unread) markRead.mutate(alert.id);
  };

  const toggleType = (type: Alert["type"]) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  /** Deep-link: goal alerts open the Goals tab filtered on the goal. */
  const openAlert = (alert: Alert) => {
    const goalId = goalIdOf(alert);
    if (goalId !== null) {
      setOpen(false);
      router.push(`/journal?tab=goals&goal=${goalId}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications: ${unreadCount} unread`}
          title="Notifications"
          data-testid="notification-bell"
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-primary font-mono text-[10px] font-semibold leading-none text-primary-foreground"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        data-testid="notification-panel"
        className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 p-0"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <p className="flex-1 font-heading text-sm font-semibold text-foreground">
            Notifications
            {unreadCount > 0 ? (
              <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-accent">
                {unreadCount}
              </span>
            ) : null}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Manage alert rules"
            data-testid="notification-rules"
            onClick={() => {
              setOpen(false);
              setRulesOpen(true);
            }}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Rules
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-accent hover:text-accent"
            onClick={markAllRead}
            disabled={unread.length === 0 || markRead.isPending}
          >
            <CheckCheck className="size-3.5" aria-hidden="true" />
            Mark all read
          </Button>
        </div>

        {/* Mode tabs — active feed / grouped by type / archived history */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5" role="tablist" aria-label="Inbox views">
          {(
            [
              { id: "active", label: "Active", icon: Bell, count: live.length },
              { id: "grouped", label: "By type", icon: Layers, count: grouped.length },
              { id: "history", label: "Archive", icon: History, count: archived.length },
            ] as const
          ).map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              data-testid={`inbox-mode-${id}`}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                mode === id ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3" aria-hidden="true" />
              {label}
              <span className="font-mono text-[10px] tabular-nums opacity-70">{count}</span>
            </button>
          ))}
        </div>

        {/* Active feed — chronological, capped at 20 rows */}
        {mode === "active" ? (
          live.length === 0 ? (
            <EmptyInbox />
          ) : (
            <ul className="max-h-[min(24rem,55dvh)] divide-y divide-border overflow-y-auto overscroll-contain">
              {live.slice(0, 20).map((alert) => (
                <li key={alert.id}>
                  <AlertRow alert={alert} now={now} onRead={(id) => markRead.mutate(id)} onDismiss={(id) => dismissAlert.mutate(id)} onOpen={openAlert} readPending={markRead.isPending} />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {/* Grouped by type — collapsible buckets with counters */}
        {mode === "grouped" ? (
          live.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain" data-testid="inbox-grouped">
              {grouped.map(([type, bucket]) => {
                const Icon = TYPE_ICON[type];
                const isCollapsed = collapsed.has(type);
                const bucketUnread = bucket.filter((alert) => alert.readAt === null).length;
                return (
                  <div key={type} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => toggleType(type)}
                      aria-expanded={!isCollapsed}
                      data-testid={`inbox-group-${type}`}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 text-xs font-semibold text-foreground">{TYPE_LABEL[type]}</span>
                      {bucketUnread > 0 && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-accent">
                          {bucketUnread} new
                        </span>
                      )}
                      <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {bucket.length}
                      </span>
                      <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                    </button>
                    {!isCollapsed && (
                      <ul className="divide-y divide-border border-t border-border/60">
                        {bucket.slice(0, 5).map((alert) => (
                          <li key={alert.id}>
                            <AlertRow alert={alert} now={now} onRead={(id) => markRead.mutate(id)} onDismiss={(id) => dismissAlert.mutate(id)} onOpen={openAlert} readPending={markRead.isPending} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isCollapsed && bucket.length > 5 && (
                      <p className="px-4 py-1.5 text-[10px] text-muted-foreground">
                        + {bucket.length - 5} older in this group
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {/* Archive — read + dismissed, beyond the 20 active rows */}
        {mode === "history" ? (
          archived.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <History className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Nothing archived yet</p>
              <p className="text-xs text-muted-foreground">
                Read and dismissed alerts stay here, searchable in the full history.
              </p>
            </div>
          ) : (
            <ul className="max-h-[min(24rem,55dvh)] divide-y divide-border overflow-y-auto overscroll-contain" data-testid="inbox-history">
              {archived.map((alert) => (
                <li key={alert.id}>
                  <AlertRow alert={alert} now={now} onRead={(id) => markRead.mutate(id)} onDismiss={(id) => dismissAlert.mutate(id)} onOpen={openAlert} readPending={markRead.isPending} />
                </li>
              ))}
            </ul>
          )
        ) : null}
      </PopoverContent>

      {/* Alert-rules manager — opened from the inbox header (spec §5). */}
      <AlertRulesManager open={rulesOpen} onOpenChange={setRulesOpen} />
    </Popover>
  );
}

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <BellOff className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">All caught up</p>
      <p className="text-xs text-muted-foreground">
        Discipline alerts and coach warnings land here.
      </p>
    </div>
  );
}
