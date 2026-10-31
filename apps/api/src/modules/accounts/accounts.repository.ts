/**
 * Accounts data access (infrastructure) - Phase 3.
 *
 * The ONLY place in the accounts context that touches Prisma. All methods
 * return narrow row projections - no Prisma type crosses into services or
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
  /** Canonical broker identity for duplicate scoping on shared connectors. */
  brokerId: string;
  /** Phase 07 - connect-time broker identification snapshot (JSONB, schema-validated on read). */
  brokerIdentity: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradingConnectionRow {
  id: string;
  accountId: string;
  providerId: string;
  /** User-selected broker expectation for shared connectors, nullable for generic/API connections. */
  expectedBrokerId: string | null;
  method: string;
  status: string;
  credentialsEnc: string;
  credentialsHint: string;
  permissions: string[];
  lastError: string | null;
  lastConnectedAt: Date | null;
  lastSyncAt: Date | null;
  /** Phase 05 - provider-issued incremental deals checkpoint (opaque). */
  dealsCheckpoint: string | null;
  /** Phase 08 - public bridge routing key (PLATFORM_BRIDGE only, else null). */
  bridgeKeyId: string | null;
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
  /** Provider-side position this deal belongs to (Phase 4 §9) - nullable. */
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
  // ── Per-segment observation timestamps (Phase 03 migration) ──
  snapshotAt: Date | null;
  positionsAt: Date | null;
  ordersAt: Date | null;
  dealsAt: Date | null;
  /** Phase 05 - deals checkpoint progress after this run (§10). */
  dealsCheckpoint: string | null;
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

  /** Ownership check is part of the lookup - foreign ids are simply not found (IDOR → 404). */
  async findAccountForUser(accountId: string, userId: string): Promise<TradingAccountRow | null> {
    const row = await this.prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
    });
    return (row as TradingAccountRow) ?? null;
  }

  /**
   * Account row by id WITHOUT a user scope - the scheduler's internal path
   * (Phase 05 §9). The scheduler never receives client input: it iterates
   * connection rows loaded server-side, and the sync service re-derives the
   * owner from the row for events/logs. Not exposed to any controller.
   */
  async findAccountById(accountId: string): Promise<TradingAccountRow | null> {
    const row = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
    });
    return (row as TradingAccountRow) ?? null;
  }

  /** Journal-side label rename - ownership stays in the WHERE (IDOR-safe). */
  async renameAccount(accountId: string, userId: string, name: string): Promise<void> {
    await this.prisma.tradingAccount.updateMany({
      where: { id: accountId, userId },
      data: { name },
    });
  }

  async countAccountsByUser(userId: string): Promise<number> {
    return this.prisma.tradingAccount.count({ where: { userId } });
  }

  /**
   * Narrow read contract (ADR-0003): the user's default account id - the
   * persisted default first, else the oldest account (same ordering as
   * listAccountsByUser). Consumers (e.g. the Trades import path) must come
   * here instead of touching prisma.tradingAccount themselves.
   */
  async findDefaultAccountIdForUser(userId: string): Promise<string | null> {
    const row = await this.prisma.tradingAccount.findFirst({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findAccountByExternal(
    userId: string,
    providerId: string,
    externalAccountId: string,
    brokerId?: string,
  ): Promise<TradingAccountRow | null> {
    // Shared connectors such as MT5 Bridge scope the login to the selected
    // broker. Callers without a broker hint retain the legacy "any match"
    // behavior (used by direct, broker-specific API adapters).
    const row = brokerId !== undefined
      ? await this.prisma.tradingAccount.findUnique({
          where: {
            userId_providerId_externalAccountId_brokerId: {
              userId,
              providerId,
              externalAccountId,
              brokerId,
            },
          },
        })
      : await this.prisma.tradingAccount.findFirst({
          where: { userId, providerId, externalAccountId },
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
      /** Canonical broker identity, "unknown" until identified for generic bridge accounts. */
      brokerId?: string;
      /** Phase 07 - connect-time broker identification snapshot (already schema-validated upstream). */
      brokerIdentity?: unknown;
    };
    connection: {
      method: string;
      credentialsEnc: string;
      credentialsHint: string;
      permissions: string[];
      lastConnectedAt: Date;
      /** Optional broker expectation selected in the shared connector catalog. */
      expectedBrokerId?: string | null;
      /** Phase 08 - PLATFORM_BRIDGE connections boot as CONNECTING (awaiting first push). */
      status?: string;
      bridgeKeyId?: string | null;
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
          brokerId: data.account.brokerId ?? "unknown",
          ...(data.account.brokerIdentity !== undefined
            ? { brokerIdentity: data.account.brokerIdentity as Prisma.InputJsonValue }
            : {}),
          providerId: data.account.providerId,
        },
      });
      const connection = await tx.tradingConnection.create({
        data: {
          accountId: account.id,
          providerId: data.account.providerId,
          expectedBrokerId: data.connection.expectedBrokerId ?? null,
          method: data.connection.method,
          credentialsEnc: data.connection.credentialsEnc,
          credentialsHint: data.connection.credentialsHint,
          permissions: data.connection.permissions,
          status: data.connection.status ?? "CONNECTED",
          lastConnectedAt: data.connection.lastConnectedAt,
          lastSyncAt: null,
          lastError: null,
          ...(data.connection.bridgeKeyId !== undefined
            ? { bridgeKeyId: data.connection.bridgeKeyId }
            : {}),
        },
      });
      return [account, connection] as const;
    });
    return {
      account: account as TradingAccountRow,
      connection: connection as TradingConnectionRow,
    };
  }

  /** Reconnect with fresh credentials - status back to CONNECTED. */
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
   * synchronized history stay. Journal data is untouched. The bridge routing
   * key is destroyed WITH the credentials - a reconnected bridge pairs anew.
   */
  async disconnectConnection(accountId: string): Promise<TradingConnectionRow> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.tradingConnection.findUnique({
        where: { accountId },
        select: { bridgeKeyId: true },
      });
      const row = await tx.tradingConnection.update({
        where: { accountId },
        data: {
          status: "DISCONNECTED",
          credentialsEnc: "",
          credentialsHint: "",
          bridgeKeyId: null,
          lastError: null,
        },
      });
      // The event rows are a bounded raw-payload cache/idempotency ledger,
      // not canonical history. Normalized positions/deals/trades are kept;
      // raw events for a revoked key are no longer needed or readable.
      if (current?.bridgeKeyId) {
        await tx.tradingBridgeEvent.deleteMany({
          where: { bridgeKeyId: current.bridgeKeyId },
        });
      }
      return row as TradingConnectionRow;
    });
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

  // ── Phase 08 - MT5 terminal bridge ─────────────────────────────────────────

  /** Ingest-side lookup: the routing key IS the credential envelope locator. */
  async findConnectionByBridgeKeyId(bridgeKeyId: string): Promise<TradingConnectionRow | null> {
    const row = await this.prisma.tradingConnection.findUnique({
      where: { bridgeKeyId },
    });
    return (row as TradingConnectionRow) ?? null;
  }

  /**
   * Rotate the routing key and encrypted secret in ONE atomic row update.
   * Never split these values across writes: a failure between two updates
   * would invalidate the old pairing without installing a usable new one.
   */
  async rotateBridgeCredentials(
    accountId: string,
    data: { bridgeKeyId: string; credentialsEnc: string; credentialsHint: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.tradingConnection.findUnique({
        where: { accountId },
        select: { bridgeKeyId: true },
      });
      await tx.tradingConnection.update({
        where: { accountId },
        data: {
          bridgeKeyId: data.bridgeKeyId,
          credentialsEnc: data.credentialsEnc,
          credentialsHint: data.credentialsHint,
          // Rotation invalidates the old terminal pairing. Require a fresh
          // authenticated push before presenting the bridge as connected.
          status: "CONNECTING",
          lastError: null,
        },
      });
      // Old payloads belong to the revoked key; normalized journal history is
      // stored separately and remains intact.
      if (current?.bridgeKeyId && current.bridgeKeyId !== data.bridgeKeyId) {
        await tx.tradingBridgeEvent.deleteMany({
          where: { bridgeKeyId: current.bridgeKeyId },
        });
      }
    });
  }

  /**
   * Atomically accept one authenticated bridge event while proving that its
   * key is still active. This closes a disconnect/rotation race between the
   * initial HMAC lookup and event persistence. The conditional connection
   * update locks the row; a revoked key cannot reactivate the connection or
   * append orphaned events after disconnect.
   */
  async acceptBridgeEvent(data: {
    bridgeKeyId: string;
    eventId: string;
    kind: string;
    payload: unknown;
    identifiedBrokerId?: string;
  }): Promise<{
    accepted: boolean;
    duplicate: boolean;
    activated: boolean;
    reason?: "INACTIVE" | "BROKER_DUPLICATE" | "BROKER_MISMATCH";
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Touch the active row first to serialize this acceptance attempt
        // with disconnect/rotation while keeping CONNECTING unchanged until
        // every business invariant below has passed.
        const locked = await tx.tradingConnection.updateMany({
          where: {
            bridgeKeyId: data.bridgeKeyId,
            method: "PLATFORM_BRIDGE",
            status: { in: ["CONNECTING", "CONNECTED"] },
            credentialsEnc: { not: "" },
          },
          data: { lastError: null },
        });
        if (locked.count !== 1) {
          return { accepted: false, duplicate: false, activated: false, reason: "INACTIVE" as const };
        }

        const connection = await tx.tradingConnection.findUnique({
          where: { bridgeKeyId: data.bridgeKeyId },
          select: { accountId: true, status: true },
        });
        if (!connection) {
          return { accepted: false, duplicate: false, activated: false, reason: "INACTIVE" as const };
        }

        if (data.identifiedBrokerId) {
          const account = await tx.tradingAccount.findUnique({
            where: { id: connection.accountId },
            select: { id: true, userId: true, providerId: true, externalAccountId: true, brokerId: true },
          });
          if (!account) {
            return { accepted: false, duplicate: false, activated: false, reason: "INACTIVE" as const };
          }
          if (account.brokerId !== "unknown" && account.brokerId !== data.identifiedBrokerId) {
            return { accepted: false, duplicate: false, activated: false, reason: "BROKER_MISMATCH" as const };
          }

          const duplicateAccount = await tx.tradingAccount.findFirst({
            where: {
              userId: account.userId,
              providerId: account.providerId,
              externalAccountId: account.externalAccountId,
              brokerId: data.identifiedBrokerId,
              id: { not: account.id },
            },
            select: { id: true },
          });
          if (duplicateAccount) {
            return { accepted: false, duplicate: false, activated: false, reason: "BROKER_DUPLICATE" as const };
          }
          if (account.brokerId !== data.identifiedBrokerId) {
            await tx.tradingAccount.update({
              where: { id: account.id },
              data: { brokerId: data.identifiedBrokerId },
            });
          }
        }

        const activated = connection.status === "CONNECTING";
        if (activated) {
          await tx.tradingConnection.update({
            where: { bridgeKeyId: data.bridgeKeyId },
            data: { status: "CONNECTED", lastConnectedAt: new Date(), lastError: null },
          });
        }

        // PostgreSQL ON CONFLICT DO NOTHING preserves idempotency without
        // aborting the surrounding transaction on a replay.
        const inserted = await tx.tradingBridgeEvent.createMany({
          data: [{
            bridgeKeyId: data.bridgeKeyId,
            eventId: data.eventId,
            kind: data.kind,
            payload: data.payload as Prisma.InputJsonValue,
          }],
          skipDuplicates: true,
        });
        return {
          accepted: true,
          duplicate: inserted.count === 0,
          activated,
        };
      });
    } catch (error) {
      // A concurrent generic bridge pairing may race to claim the same
      // (user, provider, login, broker) compound key. The DB unique index is
      // the final arbiter; the transaction rolls back activation/event data.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        String(error.meta?.target ?? "").includes("brokerId")
      ) {
        return { accepted: false, duplicate: false, activated: false, reason: "BROKER_DUPLICATE" };
      }
      throw error;
    }
  }

  /** The pull-adapter's data source: latest cached event of one kind. */
  async latestBridgeEvent(
    bridgeKeyId: string,
    kind: string,
  ): Promise<{ payload: unknown; receivedAt: Date } | null> {
    const row = await this.prisma.tradingBridgeEvent.findFirst({
      where: { bridgeKeyId, kind },
      orderBy: { receivedAt: "desc" },
      select: { payload: true, receivedAt: true },
    });
    return row ?? null;
  }

  /** ACCOUNT_INFO pushes refresh the journal anchor facts (currency + identity). */
  async setBridgeAccountIdentity(
    accountId: string,
    data: { currency?: string; brokerId?: string; brokerIdentity?: unknown },
  ): Promise<void> {
    await this.prisma.tradingAccount.update({
      where: { id: accountId },
      data: {
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.brokerId ? { brokerId: data.brokerId } : {}),
        ...(data.brokerIdentity !== undefined
          ? { brokerIdentity: data.brokerIdentity as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /** Bounded log: the adapter only ever reads the LATEST event per kind. */
  async pruneBridgeEvents(bridgeKeyId: string, keepPerKind = 50): Promise<void> {
    const kinds = ["ACCOUNT_INFO", "SNAPSHOT", "POSITIONS", "ORDERS", "DEALS"];
    for (const kind of kinds) {
      const keep = await this.prisma.tradingBridgeEvent.findMany({
        where: { bridgeKeyId, kind },
        orderBy: { receivedAt: "desc" },
        take: keepPerKind,
        select: { id: true },
      });
      await this.prisma.tradingBridgeEvent.deleteMany({
        where: {
          bridgeKeyId,
          kind,
          id: { notIn: keep.map((row) => row.id) },
        },
      });
    }
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
   * Bounded synchronization history for one account (Phase 05 §16) -
   * keyset-paginated, newest first. `before` (exclusive startedAt upper
   * bound) is the previous page's nextCursor.
   */
  async listSyncRuns(
    accountId: string,
    opts: { take: number; before: Date | null },
  ): Promise<SyncRunRow[]> {
    const rows = await this.prisma.tradingSyncRun.findMany({
      where: {
        accountId,
        ...(opts.before === null ? {} : { startedAt: { lt: opts.before } }),
      },
      orderBy: { startedAt: "desc" },
      take: opts.take,
    });
    return rows as SyncRunRow[];
  }

  /**
   * Stale-run recovery (Phase 05, spec §15 "safe restart after process
   * termination"): a run left RUNNING by a crashed/restarted process would
   * otherwise hold the per-account single-RUNNING invariant (partial unique
   * index) FOREVER, blocking manual and scheduled synchronization. Runs that
   * are still RUNNING after `staleBefore` cannot be alive (the orchestrator
   * watchdog bounds every segment) - they are marked CANCELLED, the honest
   * representation of "never completed, not a provider result".
   */
  async cancelStaleRunningRuns(staleBefore: Date): Promise<number> {
    const result = await this.prisma.tradingSyncRun.updateMany({
      where: { status: "RUNNING", startedAt: { lt: staleBefore } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Connections ELIGIBLE for scheduled synchronization (Phase 05 §9.1):
   * CONNECTED lifecycle AND non-wiped credentials. Disconnected/revoked
   * connections are never scheduled; auth-class ERROR connections are
   * reconnected manually (retrying broken credentials on a timer would
   * hammer the provider with guaranteed failures).
   */
  async listSchedulableConnections(): Promise<TradingConnectionRow[]> {
    const rows = await this.prisma.tradingConnection.findMany({
      where: { status: "CONNECTED", credentialsEnc: { not: "" } },
    });
    return rows as TradingConnectionRow[];
  }

  /**
   * Recent sync runs across ALL of the user's accounts - the canonical
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
   * Phase 03 (doc B §8.2): per-SEGMENT persistence. Each segment commits in
   * its own transaction - a failing deals segment must not roll back already
   * persisted positions (PARTIAL runs keep what persisted). Segment presence
   * is recorded on the run (segment observation timestamps): a null segment
   * timestamp = not persisted (failed or skipped), which counts alone cannot
   * express (0 legitimately persisted rows ≡ 0-persisted-by-failure).
   * connection.lastSyncAt advances ONLY when the snapshot segment persisted
   * - the freshness axis is snapshot-anchored (doc B §9); the activity
   * segments carry their own per-row syncedAt provenance.
   */

  async persistSnapshotSegment(data: {
    runId: string;
    accountId: string;
    currency: string;
    snapshot: {
      balance: string | null;
      equity: string | null;
      unrealizedPnl: string | null;
      margin: string | null;
      freeMargin: string | null;
      marginLevel: string | null;
      syncedAt: Date;
    };
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
      await tx.tradingConnection.update({
        where: { accountId: data.accountId },
        data: { lastSyncAt: data.snapshot.syncedAt },
      });
      await tx.tradingSyncRun.update({
        where: { id: data.runId },
        data: { snapshotAt: data.snapshot.syncedAt },
      });
    });
  }

  async persistPositionsSegment(data: {
    runId: string;
    accountId: string;
    positions: Array<Record<string, unknown>>;
    syncedAt: Date;
    /** Phase 05 reconciliation: non-null ONLY when the adapter confirmed a
     * complete open set (§13.2) - ids absent from the list are CLOSED in the
     * SAME transaction (atomic with the upserts; no observer can see a
     * persisted-but-unreconciled state). Rows are never deleted. */
    completeExternalIds?: string[] | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
          syncedAt: data.syncedAt,
          // The provider reports this position as open NOW - a previously
          // CLOSED row reopens (a re-reported external id is a provider fact,
          // not a duplicate; the closure observation is superseded).
          state: "OPEN",
          closedAt: null,
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
      // Closure reconciliation (§13.2): only on a demonstrably complete,
      // untruncated, successful open-position response. Absent = closed at
      // OBSERVATION time; the row (history) is preserved, never deleted.
      if (data.completeExternalIds !== null && data.completeExternalIds !== undefined) {
        await tx.tradingPosition.updateMany({
          where: {
            accountId: data.accountId,
            state: "OPEN",
            externalPositionId: { notIn: data.completeExternalIds },
          },
          data: { state: "CLOSED", closedAt: data.syncedAt },
        });
      }
      await tx.tradingSyncRun.update({
        where: { id: data.runId },
        data: { positionsAt: data.syncedAt, positionsUpserted: data.positions.length },
      });
    });
  }

  async persistOrdersSegment(data: {
    runId: string;
    accountId: string;
    orders: Array<Record<string, unknown>>;
    syncedAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
          syncedAt: data.syncedAt,
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
      await tx.tradingSyncRun.update({
        where: { id: data.runId },
        data: { ordersAt: data.syncedAt, ordersUpserted: data.orders.length },
      });
    });
  }

  async persistDealsSegment(data: {
    runId: string;
    accountId: string;
    deals: Array<Record<string, unknown>>;
    syncedAt: Date;
    /** Phase 05 checkpoint (§8.4): a string = everything ≤ that provider id
     * was observed AND is persisted by THIS transaction - advance both the
     * run's progress record and the connection's live checkpoint atomically.
     * undefined/null = nothing observed → the existing checkpoint is NEVER
     * moved backward or wiped. */
    checkpoint?: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
          syncedAt: data.syncedAt,
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
      if (typeof data.checkpoint === "string" && data.checkpoint.length > 0) {
        await tx.tradingConnection.update({
          where: { accountId: data.accountId },
          data: { dealsCheckpoint: data.checkpoint },
        });
      }
      await tx.tradingSyncRun.update({
        where: { id: data.runId },
        data: {
          dealsAt: data.syncedAt,
          dealsUpserted: data.deals.length,
          ...(typeof data.checkpoint === "string" && data.checkpoint.length > 0
            ? { dealsCheckpoint: data.checkpoint }
            : {}),
        },
      });
    });
  }

  /**
   * Close the run with its final status (COMPLETED or PARTIAL - the FAILED
   * path stays failSyncRun). errorCode records the FIRST failing segment's
   * code for PARTIAL runs (doc B §8.2); null for full success.
   */
  async finalizeSyncRun(data: {
    runId: string;
    status: "COMPLETED" | "PARTIAL";
    errorCode: string | null;
    durationMs: number;
  }): Promise<void> {
    await this.prisma.tradingSyncRun.update({
      where: { id: data.runId },
      data: {
        status: data.status,
        finishedAt: new Date(),
        durationMs: data.durationMs,
        errorCode: data.errorCode,
      },
    });
  }

  async latestSnapshot(accountId: string): Promise<SnapshotRow | null> {
    const row = await this.prisma.tradingAccountSnapshot.findUnique({
      where: { accountId },
    });
    return (row as SnapshotRow) ?? null;
  }

  /**
   * Per-RESOURCE last successful refresh timestamps (Phase 05 §11) - the
   * max over the account's runs of each segment's observation timestamp
   * (null = that resource never persisted). ONE aggregate query; a failed
   * or skipped segment never backdates a resource.
   */
  async latestResourceTimestamps(accountId: string): Promise<{
    snapshotAt: Date | null;
    positionsAt: Date | null;
    ordersAt: Date | null;
    dealsAt: Date | null;
  }> {
    const agg = await this.prisma.tradingSyncRun.aggregate({
      where: { accountId },
      _max: { snapshotAt: true, positionsAt: true, ordersAt: true, dealsAt: true },
    });
    return {
      snapshotAt: agg._max.snapshotAt ?? null,
      positionsAt: agg._max.positionsAt ?? null,
      ordersAt: agg._max.ordersAt ?? null,
      dealsAt: agg._max.dealsAt ?? null,
    };
  }

  /**
   * CURRENT open positions (Phase 05): rows the provider's latest complete
   * response still reports as open. CLOSED rows are reconciliation history
   * - preserved (§6.4) but not "current positions"; they never appear in
   * this listing (the resource means OPEN, per the provider semantics).
   */
  async listPositions(accountId: string): Promise<PositionRow[]> {
    const rows = await this.prisma.tradingPosition.findMany({
      where: { accountId, state: "OPEN" },
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
   * normalized state, sync runs) - the narrow read contract Monitoring
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
