/**
 * Compounding Calculator — pure math (MASTER PROMPT §18–§27, §32; V1.1
 * deposits + annual mode; V1.2 withdrawals + variable-return scenarios).
 *
 * Formula (§20): A = P × (1 + r)^n applied PERIOD by PERIOD, where r is the
 * "Gain per Period (%)" exactly as the UI labels it. With an optional
 * periodic deposit D and withdrawal W the recurrence becomes:
 *
 *   B(n) = B(n−1) × (1 + r) + D − W    (flows at period END, after growth)
 *   closed form: P·g^n + (D−W)·(g^n − 1)/(g − 1)   for g ≠ 1
 *                P + (D−W)·n                    for g = 1 (0% gain)
 *
 * An annual-rate mode (§21) is layered ON TOP of this recurrence by the
 * annual-mode helper — it only converts the annual rate into an effective
 * per-period rate; the projection itself stays the same loop.
 *
 * Variable-return scenarios (V1.2) run the SAME projection under a
 * pessimistic / optimistic gain expressed in the ACTIVE rate mode — they
 * compare endpoints, never replace the base schedule.
 *
 * Full precision is kept inside the schedule; rounding happens only at
 * display time (shared formatters). Negative returns reduce the balance;
 * r = −100% plus a deposit can resurrect the balance (the deposit still
 * lands). Withdrawals beyond the available balance can drive the projection
 * negative — shown as-is (an honest "the plan runs out of money" signal),
 * never clamped silently. The function never throws on validated input.
 */

import type {
  CompoundingInput,
  CompoundingPeriodResult,
  CompoundingPeriodUnit,
  CompoundingResult,
  CompoundingScenarioOutcome,
} from "./types";

/** Frontend maximum for the periods field (§25 — protects render + scroll). */
export const MAX_COMPOUNDING_PERIODS = 200;

/** Calendar periods per year, by unit — the annual-mode conversion basis. */
export const PERIODS_PER_YEAR: Record<CompoundingPeriodUnit, number> = {
  DAILY: 365,
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
};

export const DEFAULT_PERIOD_UNIT: CompoundingPeriodUnit = "MONTHLY";

/** Calendar periods per year for the chosen unit (defensive default). */
export function periodsPerYear(unit: CompoundingPeriodUnit | undefined): number {
  return unit !== undefined && unit in PERIODS_PER_YEAR ? PERIODS_PER_YEAR[unit] : PERIODS_PER_YEAR[DEFAULT_PERIOD_UNIT];
}

/**
 * Effective gain applied PER PERIOD, in percent:
 * - PER_PERIOD mode: the input gain, untouched (V1 behavior).
 * - ANNUAL mode: the compound-consistent conversion of the annual rate —
 *   (1 + annual)^(1/periodsPerYear) − 1 — so N periods spanning one year
 *   reproduce the annual rate EXACTLY (12 monthly periods at 12% → ×1.12).
 */
export function effectivePeriodicGain(
  input: Pick<CompoundingInput, "gainPerPeriod" | "rateMode" | "annualGain" | "periodUnit">,
): number {
  if (input.rateMode === "ANNUAL" && input.annualGain !== undefined) {
    const ppy = periodsPerYear(input.periodUnit);
    return ((1 + input.annualGain / 100) ** (1 / ppy) - 1) * 100;
  }
  return input.gainPerPeriod;
}

/** Deposit actually applied (0 when absent/negative — defensive mirror). */
export function effectiveDeposit(input: CompoundingInput): number {
  return input.depositPerPeriod !== undefined && input.depositPerPeriod > 0
    ? input.depositPerPeriod
    : 0;
}

/** Withdrawal actually applied (0 when absent/negative — defensive mirror). */
export function effectiveWithdrawal(input: CompoundingInput): number {
  return input.withdrawalPerPeriod !== undefined && input.withdrawalPerPeriod > 0
    ? input.withdrawalPerPeriod
    : 0;
}

/** Growth applied to one period: 1 + gain/100. */
export function periodGrowthFactor(gainPerPeriod: number): number {
  return 1 + gainPerPeriod / 100;
}

/** Closed-form projection used to assert the schedule's last row. */
export function projectFinalBalance(input: CompoundingInput): number {
  const gain = effectivePeriodicGain(input);
  const growth = periodGrowthFactor(gain);
  const netFlow = effectiveDeposit(input) - effectiveWithdrawal(input);
  if (netFlow === 0) {
    return input.startingBalance * growth ** input.periods;
  }
  const grown = growth ** input.periods;
  if (Math.abs(growth - 1) < 1e-12) {
    // 0% gain — deposits/withdrawals simply stack.
    return input.startingBalance + netFlow * input.periods;
  }
  return input.startingBalance * grown + netFlow * ((grown - 1) / (growth - 1));
}

/**
 * Period-by-period compounding schedule.
 * - `startingBalance`: balance at the beginning of the period.
 * - `endingBalance`: balance after that period's gain, deposit and withdrawal.
 * - `deposit` / `withdrawal`: the flows applied at the end of the period
 *   (echoes of the input, 0 = none).
 * - `totalProfit`: endingBalance + withdrawals so far − capital contributed
 *   so far (earned gain — withdrawn money is returned to you, not lost).
 * - `totalGain`: cumulative earned gain on the capital contributed, in percent.
 */
export function generateCompoundingSchedule(input: CompoundingInput): CompoundingPeriodResult[] {
  const growth = periodGrowthFactor(effectivePeriodicGain(input));
  const deposit = effectiveDeposit(input);
  const withdrawal = effectiveWithdrawal(input);
  const schedule: CompoundingPeriodResult[] = [];
  let balance = input.startingBalance;
  let contributed = input.startingBalance;
  let withdrawn = 0;
  for (let period = 1; period <= input.periods; period += 1) {
    const startingBalance = balance;
    balance = startingBalance * growth + deposit - withdrawal;
    contributed += deposit;
    withdrawn += withdrawal;
    schedule.push({
      period,
      startingBalance,
      endingBalance: balance,
      deposit,
      withdrawal,
      totalProfit: balance + withdrawn - contributed,
      totalGain: contributed > 0 ? ((balance + withdrawn) / contributed - 1) * 100 : 0,
    });
  }
  return schedule;
}

/**
 * One scenario outcome — the SAME engine (flows, annual conversion, all of
 * it) run under a scenario gain expressed in the ACTIVE rate mode. Nested
 * scenarios are impossible by construction (the inner input carries none).
 */
function scenarioOutcome(input: CompoundingInput, gain: number): CompoundingScenarioOutcome {
  const inner: CompoundingInput = {
    ...input,
    gainPerPeriod: gain,
    annualGain: gain,
    scenarios: undefined,
  };
  const result = calculateCompounding(inner);
  return {
    gain,
    effectiveGainPerPeriod: result.effectiveGainPerPeriod,
    finalBalance: result.finalBalance,
    totalProfit: result.totalProfit,
    totalGainPct: result.totalGainPct,
    schedule: result.schedule.map((row) => ({ period: row.period, endingBalance: row.endingBalance })),
  };
}

/** Full result: summary figures + the schedule (one source, one truth). */
export function calculateCompounding(input: CompoundingInput): CompoundingResult {
  const deposit = effectiveDeposit(input);
  const withdrawal = effectiveWithdrawal(input);
  const schedule = generateCompoundingSchedule(input);
  const finalBalance = schedule.length > 0
    ? schedule[schedule.length - 1]!.endingBalance
    : input.startingBalance;
  const totalDeposits = deposit * input.periods;
  const totalWithdrawals = withdrawal * input.periods;
  const contributed = input.startingBalance + totalDeposits;
  const totalProfit = finalBalance + totalWithdrawals - contributed;
  const totalGainPct = contributed > 0 ? ((finalBalance + totalWithdrawals) / contributed - 1) * 100 : 0;
  const rateMode = input.rateMode ?? "PER_PERIOD";
  const periodUnit = input.periodUnit ?? DEFAULT_PERIOD_UNIT;

  // Variable-return scenarios — computed only for the sides actually provided.
  const requestedScenarios = input.scenarios ?? undefined;
  const pessimisticGain = requestedScenarios?.pessimistic;
  const optimisticGain = requestedScenarios?.optimistic;
  const hasScenarios = pessimisticGain !== undefined || optimisticGain !== undefined;

  return {
    initialBalance: input.startingBalance,
    finalBalance,
    totalDeposits,
    totalWithdrawals,
    totalProfit,
    totalGainPct,
    schedule,
    scenarios: hasScenarios
      ? {
          pessimistic: pessimisticGain !== undefined ? scenarioOutcome(input, pessimisticGain) : null,
          optimistic: optimisticGain !== undefined ? scenarioOutcome(input, optimisticGain) : null,
        }
      : null,
    rateMode,
    periodUnit,
    periodsPerYear: periodsPerYear(input.periodUnit),
    effectiveGainPerPeriod: effectivePeriodicGain(input),
    annualGain: rateMode === "ANNUAL" && input.annualGain !== undefined ? input.annualGain : null,
  };
}
