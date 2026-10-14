import { toDecimalString } from "./money";

/**
 * Risk/Reward expectancy engine — pure, deterministic financial math.
 *
 * This is the client-side LIVE-ESTIMATE layer behind the TOOLS > Risk/Reward
 * Calculator & Win Rate Cheat Sheet (same contract family as utils/risk.ts and
 * utils/compounding.ts). No React, no I/O — every function is unit-testable
 * and safe to call on every keystroke.
 *
 * Model (spec §6): a FIXED monetary risk per trade derived from the starting
 * balance or given as a fixed amount — the balance is NEVER compounded after
 * each trade. For a reward multiple R and win rate p over N trades:
 *   L = monetary loss per losing trade
 *   G = L × R                    (monetary gain per winning trade)
 *   W = N × p                    (expected winning trades — expected VALUE,
 *                                 never rounded to a whole number, spec §11.1)
 *   D = N − W                    (expected losing trades)
 *   Gross Profit = W × G
 *   Gross Loss   = D × L
 *   P = W×G − D×L  =  N × L × [p·R − (1 − p)]
 *
 * The break-even win rate of a reward multiple R is 1 / (1 + R):
 *   R=1 → 50 %, R=2 → 33.33 %, R=3 → 25 %, R=4 → 20 %, R=5 → 16.67 %.
 *
 * All results are theoretical and exclude transaction costs (commissions,
 * spread, slippage, swaps, financing) — the module never invents cost values.
 */

/** Risk input mode: a percentage of the starting balance, or a fixed amount. */
export type RiskMode = "percent" | "fixed";

/** Outcome classification of a theoretical net result (spec §7.3). */
export type RROutcome = "loss" | "breakeven" | "profit";

// ── Product caps (documented, enforced — never silent clamps) ────────────────

/** Maximum account balance accepted by the live-estimate layer. */
export const RR_MAX_BALANCE = 1e12;
/** Maximum monetary risk per trade. */
export const RR_MAX_RISK_AMOUNT = 1e12;
/** Maximum reward multiple (1:1000). */
export const RR_MAX_REWARD_MULTIPLE = 1000;
/** Maximum simulated trades in the matrix. */
export const RR_MAX_TRADES = 1_000_000;
/**
 * Numerical tolerance for the BREAK EVEN classification: a theoretical net
 * result whose magnitude is ≤ tolerance × max(1, grossProfit + grossLoss) is
 * classified as break even. Classification ALWAYS uses the unrounded result
 * (spec §6.1) — display formatting never feeds back into classification.
 */
export const RR_BREAK_EVEN_TOLERANCE = 1e-9;
/** Hard ceiling on the emitted |net| — beyond this the input set is rejected. */
const RR_MAX_NET = 1e15;

// ── Matrix defaults (spec §7.1) ──────────────────────────────────────────────

/** Default win-rate columns, in percent. */
export const RR_DEFAULT_WIN_RATES: readonly number[] = [
  20, 30, 40, 50, 60, 70, 80, 90, 95, 100,
];

/** Default reward/risk rows (multiples). */
export const RR_DEFAULT_RATIOS: readonly number[] = [1, 2, 3, 4, 5];

/** Optional extra rows the UI can toggle on (spec §7.1 "where practical"). */
export const RR_EXTRA_RATIOS: readonly number[] = [6, 8, 10];

// ── Core derivations ─────────────────────────────────────────────────────────

/**
 * Monetary risk per losing trade — L, the fixed per-trade risk (spec §6).
 * Percent mode: L = balance × riskPercent / 100.
 * Fixed mode:   L = fixedRiskAmount.
 * Named `computeRiskPerTrade` (not computeRiskAmount) because utils/risk.ts
 * already owns that name for the position-sizing sense.
 * Returns `null` on any invalid path (non-finite, balance ≤ 0, out-of-range
 * values, risk > balance cap) — never throws, never NaN.
 */
export function computeRiskPerTrade(params: {
  mode: RiskMode;
  /** Starting balance (> 0, required in percent mode). */
  balance: number;
  /** Risk PERCENT (0 < p ≤ 100, percent mode only). */
  riskPercent: number;
  /** Fixed monetary risk (> 0, fixed mode only). */
  fixedRiskAmount: number;
}): number | null {
  const { mode, balance, riskPercent, fixedRiskAmount } = params;
  if (
    !Number.isFinite(balance) ||
    !Number.isFinite(riskPercent) ||
    !Number.isFinite(fixedRiskAmount)
  ) {
    return null;
  }
  if (balance <= 0 || balance > RR_MAX_BALANCE) return null;
  if (mode === "percent") {
    if (riskPercent <= 0 || riskPercent > 100) return null;
    const risk = (balance * riskPercent) / 100;
    if (!(risk > 0) || risk > RR_MAX_RISK_AMOUNT) return null;
    return risk;
  }
  if (fixedRiskAmount <= 0 || fixedRiskAmount > RR_MAX_RISK_AMOUNT) return null;
  return fixedRiskAmount;
}

/**
 * Monetary reward per winning trade: G = L × R.
 * Returns `null` when the risk or the multiple is invalid.
 */
export function computeRewardAmount(
  riskAmount: number,
  rewardMultiple: number,
): number | null {
  if (
    !Number.isFinite(riskAmount) ||
    !Number.isFinite(rewardMultiple) ||
    riskAmount <= 0 ||
    rewardMultiple <= 0 ||
    rewardMultiple > RR_MAX_REWARD_MULTIPLE
  ) {
    return null;
  }
  const reward = riskAmount * rewardMultiple;
  if (!Number.isFinite(reward) || reward > RR_MAX_RISK_AMOUNT * RR_MAX_REWARD_MULTIPLE) {
    return null;
  }
  return reward;
}

/**
 * Reward multiple from monetary stop-loss / take-profit amounts:
 * R = takeProfit / stopLoss (both stricty positive monetary amounts).
 * Returns `null` on zero/negative/invalid inputs — division by zero is
 * reported, never silently absorbed.
 */
export function computeRewardMultiple(
  stopLossAmount: number,
  takeProfitAmount: number,
): number | null {
  if (
    !Number.isFinite(stopLossAmount) ||
    !Number.isFinite(takeProfitAmount) ||
    stopLossAmount <= 0 ||
    takeProfitAmount <= 0
  ) {
    return null;
  }
  const ratio = takeProfitAmount / stopLossAmount;
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > RR_MAX_REWARD_MULTIPLE) {
    return null;
  }
  return ratio;
}

/**
 * Break-even win rate of a reward multiple R, as a RATIO in [0, 1]
 * (feed it to formatPercent directly): 1 / (1 + R).
 * R=1 → 0.5, R=3 → 0.25, R=5 → 0.1667. `null` on an invalid multiple.
 */
export function computeBreakEvenWinRate(
  rewardMultiple: number,
): number | null {
  if (
    !Number.isFinite(rewardMultiple) ||
    rewardMultiple <= 0 ||
    rewardMultiple > RR_MAX_REWARD_MULTIPLE
  ) {
    return null;
  }
  return 1 / (1 + rewardMultiple);
}

/**
 * An amount as a percent of the starting balance (ratio in [0, 1] for
 * formatPercent). `null` on an invalid balance.
 */
export function computePercentOfBalance(
  amount: number,
  balance: number,
): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(balance) || balance <= 0) {
    return null;
  }
  return amount / balance;
}

// ── Expectancy (the matrix cell engine) ──────────────────────────────────────

export interface RRExpectancyInput {
  /** Monetary loss per losing trade, L (> 0). */
  riskAmount: number;
  /** Reward multiple, R (> 0). */
  rewardMultiple: number;
  /** Win rate, PERCENT (0 ≤ p ≤ 100). */
  winRatePercent: number;
  /** Number of simulated trades, N (integer ≥ 1, ≤ RR_MAX_TRADES). */
  trades: number;
}

export interface RRExpectancyResult {
  /** Expected winning trades W = N × p — expected VALUE, never pre-rounded. */
  wins: number;
  /** Expected losing trades D = N − W. */
  losses: number;
  /** Gross winning profit W × G. */
  grossProfit: number;
  /** Gross losing loss D × L. */
  grossLoss: number;
  /** Theoretical net result P = W×G − D×L (unrounded — classification source). */
  net: number;
  /** Canonical decimal string of the net result (≤ 8 decimals). */
  netDecimal: string;
  /** Classification of the UNROUNDED net result. */
  outcome: RROutcome;
}

/**
 * Theoretical expectancy of a trade sample (spec §6) — the engine behind every
 * matrix cell. Fixed monetary risk, no compounding, no transaction costs.
 *
 * Returns `null` on any invalid input (never throws, never emits NaN or
 * Infinity): non-finite values, L ≤ 0, R out of range, win rate outside
 * [0, 100], non-integer or out-of-range trade count, or a net result that
 * escapes the ±1e15 display ceiling.
 */
export function computeExpectancy(
  input: RRExpectancyInput,
): RRExpectancyResult | null {
  const { riskAmount, rewardMultiple, winRatePercent, trades } = input;

  if (
    !Number.isFinite(riskAmount) ||
    !Number.isFinite(rewardMultiple) ||
    !Number.isFinite(winRatePercent) ||
    !Number.isFinite(trades)
  ) {
    return null;
  }
  if (riskAmount <= 0 || riskAmount > RR_MAX_RISK_AMOUNT) return null;
  if (rewardMultiple <= 0 || rewardMultiple > RR_MAX_REWARD_MULTIPLE) return null;
  if (winRatePercent < 0 || winRatePercent > 100) return null;
  if (!Number.isInteger(trades) || trades < 1 || trades > RR_MAX_TRADES) return null;

  const p = winRatePercent / 100;
  const wins = trades * p; // expected value — deliberately NOT rounded (§11.1)
  const losses = trades - wins;
  const grossProfit = wins * riskAmount * rewardMultiple;
  const grossLoss = losses * riskAmount;
  const net = grossProfit - grossLoss;
  if (!Number.isFinite(net) || Math.abs(net) > RR_MAX_NET) return null;

  // Classification on the UNROUNDED result with the documented tolerance (§6.1,
  // §7.3): a genuinely negative/positive result beyond the tolerance keeps its
  // sign class — a near-zero float artifact reads as break even.
  const tolerance = RR_BREAK_EVEN_TOLERANCE * Math.max(1, grossProfit + grossLoss);
  const outcome: RROutcome =
    Math.abs(net) <= tolerance ? "breakeven" : net < 0 ? "loss" : "profit";

  return {
    wins,
    losses,
    grossProfit,
    grossLoss,
    net,
    netDecimal: toDecimalString(net),
    outcome,
  };
}

// ── Win Rate Cheat Sheet matrix (spec §7) ────────────────────────────────────

export interface RRMatrixCell {
  /** Win rate of the column, PERCENT. */
  winRatePercent: number;
  /** Reward multiple of the row, R. */
  rewardMultiple: number;
  /** Computed expectancy — `null` for an invalid combination (never silently). */
  expectancy: RRExpectancyResult | null;
}

export interface RRMatrixRow {
  /** Reward multiple of the row, R. */
  rewardMultiple: number;
  /** One cell per win-rate column, same order as `winRates`. */
  cells: RRMatrixCell[];
}

/**
 * Build the full Win Rate Cheat Sheet matrix: rows = reward multiples,
 * columns = win rates, every cell computed INDEPENDENTLY from its own
 * (R, p) pair over the shared risk amount and trade count (spec §7.2 — no
 * hardcoded cell contents, no shared results between cells).
 */
export function buildRiskRewardMatrix(params: {
  /** Monetary risk per trade, L (> 0). */
  riskAmount: number;
  /** Trade count N (integer ≥ 1). */
  trades: number;
  /** Win-rate columns, PERCENT (e.g. RR_DEFAULT_WIN_RATES). */
  winRates: readonly number[];
  /** Reward-multiple rows (e.g. RR_DEFAULT_RATIOS). */
  rewardMultiples: readonly number[];
}): RRMatrixRow[] {
  const { riskAmount, trades, winRates, rewardMultiples } = params;
  return rewardMultiples.map((rewardMultiple) => ({
    rewardMultiple,
    cells: winRates.map((winRatePercent) => ({
      winRatePercent,
      rewardMultiple,
      expectancy: computeExpectancy({
        riskAmount,
        rewardMultiple,
        winRatePercent,
        trades,
      }),
    })),
  }));
}
