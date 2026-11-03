/**
 * Compounding domain calculation (Phase 18) - PURE, exact-decimal,
 * deterministic, period-by-period.
 *
 * Model (§21/§22/§23): a GROWTH projection - each period applies the same
 * percentage gain to the PREVIOUS period's ending balance (never to the
 * original principal):
 *
 *   rate          = gainPerPeriodPercent / 100        (§23 - "5" → 0.05)
 *   periodProfit  = current × rate
 *   ending        = current + periodProfit            (next period's current)
 *   cumulative    = Σ periodProfit
 *
 * This is the per-period sequential model (A = P(1+r)^n unrolled) - NOT the
 * advanced nominal-rate/frequency model A = P(1+r/n)^(n·t) (§24 - the two
 * models are never mixed; none exists in the product today).
 *
 * Precision (§27): the loop runs on FULL-PRECISION Decimals - values are
 * rendered to the 8-decimal wire format only when emitted. No premature
 * per-period rounding is applied (the product defines none).
 *
 * No Nest, no Prisma client, no HTTP, no DB (§33/§34) - directly unit-testable.
 */
import { Prisma } from "@prisma/client";
import {
  CALCULATOR_ERROR_CODES,
  COMPOUNDING_MAX_BALANCE,
  type CompoundingCalculatorInput,
  type CompoundingCalculatorResult,
} from "../../shared/contracts";
import { BusinessRuleError } from "../../shared/errors/app-error";

/** 1e15 as an exact Decimal - the anti-overflow guard from the contract. */
const MAX_BALANCE = new Prisma.Decimal(COMPOUNDING_MAX_BALANCE);

/**
 * Render a Decimal to the canonical wire format (max 8 decimals, trailing
 * zeros stripped) - display rounding only, never part of the loop (§19/§27).
 */
function render(value: Prisma.Decimal): string {
  const fixed = value.toFixed(8);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

export function computeCompounding(input: CompoundingCalculatorInput): CompoundingCalculatorResult {
  // Wire values are already format/range-validated (Zod contract: periods
  // 1..COMPOUNDING_MAX_PERIODS, gain 0..10 000 %, balance > 0 - §25/§28).
  const startingBalance = new Prisma.Decimal(input.startingBalance);
  const rate = new Prisma.Decimal(input.gainPerPeriodPercent).dividedBy(100);

  let current = startingBalance;
  let cumulativeProfit = new Prisma.Decimal(0);
  const rows = [];

  for (let period = 1; period <= input.periods; period++) {
    const periodProfit = current.times(rate);
    const ending = current.plus(periodProfit);

    // §25 - explicit overflow guard: pathological exponentiations surface as
    // a 422 with a stable code, never as Infinity or a garbage balance.
    if (ending.gt(MAX_BALANCE)) {
      throw new BusinessRuleError(
        "The projection exceeds the maximum representable balance (1e15) - reduce the rate or the number of periods.",
        CALCULATOR_ERROR_CODES.CALCULATION_OVERFLOW,
      );
    }

    cumulativeProfit = cumulativeProfit.plus(periodProfit);
    rows.push({
      period,
      startingBalance: render(current),
      endingBalance: render(ending),
      periodProfit: render(periodProfit),
      cumulativeProfit: render(cumulativeProfit),
      // Percentage gain is always relative to the ORIGINAL starting balance.
      cumulativeGainPercentage: render(cumulativeProfit.dividedBy(startingBalance).times(100)),
    });

    // §22 - the next period starts from THIS period's ending balance, at
    // full precision (no premature rounding, §27).
    current = ending;
  }

  // §26 - absolute profit and percentage gain are returned as DISTINCT
  // fields ("Total Profit" ≠ "Total Gain"), the percentage relative to the
  // original principal.
  return {
    startingBalance: render(startingBalance),
    periods: input.periods,
    gainPerPeriodPercent: render(new Prisma.Decimal(input.gainPerPeriodPercent)),
    rows,
    finalBalance: render(current),
    totalProfit: render(cumulativeProfit),
    totalGainPercentage: render(cumulativeProfit.dividedBy(startingBalance).times(100)),
  };
}
