import type { MarketInterval } from "@cosmoz/shared";
import { marketIntervalSchema } from "@cosmoz/shared";

/**
 * Oryon timeframe model - single source of truth is the SHARED contract
 * (packages/shared marketIntervalSchema). Oryon never invents an interval:
 * the timeframe selector renders exactly the enum the market service
 * validates, so a selectable timeframe is always a servable timeframe.
 */

/** All intervals the market service accepts, in display order. */
export const ORYON_INTERVALS: readonly MarketInterval[] = marketIntervalSchema.options;

const INTERVAL_MS: Record<MarketInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

/** Bucket size in ms for one candle of this interval (tick→candle merge). */
export function intervalToMs(interval: MarketInterval): number {
  return INTERVAL_MS[interval];
}

/** True when the interval is intraday (drives the chart time axis). */
export function isIntraday(interval: MarketInterval): boolean {
  return INTERVAL_MS[interval] < 86_400_000;
}
