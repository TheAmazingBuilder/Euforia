"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Award,
  Bell,
  BellOff,
  Brain,
  CheckCheck,
  Gauge,
  Info,
  ShieldAlert,
  Target,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type { Alert } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAlerts, useMarkAlertRead } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Notification center — the topbar bell opens a popover inbox fed by the
 * discipline engine (GET /alerts). Clicking an unread alert marks it read;
 * "Mark all read" sweeps the rest. Same severity palette as the dashboard
 * feed (discipline colors, not P&L colors).
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
  SYSTEM: Info,
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

export function NotificationCenter() {
  const { data } = useAlerts();
  const markRead = useMarkAlertRead();
  const [open, setOpen] = React.useState(false);

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

  const alerts = React.useMemo(
    () => (data?.alerts ?? []).filter((alert) => alert.dismissedAt === null),
    [data],
  );
  const unread = alerts.filter((alert) => alert.readAt === null);
  const unreadCount = data?.unreadCount ?? 0;

  const markAllRead = () => {
    for (const alert of unread) markRead.mutate(alert.id);
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
            className="h-7 gap-1.5 px-2 text-xs text-accent hover:text-accent"
            onClick={markAllRead}
            disabled={unread.length === 0 || markRead.isPending}
          >
            <CheckCheck className="size-3.5" aria-hidden="true" />
            Mark all read
          </Button>
        </div>

        {/* List */}
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <BellOff className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">All caught up</p>
            <p className="text-xs text-muted-foreground">
              Discipline alerts and coach warnings land here.
            </p>
          </div>
        ) : (
          <ul className="max-h-[min(24rem,55dvh)] divide-y divide-border overflow-y-auto overscroll-contain">
            {alerts.slice(0, 20).map((alert) => {
              const isUnread = alert.readAt === null;
              const Icon = TYPE_ICON[alert.type];
              return (
                <li key={alert.id}>
                  <button
                    type="button"
                    data-testid="notification-item"
                    onClick={() => {
                      if (isUnread) markRead.mutate(alert.id);
                    }}
                    disabled={markRead.isPending}
                    aria-label={
                      isUnread
                        ? `Mark "${alert.title}" as read`
                        : alert.title
                    }
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
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
                            isUnread
                              ? "font-semibold text-foreground"
                              : "font-medium text-muted-foreground",
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
                    </span>
                    {isUnread ? (
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
