import { z } from "zod";
import { directionSchema } from "../enums";
import { decimalStringSchema, positiveDecimalStringSchema } from "./primitives";

/**
 * Calculators contract (Phase 18) - deterministic quantitative utilities.
 *
 * The Calculator bounded context is a pure calculation layer: NO persistence,
 * NO database reads (§34/§53), NO execution semantics (§43 - the result is
 * never an order instruction). Inputs and outputs travel as decimal strings
 * (wire format, numeric(18,8) compatible).
 *
 * Frontend relationship (§37/§58): the shared `utils/risk.ts` helpers remain
 * the client-side LIVE-ESTIMATE layer; the API recomputes authoritative
 * values with exact decimal arithmetic and mirrors the same semantics
 * (floored micro-lot sizing, symmetric stop distance, directional RR).
 *
 * Instrument specifications (§9/§10/§41): there is NO universal broker table
 * anywhere. Specs are provided per request against the same per-instrument
 * model the frontend already uses (`schemas/instrument.ts`: pipSize,
 * contractSize). Volume constraints (volumeStep/minVolume/maxVolume) are
 * optional broker-specific extensions - never assumed.
 */

// ── Error codes (§44) ────────────────────────────────────────────────────────

/**
 * Stable machine codes for the calculators domain. Only the errors the
 * implementation actually raises are listed - input-shape problems are plain
 * 400 ValidationErrors (Zod issues), domain invariants are 422s with codes.
 */
export const CALCULATOR_ERROR_CODES = {
  /** The risk budget cannot cover a single volume step → no tradeable size (422). */
  POSITION_SIZE_BELOW_MINIMUM: "POSITION_SIZE_BELOW_MINIMUM",
  /** A projection exceeded the maximum representable balance guard (422). */
  CALCULATION_OVERFLOW: "CALCULATION_OVERFLOW",
} as const;

export type CalculatorErrorCode = (typeof CALCULATOR_ERROR_CODES)[keyof typeof CALCULATOR_ERROR_CODES];

// ── Lot size calculator ──────────────────────────────────────────────────────

/**
 * Broker/instrument specification for one calculation (§8/§10). Required
 * fields mirror the shared per-instrument model; volume constraints are
 * optional because the current product contract does not carry them.
 */
export const calculatorInstrumentSpecsSchema = z.object({
  /** Price increment of one pip, e.g. "0.0001" forex, "1" synthetics. */
  pipSize: positiveDecimalStringSchema,
  /** Units per lot/contract, e.g. "100000" EURUSD, "100" XAUUSD, "1" crypto. */
  contractSize: positiveDecimalStringSchema,
  /**
   * Broker volume increment. Defaults to "0.01" (micro-lot) - exactly the
   * frontend sizer granularity - when omitted.
   */
  volumeStep: positiveDecimalStringSchema.optional(),
  /** Smallest tradeable volume (broker constraint). No default - explicit only. */
  minVolume: positiveDecimalStringSchema.optional(),
  /** Largest tradeable volume (broker constraint). No default - explicit only. */
  maxVolume: positiveDecimalStringSchema.optional(),
});

export type CalculatorInstrumentSpecs = z.infer<typeof calculatorInstrumentSpecsSchema>;

/**
 * Exact-decimal equality on the decimal-string wire format (no float round
 * trip): "1.100" equals "1.1". Used for price-ordering invariants.
 */
function sameDecimal(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const [intPart, fracPart = ""] = value.split(".");
    return `${intPart!.replace(/^0+(?=\d)/, "")}.${fracPart.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

export const lotSizeCalculatorInputSchema = z
  .object({
    /**
     * Account-currency balance the risk budget is computed from. The caller
     * supplies it explicitly (Accounts stays the canonical balance owner,
     * §36) - from a snapshot or a manual entry, the calculation is identical.
     */
    balance: positiveDecimalStringSchema,
    /**
     * Risk budget as a PERCENT of balance: "1" = 1 % (÷100 internally - §12
     * normalization guard). Capped at 100 %: risking more than the balance
     * is outside the product model (§48 "risk > 100 %" → 400).
     */
    riskPercent: positiveDecimalStringSchema.refine(
      (value) => Number(value) <= 100,
      "riskPercent must be <= 100 (percent of balance)",
    ),
    entryPrice: positiveDecimalStringSchema,
    /** Stop loss price - must differ from entry (zero distance is rejected, §13). */
    stopLossPrice: positiveDecimalStringSchema,
    /** Optional target - used ONLY for the risk/reward ratio (§14), never for sizing. */
    takeProfitPrice: positiveDecimalStringSchema.optional(),
    /**
     * Direction semantics mirror the frontend: BUY/SELL affects the RR sign
     * convention only. Sizing uses the symmetric |entry − stop| distance -
     * exactly like the frontend Position Sizer (§58 parity).
     */
    direction: directionSchema.default("BUY"),
    instrument: calculatorInstrumentSpecsSchema,
  })
  .superRefine((value, ctx) => {
    if (sameDecimal(value.entryPrice, value.stopLossPrice)) {
      ctx.addIssue({
        code: "custom",
        path: ["stopLossPrice"],
        message: "stopLossPrice must differ from entryPrice (zero stop distance is invalid)",
      });
    }
    const { minVolume, maxVolume } = value.instrument;
    if (minVolume !== undefined && maxVolume !== undefined && !sameDecimal(minVolume, maxVolume) && Number(minVolume) > Number(maxVolume)) {
      ctx.addIssue({
        code: "custom",
        path: ["instrument", "maxVolume"],
        message: "maxVolume must be >= minVolume",
      });
    }
  });

export type LotSizeCalculatorInput = z.infer<typeof lotSizeCalculatorInputSchema>;

/** Whether the volume normalization actually changed the exact size (§16). */
export const volumeAdjustmentSchema = z.enum(["NONE", "FLOORED_TO_STEP"]);
export type VolumeAdjustment = z.infer<typeof volumeAdjustmentSchema>;

/**
 * Explicit broker-constraint status (§17). The result NEVER silently clamps:
 * the computed size is returned as-is and the status explains the situation.
 */
export const lotSizeStatusSchema = z.enum(["VALID", "BELOW_MINIMUM", "ABOVE_MAXIMUM"]);
export type LotSizeStatus = z.infer<typeof lotSizeStatusSchema>;

export const lotSizeCalculatorResultSchema = z.object({
  /** Risk budget: balance × riskPercent / 100 (account currency). */
  riskAmount: decimalStringSchema,
  /** |entry − stop| in price units (always > 0 - §13). */
  stopDistance: decimalStringSchema,
  /** stopDistance ÷ pipSize (instrument-independent pip count). */
  stopPips: decimalStringSchema,
  /**
   * Directional risk:reward ratio (frontend computeRR semantics: reward
   * distance ÷ risk distance, signed - a bad setup yields a negative ratio).
   * null when no TP was provided or the SL sits on the wrong side of entry
   * (risk ≤ 0) - sizing still computed from the symmetric distance.
   */
  riskReward: decimalStringSchema.nullable(),
  /** Exact position size before volume normalization (full precision). */
  rawPositionSize: decimalStringSchema,
  /** Size floored to the volume step so realized risk ≤ budget (§16 - never rounded up). */
  normalizedPositionSize: decimalStringSchema,
  /** Money actually risked by the normalized size: normalizedPositionSize × stopDistance × contractSize. */
  realizedRiskAmount: decimalStringSchema,
  volumeAdjustment: volumeAdjustmentSchema,
  status: lotSizeStatusSchema,
});

export type LotSizeCalculatorResult = z.infer<typeof lotSizeCalculatorResultSchema>;

// ── Compounding calculator ───────────────────────────────────────────────────

/**
 * §28 - documented product cap: 1 000 periods (~3 years of daily periods)
 * keeps the period-by-period response bounded (~hundreds of KB max) and the
 * computation O(1000) trivial. Anything above is a 400, not a hang.
 */
export const COMPOUNDING_MAX_PERIODS = 1_000;

/**
 * §25 - documented product range: a period GAIN is a growth rate in
 * [0 %, 10 000 %] ("5" = 5 %, "100" = 100 %). The model is growth-only:
 * negative rates are not a product concept here (§47 positive-rate model).
 */
export const COMPOUNDING_MAX_GAIN_PERCENT = 10_000;

/**
 * Anti-overflow guard (§25): balances beyond 1e15 are far outside anything
 * numeric(18,8) could ever persist (~1e10) and only reachable by pathological
 * projections - hitting it is a 422 CALCULATION_OVERFLOW, not an Infinity.
 */
export const COMPOUNDING_MAX_BALANCE = 1e15;

export const compoundingCalculatorInputSchema = z.object({
  /** Manually entered starting balance (> 0 - §25). */
  startingBalance: positiveDecimalStringSchema,
  /** Number of periods, 1..COMPOUNDING_MAX_PERIODS (integer, no fractionals). */
  periods: z
    .number()
    .int()
    .min(1)
    .max(COMPOUNDING_MAX_PERIODS),
  /** Gain per period, PERCENT: "5" = 5 % (÷100 internally - §23 normalization). */
  gainPerPeriodPercent: decimalStringSchema.refine(
    (value) => Number(value) >= 0 && Number(value) <= COMPOUNDING_MAX_GAIN_PERCENT,
    `gainPerPeriodPercent must be between 0 and ${COMPOUNDING_MAX_GAIN_PERCENT} (percent per period)`,
  ),
});

export type CompoundingCalculatorInput = z.infer<typeof compoundingCalculatorInputSchema>;

/**
 * One period row (§21/§26). Absolute profit (`periodProfit`) and percentage
 * gain (`cumulativeGainPercentage`) are deliberately distinct fields -
 * never conflated. All balances are FULL-PRECISION internally, rendered to
 * the 8-decimal wire format only for display (§27 - never round early).
 */
export const compoundingPeriodRowSchema = z.object({
  /** 1-based period index. */
  period: z.number().int().min(1),
  startingBalance: decimalStringSchema,
  endingBalance: decimalStringSchema,
  /** Profit of THIS period only (account currency). */
  periodProfit: decimalStringSchema,
  /** Absolute profit accumulated since period 1 (account currency). */
  cumulativeProfit: decimalStringSchema,
  /** Cumulative gain as PERCENT of the ORIGINAL starting balance. */
  cumulativeGainPercentage: decimalStringSchema,
});

export type CompoundingPeriodRow = z.infer<typeof compoundingPeriodRowSchema>;

export const compoundingCalculatorResultSchema = z.object({
  startingBalance: decimalStringSchema,
  periods: z.number().int().min(1),
  /** Echo of the applied rate, canonical decimal string ("5" = 5 %). */
  gainPerPeriodPercent: decimalStringSchema,
  rows: z.array(compoundingPeriodRowSchema),
  /** Balance after the last period (absolute). */
  finalBalance: decimalStringSchema,
  /** Total Profit - absolute, account currency (§26 semantics). */
  totalProfit: decimalStringSchema,
  /** Total Gain - PERCENT of the original starting balance, NOT absolute (§26). */
  totalGainPercentage: decimalStringSchema,
});

export type CompoundingCalculatorResult = z.infer<typeof compoundingCalculatorResultSchema>;
