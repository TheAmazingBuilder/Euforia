import { toDecimalString, parseDecimal } from "./money";

/**
 * Risk & position math - pure, deterministic.
 *
 * All inputs accept decimal strings (the wire format) or numbers; outputs
 * that represent money/quantities are canonical decimal strings. These are
 * LIVE-ESTIMATE helpers: the server recomputes authoritative values at
 * write time (data-model.md §13).
 */

export type NumericInput = string | number | null | undefined;

export interface InstrumentSpecs {
  /** Price increment of one pip, e.g. "0.0001" forex, "1" Boom/Crash. */
  pipSize: NumericInput;
  /** Units per lot/contract, e.g. "100000" EURUSD, "1" synthetics/crypto. */
  contractSize: NumericInput;
}

function num(value: NumericInput): number | null {
  return parseDecimal(value);
}

/** Round away float artifacts (0.1+0.2 style) before quantizing. */
function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/**
 * Planned risk:reward ratio from entry, stop and target.
 * BUY:  risk = entry − stop, reward = target − entry.
 * SELL: risk = stop − entry, reward = entry − target.
 * Returns null when the stop is on the wrong side of entry (risk ≤ 0) or an
 * input is unparsable. The reward may be ≤ 0 (bad setup) - that is returned
 * as a negative ratio so the form can flag it ("R:R 1:0.3 - intended?").
 */
export function computeRR(
  entry: NumericInput,
  stop: NumericInput,
  target: NumericInput,
  direction: "BUY" | "SELL",
): number | null {
  const e = num(entry);
  const s = num(stop);
  const t = num(target);
  if (e === null || s === null || t === null) return null;
  const risk = direction === "BUY" ? e - s : s - e;
  if (risk <= 0) return null;
  const reward = direction === "BUY" ? t - e : e - t;
  return reward / risk;
}

/**
 * Money at risk for a given position: |entry − stop| × quantity × contractSize.
 * Returns a decimal string (account currency), or null on invalid input
 * (stop equal to entry, unparsable values).
 */
export function computeRiskAmount(
  entry: NumericInput,
  stop: NumericInput,
  quantity: NumericInput,
  contractSize: NumericInput = 1,
): string | null {
  const e = num(entry);
  const s = num(stop);
  const q = num(quantity);
  const c = num(contractSize) ?? 1;
  if (e === null || s === null || q === null || c === null) return null;
  const distance = Math.abs(e - s);
  if (distance === 0 || q <= 0 || c <= 0) return null;
  return toDecimalString(distance * q * c);
}

export interface SuggestedPosition {
  /** Quantity (lots/units) floored to 0.01 so risk is never exceeded. */
  quantity: string;
  /** Money risked by the suggested quantity (account currency). */
  riskAmount: string;
  /** Stop distance in price units. */
  stopDistance: string;
  /** Stop distance expressed in pips (uses specs.pipSize). */
  stopPips: string;
}

/**
 * Suggest a position size from a risk budget:
 * riskAmount = balance × riskPct / 100; quantity = riskAmount / (|entry − stop| × contractSize),
 * floored to 0.01 (micro-lot granularity) so realized risk ≤ budget.
 * Returns null when the stop equals the entry, or balance/riskPct ≤ 0.
 */
export function suggestPositionSize(
  entry: NumericInput,
  stop: NumericInput,
  riskPct: NumericInput,
  balance: NumericInput,
  specs: InstrumentSpecs,
): SuggestedPosition | null {
  const e = num(entry);
  const s = num(stop);
  const pct = num(riskPct);
  const bal = num(balance);
  const pip = num(specs.pipSize);
  const c = num(specs.contractSize) ?? 1;
  if (e === null || s === null || pct === null || bal === null || pip === null || c === null) {
    return null;
  }
  if (pct <= 0 || bal <= 0 || c <= 0 || pip <= 0) return null;
  const distance = Math.abs(e - s);
  if (distance === 0) return null;
  const riskAmount = (bal * pct) / 100;
  const perUnit = distance * c;
  const rawQuantity = riskAmount / perUnit;
  // Round to 6 decimals BEFORE flooring to 0.01, so float artifacts
  // (0.19999999999999996) don't degrade the suggestion to 0.19.
  const quantity = Math.floor(roundTo(rawQuantity, 6) * 100) / 100;
  if (quantity <= 0) return null;
  return {
    quantity: toDecimalString(quantity),
    riskAmount: toDecimalString(quantity * perUnit),
    stopDistance: toDecimalString(distance),
    stopPips: toDecimalString(distance / pip),
  };
}

export interface PnlForExitInput {
  entry: NumericInput;
  exit: NumericInput;
  direction: "BUY" | "SELL";
  quantity: NumericInput;
  contractSize?: NumericInput;
  /** Total fees (cost → subtracted). */
  fees?: NumericInput;
  /** Overnight swap (negative or positive). */
  swap?: NumericInput;
}

/**
 * Net P&L of a single exit: Δ × quantity × contractSize − fees − swap.
 * BUY: Δ = exit − entry; SELL: Δ = entry − exit.
 * Returns a decimal string, or null on invalid input. Display estimate only -
 * the server recomputes and stores the authoritative pnlGross/pnlNet.
 */
export function pnlForExit(input: PnlForExitInput): string | null {
  const e = num(input.entry);
  const x = num(input.exit);
  const q = num(input.quantity);
  const c = num(input.contractSize) ?? 1;
  const f = num(input.fees) ?? 0;
  const sw = num(input.swap) ?? 0;
  if (e === null || x === null || q === null || c === null) return null;
  const delta = input.direction === "BUY" ? x - e : e - x;
  const net = delta * q * c - f - sw;
  return toDecimalString(net);
}
