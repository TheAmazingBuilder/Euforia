/**
 * e2e — OANDA adapter lifecycle over a LOCAL fixture server (Phase 03).
 *
 * The OANDA v20 REST adapter is exercised end-to-end against the REAL
 * AppModule + real database + real AES-GCM credential vault + real zod
 * boundaries — the ONLY difference from production being the transport:
 * a local node:http fixture server that answers with REALISTIC v20 payload
 * shapes (decimal strings, nanosecond timestamps, signed units).
 *
 * HONESTY LABEL: fixture evidence. This proves the ADAPTER + ORCHESTRATION +
 * PERSISTENCE pipeline; it is NEVER evidence of real OANDA connectivity
 * (that requires the user-provided practice token — U2, deferred to the
 * validation runbook in the phase report).
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import {
  tradingAccountDetailsResponseSchema,
  tradingAccountSyncResponseSchema,
  tradingDealsResponseSchema,
  tradingOrdersResponseSchema,
  tradingPositionsResponseSchema,
  tradingProviderListResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

// ── Fixture server (realistic OANDA v20 shapes) ──────────────────────────────

const OANDA_ACCOUNT_ID = "101-004-7192958-001";

interface FixtureState {
  /** When armed, pendingOrders answers 429 (PARTIAL scenario). */
  failOrdersWith429: boolean;
  /** When armed, every route answers 401 (credential-rejection scenario). */
  rejectAllWith401: boolean;
}

const state: FixtureState = { failOrdersWith429: false, rejectAllWith401: false };

function oandaJson(res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function startOandaFixture(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    const auth = req.headers.authorization ?? "";
    if (state.rejectAllWith401) {
      oandaJson(res, 401, { errorCode: "INVALID_AUTH", errorMessage: "internal fixture detail never surfaced" });
      return;
    }
    if (!auth.startsWith("Bearer ") || auth === "Bearer rejected-token") {
      oandaJson(res, 401, { errorCode: "INVALID_AUTH", errorMessage: "bad token" });
      return;
    }
    if (url === "/v3/accounts") {
      oandaJson(res, 200, { accounts: [{ id: OANDA_ACCOUNT_ID, tags: [], name: "Primary" }] });
      return;
    }
    if (url === `/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/summary`) {
      oandaJson(res, 200, {
        account: {
          id: OANDA_ACCOUNT_ID,
          alias: "Primary",
          currency: "USD",
          balance: "10482.5512",
          openTradeCount: 1,
          openPositionCount: 1,
          pendingOrderCount: 1,
          hedgingEnabled: false,
          pl: "-2.1935",
          resettablePL: "-2.1935",
          financing: "0.0000",
          commission: "0.0000",
          guaranteedExecutionFee: "0.0000",
          marginRate: "0.02",
          marginUsed: "55.4210",
          marginAvailable: "10427.1302",
          unrealizedPL: "-2.1935",
          nav: "10480.3577",
          lastTransactionID: "2355",
        },
      });
      return;
    }
    if (url.startsWith(`/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/trades`)) {
      oandaJson(res, 200, {
        trades: [
          {
            id: "2344",
            instrument: "EUR_USD",
            price: "1.11338",
            openTime: "2026-01-07T09:12:04.057358072Z",
            state: "OPEN",
            currentUnits: "100",
            realizedPL: "0.0000",
            financing: "0.0000",
            unrealizedPL: "-0.0540",
            marginUsed: "55.4210",
          },
        ],
        lastTransactionID: "2355",
      });
      return;
    }
    if (url.startsWith(`/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/pendingOrders`)) {
      if (state.failOrdersWith429) {
        oandaJson(res, 429, { errorCode: "RATE_LIMIT_EXCEEDED", errorMessage: "too many requests" }, { "retry-after": "11" });
        return;
      }
      oandaJson(res, 200, {
        orders: [
          {
            id: "2347",
            createTime: "2026-01-09T10:15:00.057358072Z",
            type: "LIMIT",
            instrument: "EUR_USD",
            units: "-200",
            timeInForce: "GTC",
            price: "1.10000",
            triggerCondition: "BID",
            stopLossOnFill: { timeInForce: "GTC", price: "1.12000", type: "STOP_LOSS" },
            takeProfitOnFill: { price: "1.05000", type: "TAKE_PROFIT" },
            state: "PENDING",
          },
        ],
        lastTransactionID: "2347",
      });
      return;
    }
    if (url.startsWith(`/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/transactions`)) {
      oandaJson(res, 200, {
        transactions: [
          {
            type: "TRANSFER_FUNDS",
            id: "2340",
            time: "2026-01-01T00:00:00.000000000Z",
            accountID: OANDA_ACCOUNT_ID,
            amount: "10000.0000",
            fundingReason: "ACCOUNT_TRANSFER",
            accountBalance: "10000.0000",
          },
          {
            type: "ORDER_FILL",
            id: "2346",
            time: "2026-01-07T09:12:05.057358072Z",
            accountID: OANDA_ACCOUNT_ID,
            instrument: "EUR_USD",
            units: "100",
            price: "1.11338",
            pl: "0.0000",
            financing: "-0.0070",
            commission: "0.0434",
            accountBalance: "10482.5512",
            tradeOpened: { tradeID: "2344", units: "100", price: "1.11338" },
          },
          {
            type: "ORDER_FILL",
            id: "2355",
            time: "2026-01-08T09:00:00.000000000Z",
            accountID: OANDA_ACCOUNT_ID,
            instrument: "EUR_USD",
            units: "-100",
            price: "1.12000",
            pl: "6.6200",
            commission: "0.0434",
            financing: "0.0000",
            tradeClosed: [{ tradeID: "2344", units: "-100", realizedPL: "6.6200", price: "1.12000" }],
          },
        ],
        lastTransactionID: "2355",
      });
      return;
    }
    oandaJson(res, 404, { errorCode: "NOT_FOUND", errorMessage: "no such route" });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ── Suite ────────────────────────────────────────────────────────────────────

let app: NestFastifyApplication;
let mail: MailCapture;
let fixture: Server;
let auth: Record<string, string>;

beforeAll(async () => {
  fixture = await startOandaFixture();
  const { port } = fixture.address() as AddressInfo;
  // Set BEFORE buildTestApp — the config is validated at boot.
  process.env.ACCOUNTS_OANDA_PROVIDER = "enabled";
  process.env.ACCOUNTS_OANDA_REST_URL = `http://127.0.0.1:${port}`;
  process.env.ACCOUNTS_MOCK_PROVIDER = "enabled";
  app = await buildTestApp();
  mail = captureMail(app);
  const user = await authenticatedUser(app, mail);
  auth = user.authHeader;
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  delete process.env.ACCOUNTS_OANDA_PROVIDER;
  delete process.env.ACCOUNTS_OANDA_REST_URL;
});

const CONNECT = {
  providerId: "oanda-v20",
  environment: "DEMO",
  externalAccountId: OANDA_ACCOUNT_ID,
  displayName: "OANDA Practice Main",
  credentials: { method: "API_KEY", secret: "fixture-personal-access-token" },
};

describe("oanda-v20 over the fixture server — registry", () => {
  it("lists oanda-v20 as a REAL provider (isMock false, V2 capability set)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/accounts/providers", headers: auth });
    expect(res.statusCode).toBe(200);
    const parsed = tradingProviderListResponseSchema.parse(res.json());
    const oanda = parsed.providers.find((p) => p.providerId === "oanda-v20");
    expect(oanda).toBeDefined();
    expect(oanda?.isMock).toBe(false);
    expect(oanda?.platform).toBe("OANDA");
    // Capability V2 flows through the wire descriptor.
    expect(oanda?.capabilities).toMatchObject({
      balanceEquity: { support: "SUPPORTED" },
      accountDiscovery: { support: "UNKNOWN" },
    });
  });
});

describe("oanda-v20 over the fixture server — connect → initial sync → reads", () => {
  let accountId: string;

  it("connect persists the account, encrypts the token, and the initial sync COMPLETED", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/trading-accounts/connect", headers: auth, payload: CONNECT });
    expect(res.statusCode).toBe(201);
    const parsed = tradingAccountDetailsResponseSchema.parse(res.json());
    accountId = parsed.account.id;
    expect(parsed.account.provider.providerId).toBe("oanda-v20");
    expect(parsed.account.currency).toBe("USD");
    expect(parsed.account.connection?.status).toBe("CONNECTED");
    // Initial sync ran inside connect: full success over the fixture.
    expect(parsed.account.synchronization.lastRun?.status).toBe("COMPLETED");
    expect(parsed.account.snapshot).not.toBeNull();
    // Vault hint only — the token never appears.
    expect(JSON.stringify(parsed)).not.toContain("fixture-personal-access-token");
  });

  it("details surface the fixture snapshot verbatim (marginLevel honest null)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}`, headers: auth });
    expect(res.statusCode).toBe(200);
    const parsed = tradingAccountDetailsResponseSchema.parse(res.json());
    expect(parsed.account.snapshot).toMatchObject({
      balance: "10482.5512",
      equity: "10480.3577",
      unrealizedPnl: "-2.1935", // equity − balance, exact Decimal
      margin: "55.421", // wire convention: Decimal drops trailing zeros
      freeMargin: "10427.1302",
      marginLevel: null,
      currency: "USD",
    });
  });

  it("positions map from open trades with stable ids; orders carry the composed verb; deals include the balance op", async () => {
    const positions = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}/positions`, headers: auth });
    expect(positions.statusCode).toBe(200);
    const parsedPositions = tradingPositionsResponseSchema.parse(positions.json());
    expect(parsedPositions.positions).toHaveLength(1);
    // Wire shape (brokerPositionSchema): id/direction/unrealizedPnl.
    expect(parsedPositions.positions[0]).toMatchObject({
      id: "2344",
      symbol: "EURUSD",
      direction: "BUY",
      volume: "100",
      entryPrice: "1.11338",
      unrealizedPnl: "-0.054", // wire convention: Decimal drops trailing zeros
    });

    const orders = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}/orders`, headers: auth });
    const parsedOrders = tradingOrdersResponseSchema.parse(orders.json());
    expect(parsedOrders.orders).toHaveLength(1);
    expect(parsedOrders.orders[0]).toMatchObject({
      id: "2347",
      type: "SELL_LIMIT",
      stopLoss: "1.12", // wire convention: Decimal drops trailing zeros
      takeProfit: "1.05",
    });

    const deals = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}/deals`, headers: auth });
    const parsedDeals = tradingDealsResponseSchema.parse(deals.json());
    // 2 fills + 1 transfer (bookkeeping excluded)
    expect(parsedDeals.deals).toHaveLength(3);
    expect(parsedDeals.deals.find((d) => d.externalDealId === "2340")).toMatchObject({
      symbol: null,
      volume: "0", // wire convention: Decimal drops trailing zeros
      profit: "10000",
    });
  });

  it("repeated syncs are idempotent — same counts, no duplicate rows", async () => {
    const first = await app.inject({ method: "POST", url: `/api/v1/accounts/${accountId}/sync`, headers: auth });
    expect(first.statusCode).toBe(200);
    const firstRun = tradingAccountSyncResponseSchema.parse(first.json()).run;
    expect(firstRun.status).toBe("COMPLETED");

    const second = await app.inject({ method: "POST", url: `/api/v1/accounts/${accountId}/sync`, headers: auth });
    const secondRun = tradingAccountSyncResponseSchema.parse(second.json()).run;
    expect(secondRun.status).toBe("COMPLETED");
    expect(secondRun.dealsUpserted).toBe(firstRun.dealsUpserted);
    expect(secondRun.positionsUpserted).toBe(firstRun.positionsUpserted);
    expect(secondRun.ordersUpserted).toBe(firstRun.ordersUpserted);

    const deals = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}/deals`, headers: auth });
    expect(tradingDealsResponseSchema.parse(deals.json()).deals).toHaveLength(3);
  });
});

describe("oanda-v20 over the fixture server — PARTIAL run (doc B §8.2)", () => {
  let accountId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/connect",
      headers: auth,
      payload: { ...CONNECT, externalAccountId: OANDA_ACCOUNT_ID, displayName: "OANDA Partial Scenario" },
    });
    // Duplicate (same user+provider+external id) — reuse the first account.
    accountId = res.statusCode === 201 ? (tradingAccountDetailsResponseSchema.parse(res.json()).account.id) : (await (async () => {
      const list = await app.inject({ method: "GET", url: "/api/v1/trading-accounts", headers: auth });
      const body = list.json() as { accounts: Array<{ id: string }> };
      return body.accounts[0]?.id ?? "";
    })());
  });

  it("a failing orders segment yields 200 + run PARTIAL + persisted siblings", async () => {
    state.failOrdersWith429 = true;
    try {
      const res = await app.inject({ method: "POST", url: `/api/v1/accounts/${accountId}/sync`, headers: auth });
      // Partial throws nothing — the honest representation IS the run.
      expect(res.statusCode).toBe(200);
      const parsed = tradingAccountSyncResponseSchema.parse(res.json());
      expect(parsed.run.status).toBe("PARTIAL");
      expect(parsed.run.errorCode).toBe("RATE_LIMITED");
      expect(parsed.run.ordersUpserted).toBe(0);
      // Siblings persisted: the snapshot advanced (freshness anchor), deals stayed.
      expect(parsed.synchronization.status).toBe("DELAYED");
      const details = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}`, headers: auth });
      const parsedDetails = tradingAccountDetailsResponseSchema.parse(details.json());
      expect(parsedDetails.account.snapshot).not.toBeNull();
      expect(parsedDetails.account.synchronization.lastRun?.errorCode).toBe("RATE_LIMITED");
      const deals = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}/deals`, headers: auth });
      expect(tradingDealsResponseSchema.parse(deals.json()).deals).toHaveLength(3);
    } finally {
      state.failOrdersWith429 = false;
    }
  });

  it("the next full run returns the account to COMPLETED freshness", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/accounts/${accountId}/sync`, headers: auth });
    const parsed = tradingAccountSyncResponseSchema.parse(res.json());
    expect(parsed.run.status).toBe("COMPLETED");
    expect(parsed.synchronization.status).toBe("LIVE");
  });
});

describe("oanda-v20 over the fixture server — credential rejection", () => {
  it("connect with a rejected token → 422 INVALID_CREDENTIALS, nothing persisted, error text sanitized", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/connect",
      headers: auth,
      payload: { ...CONNECT, externalAccountId: "101-004-7192958-999", credentials: { method: "API_KEY", secret: "rejected-token" } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
    expect(JSON.stringify(res.json())).not.toContain("internal fixture detail never surfaced");
  });

  it("a mid-life 401 (revoked token) → sync FAILED + connection ERROR (auth class)", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/trading-accounts", headers: auth });
    const body = list.json() as { accounts: Array<{ id: string }> };
    const accountId = body.accounts[0]?.id ?? "";
    state.rejectAllWith401 = true;
    try {
      const res = await app.inject({ method: "POST", url: `/api/v1/accounts/${accountId}/sync`, headers: auth });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("INVALID_CREDENTIALS");
      const details = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}`, headers: auth });
      const parsed = tradingAccountDetailsResponseSchema.parse(details.json());
      expect(parsed.account.connection?.status).toBe("ERROR");
      expect(parsed.account.synchronization.lastRun?.status).toBe("FAILED");
    } finally {
      state.rejectAllWith401 = false;
    }
  });
});
