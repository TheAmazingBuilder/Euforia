"use client";

import * as React from "react";

import { Bell, CalendarDays, X } from "lucide-react";

import type { EcoEvent } from "@cosmoz/shared";

import { useEcoEvents } from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import type { OryonUtilityPanel } from "@/components/oryon/oryon-view";

/**
 * Oryon right utility rail — notifications + economic calendar.
 *
 * lg+: docked aside, one panel visible at a time (tabs), closes without
 * eating chart space. Below lg: the SAME content opens in a Sheet overlay.
 *
 * Honesty contract (Phase 1 spec §6D): the notifications panel states that
 * notifications are not wired into the charting workspace yet, and the
 * calendar reuses the app's REAL eco-event surface read-only — nothing is
 * fabricated here.
 */
export function OryonUtilityRail({
  open,
  panel,
  onPanelChange,
  onClose,
  overlay = false,
}: {
  open: boolean;
  panel: OryonUtilityPanel;
  onPanelChange: (panel: OryonUtilityPanel) => void;
  onClose: () => void;
  /** Renders as a Sheet overlay instead of the docked aside (<lg). */
  overlay?: boolean;
}) {
  const dict = useDict();

  if (overlay) {
    return (
      <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
        <SheetContent
          side="right"
          data-testid="oryon-utility-overlay"
          className="w-80 gap-0 bg-surface p-0 sm:max-w-80"
        >
          <SheetTitle className="sr-only">{dict.oryon.utility.notifications}</SheetTitle>
          <SheetDescription className="sr-only">
            {dict.oryon.utility.notificationsBody}
          </SheetDescription>
          <OryonUtilityContent panel={panel} onPanelChange={onPanelChange} onClose={onClose} />
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <aside
      data-testid="oryon-utility-rail"
      className="flex w-80 shrink-0 flex-col border-l border-border bg-surface"
    >
      <OryonUtilityContent panel={panel} onPanelChange={onPanelChange} onClose={onClose} />
    </aside>
  );
}

/** Shared rail content: panel tabs + the two honest panels. */
function OryonUtilityContent({
  panel,
  onPanelChange,
  onClose,
}: {
  panel: OryonUtilityPanel;
  onPanelChange: (panel: OryonUtilityPanel) => void;
  onClose: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.utility;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          aria-pressed={panel === "notifications"}
          data-testid="oryon-utility-tab-notifications"
          onClick={() => onPanelChange("notifications")}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
            panel === "notifications"
              ? "bg-surface-raised text-foreground"
              : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
          )}
        >
          <Bell className="size-3.5" aria-hidden />
          {S.notifications}
        </button>
        <button
          type="button"
          aria-pressed={panel === "calendar"}
          data-testid="oryon-utility-tab-calendar"
          onClick={() => onPanelChange("calendar")}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
            panel === "calendar"
              ? "bg-surface-raised text-foreground"
              : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
          )}
        >
          <CalendarDays className="size-3.5" aria-hidden />
          {S.calendar}
        </button>
        <button
          type="button"
          aria-label={dict.common.close}
          data-testid="oryon-utility-close"
          onClick={onClose}
          className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {panel === "notifications" ? <OryonNotificationsPanel /> : <OryonEcoPanel />}
    </div>
  );
}

/** Honest deferred surface — no fabricated notification feed. */
function OryonNotificationsPanel() {
  const dict = useDict();
  const S = dict.oryon.utility;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-testid="oryon-panel-notifications">
      <p className="text-sm text-muted-foreground">{S.notificationsBody}</p>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <a href="/nofy">{S.notificationsLink}</a>
      </Button>
    </div>
  );
}

/**
 * Compact read-only view of the app's REAL eco-event surface (reuse, not a
 * new data path). Upcoming releases first; impact follows the shared enum.
 */
function OryonEcoPanel() {
  const dict = useDict();
  const S = dict.oryon.utility;
  const eco = useEcoEvents();
  const events: EcoEvent[] = React.useMemo(() => {
    // Unreleased = upcoming (actual stays null until the release happens —
    // shared contract). Pure derivation: no clock read during render.
    return (eco.data?.events ?? [])
      .filter((event) => event.actual === null)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, 8);
  }, [eco.data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4" data-testid="oryon-panel-calendar">
      <p className="mb-3 text-sm text-muted-foreground">{S.calendarBody}</p>
      {eco.isPending ? (
        <div className="space-y-2">
          <div className="h-10 animate-pulse rounded-md bg-surface-raised" />
          <div className="h-10 animate-pulse rounded-md bg-surface-raised" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">{S.calendarEmpty}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {events.map((event) => (
            <li
              key={event.id}
              data-testid="oryon-eco-row"
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
            >
              <span
                className={cn(
                  "h-8 w-1 shrink-0 rounded-full",
                  event.impact === "HIGH" && "bg-loss",
                  event.impact === "MEDIUM" && "bg-warning",
                  event.impact === "LOW" && "bg-muted-foreground/40",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {event.title}
                </span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {event.currency} · {formatEventTime(event.scheduledAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="ghost" size="sm" className="mt-3 w-fit">
        <a href="/events">{S.calendarLink}</a>
      </Button>
    </div>
  );
}

/** Compact event time — the existing eco-calendar's Toronto convention. */
function formatEventTime(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
