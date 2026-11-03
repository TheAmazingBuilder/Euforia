/**
 * Real market-data provider contract. Providers never manufacture missing data.
 */
export type MarketProviderId = "binance" | "deriv";
export type MarketAssetClass = "CRYPTO_SPOT" | "FOREX" | "METAL" | "SYNTHETIC";

export interface Tick {
  symbol: string;
  price: number;
  /** Real reference price from the provider, null when unavailable. */
  prevClose: number | null;
  /** Provider event time, epoch milliseconds. */
  ts: number;
  source: "real";
  provider: MarketProviderId;
  marketType: MarketAssetClass;
  quoteCurrency: string | null;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Zero when the upstream market does not expose candle volume. */
  v: number;
}

export interface MarketDataProvider {
  readonly id: MarketProviderId;
  readonly source: "real";
  handles(symbol: string): boolean;
  start(emit: (tick: Tick) => void): void | Promise<void>;
  stop(): void;
  status(): Record<string, unknown>;
  candles(symbol: string, interval: string, limit: number, from?: number, to?: number): Promise<Candle[]>;
}

export const SUPPORTED_INTERVALS = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"] as const;
export type Interval = (typeof SUPPORTED_INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

export function isInterval(value: string | null): value is Interval {
  return (SUPPORTED_INTERVALS as readonly string[]).includes(value ?? "");
}
