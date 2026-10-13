import { z } from "zod";

/**
 * Compounding calculator — PURE domain module.
 *
 * Deterministic per-period compounding:
 *   balance(n) = initialBalance × (1 + r)^n        (r as a decimal)
 * computed ITERATIVELY per period (not the annual P(1+r/n)^(n·t) variant —
 * each row is one trading period: day, week or month, trader's choice).
 *
 * Negative per-period returns are fully supported (a losing streak simply
 * multiplies by (1 + r) < 1). No React, no storage, no network.
 */

// ── Input schema ─────────────────────────────────────────────────────────────

export const COMPOUND_CURRENCIES = ["USD", "CAD", "EUR", "GBP", "JPY"] as const;
export type CompoundCurrency = (typeof COMPOUND_CURRENCIES)[number];

/** Hard limits — keeps the table/chart sane and the math meaningful. */
export const COMPOUNDING_LIMITS = {
  minBalance: 0.01,
  maxBalance: 1e12,
  minPeriods: 1,
  maxPeriods: 200,
  /** −99% wipes almost everything; below that the schedule stops being useful. */
  minGainPercent: -99,
  /** +1000% per period is already absurd — generous ceiling, still bounded. */
  maxGainPercent: 1000,
} as const;

export const CompoundingCalculatorInputSchema = z.object({
  initialBalance: z.number().min(COMPOUNDING_LIMITS.minBalance).max(COMPOUNDING_LIMITS.maxBalance),
  periods: z.number().int().min(COMPOUNDING_LIMITS.minPeriods).max(COMPOUNDING_LIMITS.maxPeriods),
  /** Gain PER PERIOD, in percent (5 = +5% each period; −2 = −2% each period). */
  gainPerPeriodPercent: z.number().min(COMPOUNDING_LIMITS.minGainPercent).max(COMPOUNDING_LIMITS.maxGainPercent),
});

export type CompoundingCalculatorInput = z.infer<typeof CompoundingCalculatorInputSchema>;

// ── Result model ─────────────────────────────────────────────────────────────

export type CompoundingPeriodResult = {
  /** 1-based period number. */
  period: number;
  startingBalance: number;
  gainAmount: number;
  endingBalance: number;
  /** Cumulative profit vs the INITIAL balance. */
  totalProfit: number;
  /** Cumulative gain % vs the INITIAL balance. */
  totalGainPercent: number;
};

export type CompoundingResult = {
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  totalGainPercent: number;
  bestPeriod: CompoundingPeriodResult;
  worstPeriod: CompoundingPeriodResult;
  rows: CompoundingPeriodResult[];
};

export type CompoundingField = "initialBalance" | "periods" | "gainPerPeriodPercent";

export type CompoundingIssue = {
  field: CompoundingField;
  message: string;
};

export type CompoundingOutcome =
  | { ok: true; result: CompoundingResult }
  | { ok: false; issues: CompoundingIssue[] };

// ── Calculation ──────────────────────────────────────────────────────────────

export function calculateCompounding(
  input: CompoundingCalculatorInput,
): CompoundingOutcome {
  const parsed = CompoundingCalculatorInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        field: (issue.path[0] as CompoundingField) ?? "initialBalance",
        message: issue.message,
      })),
    };
  }
  const { initialBalance, periods, gainPerPeriodPercent } = parsed.data;

  const factor = 1 + gainPerPeriodPercent / 100;
  const rows: CompoundingPeriodResult[] = [];

  let balance = initialBalance;
  for (let period = 1; period <= periods; period++) {
    const startingBalance = balance;
    const gainAmount = startingBalance * (factor - 1);
    balance = startingBalance * factor;

    rows.push({
      period,
      startingBalance,
      gainAmount,
      endingBalance: balance,
      totalProfit: balance - initialBalance,
      totalGainPercent: (balance / initialBalance - 1) * 100,
    });
  }

  const finalBalance = rows[rows.length - 1].endingBalance;
  const bestPeriod = rows.reduce((a, b) => (b.gainAmount > a.gainAmount ? b : a));
  const worstPeriod = rows.reduce((a, b) => (b.gainAmount < a.gainAmount ? b : a));

  return {
    ok: true,
    result: {
      initialBalance,
      finalBalance,
      totalProfit: finalBalance - initialBalance,
      totalGainPercent: (finalBalance / initialBalance - 1) * 100,
      bestPeriod,
      worstPeriod,
      rows,
    },
  };
}
