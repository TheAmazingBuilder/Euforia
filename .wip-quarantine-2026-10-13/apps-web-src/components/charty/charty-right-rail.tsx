"use client";

import * as React from "react";
import { Bell, CalendarDays, X } from "lucide-react";

import type { Alert, EcoEvent } from "@cosmoz/shared";
import { useAlerts, useEcoEvents } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Charty RIGHT RAIL — per the product brief, ONLY Calendar and Notifications:
 *  - Calendar: the real economic-calendar feed (GET /eco-events — the same
 *    stream the Tools module consumes), impact-coded;
 *  - Notifications: the discipline/alert inbox (GET /alerts).
 * Collapsible; hidden below xl where the toggle lives in the view header.
 */

interface ChartyRightRailProps {
  open: boolean;
  onClose: () => void;
}

type RailTab = "calendar" | "notifications";

export function ChartyRightRail({ open, onClose }: ChartyRightRailProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const [tab, setTab] = React.useState<RailTab>("calendar");

  if (!open) return null;

  return (
    <aside
      data-testid="charty-right-rail"
      aria-label={S.charty.railAria}
      className="hidden w-72 shrink-0 flex-col border-l border-border bg-surface xl:flex"
    >
      {/* Tab header */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-1.5">
        <RailTabButton active={tab === "calendar"} testid="charty-rail-tab-calendar" onClick={() => setTab("calendar")}>
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {S.charty.calendarTab}
        </RailTabButton>
        <RailTabButton
          active={tab === "notifications"}
          testid="charty-rail-tab-notifications"
          onClick={() => setTab("notifications")}
        >
          <Bell className="size-3.5" aria-hidden="true" />
          {S.charty.notificationsTab}
        </RailTabButton>
        <button
          type="button"
          onClick={onClose}
          aria-label={S.charty.railCloseAria}
          data-testid="charty-rail-close"
          className="ml-auto flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "calendar" ? <CalendarFeed /> : <NotificationsFeed />}
      </div>
    </aside>
  );
}

function RailTabButton({
  active,
  testid,
  onClick,
  children,
}: {
  active: boolean;
  testid: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-testid={testid}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        active ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Calendar tab — real economic events ─────────────────────────────────────

function impactClasses(impact: EcoEvent["impact"]): string {
  switch (impact) {
    case "HIGH":
      return "border-loss/40 bg-loss/10 text-loss";
    case "MEDIUM":
      return "border-warning/40 bg-warning/10 text-warning";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function CalendarFeed() {
  const { dict } = useI18n();
  const S = dict.session;
  const { data, isLoading } = useEcoEvents();
  const events = React.useMemo(() => {
    const list = [...(data?.events ?? [])];
    return list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [data]);

  if (isLoading) {
    return <p className="px-2 py-6 text-center text-xs text-muted-foreground">{S.charty.calendarLoading}</p>;
  }
  if (events.length === 0) {
    return <p className="px-2 py-6 text-center text-xs text-muted-foreground" data-testid="charty-calendar-empty">{S.charty.calendarEmpty}</p>;
  }

  return (
    <ul className="space-y-1.5" data-testid="charty-eco-list">
      {events.slice(0, 30).map((event) => {
        const date = new Date(event.scheduledAt);
        const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
        const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
        return (
          <li
            key={event.id}
            className="rounded-lg border border-border bg-surface-raised px-2.5 py-2"
            data-testid="charty-eco-item"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">{time}</span>
              <span
                className={cn(
                  "rounded border px-1 py-px font-mono text-[9px] font-semibold uppercase leading-none",
                  impactClasses(event.impact),
                )}
              >
                {event.impact}
              </span>
              <span className="ml-auto font-mono text-[10px] font-semibold text-muted-foreground">{event.currency}</span>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-foreground" title={event.title}>
              {event.title}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {day}
              {event.actual !== null
                ? ` · ${S.charty.calendarActual} ${event.actual}`
                : event.forecast !== null
                  ? ` · ${S.charty.calendarForecast} ${event.forecast}`
                  : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ── Notifications tab — the alert inbox ─────────────────────────────────────

function NotificationsFeed() {
  const { dict } = useI18n();
  const S = dict.session;
  const { data, isLoading } = useAlerts();
  const alerts = React.useMemo(() => {
    const list = [...(data?.alerts ?? [])];
    return list
      .filter((alert: Alert) => alert.dismissedAt === null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  if (isLoading) {
    return <p className="px-2 py-6 text-center text-xs text-muted-foreground">{S.charty.notificationsLoading}</p>;
  }
  if (alerts.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground" data-testid="charty-notifications-empty">
        {S.charty.notificationsEmpty}
      </p>
    );
  }

  return (
    <ul className="space-y-1.5" data-testid="charty-notifications-list">
      {alerts.slice(0, 30).map((alert: Alert) => {
        const time = new Intl.DateTimeFormat("en-GB", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(alert.createdAt));
        return (
          <li
            key={alert.id}
            className={cn(
              "rounded-lg border px-2.5 py-2",
              alert.readAt === null ? "border-accent/30 bg-accent/5" : "border-border bg-surface-raised",
            )}
            data-testid="charty-notification-item"
          >
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground" title={alert.title}>
                {alert.title}
              </p>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{time}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{alert.message}</p>
          </li>
        );
      })}
    </ul>
  );
}
