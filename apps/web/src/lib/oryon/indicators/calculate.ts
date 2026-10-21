import type { Candle, OryonIndicatorInstance } from "@cosmoz/shared";

import {
  emaKernel,
  emaSparseKernel,
  smaKernel,
  stddevKernel,
  trueRangeKernel,
  wilderKernel,
  type Series,
} from "./math";
import { normalizeCandles } from "./normalize";
import { indicatorRuleError } from "./validation";

/**
 * Indicator calculation layer (Phase 3 spec §4B, §6) — DETERMINISTIC, pure,
 * independent from the chart library and from React.
 *
 * Input contract: the repository's actual candle model (`Candle` from
 * @cosmoz/shared — t = bucket open, ms epoch). Candles are normalized
 * (ordered / deduped / non-finite dropped) BEFORE any math runs.
 *
 * Warm-up: every output is aligned with `times` and holds `null` for the
 * warm-up segment — callers render nothing there (no fabricated numbers).
 */

/** Output ids per indicator type (the series-manager's rendering contract). */
export type IndicatorOutputId =
  | "line" // sma, ema, rsi, atr
  | "basis" | "upper" | "lower" // bbands
  | "macd" | "signal" | "histogram" // macd
  | "volume"; // volume

export interface IndicatorCalculation {
  /** Normalized candle times, unix seconds (LWC UTCTimestamp domain). */
  times: number[];
  /** Output lines aligned with `times` (null = warm-up / undefined). */
  outputs: Partial<Record<IndicatorOutputId, Series>>;
}

/**
 * Calculates one indicator instance over a candle window.
 * Business-rule violations (MACD fast ≥ slow, RSI lower ≥ upper) throw —
 * they are programmer errors; the UI/persistence layers validate BEFORE
 * calling this (defense in depth, spec §6).
 */
export function calculateIndicator(
  instance: OryonIndicatorInstance,
  rawCandles: readonly Candle[],
): IndicatorCalculation {
  // Defense in depth (spec §4C): business rules are validated AGAINST here —
  // a violation reaching the calc layer is a programmer error, never rendered
  // as math. Store mutations and the persistence loader validate first.
  const rule = indicatorRuleError(instance);
  if (rule !== null) {
    throw new Error(`indicator business rule violated: ${rule}`);
  }

  const candles = normalizeCandles(rawCandles);
  const times = candles.map((c) => c.t / 1000);

  switch (instance.type) {
    case "sma": {
      const closes = candles.map((c) => c.c);
      return { times, outputs: { line: smaKernel(closes, instance.period) } };
    }

    case "ema": {
      const closes = candles.map((c) => c.c);
      return { times, outputs: { line: emaKernel(closes, instance.period) } };
    }

    case "rsi": {
      // Wilder's RSI — documented convention:
      //   close-to-close deltas; first averages = arithmetic mean of the
      //   first `period` gains/losses (available at candle index `period`);
      //   later values = Wilder recursion (prev·(p−1)+x)/p.
      //   Zero-loss handling (no NaN / no Infinity, spec §6):
      //     avgGain === 0 && avgLoss === 0  → 50 (neutral flat market)
      //     avgLoss === 0 (pure rally)      → 100
      const deltas: number[] = [];
      for (let i = 1; i < candles.length; i += 1) {
        deltas.push(candles[i]!.c - candles[i - 1]!.c);
      }
      const gains = deltas.map((d) => (d > 0 ? d : 0));
      const losses = deltas.map((d) => (d < 0 ? -d : 0));
      const avgGain = wilderKernel(gains, instance.period);
      const avgLoss = wilderKernel(losses, instance.period);

      const line: Series = new Array<number | null>(times.length).fill(null);
      for (let j = 0; j < deltas.length; j += 1) {
        const g = avgGain[j];
        const l = avgLoss[j];
        if (typeof g !== "number" || typeof l !== "number") continue;
        const candleIndex = j + 1;
        if (g === 0 && l === 0) line[candleIndex] = 50;
        else if (l === 0) line[candleIndex] = 100;
        else line[candleIndex] = 100 - 100 / (1 + g / l);
      }
      return { times, outputs: { line } };
    }

    case "macd": {
      // MACD line = EMA(fast) − EMA(slow); defined from index slow−1 where
      // BOTH EMAs exist. Signal = EMA(signal) of the DEFINED macd segment
      // (seeded by its SMA — same init as emaKernel). Histogram = macd − signal.
      const closes = candles.map((c) => c.c);
      const fast = emaKernel(closes, instance.fast);
      const slow = emaKernel(closes, instance.slow);
      const macd: Series = closes.map((_, i) => {
        const f = fast[i];
        const s = slow[i];
        return typeof f === "number" && typeof s === "number" ? f - s : null;
      });
      const signal = emaSparseKernel(macd, instance.signal);
      const histogram: Series = macd.map((m, i) => {
        const s = signal[i];
        return typeof m === "number" && typeof s === "number" ? m - s : null;
      });
      return { times, outputs: { macd, signal, histogram } };
    }

    case "bbands": {
      const closes = candles.map((c) => c.c);
      const basis = smaKernel(closes, instance.period);
      const sd = stddevKernel(closes, instance.period);
      const upper: Series = basis.map((b, i) => {
        const s = sd[i];
        return typeof b === "number" && typeof s === "number" ? b + instance.stddev * s : null;
      });
      const lower: Series = basis.map((b, i) => {
        const s = sd[i];
        return typeof b === "number" && typeof s === "number" ? b - instance.stddev * s : null;
      });
      return { times, outputs: { basis, upper, lower } };
    }

    case "atr": {
      // First ATR = arithmetic mean of the first `period` true ranges
      // (index period−1); later values = Wilder recursion.
      const tr = trueRangeKernel(candles);
      return { times, outputs: { line: wilderKernel(tr, instance.period) } };
    }

    case "volume": {
      const volume: Series = candles.map((c) => (Number.isFinite(c.v) ? c.v : null));
      return { times, outputs: { volume } };
    }

    default: {
      // Exhaustive guard — a new registry entry without a calculation is a
      // compile error through this assert, never a silent placeholder.
      const unreachable: never = instance;
      throw new Error(`indicator type not implemented: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Latest VALID value per output (legend readout). Returns the last non-null
 * point of each output and the candle time it belongs to (unix seconds).
 */
export function latestValues(
  calculation: IndicatorCalculation,
): { time: number | null; values: Partial<Record<IndicatorOutputId, number>> } {
  const values: Partial<Record<IndicatorOutputId, number>> = {};
  let time: number | null = null;
  for (const [key, series] of Object.entries(calculation.outputs) as [
    IndicatorOutputId,
    Series,
  ][]) {
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const v = series[i];
      if (typeof v === "number" && Number.isFinite(v)) {
        values[key] = v;
        if (time === null) time = calculation.times[i] ?? null;
        break;
      }
    }
  }
  return { time, values };
}
