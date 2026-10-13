/**
 * Pip & Tick Value Calculator — pure math (TOOLS module, frontend-only V1).
 *
 * Answers ONE question precisely: what is one pip / one tick worth, per lot
 * and for the whole position, in the ACCOUNT currency?
 *
 *   pipValue  = pipSize  × contractSize              (quote == account)
 *             | pipSize  × contractSize / price      (base  == account,
 *                                                       converted at price)
 *             | manual override                      (advanced field)
 *   tickValue = (tickSize / pipSize) × pipValue
 *
 * The tick defaults to one TENTH of a pip (the classic forex "point") and is
 * user-overridable for instruments whose smallest increment differs. Error
 * cases return typed codes — never a fabricated value, never a throw.
 */

import type { Currency } from "@cosmoz/shared";

import type { InstrumentSpecification, PipValueSource } from "./types";

export interface PipValueInput {
  /** Resolved instrument spec (preset or user-defined CUSTOM values). */
  spec: Pick<
    InstrumentSpecification,
    "quoteCurrency" | "baseCurrency" | "contractSize" | "pipSize"
  >;
  /** Position size in lots (≥ 0 — 0 answers the per-lot question only). */
  lots: number;
  /** Price used for the quote→account conversion when the account currency
   * is the instrument's BASE currency (e.g. USD account, USDJPY instrument:
   * convert the JPY pip value at the current USDJPY price). */
  price: number;
  accountCurrency: Currency;
  overrides?: {
    /** Smallest price increment — defaults to pipSize / 10. */
    tickSize?: number;
    /** Pip value per lot in the ACCOUNT currency — skips all conversion. */
    pipValuePerLot?: number;
  };
}

export type PipValueErrorCode =
  | "INVALID_PIP_SIZE"
  | "INVALID_TICK_SIZE"
  | "PIP_VALUE_REQUIRED"
  | "NON_POSITIVE_LOTS";

export interface PipValueResult {
  pipSize: number;
  tickSize: number;
  /** Pip value per 1.0 lot, in the ACCOUNT currency. */
  pipValuePerLot: number;
  /** Tick value per 1.0 lot, in the ACCOUNT currency. */
  tickValuePerLot: number;
  /** pipValuePerLot × lots — the whole position. */
  pipValuePosition: number;
  /** tickValuePerLot × lots. */
  tickValuePosition: number;
  /** Where the pip value comes from — declared, never mysterious. */
  pipValueSource: PipValueSource;
  /** lots × contractSize — position size in base units. */
  units: number;
  /** True when the conversion consumed the price input (declared in UI). */
  priceUsedForConversion: boolean;
}

export type PipValueCalculation =
  | { ok: true; value: PipValueResult }
  | { ok: false; code: PipValueErrorCode };

export function calculatePipValue(input: PipValueInput): PipValueCalculation {
  if (!(input.lots >= 0) || !Number.isFinite(input.lots)) {
    return { ok: false, code: "NON_POSITIVE_LOTS" };
  }
  const pipSize = input.spec.pipSize;
  if (!(pipSize > 0) || !Number.isFinite(pipSize)) {
    return { ok: false, code: "INVALID_PIP_SIZE" };
  }

  // Tick size: explicit override wins; default = one tenth of a pip (point).
  const rawTick = input.overrides?.tickSize;
  const tickSize = rawTick !== undefined && rawTick > 0 ? rawTick : pipSize / 10;
  if (!(tickSize > 0) || !Number.isFinite(tickSize)) {
    return { ok: false, code: "INVALID_TICK_SIZE" };
  }

  const contractSize = input.spec.contractSize > 0 ? input.spec.contractSize : 0;
  if (!(contractSize > 0)) {
    return { ok: false, code: "INVALID_PIP_SIZE" };
  }

  // Pip value per 1.0 lot, in the ACCOUNT currency — same model as Lot Size.
  let pipValuePerLot: number | null = null;
  let pipValueSource: PipValueSource | null = null;
  let priceUsedForConversion = false;
  const manualPipValue = input.overrides?.pipValuePerLot;
  if (manualPipValue !== undefined && manualPipValue > 0) {
    pipValuePerLot = manualPipValue;
    pipValueSource = "OVERRIDE";
  } else if (input.spec.quoteCurrency === input.accountCurrency) {
    pipValuePerLot = pipSize * contractSize;
    pipValueSource = "DERIVED";
  } else if (input.spec.baseCurrency === input.accountCurrency && input.price > 0) {
    pipValuePerLot = (pipSize * contractSize) / input.price;
    pipValueSource = "ENTRY_CONVERTED";
    priceUsedForConversion = true;
  }
  if (pipValuePerLot === null || !(pipValuePerLot > 0)) {
    return { ok: false, code: "PIP_VALUE_REQUIRED" };
  }
  const source: PipValueSource = pipValueSource ?? "DERIVED";

  const tickValuePerLot = (tickSize / pipSize) * pipValuePerLot;

  return {
    ok: true,
    value: {
      pipSize,
      tickSize,
      pipValuePerLot,
      tickValuePerLot,
      pipValuePosition: pipValuePerLot * input.lots,
      tickValuePosition: tickValuePerLot * input.lots,
      pipValueSource: source,
      units: input.lots * contractSize,
      priceUsedForConversion,
    },
  };
}
