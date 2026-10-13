/**
 * Lot Size Calculator — pure math (MASTER PROMPT §7–§17, §32; V1.1 costs).
 *
 * Model (all amounts in the ACCOUNT currency):
 *   riskAmount   = balance × riskPercent / 100
 *   stopDistance = |entry − stopLoss|
 *   spread       = optional bid/ask spread in price units — widens the stop
 *                  in BOTH directions (long exits at bid, short exits at ask)
 *   effStopDist  = stopDistance + spread
 *   stopPips     = effStopDist / pipSize
 *   pipValue     = pipSize × contractSize                (quote == account)
 *                | pipSize × contractSize / entry        (base  == account,
 *                                                          converted at the
 *                                                          entry price)
 *                | manual override                       (advanced field)
 *   spreadCost   = (spread / pipSize) × pipValue         (per lot)
 *   riskPerLot*  = stopPips × pipValue + spreadCost + commissionPerLot
 *   lotsExact    = riskAmount / riskPerLot*
 *   lots         = floor(lotsExact / 0.01) × 0.01        (never risk MORE)
 *
 * Without costs riskPerLot* collapses to the V1 divisor — results are
 * bit-identical. Division-by-zero and unusable parameters return typed
 * error codes — the function never throws and never returns a fabricated
 * size. The risk/reward ratio stays PRICE-based (gross); costs are shown
 * separately in the breakdown, never blended into the ratio.
 */

import type {
  LotSizeCalculation,
  LotSizeInput,
  PipValueSource,
  RiskRewardCalculation,
  RiskRewardInput,
} from "./types";

/** Smallest tradable lot increment shown by the calculator. */
export const LOT_SIZE_STEP = 0.01;

/** riskAmount = balance × riskPercent / 100 — the only "opinion" is the input. */
export function calculateRiskAmount(balance: number, riskPercent: number): number {
  return (balance * riskPercent) / 100;
}

/** Risk / reward from the plan: risk distance, reward distance and the ratio. */
export function calculateRiskReward(input: RiskRewardInput): RiskRewardCalculation {
  const riskDistance = Math.abs(input.entry - input.stopLoss);
  if (!(riskDistance > 0)) {
    return { ok: false, code: "ZERO_RISK_DISTANCE" };
  }
  const rewardDistance = input.takeProfit - input.entry;
  // The take profit must sit on the PROFIT side of the entry.
  if (input.direction === "LONG" ? rewardDistance <= 0 : rewardDistance >= 0) {
    return { ok: false, code: "TP_WRONG_SIDE" };
  }
  const ratio = Math.abs(rewardDistance) / riskDistance;
  return { ok: true, value: { riskDistance, rewardDistance: Math.abs(rewardDistance), ratio } };
}

/**
 * Full lot size computation. Assumes the numeric inputs already passed Zod
 * validation (positive balance/risk/prices, coherent direction) — every
 * remaining degenerate case is caught here as a typed error.
 */
export function calculateLotSize(input: LotSizeInput): LotSizeCalculation {
  const stopDistance = Math.abs(input.entry - input.stopLoss);
  if (!(stopDistance > 0)) {
    return { ok: false, code: "ZERO_STOP_DISTANCE" };
  }
  if (!(input.balance > 0) || !(input.riskPercent > 0)) {
    // Defensive mirror of the form validation — never divide garbage.
    return { ok: false, code: "NON_POSITIVE_RISK_PER_LOT" };
  }

  const riskAmount = calculateRiskAmount(input.balance, input.riskPercent);

  const contractSize =
    input.overrides?.contractSize !== undefined && input.overrides.contractSize > 0
      ? input.overrides.contractSize
      : input.spec.contractSize;
  const pipSize =
    input.overrides?.pipSize !== undefined && input.overrides.pipSize > 0
      ? input.overrides.pipSize
      : input.spec.pipSize;

  if (!(pipSize > 0)) {
    return { ok: false, code: "INVALID_PIP_SIZE" };
  }
  const spread = input.costs !== undefined && input.costs.spread > 0 ? input.costs.spread : 0;
  const commissionPerLot =
    input.costs !== undefined && input.costs.commissionPerLot > 0 ? input.costs.commissionPerLot : 0;
  const effectiveStopDistance = stopDistance + spread;
  const effectiveStopPips = effectiveStopDistance / pipSize;
  const stopPips = stopDistance / pipSize;
  const spreadPips = spread / pipSize;

  // Pip value per 1.0 lot, in the ACCOUNT currency.
  let pipValuePerLot: number | null = null;
  let pipValueSource: PipValueSource | null = null;
  const manualPipValue = input.overrides?.pipValuePerLot;
  if (manualPipValue !== undefined && manualPipValue > 0) {
    pipValuePerLot = manualPipValue;
    pipValueSource = "OVERRIDE";
  } else if (input.spec.quoteCurrency === input.accountCurrency) {
    pipValuePerLot = pipSize * contractSize;
    pipValueSource = "DERIVED";
  } else if (input.spec.baseCurrency === input.accountCurrency && input.entry > 0) {
    // Account currency is the BASE currency: convert the quote-currency pip
    // value at the entry price (deterministic identity, declared in UI).
    pipValuePerLot = (pipSize * contractSize) / input.entry;
    pipValueSource = "ENTRY_CONVERTED";
  }
  if (pipValuePerLot === null || !(pipValuePerLot > 0)) {
    return { ok: false, code: "PIP_VALUE_REQUIRED" };
  }

  const grossRiskPerLot = stopPips * pipValuePerLot;
  const spreadCostPerLot = spreadPips * pipValuePerLot;
  // The sizing divisor carries every cost — the budget must survive the
  // stop AND the spread AND the round-turn commission.
  const riskPerLotWithCosts = grossRiskPerLot + spreadCostPerLot + commissionPerLot;
  if (!(riskPerLotWithCosts > 0)) {
    return { ok: false, code: "NON_POSITIVE_RISK_PER_LOT" };
  }

  const lotsExact = riskAmount / riskPerLotWithCosts;
  // Floor to the tradable step — with a 6-decimal smoothing first, so float
  // noise (0.1/0.01 → 9.999999999999998) can never under-size by one micro-lot.
  const stepCount = Math.floor(Number((lotsExact / LOT_SIZE_STEP).toFixed(6)));
  const lots = stepCount * LOT_SIZE_STEP;
  const tradableLots = lots > 0 ? lots : 0;
  const actualRisk = tradableLots * riskPerLotWithCosts;
  const units = tradableLots * contractSize;
  const spreadCost = tradableLots * spreadCostPerLot;
  const commissionCost = tradableLots * commissionPerLot;

  return {
    ok: true,
    value: {
      riskAmount,
      stopDistance,
      stopPips,
      pipValuePerLot,
      pipValueSource,
      riskPerLot: grossRiskPerLot,
      lotsExact,
      lots: tradableLots,
      actualRisk,
      units,
      resolved: { contractSize, pipSize },
      effectiveStopDistance,
      effectiveStopPips,
      spreadPips,
      spreadCostPerLot,
      commissionPerLot,
      riskPerLotWithCosts,
      totalCosts: { spread: spreadCost, commission: commissionCost, total: spreadCost + commissionCost },
    },
  };
}
