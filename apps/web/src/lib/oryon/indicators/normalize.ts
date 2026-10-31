import type { Candle } from "@cosmoz/shared";

/**
 * Candle normalization for indicator math (Phase 3 spec §6).
 *
 * Rules (verified by unit tests):
 *  - output is ordered ASCENDING by bucket-open time regardless of input order;
 *  - duplicate timestamps keep the LAST occurrence (the freshest write wins);
 *  - candles with non-finite o/h/l/c are DROPPED - never interpolated, never
 *    fabricated ("do not silently invent prices", spec §6). Volume validity
 *    is checked per-consumer: only the volume indicator reads `v`.
 *  - the input array is never mutated.
 */
export function normalizeCandles(input: readonly Candle[]): Candle[] {
  const valid = input.filter((candle) =>
    Number.isFinite(candle.o) &&
    Number.isFinite(candle.h) &&
    Number.isFinite(candle.l) &&
    Number.isFinite(candle.c),
  );

  const sorted = [...valid].sort((a, b) => a.t - b.t);

  const deduped: Candle[] = [];
  for (const candle of sorted) {
    const last = deduped[deduped.length - 1];
    if (last !== undefined && last.t === candle.t) {
      deduped[deduped.length - 1] = candle;
    } else {
      deduped.push(candle);
    }
  }
  return deduped;
}
