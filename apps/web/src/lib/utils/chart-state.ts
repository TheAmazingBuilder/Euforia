import type { DrawingObject, IndicatorConfig, MarketInterval } from "@cosmoz/shared";

/**
 * Per-symbol persisted chart state (Session Live workspace) — shared by the
 * master workspace and the session replay so the replay opens with the
 * trader's own indicator template. localStorage is a convenience, never a
 * source of truth: every read is defensive, every write is best-effort.
 */

const STORE_KEY = "cosmoz.session-live.chart.v1";

export interface PersistedChartState {
  interval?: MarketInterval;
  indicators?: IndicatorConfig[];
  drawings?: DrawingObject[];
}

export function loadPersistedChartState(symbol: string): PersistedChartState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedChartState>;
    return parsed[symbol] ?? {};
  } catch {
    return {};
  }
}

export function persistChartState(symbol: string, state: PersistedChartState): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const all = raw !== null ? (JSON.parse(raw) as Record<string, PersistedChartState>) : {};
    all[symbol] = state;
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Non-fatal: persistence is a convenience, never a source of truth.
  }
}
