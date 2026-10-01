/**
 * Market Data Provider contract (mission §34) — one interface, many sources.
 * The service composes providers; each owns its transport and its health.
 * `source` travels with EVERY tick/candle so the UI can label simulated
 * data honestly (mission §33: never present a simulated feed as real).
 */

/** A single price observation for an INTERNAL symbol (catalog ticker). */
export interface Tick {
  symbol: string;
  price: number;
  /** Reference close for change % (24h open, session anchor…). */
  prevClose: number;
  ts: number;
  source: "real" | "sim";
}

/** OHLCV candle, chart-native numbers; t = bucket open time (ms epoch). */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly source: "real" | "sim";
  /** True when this provider serves the internal symbol. */
  handles(symbol: string): boolean;
  /** Start streaming ticks through `emit`. Idempotent. */
  start(emit: (tick: Tick) => void): void | Promise<void>;
  /** Release transports (sockets, timers). Idempotent. */
  stop(): void;
  /** Observability for /health (mission §28) — no secrets. */
  status(): Record<string, unknown>;
  /**
   * Candle history for the chart datafeed. When `from`/`to` (epoch ms) are
   * given the provider serves that window (session replay) — bounded by
   * `limit`; providers that cannot honor historical windows return what
   * they honestly retain, never fabricated "real" data.
   */
  candles(symbol: string, interval: string, limit: number, from?: number, to?: number): Promise<Candle[]>;
}

/** Intervals the Session Live exposes (1H/4H/1D = internal convention). */
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
