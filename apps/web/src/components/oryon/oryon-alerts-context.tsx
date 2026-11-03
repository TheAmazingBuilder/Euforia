"use client";

import * as React from "react";
import { toast } from "sonner";

import type { OryonAlert } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { useFeedStatus, useLiveQuotes } from "@/lib/realtime/market";
import { OryonAlertEngine, type AlertObservation } from "@/lib/oryon/alerts/evaluate";
import { flushAlerts, loadAlerts, saveAlerts } from "@/lib/oryon/alerts/persistence";
import { OryonAlertStore, type AlertCreateInput } from "@/lib/oryon/alerts/store";

/**
 * Oryon alerts context (Phase 5) - the integration boundary between the
 * browser-local alert domain and the workspace UI.
 *
 * Responsibility split (spec §5):
 *   - policy            → lib/oryon/alerts/evaluate.ts (pure engine)
 *   - records           → lib/oryon/alerts/store.ts (immutable store)
 *   - persistence       → lib/oryon/alerts/persistence.ts (browser-local)
 *   - feed consumption  → the OryonAlertsFeedBridge leaf below: ONE
 *                         subscription to the app-wide quote store (the same
 *                         socket/polling feed the chart uses - never a
 *                         connection per alert), pushing observations into
 *                         the engine imperatively;
 *   - presentation      → the create dialog + the utility-rail panel;
 *   - chart integration → the overlay bridge leaf in the price chart.
 *
 * Honesty contract: triggers fire ONLY while this provider is mounted (the
 * workspace is open) and the feed is live. Persistence is browser-local.
 * The only notification channel is the in-app toast + panel state - the
 * context never claims server-side evaluation or background delivery.
 *
 * Re-render discipline: the provider re-renders only on rare commits; the
 * feed bridge (renders null) is the only component re-rendering per quote
 * broadcast, and it talks to the engine imperatively - the workspace tree
 * never re-renders per tick because of alerts.
 */

/** Prefill for the create dialog - the active chart instrument + its quote. */
export interface AlertCreatePrefill {
  symbol: string;
  /** Current quote price (dialog default); null when no quote yet. */
  price: number | null;
  /** Instrument display digits (target formatting hint). */
  digits: number;
}

export interface OryonAlertsContextValue {
  store: OryonAlertStore;
  engine: OryonAlertEngine;
  createOpen: boolean;
  prefill: AlertCreatePrefill | null;
  openCreate: (prefill: AlertCreatePrefill) => void;
  closeCreate: () => void;
  createAlert: (input: AlertCreateInput) => OryonAlert | null;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  rearmAlert: (id: string) => void;
}

const OryonAlertsContext = React.createContext<OryonAlertsContextValue | null>(null);

export function OryonAlertsProvider({ children }: { children: React.ReactNode }) {
  const dict = useDict();
  // The engine outlives renders; the toast copy reads the CURRENT dict
  // through this ref (no engine rebuild on locale/theme changes).
  const dictRef = React.useRef(dict);
  React.useEffect(() => {
    dictRef.current = dict;
  }, [dict]);

  const [store] = React.useState(() => new OryonAlertStore());
  const [engine] = React.useState(() => new OryonAlertEngine());

  // CONFIRMED-trigger wiring - an external-system subscription (effect, not
  // a constructor closure): the store records the trigger; the toast is the
  // only notification channel (in-app, while the page is open).
  React.useEffect(() => {
    engine.setTriggerHandler((event) => {
      store.markTriggered(event.alert.id, event.at);
      const S = dictRef.current.oryon.alerts;
      const crossed =
        event.alert.condition === "crosses_above" ? S.triggerAbove : S.triggerBelow;
      const label =
        event.alert.label !== null && event.alert.label.trim().length > 0
          ? `${event.alert.label.trim()} - `
          : "";
      toast(`${S.triggerToastTitle} - ${event.alert.symbol}`, {
        description: `${label}${crossed} ${event.price}`,
      });
    });
    return () => {
      engine.setTriggerHandler(null);
    };
  }, [engine, store]);

  // Persistence lifecycle: validated load once, debounced saves, flush on
  // unmount (the drawing-layer convention).
  React.useEffect(() => {
    store.loadAll(loadAlerts());
    const unsubscribe = store.subscribe(() => {
      saveAlerts(store.getSnapshot().alerts);
    });
    return () => {
      unsubscribe();
      flushAlerts(store.getSnapshot().alerts);
    };
  }, [store]);

  // Engine keeps mirroring the evaluated set (active alerts only - the
  // engine filters; this just hands it the current records).
  React.useEffect(() => {
    const sync = () => engine.setAlerts(store.getSnapshot().alerts);
    sync();
    return store.subscribe(sync);
  }, [engine, store]);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<AlertCreatePrefill | null>(null);

  const openCreate = React.useCallback((next: AlertCreatePrefill) => {
    setPrefill(next);
    setCreateOpen(true);
  }, []);
  const closeCreate = React.useCallback(() => setCreateOpen(false), []);

  const createAlert = React.useCallback(
    (input: AlertCreateInput) => store.add(input),
    [store],
  );
  const removeAlert = React.useCallback((id: string) => store.remove(id), [store]);
  const toggleAlert = React.useCallback((id: string) => store.toggleEnabled(id), [store]);
  const rearmAlert = React.useCallback(
    (id: string) => {
      engine.rearm(id); // re-prime the runtime FIRST - no stale anchor.
      store.rearm(id);
    },
    [engine, store],
  );

  const value = React.useMemo<OryonAlertsContextValue>(
    () => ({
      store,
      engine,
      createOpen,
      prefill,
      openCreate,
      closeCreate,
      createAlert,
      removeAlert,
      toggleAlert,
      rearmAlert,
    }),
    [store, engine, createOpen, prefill, openCreate, closeCreate, createAlert, removeAlert, toggleAlert, rearmAlert],
  );

  return (
    <OryonAlertsContext.Provider value={value}>
      {children}
      <OryonAlertsFeedBridge engine={engine} />
    </OryonAlertsContext.Provider>
  );
}

export function useOryonAlerts(): OryonAlertsContextValue {
  const value = React.useContext(OryonAlertsContext);
  if (value === null) {
    throw new Error("useOryonAlerts must be used within OryonAlertsProvider");
  }
  return value;
}

/**
 * Feed bridge - renders null. Subscribes to the app-wide quote snapshot and
 * pushes observations into the engine at the broadcast cadence; gates the
 * engine on the feed phase (nothing is evaluated while not live, and leaving
 * the live phase re-primes every alert - reconnects never claim a gap).
 */
function OryonAlertsFeedBridge({ engine }: { engine: OryonAlertEngine }) {
  const { quotes } = useLiveQuotes();
  const { phase } = useFeedStatus();

  React.useEffect(() => {
    engine.setFeedLive(phase === "live");
  }, [engine, phase]);

  React.useEffect(() => {
    const observations: AlertObservation[] = [];
    for (const quote of quotes.values()) {
      observations.push({ symbol: quote.symbol, price: quote.price, ts: quote.ts });
    }
    engine.observe(observations);
  }, [engine, quotes]);

  // Dev-probe handle (dev builds only, mirror of __ORYON_CHART_DEBUG__):
  // deterministic synthetic observations for E2E assertions - never shipped
  // to production, never read by the app itself.
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const host = window as unknown as {
      __ORYON_ALERTS_DEBUG__?: {
        inject: (symbol: string, price: number, ts?: number) => void;
        isPrimed: (alertId: string) => boolean;
      };
    };
    host.__ORYON_ALERTS_DEBUG__ = {
      inject: (symbol, price, ts) => {
        engine.observe([{ symbol, price, ts: ts ?? Date.now() }]);
      },
      isPrimed: (alertId) => engine.isPrimed(alertId),
    };
    return () => {
      delete host.__ORYON_ALERTS_DEBUG__;
    };
  }, [engine]);

  return null;
}
