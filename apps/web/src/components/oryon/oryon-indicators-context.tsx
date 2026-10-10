"use client";

import * as React from "react";

import type { OryonIndicatorInstance, OryonIndicatorType } from "@cosmoz/shared";

import { defaultIndicatorInstance } from "@/lib/oryon/indicators/registry";
import {
  flushIndicators,
  loadIndicators,
  saveIndicators,
} from "@/lib/oryon/indicators/persistence";
import {
  OryonIndicatorStore,
  type IndicatorStoreSnapshot,
} from "@/lib/oryon/indicators/store";

/**
 * Oryon indicators context — the shared indicator state for the workspace
 * (Phase 3 spec §4D, §9).
 *
 * Lives at the OryonView level so the TOOLBAR (add dialog entry) and the
 * CHART (series + legend chips) share one store. The store is
 * engine-independent: created once per workspace mount, loaded from the
 * validated persistence adapter on mount (PRD default template on first
 * visit), saved debounced on every commit, flushed on unmount.
 *
 * Re-render discipline: consuming components subscribe to the store
 * themselves (useSyncExternalStore) — commits are rare (config edits,
 * add/remove). Ticks never touch this context.
 */

export type OryonIndicatorDialogState =
  | { kind: "closed" }
  | { kind: "browse" }
  | { kind: "settings"; id: string };

export interface OryonIndicatorsContextValue {
  store: OryonIndicatorStore;
  /** Adds an instance with registry defaults. Returns it, or null when rejected. */
  addIndicator: (type: OryonIndicatorType) => OryonIndicatorInstance | null;
  removeIndicator: (id: string) => void;
  dialog: OryonIndicatorDialogState;
  openBrowse: () => void;
  openSettings: (id: string) => void;
  closeDialog: () => void;
}

const OryonIndicatorsContext = React.createContext<OryonIndicatorsContextValue | null>(null);

export function OryonIndicatorsProvider({ children }: { children: React.ReactNode }) {
  // One store instance per workspace mount (never re-created on re-render).
  const [store] = React.useState(() => new OryonIndicatorStore());
  const [dialog, setDialog] = React.useState<OryonIndicatorDialogState>({ kind: "closed" });

  // Load + validate once per workspace mount; seed the PRD default template
  // on first visit (RF-05: volume + RSI 14) and persist it so an explicitly
  // emptied stack is never reseeded later.
  React.useEffect(() => {
    const loaded = loadIndicators();
    store.loadAll(loaded.indicators);
    if (loaded.seeded) saveIndicators(loaded.indicators);
    const unsubscribe = store.subscribe(() => saveIndicators(store.indicators));
    return () => {
      unsubscribe();
      flushIndicators(store.indicators);
    };
  }, [store]);

  const addIndicator = React.useCallback(
    (type: OryonIndicatorType): OryonIndicatorInstance | null => {
      const instance = defaultIndicatorInstance(type);
      const result = store.add(instance);
      return result.ok ? instance : null;
    },
    [store],
  );

  const removeIndicator = React.useCallback(
    (id: string) => store.remove(id),
    [store],
  );

  const openBrowse = React.useCallback(() => setDialog({ kind: "browse" }), []);
  const openSettingsFor = React.useCallback(
    (id: string) => setDialog({ kind: "settings", id }),
    [],
  );
  const closeDialog = React.useCallback(() => setDialog({ kind: "closed" }), []);

  const value = React.useMemo(
    () => ({
      store,
      addIndicator,
      removeIndicator,
      dialog,
      openBrowse,
      openSettings: openSettingsFor,
      closeDialog,
    }),
    [store, addIndicator, removeIndicator, dialog, openBrowse, openSettingsFor, closeDialog],
  );

  return <OryonIndicatorsContext.Provider value={value}>{children}</OryonIndicatorsContext.Provider>;
}

export function useOryonIndicators(): OryonIndicatorsContextValue {
  const value = React.useContext(OryonIndicatorsContext);
  if (value === null) {
    throw new Error("useOryonIndicators must be used within OryonIndicatorsProvider");
  }
  return value;
}

/** Subscribes a component to the indicator collection (rare commits only). */
export function useIndicatorSnapshot(): IndicatorStoreSnapshot {
  const { store } = useOryonIndicators();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
