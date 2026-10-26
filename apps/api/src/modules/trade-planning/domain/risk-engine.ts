/**
 * Planned-risk engine (Phase 5 §13/§17/§19/§20) - the ONE authoritative
 * implementation of planned risk, position sizing and R:R for Trade Plans.
 *
 * Precision: pure `decimal.js` arithmetic - NEVER JavaScript floating point
 * (§13). The formulas mirror the shared frontend helpers
 * (`@cosmoz/shared` utils/risk.ts) exactly - same semantics, upgraded
 * precision - so the client's live PREVIEW (§57) and the server's
 * authoritative value can never disagree about INTENT, only about precision.
 *
 * Determinism (§17): the recommended position size is FLOORED to the
 * instrument's volume step (0.01 when the catalog gives no step), so realized
 * planned risk never exceeds the budget. Rounding is ROUND_DOWN - a
 * deterministic, documented strategy, not arbitrary precision.
 *
 * Failure philosophy: mathematically meaningless configurations are surfaced
 * as structured issues (§21) with code/severity/field/message - the engine
 * never silently produces negative or fabricated values (§11/§12/§16).
 *
 * This file is DOMAIN: no NestJS, no Prisma, no HTTP (§59).
 */
import { Decimal } from "decimal.js";

import type { InstrumentSpecification } from "./ports";

// ── Input/output shapes ──────────────────────────────────────────────────────

export type PlanDirection = "BUY" | "SELL";
export type PlanSizeMode = "quantity" | "risk_percent" | "risk_amount";

export interface RiskEngineInput {
  direction: PlanDirection;
  entryPrice: Decimal;
  stopLoss: Decimal | null;
  takeProfit: Decimal | null;
  sizeMode: PlanSizeMode;
  /** The user input for the mode: quantity | percent | amount. */
  sizeValue: Decimal;
  /**
   * Account balance in ACCOUNT currency (snapshot at calculation time).
   * Null when the account has no usable balance (zero/negative/absent).
   */
  balance: Decimal | null;
  /** Catalog specification for the symbol - null when unavailable (§15). */
  specs: InstrumentSpecification | null;
  /**
   * Quote→account currency conversion multiplier, resolved by the
   * application layer through the FxRateProvider port (§16). Null when the
   * currencies differ and no rate is available. Same-currency plans get 1.
   */
  fxRate: Decimal | null;
}

/** One structured finding of the engine/validation battery (§21). */
export interface PlanValidationIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  field: string | null;
  message: string;
}

export interface RiskComputation {
  /** % of balance the plan risks (derived for amount/quantity modes). */
  riskPercent: Decimal | null;
  /** Money risk in ACCOUNT currency (derived for percent/quantity modes). */
  riskAmount: Decimal | null;
  /** |entry − stop| in price units. */
  stopDistance: Decimal | null;
  /** Stop distance in pips (needs the catalog pip size). */
  stopPips: Decimal | null;
  /** Recommended (risk modes) or validated (quantity mode) position size. */
  positionSize: Decimal | null;
  /** Potential profit at target, ACCOUNT currency. */
  potentialProfit: Decimal | null;
  /** Potential loss = planned money risk, ACCOUNT currency. */
  potentialLoss: Decimal | null;
  /** Planned reward/risk ratio - reward distance ÷ risk distance (§19). */
  rrRatio: Decimal | null;
  /** Findings accumulated while computing (structured, machine-readable). */
  issues: PlanValidationIssue[];
}

// ── Issue factory (codes live in the shared contract) ───────────────────────

function issue(
  code: string,
  severity: "ERROR" | "WARNING",
  field: string | null,
  message: string,
): PlanValidationIssue {
  return { code, severity, field, message };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Floor a quantity to the given step (0.01 fallback) - deterministic §17. */
function floorToStep(quantity: Decimal, step: Decimal | null): Decimal {
  const effective = step ?? new Decimal("0.01");
  return quantity.div(effective).floor().mul(effective);
}

/**
 * Stop distance for the direction - null when the stop is missing or on the
 * wrong side (the caller decides how each case surfaces as an issue).
 */
function stopDistance(
  direction: PlanDirection,
  entry: Decimal,
  stop: Decimal | null,
): Decimal | null {
  if (stop === null) return null;
  return direction === "BUY" ? entry.minus(stop) : stop.minus(entry);
}

/** Reward distance for the direction - null when the target is missing. */
function rewardDistance(
  direction: PlanDirection,
  entry: Decimal,
  target: Decimal | null,
): Decimal | null {
  if (target === null) return null;
  return direction === "BUY" ? target.minus(entry) : entry.minus(target);
}

// ── The engine ───────────────────────────────────────────────────────────────

/**
 * Compute the authoritative planned risk for one plan configuration.
 *
 * The engine ALWAYS computes what it can (distance metrics are currency-free;
 * R:R is a ratio of same-unit distances) and reports precisely what it could
 * NOT compute and why. Callers decide policy: create/update reject on
 * structural ERRORs; the validation battery persists everything and gates the
 * VALIDATED transition.
 */
export function computePlannedRisk(input: RiskEngineInput): RiskComputation {
  const issues: PlanValidationIssue[] = [];
  const { direction, entryPrice, stopLoss, takeProfit, sizeMode, sizeValue, balance, specs, fxRate } =
    input;

  // ── Directional integrity (§11/§12) - meaningless risk is never produced ──
  const riskDist = stopDistance(direction, entryPrice, stopLoss);
  if (stopLoss === null) {
    issues.push(
      issue(
        "STOP_LOSS_MISSING",
        "ERROR",
        "stopLoss",
        "The plan has no stop loss; planned risk cannot be computed.",
      ),
    );
  } else if (riskDist === null || riskDist.lte(0)) {
    issues.push(
      issue(
        "STOP_LOSS_INVALID_DIRECTION",
        "ERROR",
        "stopLoss",
        direction === "BUY"
          ? "A BUY plan needs a stop loss below the entry price."
          : "A SELL plan needs a stop loss above the entry price.",
      ),
    );
  }

  const rewardDist = rewardDistance(direction, entryPrice, takeProfit);
  if (takeProfit !== null && (rewardDist === null || rewardDist.lte(0))) {
    issues.push(
      issue(
        "TAKE_PROFIT_INVALID_DIRECTION",
        "ERROR",
        "takeProfit",
        direction === "BUY"
          ? "A BUY plan needs a take profit above the entry price."
          : "A SELL plan needs a take profit below the entry price.",
      ),
    );
  }
  if (takeProfit === null) {
    issues.push(
      issue(
        "RISK_REWARD_UNAVAILABLE",
        "WARNING",
        "takeProfit",
        "No take profit configured; the planned R:R cannot be computed.",
      ),
    );
  }

  // ── Currency-free metrics ─────────────────────────────────────────────────
  const validStop = riskDist !== null && riskDist.gt(0);
  const stopDistanceOut = validStop ? riskDist : null;
  const stopPips =
    validStop && specs !== null && specs.pipSize.gt(0) ? riskDist!.div(specs.pipSize) : null;
  const rrRatio =
    validStop && rewardDist !== null && rewardDist.gt(0) ? rewardDist.div(riskDist!) : null;

  // ── Monetary feasibility (§15/§16) ────────────────────────────────────────
  // Money math needs: specs (contract size, quote currency) and, when the
  // quote currency differs from the account currency, an FX rate.
  const moneyFeasible = specs !== null && fxRate !== null;
  if (specs === null) {
    issues.push(
      issue(
        "INSTRUMENT_SPECIFICATION_MISSING",
        sizeMode === "quantity" ? "WARNING" : "ERROR",
        "symbol",
        "No instrument specification in the catalog; monetary risk cannot be computed.",
      ),
    );
  } else if (fxRate === null) {
    issues.push(
      issue(
        "CURRENCY_CONVERSION_UNAVAILABLE",
        sizeMode === "quantity" ? "WARNING" : "ERROR",
        "symbol",
        `The instrument quote currency (${specs.quoteCurrency}) differs from the account currency and no conversion rate is available.`,
      ),
    );
  }

  // Per-unit money risk in ACCOUNT currency: |entry − stop| × contractSize × fx.
  const perUnitCost =
    validStop && moneyFeasible ? riskDist!.times(specs!.contractSize).times(fxRate!) : null;

  // ── Balance feasibility (§18) ─────────────────────────────────────────────
  const usableBalance = balance !== null && balance.gt(0) ? balance : null;
  if (usableBalance === null && (sizeMode === "risk_percent" || sizeMode === "risk_amount")) {
    issues.push(
      issue(
        "BALANCE_UNAVAILABLE",
        "ERROR",
        "size",
        "The account has no usable balance for risk-based sizing.",
      ),
    );
  }

  // ── Sizing per mode (§17/§18) ─────────────────────────────────────────────
  let riskPercent: Decimal | null = null;
  let riskAmount: Decimal | null = null;
  let positionSize: Decimal | null = null;
  let potentialProfit: Decimal | null = null;
  let potentialLoss: Decimal | null = null;

  if (sizeMode === "risk_percent" && usableBalance !== null && validStop) {
    // riskAmount = balance × pct/100; quantity = amount / perUnitCost, floored.
    riskPercent = sizeValue;
    if (perUnitCost !== null && perUnitCost.gt(0)) {
      const budget = usableBalance.times(sizeValue).div(100);
      const rawQuantity = budget.div(perUnitCost);
      positionSize = floorToStep(rawQuantity, specs?.volumeStep ?? null);
      if (positionSize.lte(0)) {
        issues.push(
          issue(
            "POSITION_SIZE_BELOW_MINIMUM",
            "ERROR",
            "size",
            "The risk budget is too small for the minimum tradable size.",
          ),
        );
        positionSize = null;
      } else {
        // Effective money risk of the RECOMMENDED size (never above budget).
        riskAmount = positionSize.times(perUnitCost);
        potentialLoss = riskAmount;
      }
    }
  } else if (sizeMode === "risk_amount" && validStop) {
    // Fixed money risk; quantity floored so realized risk ≤ the amount.
    riskAmount = sizeValue;
    potentialLoss = sizeValue;
    if (perUnitCost !== null && perUnitCost.gt(0)) {
      const rawQuantity = sizeValue.div(perUnitCost);
      positionSize = floorToStep(rawQuantity, specs?.volumeStep ?? null);
      if (positionSize.lte(0)) {
        issues.push(
          issue(
            "POSITION_SIZE_BELOW_MINIMUM",
            "ERROR",
            "size",
            "The risk amount is too small for the minimum tradable size.",
          ),
        );
        positionSize = null;
        riskAmount = null;
        potentialLoss = null;
      } else {
        riskAmount = positionSize.times(perUnitCost);
        potentialLoss = riskAmount;
      }
    }
    if (usableBalance !== null) {
      riskPercent = riskAmount !== null
        ? riskAmount.div(usableBalance).times(100)
        : sizeValue.div(usableBalance).times(100);
    }
  } else if (sizeMode === "quantity") {
    positionSize = sizeValue;
    if (perUnitCost !== null && perUnitCost.gt(0)) {
      riskAmount = riskDist!.times(positionSize).times(specs!.contractSize).times(fxRate!);
      potentialLoss = riskAmount;
      if (usableBalance !== null) {
        riskPercent = riskAmount.div(usableBalance).times(100);
      }
    }
  }

  // Potential profit uses the FINAL planned size (§20 - R-based metrics stay
  // deterministic and domain-owned).
  if (positionSize !== null && moneyFeasible && rewardDist !== null && rewardDist.gt(0)) {
    potentialProfit = rewardDist.times(positionSize).times(specs!.contractSize).times(fxRate!);
  }

  // ── Broker/provider volume constraints (§17) ──────────────────────────────
  if (positionSize !== null && specs !== null) {
    if (specs.minVolume !== null && positionSize.lt(specs.minVolume)) {
      issues.push(
        issue(
          "POSITION_SIZE_BELOW_MINIMUM",
          "ERROR",
          "size",
          `The planned size is below the instrument minimum (${specs.minVolume.toFixed()}).`,
        ),
      );
    }
    if (specs.maxVolume !== null && positionSize.gt(specs.maxVolume)) {
      issues.push(
        issue(
          "POSITION_SIZE_ABOVE_MAXIMUM",
          "ERROR",
          "size",
          `The planned size is above the instrument maximum (${specs.maxVolume.toFixed()}).`,
        ),
      );
    }
  }

  // Defensive guard: negative/zero size values can never leave the engine.
  if (positionSize !== null && positionSize.lte(0)) positionSize = null;
  if (riskAmount !== null && riskAmount.lt(0)) riskAmount = null;
  if (riskPercent !== null && riskPercent.lt(0)) riskPercent = null;

  return {
    riskPercent,
    riskAmount,
    stopDistance: stopDistanceOut,
    stopPips,
    positionSize,
    potentialProfit,
    potentialLoss,
    rrRatio,
    issues,
  };
}
