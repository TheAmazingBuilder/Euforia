/**
 * Pure time-axis projection for Oryon drawings (PRD §8.3 — no pixels in the
 * domain, no domain in the pixels).
 *
 * Lightweight Charts positions bars by CONSECUTIVE LOGICAL INDEX (its time
 * scale is index-based; `timeToCoordinate` returns null for any time that is
 * not exactly a loaded bar). Our projection therefore works in logical space
 * too:
 *
 *   time ↔ logical   — binary search + linear interpolation over the loaded
 *                      bar times, extrapolated beyond the edges with the
 *                      MEDIAN bar spacing (robust to session gaps/weekends)
 *   logical ↔ x      — exact linear map of the chart's visible logical range
 *                      onto the plot width (this IS Lightweight Charts'
 *                      internal projection: barSpacing is uniform)
 *
 * Benefits: works for anchors outside the loaded data (PRD §8.3 degraded
 * cases: "rendu hors-range, re-attaché à l'arrivée des données"), never
 * substitutes arbitrary coordinates (null = genuinely unmappable), and the
 * math is pure — unit-testable without a chart instance.
 *
 * All times are epoch MILLISECONDS (internal UTC rule); all x/y are CSS
 * pixels relative to the plot origin.
 */

export interface BarTimeline {
  /** Ascending bar-open times (ms). */
  readonly times: Float64Array;
  readonly count: number;
  /** Median spacing between consecutive bars (ms); null with < 2 bars. */
  readonly medianSpacing: number | null;
}

/** Build the lookup structure from an ascending time list. */
export function buildTimeline(sortedTimesMs: readonly number[]): BarTimeline {
  const times = Float64Array.from(sortedTimesMs);
  let medianSpacing: number | null = null;
  if (times.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i += 1) {
      gaps.push(times[i]! - times[i - 1]!);
    }
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    medianSpacing =
      gaps.length % 2 === 1
        ? gaps[mid]!
        : (gaps[mid - 1]! + gaps[mid]!) / 2;
  }
  return { times, count: times.length, medianSpacing };
}

/**
 * Map a time (ms) to its fractional logical index. Inside the data: linear
 * interpolation between the surrounding bars. Outside: extrapolation with
 * the median spacing. Returns null only when mapping is impossible (no
 * bars, or a single bar and a time other than its own).
 */
export function timeToLogical(timeline: BarTimeline, timeMs: number): number | null {
  const { times, count } = timeline;
  if (count === 0 || !Number.isFinite(timeMs)) return null;
  if (timeMs <= times[0]!) {
    if (timeMs === times[0]! || count === 1) {
      return count === 1 && timeMs !== times[0]! ? null : 0;
    }
    const spacing = timeline.medianSpacing ?? 0;
    return spacing > 0 ? 0 - (times[0]! - timeMs) / spacing : null;
  }
  if (timeMs >= times[count - 1]!) {
    if (timeMs === times[count - 1]!) return count - 1;
    const spacing = timeline.medianSpacing ?? 0;
    return spacing > 0
      ? count - 1 + (timeMs - times[count - 1]!) / spacing
      : null;
  }
  // Binary search: times[lastLe] < timeMs < times[lastLe + 1]
  let low = 0;
  let high = count - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (times[mid]! <= timeMs) low = mid;
    else high = mid;
  }
  const span = times[high]! - times[low]!;
  if (span <= 0) return low;
  return low + (timeMs - times[low]!) / span;
}

/**
 * Inverse map: fractional logical index → time (ms), interpolating bar
 * times; beyond the edges, extrapolation with the median spacing. Null when
 * there are no bars (or a single bar with a fractional offset).
 */
export function logicalToTime(timeline: BarTimeline, logical: number): number | null {
  const { times, count } = timeline;
  if (count === 0 || !Number.isFinite(logical)) return null;
  if (count === 1) {
    return logical === 0 ? times[0]! : null;
  }
  if (logical <= 0) {
    const spacing = timeline.medianSpacing ?? 0;
    return spacing > 0 ? times[0]! + logical * spacing : null;
  }
  if (logical >= count - 1) {
    const spacing = timeline.medianSpacing ?? 0;
    return spacing > 0 ? times[count - 1]! + (logical - (count - 1)) * spacing : null;
  }
  const low = Math.floor(logical);
  const frac = logical - low;
  return times[low]! + (times[low + 1]! - times[low]!) * frac;
}

/**
 * The chart's visible logical range mapped onto the plot width — the exact
 * linear projection Lightweight Charts uses internally.
 */
export interface RangeProjection {
  readonly from: number;
  readonly to: number;
  readonly width: number;
}

export function logicalToX(
  projection: RangeProjection,
  logical: number,
): number | null {
  const { from, to, width } = projection;
  if (!(to > from) || !(width > 0) || !Number.isFinite(logical)) return null;
  return ((logical - from) / (to - from)) * width;
}

export function xToLogical(
  projection: RangeProjection,
  x: number,
): number | null {
  const { from, to, width } = projection;
  if (!(to > from) || !(width > 0) || !Number.isFinite(x)) return null;
  return from + (x / width) * (to - from);
}

/** Convenience: time → logical → x (null when either step fails). */
export function timeToX(
  timeline: BarTimeline,
  projection: RangeProjection,
  timeMs: number,
): number | null {
  const logical = timeToLogical(timeline, timeMs);
  return logical === null ? null : logicalToX(projection, logical);
}

/** Convenience: x → logical → time (null when either step fails). */
export function xToTime(
  timeline: BarTimeline,
  projection: RangeProjection,
  x: number,
): number | null {
  const logical = xToLogical(projection, x);
  return logical === null ? null : logicalToTime(timeline, logical);
}
