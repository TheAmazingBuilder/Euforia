import { toDecimalString } from "./money";
import {
  COMPOUNDING_MAX_BALANCE as MAX_BALANCE_CAP,
  COMPOUNDING_MAX_GAIN_PERCENT as MAX_GAIN_CAP,
  COMPOUNDING_MAX_PERIODS as MAX_PERIODS_CAP,
} from "../schemas/calculators";

/**
 * Compounding projection - pure, deterministic financial math.
 *
 * This is the client-side LIVE-ESTIMATE layer (same contract as utils/risk.ts):
 * the authoritative exact-decimal recomputation lives in the backend
 * calculators domain (modules/calculators/compounding.logic.ts). Semantics are
 * mirrored field-for-field so a live-mode caller sees identical strings on
 * float-safe vectors.
 *
 * Model (§20/§22 of the calculator spec): a constant gain applied once per
 * period, compounded - each period's gain is computed from the PREVIOUS
 * ending balance, never re-applied to the principal:
 *   A = P × (1 + r)^n     with r = gainPerPeriodPercent / 100
 *
 * Domain differences vs the server contract (deliberate, documented):
 *   - Negative per-period rates ARE accepted here ([-100, 0) percent) so the
 *     UI can answer drawdown what-ifs. A rate of −100 % floors the balance at
 *     zero and it stays there - mathematically consistent, never negative.
 *   - The server growth-only contract ([0, 10 000] percent) is untouched.
 *
 * The annual nominal-rate form A = P(1 + r/n)^(n·t) is intentionally NOT
 * implemented - the product input is explicitly "gain per period".
 */

/**
 * Product caps - the canonical constants live in the shared calculators
 * contract (schemas/calculators.ts); aliased here, not re-declared (the
 * barrel must not export the same name twice).
 */
const COMPOUNDING_MAX_PERIODS = MAX_PERIODS_CAP;
const COMPOUNDING_MAX_GAIN_PERCENT = MAX_GAIN_CAP;
const COMPOUNDING_MAX_BALANCE = MAX_BALANCE_CAP;

/** Lower bound of a per-period gain, in percent (what-if drawdown floor). */
export const COMPOUNDING_MIN_GAIN_PERCENT = -100;

export interface CompoundingInput {
  /** Starting balance, account currency (> 0). */
  startingBalance: number;
  /** Number of periods (integer, 1..COMPOUNDING_MAX_PERIODS). */
  periods: number;
  /**
   * Gain per period, PERCENT: 5 = 5 %. Compounded on the running balance.
   * Accepted range [−100, 10 000] - negative rates model drawdowns.
   */
  gainPerPeriodPercent: number;
}

export interface CompoundingPeriodResult {
  /** 1-based period index. */
  period: number;
  /** Balance at the beginning of the period (decimal string). */
  startingBalance: string;
  /** Balance after applying that period's gain (decimal string). */
  endingBalance: string;
  /** Profit of THIS period only: ending − starting (decimal string). */
  periodProfit: string;
  /** Total Profit - cumulative absolute profit vs the ORIGINAL balance (decimal string). */
  totalProfit: string;
  /** Total Gain - cumulative PERCENT of the ORIGINAL balance, not of the running one (decimal string). */
  totalGainPercent: string;
}

export interface CompoundingSchedule {
  /** Echo of the canonical inputs (gain normalized through Number()). */
  startingBalance: number;
  periods: number;
  gainPerPeriodPercent: number;
  /** One row per period, in order. */
  rows: CompoundingPeriodResult[];
  /** Balance after the last period (decimal string). */
  finalBalance: string;
  /** Total Profit - absolute, account currency (decimal string). */
  totalProfit: string;
  /** Total Gain - percent of the ORIGINAL starting balance (decimal string). */
  totalGainPercent: string;
}

/**
 * Project the compounded balance period by period.
 *
 * Returns `null` on any invalid input (never throws, never returns
 * Infinity/NaN): non-finite values, balance ≤ 0, non-integer or out-of-range
 * periods, gain outside [−100, 10 000] percent, or a projection that would
 * cross the 1e15 balance ceiling.
 *
 * Precision: the loop runs at full float precision (no intermediate
 * rounding - display rounds only at emission); every emitted value goes
 * through toDecimalString (≤ 8 decimals, trailing zeros stripped) so float
 * artifacts never reach the UI.
 */
export function calculateCompounding(
  input: CompoundingInput,
): CompoundingSchedule | null {
  const { startingBalance, periods, gainPerPeriodPercent } = input;

  if (
    !Number.isFinite(startingBalance) ||
    !Number.isFinite(periods) ||
    !Number.isFinite(gainPerPeriodPercent)
  ) {
    return null;
  }
  if (startingBalance <= 0) return null;
  if (!Number.isInteger(periods) || periods < 1 || periods > COMPOUNDING_MAX_PERIODS) {
    return null;
  }
  if (
    gainPerPeriodPercent < COMPOUNDING_MIN_GAIN_PERCENT ||
    gainPerPeriodPercent > COMPOUNDING_MAX_GAIN_PERCENT
  ) {
    return null;
  }

  const rate = gainPerPeriodPercent / 100;
  const rows: CompoundingPeriodResult[] = [];
  let running = startingBalance;
  let finalBalance = startingBalance;

  for (let period = 1; period <= periods; period += 1) {
    const starting = running;
    const ending = starting * (1 + rate);
    // Overflow guard - a pathological rate can still explode past the ceiling.
    if (!Number.isFinite(ending) || ending > COMPOUNDING_MAX_BALANCE) {
      return null;
    }
    running = ending;
    finalBalance = ending;
    rows.push({
      period,
      startingBalance: toDecimalString(starting),
      endingBalance: toDecimalString(ending),
      periodProfit: toDecimalString(ending - starting),
      totalProfit: toDecimalString(ending - startingBalance),
      totalGainPercent: toDecimalString(((ending / startingBalance) - 1) * 100),
    });
  }

  return {
    startingBalance,
    periods,
    gainPerPeriodPercent,
    rows,
    finalBalance: toDecimalString(finalBalance),
    totalProfit: toDecimalString(finalBalance - startingBalance),
    totalGainPercent: toDecimalString(
      ((finalBalance / startingBalance) - 1) * 100,
    ),
  };
}
