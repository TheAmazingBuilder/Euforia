"use client";

import * as React from "react";

import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";
import {
  flushDrawingsForSymbol,
  loadDrawingsForSymbol,
  saveDrawingsForSymbol,
} from "@/lib/oryon/drawings/persistence";
import { OryonDrawingStore } from "@/lib/oryon/drawings/store";

/**
 * Oryon drawings context — per-SYMBOL drawing state (Phase 2 + Phase 7
 * spec §11 ownership).
 *
 * Phase 7: drawings belong to an INSTRUMENT (the existing per-symbol
 * persistence model — unchanged). With several chart panels open, each
 * panel renders the drawings of the symbol IT displays, so the workspace
 * keeps a REGISTRY of drawing stores keyed by symbol: two panels showing
 * the same instrument share one store (same annotations, consistent
 * selection), different instruments never see each other's drawings.
 *
 * The rail (undo/redo, object list) binds to the store the ACTIVE panel's
 * layer publishes (bindActiveStore) — the rail always operates on the
 * drawings actually displayed by the chart the user is looking at.
 *
 * Registry discipline: stores are created lazily per visited symbol,
 * loaded from the validated per-symbol persistence once, and kept in
 * memory (bounded by an LRU cap — evicted stores flush + unsubscribe).
 * Persistence stays per symbol and versioned exactly as Phase 2 shipped.
 *
 * Re-render discipline: consuming components subscribe to their store
 * themselves (useSyncExternalStore) — commits are rare (drag end, style
 * change); pointer drags never touch this context.
 */

const MAX_CACHED_SYMBOLS = 24;

interface RegistryEntry {
  store: OryonDrawingStore;
  unsubscribe: () => void;
  symbol: string;
  touchedAt: number;
}

/** Registry of per-symbol drawing stores (bounded, LRU). */
export class OryonDrawingStoreRegistry {
  private entries = new Map<string, RegistryEntry>();

  /** Returns the symbol's store, creating + loading it on first access. */
  storeFor(symbol: string): OryonDrawingStore {
    const existing = this.entries.get(symbol);
    if (existing !== undefined) {
      existing.touchedAt = Date.now();
      return existing.store;
    }

    const store = new OryonDrawingStore();
    store.loadAll(loadDrawingsForSymbol(symbol));
    // Per-symbol debounced persistence on every commit (the Phase 2 path,
    // now owned by the registry — layers render, the registry persists).
    const unsubscribe = store.subscribe(() => {
      saveDrawingsForSymbol(symbol, store.getSnapshot().drawings);
    });
    this.entries.set(symbol, { store, unsubscribe, symbol, touchedAt: Date.now() });
    this.evictIfNeeded();
    return store;
  }

  /** Flushes + releases every store (workspace unmount). */
  dispose(): void {
    for (const entry of this.entries.values()) {
      flushDrawingsForSymbol(entry.symbol, entry.store.getSnapshot().drawings);
      entry.unsubscribe();
    }
    this.entries.clear();
  }

  /** LRU eviction — the oldest-touched store flushes and leaves memory. */
  private evictIfNeeded(): void {
    while (this.entries.size > MAX_CACHED_SYMBOLS) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        if (entry.touchedAt < oldestAt) {
          oldestAt = entry.touchedAt;
          oldestKey = key;
        }
      }
      if (oldestKey === null) break;
      const evicted = this.entries.get(oldestKey)!;
      flushDrawingsForSymbol(evicted.symbol, evicted.store.getSnapshot().drawings);
      evicted.unsubscribe();
      this.entries.delete(oldestKey);
    }
  }
}

export interface OryonDrawingsContextValue {
  registry: OryonDrawingStoreRegistry;
  /** The store the ACTIVE panel's chart layer currently renders. */
  activeStore: OryonDrawingStore | null;
  /** Called by the ACTIVE panel's layer (store changes per displayed symbol). */
  bindActiveStore: (store: OryonDrawingStore | null) => void;
  activeTool: OryonDrawingTool;
  setActiveTool: (tool: OryonDrawingTool) => void;
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
}

const OryonDrawingsContext = React.createContext<OryonDrawingsContextValue | null>(null);

export function OryonDrawingsProvider({ children }: { children: React.ReactNode }) {
  // One registry per workspace mount (lazy state initializer — the
  // sanctioned "expensive instance" pattern; never re-created on re-render).
  const [registry] = React.useState(() => new OryonDrawingStoreRegistry());

  const [activeStore, setActiveStore] = React.useState<OryonDrawingStore | null>(null);
  const [activeTool, setActiveTool] = React.useState<OryonDrawingTool>("cursor");
  const [listOpen, setListOpen] = React.useState(false);

  // Flush every cached symbol's pending write on workspace unmount.
  React.useEffect(() => {
    return () => registry.dispose();
  }, [registry]);

  const value = React.useMemo(
    () => ({
      registry,
      activeStore,
      bindActiveStore: setActiveStore,
      activeTool,
      setActiveTool,
      listOpen,
      setListOpen,
    }),
    [registry, activeStore, activeTool, listOpen],
  );

  return <OryonDrawingsContext.Provider value={value}>{children}</OryonDrawingsContext.Provider>;
}

export function useOryonDrawings(): OryonDrawingsContextValue {
  const value = React.useContext(OryonDrawingsContext);
  if (value === null) {
    throw new Error("useOryonDrawings must be used within OryonDrawingsProvider");
  }
  return value;
}
