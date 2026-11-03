import { describe, expect, it } from "vitest";

import { formatInstrumentSymbol } from "@/lib/utils/instrument";

describe("formatInstrumentSymbol", () => {
  it.each([
    ["EURUSD", "FOREX", "EUR/USD"],
    ["GBPUSD", "FOREX", "GBP/USD"],
    ["USDJPY", "FOREX", "USD/JPY"],
    ["XAUUSD", "METAL", "XAU/USD"],
    ["BTCUSDT", "CRYPTO", "BTC/USDT"],
    ["BOOM500", "SYNTHETIC", "Boom 500"],
    ["CRASH500", "SYNTHETIC", "Crash 500"],
    ["VOL75(1s)", "SYNTHETIC", "Volatility 75 (1s)"],
  ] as const)("formats %s as %s", (symbol, assetClass, expected) => {
    expect(formatInstrumentSymbol(symbol, assetClass)).toBe(expected);
  });

  it.each(["NQ", "ES", "GC", "CL", "DXY", "US30", "NAS100"])(
    "keeps the original market code %s intact",
    (symbol) => {
      expect(formatInstrumentSymbol(symbol, "INDEX")).toBe(symbol);
    },
  );

  it("preserves canonical values when the asset class is unknown", () => {
    expect(formatInstrumentSymbol("EURUSD")).toBe("EUR/USD");
    expect(formatInstrumentSymbol("BTCUSDT")).toBe("BTC/USDT");
    expect(formatInstrumentSymbol("UNKNOWN")).toBe("UNKNOWN");
  });
});
