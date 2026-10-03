/**
 * Unit tests — MockTradingProviderAdapter (Phase 3 §55).
 * Determinism, contract validation of generated data, controlled failures.
 */
import { describe, expect, it } from "vitest";
import { MockTradingProviderAdapter } from "../../src/modules/accounts/providers/mock-trading.provider";
import { ProviderError } from "../../src/modules/accounts/provider.types";
import {
  normalizedAccountInfoSchema,
  normalizedDealsSchema,
  normalizedOrdersSchema,
  normalizedPositionsSchema,
  normalizedSnapshotSchema,
} from "../../src/modules/accounts/normalization";

const adapter = new MockTradingProviderAdapter();
const credentials = { method: "API_KEY" as const, secret: "super-secret-api-key-4242" };

function ctxOf(externalAccountId: string) {
  return { credentials, externalAccountId };
}

describe("MockTradingProviderAdapter — descriptor", () => {
  it("declares a READ-ONLY capability set (no execution path exists)", () => {
    expect(adapter.descriptor.providerId).toBe("MOCK");
    expect(adapter.descriptor.isMock).toBe(true);
    expect(adapter.descriptor.supportedPermissions).toEqual([
      "READ_ACCOUNT",
      "READ_BALANCE",
      "READ_EQUITY",
      "READ_POSITIONS",
      "READ_ORDERS",
      "READ_DEALS",
      "READ_HISTORY",
    ]);
    expect(adapter.descriptor.supportedEnvironments).toEqual(["DEMO", "LIVE"]);
  });
});

describe("MockTradingProviderAdapter — deterministic normalization", () => {
  it("generates account info that validates against the normalization boundary", async () => {
    const info = await adapter.fetchAccountInfo(ctxOf("50417788"));
    expect(normalizedAccountInfoSchema.safeParse(info).success).toBe(true);
  });

  it("generates snapshots that validate against the normalization boundary", async () => {
    const snapshot = await adapter.fetchSnapshot(ctxOf("50417788"));
    expect(normalizedSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("generates positions, orders and deals that validate (across several logins)", async () => {
    for (const login of ["1001", "1002", "1003", "1004", "1005", "600300", "600301"]) {
      const positions = await adapter.fetchPositions(ctxOf(login));
      const orders = await adapter.fetchOrders(ctxOf(login));
      const deals = await adapter.fetchDeals(ctxOf(login));
      expect(normalizedPositionsSchema.safeParse(positions).success).toBe(true);
      expect(normalizedOrdersSchema.safeParse(orders).success).toBe(true);
      expect(normalizedDealsSchema.safeParse(deals).success).toBe(true);
    }
  });

  it("is a pure function of the external account id (idempotent syncs, §18)", async () => {
    const first = await adapter.fetchSnapshot(ctxOf("50417788"));
    const second = await adapter.fetchSnapshot(ctxOf("50417788"));
    expect(second).toEqual(first);
    const dealsA = await adapter.fetchDeals(ctxOf("50417788"));
    const dealsB = await adapter.fetchDeals(ctxOf("50417788"));
    expect(dealsB).toEqual(dealsA);
  });

  it("yields different data for different external accounts", async () => {
    const a = await adapter.fetchSnapshot(ctxOf("111"));
    const b = await adapter.fetchSnapshot(ctxOf("999"));
    expect(a).not.toEqual(b);
  });

  it("testConnection succeeds for non-scenario credentials", async () => {
    await expect(adapter.testConnection(credentials)).resolves.toBeUndefined();
  });
});

describe("MockTradingProviderAdapter — controlled failure scenarios (§55)", () => {
  it("invalid credentials", async () => {
    await expect(
      adapter.testConnection({ method: "API_KEY", secret: "fail-invalid-anything" }),
    ).rejects.toMatchObject({ name: "ProviderError", code: "INVALID_CREDENTIALS" });
  });

  it("provider unavailable", async () => {
    await expect(
      adapter.testConnection({ method: "API_KEY", secret: "fail-unavailable" }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("timeout (sleeps past the configured call timeout)", async () => {
    await expect(
      adapter.testConnection({ method: "API_KEY", secret: "fail-timeout" }),
    ).rejects.toMatchObject({ code: "CONNECTION_TIMEOUT" });
  }, 10_000);

  it("malformed response — the adapter answers with type-broken payloads", async () => {
    const snapshot = await adapter.fetchSnapshot({
      credentials: { method: "API_KEY", secret: "fail-malformed" },
      externalAccountId: "50417788",
    });
    expect(normalizedSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("error messages never contain the credential secret (§23)", async () => {
    const secret = "fail-invalid-super-secret-value-9876";
    try {
      await adapter.testConnection({ method: "API_KEY", secret });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as Error).message).not.toContain("super-secret-value-9876");
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
