/**
 * Instrument presets for the Lot Size Calculator (MASTER PROMPT §36).
 *
 * These are the STANDARD vanilla conventions, declared explicitly — they are
 * NOT universal: the same symbol carries different specifications between
 * brokers. Every value is overridable through the advanced parameters and
 * the UI always renders the broker disclaimer next to them.
 */

import type { InstrumentSpecification } from "./types";

export const INSTRUMENT_PRESETS: InstrumentSpecification[] = [
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    assetClass: "FOREX",
    quoteCurrency: "USD",
    baseCurrency: "EUR",
    contractSize: 100_000,
    pipSize: 0.0001,
    priceDecimals: 5,
  },
  {
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    assetClass: "FOREX",
    quoteCurrency: "USD",
    baseCurrency: "GBP",
    contractSize: 100_000,
    pipSize: 0.0001,
    priceDecimals: 5,
  },
  {
    symbol: "USDJPY",
    name: "US Dollar / Japanese Yen",
    assetClass: "FOREX",
    quoteCurrency: "JPY",
    baseCurrency: "USD",
    contractSize: 100_000,
    pipSize: 0.01,
    priceDecimals: 3,
  },
  {
    symbol: "XAUUSD",
    name: "Gold / US Dollar",
    assetClass: "METAL",
    quoteCurrency: "USD",
    baseCurrency: null,
    contractSize: 100,
    pipSize: 0.01,
    priceDecimals: 2,
  },
  {
    symbol: "NAS100",
    name: "US Tech 100 Index",
    assetClass: "INDEX",
    quoteCurrency: "USD",
    baseCurrency: null,
    contractSize: 1,
    pipSize: 1,
    priceDecimals: 2,
  },
  {
    symbol: "BTCUSD",
    name: "Bitcoin / US Dollar",
    assetClass: "CRYPTO",
    quoteCurrency: "USD",
    baseCurrency: null,
    contractSize: 1,
    pipSize: 1,
    priceDecimals: 2,
  },
];

/** User-defined instrument — every specification comes from the advanced form. */
export const CUSTOM_SPEC_TEMPLATE: InstrumentSpecification = {
  symbol: "CUSTOM",
  name: "Custom instrument",
  assetClass: "FOREX",
  quoteCurrency: "USD",
  baseCurrency: null,
  contractSize: 0,
  pipSize: 0,
  priceDecimals: 5,
};

export const CUSTOM_INSTRUMENT_SYMBOL = CUSTOM_SPEC_TEMPLATE.symbol;

export function findInstrumentPreset(symbol: string): InstrumentSpecification | null {
  return INSTRUMENT_PRESETS.find((preset) => preset.symbol === symbol) ?? null;
}

/**
 * Resolves the specification the calculator will run on: the selected preset
 * with the advanced overrides applied on top. CUSTOM instruments take every
 * value from the overrides.
 */
export function resolveSpecification(
  symbol: string,
  overrides: { contractSize?: number; pipSize?: number } = {},
): InstrumentSpecification {
  const base =
    symbol === CUSTOM_INSTRUMENT_SYMBOL
      ? { ...CUSTOM_SPEC_TEMPLATE }
      : (findInstrumentPreset(symbol) ?? { ...CUSTOM_SPEC_TEMPLATE, symbol });
  return {
    ...base,
    contractSize:
      overrides.contractSize !== undefined && overrides.contractSize > 0
        ? overrides.contractSize
        : base.contractSize,
    pipSize:
      overrides.pipSize !== undefined && overrides.pipSize > 0 ? overrides.pipSize : base.pipSize,
  };
}

/** Currencies offered by the calculators' account/display selector (§28). */
export const CALCULATOR_CURRENCIES = ["USD", "CAD", "EUR", "GBP", "JPY"] as const;
export type CalculatorCurrency = (typeof CALCULATOR_CURRENCIES)[number];

export function isCalculatorCurrency(currency: string): currency is CalculatorCurrency {
  return (CALCULATOR_CURRENCIES as readonly string[]).includes(currency);
}
