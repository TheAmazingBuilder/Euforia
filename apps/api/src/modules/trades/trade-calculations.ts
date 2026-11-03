/**
 * Trading Core - THE authoritative financial implementation (Phase 4 §12/§46).
 *
 * Every money/quantity/R computation in the journal domain flows through
 * these pure functions: trade creation, closing, editing, CSV import and
 * external synchronization all consume the SAME definitions - no controller,
 * service or frontend may re-derive a result (§46: one authoritative
 * implementation). Decimal arithmetic everywhere (§16); wire output is the
 * shared decimal-string format.
 *
 * Sizing semantics mirror the product contract: risk_percent/risk_amount
 * budgets convert into a quantity via |entry − stop| × contractSize, floored
 * to 0.01 so realized risk never exceeds the budget. Without a stop, a
 * risk-budgeted size cannot be computed - the mock-product fallback of a
 * minimal 0.01 unit with the budget recorded as riskAmount applies.
 */
import { Prisma } from "@prisma/client";
import { toTradingDateKey } from "../../shared/contracts";

/**
 * THE canonical weighted-average price (§15/§16): Decimal accumulation,
 * one definition shared by the journal close path (multi-leg partial exits)
 * and the external reconstruction pipeline - no float arithmetic on prices
 * anywhere (MASTER §16: financial computation uses an exact strategy).
 * A null price contributes its volume to the denominator only - mirroring
 * the reconstruction rule for provider rows with a missing price.
 */
export function weightedAveragePrice(
  rows: Array<{ price: Prisma.Decimal | null; volume: Prisma.Decimal }>,
): Prisma.Decimal {
  let weighted = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  for (const row of rows) {
    weighted = weighted.plus((row.price ?? new Prisma.Decimal(0)).times(row.volume));
    total = total.plus(row.volume);
  }
  return total.isZero() ? new Prisma.Decimal(0) : weighted.dividedBy(total);
}

/** Wire-format decimal string: at most `places` decimals, trailing zeros
 * stripped (e.g. "12.50" → "12.5", "0.00" → "0"), never exponent notation. */
export function wire(value: Prisma.Decimal | number | string, places = 2): string {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  const fixed = decimal.toDecimalPlaces(places).toFixed();
  if (fixed.includes(".")) {
    const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
    return trimmed === "-0" ? "0" : trimmed;
  }
  return fixed === "-0" ? "0" : fixed;
}

/** Value-object view of a trade's financial legs (persisted or computed). */
export interface TradeFinancials {
  direction: "BUY" | "SELL";
  entryPrice: string;
  exitPrice: string | null;
  quantity: string;
  initialStop: string | null;
  fees: string;
  swap: string;
  riskAmount: string | null;
  mfePrice: string | null;
  maePrice: string | null;
}

/** The full set of server-computed RESULTS (data-model.md §15). */
export interface TradeResults {
  pnlGross: string | null;
  pnlNet: string | null;
  rMultiple: string | null;
  mfeR: string | null;
  maeR: string | null;
}

/**
 * Results of a CLOSED trade (§20): the delta-based gross P&L (Δ × quantity ×
 * contractSize), its net after fees and swap, the R-multiple against the
 * risked amount, and MFE/MAE price→R conversions against the initial stop
 * distance. Exit-only - an open trade has no result yet (§11).
 */
export function computeTradeResults(
  financials: TradeFinancials,
  contractSize: string,
): TradeResults {
  const entry = new Prisma.Decimal(financials.entryPrice);
  const quantity = new Prisma.Decimal(financials.quantity);
  const size = new Prisma.Decimal(contractSize);
  const fees = new Prisma.Decimal(financials.fees);
  const swap = new Prisma.Decimal(financials.swap);

  const pnlNet =
    financials.exitPrice === null
      ? null
      : ((): Prisma.Decimal => {
          const exit = new Prisma.Decimal(financials.exitPrice as string);
          const delta =
            financials.direction === "BUY" ? exit.minus(entry) : entry.minus(exit);
          return delta.times(quantity).times(size).minus(fees).minus(swap);
        })();

  const pnlGross = pnlNet === null ? null : pnlNet.plus(fees).plus(swap);

  const risk = financials.riskAmount === null ? null : new Prisma.Decimal(financials.riskAmount);
  const rMultiple =
    pnlNet === null || risk === null || risk.lessThanOrEqualTo(0)
      ? null
      : pnlNet.dividedBy(risk);

  const stopDistance =
    financials.initialStop === null
      ? null
      : entry.minus(financials.initialStop).abs();
  const toR = (price: string | null): string | null => {
    if (price === null || stopDistance === null || stopDistance.lessThanOrEqualTo(0)) {
      return null;
    }
    return wire(new Prisma.Decimal(price).minus(entry).abs().dividedBy(stopDistance));
  };

  return {
    pnlGross: pnlGross === null ? null : wire(pnlGross),
    pnlNet: pnlNet === null ? null : wire(pnlNet),
    rMultiple: rMultiple === null ? null : wire(rMultiple),
    mfeR: toR(financials.mfePrice),
    maeR: toR(financials.maePrice),
  };
}

/** Money actually risked: |entry − stop| × quantity × contractSize, or null
 * when no stop / degenerate inputs (shared computeRiskAmount semantics). */
export function computeRiskForTrade(input: {
  entryPrice: string;
  initialStop: string | null;
  quantity: string;
  contractSize: string;
}): string | null {
  if (input.initialStop === null) return null;
  const entry = new Prisma.Decimal(input.entryPrice);
  const stop = new Prisma.Decimal(input.initialStop);
  const quantity = new Prisma.Decimal(input.quantity);
  const size = new Prisma.Decimal(input.contractSize);
  const distance = entry.minus(stop).abs();
  if (distance.isZero() || quantity.lessThanOrEqualTo(0) || size.lessThanOrEqualTo(0)) {
    return null;
  }
  return wire(distance.times(quantity).times(size));
}

export type SizeInput =
  | { mode: "quantity"; quantity: string }
  | { mode: "risk_percent"; riskPercent: string }
  | { mode: "risk_amount"; riskAmount: string };

export interface ResolvedSize {
  quantity: string;
  riskAmount: string | null;
}

/**
 * Resolve the position size from the capture input (shared tradeSizeMode
 * contract). `balance` is the account's authoritative anchor (latest
 * snapshot balance, else the starting balance - Accounts stays the source
 * of truth, §24). quantity mode keeps the client quantity and derives the
 * risked amount; budget modes derive the quantity from the stop distance.
 */
export function resolvePositionSize(input: {
  size: SizeInput;
  entryPrice: string;
  initialStop: string | null;
  contractSize: string;
  balance: string;
}): ResolvedSize {
  const entry = new Prisma.Decimal(input.entryPrice);
  const size = new Prisma.Decimal(input.contractSize);
  const stopDistance =
    input.initialStop === null ? null : entry.minus(input.initialStop).abs();

  if (input.size.mode === "quantity") {
    const riskAmount =
      input.initialStop === null
        ? null
        : computeRiskForTrade({
            entryPrice: input.entryPrice,
            initialStop: input.initialStop,
            quantity: input.size.quantity,
            contractSize: input.contractSize,
          });
    return { quantity: input.size.quantity, riskAmount };
  }

  const budget =
    input.size.mode === "risk_percent"
      ? new Prisma.Decimal(input.balance)
          .times(input.size.riskPercent)
          .dividedBy(100)
      : new Prisma.Decimal(input.size.riskAmount);

  if (stopDistance === null || stopDistance.lessThanOrEqualTo(0)) {
    // Risk-based sizing without a stop: cannot size - minimal unit fallback.
    return { quantity: "0.01", riskAmount: wire(budget) };
  }
  const perUnit = stopDistance.times(size);
  // Floor to 0.01 so realized risk never exceeds the budget (micro-lot).
  const quantity = budget.dividedBy(perUnit).times(100).floor().dividedBy(100);
  if (quantity.lessThanOrEqualTo(0)) {
    return { quantity: "0.01", riskAmount: wire(budget) };
  }
  return {
    quantity: wire(quantity),
    riskAmount: wire(quantity.times(perUnit)),
  };
}

/**
 * The user-local trading day (§22/§56) - computed SERVER-side from the UTC
 * entry timestamp and the user's stored timezone, never from any client
 * clock. Persisted as a DATE column; loud failure on an unknown timezone is
 * intended (a silent wrong day would corrupt every per-day aggregate).
 */
export function tradingDateOf(entryAt: string, timezone: string): Date {
  const key = toTradingDateKey(entryAt, timezone);
  return new Date(`${key}T00:00:00.000Z`);
}

/** DATE column → wire date key. */
export function dateKeyOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}
