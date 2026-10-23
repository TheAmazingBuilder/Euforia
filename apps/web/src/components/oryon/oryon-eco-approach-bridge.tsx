"use client";

import * as React from "react";
import { toast } from "sonner";

import type { Instrument } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { useEcoEvents } from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import {
  OryonEcoApproachEngine,
  type EcoApproachEventInput,
  type EcoApproachInstrumentInput,
  type EcoApproachNotice,
} from "@/lib/oryon/alerts/eco-approach";
import { resolveInstrument } from "@/components/oryon/oryon-chart-grid";

/**
 * Oryon eco-approach bridge — renders null (the alerts feed-bridge pattern,
 * reused for the calendar surface): ONE subscription to the shared eco
 * query + a 15 s clock, pushing facts into a PURE engine that returns
 * CONFIRMED approach notices. The toast is the only notification channel —
 * in-app, while the workspace is open (the same honesty contract as price
 * alerts; nothing here promises background or server-side delivery).
 *
 * Scope: HIGH-impact events matched to the instruments the workspace
 * panels actually display (currency equality or the other leg of a
 * 6-letter FX pair). Milestones T-30/T-10/T-2, one-shot per session.
 *
 * Re-render discipline: the bridge re-renders on the 15 s tick and on rare
 * query commits only — the workspace tree never re-renders because of it.
 */
export function OryonEcoApproachBridge({
  instruments,
  feedSymbols,
  panelSymbols,
}: {
  instruments: readonly Instrument[];
  feedSymbols: ReadonlySet<string>;
  /** The symbol each open panel displays (null = its default resolution). */
  panelSymbols: readonly (string | null)[];
}) {
  const dict = useDict();
  const dictRef = React.useRef(dict);
  React.useEffect(() => {
    dictRef.current = dict;
  }, [dict]);

  const [engine] = React.useState(() => new OryonEcoApproachEngine());
  const eco = useEcoEvents();
  const nowMs = useNowMs(15_000);
  /** The event set last fed to the engine (debug inject re-feeds it). */
  const lastEventsRef = React.useRef<EcoApproachEventInput[]>([]);

  // Panel layout commits → the matched instrument set (rare).
  React.useEffect(() => {
    const resolved: EcoApproachInstrumentInput[] = [];
    const seen = new Set<string>();
    for (const symbol of panelSymbols) {
      const instrument = resolveInstrument(symbol, instruments, feedSymbols);
      if (instrument === null || seen.has(instrument.symbol)) continue;
      seen.add(instrument.symbol);
      resolved.push({ symbol: instrument.symbol, quoteCurrency: instrument.quoteCurrency });
    }
    engine.setInstruments(resolved);
  }, [engine, instruments, feedSymbols, panelSymbols]);

  // Eco query commits → the evaluated event set (rare; 30 min bridge TTL).
  React.useEffect(() => {
    const events: EcoApproachEventInput[] = (eco.data?.events ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      currency: event.currency,
      impact: event.impact,
      scheduledAtMs: new Date(event.scheduledAt).getTime(),
    }));
    lastEventsRef.current = events;
    engine.setEvents(events);
  }, [engine, eco.data]);

  // CONFIRMED-notice wiring — the toast is the notification surface (the
  // alert context's exact pattern; copy reads the CURRENT dict via ref).
  React.useEffect(() => {
    const onNotice = (notice: EcoApproachNotice): void => {
      const S = dictRef.current.oryon.alerts;
      const when = notice.overdue
        ? S.ecoToastImminent
        : S.ecoToastIn.replace("{m}", String(notice.milestoneMinutes));
      const description = `${notice.event.title} - ${notice.event.currency} · ${when} · ${S.ecoToastInstruments} ${notice.symbols.join(", ")}`;
      toast(`${S.ecoToastTitle} · ${when}`, {
        description,
        testId: "oryon-eco-approach-toast",
        duration: 12_000,
      });
    };
    engine.setHandler(onNotice);
    return () => {
      engine.setHandler(null);
    };
  }, [engine]);

  // The shared 15 s clock drives evaluation (the engine dedupes; ticks
  // outside the workspace lifetime simply never happen).
  React.useEffect(() => {
    if (nowMs === null) return;
    engine.tick(nowMs);
  }, [engine, nowMs]);

  // Dev-probe handle (dev builds only — the __ORYON_*_DEBUG__ convention):
  // inject a synthetic HIGH event minutes ahead so E2E probes assert the
  // toast deterministically. The full set is re-fed (synthetic + real), so
  // the injection survives until the next query commit. Never shipped to
  // production, never read by the app itself.
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const host = window as unknown as {
      __ORYON_ECO_APPROACH_DEBUG__?: {
        inject: (title: string, currency: string, minutesAhead: number) => void;
        hasFired: (eventId: string, milestone: number) => boolean;
      };
    };
    host.__ORYON_ECO_APPROACH_DEBUG__ = {
      inject: (title, currency, minutesAhead) => {
        const synthetic: EcoApproachEventInput = {
          id: `debug-eco-${title.toLowerCase().replace(/\s+/g, "-")}`,
          title,
          currency: currency.toUpperCase(),
          impact: "HIGH",
          scheduledAtMs: Date.now() + minutesAhead * 60_000,
        };
        lastEventsRef.current = [...lastEventsRef.current, synthetic];
        engine.setEvents(lastEventsRef.current);
        // No synthetic tick — the next shared-clock beat (≤15 s) evaluates
        // the injection; a milestone window already crossed on arrival
        // fires with the honest "imminent" wording (overdue flag).
      },
      hasFired: (eventId, milestone) => engine.hasFired(eventId, milestone),
    };
    return () => {
      delete host.__ORYON_ECO_APPROACH_DEBUG__;
    };
  }, [engine]);

  return null;
}
