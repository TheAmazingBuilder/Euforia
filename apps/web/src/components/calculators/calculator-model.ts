import { z } from "zod";
import {
  calculateCompounding,
  COMPOUNDING_MAX_PERIODS,
  computeRR,
  toDecimalString,
  type CompoundingSchedule,
  type Currency,
} from "@cosmoz/shared";

/**
 * Calculators model — the pure layer between the UI and the shared math.
 *
 * Zod schemas validate the RAW FORM STRINGS with stable error codes (the
 * dict supplies the human copy — no {var} templates, codes map 1:1 to
 * dict.tools.*.validation keys). Derivations compose the shared LIVE-ESTIMATE
 * helpers (utils/risk.ts, utils/compounding.ts) with the broker-step sizing
 * semantics the calculators contract defines (§16 floor-to-step, realized
 * risk, explicit status — nothing clamps silently).
 *
 * No React, no API calls — pure, deterministic, unit-testable.
 */

// ── Field-level schemas (stable codes, dict renders them) ───────────────────

/** Plain decimal text field: required, digits with optional fraction. */
const decimalField = z
  .string()
  .trim()
  .min(1, "required")
  .regex(/^\d+(\.\d+)?$/, "invalidNumber");

/** Optional decimal text field: "" is valid (absent), else digits. */
const optionalDecimalField = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+(\.\d+)?$/.test(value), "invalidNumber");

/** Stable error codes → dict.tools.*.validation keys. */
export type LotSizeFieldErrorCode =
  | "required"
  | "invalidNumber"
  | "mustBePositive"
  | "riskRange"
  | "samePrice"
  | "stopSideLong"
  | "stopSideShort";

export type LotSizeField = keyof LotSizeFormValues;

export interface LotSizeFormValues {
  instrument: string;
  direction: "BUY" | "SELL";
  balance: string;
  riskPercent: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  pipSize: string;
  contractSize: string;
  volumeStep: string;
}

export type LotSizeFieldErrors = Partial<Record<LotSizeField, LotSizeFieldErrorCode>>;

const lotSizeShape = z.object({
  instrument: z.string().trim().min(1, "required"),
  direction: z.enum(["BUY", "SELL"]),
  balance: decimalField,
  riskPercent: decimalField,
  entryPrice: decimalField,
  stopLoss: decimalField,
  takeProfit: optionalDecimalField,
  pipSize: decimalField,
  contractSize: decimalField,
  volumeStep: decimalField,
});

export interface LotSizeNumbers {
  direction: "BUY" | "SELL";
  balance: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
  /** Null when the field is left empty — sizing never depends on it. */
  takeProfit: number | null;
  pipSize: number;
  contractSize: number;
  volumeStep: number;
}

/**
 * Validate the lot-size form: Zod shape first, then the domain rules the
 * shape cannot express (positivity, risk range, stop/entry relationship per
 * direction). Returns either the parsed numbers or one stable code per
 * offending field — never both, never throws.
 */
export function validateLotSizeForm(
  values: LotSizeFormValues,
): { ok: true; data: LotSizeNumbers } | { ok: false; errors: LotSizeFieldErrors } {
  const parsed = lotSizeShape.safeParse(values);
  if (!parsed.success) {
    const errors: LotSizeFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in errors)) {
        errors[key as LotSizeField] = issue.message as LotSizeFieldErrorCode;
      }
    }
    return { ok: false, errors };
  }

  const d = parsed.data;
  const data: LotSizeNumbers = {
    direction: d.direction,
    balance: Number(d.balance),
    riskPercent: Number(d.riskPercent),
    entryPrice: Number(d.entryPrice),
    stopLoss: Number(d.stopLoss),
    takeProfit: d.takeProfit === "" ? null : Number(d.takeProfit),
    pipSize: Number(d.pipSize),
    contractSize: Number(d.contractSize),
    volumeStep: Number(d.volumeStep),
  };

  const errors: LotSizeFieldErrors = {};
  const flag = (field: LotSizeField, code: LotSizeFieldErrorCode) => {
    if (!(field in errors)) errors[field] = code;
  };

  if (!(data.balance > 0)) flag("balance", "mustBePositive");
  if (!(data.riskPercent > 0 && data.riskPercent <= 100)) flag("riskPercent", "riskRange");
  if (!(data.entryPrice > 0)) flag("entryPrice", "mustBePositive");
  if (!(data.stopLoss > 0)) flag("stopLoss", "mustBePositive");
  if (!(data.pipSize > 0)) flag("pipSize", "mustBePositive");
  if (!(data.contractSize > 0)) flag("contractSize", "mustBePositive");
  if (!(data.volumeStep > 0)) flag("volumeStep", "mustBePositive");
  if (data.takeProfit !== null && !(data.takeProfit > 0)) flag("takeProfit", "mustBePositive");
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (data.entryPrice === data.stopLoss) {
    flag("stopLoss", "samePrice");
    return { ok: false, errors };
  }
  if (data.direction === "BUY" && data.stopLoss > data.entryPrice) {
    flag("stopLoss", "stopSideLong");
    return { ok: false, errors };
  }
  if (data.direction === "SELL" && data.stopLoss < data.entryPrice) {
    flag("stopLoss", "stopSideShort");
    return { ok: false, errors };
  }

  return { ok: true, data };
}

export type LotSizeStatus = "VALID" | "BELOW_STEP";

export interface LotSizeResult {
  /** Risk budget: balance × risk% / 100 (decimal string, account currency). */
  riskAmount: string;
  /** |entry − stop| in price units (decimal string). */
  stopDistance: string;
  /** stopDistance ÷ pipSize (decimal string). */
  stopPips: string;
  /** Money risked by one lot over the stop distance: distance × contractSize. */
  riskPerLot: string;
  /** Exact size before quantization (decimal string, ≤ 8 decimals). */
  rawPositionSize: string;
  /** Size floored to the volume step so realized risk ≤ budget (decimal string). */
  positionSize: string;
  /** Money actually risked by the floored size (decimal string). */
  realizedRisk: string;
  /** Whether flooring actually changed the exact size. */
  volumeAdjusted: boolean;
  status: LotSizeStatus;
  /** Directional R:R from the shared helper — null without TP (semantics parity). */
  riskReward: number | null;
}

/**
 * Broker-step position sizing — mirrors the calculators contract (§11–§17):
 *   riskAmount = balance × risk% / 100
 *   perUnit    = |entry − stop| × contractSize
 *   raw        = riskAmount / perUnit
 *   size       = floor(raw / step) × step        (flooring only — never up)
 *   realized   = size × perUnit                  (≤ budget by construction)
 * Direction never changes the size (symmetric stop distance); it only drives
 * the R:R sign convention via the shared computeRR. The fixed-0.01 trade-form
 * sizer stays in utils/risk.ts (suggestPositionSize); this model adds the
 * broker-step parameter the standalone calculator exposes.
 * Returns null on any non-finite/invalid numeric path (caller validated first).
 */
export function calculateLotSize(data: LotSizeNumbers): LotSizeResult | null {
  const { balance, riskPercent, entryPrice, stopLoss, pipSize, contractSize, volumeStep } = data;

  const riskAmount = (balance * riskPercent) / 100;
  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (!(riskAmount > 0) || !(stopDistance > 0) || !(pipSize > 0) || !(contractSize > 0) || !(volumeStep > 0)) {
    return null;
  }

  const perUnit = stopDistance * contractSize;
  const raw = riskAmount / perUnit;
  if (!Number.isFinite(raw)) return null;

  // Round to 6 decimals BEFORE flooring so float artifacts don't degrade the
  // step quantization (same guard as the shared suggestPositionSize).
  const rawRounded = Number(raw.toFixed(6));
  const size = Math.floor(rawRounded / volumeStep) * volumeStep;
  const sizeRounded = Number(size.toFixed(8));
  const riskReward =
    data.takeProfit !== null ? computeRR(entryPrice, stopLoss, data.takeProfit, data.direction) : null;

  if (!(sizeRounded > 0)) {
    return {
      riskAmount: toDecimalString(riskAmount),
      stopDistance: toDecimalString(stopDistance),
      stopPips: toDecimalString(stopDistance / pipSize),
      riskPerLot: toDecimalString(perUnit),
      rawPositionSize: toDecimalString(raw),
      positionSize: "0",
      realizedRisk: "0",
      volumeAdjusted: rawRounded !== 0,
      status: "BELOW_STEP",
      riskReward,
    };
  }

  return {
    riskAmount: toDecimalString(riskAmount),
    stopDistance: toDecimalString(stopDistance),
    stopPips: toDecimalString(stopDistance / pipSize),
    riskPerLot: toDecimalString(perUnit),
    rawPositionSize: toDecimalString(raw),
    positionSize: toDecimalString(sizeRounded),
    realizedRisk: toDecimalString(sizeRounded * perUnit),
    volumeAdjusted: rawRounded !== sizeRounded,
    status: "VALID",
    riskReward,
  };
}

// ── Compounding form ─────────────────────────────────────────────────────────

export type CompoundingFieldErrorCode =
  | "required"
  | "invalidNumber"
  | "balancePositive"
  | "periodsRange"
  | "gainRange"
  | "overflow";

export type CompoundingField = "startingBalance" | "periods" | "gainPerPeriod";

export type CompoundingFieldErrors = Partial<Record<CompoundingField, CompoundingFieldErrorCode>>;

export interface CompoundingFormValues {
  startingBalance: string;
  periods: string;
  gainPerPeriod: string;
  currency: Currency;
}

export interface CompoundingNumbers {
  startingBalance: number;
  periods: number;
  gainPerPeriod: number;
}

const compoundingShape = z.object({
  startingBalance: decimalField,
  periods: z.string().trim().min(1, "required").regex(/^\d+$/, "invalidNumber"),
  gainPerPeriod: z
    .string()
    .trim()
    .min(1, "required")
    .regex(/^-?\d+(\.\d+)?$/, "invalidNumber"),
});

/**
 * Validate the compounding form and build the schedule through the shared
 * projection. The shared layer re-checks every bound (1..1 000 periods, gain
 * in [−100, 10 000], 1e15 ceiling) — a null schedule maps to the field-level
 * codes the UI renders inline.
 */
export function validateCompoundingForm(
  values: CompoundingFormValues,
):
  | { ok: true; data: CompoundingNumbers; schedule: CompoundingSchedule }
  | { ok: false; errors: CompoundingFieldErrors } {
  const parsed = compoundingShape.safeParse(values);
  if (!parsed.success) {
    const errors: CompoundingFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in errors)) {
        errors[key as CompoundingField] = issue.message as CompoundingFieldErrorCode;
      }
    }
    return { ok: false, errors };
  }

  const startingBalance = Number(parsed.data.startingBalance);
  const periods = Number(parsed.data.periods);
  const gainPerPeriod = Number(parsed.data.gainPerPeriod);

  const errors: CompoundingFieldErrors = {};
  if (!(startingBalance > 0)) errors.startingBalance = "balancePositive";
  if (!Number.isInteger(periods) || periods < 1 || periods > COMPOUNDING_MAX_PERIODS) {
    errors.periods = "periodsRange";
  }
  if (!(gainPerPeriod >= -100 && gainPerPeriod <= 10_000)) errors.gainPerPeriod = "gainRange";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const schedule = calculateCompounding({ startingBalance, periods, gainPerPeriodPercent: gainPerPeriod });
  if (schedule === null) {
    // The only null path left after the field checks is the balance ceiling.
    return { ok: false, errors: { gainPerPeriod: "overflow" } };
  }

  return { ok: true, data: { startingBalance, periods, gainPerPeriod }, schedule };
}

