/**
 * e2e — Accounts / Trading Connectivity (Phase 3).
 *
 * Covers the full lifecycle over the REAL AppModule + real database:
 * connect → initial sync → reads → manual sync (idempotency) → test →
 * reconnect → disconnect, plus ownership (IDOR), security (credential
 * redaction, execution red line), provider failure normalization,
 * concurrency (single RUNNING run) and rate limits.
 *
 * The mock provider is exercised through its documented controlled-failure
 * secret scenarios (§55).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  accountSchema,
  brokerSessionResponseSchema,
  tradingAccountDetailsResponseSchema,
  tradingAccountDetailsSchema,
  tradingAccountSyncResponseSchema,
  tradingConnectionTestResponseSchema,
  tradingDisconnectResponseSchema,
  tradingPositionsResponseSchema,
  tradingOrdersResponseSchema,
  tradingDealsResponseSchema,
  tradingProviderListResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, uniqueEmail, type MailCapture } from "../helpers/identity";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { CredentialsEncryptionService } from "../../src/modules/accounts/credentials-encryption.service";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

// ── helpers ──────────────────────────────────────────────────────────────────

const SECRET = "mock-api-key-abcd1234";

function connectPayload(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "MOCK",
    environment: "DEMO",
    externalAccountId: `50${Math.random().toString(36).slice(2, 8)}`,
    credentials: { method: "API_KEY", secret: SECRET },
    ...overrides,
  };
}

async function connectAccount(
  auth: Record<string, string>,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: auth,
    payload: connectPayload(overrides),
  });
}

async function userAandB() {
  const a = await authenticatedUser(app, mail);
  const b = await authenticatedUser(app, mail);
  return { a, b };
}

// ── Auth boundary ────────────────────────────────────────────────────────────

describe("accounts — authentication boundary", () => {
  it("401 on every accounts route without a token", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/accounts"],
      ["POST", "/api/v1/accounts"],
      ["GET", "/api/v1/broker/session"],
      ["GET", "/api/v1/accounts/providers"],
    ] as const) {
      const res = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("GET /accounts starts empty for a fresh user (no speculative seeding)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounts",
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accounts: [] });
  });
});

// ── Provider registry ────────────────────────────────────────────────────────

describe("accounts — provider registry (§44)", () => {
  it("lists the mock provider with explicit read-only permissions and mock labeling", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounts/providers",
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const parsed = tradingProviderListResponseSchema.parse(res.json());
    const mock = parsed.providers.find((p) => p.providerId === "MOCK");
    expect(mock).toBeDefined();
    expect(mock?.isMock).toBe(true);
    expect(mock?.supportedPermissions.every((p) => p.startsWith("READ_"))).toBe(true);
  });

  it("connect rejects an unknown provider with 422 UNSUPPORTED_PROVIDER", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, { providerId: "NOT_A_PROVIDER" });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("UNSUPPORTED_PROVIDER");
  });
});

// ── Connect + initial synchronization ────────────────────────────────────────

describe("accounts — connect (§17)", () => {
  it("registers account + connection, runs the initial sync, returns validated details", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, { environment: "DEMO" });
    expect(res.statusCode).toBe(201);
    const { account } = tradingAccountDetailsResponseSchema.parse(res.json());
    expect(account.type).toBe("DEMO");
    expect(account.broker).toBe("MT5");
    expect(account.isDefault).toBe(true); // first account of the user
    expect(account.connection?.status).toBe("CONNECTED");
    expect(account.connection?.method).toBe("API_KEY");
    expect(account.connection?.credentialsHint).toMatch(/^••••/);
    expect(account.synchronization.status).toBe("LIVE");
    expect(account.synchronization.lastRun?.status).toBe("COMPLETED");
    expect(account.snapshot).not.toBeNull();
    expect(account.provider.providerId).toBe("MOCK");
  });

  it("the connected account feeds the journal identity contract (GET /accounts)", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { environment: "LIVE" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounts",
      headers: user.authHeader,
    });
    const body = res.json();
    expect(body.accounts).toHaveLength(1);
    const parsed = accountSchema.parse(body.accounts[0]);
    expect(parsed.id).toBe(account.id);
    expect(parsed.type).toBe("LIVE");
    expect(parsed.startingBalance).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it("rejects duplicate external accounts with 409 DUPLICATE_ACCOUNT", async () => {
    const user = await authenticatedUser(app, mail);
    const externalAccountId = "DUPE-LOGIN-42";
    const first = await connectAccount(user.authHeader, { externalAccountId });
    expect(first.statusCode).toBe(201);
    const second = await connectAccount(user.authHeader, { externalAccountId });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("DUPLICATE_ACCOUNT");
  });

  it("normalizes provider credential failures to 422 INVALID_CREDENTIALS (§36)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, {
      credentials: { method: "API_KEY", secret: "fail-invalid-wrong-password" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
    expect(res.json().error).toBe("BusinessRule");
    // Nothing was persisted.
    const list = await app.inject({ method: "GET", url: "/api/v1/accounts", headers: user.authHeader });
    expect(list.json().accounts).toHaveLength(0);
  });

  it("normalizes provider outages to 502 PROVIDER_UNAVAILABLE", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, {
      credentials: { method: "API_KEY", secret: "fail-unavailable" },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("normalizes hung providers to 502 CONNECTION_TIMEOUT", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, {
      credentials: { method: "API_KEY", secret: "fail-timeout" },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("CONNECTION_TIMEOUT");
  }, 15_000);

  it("catches malformed provider payloads at the normalization boundary (502 INVALID_PROVIDER_RESPONSE)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, {
      credentials: { method: "API_KEY", secret: "fail-malformed" },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("INVALID_PROVIDER_RESPONSE");
    const list = await app.inject({ method: "GET", url: "/api/v1/accounts", headers: user.authHeader });
    expect(list.json().accounts).toHaveLength(0);
  });

  it("rejects invalid payloads with the standard validation envelope", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: user.authHeader,
      payload: { providerId: "MOCK", environment: "NOT_AN_ENVIRONMENT" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it("the second account of a user is not default", async () => {
    const user = await authenticatedUser(app, mail);
    const first = await connectAccount(user.authHeader, { externalAccountId: "FIRST-1" });
    const second = await connectAccount(user.authHeader, { externalAccountId: "SECOND-2" });
    const a = tradingAccountDetailsResponseSchema.parse(first.json()).account;
    const b = tradingAccountDetailsResponseSchema.parse(second.json()).account;
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
  });
});

// ── Synchronization ──────────────────────────────────────────────────────────

describe("accounts — synchronization (§16–§18, §38)", () => {
  it("manual sync completes and stays IDEMPOTENT across repeated runs (§18)", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "SYNC-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/sync`,
      headers: user.authHeader,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = tradingAccountSyncResponseSchema.parse(first.json());
    expect(firstBody.run.status).toBe("COMPLETED");
    expect(firstBody.run.trigger).toBe("MANUAL");

    const pos1 = tradingPositionsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${account.id}/positions`,
          headers: user.authHeader,
        })
      ).json(),
    );
    const deals1 = tradingDealsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${account.id}/deals`,
          headers: user.authHeader,
        })
      ).json(),
    );

    const second = tradingAccountSyncResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/accounts/${account.id}/sync`,
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(second.run.dealsUpserted).toBe(firstBody.run.dealsUpserted);

    const pos2 = tradingPositionsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${account.id}/positions`,
          headers: user.authHeader,
        })
      ).json(),
    );
    const deals2 = tradingDealsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${account.id}/deals`,
          headers: user.authHeader,
        })
      ).json(),
    );
    // Stable external identity — no duplicates, byte-identical content.
    expect(pos2.positions.map((p) => p.id)).toEqual(pos1.positions.map((p) => p.id));
    expect(deals2.deals.map((d) => d.externalDealId)).toEqual(deals1.deals.map((d) => d.externalDealId));
  });

  it("blocks a second concurrent run with 409 SYNC_ALREADY_RUNNING (§38)", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "CONC-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());

    const prisma = app.get(PrismaService);
    await prisma.tradingSyncRun.create({
      data: { accountId: account.id, status: "RUNNING", trigger: "MANUAL" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/sync`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SYNC_ALREADY_RUNNING");
  });

  it("sync on a disconnected account is rejected with 422 NOT_CONNECTED", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "DISC-SYNC-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    await app.inject({
      method: "DELETE",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/sync`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("NOT_CONNECTED");
  });

  it("provider auth failure during sync flips the connection to ERROR (sanitized)", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "AUTHFAIL-1" });
    // Simulate stored credentials going stale by re-encrypting a scenario secret.
    const prisma = app.get(PrismaService);
    const details = tradingAccountDetailsResponseSchema.parse(connected.json()).account;
    const enc = app.get(CredentialsEncryptionService);
    await prisma.tradingConnection.update({
      where: { accountId: details.id },
      data: { credentialsEnc: enc.encrypt("fail-invalid-stale-creds") },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${details.id}/sync`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");

    const after = tradingAccountDetailsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${details.id}`,
          headers: user.authHeader,
        })
      ).json(),
    ).account;
    // Orthogonal lifecycles (§15): the CONNECTION axis is ERROR (credentials
    // rejected), the SYNC axis reports data freshness (still LIVE) with the
    // failure visible on the run record — never a merged status.
    expect(after.connection?.status).toBe("ERROR");
    expect(after.connection?.lastError).not.toContain("fail-invalid-stale-creds");
    expect(after.synchronization.status).toBe("LIVE");
    expect(after.synchronization.lastRun?.status).toBe("FAILED");
    expect(after.synchronization.lastRun?.errorCode).toBe("INVALID_CREDENTIALS");
  });

  it("GET sync status reports the derived synchronization view", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "STATUS-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/sync`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accountId).toBe(account.id);
    expect(res.json().synchronization.status).toBe("LIVE");
    expect(res.json().synchronization.lastRun?.status).toBe("COMPLETED");
  });
});

// ── Reads + broker session ───────────────────────────────────────────────────

describe("accounts — reads and the Session-Live contract (§42/§46)", () => {
  it("serves positions, orders and deals as validated shared-contract payloads", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "READS-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    for (const [url, schema] of [
      [`/api/v1/accounts/${account.id}/positions`, tradingPositionsResponseSchema],
      [`/api/v1/accounts/${account.id}/orders`, tradingOrdersResponseSchema],
      [`/api/v1/accounts/${account.id}/deals`, tradingDealsResponseSchema],
    ] as const) {
      const res = await app.inject({ method: "GET", url, headers: user.authHeader });
      expect(res.statusCode).toBe(200);
      expect(() => schema.parse(res.json())).not.toThrow();
    }
  });

  it("GET /broker/session is NOT_CONFIGURED for a user without accounts", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/broker/session",
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const parsed = brokerSessionResponseSchema.parse(res.json());
    expect(parsed.connected).toBe(false);
    expect(parsed.state).toBe("NOT_CONFIGURED");
    expect(parsed.account).toBeNull();
    expect(parsed.reason).not.toContain(SECRET);
  });

  it("GET /broker/session exposes the connected default account snapshot + state", async () => {
    const user = await authenticatedUser(app, mail);
    await connectAccount(user.authHeader, { externalAccountId: "BROKER-1" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/broker/session",
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const parsed = brokerSessionResponseSchema.parse(res.json());
    expect(parsed.connected).toBe(true);
    expect(parsed.state).toBe("CONNECTED");
    expect(parsed.account?.accountNumber).toBe("BROKER-1");
    expect(parsed.account?.balance).toMatch(/^-?\d+(\.\d+)?$/);
    expect(parsed.lastSyncAt).not.toBeNull();
  });

  it("unknown and foreign account ids are 404 (never leaky)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${crypto.randomUUID()}`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(404);
    const malformed = await app.inject({
      method: "GET",
      url: "/api/v1/accounts/not-a-uuid",
      headers: user.authHeader,
    });
    expect(malformed.statusCode).toBe(400);
  });
});

// ── Test / reconnect / disconnect lifecycle ─────────────────────────────────

describe("accounts — connection lifecycle (§15, §52)", () => {
  it("test returns four named honest checks", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "TEST-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/connection/test`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const parsed = tradingConnectionTestResponseSchema.parse(res.json());
    expect(parsed.ok).toBe(true);
    expect(parsed.checks.map((c) => c.name)).toEqual([
      "authentication",
      "connectivity",
      "providerResponse",
      "permissions",
    ]);
  });

  it("test on a disconnected account → 422 NOT_CONNECTED", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "TEST-2" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    await app.inject({
      method: "DELETE",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/connection/test`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("NOT_CONNECTED");
  });

  it("reconnect restores a disconnected account and re-syncs", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "RE-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    await app.inject({
      method: "DELETE",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
      payload: { credentials: { method: "API_KEY", secret: SECRET } },
    });
    expect(res.statusCode).toBe(200);
    const restored = tradingAccountDetailsResponseSchema.parse(res.json()).account;
    expect(restored.connection?.status).toBe("CONNECTED");
    expect(restored.synchronization.status).toBe("LIVE");
    expect(restored.connection?.credentialsHint).toMatch(/^••••/);
  });

  it("reconnect while CONNECTED → 409 ALREADY_CONNECTED", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "RE-2" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
      payload: { credentials: { method: "API_KEY", secret: SECRET } },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ALREADY_CONNECTED");
  });

  it("reconnect with bad credentials → 422 and connection stays disconnected", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "RE-3" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    await app.inject({
      method: "DELETE",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
      payload: { credentials: { method: "API_KEY", secret: "fail-invalid" } },
    });
    expect(res.statusCode).toBe(422);
    const details = tradingAccountDetailsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${account.id}`,
          headers: user.authHeader,
        })
      ).json(),
    ).account;
    expect(details.connection?.status).toBe("DISCONNECTED");
  });

  it("disconnect wipes credentials, preserves history and journal data (§52)", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "DISC-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(tradingDisconnectResponseSchema.parse(res.json())).toEqual({
      accountId: account.id,
      status: "DISCONNECTED",
      historyPreserved: true,
    });

    const details = tradingAccountDetailsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/accounts/${account.id}`,
          headers: user.authHeader,
        })
      ).json(),
    ).account;
    expect(details.connection?.status).toBe("DISCONNECTED");
    expect(details.connection?.credentialsHint).toBe("");
    // History preserved:
    expect(details.synchronization.lastRun).not.toBeNull();
    const positions = await app.inject({
      method: "GET",
      url: `/api/v1/accounts/${account.id}/positions`,
      headers: user.authHeader,
    });
    expect(positions.statusCode).toBe(200);

    // The journal identity list still carries the account.
    const list = await app.inject({ method: "GET", url: "/api/v1/accounts", headers: user.authHeader });
    expect(list.json().accounts).toHaveLength(1);

    // Broker session honestly reports no connection.
    const session = brokerSessionResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/broker/session",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(session.state).toBe("NOT_CONFIGURED");
  });
});

// ── Ownership / security ─────────────────────────────────────────────────────

describe("accounts — ownership and security (§19, §22, §47)", () => {
  it("user B cannot read, sync, test or disconnect user A's account (404 everywhere)", async () => {
    const { a, b } = await userAandB();
    const connected = await connectAccount(a.authHeader, { externalAccountId: "OWN-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());

    for (const [method, url] of [
      ["GET", `/api/v1/accounts/${account.id}`],
      ["GET", `/api/v1/accounts/${account.id}/positions`],
      ["GET", `/api/v1/accounts/${account.id}/orders`],
      ["GET", `/api/v1/accounts/${account.id}/deals`],
      ["GET", `/api/v1/accounts/${account.id}/snapshot`],
      ["GET", `/api/v1/accounts/${account.id}/sync`],
      ["POST", `/api/v1/accounts/${account.id}/sync`],
      ["POST", `/api/v1/accounts/${account.id}/connection/test`],
      ["POST", `/api/v1/accounts/${account.id}/connection`],
      ["DELETE", `/api/v1/accounts/${account.id}/connection`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: b.authHeader,
        payload: method === "POST" && url.endsWith("/connection")
          ? { credentials: { method: "API_KEY", secret: SECRET } }
          : undefined,
      });
      expect(res.statusCode, `${method} ${url} as user B`).toBe(404);
    }
  });

  it("user B's broker session never shows user A's account", async () => {
    const { a, b } = await userAandB();
    await connectAccount(a.authHeader, { externalAccountId: "OWN-2" });
    const session = brokerSessionResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/broker/session",
          headers: b.authHeader,
        })
      ).json(),
    );
    expect(session.state).toBe("NOT_CONFIGURED");
  });

  it("SECURITY: the credential secret never appears in any response surface", async () => {
    const user = await authenticatedUser(app, mail);
    const secret = "top-secret-credential-31415926";
    const connected = await connectAccount(user.authHeader, {
      externalAccountId: "SEC-1",
      credentials: { method: "API_KEY", secret },
    });
    const surfaces: string[] = [connected.body];
    surfaces.push(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/accounts",
          headers: user.authHeader,
        })
      ).body,
    );
    const accountId = tradingAccountDetailsResponseSchema.parse(connected.json()).account.id;
    for (const url of [
      `/api/v1/accounts/${accountId}`,
      `/api/v1/accounts/${accountId}/snapshot`,
      `/api/v1/accounts/${accountId}/positions`,
      `/api/v1/accounts/${accountId}/orders`,
      `/api/v1/accounts/${accountId}/deals`,
      `/api/v1/accounts/${accountId}/sync`,
      "/api/v1/broker/session",
      "/api/v1/accounts/providers",
    ]) {
      surfaces.push(
        (
          await app.inject({ method: "GET", url, headers: user.authHeader })
        ).body,
      );
    }
    // And a provider failure surface (sanitized messages):
    surfaces.push(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/accounts/${accountId}/connection`,
          headers: user.authHeader,
          payload: { credentials: { method: "API_KEY", secret: "fail-invalid-x" } },
        })
      ).body,
    );
    for (const body of surfaces) {
      expect(body).not.toContain(secret);
      expect(body).not.toContain("31415926");
    }
  });

  it("SECURITY: provider failure messages are sanitized (no secret material)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await connectAccount(user.authHeader, {
      credentials: { method: "API_KEY", secret: "fail-invalid-my-broker-password-777" },
    });
    expect(res.body).not.toContain("my-broker-password-777");
  });

  it("EXECUTION RED LINE (§47): no write/execute route exists on the accounts surface", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "EXEC-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    for (const [method, url] of [
      ["POST", `/api/v1/accounts/${account.id}/orders`],
      ["PATCH", `/api/v1/accounts/${account.id}/orders/order-1`],
      ["DELETE", `/api/v1/accounts/${account.id}/orders/order-1`],
      ["POST", `/api/v1/accounts/${account.id}/positions/pos-1/close`],
      ["PATCH", `/api/v1/accounts/${account.id}/positions/pos-1`],
    ] as const) {
      const res = await app.inject({ method, url, headers: user.authHeader, payload: {} });
      expect(res.statusCode, `${method} ${url} must not exist`).toBe(404);
    }
  });

  it("rate limits connection attempts per user (429 + Retry-After, §37)", async () => {
    const user = await authenticatedUser(app, mail);
    let lastStatus = 0;
    let saw429 = false;
    for (let i = 0; i < 7; i += 1) {
      const res = await connectAccount(user.authHeader, {
        credentials: { method: "API_KEY", secret: "fail-unavailable" },
      });
      lastStatus = res.statusCode;
      if (res.statusCode === 429) {
        saw429 = true;
        expect(res.headers["retry-after"]).toBeDefined();
        break;
      }
      expect(res.statusCode).toBe(502); // provider failure, not rate limit
    }
    expect(saw429).toBe(true);
    expect(lastStatus).toBe(429);
  });
});

// ── Audit trail ──────────────────────────────────────────────────────────────

describe("accounts — audit events (§39)", () => {
  it("records connect / disconnect / sync-failure events without secrets", async () => {
    const email = uniqueEmail("audit");
    const user = await authenticatedUser(app, mail, { email });
    const connected = await connectAccount(user.authHeader, { externalAccountId: "AUD-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());
    await app.inject({
      method: "DELETE",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/accounts/${account.id}/connection`,
      headers: user.authHeader,
      payload: { credentials: { method: "API_KEY", secret: "fail-invalid" } },
    }).catch(() => undefined);

    const prisma = app.get(PrismaService);
    const events = await prisma.securityEvent.findMany({
      where: { userId: user.userId },
      orderBy: { at: "asc" },
    });
    const types = events.map((e) => e.type);
    expect(types).toContain("TRADING_ACCOUNT_CONNECTED");
    expect(types).toContain("TRADING_ACCOUNT_DISCONNECTED");
    expect(types).toContain("TRADING_ACCOUNT_CONNECTION_FAILED");
    for (const event of events) {
      expect(event.context).not.toContain(SECRET);
      expect(event.context).not.toContain("fail-invalid");
    }
    // The trading events themselves carry sanitized context only.
    const tradingEvents = events.filter((e) => e.type.startsWith("TRADING_"));
    expect(tradingEvents.length).toBeGreaterThanOrEqual(3);
    for (const event of tradingEvents) {
      expect(event.context).toMatch(/^((?!(api-)?key|secret|credential value).)*$/is);
    }
  });
});

// ── Rich surface (Phase 02 — registered TradingAccountsController) ──────────

describe("trading-accounts — registered rich surface (Phase 02 hygiene)", () => {
  it("serves the details-list and rename (PATCH) routes the UI consumes", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await connectAccount(user.authHeader, { externalAccountId: "RICH-1" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());

    // GET /trading-accounts — the connectivity list (details shape per account).
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/trading-accounts",
      headers: user.authHeader,
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json();
    expect(Array.isArray(listed.accounts)).toBe(true);
    expect(listed.accounts).toHaveLength(1);
    const rich = tradingAccountDetailsSchema.parse(listed.accounts[0]);
    expect(rich.id).toBe(account.id);
    expect(rich.provider.providerId).toBe("MOCK");
    expect(rich.connection?.status).toBe("CONNECTED");

    // PATCH /trading-accounts/:id — rename (label only).
    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/v1/trading-accounts/${account.id}`,
      headers: user.authHeader,
      payload: { name: "Renamed Rich Account" },
    });
    expect(renamed.statusCode).toBe(200);
    const parsed = tradingAccountDetailsResponseSchema.parse(renamed.json());
    expect(parsed.account.name).toBe("Renamed Rich Account");
    // Provider-anchored identity untouched by the rename.
    expect(parsed.account.externalAccountId).toBe(account.externalAccountId);
    expect(parsed.account.connection?.status).toBe("CONNECTED");

    // Validation: empty name → 422 (schema min(1)); foreign id → 404.
    const invalid = await app.inject({
      method: "PATCH",
      url: `/api/v1/trading-accounts/${account.id}`,
      headers: user.authHeader,
      payload: { name: "   " },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("keeps ownership and auth on the rich surface (401 / 404 foreign)", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/api/v1/trading-accounts" });
    expect(noAuth.statusCode).toBe(401);

    const { a, b } = await userAandB();
    const connected = await connectAccount(a.authHeader, { externalAccountId: "RICH-2" });
    const { account } = tradingAccountDetailsResponseSchema.parse(connected.json());

    const foreign = await app.inject({
      method: "PATCH",
      url: `/api/v1/trading-accounts/${account.id}`,
      headers: b.authHeader,
      payload: { name: "Stolen Label" },
    });
    expect(foreign.statusCode).toBe(404);

    const foreignList = await app.inject({
      method: "GET",
      url: "/api/v1/trading-accounts",
      headers: b.authHeader,
    });
    expect(foreignList.statusCode).toBe(200);
    expect(foreignList.json().accounts).toHaveLength(0);
  });
});

// ── MT5 terminal bridge — public ingest route (Phase 08, EA-parity E2E) ──────
//
// The bridge is the ONLY public (JWT-free) route of the trading-accounts
// surface. These tests push EXACTLY what docs/bridge/EuforiaBridge.mq5
// v1.0.x sends: envelope {eventId, kind, payload} with decimals as strings,
// canonical `${ts}.${JSON.stringify({eventId, kind, payload})}` signed
// HMAC-SHA256, headers x-bridge-key/timestamp/signature/event-id. The
// timestamp cases cover BOTH EA generations: v1.0.0 sends epoch SECONDS
// ((long)TimeGMT()), v1.0.1+ sends MILLISECONDS — both must authenticate
// (magnitude detection), while stale/replayed timestamps must not.

import { createHmac } from "node:crypto";

describe("trading-accounts — MT5 bridge ingest (public, HMAC)", () => {
  function signEnvelope(
    secret: string,
    timestamp: number | string,
    envelope: Record<string, unknown>,
  ): string {
    return createHmac("sha256", secret)
      .update(`${timestamp}.${JSON.stringify(envelope)}`)
      .digest("hex");
  }

  async function pairedBridgeAccount(externalAccountId = "52988790") {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/connect",
      headers: user.authHeader,
      payload: { providerId: "mt5-bridge", environment: "DEMO", externalAccountId },
    });
    expect(res.statusCode).toBe(201);
    const { account } = res.json() as {
      account: { id: string; externalAccountId: string; pairing: { bridgeKeyId: string; secret: string } };
    };
    expect(account.pairing.bridgeKeyId).toMatch(/^brg_/);
    expect(account.pairing.secret).toMatch(/^bks_/);
    return { user, account, pairing: account.pairing };
  }

  async function push(input: {
    keyId: string;
    secret: string;
    timestamp: number;
    envelope: Record<string, unknown>;
  }) {
    return app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/bridge/ingest",
      headers: {
        "content-type": "application/json",
        "x-bridge-key": input.keyId,
        "x-bridge-timestamp": String(input.timestamp),
        "x-bridge-signature": signEnvelope(input.secret, input.timestamp, input.envelope),
        "x-bridge-event-id": String(input.envelope.eventId),
      },
      payload: input.envelope,
    });
  }

  it("401 BRIDGE_HEADER_MISSING when any bridge header is absent", async () => {
    const { pairing } = await pairedBridgeAccount(`88${Math.random().toString().slice(2, 8)}`);
    const envelope = {
      eventId: "ea-e2e-missing-hdr-1",
      kind: "ACCOUNT_INFO",
      payload: { externalAccountId: "52988790", currency: "USD" },
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trading-accounts/bridge/ingest",
      headers: {
        "content-type": "application/json",
        "x-bridge-key": pairing.bridgeKeyId,
        "x-bridge-signature": signEnvelope(pairing.secret, Date.now(), envelope),
        "x-bridge-event-id": envelope.eventId,
        // x-bridge-timestamp deliberately absent
      },
      payload: envelope,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("BRIDGE_HEADER_MISSING");
  });

  it("401 BRIDGE_STALE_TIMESTAMP on an out-of-window timestamp", async () => {
    const { pairing } = await pairedBridgeAccount(`88${Math.random().toString().slice(2, 8)}`);
    const envelope = {
      eventId: "ea-e2e-stale-1",
      kind: "ACCOUNT_INFO",
      payload: { externalAccountId: "52988790", currency: "USD" },
    };
    const staleMs = Date.now() - 6 * 60 * 1000; // beyond the ±5 min window
    const res = await push({
      keyId: pairing.bridgeKeyId,
      secret: pairing.secret,
      timestamp: staleMs,
      envelope,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("BRIDGE_STALE_TIMESTAMP");
  });

  it("accepts EA v1.0.0 epoch-SECONDS timestamps (magnitude detection) and activates the pairing", async () => {
    const { pairing } = await pairedBridgeAccount(`88${Math.random().toString().slice(2, 8)}`);
    const envelope = {
      eventId: "ea-e2e-seconds-1",
      kind: "ACCOUNT_INFO",
      payload: {
        externalAccountId: "52988790",
        currency: "USD",
        leverage: "500",
        server: "ICMarketsSC-MT5",
        brokerName: "IC Markets (SC) Global",
        accountClass: "DEMO",
      },
    };
    const seconds = Math.floor(Date.now() / 1000); // exactly what v1.0.0 sends
    const res = await push({
      keyId: pairing.bridgeKeyId,
      secret: pairing.secret,
      timestamp: seconds,
      envelope,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accepted: true, duplicate: false, state: "CONNECTED" });
    // Replay (same event id) dedupes but stays accepted.
    const replay = await push({
      keyId: pairing.bridgeKeyId,
      secret: pairing.secret,
      timestamp: seconds,
      envelope,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ accepted: true, duplicate: true, state: "CONNECTED" });
  });

  it("401 BRIDGE_BAD_SIGNATURE when the secret differs", async () => {
    const { pairing } = await pairedBridgeAccount(`88${Math.random().toString().slice(2, 8)}`);
    const envelope = {
      eventId: "ea-e2e-badsig-1",
      kind: "ACCOUNT_INFO",
      payload: { externalAccountId: "52988790", currency: "USD" },
    };
    const res = await push({
      keyId: pairing.bridgeKeyId,
      secret: "bks_wrong_secret_entirely",
      timestamp: Date.now(),
      envelope,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("BRIDGE_BAD_SIGNATURE");
  });

  it("full loop — pushes → sync → journal trades (EA-parity payloads, balance ops excluded)", async () => {
    const { user, account, pairing } = await pairedBridgeAccount(
      `88${Math.random().toString().slice(2, 8)}`,
    );

    // The reconstruction maps deals to journal trades THROUGH the Instrument
    // table — seed the bridged symbol the way the dev seed does.
    const symbol = "XAGEUR";
    await app.get(PrismaService).instrument.upsert({
      where: { symbol },
      create: {
        symbol,
        name: "Silver vs Euro",
        assetClass: "METAL",
        quoteCurrency: "EUR",
        pipSize: "0.001",
        digits: 3,
        contractSize: "5000",
      },
      update: {},
    });

    // 1) ACCOUNT_INFO (EA v1.0.1 — ms epoch) → activates + identifies broker.
    const info = await push({
      keyId: pairing.bridgeKeyId,
      secret: pairing.secret,
      timestamp: Date.now(),
      envelope: {
        eventId: "ea-e2e-loop-info-1",
        kind: "ACCOUNT_INFO",
        payload: {
          externalAccountId: account.externalAccountId,
          currency: "USD",
          leverage: "200",
          server: "ICMarketsSC-MT5",
          brokerName: "IC Markets (SC) Global",
          accountClass: "DEMO",
        },
      },
    });
    expect(info.statusCode).toBe(200);
    expect(info.json().state).toBe("CONNECTED");

    // 2) SNAPSHOT — decimals as strings (EA JDec semantics).
    const snap = await push({
      keyId: pairing.bridgeKeyId,
      secret: pairing.secret,
      timestamp: Date.now(),
      envelope: {
        eventId: "ea-e2e-loop-snap-1",
        kind: "SNAPSHOT",
        payload: {
          balance: "10000.00000",
          equity: "10020.00000",
          margin: "120.00000",
          freeMargin: "9900.00000",
          marginLevel: "8350.00000",
        },
      },
    });
    expect(snap.statusCode).toBe(200);

    // 3) DEALS — one netting position (IN + OUT), one balance op (excluded).
    const deals = await push({
      keyId: pairing.bridgeKeyId,
      secret: pairing.secret,
      timestamp: Date.now(),
      envelope: {
        eventId: "ea-e2e-loop-deals-1",
        kind: "DEALS",
        payload: {
          deals: [
            {
              externalDealId: "900001",
              symbol: "XAGEUR",
              side: "BUY",
              volume: "0.50000",
              price: "28.50000",
              profit: "0.00000",
              commission: "-1.75000",
              swap: "0.00000",
              positionId: "700123",
              executedAt: "2026-10-14T09:30:00Z",
            },
            {
              externalDealId: "900002",
              symbol: "XAGEUR",
              side: "SELL",
              volume: "0.50000",
              price: "28.56000",
              profit: "30.00000",
              commission: "-1.76000",
              swap: "0.00000",
              positionId: "700123",
              executedAt: "2026-10-14T10:45:00Z",
            },
            {
              externalDealId: "900003",
              symbol: null,
              side: "BUY",
              volume: "0.00000",
              price: null,
              profit: "5000.00000",
              commission: "0.00000",
              swap: "0.00000",
              positionId: null,
              executedAt: "2026-10-14T08:00:00Z",
            },
          ],
          observedThrough: "1760436300",
          complete: true,
        },
      },
    });
    expect(deals.statusCode).toBe(200);

    // 4) Account sync — the pull orchestrator reads the persisted events.
    const sync = await app.inject({
      method: "POST",
      url: `/api/v1/trading-accounts/${account.id}/sync`,
      headers: user.authHeader,
      payload: {},
    });
    expect(sync.statusCode).toBe(200);

    // 5) Journal reconciliation is LAZY: GET /trades re-reconciles the
    //    account's latest synchronized activity before serving the list
    //    (trades.service listTrades — idempotent by external position). The
    //    balance operation (symbol null) never becomes a trade.
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/trades?accountId=${account.id}`,
      headers: user.authHeader,
    });
    expect(list.statusCode).toBe(200);
    const trades = list.json().trades as Array<Record<string, unknown>>;
    expect(trades).toHaveLength(1);
    const [trade] = trades;
    if (!trade) throw new Error("expected the reconstructed trade");
    // The wire carries instrumentId — resolve it back to the bridged symbol.
    const instrument = await app
      .get(PrismaService)
      .instrument.findUnique({ where: { id: String(trade.instrumentId) }, select: { symbol: true } });
    expect(instrument?.symbol).toBe("XAGEUR");
    expect(trade).toMatchObject({
      direction: "BUY",
      status: "CLOSED",
    });
    // Net P&L = profit + commissions + swap across the position's legs.
    expect(Number(trade.pnlNet)).toBeCloseTo(30 - 1.75 - 1.76, 2);
  });
});
