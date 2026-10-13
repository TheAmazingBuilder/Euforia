import type { Timeframe } from "@cosmoz/shared";

/**
 * Trade → chart plumbing (feature Charts). Every entry point a chart needs to
 * be LINKED to the journal data: the instrument's broker symbol maps to a
 * TradingView ticker, the canonical timeframe maps to a TV interval, and the
 * candles arrive in canvas-ready form.
 */

export interface TradingViewMapping {
  /** Full TV ticker, e.g. "BINANCE:BTCUSDT". */
  tvSymbol: string;
  /** Exchange display name for the UI hint. */
  exchange: string;
}

/**
 * Instrument symbol → TradingView ticker. The fixture catalog is the source
 * of truth; unknown symbols fall back to the bare ticker (TV symbol search).
 */
const TV_SYMBOL_MAP: Readonly<Record<string, TradingViewMapping>> = {
  EURUSD: { tvSymbol: "FX:EURUSD", exchange: "FX" },
  GBPUSD: { tvSymbol: "FX:GBPUSD", exchange: "FX" },
  XAUUSD: { tvSymbol: "OANDA:XAUUSD", exchange: "OANDA" },
  BTCUSDT: { tvSymbol: "BINANCE:BTCUSDT", exchange: "BINANCE" },
  ETHUSDT: { tvSymbol: "BINANCE:ETHUSDT", exchange: "BINANCE" },
  BOOM500: { tvSymbol: "DERIV:BOOM500", exchange: "DERIV" },
  CRASH500: { tvSymbol: "DERIV:CRASH500", exchange: "DERIV" },
  "VOL75(1s)": { tvSymbol: "DERIV:VOL75S", exchange: "DERIV" },
  VOL75: { tvSymbol: "DERIV:VOL75", exchange: "DERIV" },
};

export function toTradingViewSymbol(symbol: string): TradingViewMapping {
  return (
    TV_SYMBOL_MAP[symbol] ?? { tvSymbol: symbol.toUpperCase(), exchange: "—" }
  );
}

/** Canonical timeframe → TradingView widget interval. */
const TV_INTERVAL_MAP: Readonly<Record<Timeframe, string>> = {
  M1: "1",
  M5: "5",
  M15: "15",
  H1: "60",
  H4: "240",
  D1: "D",
};

export function toTradingViewInterval(timeframe: Timeframe): string {
  return TV_INTERVAL_MAP[timeframe];
}

/** ECharts data item for a time-axis candlestick: [t, open, close, low, high]. */
export function toCandleSeriesRow(candle: { t: string; o: number; c: number; l: number; h: number }): [number, number, number, number, number] {
  return [Date.parse(candle.t), candle.o, candle.c, candle.l, candle.h];
}
