import { z } from "zod";

/**
 * Compounding Calculator — pure, deterministic, frontend-only (Tools brief
 * §32). Per-period compounding, NOT the nominal annual formula:
 *
 *   A = P × (1 + r)^n
 *
 * where r is the GAIN PER PERIOD the user typed (Tools brief §20/§21: the
 * annual-rate variant A = P(1 + r/n)^(n·t) is deliberately out of scope for
 * V1 — the architecture keeps this module pure so a future mode can add it
 * without touching the UI).
 *
 * Total Gain is cumulative from the INITIAL balance, not the single-period
 * return (Tools brief §22) — the schedule rows make that explicit.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompoundingInput {
  startingBalance: number;
  /** Number of periods to project (≥ 1). */
  periods: number;
  /** Gain per period in percent — NEGATIVE values reduce the balance (§26). */
  gainPerPeriod: number;
}

export interface CompoundingPeriodResult {
  period: number;
  /** Balance at the beginning of the period. */
  startingBalance: number;
  /** Balance after applying that period's gain. */
  endingBalance: number;
  /** Ending − INITIAL starting balance (cumulative). */
  totalProfit: number;
  /** ((Ending / Initial) − 1) × 100 — cumulative, not per-period. */
  totalGain: number;
}

export interface CompoundingResult {
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  /** Cumulative percent from the initial balance. */
  totalGain: number;
  schedule: CompoundingPeriodResult[];
}

// ── Zod schema (Tools brief §33) ─────────────────────────────────────────────

/** Frontend guardrails — keep rendering sane (§25), not trading advice. */
export const COMPOUNDING_LIMITS = {
  maxBalance: 1_000_000_000_000,
  maxPeriods: 500,
  /** A period cannot lose more than the whole balance; upside uncapped-ish. */
  minGainPerPeriod: -100,
  maxGainPerPeriod: 1_000,
} as const;

export const compoundingInputSchema = z.object({
  startingBalance: z
    .number()
    .positive("Starting balance must be greater than zero.")
    .max(
      COMPOUNDING_LIMITS.maxBalance,
      "Starting balance looks unrealistic.",
    ),
  periods: z
    .number()
    .int("Periods must be a whole number.")
    .min(1, "At least one period is required.")
    .max(
      COMPOUNDING_LIMITS.maxPeriods,
      `Periods are limited to ${COMPOUNDING_LIMITS.maxPeriods} for readability.`,
    ),
  gainPerPeriod: z
    .number()
    .min(
      COMPOUNDING_LIMITS.minGainPerPeriod,
      "A period cannot lose more than 100% of the balance.",
    )
    .max(
      COMPOUNDING_LIMITS.maxGainPerPeriod,
      "Gain per period looks unrealistic for projection.",
    ),
});

// ── Calculation ──────────────────────────────────────────────────────────────

/**
 * Build the full period-by-period schedule. Internal math keeps full float
 * precision; rounding happens ONLY at display time (Tools brief §27).
 * Pure — no React, no API, no mutation.
 */
export function generateCompoundingSchedule(
  input: CompoundingInput,
): CompoundingPeriodResult[] {
  const { startingBalance, periods, gainPerPeriod } = input;
  const growth = 1 + gainPerPeriod / 100;

  const schedule: CompoundingPeriodResult[] = [];
  let balance = startingBalance;

  for (let period = 1; period <= periods; period += 1) {
    const starting = balance;
    const ending = starting * growth;
    balance = ending;
    schedule.push({
      period,
      startingBalance: starting,
      endingBalance: ending,
      totalProfit: ending - startingBalance,
      totalGain: (ending / startingBalance - 1) * 100,
    });
  }

  return schedule;
}

/**
 * One-shot projection: summary + schedule. Returns null for invalid input
 * (schema passed first) so the UI never renders a made-up table.
 */
export function calculateCompounding(
  input: CompoundingInput,
): CompoundingResult | null {
  const parsed = compoundingInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const schedule = generateCompoundingSchedule(parsed.data);
  if (schedule.length === 0) return null;

  const finalRow = schedule[schedule.length - 1];
  return {
    initialBalance: parsed.data.startingBalance,
    finalBalance: finalRow.endingBalance,
    totalProfit: finalRow.totalProfit,
    totalGain: finalRow.totalGain,
    schedule,
  };
}
