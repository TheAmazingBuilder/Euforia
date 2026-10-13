/**
 * Calculators — shared types (FEATURES module, frontend-only V1).
 *
 * Pure calculation layer: NO React, NO API calls, NO persistence. The UI
 * validates raw form input through Zod (schemas.ts), then calls these
 * functions with plain numbers. Display rounding happens ONLY at render
 * time (shared formatters) — never inside the math.
 */

import type { Currency } from "@cosmoz/shared";

// ── Instruments ──────────────────────────────────────────────────────────────

/** Asset classes supported by the lot size model in V1. */
export type CalculatorAssetClass = "FOREX" | "METAL" | "INDEX" | "CRYPTO";

/**
 * Explicit instrument specification. Presets declare the STANDARD vanilla
 * conventions — the same symbol can carry different specifications between
 * brokers, so every value is user-overridable through the advanced
 * parameters and the UI always shows the broker disclaimer.
 */
export interface InstrumentSpecification {
  symbol: string;
  name: string;
  assetClass: CalculatorAssetClass;
  /** Currency the instrument is quoted in (profit/loss currency). */
  quoteCurrency: Currency;
  /** Currency the unit is denominated in — used for pip-value conversion
   * when it matches the account currency. Null for CFD/indices where no
   * base-currency conversion identity applies. */
  baseCurrency: Currency | null;
  /** Units per 1.0 lot (100 000 forex, 100 oz gold, 1 for CFD/index/crypto). */
  contractSize: number;
  /** One pip expressed in price terms (0.0001 EURUSD, 0.01 USDJPY…). */
  pipSize: number;
  /** Decimals used to render prices for this instrument. */
  priceDecimals: number;
}

/** Trade direction — the calculator never assumes one. */
export type TradeDirection = "LONG" | "SHORT";

// ── Lot size ─────────────────────────────────────────────────────────────────

/** User-adjustable instrument parameters (advanced section). */
export interface LotSizeOverrides {
  contractSize?: number;
  pipSize?: number;
  /** Pip value per lot in the ACCOUNT currency — skips all conversion math. */
  pipValuePerLot?: number;
}

export interface LotSizeInput {
  /** Account balance, in the account currency. */
  balance: number;
  /** Risk per trade, in percent (0 < risk ≤ 100). */
  riskPercent: number;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  /** Resolved instrument spec (preset or user-defined CUSTOM values). */
  spec: InstrumentSpecification;
  /** Account currency — the currency risk amounts are expressed in. */
  accountCurrency: Currency;
  overrides?: LotSizeOverrides;
  /** Optional trading costs — when absent or zero, sizing is cost-free (V1). */
  costs?: LotSizeCosts;
}

/**
 * Broker costs the sizing accounts for. The spread widens the effective
 * stop distance in BOTH directions (long enters at ask / exits at bid,
 * short enters at bid / exits at ask — either way the spread is lost);
 * the commission is charged per 1.0 lot round-turn in the ACCOUNT currency.
 */
export interface LotSizeCosts {
  commissionPerLot: number;
  /** Bid/ask spread in PRICE units (0.00010 forex, 0.30 gold…). */
  spread: number;
}

export type LotSizeErrorCode =
  | "ZERO_STOP_DISTANCE"
  | "INVALID_PIP_SIZE"
  | "PIP_VALUE_REQUIRED"
  | "NON_POSITIVE_RISK_PER_LOT";

/** Where the displayed pip value comes from — declared, never mysterious. */
export type PipValueSource = "DERIVED" | "ENTRY_CONVERTED" | "OVERRIDE";

export interface LotSizeResult {
  /** balance × riskPercent/100, in the account currency. */
  riskAmount: number;
  /** |entry − stopLoss| in price terms. */
  stopDistance: number;
  /** stopDistance / pipSize. Null when the pip size is unusable. */
  stopPips: number | null;
  /** Pip value per 1.0 lot, in the ACCOUNT currency. Null when derivable. */
  pipValuePerLot: number | null;
  pipValueSource: PipValueSource | null;
  /** stopPips × pipValuePerLot — the risk carried by one lot. */
  riskPerLot: number | null;
  /** riskAmount / riskPerLot — full-precision lots. */
  lotsExact: number | null;
  /** lotsExact floored to the 0.01 lot step (never rounds risk UP). */
  lots: number | null;
  /** lots × riskPerLot — the risk actually carried at the tradable size. */
  actualRisk: number | null;
  /** lots × contractSize — position size in base units. */
  units: number | null;
  /** The spec values actually used (after overrides) — shown in the breakdown. */
  resolved: { contractSize: number; pipSize: number | null };
  // ── Costs (V1.1) — zero when no cost is provided ────────────────────────
  /** |entry − stopLoss| + spread — the distance the position must survive. */
  effectiveStopDistance: number;
  /** effectiveStopDistance / pipSize. */
  effectiveStopPips: number | null;
  /** spread / pipSize — 0 without a spread. */
  spreadPips: number;
  /** Per-lot cost of crossing the spread, in the ACCOUNT currency. */
  spreadCostPerLot: number;
  /** Echo of the input (0 when absent). */
  commissionPerLot: number;
  /** Gross risk/lot + spread cost/lot + commission/lot — the sizing divisor. */
  riskPerLotWithCosts: number;
  /** Costs actually paid at the tradable size. */
  totalCosts: { spread: number; commission: number; total: number };
}

export type LotSizeCalculation =
  | { ok: true; value: LotSizeResult }
  | { ok: false; code: LotSizeErrorCode };

export interface RiskRewardInput {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  direction: TradeDirection;
}

export type RiskRewardErrorCode = "ZERO_RISK_DISTANCE" | "TP_WRONG_SIDE";

export interface RiskRewardResult {
  /** |entry − stopLoss|. */
  riskDistance: number;
  /** |takeProfit − entry| on the profit side. */
  rewardDistance: number;
  /** rewardDistance / riskDistance (e.g. 2.35 for "1 : 2.35"). */
  ratio: number;
}

export type RiskRewardCalculation =
  | { ok: true; value: RiskRewardResult }
  | { ok: false; code: RiskRewardErrorCode };

// ── Compounding ──────────────────────────────────────────────────────────────

/** Calendar length of one compounding period — drives the annual-rate
 * conversion and the duration note. */
export type CompoundingPeriodUnit = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

/** Where the return figure is expressed: directly per period, or per year
 * (converted into an equivalent per-period rate, compound-consistent). */
export type CompoundingRateMode = "PER_PERIOD" | "ANNUAL";

export interface CompoundingInput {
  /** Starting balance (> 0). */
  startingBalance: number;
  /** Number of periods (1–200, frontend maximum). */
  periods: number;
  /** Gain per period, in percent (−100…100). −100 ends at zero balance.
   * Used as-is in PER_PERIOD mode; ignored in ANNUAL mode. */
  gainPerPeriod: number;
  /** Optional deposit added at the END of each period, AFTER that period's
   * growth (0 = none). The deposit does not earn the current period's gain —
   * it compounds from the next period on. */
  depositPerPeriod?: number;
  /** Optional withdrawal taken at the END of each period, AFTER that period's
   * growth and deposit (0 = none). Money taken out is NOT a loss — it leaves
   * the account but stays yours (the profit accounting adds it back). */
  withdrawalPerPeriod?: number;
  /** Default PER_PERIOD — the V1 behavior. */
  rateMode?: CompoundingRateMode;
  /** Calendar length of a period (default MONTHLY). */
  periodUnit?: CompoundingPeriodUnit;
  /** Annual rate in percent (−100…100) — required when rateMode = ANNUAL,
   * ignored otherwise. */
  annualGain?: number;
  /** Optional variable-return scenarios (V1.2) — the SAME projection run
   * under a pessimistic / optimistic gain, expressed in the ACTIVE rate mode
   * (per-period gains in PER_PERIOD mode, annual rates in ANNUAL mode). */
  scenarios?: CompoundingScenariosInput;
}

export interface CompoundingScenariosInput {
  /** Pessimistic gain — must not exceed the base gain. */
  pessimistic?: number;
  /** Optimistic gain — must not fall below the base gain. */
  optimistic?: number;
}

/** Summary outcome of one scenario run (compact schedule for the comparison
 * chart; the detail table stays the base projection). */
export interface CompoundingScenarioOutcome {
  /** The scenario gain, in the ACTIVE mode's units (echo of the input). */
  gain: number;
  /** The gain actually applied per period after mode conversion. */
  effectiveGainPerPeriod: number;
  finalBalance: number;
  totalProfit: number;
  totalGainPct: number;
  /** Period-by-period ending balances (same length as the base schedule). */
  schedule: { period: number; endingBalance: number }[];
}

/** One row of the growth schedule — cumulative figures include the start. */
export interface CompoundingPeriodResult {
  period: number;
  startingBalance: number;
  endingBalance: number;
  /** Deposit added at the end of this period (echo of the input, 0 = none). */
  deposit: number;
  /** Withdrawal taken at the end of this period (echo of the input, 0 = none). */
  withdrawal: number;
  /** endingBalance + withdrawals so far − capital contributed so far
   * (earned gain, cumulative — withdrawn money stays yours). */
  totalProfit: number;
  /** ((endingBalance + withdrawals so far) / contributed − 1) × 100 —
   * cumulative earned gain on the total capital contributed. */
  totalGain: number;
}

export interface CompoundingResult {
  initialBalance: number;
  finalBalance: number;
  /** Sum of every deposit added across the schedule. */
  totalDeposits: number;
  /** Sum of every withdrawal taken across the schedule. */
  totalWithdrawals: number;
  /** finalBalance + totalWithdrawals − initialBalance − totalDeposits — the
   * EARNED gain (money withdrawn is returned to you, never counted as loss). */
  totalProfit: number;
  /** Earned gain relative to the total capital contributed, in percent. */
  totalGainPct: number;
  schedule: CompoundingPeriodResult[];
  /** Scenario comparison (V1.2) — null when no scenario was requested. */
  scenarios: {
    pessimistic: CompoundingScenarioOutcome | null;
    optimistic: CompoundingScenarioOutcome | null;
  } | null;
  // ── Rate declaration (V1.1) — the applied rate is never mysterious ────
  rateMode: CompoundingRateMode;
  periodUnit: CompoundingPeriodUnit;
  /** Calendar periods per year for the chosen unit. */
  periodsPerYear: number;
  /** The gain ACTUALLY applied per period, in percent — equals gainPerPeriod
   * in PER_PERIOD mode, the compound-converted annual rate in ANNUAL mode. */
  effectiveGainPerPeriod: number;
  /** Echo of the annual rate when ANNUAL mode is active, null otherwise. */
  annualGain: number | null;
}
