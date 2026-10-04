/**
 * Accounts data access (infrastructure) — Phase 3.
 *
 * The ONLY place in the accounts context that touches Prisma. All methods
 * return narrow row projections — no Prisma type crosses into services or
 * controllers (Phase 1 §10 boundary). Transactions protect meaningful
 * invariants only (§62): account+connection creation, and the synchronized
 * state write-set of a sync run.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export interface TradingAccountRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  broker: string;
  currency: string;
  startingBalance: Prisma.Decimal;
  isDefault: boolean;
  propConfig: unknown;
  externalAccountId: string;
  providerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradingConnectionRow {
  id: string;
  accountId: string;
  providerId: string;
  method: string;
  status: string;
  credentialsEnc: string;
  credentialsHint: string;
  permissions: string[];
  lastError: string | null;
  lastConnectedAt: Date | null;
  lastSyncAt: Date | null;
}

export interface SnapshotRow {
  id: string;
  accountId: string;
  balance: Prisma.Decimal | null;
  equity: Prisma.Decimal | null;
  unrealizedPnl: Prisma.Decimal | null;
  margin: Prisma.Decimal | null;
  freeMargin: Prisma.Decimal | null;
  marginLevel: Prisma.Decimal | null;
  currency: string;
  syncedAt: Date;
  syncRunId: string | null;
}

export interface PositionRow {
  id: string;
  accountId: string;
  externalPositionId: string;
  symbol: string;
  side: string;
  volume: Prisma.Decimal;
  entryPrice: Prisma.Decimal;
  currentPrice: Prisma.Decimal | null;
  stopLoss: Prisma.Decimal | null;
  takeProfit: Prisma.Decimal | null;
  profit: Prisma.Decimal | null;
  swap: Prisma.Decimal | null;
  commission: Prisma.Decimal | null;
  openedAt: Date;
  syncedAt: Date;
}

export interface OrderRow {
  id: string;
  accountId: string;
  externalOrderId: string;
  symbol: string;
  type: string;
  volume: Prisma.Decimal;
  price: Prisma.Decimal;
  stopLoss: Prisma.Decimal | null;
  takeProfit: Prisma.Decimal | null;
  status: string;
  providerCreatedAt: Date | null;
  providerUpdatedAt: Date | null;
  syncedAt: Date;
}

export interface DealRow {
  id: string;
  accountId: string;
  externalDealId: string;
  symbol: string | null;
  side: string;
  volume: Prisma.Decimal;
  price: Prisma.Decimal | null;
  profit: Prisma.Decimal | null;
  commission: Prisma.Decimal | null;
  swap: Prisma.Decimal | null;
  /** Provider-side position this deal belongs to (Phase 4 §9) — nullable. */
  positionId: string | null;
  executedAt: Date;
  syncedAt: Date;
}

export interface SyncRunRow {
  id: string;
  accountId: string;
  status: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  positionsUpserted: number;
  ordersUpserted: number;
  dealsUpserted: number;
  errorCode: string | null;
  requestId: string | null;
}

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Accounts ───────────────────────────────────────────────────────────────

  async listAccountsByUser(userId: string): Promise<TradingAccountRow[]> {
    const rows = await this.prisma.tradingAccount.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return rows as TradingAccountRow[];
  }

  /** Ownership check is part of the lookup — foreign ids are simply not found (IDOR → 404). */
  async findAccountForUser(accountId: string, userId: string): Promise<TradingAccountRow | null> {
    const row = await this.prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
    });
    return (row as TradingAccountRow) ?? null;
  }

  async countAccountsByUser(userId: string): Promise<number> {
    return this.prisma.tradingAccount.count({ where: { userId } });
  }

  async findAccountByExternal(
    userId: string,
    providerId: string,
    externalAccountId: string,
  ): Promise<TradingAccountRow | null> {
    const row = await this.prisma.tradingAccount.findUnique({
      where: {
        userId_providerId_externalAccountId: {
          userId,
          providerId,
          externalAccountId,
        },
      },
    });
    return (row as TradingAccountRow) ?? null;
  }

  // ── Connections ────────────────────────────────────────────────────────────

  async findConnectionByAccountId(accountId: string): Promise<TradingConnectionRow | null> {
    const row = await this.prisma.tradingConnection.findUnique({
      where: { accountId },
    });
    return (row as TradingConnectionRow) ?? null;
  }

  /** Account + its connection are created atomically (§62). */
  async createAccountWithConnection(data: {
    account: {
      userId: string;
      name: string;
      type: string;
      broker: string;
      currency: string;
      startingBalance: string;
      isDefault: boolean;
      externalAccountId: string;
      providerId: string;
    };
    connection: {
      method: string;
      credentialsEnc: string;
      credentialsHint: string;
      permissions: string[];
      lastConnectedAt: Date;
    };
  }): Promise<{ account: TradingAccountRow; connection: TradingConnectionRow }> {
    const [account, connection] = await this.prisma.$transaction(async (tx) => {
      const account = await tx.tradingAccount.create({
        data: {
          userId: data.account.userId,
          name: data.account.name,
          type: data.account.type,
          broker: data.account.broker,
          currency: data.account.currency,
          startingBalance: new Prisma.Decimal(data.account.startingBalance),
          isDefault: data.account.isDefault,
          externalAccountId: data.account.externalAccountId,
          providerId: data.account.providerId,
        },
      });
      const connection = await tx.tradingConnection.create({
        data: {
          accountId: account.id,
          providerId: data.account.providerId,
          method: data.connection.method,
          credentialsEnc: data.connection.credentialsEnc,
          credentialsHint: data.connection.credentialsHint,
          permissions: data.connection.permissions,
          status: "CONNECTED",
          lastConnectedAt: data.connection.lastConnectedAt,
          lastSyncAt: null,
          lastError: null,
        },
      });
      return [account, connection] as const;
    });
    return {
      account: account as TradingAccountRow,
      connection: connection as TradingConnectionRow,
    };
  }

  /** Reconnect with fresh credentials — status back to CONNECTED. */
  async reconnectConnection(
    accountId: string,
    data: {
      credentialsEnc: string;
      credentialsHint: string;
      lastConnectedAt: Date;
    },
  ): Promise<TradingConnectionRow> {
    const row = await this.prisma.tradingConnection.update({
      where: { accountId },
      data: {
        ...data,
        status: "CONNECTED",
        lastError: null,
      },
    });
    return row as TradingConnectionRow;
  }

  /**
   * Disconnect (§52): credentials are DESTROYED (not kept), the row and all
   * synchronized history stay. Journal data is untouched.
   */
  async disconnectConnection(accountId: string): Promise<TradingConnectionRow> {
    const row = await this.prisma.tradingConnection.update({
      where: { accountId },
      data: {
        status: "DISCONNECTED",
        credentialsEnc: "",
        credentialsHint: "",
        lastError: null,
      },
    });
    return row as TradingConnectionRow;
  }

  /** Auth-class provider failures flip the connection to ERROR with sanitized text. */
  async setConnectionError(accountId: string, lastError: string): Promise<void> {
    await this.prisma.tradingConnection.update({
      where: { accountId },
      data: { status: "ERROR", lastError },
    });
  }

  async markSynced(accountId: string, at: Date): Promise<void> {
    await this.prisma.tradingConnection.update({
      where: { accountId },
      data: { lastSyncAt: at },
    });
  }

  // ── Synchronization runs ───────────────────────────────────────────────────

  async findRunningSyncRun(accountId: string): Promise<SyncRunRow | null> {
    const row = await this.prisma.tradingSyncRun.findFirst({
      where: { accountId, status: "RUNNING" },
    });
    return (row as SyncRunRow) ?? null;
  }

  async createSyncRun(data: {
    accountId: string;
    trigger: string;
    requestId: string | null;
  }): Promise<SyncRunRow> {
    const row = await this.prisma.tradingSyncRun.create({ data });
    return row as SyncRunRow;
  }

  async failSyncRun(id: string, errorCode: string): Promise<void> {
    await this.prisma.tradingSyncRun.update({
      where: { id },
      data: { status: "FAILED", finishedAt: new Date(), errorCode },
    });
  }

  async latestSyncRun(accountId: string): Promise<SyncRunRow | null> {
    const row = await this.prisma.tradingSyncRun.findFirst({
      where: { accountId },
      orderBy: { startedAt: "desc" },
    });
    return (row as SyncRunRow) ?? null;
  }

  /**
   * Recent sync runs across ALL of the user's accounts — the canonical
   * provider/sync health source consumed by the Monitoring module (Phase 17
   * §26: Monitoring reads the owning domain's state, never a duplicate).
   * Bounded to the most recent `take` runs; user-scoped via the account.
   */
  async listRecentSyncRunsForUser(userId: string, take = 200): Promise<SyncRunRow[]> {
    const rows = await this.prisma.tradingSyncRun.findMany({
      where: { account: { userId } },
      orderBy: { startedAt: "desc" },
      take,
    });
    return rows as SyncRunRow[];
  }

  // ── Synchronized state ─────────────────────────────────────────────────────

  /**
   * The full write-set of a successful sync is ONE transaction (§62): the
   * database never shows a new snapshot with stale positions (or vice versa).
   */
  async persistSyncResult(data: {
    runId: string;
    accountId: string;
    currency: string;
    durationMs: number;
    snapshot: {
      balance: string | null;
      equity: string | null;
      unrealizedPnl: string | null;
      margin: string | null;
      freeMargin: string | null;
      marginLevel: string | null;
      syncedAt: Date;
    };
    positions: Array<Record<string, unknown>>;
    orders: Array<Record<string, unknown>>;
    deals: Array<Record<string, unknown>>;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const snapshotData = {
        balance: data.snapshot.balance === null ? null : new Prisma.Decimal(data.snapshot.balance),
        equity: data.snapshot.equity === null ? null : new Prisma.Decimal(data.snapshot.equity),
        unrealizedPnl:
          data.snapshot.unrealizedPnl === null
            ? null
            : new Prisma.Decimal(data.snapshot.unrealizedPnl),
        margin: data.snapshot.margin === null ? null : new Prisma.Decimal(data.snapshot.margin),
        freeMargin:
          data.snapshot.freeMargin === null ? null : new Prisma.Decimal(data.snapshot.freeMargin),
        marginLevel:
          data.snapshot.marginLevel === null ? null : new Prisma.Decimal(data.snapshot.marginLevel),
        currency: data.currency,
        syncedAt: data.snapshot.syncedAt,
        syncRunId: data.runId,
      };
      await tx.tradingAccountSnapshot.upsert({
        where: { accountId: data.accountId },
        create: { accountId: data.accountId, ...snapshotData },
        update: snapshotData,
      });

      for (const position of data.positions) {
        const p = position as {
          externalPositionId: string;
          symbol: string;
          side: string;
          volume: string;
          entryPrice: string;
          currentPrice: string | null;
          stopLoss: string | null;
          takeProfit: string | null;
          profit: string | null;
          swap: string | null;
          commission: string | null;
          openedAt: Date;
        };
        const row = {
          externalPositionId: p.externalPositionId,
          symbol: p.symbol,
          side: p.side,
          volume: new Prisma.Decimal(p.volume),
          entryPrice: new Prisma.Decimal(p.entryPrice),
          currentPrice: p.currentPrice === null ? null : new Prisma.Decimal(p.currentPrice),
          stopLoss: p.stopLoss === null ? null : new Prisma.Decimal(p.stopLoss),
          takeProfit: p.takeProfit === null ? null : new Prisma.Decimal(p.takeProfit),
          profit: p.profit === null ? null : new Prisma.Decimal(p.profit),
          swap: p.swap === null ? null : new Prisma.Decimal(p.swap),
          commission: p.commission === null ? null : new Prisma.Decimal(p.commission),
          openedAt: p.openedAt,
          syncedAt: data.snapshot.syncedAt,
        };
        await tx.tradingPosition.upsert({
          where: {
            accountId_externalPositionId: {
              accountId: data.accountId,
              externalPositionId: p.externalPositionId,
            },
          },
          create: { accountId: data.accountId, ...row },
          update: row,
        });
      }

      for (const order of data.orders) {
        const o = order as {
          externalOrderId: string;
          symbol: string;
          type: string;
          volume: string;
          price: string;
          stopLoss: string | null;
          takeProfit: string | null;
          status: string;
          createdAt: string | null;
          updatedAt: string | null;
        };
        const row = {
          externalOrderId: o.externalOrderId,
          symbol: o.symbol,
          type: o.type,
          volume: new Prisma.Decimal(o.volume),
          price: new Prisma.Decimal(o.price),
          stopLoss: o.stopLoss === null ? null : new Prisma.Decimal(o.stopLoss),
          takeProfit: o.takeProfit === null ? null : new Prisma.Decimal(o.takeProfit),
          status: o.status,
          providerCreatedAt: o.createdAt === null ? null : new Date(o.createdAt),
          providerUpdatedAt: o.updatedAt === null ? null : new Date(o.updatedAt),
          syncedAt: data.snapshot.syncedAt,
        };
        await tx.tradingOrder.upsert({
          where: {
            accountId_externalOrderId: {
              accountId: data.accountId,
              externalOrderId: o.externalOrderId,
            },
          },
          create: { accountId: data.accountId, ...row },
          update: row,
        });
      }

      for (const deal of data.deals) {
        const d = deal as {
          externalDealId: string;
          symbol: string | null;
          side: string;
          volume: string;
          price: string | null;
          profit: string | null;
          commission: string | null;
          swap: string | null;
          positionId: string | null;
          executedAt: Date;
        };
        const row = {
          externalDealId: d.externalDealId,
          symbol: d.symbol,
          side: d.side,
          volume: new Prisma.Decimal(d.volume),
          price: d.price === null ? null : new Prisma.Decimal(d.price),
          profit: d.profit === null ? null : new Prisma.Decimal(d.profit),
          commission: d.commission === null ? null : new Prisma.Decimal(d.commission),
          swap: d.swap === null ? null : new Prisma.Decimal(d.swap),
          positionId: d.positionId,
          executedAt: d.executedAt,
          syncedAt: data.snapshot.syncedAt,
        };
        await tx.tradingDeal.upsert({
          where: {
            accountId_externalDealId: {
              accountId: data.accountId,
              externalDealId: d.externalDealId,
            },
          },
          create: { accountId: data.accountId, ...row },
          update: row,
        });
      }

      await tx.tradingConnection.update({
        where: { accountId: data.accountId },
        data: { lastSyncAt: data.snapshot.syncedAt },
      });
      await tx.tradingSyncRun.update({
        where: { id: data.runId },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          durationMs: data.durationMs,
          errorCode: null,
          positionsUpserted: data.positions.length,
          ordersUpserted: data.orders.length,
          dealsUpserted: data.deals.length,
        },
      });
    });
  }

  async latestSnapshot(accountId: string): Promise<SnapshotRow | null> {
    const row = await this.prisma.tradingAccountSnapshot.findUnique({
      where: { accountId },
    });
    return (row as SnapshotRow) ?? null;
  }

  async listPositions(accountId: string): Promise<PositionRow[]> {
    const rows = await this.prisma.tradingPosition.findMany({
      where: { accountId },
      orderBy: { openedAt: "asc" },
    });
    return rows as PositionRow[];
  }

  async listOrders(accountId: string): Promise<OrderRow[]> {
    const rows = await this.prisma.tradingOrder.findMany({
      where: { accountId },
      orderBy: { providerCreatedAt: "asc" },
    });
    return rows as OrderRow[];
  }

  async listDeals(accountId: string): Promise<DealRow[]> {
    const rows = await this.prisma.tradingDeal.findMany({
      where: { accountId },
      orderBy: { executedAt: "asc" },
    });
    return rows as DealRow[];
  }

  // ── Owned-entity counts (Phase 20 §39) ──────────────────────────────────────

  /**
   * User-scoped counts over the context's OWN tables (accounts, connections'
   * normalized state, sync runs) — the narrow read contract Monitoring
   * consumes (Phase 20 §39: no cross-context Prisma access anywhere else).
   */
  async countUserEntities(userId: string): Promise<{
    accounts: number;
    positions: number;
    orders: number;
    deals: number;
    syncRuns: number;
  }> {
    const [accounts, positions, orders, deals, syncRuns] = await Promise.all([
      this.prisma.tradingAccount.count({ where: { userId } }),
      this.prisma.tradingPosition.count({ where: { account: { userId } } }),
      this.prisma.tradingOrder.count({ where: { account: { userId } } }),
      this.prisma.tradingDeal.count({ where: { account: { userId } } }),
      this.prisma.tradingSyncRun.count({ where: { account: { userId } } }),
    ]);
    return { accounts, positions, orders, deals, syncRuns };
  }
}
