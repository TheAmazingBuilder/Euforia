/**
 * Accounts contract mappers — rows → shared-schema-shaped payloads.
 * The ONLY place that translates persistence shapes into wire shapes.
 * Credentials NEVER appear here: connections map to views with a masked
 * hint only (§22/§23).
 */
import { Prisma } from "@prisma/client";
import type {
  TradingAccountDetails,
  TradingConnectionView,
  TradingProviderDescriptor,
  TradingSynchronizationView,
  TradingSyncRunView,
  TradingAccountSnapshotView,
  SynchronizationStatus,
} from "../../shared/contracts";
import { accountSchema } from "../../shared/contracts";
import type { z } from "zod";
import type {
  SnapshotRow,
  SyncRunRow,
  TradingAccountRow,
  TradingConnectionRow,
} from "./accounts.repository";

/** Decimal → decimal-string without exponent notation (shared wire format). */
function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed();
}

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
export function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Journal account identity (shared accountSchema) — the exact contract the
 * existing frontend consumes via GET /accounts. `propConfig` is journal
 * domain data (null until a journal phase populates it).
 */
export function toJournalAccount(row: TradingAccountRow): z.infer<typeof accountSchema> {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as z.infer<typeof accountSchema>["type"],
    broker: row.broker as z.infer<typeof accountSchema>["broker"],
    currency: row.currency as z.infer<typeof accountSchema>["currency"],
    startingBalance: row.startingBalance.toFixed(),
    isDefault: row.isDefault,
    propConfig: (row.propConfig ?? null) as z.infer<typeof accountSchema>["propConfig"],
    createdAt: isoDateTime(row.createdAt),
  };
}

export function toSyncRunView(row: SyncRunRow): TradingSyncRunView {
  return {
    id: row.id,
    status: row.status as TradingSyncRunView["status"],
    trigger: row.trigger as TradingSyncRunView["trigger"],
    startedAt: isoDateTime(row.startedAt),
    finishedAt: row.finishedAt ? isoDateTime(row.finishedAt) : null,
    durationMs: row.durationMs,
    positionsUpserted: row.positionsUpserted,
    ordersUpserted: row.ordersUpserted,
    dealsUpserted: row.dealsUpserted,
    errorCode: row.errorCode,
  };
}

export function toSynchronizationView(
  lastSyncAt: Date | null,
  latestRun: SyncRunRow | null,
  nowMs: number,
): TradingSynchronizationView {
  return {
    status: deriveSynchronizationStatus(lastSyncAt, latestRun, nowMs),
    lastSyncAt: lastSyncAt ? isoDateTime(lastSyncAt) : null,
    lastRun: latestRun ? toSyncRunView(latestRun) : null,
  };
}

/**
 * Derive the synchronization status (§15) from observable facts:
 *  - never synchronized            → UNKNOWN
 *  - a run is RUNNING              → SYNCING
 *  - the latest run FAILED         → ERROR
 *  - last success within freshness → LIVE, otherwise STALE
 * DELAYED is reserved for future per-object freshness granularity.
 * Connection state does NOT alter this axis (orthogonal lifecycles).
 */
export function deriveSynchronizationStatus(
  lastSyncAt: Date | null,
  latestRun: SyncRunRow | null,
  nowMs: number,
  freshnessTtlMs = 15 * 60 * 1000,
): SynchronizationStatus {
  if (latestRun && latestRun.status === "RUNNING") return "SYNCING";
  if (latestRun && latestRun.status === "FAILED" && !lastSyncAt) return "ERROR";
  if (!lastSyncAt) return "UNKNOWN";
  if (latestRun && latestRun.status === "FAILED" && nowMs - lastSyncAt.getTime() <= freshnessTtlMs) {
    // Recent failure AFTER a recent success — the last good state is still fresh.
    return "LIVE";
  }
  return nowMs - lastSyncAt.getTime() <= freshnessTtlMs ? "LIVE" : "STALE";
}

export function toSnapshotView(row: SnapshotRow | null): TradingAccountSnapshotView | null {
  if (!row) return null;
  return {
    balance: decimalString(row.balance),
    equity: decimalString(row.equity),
    unrealizedPnl: decimalString(row.unrealizedPnl),
    margin: decimalString(row.margin),
    freeMargin: decimalString(row.freeMargin),
    marginLevel: decimalString(row.marginLevel),
    currency: row.currency as TradingAccountSnapshotView["currency"],
    syncedAt: isoDateTime(row.syncedAt),
  };
}

/** Full details view — identity + connection + synchronization + snapshot. */
export function toAccountDetails(input: {
  account: TradingAccountRow;
  descriptor: TradingProviderDescriptor;
  connection: TradingConnectionRow | null;
  snapshot: SnapshotRow | null;
  latestRun: SyncRunRow | null;
  nowMs: number;
}): TradingAccountDetails {
  const { account, descriptor, connection, snapshot, latestRun, nowMs } = input;
  const connectionView = connection
    ? ({
        status: connection.status as TradingConnectionView["status"],
        method: connection.method as TradingConnectionView["method"],
        permissions: connection.permissions as TradingConnectionView["permissions"],
        credentialsHint: connection.credentialsHint,
        lastConnectedAt: connection.lastConnectedAt
          ? isoDateTime(connection.lastConnectedAt)
          : null,
        lastSyncAt: connection.lastSyncAt ? isoDateTime(connection.lastSyncAt) : null,
        lastError: connection.lastError,
      } satisfies TradingConnectionView)
    : null;
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    type: account.type as TradingAccountDetails["type"],
    broker: account.broker as TradingAccountDetails["broker"],
    currency: account.currency as TradingAccountDetails["currency"],
    startingBalance: account.startingBalance.toFixed(),
    isDefault: account.isDefault,
    propConfig: (account.propConfig ?? null) as TradingAccountDetails["propConfig"],
    externalAccountId: account.externalAccountId,
    provider: descriptor,
    connection: connectionView,
    synchronization: toSynchronizationView(connection?.lastSyncAt ?? null, latestRun, nowMs),
    snapshot: toSnapshotView(snapshot),
    createdAt: isoDateTime(account.createdAt),
    updatedAt: isoDateTime(account.updatedAt),
  };
}
