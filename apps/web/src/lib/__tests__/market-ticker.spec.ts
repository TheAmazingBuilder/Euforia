import { describe, expect, it } from "vitest";

import type { LiveQuote } from "../realtime/market";
import {
  formatMarketSymbol,
  isQuoteFresh,
  marketTypeLabel,
  pricePrecision,
  quoteChangePercent,
  selectRealTickerQuotes,
} from "../realtime/market-ticker";

const realBtc: LiveQuote = {
  symbol: "BTCUSDT",
  price: 68_500,
  prevClose: 67_500,
  ts: 10_000,
  source: "real",
  provider: "binance",
  marketType: "CRYPTO_SPOT",
  quoteCurrency: "USDT",
};

describe("real market ticker", () => {
  it("excludes simulated data even when it is valid and newer", () => {
    const simulated: LiveQuote = {
      ...realBtc,
      symbol: "EURUSD",
      price: 1.09,
      prevClose: 1.08,
      ts: 20_000,
      source: "sim",
      provider: "deriv",
      marketType: "FOREX",
      quoteCurrency: "USD",
    };
    expect(selectRealTickerQuotes([simulated, realBtc])).toEqual([realBtc]);
  });

  it("rejects invalid prices and timestamps", () => {
    const invalid: LiveQuote[] = [
      { ...realBtc, symbol: "ZERO", price: 0 },
      { ...realBtc, symbol: "NAN", price: Number.NaN },
      { ...realBtc, symbol: "NO-TIMESTAMP", ts: 0 },
    ];
    expect(selectRealTickerQuotes([...invalid, realBtc])).toEqual([realBtc]);
  });

  it("keeps a real quote if upstream has no 24-hour reference price", () => {
    const quote = { ...realBtc, prevClose: null };
    expect(selectRealTickerQuotes([quote])).toEqual([quote]);
    expect(quoteChangePercent(quote)).toBeNull();
  });

  it("calculates changes only from a real reference", () => {
    expect(quoteChangePercent(realBtc)).toBeCloseTo(1.48148148);
    expect(quoteChangePercent({ price: 100, prevClose: 0 })).toBeNull();
  });

  it("formats crypto, FX, metals and Deriv synthetic names correctly", () => {
    const eurusd = { ...realBtc, symbol: "EURUSD", marketType: "FOREX" as const, quoteCurrency: "USD" };
    const gold = { ...realBtc, symbol: "XAUUSD", marketType: "METAL" as const, quoteCurrency: "USD" };
    const volatility = { ...realBtc, symbol: "VOL75(1s)", marketType: "SYNTHETIC" as const, quoteCurrency: null };
    expect(formatMarketSymbol(realBtc)).toBe("BTC/USDT");
    expect(formatMarketSymbol(eurusd)).toBe("EUR/USD");
    expect(formatMarketSymbol(gold)).toBe("XAU/USD");
    expect(formatMarketSymbol(volatility)).toBe("Volatility 75 (1s)");
    expect(marketTypeLabel(volatility.marketType)).toBe("DERIV SYNTHETIC");
    expect(pricePrecision({ symbol: "USDJPY", marketType: "FOREX" })).toBe(3);
  });

  it("marks old quotes stale and fresh quotes live", () => {
    expect(isQuoteFresh(realBtc, 17_999, 8_000)).toBe(true);
    expect(isQuoteFresh(realBtc, 18_001, 8_000)).toBe(false);
    expect(isQuoteFresh({ ts: 0 }, 20_000, 8_000)).toBe(false);
  });
});
