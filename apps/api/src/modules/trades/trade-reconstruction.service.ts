/**
 * Trade Reconstruction (Phase 4 §17/§26/§27/§28).
 *
 * The synchronization consumer of the Trading Core pipeline:
 *
 *   Provider  →  Accounts/Connectivity (Phase 3, normalized deals)
 *            →  THIS service (grouping by provider positionId)
 *            →  canonical Euforia Trade (upsert, idempotent)
 *
 * It NEVER calls a broker adapter (§26) — it reads the already-normalized
 * TradingDeal rows through the Accounts module's exported repository (the
 * narrow read contract, ADR-0003). Provider semantics (§17): MT5-style
 * netting — the first deal of a position defines its direction, deals on
 * that side are entries, opposite-side deals are exits; entry and exit
 * volumes reconcile to a closed position.
 *
 * Idempotency (§27): one journal trade per (accountId, externalPositionId)
 * — enforced by the DB composite unique and honored by upserts. A
 * reconstruction pass that observes unchanged state performs ZERO writes.
 * Reconciliation (§28): a position that closed since the last pass flips
 * its trade OPEN → CLOSED and refreshes the broker-derived fields (§30:
 * broker-derived data is authoritative — journal metadata is untouched).
 *
 * Deals without a positionId (balance operations) never become trades.
 * Provider symbols with no catalog instrument are SKIPPED with a structured
 * warning — provider identifiers are never silently rewritten (§14); the
 * symbol mapping is an explicit future extension.
 */
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import { AccountsRepository, type DealRow } from "../accounts/accounts.repository";
import { TradesRepository } from "./trades.repository";
import {
  computeRiskForTrade,
  tradingDateOf,
  weightedAveragePrice,
  wire,
} from "./trade-calculations";
import type { TradeStatus } from "../../shared/contracts";

export interface ReconstructionOutcome {
  created: number;
  updated: number;
  unchanged: number;
  /** Provider symbols absent from the catalog — never silently rewritten. */
  skippedUnknownSymbols: string[];
}

interface PositionCycle {
  positionId: string;
  symbol: string;
  deals: DealRow[];
}

/** Reconstructed view of one external position — broker-derived truth. */
interface ReconstructedTrade {
  status: TradeStatus;
  direction: "BUY" | "SELL";
  entryPrice: string;
  entryAt: Date;
  quantity: string;
  exitPrice: string | null;
  exitAt: Date | null;
  fees: string;
  swap: string;
  pnlGross: string | null;
  pnlNet: string | null;
  openedAt: Date;
  closedAt: Date | null;
  exits: Array<{ price: string; quantity: string; exitedAt: Date; reason: string }>;
  profit: string | null;
}

@Injectable()
export class TradeReconstructionService {
  constructor(
    private readonly tradesRepository: TradesRepository,
    private readonly accountsRepository: AccountsRepository,
    @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  /**
   * Full re-reconciliation over the given accounts (V1 volume: journal-sync
   * deals per account are small; a per-account watermark is a future
   * optimization documented in the phase report). Deterministic: observing
   * the same deals twice produces the same trades and no duplicate writes.
   * The caller passes account ids obtained through the owner-scoped
   * AccountsRepository lookup — ownership is established upstream.
   */
  async reconstructAccounts(input: {
    userId: string;
    userTimezone: string;
    accountIds: string[];
  }): Promise<ReconstructionOutcome> {
    const outcome: ReconstructionOutcome = {
      created: 0,
      updated: 0,
      unchanged: 0,
      skippedUnknownSymbols: [],
    };

    for (const accountId of input.accountIds) {
      const deals = await this.accountsRepository.listDeals(accountId);
      if (deals.length === 0) continue;
      await this.reconcileAccountDeals({
        accountId,
        userId: input.userId,
        userTimezone: input.userTimezone,
        deals,
        outcome,
      });
    }
    return outcome;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async reconcileAccountDeals(input: {
    accountId: string;
    userId: string;
    userTimezone: string;
    deals: DealRow[];
    outcome: ReconstructionOutcome;
  }): Promise<void> {
    const cycles = groupByPosition(input.deals);
    const positions = await this.accountsRepository.listPositions(input.accountId);
    const unknownSymbols = new Set<string>();

    for (const cycle of cycles) {
      const instrument = await this.tradesRepository.findInstrumentBySymbol(cycle.symbol);
      if (instrument === null) {
        unknownSymbols.add(cycle.symbol);
        continue;
      }
      const reconstructed = reconstructCycle(cycle);
      const position = positions.find(
        (candidate) => candidate.externalPositionId === cycle.positionId,
      ) ?? null;
      const stopLoss = position?.stopLoss === undefined || position?.stopLoss === null
        ? null
        : position.stopLoss.toFixed();
      const takeProfit = position?.takeProfit === undefined || position?.takeProfit === null
        ? null
        : position.takeProfit.toFixed();
      const riskAmount =
        stopLoss === null
          ? null
          : computeRiskForTrade({
              entryPrice: reconstructed.entryPrice,
              initialStop: stopLoss,
              quantity: reconstructed.quantity,
              contractSize: instrument.contractSize.toFixed(),
            });

      let existing = await this.tradesRepository.findTradeByExternalPosition(
        input.accountId,
        cycle.positionId,
      );

      if (existing === null) {
        try {
          await this.tradesRepository.createTradeWithLegs({
            trade: {
              userId: input.userId,
              accountId: input.accountId,
              instrumentId: instrument.id,
              strategyId: null,
              setupId: null,
              strategyVersion: null,
              status: reconstructed.status,
              direction: reconstructed.direction,
              source: "EXTERNAL_SYNC",
              entryPrice: reconstructed.entryPrice,
              entryAt: reconstructed.entryAt,
              quantity: reconstructed.quantity,
              initialStop: stopLoss,
              initialTP: takeProfit,
              plannedRR: null,
              riskAmount,
              finalStop: stopLoss,
              exitPrice: reconstructed.exitPrice,
              exitAt: reconstructed.exitAt,
              exitReason: reconstructed.status === "CLOSED" && reconstructed.exits.length > 0 ? "MANUAL" : null,
              fees: reconstructed.fees,
              swap: reconstructed.swap,
              pnlGross: reconstructed.pnlGross,
              pnlNet: reconstructed.pnlNet,
              rMultiple: riskAmount === null || reconstructed.pnlNet === null ? null : wire(
                new Prisma.Decimal(reconstructed.pnlNet).dividedBy(riskAmount),
              ),
              mfePrice: null,
              maePrice: null,
              mfeR: null,
              maeR: null,
              emotionBefore: null,
              confidence: null,
              notes: null,
              // The trading day is the PROVIDER entry moment localized to the
              // owner's timezone — computed server-side (§22/§56).
              tradingDate: tradingDateOf(reconstructed.entryAt.toISOString(), input.userTimezone),
              externalRef: null,
              importBatchId: null,
              // §9/§27: the mapping anchor — without it the composite unique
              // could not deduplicate across reconciliation passes.
              externalPositionId: cycle.positionId,
            },
            exits: reconstructed.exits.map((exit) => ({ ...exit, note: null })),
          });
          input.outcome.created += 1;
          continue;
        } catch (error) {
          // §31 — the composite unique is the concurrency backstop: two
          // concurrent first reconciliations race the check-then-create.
          // The loser adopts the winner's row instead of failing a READ
          // path with a 409.
          if (
            !(
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            )
          ) {
            throw error;
          }
          existing = await this.tradesRepository.findTradeByExternalPosition(
            input.accountId,
            cycle.positionId,
          );
          if (existing === null) {
            throw error;
          }
        }
      }

      const changed =
        existing.status !== reconstructed.status ||
        existing.direction !== reconstructed.direction ||
        existing.instrumentId !== instrument.id ||
        existing.entryPrice.toFixed() !== normalizedDecimal(reconstructed.entryPrice) ||
        (existing.exitPrice?.toFixed() ?? null) !== normalizedDecimalNullable(reconstructed.exitPrice) ||
        existing.quantity.toFixed() !== normalizedDecimal(reconstructed.quantity) ||
        existing.fees.toFixed() !== normalizedDecimal(reconstructed.fees) ||
        existing.swap.toFixed() !== normalizedDecimal(reconstructed.swap) ||
        (existing.pnlGross?.toFixed() ?? null) !== normalizedDecimalNullable(reconstructed.pnlGross) ||
        (existing.pnlNet?.toFixed() ?? null) !== normalizedDecimalNullable(reconstructed.pnlNet) ||
        (existing.riskAmount?.toFixed() ?? null) !== normalizedDecimalNullable(riskAmount) ||
        existing.exitAt?.getTime() !== reconstructed.exitAt?.getTime();

      if (!changed) {
        input.outcome.unchanged += 1;
        continue;
      }

      await this.tradesRepository.updateTradeFields(existing.id, {
        status: reconstructed.status,
        quantity: reconstructed.quantity,
        initialStop: stopLoss,
        initialTP: takeProfit,
        riskAmount,
        finalStop: stopLoss,
        exitPrice: reconstructed.exitPrice,
        exitAt: reconstructed.exitAt,
        exitReason: reconstructed.status === "CLOSED" && reconstructed.exits.length > 0 ? "MANUAL" : null,
        fees: reconstructed.fees,
        swap: reconstructed.swap,
        pnlGross: reconstructed.pnlGross,
        pnlNet: reconstructed.pnlNet,
        rMultiple:
          riskAmount === null || reconstructed.pnlNet === null
            ? null
            : wire(new Prisma.Decimal(reconstructed.pnlNet).dividedBy(riskAmount)),
      });
      if (reconstructed.exits.length > 0) {
        await this.tradesRepository.replaceExits(
          existing.id,
          reconstructed.exits.map((exit) => ({ ...exit, note: null })),
        );
      }
      input.outcome.updated += 1;
    }

    if (unknownSymbols.size > 0) {
      input.outcome.skippedUnknownSymbols.push(...unknownSymbols);
      this.logger?.warn(
        {
          accountId: input.accountId,
          userId: input.userId,
          symbols: [...unknownSymbols],
        },
        "trade reconstruction skipped unknown provider symbols",
      );
    }
  }
}

/** Group the account's deals by provider position, in execution order. */
export function groupByPosition(deals: DealRow[]): PositionCycle[] {
  const byPosition = new Map<string, PositionCycle>();
  for (const deal of [...deals].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime())) {
    if (deal.positionId === null || deal.symbol === null) continue; // balance op
    let cycle = byPosition.get(deal.positionId);
    if (cycle === undefined) {
      cycle = { positionId: deal.positionId, symbol: deal.symbol, deals: [] };
      byPosition.set(deal.positionId, cycle);
    }
    cycle.deals.push(deal);
  }
  return [...byPosition.values()];
}

/**
 * §17 execution aggregation: group by trading relationship → determine
 * entries/exits → aggregate quantities → weighted prices → provider-supplied
 * P&L → the journal trade state.
 */
export function reconstructCycle(cycle: PositionCycle): ReconstructedTrade {
  const deals = cycle.deals;
  const first = deals[0];
  if (first === undefined) {
    throw new Error("cannot reconstruct an empty position cycle");
  }
  const direction: "BUY" | "SELL" = first.side === "BUY" ? "BUY" : "SELL";

  const entries = deals.filter((deal) => deal.side === direction);
  const exits = deals.filter((deal) => deal.side !== direction);

  const volumeIn = sumVolumes(entries);
  const volumeOut = sumVolumes(exits);
  const closed = volumeOut.greaterThanOrEqualTo(volumeIn) && volumeOut.greaterThan(0);

  const entryPrice = weightedAveragePrice(entries);
  // An OPEN trade has no finalized exit yet (§11) — even with partial legs,
  // the aggregated exit fields stay null until the position closes.
  const exitPrice = closed && exits.length > 0 ? weightedAveragePrice(exits) : null;
  const exitAt = closed && exits.length > 0 ? (exits[exits.length - 1]?.executedAt ?? null) : null;

  // §20: provider data supplies the costs — nothing invented. Commission is
  // a signed cost (negative) in provider data; fees surface it as a positive
  // cost. Net follows the ONE authoritative repo definition
  // (net = gross − fees − swap, shared computeTradeResults semantics).
  const totalProfit = sumDecimals(deals.map((deal) => deal.profit));
  const totalCommission = sumDecimals(deals.map((deal) => deal.commission));
  const totalSwap = sumDecimals(deals.map((deal) => deal.swap));
  const fees = totalCommission !== null && totalCommission.isNegative()
    ? wire(totalCommission.abs())
    : "0";
  const pnlGross = totalProfit === null ? null : wire(totalProfit);
  const pnlNet =
    totalProfit === null
      ? null
      : wire(
          totalProfit
            .minus(totalCommission !== null && totalCommission.isNegative() ? totalCommission.abs() : 0)
            .minus(totalSwap ?? 0),
        );

  return {
    status: closed ? "CLOSED" : "OPEN",
    direction,
    entryPrice: wire(entryPrice, 8),
    entryAt: first.executedAt,
    quantity: wire(volumeIn, 8),
    exitPrice: exitPrice === null ? null : wire(exitPrice, 8),
    exitAt,
    fees,
    swap: wire(totalSwap ?? 0),
    pnlGross,
    pnlNet,
    openedAt: first.executedAt,
    closedAt: exitAt,
    exits: exits.map((deal) => ({
      price: deal.price === null ? "0" : wire(deal.price, 8),
      quantity: wire(deal.volume, 8),
      exitedAt: deal.executedAt,
      reason: "MANUAL",
    })),
    profit: pnlNet,
  };
}

function sumVolumes(deals: DealRow[]): Prisma.Decimal {
  return deals.reduce(
    (sum, deal) => sum.plus(deal.volume),
    new Prisma.Decimal(0),
  );
}

function sumDecimals(values: Array<Prisma.Decimal | null>): Prisma.Decimal | null {
  let sawValue = false;
  let total = new Prisma.Decimal(0);
  for (const value of values) {
    if (value !== null) {
      sawValue = true;
      total = total.plus(value);
    }
  }
  return sawValue ? total : null;
}

/** DB Decimal(18,8) .toFixed() vs computed wire string comparison helper. */
function normalizedDecimal(value: string): string {
  return new Prisma.Decimal(value).toFixed();
}

/** Nullable-side normalization — `null` and `undefined` BOTH mean "no
 * value": an `existing.X?.toFixed()` on a NULL column yields `undefined`
 * while a computed absent value yields `null`; treating them as different
 * made every stop-less/open sync trade look "changed" and rewrote it on
 * every pass (idempotency hole caught by the finalization unit tests). */
function normalizedDecimalNullable(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : normalizedDecimal(value);
}
