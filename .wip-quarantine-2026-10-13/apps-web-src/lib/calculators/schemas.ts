/**
 * Calculator validation layer (MASTER PROMPT §12, §25, §33) — Zod-based,
 * centralized; the UI never validates financial data with `if (!value)`
 * style checks and never duplicates rules across components.
 *
 * Schemas live in the feature (NOT in @cosmoz/shared): no backend contract
 * exists for calculators (frontend-only V1, §1). Zod issues carry STABLE
 * ERROR CODES as messages — the UI maps them through
 * `dict.calculators.*.validation.*` so copy stays in the dictionary.
 */

import { z } from "zod";

import { MAX_COMPOUNDING_PERIODS } from "./compounding";

// ── Primitives ───────────────────────────────────────────────────────────────

/** Non-negative decimal form text ("0", "12.5") — no sign, no exponent. */
const decimalText = z
  .string()
  .trim()
  .min(1, "REQUIRED")
  .regex(/^\d+(\.\d+)?$/, "INVALID_DECIMAL");

const positiveDecimalText = decimalText.refine(
  (value) => Number(value) > 0,
  (value) => ({ message: Number(value) === 0 ? "POSITIVE_REQUIRED" : "INVALID_DECIMAL" }),
);

/** Signed decimal form text — compounding gains may be negative (§26). */
const signedDecimalText = z
  .string()
  .trim()
  .min(1, "REQUIRED")
  .regex(/^-?\d+(\.\d+)?$/, "INVALID_DECIMAL");

const optionalDecimalText = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d+(\.\d+)?$/.test(value),
    (value) => ({ message: value === "" ? "REQUIRED" : "INVALID_DECIMAL" }),
  );

// ── Lot size ─────────────────────────────────────────────────────────────────

export const LOT_SIZE_RISK_MAX = 100;

export type LotSizeField =
  | "balance"
  | "riskPercent"
  | "entry"
  | "stopLoss"
  | "takeProfit"
  | "instrument"
  | "advanced"
  | "commissionPerLot"
  | "spread";

export type LotSizeIssueCode =
  | "REQUIRED"
  | "INVALID_DECIMAL"
  | "POSITIVE_REQUIRED"
  | "RISK_PERCENT_RANGE"
  | "ENTRY_STOP_IDENTICAL"
  | "STOP_WRONG_SIDE"
  | "TP_WRONG_SIDE"
  | "INSTRUMENT_REQUIRED"
  | "PIP_PARAMS_REQUIRED"
  | "PIP_VALUE_REQUIRED";

export const lotSizeCalculatorInputSchema = z
  .object({
    balance: positiveDecimalText,
    riskPercent: decimalText.refine(
      (value) => Number(value) > 0 && Number(value) <= LOT_SIZE_RISK_MAX,
      "RISK_PERCENT_RANGE",
    ),
    direction: z.enum(["LONG", "SHORT"]),
    entry: positiveDecimalText,
    stopLoss: positiveDecimalText,
    /** Optional — empty string means "no target" (no RR block). */
    takeProfit: optionalDecimalText,
    /** Preset symbol or CUSTOM — empty means nothing selected yet. */
    instrumentSymbol: z.string().trim().min(1, "INSTRUMENT_REQUIRED"),
    /** Optional trading costs — empty means "no cost" (0). The regex on
     * decimalText blocks negatives, so no extra refine is needed. */
    commissionPerLot: optionalDecimalText,
    spread: optionalDecimalText,
    overrides: z
      .object({
        contractSize: optionalDecimalText,
        pipSize: optionalDecimalText,
        pipValuePerLot: optionalDecimalText,
      })
      .refine(
        (overrides) => {
          const contract = overrides.contractSize === "" ? null : Number(overrides.contractSize);
          const pip = overrides.pipSize === "" ? null : Number(overrides.pipSize);
          const pipValue = overrides.pipValuePerLot === "" ? null : Number(overrides.pipValuePerLot);
          const hasAny = contract !== null || pip !== null || pipValue !== null;
          if (!hasAny) return true;
          return (contract === null || contract > 0) && (pip === null || pip > 0) && (pipValue === null || pipValue > 0);
        },
        "PIP_PARAMS_REQUIRED",
      ),
  })
  .superRefine((value, ctx) => {
    const entry = Number(value.entry);
    const stopLoss = Number(value.stopLoss);
    if (entry === stopLoss) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stopLoss"], message: "ENTRY_STOP_IDENTICAL" });
    } else if (value.direction === "LONG" ? stopLoss > entry : stopLoss < entry) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stopLoss"], message: "STOP_WRONG_SIDE" });
    }

    if (value.takeProfit !== "") {
      const takeProfit = Number(value.takeProfit);
      if (value.direction === "LONG" ? takeProfit <= entry : takeProfit >= entry) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["takeProfit"], message: "TP_WRONG_SIDE" });
      }
    }
  });

export type LotSizeFormValues = z.infer<typeof lotSizeCalculatorInputSchema>;

/** Field → stable issue code (first issue wins per field). Overrides land on `advanced`. */
export function lotSizeIssues(error: z.ZodError): Partial<Record<LotSizeField, LotSizeIssueCode>> {
  const issues: Partial<Record<LotSizeField, LotSizeIssueCode>> = {};
  for (const issue of error.issues) {
    const rawPath = issue.path[0];
    if (typeof rawPath !== "string") continue;
    const field: LotSizeField = rawPath === "overrides" ? "advanced" : (rawPath as LotSizeField);
    if (field in issues) continue;
    issues[field] = issue.message as LotSizeIssueCode;
  }
  return issues;
}

// ── Compounding ──────────────────────────────────────────────────────────────

export type CompoundingField =
  | "startingBalance"
  | "periods"
  | "gainPerPeriod"
  | "depositPerPeriod"
  | "withdrawalPerPeriod"
  | "annualGain"
  | "scenarios";

export type CompoundingIssueCode =
  | "REQUIRED"
  | "INVALID_DECIMAL"
  | "POSITIVE_REQUIRED"
  | "PERIODS_RANGE"
  | "GAIN_RANGE"
  | "ANNUAL_GAIN_RANGE"
  | "SCENARIO_GAIN_RANGE"
  | "SCENARIO_ORDER";

export const COMPOUNDING_GAIN_MIN = -100;
export const COMPOUNDING_GAIN_MAX = 100;

export const compoundingCalculatorInputSchema = z.object({
  startingBalance: positiveDecimalText,
  periods: decimalText.refine((value) => {
    if (!/^\d+$/.test(value)) return false;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_COMPOUNDING_PERIODS;
  }, "PERIODS_RANGE"),
  /** Negative returns supported (§26) — below −100 the model breaks down. */
  gainPerPeriod: signedDecimalText.refine((value) => {
    const parsed = Number(value);
    return parsed >= COMPOUNDING_GAIN_MIN && parsed <= COMPOUNDING_GAIN_MAX;
  }, "GAIN_RANGE"),
  /** Optional periodic deposit — empty/undefined means "no deposit" (0). The
   * decimal regex already blocks negatives, so no extra refine is needed. */
  depositPerPeriod: optionalDecimalText.optional(),
  /** Optional periodic withdrawal — empty/undefined means "no withdrawal" (0). */
  withdrawalPerPeriod: optionalDecimalText.optional(),
  /** Rate expression mode — defaults to the V1 per-period behavior. */
  rateMode: z.enum(["PER_PERIOD", "ANNUAL"]).default("PER_PERIOD"),
  /** Calendar length of one period — defaults to MONTHLY. */
  periodUnit: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  /** Raw annual rate text — validated ONLY when rateMode is ANNUAL. */
  annualGain: z.string().optional(),
  /** Variable-return scenarios (V1.2) — expressed in the ACTIVE rate mode. */
  scenarios: z
    .object({
      pessimistic: z.string().optional(),
      optimistic: z.string().optional(),
    })
    .optional(),
})
.superRefine((value, ctx) => {
  if (value.rateMode !== "ANNUAL") return;
  const raw = (value.annualGain ?? "").trim();
  if (raw === "") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["annualGain"], message: "REQUIRED" });
    return;
  }
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["annualGain"], message: "INVALID_DECIMAL" });
    return;
  }
  const parsed = Number(raw);
  if (parsed < COMPOUNDING_GAIN_MIN || parsed > COMPOUNDING_GAIN_MAX) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["annualGain"], message: "ANNUAL_GAIN_RANGE" });
  }
})
.superRefine((value, ctx) => {
  const scenarios = value.scenarios;
  if (scenarios === undefined) return;
  const pessimisticRaw = (scenarios.pessimistic ?? "").trim();
  const optimisticRaw = (scenarios.optimistic ?? "").trim();
  if (pessimisticRaw === "" && optimisticRaw === "") return;

  const parseScenario = (raw: string): number | string | null => {
    if (raw === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return "INVALID_DECIMAL";
    const parsed = Number(raw);
    if (parsed < COMPOUNDING_GAIN_MIN || parsed > COMPOUNDING_GAIN_MAX) return "SCENARIO_GAIN_RANGE";
    return parsed;
  };

  const pessimistic = parseScenario(pessimisticRaw);
  if (typeof pessimistic === "string") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", "pessimistic"], message: pessimistic });
  }
  const optimistic = parseScenario(optimisticRaw);
  if (typeof optimistic === "string") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", "optimistic"], message: optimistic });
  }
  if (typeof pessimistic === "string" || typeof optimistic === "string") return;

  // Order sanity: pessimistic ≤ base ≤ optimistic (equal is allowed — the
  // lines overlap, but nothing breaks). The base figure depends on the mode:
  // per-period gain in PER_PERIOD mode, the annual rate in ANNUAL mode (the
  // per-period field is ignored there and may hold a stale value).
  if (value.rateMode === "ANNUAL") {
    const annualBase = (value.annualGain ?? "").trim();
    const annualBaseNum = /^-?\d+(\.\d+)?$/.test(annualBase) ? Number(annualBase) : null;
    if (annualBaseNum !== null) {
      if (pessimistic !== null && pessimistic > annualBaseNum) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", "pessimistic"], message: "SCENARIO_ORDER" });
      }
      if (optimistic !== null && optimistic < annualBaseNum) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", "optimistic"], message: "SCENARIO_ORDER" });
      }
    }
  } else {
    const base = Number(value.gainPerPeriod);
    if (pessimistic !== null && pessimistic > base) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", "pessimistic"], message: "SCENARIO_ORDER" });
    }
    if (optimistic !== null && optimistic < base) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenarios", "optimistic"], message: "SCENARIO_ORDER" });
    }
  }
});

export type CompoundingFormValues = z.infer<typeof compoundingCalculatorInputSchema>;

export function compoundingIssues(error: z.ZodError): Partial<Record<CompoundingField, CompoundingIssueCode>> {
  const issues: Partial<Record<CompoundingField, CompoundingIssueCode>> = {};
  for (const issue of error.issues) {
    const path = issue.path[0];
    if (typeof path !== "string" || path in issues) continue;
    issues[path as CompoundingField] = issue.message as CompoundingIssueCode;
  }
  return issues;
}

// ── Pip & Tick value ─────────────────────────────────────────────────────────

export type PipValueField = "lots" | "price" | "advanced";

export type PipValueIssueCode =
  | "REQUIRED"
  | "INVALID_DECIMAL"
  | "POSITIVE_REQUIRED"
  | "PIP_PARAMS_REQUIRED";

export const pipValueCalculatorInputSchema = z.object({
  lots: positiveDecimalText,
  /** Conversion price — only REQUIRED by the engine when the account currency
   * is the instrument's BASE currency; format-checked here. */
  price: optionalDecimalText,
  overrides: z
    .object({
      tickSize: optionalDecimalText,
      pipValuePerLot: optionalDecimalText,
    })
    .refine(
      (overrides) => {
        const tick = overrides.tickSize === "" ? null : Number(overrides.tickSize);
        const pipValue = overrides.pipValuePerLot === "" ? null : Number(overrides.pipValuePerLot);
        if (tick === null && pipValue === null) return true;
        return (tick === null || tick > 0) && (pipValue === null || pipValue > 0);
      },
      "PIP_PARAMS_REQUIRED",
    ),
});

export type PipValueFormValues = z.infer<typeof pipValueCalculatorInputSchema>;

export function pipValueIssues(error: z.ZodError): Partial<Record<PipValueField, PipValueIssueCode>> {
  const issues: Partial<Record<PipValueField, PipValueIssueCode>> = {};
  for (const issue of error.issues) {
    const rawPath = issue.path[0];
    if (typeof rawPath !== "string") continue;
    const field: PipValueField = rawPath === "overrides" ? "advanced" : (rawPath as PipValueField);
    if (field in issues) continue;
    issues[field] = issue.message as PipValueIssueCode;
  }
  return issues;
}