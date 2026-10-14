/**
 * Unit — DerivWsProviderAdapter against the local WS fixture server (Phase 07).
 *
 * Real WebSocket protocol exchange (ws client ⇄ ws fixture server), real zod
 * boundaries, real mapping layer. Covers: the read-only red line (whitelist
 * + 6-method surface), credential errors, account binding (echo + environment
 * class), financial/timestamp normalization, capability honesty (orders),
 * profit-table pagination with checkpoint semantics, and error classification.
 *
 * HONESTY LABEL: fixture evidence — NEVER proof of live Deriv connectivity.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TradingProviderAdapter } from "../../src/modules/accounts/provider.types";
import { ProviderError } from "../../src/modules/accounts/provider.types";
import {
  DERIV_READ_REQUEST_NAMES,
  DerivWsProviderAdapter,
} from "../../src/modules/accounts/providers/deriv/deriv-ws.provider";
import { DERIV_CONTRACT_DIRECTION } from "../../src/modules/accounts/providers/deriv/deriv-mapping";
import {
  createDerivFixtureState,
  profitRow,
  startDerivFixture,
  type DerivFixture,
} from "../helpers/deriv-fixture-server";

const LOGINID = "VRTC1234567";
const TOKEN = "fixture-deriv-read-token";

const baseContext = (overrides: Partial<Parameters<TradingProviderAdapter["fetchAccountInfo"]>[0]> = {}) => ({
  credentials: { method: "API_KEY" as const, secret: TOKEN },
  externalAccountId: LOGINID,
  environment: "DEMO" as const,
  dealsCursor: null,
  ...overrides,
});

let fixture: DerivFixture;
let adapter: DerivWsProviderAdapter;

beforeAll(async () => {
  fixture = await startDerivFixture(
    createDerivFixtureState({
      loginid: LOGINID,
      validToken: TOKEN,
      balance: 10500.55,
      portfolio: [
        {
          contract_id: 900001,
          contract_type: "CALL",
          buy_price: 25.5,
          purchase_time: 1760000000,
          expiry_time: 1760003600,
          shortcode: "CALL_R_100_25.50_5.00",
          underlying_symbol: "R_100",
          currency: "USD",
          current_spot: 6512.34,
          profit: 12.34,
        },
        {
          contract_id: 900002,
          contract_type: "PUT",
          buy_price: 40,
          purchase_time: 1760000500,
          shortcode: "PUT_FRXEURUSD_40.00_2.00",
          underlying_symbol: "frxEURUSD",
          currency: "USD",
          profit: -8.2,
        },
      ],
      profitTable: [
        profitRow(1760003600, 1, 12.34),
        profitRow(1759999800, 2, -5.1),
      ],
    }),
  );
  adapter = new DerivWsProviderAdapter({
    wsUrlOverride: fixture.url,
    appId: "1089",
    requestTimeoutMs: 5_000,
  });
});

afterAll(async () => {
  await fixture.close();
});

function expectProviderError(code: string, run: () => Promise<unknown>) {
  return run().then(
    () => {
      throw new Error(`expected ProviderError ${code}, but the call succeeded`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe(code);
      // Canned messages only — no provider internals cross the boundary.
      expect((error as Error).message).not.toMatch(/fixture/i);
      return error as ProviderError;
    },
  );
}

describe("deriv-ws — read-only red line (§47)", () => {
  it("exposes the 6 port methods and NO execution surface", () => {
    const methods = Object.getOwnPropertyNames(DerivWsProviderAdapter.prototype).filter(
      (m) => m !== "constructor" && !m.startsWith("resolve") && !m.startsWith("require") && !m.startsWith("assert") && !m.startsWith("map") && !m.startsWith("pull"),
    );
    const adapterInstance = adapter as unknown as TradingProviderAdapter;
    for (const required of [
      "testConnection",
      "fetchAccountInfo",
      "fetchSnapshot",
      "fetchPositions",
      "fetchOrders",
      "fetchDeals",
    ]) {
      expect(typeof adapterInstance[required as keyof TradingProviderAdapter]).toBe("function");
      expect(methods).toContain(required);
    }
    expect(methods.filter((m) => /^place|modify|cancel|close|buy|sell/i.test(m))).toHaveLength(0);
  });

  it("whitelist contains ONLY documented read request names — no execution verbs", () => {
    const forbidden = ["buy", "sell", "cancel", "proposal", "proposal_open_contract", "contract_update", "transfer_between_accounts", "topup_virtual", "paymentagent_transfer", "api_token", "new_account_real"];
    for (const verb of forbidden) {
      expect(DERIV_READ_REQUEST_NAMES.has(verb)).toBe(false);
    }
    for (const required of ["authorize", "balance", "portfolio", "profit_table"]) {
      expect(DERIV_READ_REQUEST_NAMES.has(required)).toBe(true);
    }
  });

  it("the fixture records zero red-line violations for every scenario in this suite", async () => {
    await adapter.testConnection({ method: "API_KEY", secret: TOKEN });
    await adapter.fetchAccountInfo(baseContext());
    expect(fixture.state.violations).toEqual([]);
  });
});

describe("deriv-ws — descriptor honesty", () => {
  it("declares platform DERIV, DEMO/LIVE environments, and no READ_ORDERS permission", () => {
    const d = adapter.descriptor;
    expect(d.providerId).toBe("deriv-ws");
    expect(d.platform).toBe("DERIV");
    expect(d.supportedEnvironments).toEqual(["DEMO", "LIVE"]);
    expect(d.supportedConnectionMethods).toEqual(["API_KEY"]);
    expect(d.isMock).toBe(false);
    expect(d.supportedPermissions).not.toContain("READ_ORDERS");
  });

  it("declares V2 capabilities matching the documented reality (orders UNSUPPORTED, streaming UNSUPPORTED)", () => {
    const caps = adapter.descriptor.capabilities;
    if (!("balanceEquity" in caps)) throw new Error("expected V2 capability shape");
    expect(caps.balanceEquity.support).toBe("SUPPORTED");
    expect(caps.openPositions.support).toBe("SUPPORTED");
    expect(caps.deals.support).toBe("SUPPORTED");
    expect(caps.orders.support).toBe("UNSUPPORTED");
    expect(caps.marginInfo.support).toBe("UNSUPPORTED");
    expect(caps.accountDiscovery.support).toBe("UNKNOWN");
    expect(caps.historyDepth.support).toBe("UNKNOWN");
    expect(caps.streamingAccountUpdates.support).toBe("UNSUPPORTED");
    expect(caps.connectionValidation.support).toBe("SUPPORTED");
    expect(caps.credentialRevocation.support).toBe("SUPPORTED");
  });
});

describe("deriv-ws — credential handling", () => {
  it("testConnection accepts a valid token", async () => {
    await expect(adapter.testConnection({ method: "API_KEY", secret: TOKEN })).resolves.toBeUndefined();
  });

  it("maps InvalidToken to INVALID_CREDENTIALS with a canned message", async () => {
    const err = await expectProviderError("INVALID_CREDENTIALS", () =>
      adapter.testConnection({ method: "API_KEY", secret: "wrong-token" }),
    );
    expect(err.message).toBe("The provider rejected the credentials.");
  });

  it("maps RateLimitExceeded to RATE_LIMITED", async () => {
    fixture.state.rateLimitProfitTable = true;
    try {
      await expectProviderError("RATE_LIMITED", () => adapter.fetchDeals(baseContext()));
    } finally {
      fixture.state.rateLimitProfitTable = false;
    }
  });

  it("fails loud against a dead endpoint (PROVIDER_UNAVAILABLE)", async () => {
    const dead = new DerivWsProviderAdapter({ wsUrlOverride: "ws://127.0.0.1:1", requestTimeoutMs: 1_500 });
    await expectProviderError("PROVIDER_UNAVAILABLE", () =>
      dead.testConnection({ method: "API_KEY", secret: TOKEN }),
    );
  });
});

describe("deriv-ws — account binding and identity capture", () => {
  it("fetchAccountInfo returns the provider-reported identity (landing company) + account class", async () => {
    const info = await adapter.fetchAccountInfo(baseContext());
    expect(info.externalAccountId).toBe(LOGINID);
    expect(info.currency).toBe("USD");
    expect(info.leverage).toBeNull();
    expect(info.server).toBeNull();
    expect(info.brokerIdentity).toEqual({
      brokerName: "Deriv (SVG) Corp",
      accountClass: "DEMO",
    });
  });

  it("rejects a foreign external account id (UNSUPPORTED_ACCOUNT, honest echo check)", async () => {
    await expectProviderError("UNSUPPORTED_ACCOUNT", () =>
      adapter.fetchAccountInfo(baseContext({ externalAccountId: "CR99999999" })),
    );
  });

  it("rejects a LIVE declaration for a virtual account (environment class mismatch)", async () => {
    await expectProviderError("UNSUPPORTED_ACCOUNT", () =>
      adapter.fetchAccountInfo(baseContext({ environment: "LIVE" })),
    );
  });

  it("rejects PROP_FIRM without any provider call", async () => {
    await expectProviderError("UNSUPPORTED_ACCOUNT", () =>
      adapter.fetchAccountInfo(baseContext({ environment: "PROP_FIRM" })),
    );
    // No session was even opened for this call.
    const authorizeCalls = fixture.state.requests.filter((r) => r.name === "authorize").length;
    await new Promise((r) => setTimeout(r, 20));
    expect(fixture.state.requests.filter((r) => r.name === "authorize").length).toBe(authorizeCalls);
  });

  it("LIVE + real (CR…) account class matches", async () => {
    fixture.state.loginid = "CR90001234";
    fixture.state.isVirtual = false;
    try {
      const info = await adapter.fetchAccountInfo(baseContext({ environment: "LIVE", externalAccountId: "CR90001234" }));
      expect(info.brokerIdentity?.accountClass).toBe("REAL");
      expect(info.externalAccountId).toBe("CR90001234");
    } finally {
      fixture.state.loginid = LOGINID;
      fixture.state.isVirtual = true;
    }
  });
});

describe("deriv-ws — financial normalization", () => {
  it("fetchSnapshot maps balance exactly and reports equity/margin as honest nulls", async () => {
    const snap = await adapter.fetchSnapshot(baseContext());
    expect(snap.balance).toBe("10500.55");
    expect(snap.equity).toBeNull();
    expect(snap.margin).toBeNull();
    expect(snap.freeMargin).toBeNull();
    expect(snap.marginLevel).toBeNull();
  });

  it("fetchPositions maps documented contract families and passes symbols verbatim", async () => {
    const result = await adapter.fetchPositions(baseContext());
    expect(result.complete).toBe(true); // documented: portfolio IS the full open set
    expect(result.positions).toHaveLength(2);
    const call = result.positions[0];
    expect(call).toMatchObject({
      externalPositionId: "900001",
      symbol: "R_100",
      side: "BUY",
      volume: "1",
      entryPrice: "25.5",
      currentPrice: "6512.34",
      profit: "12.34",
      stopLoss: null,
      takeProfit: null,
    });
    expect(call.openedAt).toBe(new Date(1760000000 * 1000).toISOString());
    const put = result.positions[1];
    expect(put.side).toBe("SELL");
    expect(put.symbol).toBe("frxEURUSD");
    expect(put.currentPrice).toBeNull(); // not reported → honest null
  });

  it("fails loud on an undocumented contract family (never fabricates direction)", async () => {
    fixture.state.portfolio.push({
      contract_id: 900003,
      contract_type: "SOMETHING_NEW",
      buy_price: 10,
      purchase_time: 1760000000,
      underlying_symbol: "R_50",
    });
    try {
      await expectProviderError("INVALID_PROVIDER_RESPONSE", () => adapter.fetchPositions(baseContext()));
    } finally {
      fixture.state.portfolio.pop();
    }
    expect(DERIV_CONTRACT_DIRECTION["SOMETHING_NEW"]).toBeUndefined();
  });

  it("rejects malformed portfolio responses as INVALID_PROVIDER_RESPONSE", async () => {
    fixture.state.malformedPortfolio = true;
    try {
      await expectProviderError("INVALID_PROVIDER_RESPONSE", () => adapter.fetchPositions(baseContext()));
    } finally {
      fixture.state.malformedPortfolio = false;
    }
  });
});

describe("deriv-ws — capability honesty (orders)", () => {
  it("fetchOrders throws UNSUPPORTED_CAPABILITY and never issues a provider call", async () => {
    const before = fixture.state.requests.length;
    await expectProviderError("UNSUPPORTED_CAPABILITY", () => adapter.fetchOrders(baseContext()));
    expect(fixture.state.requests.length).toBe(before);
  });

  it("fetchDeals on a malformed profit_table answer fails loud", async () => {
    fixture.state.malformedProfitTable = true;
    try {
      await expectProviderError("INVALID_PROVIDER_RESPONSE", () => adapter.fetchDeals(baseContext()));
    } finally {
      fixture.state.malformedProfitTable = false;
    }
  });
});

describe("deriv-ws — profit table pagination and checkpoint semantics", () => {
  it("initial pull within one page: complete=true, observedThrough = newest sell_time", async () => {
    const result = await adapter.fetchDeals(baseContext());
    expect(result.deals).toHaveLength(2);
    expect(result.complete).toBe(true);
    expect(result.observedThrough).toBe("1760003600");
    const first = result.deals[0];
    expect(first).toMatchObject({
      externalDealId: expect.stringMatching(/^TXN-/),
      symbol: null,
      side: "BUY",
      volume: "1",
      positionId: expect.any(String),
    });
    expect(first.executedAt).toBe(new Date(1760003600 * 1000).toISOString());
    // The whitelist only: profit_table + authorize were the outbound names.
    const names = fixture.state.requests.map((r) => r.name);
    expect(names).toContain("profit_table");
    expect(names.every((n) => DERIV_READ_REQUEST_NAMES.has(n))).toBe(true);
  });

  it("incremental pull resumes strictly AFTER the checkpoint (ties re-included, idempotent upsert)", async () => {
    // Newer provider activity AFTER the previous run's checkpoint.
    fixture.state.profitTable.push(profitRow(1760007200, 3, 21.7));
    const result = await adapter.fetchDeals(baseContext({ dealsCursor: "1760003600" }));
    const times = result.deals.map((d) => new Date(d.executedAt).getTime());
    expect(times.every((t) => t >= 1760003600 * 1000)).toBe(true);
    expect(result.deals).toHaveLength(2); // the new row + the boundary tie at the cursor
    expect(result.complete).toBe(true);
    expect(result.observedThrough).toBe("1760007200");
  });

  it("page cap yields complete=false with the OLDEST observed sell_time as observedThrough", async () => {
    // 11 pages × 500 rows exceed the 10-page cap → honest truncation.
    const bigRows = Array.from({ length: 5500 }, (_, i) =>
      profitRow(1_700_000_000 + i, 10_000 + i, 1.5),
    );
    const saved = fixture.state.profitTable;
    fixture.state.profitTable = bigRows;
    try {
      const result = await adapter.fetchDeals(baseContext());
      expect(result.complete).toBe(false);
      expect(result.deals).toHaveLength(5000);
      // Rows sorted DESC: the 10 allowed pages cover i=5499…500 — the oldest
      // OBSERVED sell_time is i=500's (never a claim beyond observed rows).
      expect(result.observedThrough).toBe(String(1_700_000_000 + 500));
    } finally {
      fixture.state.profitTable = saved;
    }
  });

  it("empty incremental result keeps the checkpoint (observedThrough = cursor)", async () => {
    const result = await adapter.fetchDeals(baseContext({ dealsCursor: "1999999999" }));
    expect(result.deals).toHaveLength(0);
    expect(result.complete).toBe(true);
    expect(result.observedThrough).toBe("1999999999");
  });

  it("rejects a corrupted checkpoint shape (data error, fail loud)", async () => {
    await expectProviderError("INVALID_PROVIDER_RESPONSE", () =>
      adapter.fetchDeals(baseContext({ dealsCursor: "not-a-cursor" })),
    );
  });
});
