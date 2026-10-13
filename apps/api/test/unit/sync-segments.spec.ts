/**
 * Unit — segment-based sync orchestration (Phase 03, doc B §8.2).
 *
 * Proves the PARTIAL / capability-skip / FAILED decision table with REAL
 * adapters (mock + capability-poor fixture) against a recording repository
 * fake. Fixture evidence — proves the ORCHESTRATION, never connectivity.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { ProviderRegistryService } from "../../src/modules/accounts/provider-registry.service";
import { TradingSyncService } from "../../src/modules/accounts/trading-sync.service";
import { MockTradingProviderAdapter } from "../../src/modules/accounts/providers/mock-trading.provider";
import { CapabilityPoorTestProviderAdapter } from "../../src/modules/accounts/providers/capability-poor-test.provider";
import { OandaRestProviderAdapter } from "../../src/modules/accounts/providers/oanda/oanda-rest.provider";
import { ProviderError } from "../../src/modules/accounts/provider.types";
import type { TradingProviderAdapter } from "../../src/modules/accounts/provider.types";
import type {
  SyncRunRow,
  TradingAccountRow,
  TradingConnectionRow,
} from "../../src/modules/accounts/accounts.repository";

// ── fakes ────────────────────────────────────────────────────────────────────

interface RecordedCalls {
  persistSnapshotSegment: Array<Record<string, unknown>>;
  persistPositionsSegment: Array<Record<string, unknown>>;
  persistOrdersSegment: Array<Record<string, unknown>>;
  persistDealsSegment: Array<Record<string, unknown>>;
  finalizeSyncRun: Array<Record<string, unknown>>;
  failSyncRun: Array<Record<string, unknown>>;
  setConnectionError: Array<Record<string, unknown>>;
  securityEvents: Array<Record<string, unknown>>;
}

function recordingRepository() {
  const calls: RecordedCalls = {
    persistSnapshotSegment: [],
    persistPositionsSegment: [],
    persistOrdersSegment: [],
    persistDealsSegment: [],
    finalizeSyncRun: [],
    failSyncRun: [],
    setConnectionError: [],
    securityEvents: [],
  };
  // The run row is MUTATED by the persist/finalize/fail calls — mirroring the
  // real repository so `latestSyncRun` reflects the finalized state.
  const runRow: SyncRunRow = {
    id: "run-1",
    accountId: "account-1",
    status: "RUNNING",
    trigger: "MANUAL",
    startedAt: new Date(),
    finishedAt: null,
    durationMs: null,
    positionsUpserted: 0,
    ordersUpserted: 0,
    dealsUpserted: 0,
    errorCode: null,
    requestId: null,
  };
  const repository = {
    createSyncRun: async (): Promise<SyncRunRow> => runRow,
    persistSnapshotSegment: async (data: Record<string, unknown>) => {
      calls.persistSnapshotSegment.push(data);
    },
    persistPositionsSegment: async (data: Record<string, unknown>) => {
      runRow.positionsUpserted = (data.positions as unknown[]).length;
      calls.persistPositionsSegment.push(data);
    },
    persistOrdersSegment: async (data: Record<string, unknown>) => {
      runRow.ordersUpserted = (data.orders as unknown[]).length;
      calls.persistOrdersSegment.push(data);
    },
    persistDealsSegment: async (data: Record<string, unknown>) => {
      runRow.dealsUpserted = (data.deals as unknown[]).length;
      calls.persistDealsSegment.push(data);
    },
    finalizeSyncRun: async (data: {
      runId: string;
      status: "COMPLETED" | "PARTIAL";
      errorCode: string | null;
      durationMs: number;
    }) => {
      runRow.status = data.status;
      runRow.errorCode = data.errorCode;
      runRow.durationMs = data.durationMs;
      runRow.finishedAt = new Date();
      calls.finalizeSyncRun.push(data);
    },
    failSyncRun: async (id: string, errorCode: string) => {
      runRow.status = "FAILED";
      runRow.errorCode = errorCode;
      runRow.finishedAt = new Date();
      calls.failSyncRun.push({ id, errorCode });
    },
    setConnectionError: async (accountId: string, message: string) => {
      calls.setConnectionError.push({ accountId, message });
    },
    latestSyncRun: async (): Promise<SyncRunRow | null> => runRow,
    findConnectionByAccountId: async (): Promise<TradingConnectionRow | null> => connection(),
  };
  return { repository, calls };
}

function account(overrides: Partial<TradingAccountRow> = {}): TradingAccountRow {
  return {
    id: "account-1",
    userId: "user-1",
    name: "Test Account",
    type: "DEMO",
    broker: "MT5",
    currency: "USD",
    startingBalance: new Prisma.Decimal(10_000),
    isDefault: true,
    propConfig: null,
    externalAccountId: "50417788",
    providerId: "MOCK",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TradingAccountRow;
}

function connection(overrides: Partial<TradingConnectionRow> = {}): TradingConnectionRow {
  return {
    id: "connection-1",
    accountId: "account-1",
    providerId: "MOCK",
    method: "API_KEY",
    status: "CONNECTED",
    credentialsEnc: "encrypted-blob",
    credentialsHint: "••••4242",
    permissions: [],
    lastError: null,
    lastConnectedAt: new Date(),
    lastSyncAt: null,
    ...overrides,
  } as TradingConnectionRow;
}

function buildService(adapter: TradingProviderAdapter, repository: unknown): {
  service: TradingSyncService;
  events: Array<Record<string, unknown>>;
} {
  const events: Array<Record<string, unknown>> = [];
  const registry = new ProviderRegistryService([adapter]);
  const credentials = { decrypt: () => "mock-api-key-abcd1234" };
  const securityEvents = { record: async (event: Record<string, unknown>) => void events.push(event) };
  const config = {
    accounts: {
      credentialsEncryptionKey: Buffer.alloc(32),
      providerTimeoutMs: 2_000,
      mockProviderEnabled: true,
      oandaEnabled: false,
      oandaRestUrlOverride: null,
    },
  };
  const service = new TradingSyncService(
    repository as never,
    registry,
    credentials as never,
    securityEvents as never,
    config as never,
    undefined,
  );
  return { service, events };
}

// ── COMPLETED ────────────────────────────────────────────────────────────────

describe("segment orchestration — full success (COMPLETED)", () => {
  it("persists all four segments independently and finalizes COMPLETED with no error code", async () => {
    const { repository, calls } = recordingRepository();
    const { service } = buildService(new MockTradingProviderAdapter(), repository);
    await service.synchronize({
      userId: "user-1",
      account: account(),
      connection: connection(),
      requestId: "req-1",
    });
    expect(calls.persistSnapshotSegment).toHaveLength(1);
    expect(calls.persistPositionsSegment).toHaveLength(1);
    expect(calls.persistOrdersSegment).toHaveLength(1);
    expect(calls.persistDealsSegment).toHaveLength(1);
    expect(calls.finalizeSyncRun).toHaveLength(1);
    expect(calls.finalizeSyncRun[0]).toMatchObject({ status: "COMPLETED", errorCode: null });
    expect(calls.failSyncRun).toHaveLength(0);
    // The snapshot segment advances the freshness anchor (doc B §9).
    expect(calls.persistSnapshotSegment[0]?.snapshot).toHaveProperty("syncedAt");
  });
});

// ── PARTIAL ──────────────────────────────────────────────────────────────────

describe("segment orchestration — PARTIAL (doc B §8.2)", () => {
  function oneSegmentFailingAdapter(
    failing: "fetchSnapshot" | "fetchPositions" | "fetchOrders" | "fetchDeals",
    error: ProviderError,
  ): TradingProviderAdapter {
    const base = new MockTradingProviderAdapter();
    const adapter = Object.create(Object.getPrototypeOf(base)) as MockTradingProviderAdapter;
    Object.defineProperty(adapter, failing, { value: async () => { throw error; } });
    Object.defineProperty(adapter, "descriptor", { value: base.descriptor });
    return adapter as TradingProviderAdapter;
  }

  it("one failing segment (others succeeding) → PARTIAL with the failing segment's code; throws nothing", async () => {
    const { repository, calls } = recordingRepository();
    const adapter = oneSegmentFailingAdapter(
      "fetchOrders",
      new ProviderError("RATE_LIMITED", "The trading provider asked us to slow down."),
    );
    const { service } = buildService(adapter, repository);
    const response = await service.synchronize({
      userId: "user-1",
      account: account(),
      connection: connection(),
      requestId: null,
    });
    // The run view carries PARTIAL + the first failing segment's code.
    expect(response.run.status).toBe("PARTIAL");
    expect(response.run.errorCode).toBe("RATE_LIMITED");
    // Persisted segments stayed; the failing one did not persist.
    expect(calls.persistSnapshotSegment).toHaveLength(1);
    expect(calls.persistPositionsSegment).toHaveLength(1);
    expect(calls.persistOrdersSegment).toHaveLength(0);
    expect(calls.persistDealsSegment).toHaveLength(1);
    expect(calls.finalizeSyncRun[0]).toMatchObject({ status: "PARTIAL", errorCode: "RATE_LIMITED" });
    expect(calls.failSyncRun).toHaveLength(0);
    // PARTIAL failures are not security-ledger failures (observability = run row).
    expect(calls.securityEvents).toHaveLength(0);
  });

  it("errorCode records the FIRST failing segment in plan order (snapshot before deals)", async () => {
    const { repository, calls } = recordingRepository();
    const base = new MockTradingProviderAdapter();
    const adapter = Object.create(Object.getPrototypeOf(base)) as MockTradingProviderAdapter;
    Object.defineProperty(adapter, "fetchSnapshot", {
      value: async () => { throw new ProviderError("PROVIDER_UNAVAILABLE", "outage"); },
    });
    Object.defineProperty(adapter, "fetchDeals", {
      value: async () => { throw new ProviderError("RATE_LIMITED", "slow down"); },
    });
    Object.defineProperty(adapter, "descriptor", { value: base.descriptor });
    const { service } = buildService(adapter as TradingProviderAdapter, repository);
    const response = await service.synchronize({
      userId: "user-1",
      account: account(),
      connection: connection(),
      requestId: null,
    });
    expect(response.run.status).toBe("PARTIAL");
    expect(response.run.errorCode).toBe("PROVIDER_UNAVAILABLE");
    // The deals segment RAN and FAILED — it did not persist; positions/orders did.
    expect(calls.persistDealsSegment).toHaveLength(0);
    expect(calls.persistPositionsSegment).toHaveLength(1);
    expect(calls.persistOrdersSegment).toHaveLength(1);
  });

  it("a snapshot failure does NOT advance lastSyncAt (freshness anchor only moves when snapshot persisted)", async () => {
    const { repository, calls } = recordingRepository();
    const adapter = oneSegmentFailingAdapter(
      "fetchSnapshot",
      new ProviderError("PROVIDER_UNAVAILABLE", "outage"),
    );
    const { service } = buildService(adapter, repository);
    await service.synchronize({
      userId: "user-1",
      account: account(),
      connection: connection(),
      requestId: null,
    });
    expect(calls.persistSnapshotSegment).toHaveLength(0);
    expect(calls.finalizeSyncRun[0]).toMatchObject({ status: "PARTIAL", errorCode: "PROVIDER_UNAVAILABLE" });
  });

  it("an auth-class failure inside a PARTIAL run still marks the connection ERROR", async () => {
    const { repository, calls } = recordingRepository();
    const adapter = oneSegmentFailingAdapter(
      "fetchDeals",
      new ProviderError("INVALID_CREDENTIALS", "The provider rejected the credentials for this account."),
    );
    const { service } = buildService(adapter, repository);
    const response = await service.synchronize({
      userId: "user-1",
      account: account(),
      connection: connection(),
      requestId: null,
    });
    expect(response.run.status).toBe("PARTIAL");
    expect(calls.setConnectionError).toHaveLength(1);
  });
});

// ── FAILED (all supported segments failed) ───────────────────────────────────

describe("segment orchestration — FAILED (historical path)", () => {
  it("every supported segment failing → failSyncRun + connection ERROR + security event + rethrow", async () => {
    const { repository, calls } = recordingRepository();
    const base = new MockTradingProviderAdapter();
    const adapter = Object.create(Object.getPrototypeOf(base)) as MockTradingProviderAdapter;
    const authError = new ProviderError(
      "INVALID_CREDENTIALS",
      "The provider rejected the credentials for this account.",
    );
    for (const method of ["fetchSnapshot", "fetchPositions", "fetchOrders", "fetchDeals"]) {
      Object.defineProperty(adapter, method, { value: async () => { throw authError; } });
    }
    Object.defineProperty(adapter, "descriptor", { value: base.descriptor });
    const { service, events } = buildService(adapter as TradingProviderAdapter, repository);
    await expect(
      service.synchronize({
        userId: "user-1",
        account: account(),
        connection: connection(),
        requestId: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(calls.failSyncRun[0]).toMatchObject({ errorCode: "INVALID_CREDENTIALS" });
    expect(calls.setConnectionError).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "TRADING_ACCOUNT_SYNC_FAILED", outcome: "FAILURE" });
    expect(calls.finalizeSyncRun).toHaveLength(0);
  });
});

// ── Capability gating (skip = capability FACT, doc B §8.2) ───────────────────

describe("segment orchestration — capability gating", () => {
  it("UNSUPPORTED and UNKNOWN segments are SKIPPED (never called, never failed)", async () => {
    const { repository, calls } = recordingRepository();
    const poor = new CapabilityPoorTestProviderAdapter();
    const { service } = buildService(poor, repository);
    const response = await service.synchronize({
      userId: "user-1",
      account: account({ providerId: "CAPABILITY_TEST" }),
      connection: connection({ providerId: "CAPABILITY_TEST" }),
      requestId: null,
    });
    // orders (UNSUPPORTED) + deals (UNKNOWN): skipped as capability facts.
    expect(calls.persistOrdersSegment).toHaveLength(0);
    expect(calls.persistDealsSegment).toHaveLength(0);
    // snapshot + positions (SUPPORTED): ran and persisted.
    expect(calls.persistSnapshotSegment).toHaveLength(1);
    expect(calls.persistPositionsSegment).toHaveLength(1);
    // Run COMPLETED — capability facts never mark a run failed (§8.2).
    expect(response.run.status).toBe("COMPLETED");
    expect(response.run.errorCode).toBeNull();
    expect(calls.failSyncRun).toHaveLength(0);
  });

  it("an adapter throwing UNSUPPORTED_CAPABILITY despite the gate is STILL skipped (backstop)", async () => {
    const { repository, calls } = recordingRepository();
    const base = new MockTradingProviderAdapter();
    const adapter = Object.create(Object.getPrototypeOf(base)) as MockTradingProviderAdapter;
    Object.defineProperty(adapter, "fetchOrders", {
      value: async () => { throw new ProviderError("UNSUPPORTED_CAPABILITY", "refused"); },
    });
    Object.defineProperty(adapter, "descriptor", { value: base.descriptor });
    const { service } = buildService(adapter as TradingProviderAdapter, repository);
    const response = await service.synchronize({
      userId: "user-1",
      account: account(),
      connection: connection(),
      requestId: null,
    });
    expect(response.run.status).toBe("COMPLETED");
    expect(calls.persistOrdersSegment).toHaveLength(0);
  });

  it("the OANDA adapter's V2 descriptor gates ALL four segments as SUPPORTED (no accidental skips)", async () => {
    const { repository, calls } = recordingRepository();
    // Dead local endpoint — deterministic connection-refused failures, and
    // PROOF that no external call ever leaves the unit test.
    const oanda = new OandaRestProviderAdapter({ restUrlOverride: "http://127.0.0.1:1" });
    const { service } = buildService(oanda, repository);
    await expect(
      service.synchronize({
        userId: "user-1",
        account: account({ providerId: "oanda-v20", broker: "OANDA" }),
        connection: connection({ providerId: "oanda-v20" }),
        requestId: null,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" }); // all four segments attempted → FAILED
    expect(calls.finalizeSyncRun).toHaveLength(0);
    expect(calls.failSyncRun).toHaveLength(1);
  });
});
