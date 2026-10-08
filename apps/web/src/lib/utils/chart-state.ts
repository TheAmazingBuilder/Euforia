import type { DrawingObject, IndicatorConfig, IndicatorKind, MarketInterval } from "@cosmoz/shared";

import { INDICATOR_DEFAULTS } from "@/lib/utils/indicators";

/**
 * Per-symbol persisted chart state (Session Live workspace) — shared by the
 * master workspace and the session replay so the replay opens with the
 * trader's own indicator template. localStorage is a convenience, never a
 * source of truth: every read is defensive, every write is best-effort.
 */

const STORE_KEY = "cosmoz.session-live.chart.v1";

/**
 * Indicators a FIRST visit opens with (nothing persisted yet): the
 * TradingView-style starter template — volume histogram + RSI(14) — so the
 * chart shows the panes traders expect instead of bare candles. Any user
 * edit persists the per-symbol workspace, which then always wins.
 * Ids are deterministic ("tpl-*"): stable across loads, and a later manual
 * add of the same kind gets a fresh id (newId) — no collisions.
 */
const TEMPLATE_KINDS: readonly IndicatorKind[] = ["VOLUME", "RSI"];

export function defaultIndicatorTemplate(): IndicatorConfig[] {
  return TEMPLATE_KINDS.map((kind, index) => ({
    id: `tpl-${kind.toLowerCase()}-${index}`,
    kind,
    visible: true,
    params: { ...INDICATOR_DEFAULTS[kind] },
  }));
}

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
