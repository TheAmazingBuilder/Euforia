"use client";

import * as React from "react";

import { X } from "lucide-react";

import type {
  AssetClass,
  Candle,
  EcoEvent,
  MarketInterval,
  OryonPanelContext,
} from "@cosmoz/shared";

import { useEcoEvents, useInstruments } from "@/lib/api/queries";
import type { OryonChartEngine, OryonEventMarkerSpec } from "@/lib/charting/oryon-chart-engine";
import { intervalToMs, isIntraday } from "@/lib/charting/oryon-intervals";
import { eventMeetsImportance, eventsForChartSpan, dedupeEventsById } from "@/lib/oryon/events/domain";
import { computeSessionBands } from "@/lib/oryon/sessions/engine";
import { sessionsForAssetClass } from "@/lib/oryon/sessions/definitions";
import { findBarContainingTime } from "@/lib/oryon/sync/alignment";
import { useDisplayTimezone } from "@/lib/oryon/temporal/use-display-timezone";
import { formatInstantInZone } from "@/lib/oryon/temporal/display";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Oryon temporal-context bridges (Phase 8 spec §5, §8, §11) - the ONLY
 * components connecting the workspace to the session/event engines.
 *
 * Render discipline (mirrors the position/alert bridges): both bridges
 * render null and push PURE SPEC into the engine imperatively on rare
 * commits (instrument class, timeframe, loaded window, preference,
 * calendar refetch) - the workspace tree never re-renders for a shading
 * toggle or a marker set, and the chart is never reinitialized (§14).
 *
 * Data reuse (§11): the economic-event query is the app's SHARED
 * useEcoEvents (one TanStack cache entry for every panel) - no per-chart
 * event stream exists. Session intervals come from the pure engine with
 * its per-day cache (§14: reuse of derived intervals).
 *
 * Honesty: markers land ONLY on the bar containing the event instant
 * (containment, never fabricated positions) and only for events within
 * the loaded candle span; importance below the panel's threshold never
 * becomes a marker; a 1D chart shows no shading (a day candle cannot
 * carry an intraday band - the context panel still reports session
 * status; documented in the phase report).
 */

/** Importance → resolved marker color (theme tokens, never raw hex). */
function markerColor(impact: EcoEvent["impact"]): string {
  const theme = getChartTheme();
  if (impact === "HIGH") return theme.loss;
  if (impact === "MEDIUM") return theme.warning;
  return theme.textMuted;
}

/** Importance → marker size - importance is never color-only (§15). */
function markerSize(impact: EcoEvent["impact"]): number {
  if (impact === "HIGH") return 1.8;
  if (impact === "MEDIUM") return 1.3;
  return 1;
}

export function OryonContextOverlaysBridge({
  engineRef,
  mounted,
  dataSymbol,
  interval,
  candles,
  context,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  mounted: boolean;
  /** Symbol of the data ACTUALLY displayed - overlays follow the data. */
  dataSymbol: string;
  interval: MarketInterval;
  candles: Candle[];
  context: OryonPanelContext;
}) {
  // The displayed instrument's asset class decides which session
  // definitions apply (spec §4.1 scope). Resolved through the SHARED
  // catalog query - one cache entry for the whole workspace.
  const instruments = useInstruments();
  const assetClass: AssetClass | null =
    instruments.data?.instruments.find((instrument) => instrument.symbol === dataSymbol)?.assetClass ?? null;

  const intervalMs = intervalToMs(interval);

  // Session bands - rare commits only (span/prefs/class/timeframe).
  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    const enabled =
      context.sessionShading && assetClass !== null && isIntraday(interval) && candles.length > 0;
    if (!enabled) {
      engine.setSessionBands([]);
      return;
    }
    const defs = sessionsForAssetClass(assetClass);
    if (defs.length === 0) {
      engine.setSessionBands([]);
      return;
    }
    const first = candles[0]!.t;
    const last = candles[candles.length - 1]!.t;
    engine.setSessionBands(computeSessionBands(defs, first, last + intervalMs));
  }, [mounted, context.sessionShading, assetClass, interval, candles, intervalMs, engineRef]);

  // Event markers - shared calendar data, bar-snapped, threshold-filtered.
  const eco = useEcoEvents();
  const events = React.useMemo(
    () => dedupeEventsById(eco.data?.events ?? []),
    [eco.data],
  );

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    if (!context.eventMarkers || candles.length === 0) {
      engine.setEventMarkers([]);
      return;
    }
    const first = candles[0]!.t;
    const last = candles[candles.length - 1]!.t;
    const inSpan = eventsForChartSpan(events, first, last, intervalMs);
    const specs: OryonEventMarkerSpec[] = [];
    for (const event of inSpan) {
      if (!eventMeetsImportance(event, context.eventMinImportance)) continue;
      const atMs = new Date(event.scheduledAt).getTime();
      if (!Number.isFinite(atMs)) continue;
      // Containment: the marker lands on the bar CONTAINING the event
      // instant - never a fabricated position between bars (§8).
      const bar = findBarContainingTime(candles, atMs / 1000, intervalMs);
      if (bar === null) continue;
      specs.push({
        id: event.id,
        timeSec: bar.t / 1000,
        color: markerColor(event.impact),
        size: markerSize(event.impact),
      });
    }
    engine.setEventMarkers(specs);
  }, [mounted, context.eventMarkers, context.eventMinImportance, events, candles, intervalMs, engineRef]);

  return null;
}

/**
 * Marker detail popover (§8): opens on a marker click, lists EVERY event
 * scheduled inside the clicked bar's bucket (multiple releases at the
 * same slot stack in one card - no overlapping labels), and shows only
 * what the source actually provides. Missing actual/forecast/previous
 * values render as honest "-" placeholders, never zeros (§6.1).
 */
export function OryonEventPopover({
  engineRef,
  mounted,
  interval,
  candles,
  dataSymbol,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  mounted: boolean;
  interval: MarketInterval;
  candles: Candle[];
  dataSymbol: string;
}) {
  const dict = useDict();
  const S = dict.oryon.context;
  const displayTz = useDisplayTimezone();
  const eco = useEcoEvents();
  const events = React.useMemo(
    () => dedupeEventsById(eco.data?.events ?? []),
    [eco.data],
  );

  /** Open state: clicked bar time + anchor point (chart-local CSS px) + the
   *  display-window key it was opened on. A symbol/timeframe switch changes
   *  the key - the stale popover renders closed WITHOUT an effect-driven
   *  setState (purity discipline: derived invalidation, not a reset effect). */
  const [open, setOpen] = React.useState<{
    key: string;
    timeSec: number;
    point: { x: number; y: number };
  } | null>(null);
  const windowKey = `${dataSymbol}:${interval}`;

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    return engine.onEventMarkerClick((timeSec, point) => {
      if (point === null) return;
      setOpen({ key: windowKey, timeSec, point });
    });
  }, [mounted, engineRef, windowKey]);

  // Escape closes (keyboard discipline, §15).
  React.useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A popover opened on a previous display window (symbol/timeframe switch,
  // data reload) is invalid - render closed, never float over foreign data.
  const effectiveOpen = open !== null && open.key === windowKey ? open : null;

  const intervalMs = intervalToMs(interval);
  const eventsAtBar = React.useMemo(() => {
    if (effectiveOpen === null) return [];
    const barStartMs = effectiveOpen.timeSec * 1000;
    return events.filter(
      (event) => {
        const atMs = new Date(event.scheduledAt).getTime();
        return Number.isFinite(atMs) && atMs >= barStartMs && atMs < barStartMs + intervalMs;
      },
    );
  }, [effectiveOpen, events, intervalMs]);

  if (effectiveOpen === null || candles.length === 0) return null;

  // Clamp the card inside the wrapper - never off-panel, never over the
  // whole chart (§15 "tooltips or detail views that do not obscure the
  // entire chart").
  const CARD_WIDTH = 260;
  const left = Math.max(8, effectiveOpen.point.x - CARD_WIDTH / 2);
  const top = Math.max(8, effectiveOpen.point.y - 12);

  return (
    <div
      className="absolute inset-0 z-30"
      role="presentation"
      onClick={() => setOpen(null)}
    >
      <div
        role="dialog"
        aria-label={S.popoverTitle}
        data-testid="oryon-event-popover"
        className="absolute w-64 rounded-lg border border-border bg-surface p-3 shadow-lg"
        style={{ left, top }}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatInstantInZone(effectiveOpen.timeSec * 1000, displayTz)} · {displayTz}
          </span>
          <button
            type="button"
            aria-label={dict.common.close}
            data-testid="oryon-event-popover-close"
            onClick={() => setOpen(null)}
            className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        {eventsAtBar.length === 0 ? (
          <p className="text-xs text-muted-foreground">{S.popoverEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {eventsAtBar.map((event) => (
              <li key={event.id} className="space-y-1 border-t border-border pt-2 first:border-0 first:pt-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-3.5 w-1 shrink-0 rounded-full",
                      event.impact === "HIGH" && "bg-loss",
                      event.impact === "MEDIUM" && "bg-warning",
                      event.impact === "LOW" && "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-xs font-medium leading-tight text-foreground">
                    {event.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>{event.currency}</span>
                  <span aria-label={`${event.impact} impact`}>{event.impact.toLowerCase()}</span>
                  <span>{formatInstantInZone(new Date(event.scheduledAt).getTime(), displayTz)}</span>
                </div>
                <dl className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                  {(
                    [
                      [S.actual, event.actual],
                      [S.forecast, event.forecast],
                      [S.previous, event.previous],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-sm bg-surface-raised px-1.5 py-1">
                      <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums text-foreground" data-testid={`oryon-event-${label.toLowerCase()}`}>
                        {value ?? "-"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
