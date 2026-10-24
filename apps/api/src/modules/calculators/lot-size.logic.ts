/**
 * Lot-size domain calculation (Phase 18) - PURE, exact-decimal, deterministic.
 *
 * One authoritative server-side implementation of the position-sizing math
 * (§37): Trade Planner, Session Live or any future consumer must call THIS -
 * never a re-derived copy. It mirrors the shared client-side LIVE-ESTIMATE
 * helpers (`packages/shared/src/utils/risk.ts` - suggestPositionSize,
 * computeRiskAmount, computeRR) with the SAME semantics but exact decimal
 * arithmetic instead of floats:
 *
 *   riskAmount      = balance × riskPercent / 100          (§12 - "1" = 1 %)
 *   perUnit         = |entry − stop| × contractSize        (§11 - broker-aware)
 *   rawQuantity     = riskAmount / perUnit                 (full precision)
 *   normalized      = floor(rawQuantity / step) × step     (§16 - never up)
 *   realizedRisk    = normalized × perUnit                 (≤ budget by floor)
 *   riskReward      = reward distance / risk distance      (§15 - directional)
 *
 * No Nest, no Prisma client, no HTTP, no DB (§33/§34) - directly unit-testable.
 * No hardcoded instrument table (§9): every spec arrives as validated input.
 */
import { Prisma } from "@prisma/client";
import {
  CALCULATOR_ERROR_CODES,
  type LotSizeCalculatorInput,
  type LotSizeCalculatorResult,
  type LotSizeStatus,
  type VolumeAdjustment,
} from "../../shared/contracts";
import { BusinessRuleError, ValidationError } from "../../shared/errors/app-error";

/** Default broker volume increment: micro-lot - the frontend sizer granularity. */
const DEFAULT_VOLUME_STEP = "0.01";

/**
 * Render a Decimal to the canonical wire format: max 8 decimals (matching
 * numeric(18,8)), trailing zeros stripped, "-0" normalized. Mirrors the
 * shared `toDecimalString` semantics for decimal-exact values. This is the
 * ONLY place rounding touches the pipeline - internal math stays exact (§19).
 */
function render(value: Prisma.Decimal): string {
  const fixed = value.toFixed(8);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

export function computeLotSize(input: LotSizeCalculatorInput): LotSizeCalculatorResult {
  // Wire values are already format-validated (Zod contract); Decimal parsing
  // here is the single arithmetic source of truth - never JS floats (§18).
  const balance = new Prisma.Decimal(input.balance);
  const percent = new Prisma.Decimal(input.riskPercent);
  const entry = new Prisma.Decimal(input.entryPrice);
  const stop = new Prisma.Decimal(input.stopLossPrice);
  const pip = new Prisma.Decimal(input.instrument.pipSize);
  const contractSize = new Prisma.Decimal(input.instrument.contractSize);

  // §13 - zero stop distance is refused, never silently accepted. (The Zod
  // contract already rejects entry == stop; this is the domain double-guard.)
  const stopDistance = entry.minus(stop).abs();
  if (stopDistance.isZero()) {
    throw new ValidationError("The request payload is invalid.", [
      { path: "stopLossPrice", message: "stopLossPrice must differ from entryPrice (zero stop distance is invalid)" },
    ]);
  }

  // §12 - risk budget with explicit percent normalization ("1" → 0.01).
  const riskAmount = balance.times(percent).dividedBy(100);

  // §11 - money risked per unit of volume depends on the per-instrument
  // contract size; no universal pip value is assumed (§9).
  const perUnit = stopDistance.times(contractSize);
  const rawQuantity = riskAmount.dividedBy(perUnit);

  // §16 - floor to the broker volume increment (default micro-lot): realized
  // risk never exceeds the budget. Rounding UP is forbidden (would increase
  // risk beyond intent). Exact decimal flooring needs no float-artifact guard.
  const step = new Prisma.Decimal(input.instrument.volumeStep ?? DEFAULT_VOLUME_STEP);
  const normalizedQuantity = rawQuantity.dividedToIntegerBy(step).times(step);

  // Frontend parity: the sizer returns null when the floored size hits 0 -
  // the same situation is expressed here as an explicit 422, never a silent
  // clamp (§17/§44).
  if (normalizedQuantity.isZero()) {
    throw new BusinessRuleError(
      "The risk budget cannot cover a single volume step - no tradeable position exists.",
      CALCULATOR_ERROR_CODES.POSITION_SIZE_BELOW_MINIMUM,
    );
  }

  const realizedRiskAmount = normalizedQuantity.times(perUnit);
  const volumeAdjustment: VolumeAdjustment = normalizedQuantity.eq(rawQuantity)
    ? "NONE"
    : "FLOORED_TO_STEP";

  // §17 - explicit broker-constraint status; the size is returned as-is, the
  // status explains (no silent clamping, no invented values).
  let status: LotSizeStatus = "VALID";
  if (input.instrument.minVolume !== undefined && normalizedQuantity.lt(new Prisma.Decimal(input.instrument.minVolume))) {
    status = "BELOW_MINIMUM";
  } else if (input.instrument.maxVolume !== undefined && normalizedQuantity.gt(new Prisma.Decimal(input.instrument.maxVolume))) {
    status = "ABOVE_MAXIMUM";
  }

  // §14/§15 - RR is a ratio derived from TP, NOT a sizing input. Directional
  // semantics mirror the shared computeRR: null when the SL is on the wrong
  // side of entry (risk ≤ 0) - sizing still uses the symmetric distance.
  let riskReward: string | null = null;
  if (input.takeProfitPrice !== undefined) {
    const target = new Prisma.Decimal(input.takeProfitPrice);
    const directionalRisk = input.direction === "BUY" ? entry.minus(stop) : stop.minus(entry);
    if (directionalRisk.gt(0)) {
      const reward = input.direction === "BUY" ? target.minus(entry) : entry.minus(target);
      riskReward = render(reward.dividedBy(directionalRisk));
    }
  }

  return {
    riskAmount: render(riskAmount),
    stopDistance: render(stopDistance),
    stopPips: render(stopDistance.dividedBy(pip)),
    riskReward,
    rawPositionSize: render(rawQuantity),
    normalizedPositionSize: render(normalizedQuantity),
    realizedRiskAmount: render(realizedRiskAmount),
    volumeAdjustment,
    status,
  };
}
