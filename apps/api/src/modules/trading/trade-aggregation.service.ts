/**
 * Trade aggregation (Phase 4 §12/§20/§46) — THE authoritative financial
 * implementation for the journal domain.
 *
 * Every derived number on a Cosmoz Trade — weighted average entry/exit,
 * quantity totals, gross P&L, fees, swap, net P&L, R-multiple, lifecycle
 * status — is computed HERE and only here. Controllers, services, the
 * frontend and future analytics consume these results; none of them may
 * recompute or duplicate this logic (§46).
 *
 * Canonical rules (documented, single source of truth):
 *   quantity       = Σ entry execution volumes
 *   closedQuantity = Σ exit execution volumes
 *   entryPrice     = volume-weighted average over priced ENTRY executions
 *   exitPrice      = volume-weighted average over priced EXIT executions
 *   entryAt        = earliest ENTRY execution time (openedAt)
 *   exitAt         = latest EXIT execution time (closedAt)
 *   fees           = −Σ commissions over ALL executions (positive cost;
 *                    provider-signed commissions are negative costs)
 *   swap           = Σ signed swap over ALL executions
 *   pnlGross       = Σ profits over ALL executions — null only when EVERY
 *                    execution profit is unknown (null = unknown ≠ 0; one
 *                    known value makes the sum meaningful for MT5-style data
 *                    where entry deals legitimately contribute zero)
 *   pnlNet         = pnlGross − fees + swap (null when pnlGross is null)
 *   status         = CLOSED when at least one EXIT execution exists, else OPEN
 *   rMultiple      = pnlNet / riskAmount when a positive riskAmount exists
 *
 * All arithmetic uses Prisma.Decimal (exact decimal, no floats — §16/§65).
 * Currency semantics: every value is denominated in the trade's currency
 * (the account currency); no conversion is ever performed here (§21).
 */
import { Prisma } from "@prisma/client";

/** Narrow execution input — satisfied by both DB rows and plan-level specs. */
export interface AggregationExecution {
  role: "ENTRY" | "EXIT";
  volume: Prisma.Decimal | string;
  price: Prisma.Decimal | string | null;
  profit: Prisma.Decimal | string | null;
  commission: Prisma.Decimal | string | null;
  swap: Prisma.Decimal | string | null;
  executedAt: Date;
}

export interface TradeAggregates {
  status: "OPEN" | "CLOSED";
  quantity: Prisma.Decimal;
  closedQuantity: Prisma.Decimal;
  entryPrice: Prisma.Decimal | null;
  exitPrice: Prisma.Decimal | null;
  entryAt: Date | null;
  exitAt: Date | null;
  fees: Prisma.Decimal;
  swap: Prisma.Decimal;
  pnlGross: Prisma.Decimal | null;
  pnlNet: Prisma.Decimal | null;
  rMultiple: Prisma.Decimal | null;
  /** Why entryPrice/exitPrice is null when quantity > 0 (unpriced executions). */
  hasUnpricedEntries: boolean;
  hasUnpricedExits: boolean;
}

const ZERO = new Prisma.Decimal(0);

function dec(value: Prisma.Decimal | string | null): Prisma.Decimal | null {
  if (value === null) return null;
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Volume-weighted average price over priced executions (null if none priced). */
function weightedAveragePrice(
  executions: AggregationExecution[],
): { average: Prisma.Decimal | null; hasUnpriced: boolean } {
  let volumeSum = ZERO;
  let notional = ZERO;
  let hasUnpriced = false;
  for (const execution of executions) {
    const volume = dec(execution.volume);
    if (volume === null || volume.isZero()) continue;
    const price = dec(execution.price);
    if (price === null) {
      hasUnpriced = true;
      continue;
    }
    volumeSum = volumeSum.plus(volume);
    notional = notional.plus(volume.times(price));
  }
  if (volumeSum.isZero()) return { average: null, hasUnpriced };
  return { average: notional.div(volumeSum), hasUnpriced };
}

/**
 * Aggregate executions into the canonical journal trade numbers.
 * `riskAmount` (account currency, from the journal plan) enables rMultiple.
 */
export function aggregateExecutions(
  executions: AggregationExecution[],
  options: { riskAmount?: Prisma.Decimal | string | null } = {},
): TradeAggregates {
  const entries: AggregationExecution[] = [];
  const exits: AggregationExecution[] = [];
  for (const execution of executions) {
    (execution.role === "ENTRY" ? entries : exits).push(execution);
  }

  let quantity = ZERO;
  for (const entry of entries) {
    quantity = quantity.plus(dec(entry.volume) ?? ZERO);
  }
  let closedQuantity = ZERO;
  for (const exit of exits) {
    closedQuantity = closedQuantity.plus(dec(exit.volume) ?? ZERO);
  }

  const entryAgg = weightedAveragePrice(entries);
  const exitAgg = weightedAveragePrice(exits);

  let entryAt: Date | null = null;
  for (const entry of entries) {
    if (entryAt === null || entry.executedAt < entryAt) entryAt = entry.executedAt;
  }
  let exitAt: Date | null = null;
  for (const exit of exits) {
    if (exitAt === null || exit.executedAt > exitAt) exitAt = exit.executedAt;
  }

  // Fees = −Σ commissions (a null commission contributes nothing — MT5 entry
  // legs legitimately carry none; unknown ≠ an invented cost, §20).
  let fees = ZERO;
  let swap = ZERO;
  for (const execution of [...entries, ...exits]) {
    const commission = dec(execution.commission);
    if (commission !== null) fees = fees.minus(commission);
    const executionSwap = dec(execution.swap);
    if (executionSwap !== null) swap = swap.plus(executionSwap);
  }

  // P&L: unknown (null) profits contribute 0; the gross result is null only
  // when every execution profit is unknown.
  let pnlGross: Prisma.Decimal | null = ZERO;
  let anyKnownProfit = false;
  for (const execution of [...entries, ...exits]) {
    const profit = dec(execution.profit);
    if (profit === null) continue;
    anyKnownProfit = true;
    pnlGross = (pnlGross as Prisma.Decimal).plus(profit);
  }
  if (!anyKnownProfit) pnlGross = null;

  let pnlNet: Prisma.Decimal | null = null;
  if (pnlGross !== null) {
    pnlNet = pnlGross.minus(fees).plus(swap);
  }

  let rMultiple: Prisma.Decimal | null = null;
  const riskAmount = dec(options.riskAmount ?? null);
  if (pnlNet !== null && riskAmount !== null && riskAmount.greaterThan(0)) {
    rMultiple = pnlNet.div(riskAmount);
  }

  // Lifecycle (§10/§18): the trade is CLOSED only when exits have consumed
  // the full entered volume. A partial close keeps the trade OPEN — closure
  // must reflect actual execution state, never the mere presence of an exit.
  const closed =
    exits.length > 0 && closedQuantity.greaterThanOrEqualTo(quantity);

  return {
    status: closed ? "CLOSED" : "OPEN",
    quantity,
    closedQuantity,
    entryPrice: entryAgg.average,
    exitPrice: exitAgg.average,
    entryAt,
    exitAt,
    fees,
    swap,
    pnlGross,
    pnlNet,
    rMultiple,
    hasUnpricedEntries: entryAgg.hasUnpriced,
    hasUnpricedExits: exitAgg.hasUnpriced,
  };
}

/**
 * The user's local trading day for a UTC instant (data-model.md Domaine 3:
 * tradingDate is computed SERVER-side from the user's timezone — never in
 * the browser). Invalid/unknown timezones fall back to UTC deterministically.
 */
export function tradingDateKey(instant: Date, timezone: string | null | undefined): string {
  const formats = [timezone && timezone.length > 0 ? timezone : "UTC", "UTC"];
  for (const tz of formats) {
    try {
      const formatted = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(instant);
      // en-CA yields YYYY-MM-DD — assert the shape defensively.
      if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
    } catch {
      // Invalid timezone identifier — fall through to the next candidate.
    }
  }
  return instant.toISOString().slice(0, 10);
}
