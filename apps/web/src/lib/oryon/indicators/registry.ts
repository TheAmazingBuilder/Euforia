import type { OryonIndicatorInstance, OryonIndicatorType } from "@cosmoz/shared";

/**
 * Indicator registry - metadata for the IMPLEMENTED set (Phase 3 spec §4A).
 * Only implemented indicators appear here; the UI renders the registry, so
 * a future type without a calculation cannot surface a fake "Add" action.
 */

export type IndicatorCategory = "overlay" | "pane";

/** Editable parameter descriptor (locale-free; labels live in the dict). */
export interface IndicatorParamSpec {
  key: "period" | "fast" | "slow" | "signal" | "stddev" | "upper" | "lower";
  min: number;
  max: number;
  /** UI increment; integers have step 1. */
  step: number;
}

export interface IndicatorMeta {
  type: OryonIndicatorType;
  /** overlay = main price scale (pane 0); pane = dedicated sub-pane. */
  category: IndicatorCategory;
  /** Stable short label used in legends (locale-free by design). */
  short: string;
  params: readonly IndicatorParamSpec[];
}

export const INDICATOR_REGISTRY: Readonly<Record<OryonIndicatorType, IndicatorMeta>> = {
  sma: {
    type: "sma",
    category: "overlay",
    short: "SMA",
    params: [{ key: "period", min: 2, max: 500, step: 1 }],
  },
  ema: {
    type: "ema",
    category: "overlay",
    short: "EMA",
    params: [{ key: "period", min: 2, max: 500, step: 1 }],
  },
  rsi: {
    type: "rsi",
    category: "pane",
    short: "RSI",
    params: [
      { key: "period", min: 2, max: 500, step: 1 },
      { key: "upper", min: 1, max: 100, step: 1 },
      { key: "lower", min: 1, max: 100, step: 1 },
    ],
  },
  macd: {
    type: "macd",
    category: "pane",
    short: "MACD",
    params: [
      { key: "fast", min: 2, max: 200, step: 1 },
      { key: "slow", min: 3, max: 400, step: 1 },
      { key: "signal", min: 1, max: 100, step: 1 },
    ],
  },
  bbands: {
    type: "bbands",
    category: "overlay",
    short: "BB",
    params: [
      { key: "period", min: 2, max: 500, step: 1 },
      { key: "stddev", min: 0.1, max: 10, step: 0.1 },
    ],
  },
  atr: {
    type: "atr",
    category: "pane",
    short: "ATR",
    params: [{ key: "period", min: 2, max: 500, step: 1 }],
  },
  volume: {
    type: "volume",
    category: "pane",
    short: "Vol",
    params: [],
  },
};

/** Dialog display order - matches the PRD RF-05 enumeration. */
export const INDICATOR_ORDER: readonly OryonIndicatorType[] = [
  "sma",
  "ema",
  "rsi",
  "macd",
  "bbands",
  "atr",
  "volume",
];

/**
 * Theme token KEYS available for indicator lines. ORDER MIRRORS
 * getChartTheme().indicatorPalette (lib/utils/chart-theme.ts) - the series
 * manager resolves key → live token value through that same array, so a new
 * token must be added in BOTH places (kept adjacent by convention).
 */
export const INDICATOR_COLOR_TOKENS: readonly string[] = [
  "cat-ta",
  "cat-strategies",
  "warning",
  "cat-patterns",
  "cat-pa",
  "cat-indicators",
  "cat-mgmt",
];

function newIndicatorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Test/SSR fallback - never a silent collision source.
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Factory with the documented defaults (Phase 3 spec §5): SMA 20, EMA 20,
 * RSI 14 with 30/70, MACD 12/26/9, BB 20/2, ATR 14. Colors are theme token
 * KEYS cycled from the categorical palette.
 */
export function defaultIndicatorInstance(
  type: OryonIndicatorType,
  now: number = Date.now(),
): OryonIndicatorInstance {
  const id = newIndicatorId();
  const base = { id, visible: true, createdAt: now, updatedAt: now };
  switch (type) {
    case "sma":
      return { ...base, type, period: 20, style: { color: "cat-ta", width: 2, dash: "solid" } };
    case "ema":
      return { ...base, type, period: 20, style: { color: "warning", width: 2, dash: "solid" } };
    case "rsi":
      return {
        ...base,
        type,
        period: 14,
        upper: 70,
        lower: 30,
        style: { color: "cat-strategies", width: 1, dash: "solid" },
      };
    case "macd":
      return {
        ...base,
        type,
        fast: 12,
        slow: 26,
        signal: 9,
        style: { color: "cat-indicators", width: 1, dash: "solid" },
        signalStyle: { color: "warning", width: 1, dash: "solid" },
      };
    case "bbands":
      return { ...base, type, period: 20, stddev: 2, style: { color: "cat-pa", width: 1, dash: "solid" } };
    case "atr":
      return { ...base, type, period: 14, style: { color: "cat-patterns", width: 1, dash: "solid" } };
    case "volume":
      return { ...base, type };
  }
}

/**
 * Legend label - parameters INCLUDED so multiple instances of the same
 * indicator are distinguishable at a glance (Phase 3 spec §8.10).
 */
export function indicatorLabel(instance: OryonIndicatorInstance): string {
  switch (instance.type) {
    case "sma":
      return `SMA ${instance.period}`;
    case "ema":
      return `EMA ${instance.period}`;
    case "rsi":
      return `RSI ${instance.period}`;
    case "macd":
      return `MACD ${instance.fast} ${instance.slow} ${instance.signal}`;
    case "bbands":
      return `BB ${instance.period} ${trim(instance.stddev)}`;
    case "atr":
      return `ATR ${instance.period}`;
    case "volume":
      return "Vol";
  }
}

function trim(n: number): string {
  return String(Number(n.toFixed(2)));
}
