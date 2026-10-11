/**
 * Plan-vs-actual comparison engine (Phase 6 §12/§54/§55/§27/§28).
 *
 * A pure domain function: given the comparison-relevant values of a
 * TradePlan (from the frozen snapshot — or the live plan row defensively)
 * and the canonical Trade aggregates, produce structured objective
 * deviations. It computes FACTS, never judgments:
 *
 *   - No quality scores, no tolerance labels, no "discipline" number
 *     (§55/§56 — the trader's interpretation is user-reported data:
 *     followedPlan / playbookMatch / checklistResults).
 *   - No new risk math: planned R is the plan's canonical rrRatio (reward:risk
 *     at target, Phase 5 engine), actual R is the canonical rMultiple owned
 *     by Trading Core (§28). Both are reported; the deviation is their
 *     difference, clearly labeled as planned-RR vs realized-R.
 *   - Missing legs (no plan, no stop, sync trade without riskAmount…) are
 *     unavailable=true with null deviations — never fabricated (§67).
 *   - Pips require the instrument catalog (Phase 5); unknown symbols get
 *     null pips but keep price-space deviations.
 *
 * Money/price math uses Decimal on the wire-format decimal STRINGS and emits
 * decimal strings (no binary float, §40).
 *
 * Domain module: imports NO framework code (§75).
 */
import Decimal from "decimal.js";

/** Comparison-relevant plan values (from the frozen snapshot or live row). */
export interface ComparisonPlanInput {
  direction: "BUY" | "SELL";
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  /** Engine-derived money risk at planning time (null for quantity-mode). */
  riskAmount: string | null;
  /** Engine-derived position size in lots (null when sizing stayed input-only). */
  positionSize: string | null;
  /** Planned reward:risk ratio (Phase 5 canonical rrRatio). */
  rrRatio: string | null;
}

/** Comparison-relevant canonical trade values (Trading Core — read-only). */
export interface ComparisonTradeInput {
  direction: "BUY" | "SELL";
  /** Volume-weighted average entry price (canonical aggregate). */
  entryPrice: string;
  initialStop: string | null;
  initialTP: string | null;
  /** Money risked at entry (manual journals may supply; sync leaves null). */
  riskAmount: string | null;
  /** Filled quantity (Σ entry volumes). */
  quantity: string;
  /** Realized R (pnlNet / riskAmount) — null when riskAmount unknown. */
  rMultiple: string | null;
}

export interface ComparisonSpecsInput {
  /** Price increment of one pip, e.g. "0.0001" — null when catalog misses the symbol. */
  pipSize: string | null;
}

export type ComparisonBasedOn = "SNAPSHOT" | "LIVE" | "NONE";

/** One comparison leg (shared comparisonLegSchema shape, domain-side type). */
export interface ComparisonLeg {
  planned: string | null;
  actual: string | null;
  deviation: string | null;
  deviationPips: number | null;
  available: boolean;
}

export interface PlanVsActualResult {
  basedOn: ComparisonBasedOn;
  hasPlan: boolean;
  direction: {
    planned: "BUY" | "SELL" | null;
    actual: "BUY" | "SELL" | null;
    match: boolean | null;
  };
  entry: ComparisonLeg;
  stop: ComparisonLeg;
  target: ComparisonLeg;
  risk: ComparisonLeg;
  size: ComparisonLeg;
  /** Planned reward:risk vs realized R — both canonical (§28). */
  rMultiple: ComparisonLeg;
}

function dec(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

/** Wire convention: plain fixed-point string, no exponent, no float drift. */
function wire(value: Decimal): string {
  return value.toFixed();
}

/** Pips rounding: 0.1 pip resolution is the finest honest display unit. */
function pipsFrom(deviation: Decimal | null, pipSize: Decimal | null): number | null {
  if (deviation === null || pipSize === null || pipSize.isZero()) return null;
  return Number(deviation.abs().div(pipSize).toDecimalPlaces(1).toFixed());
}

function leg(
  planned: Decimal | null,
  actual: Decimal | null,
  pipSize: Decimal | null,
): ComparisonLeg {
  const available = planned !== null && actual !== null;
  const deviation = available ? actual!.minus(planned!) : null;
  return {
    planned: planned === null ? null : wire(planned),
    actual: actual === null ? null : wire(actual),
    deviation: deviation === null ? null : wire(deviation),
    deviationPips: deviation === null ? null : pipsFrom(deviation, pipSize),
    available,
  };
}

/** Price-space legs only — pips are meaningless for money/size/R legs. */
function priceLeg(
  planned: Decimal | null,
  actual: Decimal | null,
  pipSize: Decimal | null,
): ComparisonLeg {
  return leg(planned, actual, pipSize);
}

/** Money/size/R legs: deviation only, never pips. */
function scalarLeg(planned: Decimal | null, actual: Decimal | null): ComparisonLeg {
  return leg(planned, actual, null);
}

/**
 * Compare a plan against the canonical trade. When `basedOn` is NONE the
 * plan legs stay null/unavailable while the actual legs still echo the
 * canonical trade facts (the detail response remains useful without a
 * plan — §67 "no plan: the review must still function").
 */
export function comparePlanAgainstTrade(
  plan: ComparisonPlanInput | null,
  trade: ComparisonTradeInput,
  specs: ComparisonSpecsInput,
  basedOn: ComparisonBasedOn,
): PlanVsActualResult {
  const pipSize = dec(specs.pipSize);

  const plannedEntry = plan === null ? null : dec(plan.entryPrice);
  const actualEntry = dec(trade.entryPrice);

  const plannedStop = plan === null ? null : dec(plan.stopLoss);
  const actualStop = dec(trade.initialStop);

  const plannedTarget = plan === null ? null : dec(plan.takeProfit);
  const actualTarget = dec(trade.initialTP);

  const plannedRisk = plan === null ? null : dec(plan.riskAmount);
  const actualRisk = dec(trade.riskAmount);

  const plannedSize = plan === null ? null : dec(plan.positionSize);
  const actualSize = dec(trade.quantity);

  const plannedR = plan === null ? null : dec(plan.rrRatio);
  const actualR = dec(trade.rMultiple);

  return {
    basedOn,
    hasPlan: plan !== null,
    direction: {
      planned: plan === null ? null : plan.direction,
      actual: trade.direction,
      match: plan === null ? null : plan.direction === trade.direction,
    },
    entry: priceLeg(plannedEntry, actualEntry, pipSize),
    stop: priceLeg(plannedStop, actualStop, pipSize),
    target: priceLeg(plannedTarget, actualTarget, pipSize),
    risk: scalarLeg(plannedRisk, actualRisk),
    size: scalarLeg(plannedSize, actualSize),
    rMultiple: scalarLeg(plannedR, actualR),
  };
}
