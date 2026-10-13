"use client";

import * as React from "react";

import type { MarketInterval } from "@cosmoz/shared";

import {
  ORYON_CHART_TYPES,
  type OryonChartType,
} from "@/components/oryon/engine/chart-engine";

/**
 * Oryon workspace preferences — module store following the repo's house
 * pattern (useSyncExternalStore + external mutable snapshot, as in
 * lib/realtime/market.ts).
 *
 * It holds ONLY the selection state of the workspace (instrument symbol,
 * timeframe, chart type) and persists it to localStorage. The Instrument
 * OBJECT itself is derived in the workspace from the live catalog — the
 * store never caches domain entities. Server preferences arrive in a later
 * phase and will replace the localStorage persistence behind this same
 * surface.
 */

export interface OryonWorkspacePrefs {
  /** Canonical symbol of the selected instrument (null = not chosen yet). */
  symbol: string | null;
  interval: MarketInterval;
  chartType: OryonChartType;
}

const STORAGE_KEY = "cosmoz.oryon.workspace.v1";

const DEFAULT_PREFS: OryonWorkspacePrefs = {
  symbol: null,
  interval: "1m",
  chartType: "candles",
};

let prefs: OryonWorkspacePrefs = DEFAULT_PREFS;
let hydrated = false;
const listeners = new Set<() => void>();

function isInterval(value: unknown): value is MarketInterval {
  return typeof value === "string" && (["1m", "5m", "15m", "30m", "1H", "4H", "1D"] as const).includes(value as MarketInterval);
}

function isChartType(value: unknown): value is OryonChartType {
  return (
    typeof value === "string" && (ORYON_CHART_TYPES as readonly string[]).includes(value)
  );
}

/** Read persisted selection once on the client (never during SSR). */
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    const parsed = JSON.parse(raw) as Partial<OryonWorkspacePrefs>;
    prefs = {
      symbol: typeof parsed.symbol === "string" ? parsed.symbol : null,
      interval: isInterval(parsed.interval) ? parsed.interval : DEFAULT_PREFS.interval,
      chartType: isChartType(parsed.chartType) ? parsed.chartType : DEFAULT_PREFS.chartType,
    };
  } catch {
    // Corrupted or unavailable storage — defaults win, nothing crashes.
  }
}

function getSnapshot(): OryonWorkspacePrefs {
  hydrate(); // first client read after hydration — cheap no-op afterwards
  return prefs;
}

function getServerSnapshot(): OryonWorkspacePrefs {
  return DEFAULT_PREFS; // stable identity → no hydration churn
}

function persist(): void {
  try {
    if (prefs.symbol !== null) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // Storage unavailable (private mode, quota) — session-local selection.
  }
}

/** Update one or more selection fields (call from event handlers). */
export function setOryonPrefs(patch: Partial<OryonWorkspacePrefs>): void {
  prefs = { ...prefs, ...patch };
  persist();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive workspace selection (defaults during SSR, then persisted). */
export function useOryonPrefs(): OryonWorkspacePrefs {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
