import type { AssetClass } from "@cosmoz/shared";

/**
 * Instrument presets for the Lot Size Calculator — EDITABLE TYPICAL SPECS.
 *
 * Rule of the codebase (schemas/instrument.ts): "Specs live per instrument;
 * there are NO per-asset-class constants in code." These presets are the
 * calculator's convenience layer: every value is standard textbook
 * convention, rendered openly in the form's Advanced parameters and editable
 * per trade — never presented as universally correct across brokers. The
 * pipSize/contractSize/digits values mirror the mock instrument catalog
 * (mocks/fixtures/catalog.ts) wherever an instrument exists there.
 */

export interface InstrumentPreset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Price increment of one pip, e.g. "0.0001" forex majors, "0.01" XAUUSD. */
  pipSize: string;
  /** Display digits for prices (drives formatPrice). */
  digits: number;
  /** Units per lot/contract, e.g. "100000" EURUSD, "100" XAUUSD. */
  contractSize: string;
  /** Broker volume increment — the repo default "0.01" (micro-lot). */
  volumeStep: string;
}

export const INSTRUMENT_PRESETS: readonly InstrumentPreset[] = [
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    assetClass: "FOREX",
    pipSize: "0.0001",
    digits: 5,
    contractSize: "100000",
    volumeStep: "0.01",
  },
  {
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    assetClass: "FOREX",
    pipSize: "0.0001",
    digits: 5,
    contractSize: "100000",
    volumeStep: "0.01",
  },
  {
    symbol: "USDJPY",
    name: "US Dollar / Japanese Yen",
    assetClass: "FOREX",
    pipSize: "0.01",
    digits: 3,
    contractSize: "100000",
    volumeStep: "0.01",
  },
  {
    symbol: "XAUUSD",
    name: "Gold / US Dollar",
    assetClass: "METAL",
    pipSize: "0.01",
    digits: 2,
    contractSize: "100",
    volumeStep: "0.01",
  },
  {
    symbol: "NAS100",
    name: "Nasdaq 100 Index",
    assetClass: "INDEX",
    pipSize: "1",
    digits: 2,
    contractSize: "1",
    volumeStep: "0.01",
  },
  {
    symbol: "BTCUSDT",
    name: "Bitcoin / US Dollar",
    assetClass: "CRYPTO",
    pipSize: "1",
    digits: 2,
    contractSize: "1",
    volumeStep: "0.01",
  },
];

/** The CUSTOM sentinel — reveals empty advanced fields the trader fills in. */
export const CUSTOM_INSTRUMENT = "__custom__";

export function findInstrumentPreset(symbol: string): InstrumentPreset | null {
  return INSTRUMENT_PRESETS.find((preset) => preset.symbol === symbol) ?? null;
}
