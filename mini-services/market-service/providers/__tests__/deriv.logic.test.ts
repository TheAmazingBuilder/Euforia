import { describe, expect, it } from "bun:test";

import {
  availableDerivMarkets,
  candlesFromDerivHistory,
  DERIV_MARKETS,
  normalizeDerivTick,
  referencePriceFromHistory,
} from "../deriv.logic";

describe("Deriv market-data normalization", () => {
  it("subscribes only to configured symbols advertised by Deriv", () => {
    const active = availableDerivMarkets({
      active_symbols: [
        { underlying_symbol: "frxEURUSD" },
        { underlying_symbol: "1HZ75V" },
        { underlying_symbol: "UNKNOWN" },
      ],
    });
    expect(active.map((market) => market.symbol)).toEqual(["EURUSD", "VOL75(1s)"]);
  });

  it("supports the legacy symbol property without inventing other markets", () => {
    const active = availableDerivMarkets({
      active_symbols: [{ symbol: "BOOM500" }, { symbol: "CRASH500" }],
    });
    expect(active.map((market) => market.remoteSymbol)).toEqual(["BOOM500", "CRASH500"]);
  });

  it("normalizes a real tick using the provider epoch and market metadata", () => {
    const market = DERIV_MARKETS.find((candidate) => candidate.symbol === "EURUSD")!;
    expect(normalizeDerivTick({
      msg_type: "tick",
      tick: { symbol: "frxEURUSD", quote: 1.08425, epoch: 1_800_000_000 },
    }, market, 1.08)).toEqual({
      symbol: "EURUSD", price: 1.08425, prevClose: 1.08, ts: 1_800_000_000_000,
      source: "real", provider: "deriv", marketType: "FOREX", quoteCurrency: "USD",
    });
  });

  it("rejects malformed, mismatched and non-positive ticks", () => {
    const market = DERIV_MARKETS.find((candidate) => candidate.symbol === "EURUSD")!;
    expect(normalizeDerivTick({ tick: { symbol: "frxGBPUSD", quote: 1.08, epoch: 1_800_000_000 } }, market, null)).toBeNull();
    expect(normalizeDerivTick({ tick: { symbol: "frxEURUSD", quote: 0, epoch: 1_800_000_000 } }, market, null)).toBeNull();
    expect(normalizeDerivTick({ tick: { symbol: "frxEURUSD", quote: 1.08, epoch: "bad" } }, market, null)).toBeNull();
  });

  it("does not estimate a missing 24-hour reference", () => {
    const message = { history: { times: [1_799_999_000], prices: ["1.08"] } };
    expect(referencePriceFromHistory(message, 1_800_000_000, 60)).toBeNull();
    expect(referencePriceFromHistory({ history: { times: [1_800_000_003], prices: ["1.08"] } }, 1_800_000_000, 60)).toBe(1.08);
  });

  it("normalizes actual candle rows and drops malformed ones", () => {
    expect(candlesFromDerivHistory({
      candles: [
        { epoch: 1_800_000_000, open: "1.08", high: "1.09", low: "1.07", close: "1.085" },
        { epoch: "bad", open: "1", high: "2", low: "1", close: "1.5" },
      ],
    })).toEqual([{ t: 1_800_000_000_000, o: 1.08, h: 1.09, l: 1.07, c: 1.085, v: 0 }]);
  });
});
