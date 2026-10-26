import { z } from "zod";
import {
  computeBreakEvenWinRate,
  computeExpectancy,
  computePercentOfBalance,
  computeRewardAmount,
  computeRewardMultiple,
  computeRiskPerTrade,
  buildRiskRewardMatrix,
  RR_DEFAULT_RATIOS,
  RR_DEFAULT_WIN_RATES,
  RR_MAX_BALANCE,
  RR_MAX_REWARD_MULTIPLE,
  RR_MAX_TRADES,
  type Currency,
  type RRMatrixRow,
  type RiskMode,
} from "@cosmoz/shared";

/**
 * Risk/Reward model - the pure layer between the UI and the shared expectancy
 * engine (same architecture as the lot-size/compounding models):
 *
 * Zod schemas validate the RAW FORM STRINGS with stable error codes (the dict
 * supplies the human copy - codes map 1:1 to dict.tools.riskReward.validation
 * keys). Derivations compose the shared risk-reward engine; nothing clamps
 * silently - an invalid field yields a stable code the UI renders inline.
 *
 * No React, no API calls - pure, deterministic, unit-testable.
 */

// ── Field-level schemas (stable codes, dict renders them) ───────────────────

/** Plain decimal text field: required, digits with optional fraction. */
const decimalField = z
  .string()
  .trim()
  .min(1, "required")
  .regex(/^\d+(\.\d+)?$/, "invalidNumber");

/** Whole-number text field (trade count). */
const integerField = z
  .string()
  .trim()
  .min(1, "required")
  .regex(/^\d+$/, "invalidNumber");

// ── Form shape ───────────────────────────────────────────────────────────────

export type RiskRewardFieldErrorCode =
  | "required"
  | "invalidNumber"
  | "balancePositive"
  | "riskRange"
  | "riskPositive"
  | "riskExceedsBalance"
  | "rewardPositive"
  | "ratioRange"
  | "tradesRange";

export type RiskRewardField =
  | "balance"
  | "riskPercent"
  | "fixedRisk"
  | "rewardMultiple"
  | "stopLossAmount"
  | "takeProfitAmount"
  | "trades";

export type RiskRewardFieldErrors = Partial<Record<RiskRewardField, RiskRewardFieldErrorCode>>;

export type RatioMode = "multiple" | "amounts";

export interface RiskRewardFormValues {
  balance: string;
  currency: Currency;
  riskMode: RiskMode;
  riskPercent: string;
  fixedRisk: string;
  ratioMode: RatioMode;
  rewardMultiple: string;
  stopLossAmount: string;
  takeProfitAmount: string;
  trades: string;
}

export interface RiskRewardNumbers {
  balance: number;
  riskMode: RiskMode;
  riskPercent: number | null;
  fixedRisk: number | null;
  ratioMode: RatioMode;
  rewardMultiple: number;
  trades: number;
}

const shape = z.object({
  balance: decimalField,
  riskMode: z.enum(["percent", "fixed"]),
  riskPercent: z.string().trim(),
  fixedRisk: z.string().trim(),
  ratioMode: z.enum(["multiple", "amounts"]),
  rewardMultiple: z.string().trim(),
  stopLossAmount: z.string().trim(),
  takeProfitAmount: z.string().trim(),
  trades: integerField,
});

export interface RiskRewardDerived {
  /** Monetary risk per losing trade, L (decimal string for display math). */
  riskAmount: string;
  /** Monetary reward per winning trade, G = L × R (decimal string). */
  rewardAmount: string;
  /** Reward multiple, R (float - the calculation-side value). */
  rewardMultiple: number;
  /** Break-even win rate as a RATIO in [0,1] (feed formatPercent). */
  breakEvenWinRate: number;
  /** Risk as a ratio of the starting balance (feed formatPercent). */
  riskPercentOfBalance: number;
  /** Reward as a ratio of the starting balance (feed formatPercent). */
  rewardPercentOfBalance: number;
  trades: number;
  /** The full cheat-sheet matrix for the current inputs. */
  matrix: RRMatrixRow[];
  /** Win-rate columns currently rendered. */
  winRates: readonly number[];
  /** Reward/risk rows currently rendered. */
  ratios: readonly number[];
}

/**
 * Validate the risk/reward form and derive everything the UI renders.
 * `extraRatios` adds optional reward-multiple rows on top of the default
 * matrix rows (the 1:6 / 1:8 / 1:10 toggles, spec §7.1).
 * Returns the parsed model or one stable code per offending field - never
 * both, never throws.
 */
export function validateRiskRewardForm(
  values: RiskRewardFormValues,
  extraRatios: readonly number[] = [],
): { ok: true; data: RiskRewardNumbers; derived: RiskRewardDerived } | { ok: false; errors: RiskRewardFieldErrors } {
  const parsed = shape.safeParse(values);
  if (!parsed.success) {
    const errors: RiskRewardFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in errors)) {
        errors[key as RiskRewardField] = issue.message as RiskRewardFieldErrorCode;
      }
    }
    return { ok: false, errors };
  }

  const d = parsed.data;
  const balance = Number(d.balance);
  const trades = Number(d.trades);
  const riskPercent = d.riskPercent.trim() === "" ? null : Number(d.riskPercent);
  const fixedRisk = d.fixedRisk.trim() === "" ? null : Number(d.fixedRisk);
  const rewardMultipleInput = d.rewardMultiple.trim() === "" ? null : Number(d.rewardMultiple);
  const stopLossAmount = d.stopLossAmount.trim() === "" ? null : Number(d.stopLossAmount);
  const takeProfitAmount = d.takeProfitAmount.trim() === "" ? null : Number(d.takeProfitAmount);

  const errors: RiskRewardFieldErrors = {};
  const flag = (field: RiskRewardField, code: RiskRewardFieldErrorCode) => {
    if (!(field in errors)) errors[field] = code;
  };

  if (!(balance > 0) || balance > RR_MAX_BALANCE) flag("balance", "balancePositive");
  if (!Number.isInteger(trades) || trades < 1 || trades > RR_MAX_TRADES) {
    flag("trades", "tradesRange");
  }

  // Reward multiple - either direct, or derived from monetary SL/TP amounts.
  let rewardMultiple: number | null = null;
  if (d.ratioMode === "multiple") {
    if (rewardMultipleInput === null) {
      flag("rewardMultiple", "required");
    } else if (!(rewardMultipleInput > 0) || rewardMultipleInput > RR_MAX_REWARD_MULTIPLE) {
      flag("rewardMultiple", "ratioRange");
    } else {
      rewardMultiple = rewardMultipleInput;
    }
  } else {
    if (stopLossAmount === null) {
      flag("stopLossAmount", "required");
    } else if (!(stopLossAmount > 0)) {
      flag("stopLossAmount", "rewardPositive");
    }
    if (takeProfitAmount === null) {
      flag("takeProfitAmount", "required");
    } else if (!(takeProfitAmount > 0)) {
      flag("takeProfitAmount", "rewardPositive");
    }
    if (!errors.stopLossAmount && !errors.takeProfitAmount) {
      rewardMultiple = computeRewardMultiple(stopLossAmount!, takeProfitAmount!);
      if (rewardMultiple === null) flag("takeProfitAmount", "ratioRange");
    }
  }

  // Monetary risk per trade - percent or fixed mode.
  let riskPerTrade: number | null = null;
  if (d.riskMode === "percent") {
    if (riskPercent === null) {
      flag("riskPercent", "required");
    } else if (!(riskPercent > 0) || riskPercent > 100) {
      flag("riskPercent", "riskRange");
    } else {
      riskPerTrade = computeRiskPerTrade({ mode: "percent", balance, riskPercent, fixedRiskAmount: 0 });
      if (riskPerTrade === null) flag("riskPercent", "riskRange");
    }
  } else {
    if (fixedRisk === null) {
      flag("fixedRisk", "required");
    } else if (!(fixedRisk > 0)) {
      flag("fixedRisk", "riskPositive");
    } else if (fixedRisk > balance) {
      // Fixed-risk model without compounding: the risk per trade cannot exceed
      // the starting balance (spec §5.1.B).
      flag("fixedRisk", "riskExceedsBalance");
    } else {
      riskPerTrade = computeRiskPerTrade({ mode: "fixed", balance, riskPercent: 0, fixedRiskAmount: fixedRisk });
      if (riskPerTrade === null) flag("fixedRisk", "riskPositive");
    }
  }

  if (Object.keys(errors).length > 0 || rewardMultiple === null || riskPerTrade === null) {
    return { ok: false, errors };
  }

  const reward = computeRewardAmount(riskPerTrade, rewardMultiple)!;
  const breakEven = computeBreakEvenWinRate(rewardMultiple)!;
  const ratios = [...RR_DEFAULT_RATIOS, ...extraRatios.filter((r) => !RR_DEFAULT_RATIOS.includes(r))].sort(
    (a, b) => a - b,
  );
  const matrix = buildRiskRewardMatrix({
    riskAmount: riskPerTrade,
    trades,
    winRates: RR_DEFAULT_WIN_RATES,
    rewardMultiples: ratios,
  });

  return {
    ok: true,
    data: {
      balance,
      riskMode: d.riskMode,
      riskPercent: d.riskMode === "percent" ? riskPercent : null,
      fixedRisk: d.riskMode === "fixed" ? fixedRisk : null,
      ratioMode: d.ratioMode,
      rewardMultiple,
      trades,
    },
    derived: {
      riskAmount: String(riskPerTrade),
      rewardAmount: String(reward),
      rewardMultiple,
      breakEvenWinRate: breakEven,
      riskPercentOfBalance: computePercentOfBalance(riskPerTrade, balance)!,
      rewardPercentOfBalance: computePercentOfBalance(reward, balance)!,
      trades,
      matrix,
      winRates: RR_DEFAULT_WIN_RATES,
      ratios,
    },
  };
}

/**
 * Cell detail bundle for the tooltip/detail panel (spec §7.5): the full
 * expectancy decomposition of one (win rate, ratio) pair, or null when the
 * cell did not compute.
 */
export function cellDetail(
  derived: RiskRewardDerived,
  winRatePercent: number,
  rewardMultiple: number,
) {
  return computeExpectancy({
    riskAmount: Number(derived.riskAmount),
    rewardMultiple,
    winRatePercent,
    trades: derived.trades,
  });
}
