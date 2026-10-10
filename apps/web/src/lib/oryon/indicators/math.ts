/**
 * Oryon indicator kernels — pure array math (Phase 3 spec §4B).
 *
 * Discipline:
 *  - NO imports from chart/browser/React modules — this file is independently
 *    testable (bun: scripts/oryon-indicator-tests.ts) and stays honest.
 *  - Conventions are DOCUMENTED per kernel and verified against
 *    hand-computed fixtures. No intermediate rounding (Phase 3 spec §6).
 *  - Warm-up values are `null`, never 0, never fabricated numbers.
 *
 * Floating-point: sliding sums are periodically refreshed (see smaKernel) and
 * the stddev kernel is a two-pass per-window computation — the numerically
 * stable form (E[x²]−mean² is avoided deliberately: catastrophic
 * cancellation on instruments where σ ≪ mean).
 */

/** A computed line aligned with the candle window; null = not defined yet. */
export type Series = (number | null)[];

/**
 * Simple Moving Average — arithmetic mean over the trailing window.
 * Defined from index `period − 1`.
 */
export function smaKernel(values: readonly number[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  if (!Number.isInteger(period) || period < 1 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    // Periodic refresh kills accumulated sliding-subtraction drift.
    if (i >= period - 1) {
      if ((i - (period - 1)) % 64 === 63) {
        let exact = 0;
        for (let j = i - period + 1; j <= i; j += 1) exact += values[j]!;
        sum = exact;
      }
      out[i] = sum / period;
    }
  }
  return out;
}

/**
 * Exponential Moving Average — documented initialization: the FIRST value
 * (index `period − 1`) is the SMA of the first `period` inputs; every later
 * value applies the smoothing factor k = 2/(period+1):
 *   ema[i] = value·k + ema[i−1]·(1−k)
 */
export function emaKernel(values: readonly number[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  if (!Number.isInteger(period) || period < 1 || values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * EMA over a series with leading nulls (MACD signal line): the dense
 * sub-sequence of DEFINED values is extracted, EMA'd from its first defined
 * index, then mapped back to the original positions. For the MACD signal
 * this anchors the seed at the first defined MACD value — no warm-up holes
 * inside the smoothed window.
 */
export function emaSparseKernel(values: readonly (number | null)[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  const denseIdx: number[] = [];
  const dense: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      denseIdx.push(i);
      dense.push(v);
    }
  }
  const inner = emaKernel(dense, period);
  for (let j = 0; j < denseIdx.length; j += 1) out[denseIdx[j]!] = inner[j] ?? null;
  return out;
}

/**
 * Wilder smoothing (RSI / ATR): the first value (index `period − 1`) is the
 * arithmetic mean of the first `period` inputs; subsequent values apply
 *   w[i] = (w[i−1]·(period−1) + value) / period
 * — the classic Wilder recursion, equivalent to an EMA with k = 1/period.
 */
export function wilderKernel(values: readonly number[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  if (!Number.isInteger(period) || period < 1 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Population standard deviation over the trailing window (divide by `period`
 * — the TradingView Bollinger convention; sample σ would divide by p−1).
 * Two-pass per window: numerically stable for instruments where σ ≪ mean.
 * Defined from index `period − 1`.
 */
export function stddevKernel(values: readonly number[], period: number): Series {
  const out: Series = new Array<number | null>(values.length).fill(null);
  if (!Number.isInteger(period) || period < 2 || values.length < period) return out;

  for (let i = period - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += values[j]!;
    const mean = sum / period;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = values[j]! - mean;
      acc += d * d;
    }
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

/**
 * True range: h−l on the first bar, then max(h−l, |h−prevClose|, |l−prevClose|).
 */
export function trueRangeKernel(
  bars: readonly { h: number; l: number; c: number }[],
): number[] {
  return bars.map((bar, i) => {
    if (i === 0) return bar.h - bar.l;
    const prevClose = bars[i - 1]!.c;
    return Math.max(bar.h - bar.l, Math.abs(bar.h - prevClose), Math.abs(bar.l - prevClose));
  });
}
