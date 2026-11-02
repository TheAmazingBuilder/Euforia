import { describe, expect, it } from "vitest";

import type { LiveQuote } from "../realtime/market";
import { isQuoteFresh, quoteChangePercent, selectRealTickerQuotes } from "../realtime/market-ticker";

const realBtc: LiveQuote = {
  symbol: "BTCUSDT",
  price: 68_500,
  prevClose: 67_500,
  ts: 10_000,
  source: "real",
};

describe("real market ticker filtering", () => {
  it("excludes simulated prices even when they are valid and newer", () => {
    const simulated: LiveQuote = {
      symbol: "EURUSD",
      price: 1.09,
      prevClose: 1.08,
      ts: 20_000,
      source: "sim",
    };
    expect(selectRealTickerQuotes([simulated, realBtc])).toEqual([realBtc]);
  });

  it("rejects invalid real observations instead of displaying them", () => {
    const invalid: LiveQuote[] = [
      { ...realBtc, symbol: "ZERO", price: 0 },
      { ...realBtc, symbol: "NAN", price: Number.NaN },
      { ...realBtc, symbol: "BAD-BASE", prevClose: 0 },
      { ...realBtc, symbol: "NO-TIMESTAMP", ts: 0 },
    ];
    expect(selectRealTickerQuotes([...invalid, realBtc])).toEqual([realBtc]);
  });

  it("sorts verified symbols deterministically", () => {
    const eth = { ...realBtc, symbol: "ETHUSDT", price: 3_500 };
    expect(selectRealTickerQuotes([realBtc, eth]).map((quote) => quote.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("calculates percentage change from the provider reference price", () => {
    expect(quoteChangePercent(realBtc)).toBeCloseTo(1.48148148);
    expect(quoteChangePercent({ price: 100, prevClose: 0 })).toBeNull();
  });

  it("marks old quotes stale and fresh quotes live", () => {
    expect(isQuoteFresh(realBtc, 17_999, 8_000)).toBe(true);
    expect(isQuoteFresh(realBtc, 18_001, 8_000)).toBe(false);
    expect(isQuoteFresh({ ts: 0 }, 20_000, 8_000)).toBe(false);
  });
});
