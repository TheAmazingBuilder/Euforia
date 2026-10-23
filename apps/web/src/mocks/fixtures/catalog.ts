import type {
  AccountType,
  AssetClass,
  Broker,
  Currency,
  MistakeCategory,
  TagCategory,
} from "@cosmoz/shared";

/**
 * Static fixture catalog definitions. "Base" prices are anchors for the
 * 90-day deterministic drift — realistic magnitudes per asset class, and
 * specs (pipSize/digits/contractSize) matching the instrument's conventions.
 * NO constants about sizing live in app code — only here, as data.
 */

export interface InstrumentDef {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quoteCurrency: Currency;
  pipSize: string;
  digits: number;
  contractSize: string;
  /** Anchor price around which the drift oscillates. */
  basePrice: number;
  /** Typical stop distance in price units [min, max]. */
  stopRange: [number, number];
  /** Relative likelihood of being traded. */
  weight: number;
}

export const INSTRUMENT_DEFS: readonly InstrumentDef[] = [
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    assetClass: "FOREX",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    digits: 5,
    contractSize: "100000",
    basePrice: 1.0865,
    stopRange: [0.0012, 0.0028],
    weight: 13,
  },
  {
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    assetClass: "FOREX",
    quoteCurrency: "USD",
    pipSize: "0.0001",
    digits: 5,
    contractSize: "100000",
    basePrice: 1.2705,
    stopRange: [0.0015, 0.0035],
    weight: 8,
  },
  {
    symbol: "XAUUSD",
    name: "Gold / US Dollar",
    assetClass: "METAL",
    quoteCurrency: "USD",
    pipSize: "0.01",
    digits: 2,
    contractSize: "100",
    basePrice: 2385.0,
    stopRange: [1.5, 4.0],
    weight: 8,
  },
  {
    symbol: "BTCUSDT",
    name: "Bitcoin / US Dollar",
    assetClass: "CRYPTO",
    quoteCurrency: "USD",
    pipSize: "1",
    digits: 2,
    contractSize: "1",
    basePrice: 61240.0,
    stopRange: [300, 900],
    weight: 5,
  },
  {
    symbol: "BOOM500",
    name: "Boom 500 Index",
    assetClass: "SYNTHETIC",
    quoteCurrency: "USD",
    pipSize: "0.01",
    digits: 2,
    contractSize: "1",
    basePrice: 9820.0,
    stopRange: [60, 180],
    weight: 7,
  },
  {
    symbol: "CRASH500",
    name: "Crash 500 Index",
    assetClass: "SYNTHETIC",
    quoteCurrency: "USD",
    pipSize: "0.01",
    digits: 2,
    contractSize: "1",
    basePrice: 8340.0,
    stopRange: [60, 180],
    weight: 5,
  },
  {
    symbol: "VOL75(1s)",
    name: "Volatility 75 (1s) Index",
    assetClass: "SYNTHETIC",
    quoteCurrency: "USD",
    pipSize: "0.01",
    digits: 2,
    contractSize: "1",
    basePrice: 128400.0,
    stopRange: [800, 2500],
    weight: 4,
  },
];

export interface AccountDef {
  name: string;
  type: AccountType;
  broker: Broker;
  currency: Currency;
  startingBalance: string;
  isDefault: boolean;
  propConfig?: {
    firm: string;
    maxDailyLossPct: number;
    maxTotalDd: number;
    profitTarget: number;
    minTradingDays: number;
  } | null;
}

export const ACCOUNT_DEFS: readonly AccountDef[] = [
  {
    name: "Deriv Live",
    type: "LIVE",
    broker: "DERIV",
    currency: "USD",
    startingBalance: "10000",
    isDefault: true,
    propConfig: null,
  },
  {
    name: "FTMO Challenge",
    type: "PROP_FIRM",
    broker: "MT5",
    currency: "USD",
    startingBalance: "100000",
    isDefault: false,
    propConfig: {
      firm: "FTMO",
      maxDailyLossPct: 5,
      maxTotalDd: 10,
      profitTarget: 10,
      minTradingDays: 4,
    },
  },
  {
    name: "Demo",
    type: "DEMO",
    broker: "DERIV",
    currency: "USD",
    startingBalance: "5000",
    isDefault: false,
    propConfig: null,
  },
];

export interface StrategyDef {
  name: string;
  description: string;
  grade: "A_PLUS" | "B" | "C";
  weight: number;
}

export const STRATEGY_DEFS: readonly StrategyDef[] = [
  {
    name: "Breakout NY",
    description:
      "Range break at the New York open on synthetics and majors. Confirmed by a 1m close beyond the pre-open high/low with rising tick volume.",
    grade: "A_PLUS",
    weight: 40,
  },
  {
    name: "S&R Inversion",
    description:
      "Failed break of a well-tested support/resistance level on H1; entry on the reclamation candle, stop beyond the wick.",
    grade: "B",
    weight: 35,
  },
  {
    name: "Range Scalping",
    description:
      "Fade extremes of a quiet Asian-session range on EURUSD/GBPUSD. Mandatory 1:1.5 minimum R:R, no trades during news.",
    grade: "C",
    weight: 10,
  },
];

export interface MistakeDef {
  key: string;
  category: MistakeCategory;
  label: string;
  description: string;
  severity: number;
  detectionHint: Record<string, string> | null;
}

/** System mistake catalog (seeded, extensible). */
export const MISTAKE_DEFS: readonly MistakeDef[] = [
  {
    key: "moved_stop",
    category: "MANAGEMENT",
    label: "Stop moved against you",
    description: "Stop widened after entry - risk exceeded the plan.",
    severity: 4,
    detectionHint: null,
  },
  {
    key: "revenge_trade",
    category: "BEHAVIOR",
    label: "Revenge trade",
    description:
      "Bigger-than-usual size shortly after a loss - emotional re-entry.",
    severity: 5,
    detectionHint: null,
  },
  {
    key: "oversized",
    category: "MANAGEMENT",
    label: "Size above plan",
    description: "Position size exceeds the sizer's suggestion by >40%.",
    severity: 4,
    detectionHint: null,
  },
  {
    key: "no_stop_loss",
    category: "ENTRY",
    label: "No stop loss",
    description: "Trade taken without any planned stop.",
    severity: 5,
    detectionHint: null,
  },
  {
    key: "out_of_hours",
    category: "ENTRY",
    label: "Out of trading window",
    description: "Entry outside the strategy's declared trading window.",
    severity: 3,
    detectionHint: null,
  },
  {
    key: "cut_winner_early",
    category: "EXIT",
    label: "Winner cut early",
    description: "Exit far before the MFE the trade offered.",
    severity: 3,
    detectionHint: null,
  },
];

export interface TagDef {
  name: string;
  category: TagCategory;
}

/**
 * Seed tag catalog for the capture form ("Add details" chips). Tags are
 * user-owned per data-model.md "Domaine 4"; these are the seeded starter set.
 */
export const TAG_DEFS: readonly TagDef[] = [
  { name: "A+ context", category: "SETUP" },
  { name: "HTF aligned", category: "SETUP" },
  { name: "News window", category: "CONTEXT" },
  { name: "London open", category: "CONTEXT" },
  { name: "NY open", category: "CONTEXT" },
  { name: "Overtraded", category: "MISTAKE" },
  { name: "Chased entry", category: "MISTAKE" },
  { name: "Revenge", category: "EMOTION" },
  { name: "FOMO", category: "EMOTION" },
  { name: "Scalp", category: "CUSTOM" },
];

