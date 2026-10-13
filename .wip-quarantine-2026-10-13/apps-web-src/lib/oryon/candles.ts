import {
  candlesResponseSchema,
  type Candle,
  type MarketInterval,
  type QuoteSource,
} from "@cosmoz/shared";

/**
 * Oryon candle data utilities — PURE functions only (no React, no fetch).
 *
 * Contract (docs/specs/oryon-prd.md §10.1): every candle response is
 * validated with `candlesResponseSchema` before use, rows are sanitized
 * (finite OHLC, sane high/low), sorted by bucket-open time and deduplicated
 * by `t`. Missing buckets render as gaps — no candle is ever invented here.
 *
 * `t` is the bucket OPEN time in epoch milliseconds (UTC, internal rule).
 * Lightweight Charts wants UTCTimestamp SECONDS — conversion happens in the
 * chart engine, never in UI components.
 */

/** Interval → milliseconds (mirrors the market-service INTERVAL_MS table). */
export const INTERVAL_MS: Record<MarketInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

/** Timeframes the toolbar may offer — straight from the shared contract. */
export const SUPPORTED_INTERVALS: readonly MarketInterval[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
];

export interface NormalizedFeed {
  source: QuoteSource | null;
  candles: Candle[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate a raw /candles payload and sanitize its rows. Returns the source
 * label plus a clean ascending series — or a fallback when the payload is
 * unusable (the caller renders the honest error/empty state).
 */
export function normalizeCandlesResponse(raw: unknown): NormalizedFeed {
  const parsed = candlesResponseSchema.safeParse(raw);
  if (!parsed.success) return { source: null, candles: [] };

  const byTime = new Map<number, Candle>();
  for (const row of parsed.data.candles) {
    const { t, o, h, l, c, v } = row;
    if (
      !isFiniteNumber(t) ||
      !isFiniteNumber(o) ||
      !isFiniteNumber(h) ||
      !isFiniteNumber(l) ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(v) ||
      t <= 0 ||
      h < Math.max(o, c) ||
      l > Math.min(o, c) ||
      h < l
    ) {
      continue; // corrupt row — drop it, keep the rest honestly
    }
    byTime.set(t, { t, o, h, l, c, v });
  }
  const candles = [...byTime.values()].sort((a, b) => a.t - b.t);
  return { source: parsed.data.source, candles };
}

/**
 * Merge several candle windows (initial history + backfill windows) into one
 * ascending, deduplicated series — later windows win on duplicate `t` so a
 * refetched bucket replaces its older copy.
 */
export function mergeCandleWindows(...windows: Candle[][]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const window of windows) {
    for (const candle of window) {
      byTime.set(candle.t, candle);
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/** Oldest bucket of a merged series (null when empty). */
export function oldestTime(candles: Candle[]): number | null {
  return candles.length > 0 ? candles[0]!.t : null;
}

/**
 * Next backfill window ending at `oldestT` (exclusive): ask the service for
 * the `size` buckets immediately BEFORE the oldest candle already loaded.
 */
export function previousWindow(
  oldestT: number,
  interval: MarketInterval,
  size = 300,
): { from: number; to: number } {
  const step = INTERVAL_MS[interval];
  return { from: oldestT - size * step, to: oldestT };
}

/**
 * Merge one live quote into the CURRENT bucket — the pure heart of the
 * tick→candle fusion (docs/specs/oryon-prd.md §10.2). Returns the bar to
 * upsert, or null when the tick must be ignored (stale/out-of-order tick).
 * Volume is unknown per tick: updates keep the historical volume, appended
 * buckets start at 0 (the next refetch restores the real value).
 */
export function upsertTickBar(
  last: Candle | null,
  price: number,
  ts: number,
  interval: MarketInterval,
): Candle | null {
  if (!isFiniteNumber(price) || price <= 0 || !isFiniteNumber(ts) || ts <= 0) {
    return null;
  }
  const step = INTERVAL_MS[interval];
  const bucket = Math.floor(ts / step) * step;

  if (last === null) {
    return { t: bucket, o: price, h: price, l: price, c: price, v: 0 };
  }
  if (bucket === last.t) {
    return {
      ...last,
      h: Math.max(last.h, price),
      l: Math.min(last.l, price),
      c: price,
    };
  }
  if (bucket > last.t) {
    return { t: bucket, o: price, h: price, l: price, c: price, v: 0 };
  }
  return null; // older than the newest bucket — stale tick, ignore
}

/** Price formatting driven by the instrument's `digits` (never hardcoded). */
export function formatPrice(price: number, digits: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
