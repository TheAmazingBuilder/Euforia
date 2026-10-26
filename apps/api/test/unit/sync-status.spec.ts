/**
 * Unit tests - synchronization status derivation (Phase 3 §15).
 * Connection lifecycle and synchronization lifecycle are ORTHOGONAL axes.
 */
import { describe, expect, it } from "vitest";
import {
  deriveResourceFreshness,
  deriveSynchronizationStatus,
  toResourceFreshnessView,
} from "../../src/modules/accounts/mappers";
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
    snapshotAt: null,
    positionsAt: null,
    ordersAt: null,
    dealsAt: null,
    dealsCheckpoint: null,
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

  // ── Phase 03 (doc B §8.2/§9): partial ≠ success in freshness ─────────────

  it("a PARTIAL run reads DELAYED even while its snapshot is inside the window", () => {
    const partial = run({ status: "PARTIAL", errorCode: "RATE_LIMITED" });
    expect(deriveSynchronizationStatus(new Date(NOW - MINUTE), partial, NOW)).toBe("DELAYED");
  });

  it("a PARTIAL run with an old snapshot still reads DELAYED (never degrades to STALE silence)", () => {
    const partial = run({ status: "PARTIAL", errorCode: "INVALID_PROVIDER_RESPONSE" });
    expect(deriveSynchronizationStatus(new Date(NOW - 30 * MINUTE), partial, NOW)).toBe("DELAYED");
  });

  it("a PARTIAL run with no persisted snapshot reads UNKNOWN (nothing fresh exists)", () => {
    const partial = run({ status: "PARTIAL", errorCode: "PROVIDER_UNAVAILABLE" });
    expect(deriveSynchronizationStatus(null, partial, NOW)).toBe("UNKNOWN");
  });

  it("a later full COMPLETED run returns the freshness axis to normal", () => {
    expect(deriveSynchronizationStatus(new Date(NOW - MINUTE), run(), NOW)).toBe("LIVE");
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

// ── Phase 05 - per-resource freshness rules (§11) ─────────────────────────────

describe("deriveResourceFreshness", () => {
  it("NEVER when the resource never persisted", () => {
    expect(deriveResourceFreshness(null, NOW)).toEqual({ at: null, state: "NEVER" });
  });

  it("FRESH within the TTL, STALE beyond it", () => {
    const at = new Date(NOW - 5 * MINUTE);
    expect(deriveResourceFreshness(at, NOW).state).toBe("FRESH");
    const old = new Date(NOW - 16 * MINUTE);
    expect(deriveResourceFreshness(old, NOW).state).toBe("STALE");
    expect(deriveResourceFreshness(old, NOW).at).toBeTruthy();
  });

  it("the TTL boundary itself is FRESH (age == TTL)", () => {
    const at = new Date(NOW - 15 * MINUTE);
    expect(deriveResourceFreshness(at, NOW).state).toBe("FRESH");
  });

  it("each resource derives INDEPENDENTLY (one failed segment never backdates another)", () => {
    const view = toResourceFreshnessView(
      {
        snapshotAt: new Date(NOW - MINUTE),
        positionsAt: null,
        ordersAt: new Date(NOW - 60 * MINUTE),
        dealsAt: new Date(NOW - MINUTE),
      },
      NOW,
    );
    expect(view.snapshot.state).toBe("FRESH");
    expect(view.positions.state).toBe("NEVER");
    expect(view.orders.state).toBe("STALE");
    expect(view.deals.state).toBe("FRESH");
  });
});
