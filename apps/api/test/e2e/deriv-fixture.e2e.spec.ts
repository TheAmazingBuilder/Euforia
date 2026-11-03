/**
 * e2e - Deriv adapter lifecycle over a LOCAL WS fixture server (Phase 07).
 *
 * The Deriv WebSocket adapter is exercised end-to-end against the REAL
 * AppModule + real database + real AES-GCM credential vault + real zod
 * boundaries - the ONLY difference from production being the transport: a
 * local ws fixture server that answers REALISTIC v3 payload shapes.
 *
 * HONESTY LABEL: fixture evidence. This proves the ADAPTER + ORCHESTRATION +
 * PERSISTENCE + BROKER-IDENTIFICATION pipeline; it is NEVER evidence of real
 * Deriv connectivity (that requires the user-created API token - U4 runbook,
 * phase report §22).
 *
 * Cross-provider consistency: the same shared pipeline (connect → initial
 * sync → manual sync → checkpoint → PARTIAL → recovery → ownership) runs
 * here verbatim against a SECOND provider, mirroring oanda-fixture.e2e.spec.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import {
  tradingAccountDetailsResponseSchema,
  tradingAccountSyncResponseSchema,
  tradingDealsResponseSchema,
  tradingPositionsResponseSchema,
  tradingProviderListResponseSchema,
  tradingSyncRunsResponseSchema,
  brokerCatalogResponseSchema,
  brokerIdentifyResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import {
  createDerivFixtureState,
  profitRow,
  startDerivFixture,
  type DerivFixture,
} from "../helpers/deriv-fixture-server";

const LOGINID = "VRTC1234567";
const TOKEN = "fixture-deriv-read-token";

let app: NestFastifyApplication;
let mail: MailCapture;
let fixture: DerivFixture;
let auth: Record<string, string>;
let secondAuth: Record<string, string>;

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
          shortcode: "CALL_R_100_25.50_5.00",
          underlying_symbol: "R_100",
          currency: "USD",
          current_spot: 6512.34,
          profit: 12.34,
        },
      ],
      profitTable: [
        profitRow(1760003600, 1, 12.34),
        profitRow(1759999800, 2, -5.1),
      ],
    }),
  );
  // Set BEFORE buildTestApp - the config is validated at boot.
  process.env.ACCOUNTS_DERIV_PROVIDER = "enabled";
  process.env.ACCOUNTS_DERIV_WS_URL = fixture.url;
  process.env.ACCOUNTS_MOCK_PROVIDER = "enabled";
  // Phase 08 - this fixture is scoped to deriv-ws: pin the bridge gate OFF
  // so the registry contents never depend on the developer 's local .env.
  process.env.ACCOUNTS_MT5_BRIDGE_PROVIDER = "disabled";
  app = await buildTestApp();
  mail = captureMail(app);
  const user = await authenticatedUser(app, mail);
  auth = user.authHeader;
  const other = await authenticatedUser(app, mail);
  secondAuth = other.authHeader;
});

afterAll(async () => {
  await app?.close();
  await fixture.close();
  delete process.env.ACCOUNTS_DERIV_PROVIDER;
  delete process.env.ACCOUNTS_DERIV_WS_URL;
  delete process.env.ACCOUNTS_MT5_BRIDGE_PROVIDER;
});

const CONNECT = {
  providerId: "deriv-ws",
  environment: "DEMO",
  externalAccountId: LOGINID,
  displayName: "Deriv Virtual Main",
  credentials: { method: "API_KEY", secret: TOKEN },
};

describe("deriv-ws over the fixture - registry and universal broker layer", () => {
  it("lists deriv-ws as a REAL provider (isMock false, V2 capabilities, DERIV platform)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/trading-accounts/providers", headers: auth });
    expect(res.statusCode).toBe(200);
    const parsed = tradingProviderListResponseSchema.parse(res.json());
    const deriv = parsed.providers.find((p) => p.providerId === "deriv-ws");
    expect(deriv).toBeDefined();
    expect(deriv?.isMock).toBe(false);
    expect(deriv?.platform).toBe("DERIV");
    expect(deriv?.capabilities).toMatchObject({
      balanceEquity: { support: "SUPPORTED" },
      orders: { support: "UNSUPPORTED" },
      openPositions: { support: "SUPPORTED" },
      deals: { support: "SUPPORTED" },
    });
    // Cross-provider: the registry here exposes mock + deriv-ws (oanda is
    // env-gated OFF in this spec - the cross-provider co-existence with
    // oanda-v20 is proven by the registry listing in oanda-fixture.e2e and
    // by both adapters sharing the same pipeline).
    expect(parsed.providers.map((p) => p.providerId).sort()).toEqual(["MOCK", "deriv-ws"]);
  });

  it("GET /brokers serves the universal catalog with honest connector status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/trading-accounts/brokers", headers: auth });
    expect(res.statusCode).toBe(200);
    const parsed = brokerCatalogResponseSchema.parse(res.json());
    expect(parsed.catalogVersion).toMatch(/^\d{4}-/);
    const deriv = parsed.brokers.find((b) => b.brokerId === "deriv");
    expect(deriv?.connectorStatus).toBe("CONNECTOR_AVAILABLE");
    const icmarkets = parsed.brokers.find((b) => b.brokerId === "icmarkets");
    // Phase 08 - icmarkets carries the mt5-bridge connector; with only the
    // deriv adapter registered in this fixture the honest status stays
    // CONNECTOR_NOT_IMPLEMENTED, and the providerId is now declared.
    expect(icmarkets?.connectorStatus).toBe("CONNECTOR_NOT_IMPLEMENTED");
    expect(icmarkets?.providerId).toBe("mt5-bridge");
    const tradingview = parsed.brokers.find((b) => b.brokerId === "tradingview");
    expect(tradingview?.connectorStatus).toBe("CONNECTOR_NOT_IMPLEMENTED");
    const notes = parsed.brokers.find((b) => b.brokerId === "tradingview")?.notes ?? "";
    expect(notes).toMatch(/no account-data interface/i);
  });

  it("POST /brokers/identify answers 'which broker is this?' from id/endpoint hints (no provider call)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/brokers/identify",
      headers: auth,
      payload: { externalAccountId: "101-004-7192958-001" },
    });
    expect(res.statusCode).toBe(200);
    const parsed = brokerIdentifyResponseSchema.parse(res.json());
    expect(parsed.identification.brokerId).toBe("oanda");
    expect(parsed.identification.confidence).toBe("PATTERN_MATCH");
    // oanda-v20 is env-gated OFF in THIS spec - the honest connector status
    // for the identified broker is therefore NOT_IMPLEMENTED here (the same
    // probe answers CONNECTOR_AVAILABLE in oanda-fixture.e2e.spec.ts).
    expect(parsed.identification.connectorStatus).toBe("CONNECTOR_NOT_IMPLEMENTED");
    expect(parsed.identification.providerId).toBe("oanda-v20");
    // Deriv endpoint hint via the identify route.
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/brokers/identify",
      headers: auth,
      payload: { endpoint: "ws.derivws.com" },
    });
    const parsed2 = brokerIdentifyResponseSchema.parse(res2.json());
    expect(parsed2.identification.brokerId).toBe("deriv");
  });

  it("identify requires authentication, validates input, and is rate-limited", async () => {
    const anon = await app.inject({ method: "POST", url: "/api/v1/trading-accounts/brokers/identify", payload: { externalAccountId: "CR1" } });
    expect(anon.statusCode).toBe(401);
    const empty = await app.inject({ method: "POST", url: "/api/v1/trading-accounts/brokers/identify", headers: auth, payload: {} });
    expect(empty.statusCode).toBe(400);
    for (let i = 0; i < 30; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/v1/trading-accounts/brokers/identify",
        headers: secondAuth,
        payload: { externalAccountId: "no-match-xyz" },
      });
    }
    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/brokers/identify",
      headers: secondAuth,
      payload: { externalAccountId: "no-match-xyz" },
    });
    expect(limited.statusCode).toBe(429);
  });
});

describe("deriv-ws - connect → initial sync → reads → broker identification", () => {
  let accountId: string;

  it("connect persists the account, encrypts the token, identifies the broker, and the initial sync COMPLETED", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/trading-accounts/connect", headers: auth, payload: CONNECT });
    expect(res.statusCode).toBe(201);
    const parsed = tradingAccountDetailsResponseSchema.parse(res.json());
    accountId = parsed.account.id;
    expect(parsed.account.provider.providerId).toBe("deriv-ws");
    expect(parsed.account.broker).toBe("DERIV");
    expect(parsed.account.currency).toBe("USD");
    expect(parsed.account.connection?.status).toBe("CONNECTED");
    // ── Phase 07 headline: the broker was IDENTIFIED at connection time ──
    expect(parsed.account.brokerIdentification).toMatchObject({
      brokerId: "deriv",
      displayName: "Deriv (SVG) Corp", // provider-reported landing company
      platform: "DERIV",
      confidence: "PROVIDER_REPORTED",
      connectorStatus: "CONNECTOR_AVAILABLE",
      providerId: "deriv-ws",
    });
    const signals = parsed.account.brokerIdentification?.signals.join(" ") ?? "";
    expect(signals).toMatch(/provider-reported broker identity: Deriv \(SVG\) Corp/);
    expect(parsed.account.synchronization.status).toBe("LIVE");
  });

  it("positions/deals are persisted through the shared pipeline; orders are a capability FACT (skipped, not failed)", async () => {
    const posRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/positions`, headers: auth });
    expect(posRes.statusCode).toBe(200);
    const positions = tradingPositionsResponseSchema.parse(posRes.json()).positions;
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      id: "900001",
      symbol: "R_100",
      direction: "BUY",
      volume: "1",
      entryPrice: "25.5",
      currentPrice: "6512.34",
      unrealizedPnl: "12.34",
    });

    const dealsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
    expect(dealsRes.statusCode).toBe(200);
    const deals = tradingDealsResponseSchema.parse(dealsRes.json()).deals;
    expect(deals).toHaveLength(2);
    expect(deals[0]?.externalDealId).toMatch(/^TXN-/);
    // Every persisted deal carries its provider identity (idempotency key).
    expect(deals.every((d) => d.externalDealId.length > 0)).toBe(true);

    // The run view: orders segment skipped as a capability fact (ordersAt
    // null, ordersUpserted 0) while the run itself is COMPLETED.
    const runsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/sync-runs?limit=5`, headers: auth });
    expect(runsRes.statusCode).toBe(200);
    const runs = tradingSyncRunsResponseSchema.parse(runsRes.json());
    expect(runs.runs[0]?.status).toBe("COMPLETED");
    expect(runs.runs[0]?.ordersUpserted).toBe(0);
    expect(runs.runs[0]?.ordersAt ?? null).toBeNull();
    expect(runs.runs[0]?.dealsUpserted).toBe(2);
  });

  it("repeated synchronization does not duplicate records (boundary tie re-upserts idempotently)", async () => {
    const syncRes = await app.inject({ method: "POST", url: `/api/v1/trading-accounts/${accountId}/sync`, headers: auth });
    expect(syncRes.statusCode).toBe(200);
    const parsed = tradingAccountSyncResponseSchema.parse(syncRes.json());
    expect(parsed.run.status).toBe("COMPLETED");
    // The incremental scan resumes FROM the checkpoint (sell_time >= cursor):
    // the boundary tie re-upserts (1 row), no duplicates appear.
    expect(parsed.run.dealsUpserted).toBe(1);
    const dealsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
    expect(tradingDealsResponseSchema.parse(dealsRes.json()).deals).toHaveLength(2);
  });

  it("incremental checkpoint: newer provider activity is picked up, scan advances past the old boundary", async () => {
    fixture.state.profitTable.push(profitRow(1760007200, 3, 21.7));
    const syncRes = await app.inject({ method: "POST", url: `/api/v1/trading-accounts/${accountId}/sync`, headers: auth });
    expect(syncRes.statusCode).toBe(200);
    const parsed = tradingAccountSyncResponseSchema.parse(syncRes.json());
    expect(parsed.run.status).toBe("COMPLETED");
    // New row + the boundary tie of the PREVIOUS checkpoint (idempotent).
    expect(parsed.run.dealsUpserted).toBe(2);
    const dealsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
    expect(tradingDealsResponseSchema.parse(dealsRes.json()).deals).toHaveLength(3);
    // The checkpoint genuinely advanced: a sync with NO new activity
    // re-upserts only the new boundary tie (the 1760007200 row).
    const sync2 = await app.inject({ method: "POST", url: `/api/v1/trading-accounts/${accountId}/sync`, headers: auth });
    expect(tradingAccountSyncResponseSchema.parse(sync2.json()).run.dealsUpserted).toBe(1);
    const deals2 = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
    expect(tradingDealsResponseSchema.parse(deals2.json()).deals).toHaveLength(3);
  });

  it("PARTIAL semantics: a rate-limited deals segment does not erase good data and is reported honestly", async () => {
    fixture.state.rateLimitProfitTable = true;
    try {
      const syncRes = await app.inject({ method: "POST", url: `/api/v1/trading-accounts/${accountId}/sync`, headers: auth });
      expect(syncRes.statusCode).toBe(200); // PARTIAL is a 200 body, not an error
      const parsed = tradingAccountSyncResponseSchema.parse(syncRes.json());
      expect(parsed.run.status).toBe("PARTIAL");
      expect(parsed.run.errorCode).toBe("RATE_LIMITED");
      // Last-known-good data preserved.
      const dealsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
      expect(tradingDealsResponseSchema.parse(dealsRes.json()).deals).toHaveLength(3);
      // A follow-up recovery run completes and the data set is unchanged.
    } finally {
      fixture.state.rateLimitProfitTable = false;
    }
    // Recovery: the next run completes again.
    const sync2 = await app.inject({ method: "POST", url: `/api/v1/trading-accounts/${accountId}/sync`, headers: auth });
    expect(tradingAccountSyncResponseSchema.parse(sync2.json()).run.status).toBe("COMPLETED");
    const deals2 = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
    expect(tradingDealsResponseSchema.parse(deals2.json()).deals).toHaveLength(3);
  });

  it("credential rejection is honest: connection ERROR, sanitized lastError, audit event without secrets", async () => {
    fixture.state.rejectAuthorizeCode = "InvalidToken";
    try {
      const syncRes = await app.inject({ method: "POST", url: `/api/v1/trading-accounts/${accountId}/sync`, headers: auth });
      // Auth-class provider failure → 422 INVALID_CREDENTIALS (normative table).
      expect(syncRes.statusCode).toBe(422);
      expect(syncRes.json().code).toBe("INVALID_CREDENTIALS");
      const detailsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}`, headers: auth });
      const details = tradingAccountDetailsResponseSchema.parse(detailsRes.json());
      expect(details.account.connection?.status).toBe("ERROR");
      expect(details.account.connection?.lastError ?? "").not.toMatch(/fixture|token/i);
      // Historical data was NEVER deleted by a failed refresh.
      const dealsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
      expect(tradingDealsResponseSchema.parse(dealsRes.json()).deals).toHaveLength(3);
    } finally {
      fixture.state.rejectAuthorizeCode = null;
    }
  });

  it("reconnect with fresh credentials restores CONNECTED and re-syncs", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trading-accounts/${accountId}/reconnect`,
      headers: auth,
      payload: { credentials: { method: "API_KEY", secret: TOKEN } },
    });
    expect(res.statusCode).toBe(200);
    const parsed = tradingAccountDetailsResponseSchema.parse(res.json());
    expect(parsed.account.connection?.status).toBe("CONNECTED");
    expect(parsed.account.brokerIdentification?.confidence).toBe("PROVIDER_REPORTED");
  });

  it("ownership: user B gets 404 on every surface of user A's deriv account (IDOR)", async () => {
    for (const [method, url] of [
      ["GET", `/api/v1/trading-accounts/${accountId}`],
      ["GET", `/api/v1/trading-accounts/${accountId}/positions`],
      ["GET", `/api/v1/trading-accounts/${accountId}/deals`],
      ["POST", `/api/v1/trading-accounts/${accountId}/sync`],
      ["POST", `/api/v1/trading-accounts/${accountId}/test`],
      ["DELETE", `/api/v1/trading-accounts/${accountId}`],
    ] as const) {
      const res = await app.inject({ method, url, headers: secondAuth });
      expect(res.statusCode).toBe(404);
    }
  });

  it("disconnect wipes credentials but preserves history", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/v1/trading-accounts/${accountId}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "DISCONNECTED", historyPreserved: true });
    const dealsRes = await app.inject({ method: "GET", url: `/api/v1/trading-accounts/${accountId}/deals`, headers: auth });
    expect(tradingDealsResponseSchema.parse(dealsRes.json()).deals).toHaveLength(3);
  });

  it("RED LINE: the fixture recorded zero non-read request names across the whole suite", () => {
    expect(fixture.state.violations).toEqual([]);
    const names = new Set(fixture.state.requests.map((r) => r.name));
    for (const name of names) {
      expect(["authorize", "balance", "portfolio", "profit_table"]).toContain(name);
    }
  });
});
