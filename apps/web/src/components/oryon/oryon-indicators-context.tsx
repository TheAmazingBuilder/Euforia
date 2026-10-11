"use client";

import * as React from "react";

import { ORYON_MAIN_PANEL_ID, type OryonIndicatorInstance, type OryonIndicatorType } from "@cosmoz/shared";

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
 * Oryon indicators context — PER-PANEL indicator state (Phase 3 spec §4D
 * + Phase 7 spec §11 ownership).
 *
 * Phase 7: indicators BELONG to the chart panel they are configured on. A
 * registry hands each panel its own OryonIndicatorStore (same store class,
 * same validation, same engine diffing). The DEFAULT panel's store keeps
 * the Phase 3 browser-local persistence (`euforia.oryon.indicators.v1`) —
 * the single-chart analysis setup survives reloads exactly as before.
 * Additional panels' stacks live in memory and are captured by SAVED
 * layouts (explicit save — the same discipline as the workspace session),
 * which also keeps honest bounds on local storage.
 *
 * The TOOLBAR dialog (add/settings) and template save/apply resolve the
 * ACTIVE panel's store through the workspace config context — the dialog
 * is modal, so the target cannot change while it is open.
 *
 * Re-render discipline: consuming components subscribe to their store
 * themselves (useSyncExternalStore) — commits are rare (config edits,
 * add/remove). Ticks never touch this context.
 */

/** Registry of per-panel indicator stores, keyed by stable panel id. */
export class OryonIndicatorStoreRegistry {
  private stores = new Map<string, OryonIndicatorStore>();

  /** Returns the panel's store, creating it on first access. */
  storeFor(panelId: string): OryonIndicatorStore {
    const existing = this.stores.get(panelId);
    if (existing !== undefined) return existing;
    const store = new OryonIndicatorStore();
    this.stores.set(panelId, store);
    return store;
  }

  /** Looks a store up WITHOUT creating it (null when never accessed). */
  find(panelId: string): OryonIndicatorStore | null {
    return this.stores.get(panelId) ?? null;
  }
}

export type OryonIndicatorDialogState =
  | { kind: "closed" }
  | { kind: "browse" }
  | { kind: "settings"; id: string };

export interface OryonIndicatorsContextValue {
  registry: OryonIndicatorStoreRegistry;
  /** Adds an instance to the given panel's store. Returns it, or null when rejected. */
  addIndicator: (store: OryonIndicatorStore, type: OryonIndicatorType) => OryonIndicatorInstance | null;
  removeIndicator: (store: OryonIndicatorStore, id: string) => void;
  dialog: OryonIndicatorDialogState;
  openBrowse: () => void;
  openSettings: (id: string) => void;
  closeDialog: () => void;
}

const OryonIndicatorsContext = React.createContext<OryonIndicatorsContextValue | null>(null);

export function OryonIndicatorsProvider({ children }: { children: React.ReactNode }) {
  // One registry per workspace mount (never re-created on re-render).
  const [registry] = React.useState(() => new OryonIndicatorStoreRegistry());
  const [dialog, setDialog] = React.useState<OryonIndicatorDialogState>({ kind: "closed" });

  // The DEFAULT panel's stack is the Phase 3 persisted analysis setup:
  // load + validate once per workspace mount; seed the PRD default
  // template on first visit (RF-05: volume + RSI 14) and persist it so an
  // explicitly emptied stack is never reseeded later.
  React.useEffect(() => {
    const mainStore = registry.storeFor(ORYON_MAIN_PANEL_ID);
    const loaded = loadIndicators();
    mainStore.loadAll(loaded.indicators);
    if (loaded.seeded) saveIndicators(loaded.indicators);
    const unsubscribe = mainStore.subscribe(() => saveIndicators(mainStore.indicators));
    return () => {
      unsubscribe();
      flushIndicators(mainStore.indicators);
    };
  }, [registry]);

  const addIndicator = React.useCallback(
    (store: OryonIndicatorStore, type: OryonIndicatorType): OryonIndicatorInstance | null => {
      const instance = defaultIndicatorInstance(type);
      const result = store.add(instance);
      return result.ok ? instance : null;
    },
    [],
  );

  const removeIndicator = React.useCallback(
    (store: OryonIndicatorStore, id: string) => store.remove(id),
    [],
  );

  const openBrowse = React.useCallback(() => setDialog({ kind: "browse" }), []);
  const openSettingsFor = React.useCallback(
    (id: string) => setDialog({ kind: "settings", id }),
    [],
  );
  const closeDialog = React.useCallback(() => setDialog({ kind: "closed" }), []);

  const value = React.useMemo(
    () => ({
      registry,
      addIndicator,
      removeIndicator,
      dialog,
      openBrowse,
      openSettings: openSettingsFor,
      closeDialog,
    }),
    [registry, addIndicator, removeIndicator, dialog, openBrowse, openSettingsFor, closeDialog],
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

/** Subscribes a component to ONE panel's indicator collection (rare commits). */
export function useIndicatorSnapshot(store: OryonIndicatorStore): IndicatorStoreSnapshot {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
