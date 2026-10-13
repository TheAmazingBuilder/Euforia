"use client";

import * as React from "react";
import { CalendarDays, Bell, Shapes, X } from "lucide-react";

import type { Impact } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { API_MOCKED } from "@/lib/api/mode";
import { useAlerts, useEcoEvents } from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import { OryonObjectsPanel } from "@/components/oryon/drawings/objects-panel";

type OryonRightPanel = "notifications" | "calendar" | "objects";

interface OryonUtilityRailProps {
  panel: OryonRightPanel;
  onClose: () => void;
  /** Docked (≥xl, consumes layout width) or overlay (tablet, floats). */
  variant: "docked" | "overlay";
  className?: string;
  /** Canonical symbol of the selected instrument (objects panel scope). */
  symbol?: string;
}

/** "HH:MM" in the user zone for today's rows, "MMM d HH:MM" otherwise. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return date.toLocaleString("en-US", {
    month: sameDay ? undefined : "short",
    day: sameDay ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const IMPACT_DOT: Record<Impact, string> = {
  HIGH: "bg-loss",
  MEDIUM: "bg-warning",
  LOW: "bg-muted-foreground/50",
};

/**
 * Oryon right utility rail — notifications and the economic-calendar panel
 * (docs/specs/oryon-prd.md §6.1 zone 5). It reuses the EXISTING journal
 * contracts (`GET /alerts`, `GET /eco-events`) through the established
 * hooks and labels development fixtures honestly (MOCK chip when MSW is
 * active). It does NOT claim external calendar data is integrated — the
 * panel carries an explicit notice (cahier de charge Phase 1 §4).
 */
export function OryonUtilityRail({
  panel,
  onClose,
  variant,
  className = "",
  symbol = "",
}: OryonUtilityRailProps) {
  const dict = useDict().oryon;

  return (
    <aside
      className={`w-72 shrink-0 flex-col border-l border-border bg-surface ${className}`}
      data-testid="oryon-utility-rail"
      data-panel={panel}
      data-variant={variant}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          {panel === "notifications" ? (
            <Bell className="size-3.5 text-muted-foreground" aria-hidden />
          ) : panel === "calendar" ? (
            <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
          ) : (
            <Shapes className="size-3.5 text-muted-foreground" aria-hidden />
          )}
          <h2 className="text-sm font-semibold">
            {panel === "notifications"
              ? dict.right.notificationsTitle
              : panel === "calendar"
                ? dict.right.calendarTitle
                : dict.drawing.objectsTitle}
          </h2>
          {/* MOCK chip labels the MOCKED API feeds (notifications/calendar);
              drawings persist locally and are never "mock data". */}
          {panel !== "objects" && API_MOCKED ? (
            <Badge variant="outline" className="font-mono text-[9px] tracking-wider">
              {dict.right.mockChip}
            </Badge>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.right.close}
          data-testid="oryon-utility-close"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {panel === "notifications" ? (
        <NotificationsPanel />
      ) : panel === "calendar" ? (
        <CalendarPanel notice={dict.right.calendarNotice} />
      ) : (
        <OryonObjectsPanel symbol={symbol} />
      )}
    </aside>
  );
}

function NotificationsPanel() {
  const dict = useDict().oryon;
  const alertsQuery = useAlerts();
  const alerts = (alertsQuery.data?.alerts ?? [])
    .filter((alert) => alert.dismissedAt === null)
    .slice(0, 30);

  if (alertsQuery.isPending) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (alerts.length === 0) {
    return (
      <p className="p-4 text-center text-xs text-muted-foreground">
        {dict.right.notificationsEmpty}
      </p>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="oryon-notifications-list">
      {alerts.map((alert) => (
        <article
          key={alert.id}
          className={`rounded-md border border-transparent px-2.5 py-2 transition-colors hover:bg-muted ${
            alert.readAt === null ? "bg-background" : ""
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-xs font-semibold">{alert.title}</p>
            <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {formatTimestamp(alert.createdAt)}
            </time>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {alert.message}
          </p>
        </article>
      ))}
    </div>
  );
}

function CalendarPanel({ notice }: { notice: string }) {
  const dict = useDict().oryon;
  const ecoQuery = useEcoEvents();
  const events = [...(ecoQuery.data?.events ?? [])]
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, 30);

  return (
    <>
      <p className="border-b border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        {notice}
      </p>
      {ecoQuery.isPending ? (
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">
          {dict.right.calendarEmpty}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="oryon-calendar-list">
          {events.map((event) => (
            <article
              key={event.id}
              className="rounded-md px-2.5 py-2 transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${IMPACT_DOT[event.impact]}`}
                  aria-label={event.impact}
                />
                <time className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatTimestamp(event.scheduledAt)}
                </time>
                <span className="shrink-0 font-mono text-[11px] font-semibold">
                  {event.currency}
                </span>
                <p className="truncate text-xs font-medium">{event.title}</p>
              </div>
              {event.actual || event.forecast || event.previous ? (
                <p className="ml-3.5 mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {event.actual ? `${dict.right.actual} ${event.actual} ` : ""}
                  {event.forecast ? `${dict.right.forecast} ${event.forecast} ` : ""}
                  {event.previous ? `${dict.right.previous} ${event.previous}` : ""}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
