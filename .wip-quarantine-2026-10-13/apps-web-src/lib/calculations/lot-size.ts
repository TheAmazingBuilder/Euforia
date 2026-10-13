import { z } from "zod";

/**
 * Lot Size calculator — PURE domain module.
 *
 * No React, no fetch, no storage, no broker connectivity: deterministic math
 * only, fully unit-testable. The UI layer owns parsing/formatting; this module
 * owns validation + calculation and NEVER returns a silently-zero result —
 * invalid inputs produce a structured error list instead.
 *
 * Core formula:
 *   riskAmount   = balance × (riskPercent / 100)
 *   stopPips     = |entry − stopLoss| / pipSize
 *   pipValue     = pipValuePerLot ?? (contractSize × pipSize)   [quote currency]
 *   lots         = riskAmount / (stopPips × pipValue)
 *
 * Conventions note: pip value is expressed in the instrument's QUOTE currency.
 * When the quote currency differs from the account currency the trader should
 * override pip value manually in the Advanced panel — the module never invents
 * FX conversion rates.
 */

// ── Instrument model ─────────────────────────────────────────────────────────

export type AssetClass = "forex" | "metal" | "index" | "crypto";

export type InstrumentPreset = {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  /** Typical defaults — REAL conventions vary by broker; every field is
   *  editable in the Advanced panel and the UI discloses this variance. */
  pipSize: number;
  contractSize: number;
  tickSize: number;
  pointSize: number;
};

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    symbol: "EURUSD",
    label: "EUR/USD — Euro vs US Dollar",
    assetClass: "forex",
    pipSize: 0.0001,
    contractSize: 100_000,
    tickSize: 0.00001,
    pointSize: 0.00001,
  },
  {
    symbol: "GBPUSD",
    label: "GBP/USD — British Pound vs US Dollar",
    assetClass: "forex",
    pipSize: 0.0001,
    contractSize: 100_000,
    tickSize: 0.00001,
    pointSize: 0.00001,
  },
  {
    symbol: "USDJPY",
    label: "USD/JPY — US Dollar vs Japanese Yen",
    assetClass: "forex",
    pipSize: 0.01,
    contractSize: 100_000,
    tickSize: 0.001,
    pointSize: 0.001,
  },
  {
    symbol: "XAUUSD",
    label: "XAU/USD — Gold vs US Dollar",
    assetClass: "metal",
    pipSize: 0.01,
    contractSize: 100,
    tickSize: 0.01,
    pointSize: 0.01,
  },
  {
    symbol: "NAS100",
    label: "NAS100 — US Tech 100 index CFD",
    assetClass: "index",
    pipSize: 1,
    contractSize: 1,
    tickSize: 0.1,
    pointSize: 1,
  },
  {
    symbol: "BTCUSD",
    label: "BTC/USD — Bitcoin vs US Dollar",
    assetClass: "crypto",
    pipSize: 1,
    contractSize: 1,
    tickSize: 0.01,
    pointSize: 1,
  },
];

export const CUSTOM_INSTRUMENT = "__custom__" as const;

export function findPreset(symbol: string): InstrumentPreset | undefined {
  return INSTRUMENT_PRESETS.find((p) => p.symbol === symbol);
}

// ── Input schema (shape + ranges) ────────────────────────────────────────────

export const RISK_PRESETS = [0.25, 0.5, 1, 1.5, 2] as const;

export type TradeDirection = "long" | "short";

export const LotSizeCalculatorInputSchema = z.object({
  /** Account balance — strictly positive. */
  balance: z.number().positive().max(1e12),
  /** Risk per trade in PERCENT (1 = 1%), (0, 100]. */
  riskPercent: z.number().positive().max(100),
  direction: z.enum(["long", "short"]),
  entry: z.number().positive(),
  stopLoss: z.number().positive(),
  /** Optional take profit — null/undefined when the trader hasn't set one. */
  takeProfit: z.number().positive().nullish(),
  symbol: z.string().trim().min(1).max(24),
  /** Advanced parameters — always present in the input, auto-filled by the UI. */
  pipSize: z.number().positive(),
  contractSize: z.number().positive(),
  /** Manual pip-value override per 1.0 lot (quote currency). null = derived. */
  pipValuePerLot: z.number().positive().nullish(),
  /** Informational spec fields (disclosure/breakdown), not used by the math. */
  tickSize: z.number().positive(),
  pointSize: z.number().positive(),
});

export type LotSizeCalculatorInput = z.infer<typeof LotSizeCalculatorInputSchema>;

// ── Business validation (relations between fields) ───────────────────────────

export type LotSizeField =
  | "balance"
  | "riskPercent"
  | "entry"
  | "stopLoss"
  | "takeProfit"
  | "pipSize"
  | "contractSize"
  | "pipValuePerLot"
  | "tickSize"
  | "pointSize";

export type LotSizeIssue = {
  field: LotSizeField;
  message: string;
};

/** Relation-level checks that Zod's shape validation cannot express. */
export function validateLotSizeRelations(
  input: LotSizeCalculatorInput,
): LotSizeIssue[] {
  const issues: LotSizeIssue[] = [];

  if (input.direction === "long" && input.stopLoss >= input.entry) {
    issues.push({
      field: "stopLoss",
      message: "For a long trade the stop loss must sit BELOW the entry price.",
    });
  }
  if (input.direction === "short" && input.stopLoss <= input.entry) {
    issues.push({
      field: "stopLoss",
      message: "For a short trade the stop loss must sit ABOVE the entry price.",
    });
  }

  if (input.takeProfit != null) {
    if (input.direction === "long" && input.takeProfit <= input.entry) {
      issues.push({
        field: "takeProfit",
        message: "For a long trade the take profit must sit ABOVE the entry price.",
      });
    }
    if (input.direction === "short" && input.takeProfit >= input.entry) {
      issues.push({
        field: "takeProfit",
        message: "For a short trade the take profit must sit BELOW the entry price.",
      });
    }
  }

  return issues;
}

// ── Result model ─────────────────────────────────────────────────────────────

export type LotSizeReward = {
  /** |TP − entry| in price units. */
  distance: number;
  distancePips: number;
  /** Reward-to-risk ratio, e.g. 2 for 1:2. */
  rr: number;
  /** Money made if TP is hit, for the FLOORED position size. */
  potentialProfit: number;
};

export type LotSizeResult = {
  symbol: string;
  direction: TradeDirection;
  /** Money at risk for the FLOORED (tradeable) size. */
  riskAmount: number;
  /** |entry − stop| in price units. */
  stopDistance: number;
  stopPips: number;
  /** Effective pip value per 1.0 lot actually used by the math. */
  pipValuePerLot: number;
  /** Money risked by 1.0 lot over the stop distance. */
  riskPerLot: number;
  /** Exact position size before any rounding. */
  lotsExact: number;
  /** Tradeable size: floored to the 0.01 lot step so realized risk NEVER
   *  exceeds the intended amount. */
  lots: number;
  /** lots × contractSize (units of the underlying). */
  units: number;
  miniLots: number;
  microLots: number;
  reward: LotSizeReward | null;
  breakdown: { label: string; value: string }[];
};

// ── Calculation ──────────────────────────────────────────────────────────────

export type LotSizeOutcome =
  | { ok: true; result: LotSizeResult }
  | { ok: false; issues: LotSizeIssue[] };

function floorToStep(value: number, step: number): number {
  // +1e-9 snaps binary noise (e.g. 0.19999999999999995 → 0.2) so a boundary
  // value is never floored one step down by floating-point drift alone.
  return Math.floor(value / step + 1e-9) * step;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function calculateLotSize(input: LotSizeCalculatorInput): LotSizeOutcome {
  // 1. Shape validation.
  const parsed = LotSizeCalculatorInputSchema.safeParse(input);
  if (!parsed.success) {
    const issues: LotSizeIssue[] = parsed.error.issues.map((issue) => ({
      field: (issue.path[0] as LotSizeField) ?? "balance",
      message: issue.message,
    }));
    return { ok: false, issues };
  }
  const data = parsed.data;

  // 2. Relation validation — never silently zero, never a fake result.
  const relationIssues = validateLotSizeRelations(data);
  if (relationIssues.length > 0) {
    return { ok: false, issues: relationIssues };
  }

  // 3. Math. Division-by-zero is structurally impossible: stopPips > 0
  //    (entry ≠ SL enforced above) and pipValuePerLot > 0 (schema).
  const riskAmountFull = (data.balance * data.riskPercent) / 100;
  const stopDistance = Math.abs(data.entry - data.stopLoss);
  const stopPips = stopDistance / data.pipSize;
  const pipValuePerLot =
    data.pipValuePerLot ?? data.contractSize * data.pipSize;
  const riskPerLot = stopPips * pipValuePerLot;

  const lotsExact = riskAmountFull / riskPerLot;
  const lots = floorToStep(lotsExact, 0.01);
  const units = lots * data.contractSize;

  // The floored size risks slightly LESS than the budget — recompute the
  // honest risk amount for display instead of showing the budget.
  const riskAmount = lots * riskPerLot;

  let reward: LotSizeReward | null = null;
  if (data.takeProfit != null) {
    const distance = Math.abs(data.takeProfit - data.entry);
    const distancePips = distance / data.pipSize;
    reward = {
      distance,
      distancePips,
      rr: distance / stopDistance,
      potentialProfit: lots * distancePips * pipValuePerLot,
    };
  }

  const fmt = (v: number, d = 2) =>
    round(v, d).toLocaleString("en-US", { maximumFractionDigits: d });

  const result: LotSizeResult = {
    symbol: data.symbol.toUpperCase(),
    direction: data.direction,
    riskAmount,
    stopDistance,
    stopPips,
    pipValuePerLot,
    riskPerLot,
    lotsExact,
    lots,
    units,
    miniLots: lots * 10,
    microLots: lots * 100,
    reward,
    breakdown: [
      { label: "Balance", value: fmt(data.balance) },
      { label: "Risk", value: `${fmt(data.riskPercent, 2)}%` },
      { label: "Risk amount", value: fmt(riskAmountFull) },
      {
        label: "Direction",
        value: data.direction === "long" ? "Long (buy)" : "Short (sell)",
      },
      { label: "Entry", value: fmt(data.entry, 5) },
      { label: "Stop loss", value: fmt(data.stopLoss, 5) },
      {
        label: "Stop distance",
        value: `${fmt(stopDistance, 5)} (${fmt(stopPips, 1)} pips)`,
      },
      { label: "Pip size", value: fmt(data.pipSize, 6) },
      { label: "Pip value / lot", value: fmt(pipValuePerLot, 4) },
      { label: "Risk / lot", value: fmt(riskPerLot, 4) },
      { label: "Contract size", value: fmt(data.contractSize, 2) },
      { label: "Exact size", value: `${fmt(lotsExact, 4)} lots` },
      { label: "Tradeable size (0.01 step)", value: `${fmt(lots, 2)} lots` },
    ],
  };

  return { ok: true, result };
}
