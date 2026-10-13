import { z } from "zod";

/**
 * Lot Size Calculator — pure, deterministic, frontend-only (Tools brief §32:
 * no React, no API, no DB). Sizing model:
 *
 *   Risk Amount   = Balance × Risk%
 *   Lots          = Risk Amount / (Stop Pips × Pip Value per Lot)   [PIP method]
 *   Lots          = Risk Amount / (Stop Distance × Contract Size)   [CONTRACT method]
 *
 * Two explicit methods — never one universal formula (Tools brief §8/§10):
 *  - PIP: forex/metal-style instruments where a lot has a known pip value.
 *  - CONTRACT: index/crypto-style CFDs where 1.0 of price on one lot moves
 *    `contractSize` units of the quote currency (no pip concept).
 *
 * Instrument specs are EDITABLE PREFILLS, not broker truths (§36): every
 * preset ships explicit numbers, the UI labels them "verify with your
 * broker", and the advanced panel lets the trader override each field.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type TradeDirection = "LONG" | "SHORT";

/** How the risk-per-lot is derived. Drives the breakdown rows. */
export type LotSizeMethod = "PIP" | "CONTRACT";

export interface InstrumentSpecification {
  symbol: string;
  label: string;
  assetClass: "FOREX" | "METAL" | "INDEX" | "CRYPTO";
  /** Price move counted as one pip (0.0001 FX majors, 0.01 XAUUSD…). */
  pipSize: number;
  /** Account-currency value of one pip for ONE standard lot. */
  pipValuePerLot: number;
  /** Base-asset units in one standard lot (100 000 FX, 100 oz XAU, 1 CFD…). */
  contractSize: number;
  /** Display decimals for this instrument's prices. */
  priceDecimals: number;
  /**
   * Quote-currency pip value (USDJPY): the lot's pip value in the QUOTE
   * currency is pipSize × contractSize, converted to the account currency
   * at the entry price. Estimated at entry — stated as such in the UI.
   */
  quotePipValue?: boolean;
  /** Sizing unit shown in the result ("lots", "units"…). */
  unitLabel: string;
}

export interface LotSizeInput {
  balance: number;
  riskPercent: number;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  /** Optional — when present, risk/reward is computed. */
  takeProfit: number | null;
  spec: InstrumentSpecification;
}

export interface LotSizeResult {
  method: LotSizeMethod;
  riskAmount: number;
  /** |entry − stop| in price units. */
  stopDistance: number;
  /** PIP method only. */
  stopPips: number | null;
  /** Effective account-currency pip value used (quote pairs: at entry). */
  pipValuePerLot: number | null;
  /** Money lost per lot if the stop is hit. */
  riskPerLot: number;
  /** Raw quotient — NOT rounded. */
  lotsExact: number;
  /** Floored to the 0.01 lot step so realized risk never exceeds target. */
  lotsRounded: number;
  /** Base-asset units: lots × contractSize. */
  units: number;
  contractSize: number;
  /** Risk actually taken at the rounded size (≤ riskAmount). */
  actualRiskAtRounded: number;
}

export interface RiskRewardResult {
  /** |entry − stop| in price units. */
  riskDistance: number;
  /** |takeProfit − entry| in price units. */
  rewardDistance: number;
  /** reward / risk, 1 : X. */
  ratio: number;
}

// ── Instrument presets ───────────────────────────────────────────────────────
// Explicit, commonly documented reference values — NOT broker guarantees.
// The UI surfaces every value in Advanced Parameters for override.

export const INSTRUMENT_PRESETS: InstrumentSpecification[] = [
  {
    symbol: "EURUSD",
    label: "EUR/USD",
    assetClass: "FOREX",
    pipSize: 0.0001,
    pipValuePerLot: 10,
    contractSize: 100_000,
    priceDecimals: 5,
    unitLabel: "lots",
  },
  {
    symbol: "GBPUSD",
    label: "GBP/USD",
    assetClass: "FOREX",
    pipSize: 0.0001,
    pipValuePerLot: 10,
    contractSize: 100_000,
    priceDecimals: 5,
    unitLabel: "lots",
  },
  {
    symbol: "USDJPY",
    label: "USD/JPY",
    assetClass: "FOREX",
    pipSize: 0.01,
    pipValuePerLot: 0, // derived at entry: 0.01 × 100 000 / price
    contractSize: 100_000,
    priceDecimals: 3,
    quotePipValue: true,
    unitLabel: "lots",
  },
  {
    symbol: "XAUUSD",
    label: "Gold (XAU/USD)",
    assetClass: "METAL",
    pipSize: 0.01,
    pipValuePerLot: 1, // 100 oz × $0.01
    contractSize: 100,
    priceDecimals: 2,
    unitLabel: "lots",
  },
  {
    symbol: "NAS100",
    label: "Nasdaq 100 (NAS100)",
    assetClass: "INDEX",
    pipSize: 0, // index CFDs size via the CONTRACT method, not pips
    pipValuePerLot: 0,
    contractSize: 1, // 1 CFD unit = $1 per index point
    priceDecimals: 2,
    unitLabel: "units",
  },
  {
    symbol: "BTCUSD",
    label: "Bitcoin (BTC/USD)",
    assetClass: "CRYPTO",
    pipSize: 0, // crypto sizes via the CONTRACT method, not pips
    pipValuePerLot: 0,
    contractSize: 1, // 1 unit = 1 BTC = $1 per $1 move
    priceDecimals: 2,
    unitLabel: "units",
  },
  {
    symbol: "CUSTOM",
    label: "Custom instrument",
    assetClass: "FOREX",
    pipSize: 0.0001,
    pipValuePerLot: 10,
    contractSize: 100_000,
    priceDecimals: 5,
    unitLabel: "lots",
  },
];

/** Preset lookup that always returns a live object (custom stays editable). */
export function getInstrumentSpec(symbol: string): InstrumentSpecification {
  return (
    INSTRUMENT_PRESETS.find((preset) => preset.symbol === symbol) ??
    INSTRUMENT_PRESETS[INSTRUMENT_PRESETS.length - 1]
  );
}

/**
 * Effective account-currency pip value for one lot at a given entry price.
 * Quote-currency pairs (USDJPY) convert at the entry price — an estimate
 * by nature; the UI labels it as such.
 */
export function effectivePipValuePerLot(
  spec: InstrumentSpecification,
  entryPrice: number,
): number {
  if (spec.quotePipValue && entryPrice > 0) {
    return (spec.pipSize * spec.contractSize) / entryPrice;
  }
  return spec.pipValuePerLot;
}

// ── Zod schemas (Tools brief §33) ────────────────────────────────────────────

/** Reasonable frontend caps — hard limits, not trading advice. */
export const LOT_SIZE_LIMITS = {
  maxBalance: 1_000_000_000,
  maxRiskPercent: 100,
  maxPrice: 100_000_000,
} as const;

export const lotSizeNumbersSchema = z.object({
  balance: z
    .number()
    .positive("Account balance must be greater than zero.")
    .max(LOT_SIZE_LIMITS.maxBalance, "Account balance looks unrealistic."),
  riskPercent: z
    .number()
    .positive("Risk percentage must be greater than zero.")
    .max(LOT_SIZE_LIMITS.maxRiskPercent, "Risk percentage cannot exceed 100%."),
  entryPrice: z
    .number()
    .positive("Entry price must be greater than zero.")
    .max(LOT_SIZE_LIMITS.maxPrice, "Entry price looks unrealistic."),
  stopLoss: z
    .number()
    .positive("Stop loss must be greater than zero.")
    .max(LOT_SIZE_LIMITS.maxPrice, "Stop loss looks unrealistic."),
  takeProfit: z
    .number()
    .positive("Take profit must be greater than zero.")
    .max(LOT_SIZE_LIMITS.maxPrice, "Take profit looks unrealistic.")
    .nullable(),
});

/** Cross-field rules that need direction context (long/short sanity). */
export function validateLotSizeRelationships(input: {
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const { direction, entryPrice, stopLoss, takeProfit } = input;

  if (stopLoss === entryPrice) {
    errors.stopLoss = "Stop Loss must be different from Entry Price.";
  } else if (direction === "LONG" && stopLoss > entryPrice) {
    errors.stopLoss =
      "For a Long position, the Stop Loss must be below the Entry Price.";
  } else if (direction === "SHORT" && stopLoss < entryPrice) {
    errors.stopLoss =
      "For a Short position, the Stop Loss must be above the Entry Price.";
  }

  if (takeProfit !== null) {
    if (takeProfit === entryPrice) {
      errors.takeProfit = "Take Profit must be different from Entry Price.";
    } else if (direction === "LONG" && takeProfit < entryPrice) {
      errors.takeProfit =
        "For a Long position, the Take Profit must be above the Entry Price.";
    } else if (direction === "SHORT" && takeProfit > entryPrice) {
      errors.takeProfit =
        "For a Short position, the Take Profit must be below the Entry Price.";
    }
  }

  return errors;
}

// ── Calculations ─────────────────────────────────────────────────────────────

/** Risk Amount = Balance × Risk%. Pure. */
export function calculateRiskAmount(
  balance: number,
  riskPercent: number,
): number {
  return balance * (riskPercent / 100);
}

/**
 * Core sizing. Returns null when the inputs cannot produce a finite result
 * (zero stop distance, non-positive risk-per-lot) — the UI shows validation
 * errors instead of a silent zero (Tools brief §12).
 */
export function calculateLotSize(input: LotSizeInput): LotSizeResult | null {
  const riskAmount = calculateRiskAmount(input.balance, input.riskPercent);
  const stopDistance = Math.abs(input.entryPrice - input.stopLoss);
  if (stopDistance <= 0 || riskAmount <= 0) return null;

  const spec = input.spec;
  const pipValue = effectivePipValuePerLot(spec, input.entryPrice);
  const usePipMethod = pipValue > 0 && spec.pipSize > 0;

  let method: LotSizeMethod;
  let riskPerLot: number;
  let stopPips: number | null = null;

  if (usePipMethod) {
    method = "PIP";
    stopPips = stopDistance / spec.pipSize;
    riskPerLot = stopPips * pipValue;
  } else {
    method = "CONTRACT";
    if (spec.contractSize <= 0) return null;
    riskPerLot = stopDistance * spec.contractSize;
  }
  if (!Number.isFinite(riskPerLot) || riskPerLot <= 0) return null;

  const lotsExact = riskAmount / riskPerLot;
  // Floor to the 0.01 lot step — realized risk may undershoot but never
  // exceed the target (the professional convention for sizing).
  const lotsRounded = Math.max(Math.floor(lotsExact * 100) / 100, 0);

  return {
    method,
    riskAmount,
    stopDistance,
    stopPips,
    pipValuePerLot: usePipMethod ? pipValue : null,
    riskPerLot,
    lotsExact,
    lotsRounded,
    units: lotsRounded * spec.contractSize,
    contractSize: spec.contractSize,
    actualRiskAtRounded: lotsRounded * riskPerLot,
  };
}

/**
 * Risk/Reward from optional take profit: 1 : X where X = reward / risk.
 * Returns null when the TP is absent or the risk distance is zero.
 */
export function calculateRiskReward(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number | null,
): RiskRewardResult | null {
  if (takeProfit === null) return null;
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entryPrice);
  if (riskDistance <= 0) return null;
  return { riskDistance, rewardDistance, ratio: rewardDistance / riskDistance };
}
