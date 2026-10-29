import { describe, expect, it, vi } from "vitest";

import { AccountsRepository } from "../../src/modules/accounts/accounts.repository";
import { Mt5BridgeProviderAdapter } from "../../src/modules/accounts/providers/mt5-bridge/mt5-bridge.provider";
import type { ProviderRequestContext } from "../../src/modules/accounts/provider.types";

function requestContext(lastSyncAt: Date | null = null): ProviderRequestContext {
  return {
    credentials: { method: "PLATFORM_BRIDGE", secret: "test-secret" },
    externalAccountId: "52988790",
    environment: "DEMO",
    bridgeKeyId: "brg_test",
    lastSyncAt,
  };
}

function adapterWithEvent(
  payload: unknown,
  receivedAt: Date,
) {
  const repository = {
    latestBridgeEvent: vi.fn().mockResolvedValue({ payload, receivedAt }),
  } as unknown as AccountsRepository;
  return {
    adapter: new Mt5BridgeProviderAdapter(repository),
    repository,
  };
}

describe("MT5 bridge provider freshness", () => {
  it("rejects a cached snapshot that predates the last successful synchronization", async () => {
    const lastSyncAt = new Date("2026-10-29T12:00:00.000Z");
    const { adapter } = adapterWithEvent(
      { balance: "10000", equity: "10000", margin: "0", freeMargin: "10000", marginLevel: null },
      new Date("2026-10-29T11:59:59.999Z"),
    );

    await expect(adapter.fetchSnapshot(requestContext(lastSyncAt))).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("accepts a fresh complete event and normalizes its snapshot values", async () => {
    const lastSyncAt = new Date("2026-10-29T12:00:00.000Z");
    const { adapter } = adapterWithEvent(
      { balance: "10000.00", equity: "10020.00", margin: "120", freeMargin: "9900", marginLevel: "8350" },
      new Date("2026-10-29T12:00:30.000Z"),
    );

    await expect(adapter.fetchSnapshot(requestContext(lastSyncAt))).resolves.toEqual({
      balance: "10000.00",
      equity: "10020.00",
      margin: "120",
      freeMargin: "9900",
      marginLevel: "8350",
    });
  });

  it("does not turn missing orders into an empty open-order set", async () => {
    const repository = {
      latestBridgeEvent: vi.fn().mockResolvedValue(null),
    } as unknown as AccountsRepository;
    const adapter = new Mt5BridgeProviderAdapter(repository);

    await expect(adapter.fetchOrders(requestContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("does not turn missing deals into a successful empty history", async () => {
    const repository = {
      latestBridgeEvent: vi.fn().mockResolvedValue(null),
    } as unknown as AccountsRepository;
    const adapter = new Mt5BridgeProviderAdapter(repository);

    await expect(adapter.fetchDeals(requestContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("does not treat a cached deals event as fresh progress after the last sync", async () => {
    const lastSyncAt = new Date("2026-10-29T12:00:00.000Z");
    const { adapter } = adapterWithEvent(
      { deals: [], observedThrough: null, complete: true },
      new Date("2026-10-29T12:00:00.000Z"),
    );

    await expect(adapter.fetchDeals(requestContext(lastSyncAt))).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });
});
