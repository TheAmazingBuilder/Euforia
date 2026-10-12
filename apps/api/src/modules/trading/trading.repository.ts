/**
 * Trading Core data access (infrastructure) — Phase 4.
 *
 * The ONLY place in the trading context that touches Prisma. All methods
 * return narrow row projections — no Prisma type crosses into services or
 * controllers (Phase 1 §10 boundary). Transactions protect meaningful
 * invariants only (§54): trade+executions creation, close legs, and the
 * reconciliation write-set. Reconciliation additionally serializes on the
 * account row (SELECT … FOR UPDATE) so concurrent syncs stay deterministic
 * (§55) — an in-database lock, not distributed locking.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export interface TradeRow {
  id: string;
  userId: string;
  accountId: string;
  status: string;
  direction: string;
  source: string;
  symbol: string;
  currency: string;
  quantity: Prisma.Decimal;
  closedQuantity: Prisma.Decimal;
  entryPrice: Prisma.Decimal;
  exitPrice: Prisma.Decimal | null;
  entryAt: Date;
  exitAt: Date | null;
  exitReason: string | null;
  fees: Prisma.Decimal;
  swap: Prisma.Decimal;
  pnlGross: Prisma.Decimal | null;
  pnlNet: Prisma.Decimal | null;
  riskAmount: Prisma.Decimal | null;
  rMultiple: Prisma.Decimal | null;
  initialStop: Prisma.Decimal | null;
  initialTP: Prisma.Decimal | null;
  notes: string | null;
  tradingDate: Date;
  externalPositionId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeExecutionRow {
  id: string;
  tradeId: string;
  accountId: string;
  role: string;
  side: string;
  volume: Prisma.Decimal;
  price: Prisma.Decimal | null;
  profit: Prisma.Decimal | null;
  commission: Prisma.Decimal | null;
  swap: Prisma.Decimal | null;
  executedAt: Date;
  reason: string | null;
  note: string | null;
  externalDealId: string | null;
}

export type TradeWithExecutions = TradeRow & { executions: TradeExecutionRow[] };

export type TxClient = Prisma.TransactionClient;

const TRADE_COLUMNS = {
  id: true,
  userId: true,
  accountId: true,
  status: true,
  direction: true,
  source: true,
  symbol: true,
  currency: true,
  quantity: true,
  closedQuantity: true,
  entryPrice: true,
  exitPrice: true,
  entryAt: true,
  exitAt: true,
  exitReason: true,
  fees: true,
  swap: true,
  pnlGross: true,
  pnlNet: true,
  riskAmount: true,
  rMultiple: true,
  initialStop: true,
  initialTP: true,
  notes: true,
  tradingDate: true,
  externalPositionId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const EXECUTION_COLUMNS = {
  id: true,
  tradeId: true,
  accountId: true,
  role: true,
  side: true,
  volume: true,
  price: true,
  profit: true,
  commission: true,
  swap: true,
  executedAt: true,
  reason: true,
  note: true,
  externalDealId: true,
} as const;

export interface TradeListFilters {
  userId: string;
  accountId?: string;
  status?: string;
  symbol?: string;
  direction?: string;
  source?: string;
  openedFrom?: Date;
  openedTo?: Date;
  closedFrom?: Date;
  closedTo?: Date;
  sort: "entryAt" | "exitAt" | "pnlNet";
  order: "asc" | "desc";
  page: number;
  limit: number;
}

@Injectable()
export class TradingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  /**
   * Ownership check is part of the lookup — foreign ids are simply not found
   * (IDOR → honest 404, the established convention). Soft-deleted trades are
   * equally invisible: an archived journal entry no longer exists for reads.
   */
  async findTradeForUser(tradeId: string, userId: string): Promise<TradeWithExecutions | null> {
    const row = await this.prisma.trade.findFirst({
      where: { id: tradeId, userId, deletedAt: null },
      select: { ...TRADE_COLUMNS, executions: { select: EXECUTION_COLUMNS, orderBy: { executedAt: "asc" } } },
    });
    return (row as TradeWithExecutions) ?? null;
  }

  async listTrades(filters: TradeListFilters): Promise<{ rows: TradeRow[]; total: number }> {
    const where: Prisma.TradeWhereInput = {
      userId: filters.userId,
      deletedAt: null,
      accountId: filters.accountId,
      // The Trade lifecycle columns are TEXT (no Prisma enums) — the filters
      // pass through as plain strings.
      status: filters.status,
      symbol: filters.symbol,
      direction: filters.direction,
      source: filters.source,
      entryAt: dateRange(filters.openedFrom, filters.openedTo),
      exitAt: dateRange(filters.closedFrom, filters.closedTo),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trade.findMany({
        where,
        select: TRADE_COLUMNS,
        orderBy: sortClause(filters.sort, filters.order),
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.trade.count({ where }),
    ]);
    return { rows: rows as TradeRow[], total };
  }

  async listTradesByAccount(accountId: string): Promise<TradeWithExecutions[]> {
    const rows = await this.prisma.trade.findMany({
      where: { accountId },
      select: { ...TRADE_COLUMNS, executions: { select: EXECUTION_COLUMNS, orderBy: { executedAt: "asc" } } },
      orderBy: { entryAt: "asc" },
    });
    return rows as TradeWithExecutions[];
  }

  // ── Analytics reads (Phase 8 — additive public contract) ──────────────────

  /**
   * FULL closed-trade journal of one user (no pagination) for analytics
   * aggregation. The Analytics bounded context is a CONSUMER of canonical
   * truth (Phase 8 §2): it reads the exact rows Trading Core owns — same
   * narrow projection, ownership in the where-clause, soft-deleted rows
   * invisible like every other read. Journal-scale volumes make a single
   * fetch cheaper and simpler than paginated windows (live-query decision,
   * Phase 8 §36 — no analytics tables, no read models).
   */
  async listClosedJournalRows(userId: string): Promise<TradeRow[]> {
    const rows = await this.prisma.trade.findMany({
      where: { userId, status: "CLOSED", deletedAt: null },
      select: TRADE_COLUMNS,
      orderBy: { entryAt: "asc" },
    });
    return rows as TradeRow[];
  }

  /** Global OPEN count for the analytics meta (open positions excluded from stats, Phase 8 §45). */
  async countOpenTrades(userId: string): Promise<number> {
    return this.prisma.trade.count({ where: { userId, status: "OPEN", deletedAt: null } });
  }

  // ── Calendar reads (Phase 13 — additive public contract, Phase 6/8/10 precedent) ──

  /**
   * Narrow CLOSED-trade daily aggregates for the trading-calendar view —
   * the Calendar context recomputes NOTHING financial itself (Phase 4
   * §46): it reads the canonical persisted aggregates (tradingDate,
   * pnlNet, rMultiple) over a bounded trading-day window and buckets them
   * per day. Ownership in the where-clause, soft-deleted rows invisible,
   * narrow projection (no Prisma types out).
   */
  async listClosedDailyRows(
    userId: string,
    fromDayKey: string,
    toDayKey: string,
  ): Promise<Array<{ tradingDate: Date; pnlNet: Prisma.Decimal | null; rMultiple: Prisma.Decimal | null }>> {
    return this.prisma.trade.findMany({
      where: {
        userId,
        status: "CLOSED",
        deletedAt: null,
        tradingDate: {
          gte: new Date(`${fromDayKey}T00:00:00.000Z`),
          lte: new Date(`${toDayKey}T00:00:00.000Z`),
        },
      },
      select: { tradingDate: true, pnlNet: true, rMultiple: true },
      orderBy: { tradingDate: "asc" },
    });
  }

  // ── Session Live reads (Phase 10 — additive public contract, Phase 6/8 precedent) ──

  /**
   * Journal trades opened within a session window [from, to] — the Session
   * Live summary's only canonical input (tradeCount/markets/P&L/R). Same
   * discipline as every public read: ownership in the where-clause,
   * soft-deleted rows invisible, narrow projection (no Prisma types out).
   */
  async listSessionWindowRows(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      symbol: string;
      status: string;
      entryAt: Date;
      exitAt: Date | null;
      pnlNet: Prisma.Decimal | null;
      pnlGross: Prisma.Decimal | null;
      rMultiple: Prisma.Decimal | null;
    }>
  > {
    const rows = await this.prisma.trade.findMany({
      where: { userId, deletedAt: null, entryAt: { gte: from, lte: to } },
      select: {
        symbol: true,
        status: true,
        entryAt: true,
        exitAt: true,
        pnlNet: true,
        pnlGross: true,
        rMultiple: true,
      },
      orderBy: { entryAt: "asc" },
    });
    return rows;
  }

  /**
   * Journal trades of ONE trading day (server-computed `tradingDate`) — the
   * Session Live timeline's ENTRY/EXIT source rows. tradingDate is the
   * canonical day column (computed from entryAt + user timezone at capture,
   * Phase 4): the timeline never re-derives "today" client-side.
   */
  async listTimelineRows(
    userId: string,
    tradingDate: Date,
  ): Promise<
    Array<{
      id: string;
      symbol: string;
      status: string;
      direction: string;
      quantity: Prisma.Decimal;
      entryPrice: Prisma.Decimal;
      entryAt: Date;
      exitAt: Date | null;
      exitReason: string | null;
    }>
  > {
    const rows = await this.prisma.trade.findMany({
      where: { userId, deletedAt: null, tradingDate },
      select: {
        id: true,
        symbol: true,
        status: true,
        direction: true,
        quantity: true,
        entryPrice: true,
        entryAt: true,
        exitAt: true,
        exitReason: true,
      },
      orderBy: { entryAt: "asc" },
    });
    return rows;
  }

  // ── Writes (transactions protect the trade+execution invariant, §54) ─────

  /**
   * Instrument catalog lookup by unique ticker (symbol). The journal write
   * paths backfill the denormalized symbol column AND the instrumentId FK
   * — an unknown symbol is an honest refusal (never an invented row, §20).
   */
  async findInstrumentIdBySymbol(symbol: string): Promise<string | null> {
    const row = await this.prisma.instrument.findUnique({
      where: { symbol },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async createTradeWithExecutions(data: {
    userId: string;
    accountId: string;
    instrumentId: string;
    currency: string;
    symbol: string;
    direction: "BUY" | "SELL";
    source: "EXTERNAL_SYNC" | "MANUAL" | "IMPORT";
    initialStop: Prisma.Decimal | null;
    initialTP: Prisma.Decimal | null;
    riskAmount: Prisma.Decimal | null;
    notes: string | null;
    tradingDate: Date;
    externalPositionId: string | null;
    entryPrice: Prisma.Decimal;
    entryAt: Date;
    exitPrice: Prisma.Decimal | null;
    exitAt: Date | null;
    exitReason: string | null;
    status: "OPEN" | "CLOSED";
    quantity: Prisma.Decimal;
    closedQuantity: Prisma.Decimal;
    fees: Prisma.Decimal;
    swap: Prisma.Decimal;
    pnlGross: Prisma.Decimal | null;
    pnlNet: Prisma.Decimal | null;
    rMultiple: Prisma.Decimal | null;
    executions: Array<{
      role: "ENTRY" | "EXIT";
      side: "BUY" | "SELL";
      volume: Prisma.Decimal;
      price: Prisma.Decimal | null;
      profit: Prisma.Decimal | null;
      commission: Prisma.Decimal | null;
      swap: Prisma.Decimal | null;
      executedAt: Date;
      reason: string | null;
      note: string | null;
      externalDealId: string | null;
    }>;
  }): Promise<TradeRow> {
    const { executions, ...trade } = data;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trade.create({ data: trade, select: TRADE_COLUMNS });
      await tx.tradeExecution.createMany({
        data: executions.map((execution) => ({
          ...execution,
          tradeId: created.id,
          accountId: trade.accountId,
        })),
      });
      return created;
    });
    return row as TradeRow;
  }

  /** Append exit legs to a manual trade + recompute aggregates — one transaction. */
  async closeTrade(data: {
    tradeId: string;
    accountId: string;
    exits: Array<{
      role: "EXIT";
      side: "BUY" | "SELL";
      volume: Prisma.Decimal;
      price: Prisma.Decimal | null;
      profit: Prisma.Decimal | null;
      commission: Prisma.Decimal | null;
      swap: Prisma.Decimal | null;
      executedAt: Date;
      reason: string | null;
      note: string | null;
      externalDealId: null;
    }>;
    aggregates: {
      status: "OPEN" | "CLOSED";
      closedQuantity: Prisma.Decimal;
      exitPrice: Prisma.Decimal | null;
      exitAt: Date | null;
      exitReason: string | null;
      fees: Prisma.Decimal;
      swap: Prisma.Decimal;
      pnlGross: Prisma.Decimal | null;
      pnlNet: Prisma.Decimal | null;
      rMultiple: Prisma.Decimal | null;
    };
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeExecution.createMany({
        data: data.exits.map((e) => ({ ...e, tradeId: data.tradeId, accountId: data.accountId })),
      });
      await tx.trade.update({ where: { id: data.tradeId }, data: data.aggregates });
    });
  }

  async updateTrade(
    tradeId: string,
    tradePatch: Partial<{
      status: "OPEN" | "CLOSED";
      direction: "BUY" | "SELL";
      quantity: Prisma.Decimal;
      closedQuantity: Prisma.Decimal;
      entryPrice: Prisma.Decimal;
      entryAt: Date;
      exitPrice: Prisma.Decimal | null;
      exitAt: Date | null;
      exitReason: string | null;
      fees: Prisma.Decimal;
      swap: Prisma.Decimal;
      pnlGross: Prisma.Decimal | null;
      pnlNet: Prisma.Decimal | null;
      rMultiple: Prisma.Decimal | null;
      initialStop: Prisma.Decimal | null;
      initialTP: Prisma.Decimal | null;
      riskAmount: Prisma.Decimal | null;
      notes: string | null;
      tradingDate: Date;
    }>,
    executionPatches: Array<{ id: string; data: Record<string, unknown> }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(tradePatch).length > 0) {
        await tx.trade.update({ where: { id: tradeId }, data: tradePatch });
      }
      for (const patch of executionPatches) {
        await tx.tradeExecution.update({ where: { id: patch.id }, data: patch.data });
      }
    });
  }

  /** Soft delete (§57) — the journal history is never hard-deleted by the API. */
  async softDeleteTrade(tradeId: string, deletedAt: Date): Promise<void> {
    await this.prisma.trade.update({ where: { id: tradeId }, data: { deletedAt } });
  }

  // ── Reconciliation (§26–§28/§55) ───────────────────────────────────────────

  /**
   * Apply a reconstruction plan for one account inside ONE transaction,
   * serialized on the account row. The unique constraints
   * (accountId, externalPositionId) / (accountId, externalDealId) are the
   * ultimate idempotency backstop — a racing duplicate surfaces as P2002.
   */
  async applyReconciliation(
    accountId: string,
    plan: {
      tradesToCreate: Array<{
        userId: string;
        instrumentId: string;
        externalPositionId: string | null;
        direction: "BUY" | "SELL";
        symbol: string;
        currency: string;
        initialStop: Prisma.Decimal | null;
        initialTP: Prisma.Decimal | null;
        entryPrice: Prisma.Decimal;
        entryAt: Date;
        status: "OPEN" | "CLOSED";
        quantity: Prisma.Decimal;
        closedQuantity: Prisma.Decimal;
        exitPrice: Prisma.Decimal | null;
        exitAt: Date | null;
        fees: Prisma.Decimal;
        swap: Prisma.Decimal;
        pnlGross: Prisma.Decimal | null;
        pnlNet: Prisma.Decimal | null;
        tradingDate: Date;
        executions: Array<{
          role: "ENTRY" | "EXIT";
          side: "BUY" | "SELL";
          volume: Prisma.Decimal;
          price: Prisma.Decimal | null;
          profit: Prisma.Decimal | null;
          commission: Prisma.Decimal | null;
          swap: Prisma.Decimal | null;
          executedAt: Date;
          reason: null;
          note: null;
          externalDealId: string | null;
        }>;
      }>;
      attachments: Array<{
        trade: TradeWithExecutions;
        newExecutions: Array<{
          role: "ENTRY" | "EXIT";
          side: "BUY" | "SELL";
          volume: Prisma.Decimal;
          price: Prisma.Decimal | null;
          profit: Prisma.Decimal | null;
          commission: Prisma.Decimal | null;
          swap: Prisma.Decimal | null;
          executedAt: Date;
          externalDealId: string | null;
        }>;
        aggregates: {
          status: "OPEN" | "CLOSED";
          quantity: Prisma.Decimal;
          closedQuantity: Prisma.Decimal;
          entryPrice: Prisma.Decimal;
          exitPrice: Prisma.Decimal | null;
          entryAt: Date;
          exitAt: Date | null;
          exitReason: string | null;
          fees: Prisma.Decimal;
          swap: Prisma.Decimal;
          pnlGross: Prisma.Decimal | null;
          pnlNet: Prisma.Decimal | null;
        };
      }>;
      executionUpdates: Array<{
        executionId: string;
        side: "BUY" | "SELL";
        volume: Prisma.Decimal;
        price: Prisma.Decimal | null;
        profit: Prisma.Decimal | null;
        commission: Prisma.Decimal | null;
        swap: Prisma.Decimal | null;
        executedAt: Date;
      }>;
      reaggregatedTrades: Array<{
        tradeId: string;
        aggregates: {
          status: "OPEN" | "CLOSED";
          quantity: Prisma.Decimal;
          closedQuantity: Prisma.Decimal;
          entryPrice: Prisma.Decimal;
          exitPrice: Prisma.Decimal | null;
          entryAt: Date;
          exitAt: Date | null;
          fees: Prisma.Decimal;
          swap: Prisma.Decimal;
          pnlGross: Prisma.Decimal | null;
          pnlNet: Prisma.Decimal | null;
        };
      }>;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Deterministic serialization per account (§55) — in-database row lock.
      await tx.$queryRaw`SELECT id FROM "TradingAccount" WHERE id = ${accountId}::uuid FOR UPDATE`;

      for (const planned of plan.tradesToCreate) {
        const created = await tx.trade.create({
          data: {
            userId: planned.userId,
            accountId,
            instrumentId: planned.instrumentId,
            currency: planned.currency,
            source: "EXTERNAL_SYNC",
            symbol: planned.symbol,
            direction: planned.direction,
            status: planned.status,
            quantity: planned.quantity,
            closedQuantity: planned.closedQuantity,
            entryPrice: planned.entryPrice,
            exitPrice: planned.exitPrice,
            entryAt: planned.entryAt,
            exitAt: planned.exitAt,
            exitReason: null,
            fees: planned.fees,
            swap: planned.swap,
            pnlGross: planned.pnlGross,
            pnlNet: planned.pnlNet,
            initialStop: planned.initialStop,
            initialTP: planned.initialTP,
            tradingDate: planned.tradingDate,
            externalPositionId: planned.externalPositionId,
          },
          select: { id: true },
        });
        await tx.tradeExecution.createMany({
          data: planned.executions.map((e) => ({ ...e, tradeId: created.id, accountId })),
        });
      }

      for (const attachment of plan.attachments) {
        if (attachment.newExecutions.length > 0) {
          await tx.tradeExecution.createMany({
            data: attachment.newExecutions.map((e) => ({
              tradeId: attachment.trade.id,
              accountId,
              ...e,
            })),
          });
        }
        await tx.trade.update({
          where: { id: attachment.trade.id },
          data: attachment.aggregates,
        });
      }

      for (const update of plan.executionUpdates) {
        await tx.tradeExecution.update({
          where: { id: update.executionId },
          data: {
            side: update.side,
            volume: update.volume,
            price: update.price,
            profit: update.profit,
            commission: update.commission,
            swap: update.swap,
            executedAt: update.executedAt,
          },
        });
      }

      for (const re of plan.reaggregatedTrades) {
        await tx.trade.update({
          where: { id: re.tradeId },
          data: re.aggregates,
        });
      }
    });
  }
}

function dateRange(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (from === undefined && to === undefined) return undefined;
  return { gte: from, lte: to };
}

function sortClause(sort: "entryAt" | "exitAt" | "pnlNet", order: "asc" | "desc"): Prisma.TradeOrderByWithRelationInput[] {
  const primary: Prisma.TradeOrderByWithRelationInput =
    sort === "pnlNet"
      ? { pnlNet: order }
      : sort === "exitAt"
        ? { exitAt: order }
        : { entryAt: order };
  // Stable tie-breaker — deterministic pagination.
  return [primary, { id: "asc" }];
}
