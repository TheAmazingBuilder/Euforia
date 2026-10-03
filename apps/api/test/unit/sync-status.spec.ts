/**
 * Unit tests — synchronization status derivation (Phase 3 §15).
 * Connection lifecycle and synchronization lifecycle are ORTHOGONAL axes.
 */
import { describe, expect, it } from "vitest";
import { deriveSynchronizationStatus } from "../../src/modules/accounts/mappers";
import type { SyncRunRow } from "../../src/modules/accounts/accounts.repository";

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);
const MINUTE = 60_000;

function run(overrides: Partial<SyncRunRow> = {}): SyncRunRow {
  return {
    id: "run-1",
    accountId: "acc-1",
    status: "COMPLETED",
    trigger: "MANUAL",
    startedAt: new Date(NOW - 5 * MINUTE),
    finishedAt: new Date(NOW - 4 * MINUTE),
    durationMs: 60_000,
    positionsUpserted: 0,
    ordersUpserted: 0,
    dealsUpserted: 0,
    errorCode: null,
    requestId: null,
    ...overrides,
  };
}

describe("deriveSynchronizationStatus", () => {
  it("UNKNOWN when never synchronized", () => {
    expect(deriveSynchronizationStatus(null, null, NOW)).toBe("UNKNOWN");
  });

  it("SYNCING while a run is running", () => {
    const running = run({ status: "RUNNING", finishedAt: null, durationMs: null });
    expect(deriveSynchronizationStatus(null, running, NOW)).toBe("SYNCING");
    expect(deriveSynchronizationStatus(new Date(NOW - MINUTE), running, NOW)).toBe("SYNCING");
  });

  it("LIVE when the last success is within the freshness window", () => {
    expect(deriveSynchronizationStatus(new Date(NOW - 5 * MINUTE), run(), NOW)).toBe("LIVE");
  });

  it("STALE when the last success is older than the freshness window", () => {
    expect(deriveSynchronizationStatus(new Date(NOW - 30 * MINUTE), run(), NOW)).toBe("STALE");
  });

  it("ERROR when the only run failed and there is no previous success", () => {
    const failed = run({ status: "FAILED", errorCode: "INVALID_CREDENTIALS" });
    expect(deriveSynchronizationStatus(null, failed, NOW)).toBe("ERROR");
  });

  it("a failed run does not taint a still-fresh previous success", () => {
    const failed = run({ status: "FAILED", errorCode: "INVALID_PROVIDER_RESPONSE" });
    expect(deriveSynchronizationStatus(new Date(NOW - 2 * MINUTE), failed, NOW)).toBe("LIVE");
  });

  it("a failed run with an old success reads STALE", () => {
    const failed = run({ status: "FAILED", errorCode: "SYNC_FAILED" });
    expect(deriveSynchronizationStatus(new Date(NOW - 60 * MINUTE), failed, NOW)).toBe("STALE");
  });

  it("respects a custom freshness TTL", () => {
    expect(
      deriveSynchronizationStatus(new Date(NOW - 2 * MINUTE), run(), NOW, MINUTE),
    ).toBe("STALE");
  });

  it("connection state never leaks into the sync axis (orthogonal lifecycles, §15)", () => {
    // deriveSynchronizationStatus has no connection parameter by design.
    const failed = run({ status: "FAILED", errorCode: "INVALID_CREDENTIALS" });
    expect(deriveSynchronizationStatus(new Date(NOW - MINUTE), failed, NOW)).toBe("LIVE");
  });
});
