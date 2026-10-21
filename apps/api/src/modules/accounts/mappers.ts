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
  TradingResourceFreshness,
  TradingSynchronizationView,
  TradingSyncRunView,
  TradingAccountSnapshotView,
  SynchronizationStatus,
} from "../../shared/contracts";
import { accountSchema, brokerIdentificationSchema } from "../../shared/contracts";
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

/**
 * Phase 07 — stored connect-time broker identification, re-validated at the
 * read boundary. A stored value that no longer satisfies the shared schema
 * (catalog/schema evolution) degrades to null — never a broken wire shape.
 */
export function toBrokerIdentificationView(
  stored: unknown,
): TradingAccountDetails["brokerIdentification"] {
  if (stored === null || stored === undefined) return null;
  const parsed = brokerIdentificationSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
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
    // Phase 05 — per-segment observation timestamps (the run rows carry
    // them since the Phase 03 migration; the wire exposes them additively).
    snapshotAt: row.snapshotAt ? isoDateTime(row.snapshotAt) : null,
    positionsAt: row.positionsAt ? isoDateTime(row.positionsAt) : null,
    ordersAt: row.ordersAt ? isoDateTime(row.ordersAt) : null,
    dealsAt: row.dealsAt ? isoDateTime(row.dealsAt) : null,
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
 *  - the latest run FAILED         → ERROR (no prior success) / LIVE (recent success)
 *  - the latest run PARTIAL        → DELAYED — partial ≠ success in freshness,
 *    never LIVE until a full run completes (doc B §8.2/§9)
 *  - last success within freshness → LIVE, otherwise STALE
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
  if (latestRun && latestRun.status === "PARTIAL") return "DELAYED";
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

/**
 * Per-RESOURCE freshness rule (Phase 05 §11, documented and explicit):
 *   null timestamp              → NEVER
 *   age ≤ freshnessTtlMs        → FRESH
 *   age > freshnessTtlMs        → STALE
 * The account-level failure/flow semantics (SYNCING/DELAYED/ERROR) stay on
 * the synchronization status axis — a resource is never "FAILED": a failed
 * segment simply never advances its timestamp, so the resource ages into
 * STALE while the status axis carries the failure story.
 */
export function deriveResourceFreshness(
  at: Date | null,
  nowMs: number,
  freshnessTtlMs = 15 * 60 * 1000,
): { at: string | null; state: "FRESH" | "STALE" | "NEVER" } {
  if (at === null) return { at: null, state: "NEVER" };
  return {
    at: isoDateTime(at),
    state: nowMs - at.getTime() <= freshnessTtlMs ? "FRESH" : "STALE",
  };
}

export function toResourceFreshnessView(
  timestamps: {
    snapshotAt: Date | null;
    positionsAt: Date | null;
    ordersAt: Date | null;
    dealsAt: Date | null;
  },
  nowMs: number,
  freshnessTtlMs = 15 * 60 * 1000,
): TradingResourceFreshness {
  return {
    snapshot: deriveResourceFreshness(timestamps.snapshotAt, nowMs, freshnessTtlMs),
    positions: deriveResourceFreshness(timestamps.positionsAt, nowMs, freshnessTtlMs),
    orders: deriveResourceFreshness(timestamps.ordersAt, nowMs, freshnessTtlMs),
    deals: deriveResourceFreshness(timestamps.dealsAt, nowMs, freshnessTtlMs),
  };
}

/** Full details view — identity + connection + synchronization + snapshot. */
export function toAccountDetails(input: {
  account: TradingAccountRow;
  descriptor: TradingProviderDescriptor;
  connection: TradingConnectionRow | null;
  snapshot: SnapshotRow | null;
  latestRun: SyncRunRow | null;
  /** Phase 05 — per-resource last successful refresh timestamps. */
  resourceTimestamps: {
    snapshotAt: Date | null;
    positionsAt: Date | null;
    ordersAt: Date | null;
    dealsAt: Date | null;
  };
  nowMs: number;
}): TradingAccountDetails {
  const { account, descriptor, connection, snapshot, latestRun, resourceTimestamps, nowMs } = input;
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
    brokerIdentification: toBrokerIdentificationView(account.brokerIdentity),
    connection: connectionView,
    synchronization: {
      ...toSynchronizationView(connection?.lastSyncAt ?? null, latestRun, nowMs),
      resources: toResourceFreshnessView(resourceTimestamps, nowMs),
    },
    snapshot: toSnapshotView(snapshot),
    createdAt: isoDateTime(account.createdAt),
    updatedAt: isoDateTime(account.updatedAt),
  };
}
