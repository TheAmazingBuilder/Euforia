import type { Candle, MarketAssetClass, Tick } from "./types";

export interface DerivMarket {
  symbol: string;
  remoteSymbol: string;
  marketType: MarketAssetClass;
  quoteCurrency: string | null;
}

export const DERIV_MARKETS: readonly DerivMarket[] = [
  { symbol: "EURUSD", remoteSymbol: "frxEURUSD", marketType: "FOREX", quoteCurrency: "USD" },
  { symbol: "GBPUSD", remoteSymbol: "frxGBPUSD", marketType: "FOREX", quoteCurrency: "USD" },
  { symbol: "USDJPY", remoteSymbol: "frxUSDJPY", marketType: "FOREX", quoteCurrency: "JPY" },
  { symbol: "XAUUSD", remoteSymbol: "frxXAUUSD", marketType: "METAL", quoteCurrency: "USD" },
  { symbol: "BOOM500", remoteSymbol: "BOOM500", marketType: "SYNTHETIC", quoteCurrency: null },
  { symbol: "CRASH500", remoteSymbol: "CRASH500", marketType: "SYNTHETIC", quoteCurrency: null },
  { symbol: "VOL75(1s)", remoteSymbol: "1HZ75V", marketType: "SYNTHETIC", quoteCurrency: null },
] as const;

type UnknownRecord = Record<string, unknown>;
function recordOf(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}
function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function availableDerivMarkets(message: unknown): DerivMarket[] {
  const root = recordOf(message);
  const data = recordOf(root?.data);
  const entries = arrayOf(root?.active_symbols ?? data?.active_symbols);
  const active = new Set(entries.flatMap((entry) => {
    const item = recordOf(entry);
    const symbol = item?.underlying_symbol ?? item?.symbol;
    return typeof symbol === "string" && symbol.length > 0 ? [symbol] : [];
  }));
  return DERIV_MARKETS.filter((market) => active.has(market.remoteSymbol));
}

export function normalizeDerivTick(message: unknown, market: DerivMarket, prevClose: number | null): Tick | null {
  const root = recordOf(message);
  const tick = recordOf(root?.tick);
  if (!tick) return null;
  const receivedSymbol = tick.symbol ?? tick.underlying_symbol;
  if (typeof receivedSymbol === "string" && receivedSymbol !== market.remoteSymbol) return null;
  const price = positiveNumber(tick.quote);
  const epoch = Number(tick.epoch);
  if (price === null || !Number.isFinite(epoch) || epoch <= 0) return null;
  return {
    symbol: market.symbol,
    price,
    prevClose: positiveNumber(prevClose),
    ts: Math.trunc(epoch * 1_000),
    source: "real",
    provider: "deriv",
    marketType: market.marketType,
    quoteCurrency: market.quoteCurrency,
  };
}

/** Return a provider tick close to the requested reference time, or null. */
export function referencePriceFromHistory(
  message: unknown,
  targetEpochSeconds: number,
  maxDistanceSeconds = 180,
): number | null {
  const root = recordOf(message);
  const history = recordOf(root?.history) ?? root;
  const prices = arrayOf(history?.prices);
  const times = arrayOf(history?.times);
  if (prices.length === 0 || prices.length !== times.length) return null;
  let selectedPrice: number | null = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < times.length; index += 1) {
    const timestamp = Number(times[index]);
    const price = positiveNumber(prices[index]);
    if (!Number.isFinite(timestamp) || price === null) continue;
    const distance = Math.abs(timestamp - targetEpochSeconds);
    if (distance < selectedDistance) {
      selectedDistance = distance;
      selectedPrice = price;
    }
  }
  return selectedDistance <= maxDistanceSeconds ? selectedPrice : null;
}

export function candlesFromDerivHistory(message: unknown): Candle[] {
  const root = recordOf(message);
  const candles = arrayOf(root?.candles ?? recordOf(root?.history)?.candles);
  const normalized: Candle[] = [];
  for (const raw of candles) {
    const row = recordOf(raw);
    if (!row) continue;
    const time = Number(row.epoch);
    const open = positiveNumber(row.open);
    const high = positiveNumber(row.high);
    const low = positiveNumber(row.low);
    const close = positiveNumber(row.close);
    if (!Number.isFinite(time) || time <= 0 || open === null || high === null || low === null || close === null || high < low) continue;
    normalized.push({ t: Math.trunc(time * 1_000), o: open, h: high, l: low, c: close, v: 0 });
  }
  return normalized.sort((left, right) => left.t - right.t);
}
