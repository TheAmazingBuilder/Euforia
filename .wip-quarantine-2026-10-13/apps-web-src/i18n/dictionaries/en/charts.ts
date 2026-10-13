import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — CHARTS namespace (canonical). The professional charting
 * module: toolbar (symbol + timeframes + overlays), the TradingView-style
 * chart legend, bid/ask badges, the range bar and feed-state copy. Static
 * strings — components compose dynamic parts (prices, P/L) themselves.
 */

export type ChartsDict = Dictionary["charts"];

export const chartsDict = {
  toolbar: {
    symbol: "Symbol",
    symbolAria: "Choose instrument",
    timeframesAria: "Timeframe",
    overlayMA: "MA 20",
    overlayTrades: "Trades",
    feedReal: "LIVE",
    feedSim: "SIM",
    feedRealTitle: "Market service feed — live candles",
    feedSimTitle: "Market service offline — deterministic simulated feed",
  },
  legend: {
    open: "O",
    high: "H",
    low: "L",
    close: "C",
    changeAria: "Bar change",
    sourceSim: "simulated feed",
    sourceReal: "market feed",
  },
  quote: {
    sell: "SELL",
    buy: "BUY",
    spreadLabel: "Spread",
  },
  range: {
    aria: "Visible range",
    defaultLabel: "Range",
  },
  clock: { utc: "UTC" },
  trades: {
    entryBuy: "Buy entry",
    entrySell: "Sell entry",
    exit: "Close",
    entryLine: "Last entry price",
  },
  states: {
    loading: "Loading candles…",
    empty: "No candles for this instrument yet.",
    hint: "Scroll to zoom · drag to pan · pinch on touch",
  },
} as const;
