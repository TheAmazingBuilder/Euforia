import type { Candle } from "@cosmoz/shared";

import { normalizeCandles } from "@/lib/oryon/structure/pivots";

/**
 * Oryon key-level engine (Phase 9 spec §5.1, §5.2, §5.4) — previous-day and
 * previous-week reference levels.
 *
 * DATA SOURCE (an explicit, documented convention — spec §5.4): the levels
 * are computed from the DAILY candle series the market service itself
 * serves (`interval: "1D"`), i.e. the datafeed's OWN day buckets. A
 * calendar day here is therefore the datafeed's UTC-midnight bucket - the
 * authoritative convention of this repo's market data. The browser's local
 * timezone is NEVER consulted (§5.4 critical rule), and no exchange-local
 * session boundary is invented (§5.4: a calendar day is not a trading
 * session — for instruments whose exchange day differs, this is the
 * datafeed convention, disclosed in the UI source note).
 *
 * WEEK CONVENTION (documented, spec §5.4 "define period boundaries
 * explicitly"): weeks are ISO weeks - Monday 00:00 UTC to Sunday 24:00 UTC
 * — over the daily series. The CURRENT (partial) week never produces
 * levels; the previous week with available candles does.
 *
 * Correctness contract:
 *  - candles are sanitized (chronological, first-wins duplicates, invalid
 *    candles dropped — see normalizeCandles);
 *  - aggregation uses ONLY valid candles actually available to the app;
 *  - a missing day/week is SKIPPED (the previous existing period is used) —
 *    a weekend gap never produces a zero or a fabricated level;
 *  - `null` results mean "unavailable" — the UI shows an explicit state,
 *    never a guessed price (§11);
 *  - symbol isolation is structural: the engine sees one candle array for
 *    one symbol (the caller's query key guarantees it - §9.3).
 */

export interface OryonPeriodLevels {
  /** Period identity: UTC date key ("2026-10-09") for days, the Monday
   *  date key for weeks. */
  readonly periodKey: string;
  /** Period open time (epoch ms, UTC) — informative. */
  readonly periodStartMs: number;
  readonly high: number;
  readonly low: number;
  readonly open: number;
  readonly close: number;
  /** Candles that actually contributed (exposed for honest coverage). */
  readonly candleCount: number;
}

const DAY_MS = 86_400_000;

/** UTC date key "YYYY-MM-DD" of an epoch-ms instant (repo convention). */
function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday 00:00 UTC (epoch ms) of the UTC day containing `ms`. */
function weekStartMs(ms: number): number {
  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS;
  const weekday = new Date(dayStart).getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (weekday + 6) % 7;
  return dayStart - daysSinceMonday * DAY_MS;
}

/**
 * Aggregates one period from the candles INSIDE [startMs, startMs+period).
 * Assumes a chronological, already-normalized array; returns null when the
 * window holds no valid candle (never a zero-filled fake).
 */
function aggregatePeriod(
  candles: readonly Candle[],
  startMs: number,
  periodMs: number,
  periodKey: string,
): OryonPeriodLevels | null {
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let open: number | null = null;
  let close: number | null = null;
  let count = 0;
  for (const candle of candles) {
    if (candle.t < startMs) continue;
    if (candle.t >= startMs + periodMs) break;
    count += 1;
    if (candle.h > high) high = candle.h;
    if (candle.l < low) low = candle.l;
    if (open === null) open = candle.o;
    close = candle.c;
  }
  if (count === 0 || open === null || close === null) return null;
  return { periodKey, periodStartMs: startMs, high, low, open, close, candleCount: count };
}

/**
 * Previous-day levels over a DAILY (or any) candle series: the most recent
 * COMPLETE UTC day before the last candle's day that has valid candles.
 * Null when no prior day exists in the data (insufficient coverage).
 */
export function computePreviousDayLevels(candles: readonly Candle[]): OryonPeriodLevels | null {
  const data = normalizeCandles(candles);
  if (data.length === 0) return null;
  const lastDay = Math.floor(data[data.length - 1]!.t / DAY_MS);
  // Walk the daily buckets backwards — at most the span of the data.
  for (let day = lastDay - 1; day >= Math.floor(data[0]!.t / DAY_MS); day -= 1) {
    const levels = aggregatePeriod(data, day * DAY_MS, DAY_MS, utcDateKey(day * DAY_MS));
    if (levels !== null) return levels;
  }
  return null;
}

/**
 * Previous-week levels: the most recent COMPLETE ISO week (Monday 00:00
 * UTC) before the last candle's week that has valid candles. The current,
 * partial week is always excluded.
 */
export function computePreviousWeekLevels(candles: readonly Candle[]): OryonPeriodLevels | null {
  const data = normalizeCandles(candles);
  if (data.length === 0) return null;
  const currentWeekStart = weekStartMs(data[data.length - 1]!.t);
  const firstWeekStart = weekStartMs(data[0]!.t);
  for (let weekStart = currentWeekStart - 7 * DAY_MS; weekStart >= firstWeekStart; weekStart -= 7 * DAY_MS) {
    const levels = aggregatePeriod(data, weekStart, 7 * DAY_MS, utcDateKey(weekStart));
    if (levels !== null) return levels;
  }
  return null;
}
