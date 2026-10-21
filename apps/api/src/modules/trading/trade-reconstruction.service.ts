/**
 * Trade reconstruction (Phase 4 §6/§9/§17/§18/§19/§26/§27/§28).
 *
 * Turns ALREADY-SYNCHRONIZED external activity (normalized deals + positions
 * owned by the Accounts context) into a PLAN of canonical journal trades.
 * This module is PURE: no database access, no Nest lifecycle — the Trading
 * Core service applies the plan inside one transaction.
 *
 * Canonical grouping (provider-semantics driven, §17 — NOT a universal
 * algorithm; documented V1 semantics for MT5-style deal streams):
 *
 *   1. Balance operations (symbol null) never become trades (§2 — not
 *      trading activity).
 *   2. Deals linked by the provider to a position (externalPositionId) are
 *      grouped by that linkage — MT5 semantics: every deal realizes one
 *      position. The group's position side is the trade's direction; deals
 *      sharing the position side are ENTRY legs (scale-in), opposing-side
 *      deals are EXIT legs (partial or full close). For groups attached to
 *      an EXISTING trade the trade's stored direction is authoritative so
 *      role classification stays stable across syncs.
 *   3. Deals WITHOUT linkage are grouped per symbol by a FIFO walk: a deal
 *      that reduces the currently open volume is an EXIT; any other deal is
 *      an ENTRY. The walk is prefix-deterministic (causal), so append-only
 *      provider streams re-synchronize idempotently (§27/§55).
 *   4. Open positions with NO journal trade yet produce OPEN trades whose
 *      entry facts come from the position row (live floating state —
 *      profit/current price — is NOT copied: the provider stays
 *      authoritative for live state, §11).
 *
 * Idempotency: already-journaled deals (an execution with the same
 * (accountId, externalDealId) exists) are never re-planned; deals mapped to
 * a user-deleted (soft-deleted) trade are skipped WITHOUT resurrecting it.
 * Provider CORRECTIONS are detected by comparing deal facts against the
 * journaled execution — changed deals update their execution and the parent
 * trade is flagged for re-aggregation (§28).
 */
import { Prisma } from "@prisma/client";

/** Narrow deal shape (structurally = AccountsRepository.DealRow). */
export interface ReconstructionDeal {
  externalDealId: string;
  symbol: string | null;
  side: string;
  volume: Prisma.Decimal;
  price: Prisma.Decimal | null;
  profit: Prisma.Decimal | null;
  commission: Prisma.Decimal | null;
  swap: Prisma.Decimal | null;
  externalPositionId: string | null;
  executedAt: Date;
}

/** Narrow position shape (structurally = AccountsRepository.PositionRow). */
export interface ReconstructionPosition {
  externalPositionId: string;
  symbol: string;
  side: string;
  volume: Prisma.Decimal;
  entryPrice: Prisma.Decimal;
  stopLoss: Prisma.Decimal | null;
  takeProfit: Prisma.Decimal | null;
  openedAt: Date;
}

/** Narrow journaled-trade shape the caller loads before planning. */
export interface ExistingTrade {
  id: string;
  accountId: string;
  /** Row-level strings from persistence; cast at classification boundaries. */
  direction: string;
  status: string;
  source: string;
  externalPositionId: string | null;
  deletedAt: Date | null;
  riskAmount: Prisma.Decimal | null;
  executions: Array<{
    id: string;
    externalDealId: string | null;
    role: string;
    side: string;
    volume: Prisma.Decimal;
    price: Prisma.Decimal | null;
    profit: Prisma.Decimal | null;
    commission: Prisma.Decimal | null;
    swap: Prisma.Decimal | null;
    executedAt: Date;
  }>;
}

/** A new execution to journal (provider deal or synthesized from a position). */
export interface PlannedExecution {
  role: "ENTRY" | "EXIT";
  side: "BUY" | "SELL";
  volume: Prisma.Decimal;
  price: Prisma.Decimal | null;
  profit: Prisma.Decimal | null;
  commission: Prisma.Decimal | null;
  swap: Prisma.Decimal | null;
  executedAt: Date;
  externalDealId: string | null;
}

/** A brand-new journal trade to create. */
export interface PlannedTrade {
  externalPositionId: string | null;
  direction: "BUY" | "SELL";
  symbol: string;
  initialStop: Prisma.Decimal | null;
  initialTP: Prisma.Decimal | null;
  executions: PlannedExecution[];
  /** Provider-sourced entry facts (position-synthesized trades only). */
  entryPrice: Prisma.Decimal | null;
  entryAt: Date | null;
}

/** Executions to attach to an existing trade (its aggregates get recomputed). */
export interface PlannedAttachment {
  tradeId: string;
  executions: PlannedExecution[];
}

/** Provider correction: an execution whose facts changed (§28). */
export interface PlannedExecutionUpdate {
  executionId: string;
  tradeId: string;
  role: "ENTRY" | "EXIT";
  side: "BUY" | "SELL";
  volume: Prisma.Decimal;
  price: Prisma.Decimal | null;
  profit: Prisma.Decimal | null;
  commission: Prisma.Decimal | null;
  swap: Prisma.Decimal | null;
  executedAt: Date;
}

export interface ReconstructionPlan {
  tradesToCreate: PlannedTrade[];
  attachments: PlannedAttachment[];
  executionUpdates: PlannedExecutionUpdate[];
  /** Trades whose aggregates must be recomputed (attachments + corrections). */
  tradeIdsToReaggregate: Set<string>;
  /** Deals considered = symbol-bearing deals in the provider payload. */
  dealsConsidered: number;
  /** Deals skipped because they are already journaled (idempotency, §27). */
  dealsAlreadyJournaled: number;
  /** Deals skipped because their journal trade was soft-deleted by the user. */
  dealsSkippedDeletedTrade: number;
}

export function buildReconstructionPlan(input: {
  deals: ReconstructionDeal[];
  positions: ReconstructionPosition[];
  existingTrades: ExistingTrade[];
}): ReconstructionPlan {
  const plan: ReconstructionPlan = {
    tradesToCreate: [],
    attachments: [],
    executionUpdates: [],
    tradeIdsToReaggregate: new Set<string>(),
    dealsConsidered: 0,
    dealsAlreadyJournaled: 0,
    dealsSkippedDeletedTrade: 0,
  };

  const trades = input.existingTrades;
  const executionsByDealId = new Map<string, { trade: ExistingTrade; execution: ExistingTrade["executions"][number] }>();
  for (const trade of trades) {
    for (const execution of trade.executions) {
      if (execution.externalDealId !== null) {
        executionsByDealId.set(execution.externalDealId, { trade, execution });
      }
    }
  }
  const deletedTradeIds = new Set(trades.filter((t) => t.deletedAt !== null).map((t) => t.id));

  // ── 1. Filter out balance operations; keep trading deals chronologically ──
  const tradingDeals = input.deals
    .filter((d) => d.symbol !== null && d.symbol !== "")
    .sort((a, b) =>
      a.executedAt.getTime() !== b.executedAt.getTime()
        ? a.executedAt.getTime() - b.executedAt.getTime()
        : a.externalDealId.localeCompare(b.externalDealId),
    );
  plan.dealsConsidered = tradingDeals.length;

  const unmapped: ReconstructionDeal[] = [];
  for (const deal of tradingDeals) {
    const known = executionsByDealId.get(deal.externalDealId);
    if (!known) {
      unmapped.push(deal);
      continue;
    }
    if (deletedTradeIds.has(known.trade.id)) {
      plan.dealsSkippedDeletedTrade += 1;
      continue;
    }
    plan.dealsAlreadyJournaled += 1;
    // Provider correction detection (§28): compare journaled facts.
    const changed =
      !known.execution.volume.eq(deal.volume) ||
      !decimalEq(known.execution.price, deal.price) ||
      !decimalEq(known.execution.profit, deal.profit) ||
      !decimalEq(known.execution.commission, deal.commission) ||
      !decimalEq(known.execution.swap, deal.swap) ||
      known.execution.executedAt.getTime() !== deal.executedAt.getTime() ||
      known.execution.side !== (deal.side as "BUY" | "SELL");
    if (changed) {
      plan.executionUpdates.push({
        executionId: known.execution.id,
        tradeId: known.trade.id,
        role: known.execution.role as "ENTRY" | "EXIT",
        side: deal.side as "BUY" | "SELL",
        volume: deal.volume,
        price: deal.price,
        profit: deal.profit,
        commission: deal.commission,
        swap: deal.swap,
        executedAt: deal.executedAt,
      });
      plan.tradeIdsToReaggregate.add(known.trade.id);
    }
  }

  // ── 2. Position-linked groups (MT5 semantics) ────────────────────────────
  const linkedGroups = new Map<string, ReconstructionDeal[]>();
  const unlinked: ReconstructionDeal[] = [];
  for (const deal of unmapped) {
    if (deal.externalPositionId !== null) {
      const group = linkedGroups.get(deal.externalPositionId);
      if (group) group.push(deal);
      else linkedGroups.set(deal.externalPositionId, [deal]);
    } else {
      unlinked.push(deal);
    }
  }

  for (const [positionId, groupDeals] of linkedGroups) {
    // Existing trade for this external position (created earlier from the
    // position itself, or by a previous sync of this same group).
    const existing =
      trades.find((t) => t.externalPositionId === positionId && t.deletedAt === null) ??
      undefined;
    if (existing) {
      // Role classification anchored on the STORED direction — stable across
      // syncs regardless of arrival order (§55 determinism).
      const executions = groupDeals.map((deal) =>
        toPlannedExecution(deal, deal.side === existing.direction ? "ENTRY" : "EXIT"),
      );
      plan.attachments.push({ tradeId: existing.id, executions });
      plan.tradeIdsToReaggregate.add(existing.id);
      continue;
    }
    if (deletedTradeIds.has(tradeIdForPosition(trades, positionId))) {
      // The user deleted the journal trade for this position — do not resurrect.
      continue;
    }
    const positionSide = (groupDeals[0]?.side ?? "BUY") as "BUY" | "SELL";
    plan.tradesToCreate.push({
      externalPositionId: positionId,
      direction: positionSide,
      symbol: groupDeals[0]?.symbol ?? "",
      initialStop: null,
      initialTP: null,
      entryPrice: null,
      entryAt: null,
      executions: groupDeals.map((deal) =>
        toPlannedExecution(deal, deal.side === positionSide ? "ENTRY" : "EXIT"),
      ),
    });
  }

  // ── 3. Unlinked deals → FIFO walk per symbol (prefix-deterministic) ──────
  const fifoGroups = fifoGroupUnlinked(unlinked);
  for (const group of fifoGroups) {
    plan.tradesToCreate.push({
      externalPositionId: null,
      direction: group.direction,
      symbol: group.symbol,
      initialStop: null,
      initialTP: null,
      entryPrice: null,
      entryAt: null,
      executions: group.executions,
    });
  }

  // ── 4. Open positions without a journal trade → OPEN trades (§11) ────────
  for (const position of input.positions) {
    // Any existing trade for this position (deleted or not) means the
    // position is already journaled — a deleted trade is NOT resurrected.
    const alreadyJournaled =
      trades.some((t) => t.externalPositionId === position.externalPositionId) ||
      plan.tradesToCreate.some((p) => p.externalPositionId === position.externalPositionId);
    if (alreadyJournaled) continue;
    plan.tradesToCreate.push({
      externalPositionId: position.externalPositionId,
      direction: position.side as "BUY" | "SELL",
      symbol: position.symbol,
      initialStop: position.stopLoss,
      initialTP: position.takeProfit,
      entryPrice: position.entryPrice,
      entryAt: position.openedAt,
      executions: [
        {
          role: "ENTRY",
          side: position.side as "BUY" | "SELL",
          volume: position.volume,
          price: position.entryPrice,
          // Live floating values are NOT copied into the journal (§11):
          // profit/commission/swap stay unknown until real exit deals arrive.
          profit: null,
          commission: null,
          swap: null,
          executedAt: position.openedAt,
          externalDealId: null,
        },
      ],
    });
  }

  return plan;
}

/** Stable mapping positionId → owning trade (for the deleted-trade check). */
function tradeIdForPosition(trades: ExistingTrade[], positionId: string): string {
  const found = trades.find((t) => t.externalPositionId === positionId);
  return found ? found.id : "__none__";
}

function toPlannedExecution(deal: ReconstructionDeal, role: "ENTRY" | "EXIT"): PlannedExecution {
  return {
    role,
    side: deal.side as "BUY" | "SELL",
    volume: deal.volume,
    price: deal.price,
    profit: deal.profit,
    commission: deal.commission,
    swap: deal.swap,
    executedAt: deal.executedAt,
    externalDealId: deal.externalDealId,
  };
}

function decimalEq(a: Prisma.Decimal | null, b: Prisma.Decimal | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.eq(b);
}

interface FifoGroup {
  symbol: string;
  direction: "BUY" | "SELL";
  executions: PlannedExecution[];
}

/**
 * FIFO walk over unlinked deals, per symbol (§17 V1 semantics for providers
 * that expose deals without position linkage). Causal/prefix-deterministic:
 * the classification of a deal depends only on PRIOR deals, so appending new
 * deals never reclassifies journaled ones (§27/§55).
 */
export function fifoGroupUnlinked(deals: ReconstructionDeal[]): FifoGroup[] {
  const groups: FifoGroup[] = [];
  const books = new Map<
    string,
    { current: FifoGroup | null; entries: Array<{ group: FifoGroup; remaining: Prisma.Decimal }> }
  >();

  const totalRemaining = (group: FifoGroup, entries: Array<{ group: FifoGroup; remaining: Prisma.Decimal }>) =>
    entries
      .filter((e) => e.group === group)
      .reduce((sum, e) => sum.plus(e.remaining), new Prisma.Decimal(0));

  for (const deal of deals) {
    const symbol = deal.symbol as string;
    const book =
      books.get(symbol) ?? { current: null, entries: [] as Array<{ group: FifoGroup; remaining: Prisma.Decimal }> };
    const opposite = deal.side === "BUY" ? "SELL" : "BUY";
    const openEntry = book.entries.find(
      (e) => e.group.direction === opposite && e.remaining.greaterThan(0),
    );
    const execution = toPlannedExecution(deal, openEntry ? "EXIT" : "ENTRY");

    if (openEntry) {
      // Reduces open volume — an exit leg of the group that owns the entry.
      openEntry.remaining = openEntry.remaining.minus(deal.volume);
      openEntry.group.executions.push(execution);
    } else if (
      book.current !== null &&
      book.current.direction === (deal.side as "BUY" | "SELL") &&
      totalRemaining(book.current, book.entries).greaterThan(0)
    ) {
      // Same side while the current group is still open — scale-in (§19).
      book.current.executions.push(execution);
      book.entries.push({ group: book.current, remaining: deal.volume });
    } else {
      const group: FifoGroup = {
        symbol,
        direction: deal.side as "BUY" | "SELL",
        executions: [execution],
      };
      groups.push(group);
      book.entries.push({ group, remaining: deal.volume });
      book.current = group;
    }
    books.set(symbol, book);
  }
  return groups;
}
