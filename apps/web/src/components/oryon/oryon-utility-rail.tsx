"use client";

import * as React from "react";

import { Bell, BellRing, CalendarDays, X } from "lucide-react";

import type { EcoEvent, Instrument } from "@cosmoz/shared";

import { useEcoEvents } from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { eventMeetsImportance, eventStatus } from "@/lib/oryon/events/domain";
import { sessionStatusAt } from "@/lib/oryon/sessions/engine";
import { sessionsForAssetClass } from "@/lib/oryon/sessions/definitions";
import { useDisplayTimezone } from "@/lib/oryon/temporal/use-display-timezone";
import {
  formatInstantInZone,
  formatTimeInZone,
  zoneAbbreviation,
} from "@/lib/oryon/temporal/display";
import { useNowMs } from "@/lib/realtime/use-now";

import { OryonAlertsPanel } from "@/components/oryon/oryon-alerts-panel";
import type { OryonUtilityPanel } from "@/components/oryon/oryon-view";

/**
 * Oryon right utility rail — notifications + price alerts + eco calendar.
 *
 * lg+: docked aside, one panel visible at a time (tabs), closes without
 * eating chart space. Below lg: the SAME content opens in a Sheet overlay.
 *
 * Honesty contract (Phase 1 spec §6D): the notifications panel states that
 * notifications are not wired into the charting workspace yet, the calendar
 * reuses the app's REAL eco-event surface read-only, and the alerts panel
 * (Phase 5) states its browser-local scope in plain copy — nothing is
 * fabricated here.
 */
export function OryonUtilityRail({
  open,
  panel,
  onPanelChange,
  onClose,
  activeInstrument = null,
  overlay = false,
}: {
  open: boolean;
  panel: OryonUtilityPanel;
  onPanelChange: (panel: OryonUtilityPanel) => void;
  onClose: () => void;
  /** The ACTIVE chart's instrument — the context panel follows it (§7). */
  activeInstrument?: Instrument | null;
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
          <OryonUtilityContent
            panel={panel}
            onPanelChange={onPanelChange}
            onClose={onClose}
            activeInstrument={activeInstrument}
          />
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
      <OryonUtilityContent
        panel={panel}
        onPanelChange={onPanelChange}
        onClose={onClose}
        activeInstrument={activeInstrument}
      />
    </aside>
  );
}

/** Shared rail content: panel tabs + the honest panels. */
function OryonUtilityContent({
  panel,
  onPanelChange,
  onClose,
  activeInstrument,
}: {
  panel: OryonUtilityPanel;
  onPanelChange: (panel: OryonUtilityPanel) => void;
  onClose: () => void;
  activeInstrument: Instrument | null;
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
          aria-pressed={panel === "alerts"}
          data-testid="oryon-utility-tab-alerts"
          onClick={() => onPanelChange("alerts")}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
            panel === "alerts"
              ? "bg-surface-raised text-foreground"
              : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
          )}
        >
          <BellRing className="size-3.5" aria-hidden />
          {S.alerts}
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

      {panel === "notifications" ? (
        <OryonNotificationsPanel />
      ) : panel === "alerts" ? (
        <OryonAlertsPanel />
      ) : (
        <OryonMarketContextPanel instrument={activeInstrument} />
      )}
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
 * Market-context panel (Phase 8 spec §7) — extends the rail's existing
 * calendar tab in place (reuse, not a second module): a compact SESSION
 * status section for the ACTIVE chart's asset class, plus the economic
 * event list over the REAL shared eco-event surface with the filters the
 * verified data model can actually apply (importance — the shared enum —
 * currency — the ISO code on every record — and upcoming/all scope).
 *
 * Timezone (§9.1): every time renders in the PROFILE timezone (single
 * source of truth, reused) — a display change never moves an event or a
 * session interval.
 *
 * Honesty: sessions are an INDICATIVE reference (no verified holiday
 * calendar exists — stated in plain copy); events come from the
 * deterministic sample provider (stated in plain copy); missing
 * actual/forecast/previous render as "—", never fabricated zeros (§6.1).
 */
function OryonMarketContextPanel({ instrument }: { instrument: Instrument | null }) {
  const dict = useDict();
  const S = dict.oryon.context;
  const utility = dict.oryon.utility;
  const displayTz = useDisplayTimezone();
  const eco = useEcoEvents();

  // Event filters — session-local browsing state (documented: these are
  // reading controls of the calendar surface, not persisted chart config).
  const [scope, setScope] = React.useState<"upcoming" | "all">("upcoming");
  const [importance, setImportance] = React.useState<"ALL" | "MEDIUM" | "HIGH">("ALL");
  const [currency, setCurrency] = React.useState<string>("ALL");

  const events: EcoEvent[] = React.useMemo(() => eco.data?.events ?? [], [eco.data]);

  const currencies = React.useMemo(() => {
    const set = new Set<string>();
    for (const event of events) set.add(event.currency);
    return ["ALL", ...[...set].sort()];
  }, [events]);

  const nowMs = useNowMs(15_000);

  const visible = React.useMemo(() => {
    let list = events;
    if (scope === "upcoming") {
      list = nowMs === null ? [] : list.filter((event) => new Date(event.scheduledAt).getTime() > nowMs);
    }
    if (importance !== "ALL") {
      list = list.filter((event) => eventMeetsImportance(event, importance));
    }
    if (currency !== "ALL") {
      list = list.filter((event) => event.currency === currency);
    }
    return [...list]
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, 40);
  }, [events, scope, importance, currency, nowMs]);

  // Sessions of the ACTIVE chart's asset class (§4.1 scope) — re-computed
  // on the 15 s cadence; the engine caches per session-day internally.
  // Before the first tick (nowMs null — SSR/hydration-safe) the rows render
  // with an "unavailable" status: never a Date.now() read during render.
  const sessionDefs = React.useMemo(
    () => (instrument !== null ? sessionsForAssetClass(instrument.assetClass) : []),
    [instrument],
  );
  const statuses = React.useMemo(
    () =>
      sessionDefs.map((def) => ({
        def,
        status: nowMs === null ? null : sessionStatusAt(def, nowMs),
      })),
    [sessionDefs, nowMs],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4" data-testid="oryon-panel-calendar">
      <p className="mb-3 text-sm text-muted-foreground">{utility.calendarBody}</p>

      {/* ── Sessions (§4.3) ─────────────────────────────────────────── */}
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {S.sessionsHeading}
      </h3>
      {instrument === null ? (
        <p className="mb-3 text-xs text-muted-foreground">{S.sessionsWaiting}</p>
      ) : sessionDefs.length === 0 ? (
        <p className="mb-3 text-xs text-muted-foreground" data-testid="oryon-sessions-none">
          {S.sessionsNone}
        </p>
      ) : (
        <ul className="mb-2 space-y-1" data-testid="oryon-sessions-list">
          {statuses.map(({ def, status }) => {
            const now = nowMs;
            return (
              <li
                key={def.id}
                data-testid={`oryon-session-${def.id}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    status?.open === true ? "bg-profit" : "bg-muted-foreground/50",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground">{def.name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {now !== null && status !== null && status.transitionMs !== null
                      ? `${formatTimeInZone(now, def.ianaZone)} ${zoneAbbreviation(now, def.ianaZone)} · ${
                          status.open
                            ? S.sessionClosesAt.replace("{t}", formatTimeInZone(status.transitionMs, def.ianaZone))
                            : S.sessionOpensAt.replace("{t}", formatTimeInZone(status.transitionMs, def.ianaZone))
                        }`
                      : "—"}
                  </span>
                </span>
                <span
                  data-testid={`oryon-session-status-${def.id}`}
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    status === null
                      ? "bg-surface-raised text-muted-foreground"
                      : status.open
                        ? "bg-profit/15 text-profit"
                        : "bg-surface-raised text-muted-foreground",
                  )}
                >
                  {status === null ? S.sessionStatusUnavailable : status.open ? S.sessionOpen : S.sessionClosed}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {sessionDefs.length > 0 ? (
        <p className="mb-3 text-[10px] leading-snug text-muted-foreground">{S.sessionsIndicative}</p>
      ) : null}

      {/* ── Economic events (§7) ────────────────────────────────────── */}
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.eventsHeading}
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground" title={S.displayTzLabel.replace("{tz}", displayTz)}>
          {displayTz}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5" data-testid="oryon-events-filters">
        <Select value={scope} onValueChange={(value) => setScope(value as "upcoming" | "all")}>
          <SelectTrigger size="sm" className="h-7 w-[118px] text-xs" aria-label={S.eventsHeading}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">{S.eventsScopeUpcoming}</SelectItem>
            <SelectItem value="all">{S.eventsScopeAll}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={importance} onValueChange={(value) => setImportance(value as "ALL" | "MEDIUM" | "HIGH")}>
          <SelectTrigger size="sm" className="h-7 w-[112px] text-xs" aria-label={S.minImportance}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{S.eventsImportanceAll}</SelectItem>
            <SelectItem value="MEDIUM">{S.importanceMedium}</SelectItem>
            <SelectItem value="HIGH">{S.importanceHigh}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger size="sm" className="h-7 w-[100px] text-xs" aria-label={S.eventsCurrencyAll}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((code) => (
              <SelectItem key={code} value={code}>
                {code === "ALL" ? S.eventsCurrencyAll : code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eco.isPending ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden" data-testid="oryon-events-loading">
          <div className="h-10 animate-pulse rounded-md bg-surface-raised" />
          <div className="h-10 animate-pulse rounded-md bg-surface-raised" />
        </div>
      ) : eco.isError ? (
        <div className="flex min-h-0 flex-1 flex-col items-start gap-2">
          <p className="text-xs text-muted-foreground" data-testid="oryon-events-error">
            {S.eventsError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="oryon-events-retry"
            onClick={() => void eco.refetch()}
          >
            {S.eventsRetry}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="min-h-0 flex-1 text-xs text-muted-foreground" data-testid="oryon-events-empty">
          {S.eventsEmpty}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" data-testid="oryon-events-list">
          {visible.map((event) => {
            const status = nowMs === null ? "SCHEDULED" : eventStatus(event, nowMs);
            const atMs = new Date(event.scheduledAt).getTime();
            return (
              <li
                key={event.id}
                data-testid="oryon-eco-row"
                className="rounded-md border border-border bg-background px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
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
                      {event.currency} · {formatInstantInZone(atMs, displayTz)} ·{" "}
                      <span data-testid={`oryon-event-status-${event.id}`}>
                        {status === "RELEASED" ? S.eventsReleased : S.eventsScheduled}
                      </span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      event.impact === "HIGH" && "bg-loss/15 text-loss",
                      event.impact === "MEDIUM" && "bg-warning/15 text-warning",
                      event.impact === "LOW" && "bg-surface-raised text-muted-foreground",
                    )}
                    aria-label={`${event.impact} impact`}
                  >
                    {event.impact.toLowerCase()}
                  </span>
                </div>
                {event.actual !== null || event.forecast !== null || event.previous !== null ? (
                  <dl className="mt-1 grid grid-cols-3 gap-1 font-mono text-[10px]">
                    {(
                      [
                        [S.actual, event.actual],
                        [S.forecast, event.forecast],
                        [S.previous, event.previous],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-sm bg-surface-raised px-1.5 py-0.5">
                        <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="tabular-nums text-foreground">{value ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground" data-testid="oryon-events-source-note">
        {S.eventsSourceNote}
      </p>
      <Button asChild variant="ghost" size="sm" className="mt-1 w-fit">
        <a href="/events">{utility.calendarLink}</a>
      </Button>
    </div>
  );
}
