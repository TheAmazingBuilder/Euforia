import type { Candle, IndicatorConfig, IndicatorKind, IndicatorParams } from "@cosmoz/shared";

/**
 * Technical indicator calculations for the Session Live chart (MASTER PROMPT
 * §16: "Do not fake indicator calculations"). Every function computes real
 * values from the loaded candle window and returns arrays ALIGNED with the
 * input (null during the warm-up period — the chart skips nulls, it never
 * interpolates or invents values).
 *
 * VWAP is window-anchored: it accumulates from the first candle of the
 * loaded window, which is the honest scope the app actually has.
 */

/** Values series for one indicator output line (null = not yet defined). */
export type Series = Array<number | null>;

function sma(values: number[], length: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

function ema(values: number[], length: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < length || length <= 0) return out;
  const k = 2 / (length + 1);
  let prev = 0;
  for (let i = 0; i < length; i += 1) prev += values[i];
  prev /= length;
  out[length - 1] = prev;
  for (let i = length; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], length = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= length) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= length;
  avgLoss /= length;
  out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = length + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** MACD (fast/slow EMA difference) + its signal EMA + histogram. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: Series; signal: Series; hist: Series } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: Series = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );
  // Signal = EMA of the defined MACD segment only (skip warm-up nulls).
  const defined = macdLine.filter((value): value is number => value !== null);
  const signalDefined = ema(defined, signal);
  const offset = macdLine.findIndex((value) => value !== null);
  const signalLine: Series = new Array(closes.length).fill(null);
  if (offset >= 0) {
    for (let i = 0; i < signalDefined.length; i += 1) {
      signalLine[offset + i] = signalDefined[i];
    }
  }
  const hist: Series = closes.map((_, i) =>
    macdLine[i] !== null && signalLine[i] !== null ? (macdLine[i] as number) - (signalLine[i] as number) : null,
  );
  return { macd: macdLine, signal: signalLine, hist };
}

/** Wilder's ATR over the candle window. */
export function atr(candles: Candle[], length = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length <= length) return out;
  const trs: number[] = candles.map((candle, i) => {
    if (i === 0) return candle.h - candle.l;
    const prevClose = candles[i - 1].c;
    return Math.max(candle.h - candle.l, Math.abs(candle.h - prevClose), Math.abs(candle.l - prevClose));
  });
  let prev = 0;
  for (let i = 1; i <= length; i += 1) prev += trs[i];
  prev /= length;
  out[length] = prev;
  for (let i = length + 1; i < candles.length; i += 1) {
    prev = (prev * (length - 1) + trs[i]) / length;
    out[i] = prev;
  }
  return out;
}

/** Bollinger Bands — middle SMA + stdDev multipliers. */
export function bollinger(
  closes: number[],
  length = 20,
  stdDev = 2,
): { upper: Series; mid: Series; lower: Series } {
  const mid = sma(closes, length);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = length - 1; i < closes.length; i += 1) {
    if (mid[i] === null) continue;
    const window = closes.slice(i - length + 1, i + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / length;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / length;
    const dev = Math.sqrt(variance) * stdDev;
    upper[i] = (mid[i] as number) + dev;
    lower[i] = (mid[i] as number) - dev;
  }
  return { upper, mid, lower };
}

/**
 * VWAP anchored at the first candle of the loaded window. Volume-less feeds
 * (SIM forex with v = 0) leave VWAP undefined — the chart hides it rather
 * than rendering a fake line.
 */
export function vwap(candles: Candle[]): Series {
  const out: Series = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const typical = (candle.h + candle.l + candle.c) / 3;
    cumPV += typical * candle.v;
    cumV += candle.v;
    if (cumV > 0) out[i] = cumPV / cumV;
  }
  return out;
}

/** Parameter defaults per indicator kind (§17 — configurable, resettable). */
export const INDICATOR_DEFAULTS: Record<IndicatorKind, IndicatorParams> = {
  EMA: { length: 9 },
  SMA: { length: 50 },
  VWAP: {},
  BB: { length: 20, stdDev: 2 },
  RSI: { length: 14 },
  MACD: { fast: 12, slow: 26, signal: 9 },
  ATR: { length: 14 },
  VOLUME: {},
};

/** Human label + which pane the indicator renders into. */
export const INDICATOR_META: Record<IndicatorKind, { label: string; pane: "overlay" | "sub" }> = {
  EMA: { label: "EMA", pane: "overlay" },
  SMA: { label: "SMA", pane: "overlay" },
  VWAP: { label: "VWAP", pane: "overlay" },
  BB: { label: "Bollinger Bands", pane: "overlay" },
  RSI: { label: "RSI", pane: "sub" },
  MACD: { label: "MACD", pane: "sub" },
  ATR: { label: "ATR", pane: "sub" },
  VOLUME: { label: "Volume", pane: "sub" },
};

/** Computed output of one configured indicator for the chart. */
export interface ComputedIndicator {
  config: IndicatorConfig;
  /** Overlay lines on the price grid (label + aligned series). */
  overlayLines: Array<{ label: string; data: Series; colorIndex: number }>;
  /** Sub-pane definition (created only when the indicator is visible). */
  sub?: {
    kind: "RSI" | "MACD" | "ATR" | "VOLUME";
    lines: Array<{ label: string; data: Series; colorIndex: number }>;
    /** MACD histogram (bar series). */
    hist?: Series;
    /** Fixed scale guides (RSI 30/70). */
    guides?: Array<{ value: number; label: string }>;
  };
}

/**
 * Compute every configured indicator against the candle window. Hidden
 * indicators keep their computation output (so "show" is instant) — callers
 * decide what reaches the chart.
 */
export function computeIndicators(configs: IndicatorConfig[], candles: Candle[]): ComputedIndicator[] {
  const closes = candles.map((candle) => candle.c);
  return configs.map((config) => {
    const params = { ...INDICATOR_DEFAULTS[config.kind], ...(config.params ?? {}) };
    const result: ComputedIndicator = { config, overlayLines: [] };
    switch (config.kind) {
      case "EMA":
        result.overlayLines.push({ label: `EMA ${params.length}`, data: ema(closes, params.length ?? 9), colorIndex: 0 });
        break;
      case "SMA":
        result.overlayLines.push({ label: `SMA ${params.length}`, data: sma(closes, params.length ?? 50), colorIndex: 1 });
        break;
      case "VWAP":
        result.overlayLines.push({ label: "VWAP", data: vwap(candles), colorIndex: 2 });
        break;
      case "BB": {
        const bands = bollinger(closes, params.length ?? 20, params.stdDev ?? 2);
        result.overlayLines.push({ label: `BB upper ${params.length}/${params.stdDev}`, data: bands.upper, colorIndex: 3 });
        result.overlayLines.push({ label: `BB mid`, data: bands.mid, colorIndex: 4 });
        result.overlayLines.push({ label: `BB lower`, data: bands.lower, colorIndex: 3 });
        break;
      }
      case "RSI":
        result.sub = {
          kind: "RSI",
          lines: [{ label: `RSI ${params.length}`, data: rsi(closes, params.length ?? 14), colorIndex: 5 }],
          guides: [
            { value: 70, label: "70" },
            { value: 30, label: "30" },
          ],
        };
        break;
      case "MACD": {
        const out = macd(closes, params.fast ?? 12, params.slow ?? 26, params.signal ?? 9);
        result.sub = {
          kind: "MACD",
          lines: [
            { label: `MACD ${params.fast}/${params.slow}`, data: out.macd, colorIndex: 0 },
            { label: `signal ${params.signal}`, data: out.signal, colorIndex: 1 },
          ],
          hist: out.hist,
        };
        break;
      }
      case "ATR":
        result.sub = {
          kind: "ATR",
          lines: [{ label: `ATR ${params.length}`, data: atr(candles, params.length ?? 14), colorIndex: 6 }],
        };
        break;
      case "VOLUME":
        result.sub = { kind: "VOLUME", lines: [] };
        break;
    }
    return result;
  });
}

/**
 * ATR(14) of the final candle — Market Context "Volatility" input.
 * Returns null before the warm-up period (honest N/A, never a guess).
 */
export function atrNow(candles: Candle[], length = 14): number | null {
  const values = atr(candles, length);
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

/** Highest high / lowest low of the candle window (day-range context input). */
export function windowRange(candles: Candle[]): { high: number; low: number } | null {
  if (candles.length === 0) return null;
  let high = -Number.MAX_VALUE;
  let low = Number.MAX_VALUE;
  for (const candle of candles) {
    if (candle.h > high) high = candle.h;
    if (candle.l < low) low = candle.l;
  }
  return { high, low };
}
