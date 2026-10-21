import type { IndicatorCalculation, IndicatorOutputId } from "./calculate";

/**
 * Indicator value lookups — PURE (Phase 5 crosshair §5).
 *
 * Lives in the indicators DOMAIN (not the charting layer) so it is
 * testable without Lightweight Charts: a calculation is plain data
 * ({ times, outputs }) and the lookups are exact-time reads over it.
 *
 * Honesty contract: the crosshair always reports a loaded bar's open time,
 * so an EXACT match is the honest contract — anything else (uncomputed bar,
 * warm-up nulls, gap in coverage) yields NO value rather than an
 * interpolation or a stale neighbor.
 */

/**
 * Exact bar-open index for a unix-second time (-1 when absent).
 * Binary search over the calculation's own (ascending) times.
 */
export function indicatorIndexOfTime(calc: IndicatorCalculation, timeSec: number): number {
  const times = calc.times;
  let lo = 0;
  let hi = times.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = times[mid]!;
    if (t === timeSec) return mid;
    if (t < timeSec) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * Every defined output value of one calculation at a bar index
 * (null when the index is out of range or every output is in warm-up).
 */
export function indicatorValuesAtIndex(
  calc: IndicatorCalculation,
  index: number,
): Partial<Record<IndicatorOutputId, number>> | null {
  if (index < 0 || index >= calc.times.length) return null;
  const out: Partial<Record<IndicatorOutputId, number>> = {};
  for (const [key, values] of Object.entries(calc.outputs) as [
    IndicatorOutputId,
    (number | null)[],
  ][]) {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Convenience: values AT a time in one call (null when absent). */
export function indicatorValuesAtTime(
  calc: IndicatorCalculation,
  timeSec: number,
): Partial<Record<IndicatorOutputId, number>> | null {
  if (!Number.isFinite(timeSec)) return null;
  const index = indicatorIndexOfTime(calc, timeSec);
  if (index < 0) return null;
  return indicatorValuesAtIndex(calc, index);
}
