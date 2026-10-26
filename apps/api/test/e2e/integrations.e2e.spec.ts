/**
 * e2e - Integration Hub (B14): the platform layer over the REAL AppModule +
 * real database. Covers the overview seed (registry + honest nulls), the
 * connect → test → sync lifecycle with licensing/already-connected gates,
 * §26 history-preserved disconnect, §32 demo scenarios and the §12 webhook
 * pipeline (signature → timestamp → idempotency). Responses are validated
 * against the SHARED Zod contract - the same schemas the frontend reads.
 * Mirrors `mocks/handlers/integrations.ts` behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  integrationsOverviewResponseSchema,
  integrationProviderSchema,
  integrationSyncResponseSchema,
  integrationTestResponseSchema,
  integrationDisconnectResponseSchema,
  webhookDeliverResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

describe("integration hub (B14)", () => {
  it("overview lazily seeds the registry: 12 providers, honest nulls, event log", async () => {
    const user = await authenticatedUser(app, mail);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/integrations/overview",
      headers: user.authHeader,
    });
    expect(response.statusCode).toBe(200);
    const overview = integrationsOverviewResponseSchema.parse(response.json());
    expect(overview.providers).toHaveLength(12);
    // Demo beats: 5 pre-connected registry entries.
    expect(overview.summary.connected).toBe(5);
    const deriv = overview.providers.find((provider) => provider.id === "deriv");
    expect(deriv?.status).toBe("CONNECTED");
    // §6 honesty - the broker adapter has never sent real numbers.
    expect(overview.accounts[0]?.balance).toBeNull();
    expect(overview.accounts[0]?.equity).toBeNull();
    // Economic pipeline fed by the normalization layer, sorted by time.
    expect(overview.ecoEvents.length).toBeGreaterThan(0);
    for (let index = 1; index < overview.ecoEvents.length; index += 1) {
      const previous = overview.ecoEvents[index - 1];
      const current = overview.ecoEvents[index];
      expect(previous !== undefined && current !== undefined && previous.scheduledAt <= current.scheduledAt).toBe(true);
    }
    expect(overview.webhooks).toHaveLength(1);
    expect(overview.webhooks[0]?.id).toBe("wh-macro");
    // Secret material never rides the wire (§18).
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain("whsec_demo_77b1e7c1");
    expect(serialized).not.toContain("deriv-demo-token-9f2a4c");
  });

  it("connect → sync lifecycle with gates: license 422, duplicate 409, unknown 404", async () => {
    const user = await authenticatedUser(app, mail);

    // §29 - the unverified news provider can never be connected.
    const licensed = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/news-wire/connect",
      headers: user.authHeader,
      payload: { vaultRef: "vault://news-wire/api-key" },
    });
    expect(licensed.statusCode).toBe(422);
    expect(licensed.json().code).toBe("LICENSE_UNVERIFIED");

    // Deriv is connected by seed → 409.
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/deriv/connect",
      headers: user.authHeader,
      payload: { vaultRef: "vault://deriv/api-token" },
    });
    expect(duplicate.statusCode).toBe(409);

    // Unknown provider.
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/nope/connect",
      headers: user.authHeader,
      payload: { vaultRef: "vault://nope/key" },
    });
    expect(unknown.statusCode).toBe(404);

    // MT5 bridge: connect with a fresh vault ref, then sync.
    const connect = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/mt5-bridge/connect",
      headers: user.authHeader,
      payload: { vaultRef: "vault://mt5-bridge/local-key" },
    });
    expect(connect.statusCode).toBe(200);
    const provider = integrationProviderSchema.parse(connect.json());
    expect(provider.status).toBe("CONNECTED");
    expect(provider.credentials?.maskedHint).toBe("••••-key");

    const sync = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/mt5-bridge/sync",
      headers: user.authHeader,
    });
    expect(sync.statusCode).toBe(200);
    const syncBody = integrationSyncResponseSchema.parse(sync.json());
    expect(syncBody.status).toBe("CONNECTED");
    // Account snapshot refresh - exactly one record, nulls stay nulls.
    expect(syncBody.sync.recordsProcessed).toBe(1);
    expect(syncBody.sync.lastSuccessAt).not.toBeNull();

    // §32 - cTrader's FIRST pairing ships the expired-key scenario.
    const ctrader = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/ctrader/connect",
      headers: user.authHeader,
      payload: { vaultRef: "vault://ctrader/open-api" },
    });
    expect(ctrader.statusCode).toBe(200);
    expect(ctrader.json().status).toBe("AUTH_REQUIRED");
    expect(ctrader.json().authState).toBe("EXPIRED");

    // The safe test fails with a named CREDENTIALS_EXPIRED ledger entry.
    const test = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/ctrader/test",
      headers: user.authHeader,
    });
    expect(test.statusCode).toBe(200);
    const testBody = integrationTestResponseSchema.parse(test.json());
    expect(testBody.ok).toBe(false);
    expect(testBody.checks.some((check) => check.name === "authentication" && !check.ok)).toBe(true);

    // Recover: disconnect (history preserved) → reconnect → test passes.
    const disconnect = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/ctrader/disconnect",
      headers: user.authHeader,
    });
    expect(disconnect.statusCode).toBe(200);
    const disconnectBody = integrationDisconnectResponseSchema.parse(disconnect.json());
    expect(disconnectBody.historyPreserved).toBe(true);

    const reconnect = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/ctrader/connect",
      headers: user.authHeader,
      payload: { vaultRef: "vault://ctrader/rotated" },
    });
    expect(reconnect.statusCode).toBe(200);
    expect(reconnect.json().status).toBe("CONNECTED");

    const recovered = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/ctrader/test",
      headers: user.authHeader,
    });
    const recoveredBody = integrationTestResponseSchema.parse(recovered.json());
    expect(recoveredBody.ok).toBe(true);
  });

  it("webhook pipeline: valid delivery accepted, replay duplicate, bad signature, stale timestamp", async () => {
    const user = await authenticatedUser(app, mail);

    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/integrations/overview",
      headers: user.authHeader,
    });
    const ecoEvent = integrationsOverviewResponseSchema.parse(overview.json()).ecoEvents[0];
    expect(ecoEvent).toBeDefined();
    if (ecoEvent === undefined) throw new Error("expected a seeded eco event");

    // 1) valid delivery - event applied to the referenced normalized record.
    const valid = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/webhooks/wh-macro/simulate",
      headers: user.authHeader,
      payload: {
        eventType: "eco.actual",
        payload: { eventRef: ecoEvent.providerKey, actual: "219" },
        mode: "valid",
      },
    });
    expect(valid.statusCode).toBe(200);
    const validBody = webhookDeliverResponseSchema.parse(valid.json());
    expect(validBody.accepted).toBe(true);
    expect(validBody.duplicate).toBe(false);

    // The normalized record now carries the actual (§22 real-time update).
    const afterValid = await app.inject({
      method: "GET",
      url: "/api/v1/integrations/overview",
      headers: user.authHeader,
    });
    const updated = integrationsOverviewResponseSchema
      .parse(afterValid.json())
      .ecoEvents.find((event) => event.providerKey === ecoEvent.providerKey);
    expect(updated?.actual).toBe("219");

    // 2) replay the same event → idempotency holds.
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/webhooks/wh-macro/simulate",
      headers: user.authHeader,
      payload: {
        eventType: "eco.actual",
        payload: { eventRef: ecoEvent.providerKey, actual: "219" },
        mode: "replay",
      },
    });
    const replayBody = webhookDeliverResponseSchema.parse(replay.json());
    expect(replayBody.duplicate).toBe(true);
    expect(replayBody.accepted).toBe(false);

    // 3) corrupted signature rejected with a recorded delivery.
    const badSignature = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/webhooks/wh-macro/simulate",
      headers: user.authHeader,
      payload: {
        eventType: "eco.actual",
        payload: { eventRef: ecoEvent.providerKey },
        mode: "bad-signature",
      },
    });
    const badBody = webhookDeliverResponseSchema.parse(badSignature.json());
    expect(badBody.signatureValid).toBe(false);
    expect(badBody.accepted).toBe(false);

    // 4) stale timestamp rejected before signature checks.
    const stale = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/webhooks/wh-macro/simulate",
      headers: user.authHeader,
      payload: {
        eventType: "eco.actual",
        payload: { eventRef: ecoEvent.providerKey },
        mode: "stale-timestamp",
      },
    });
    const staleBody = webhookDeliverResponseSchema.parse(stale.json());
    expect(staleBody.accepted).toBe(false);
    expect(staleBody.signatureValid).toBe(true);

    // Deliveries are bounded + visible in the overview (secret stripped).
    const finalOverview = integrationsOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/integrations/overview", headers: user.authHeader })).json(),
    );
    expect(finalOverview.webhooks[0]?.deliveries.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(finalOverview.webhooks[0]?.deliveries)).not.toContain("whsec_demo");
  });

  it("macro sync advances the cursor and releases a scheduled event (§13→§15)", async () => {
    const user = await authenticatedUser(app, mail);
    const sync = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/providers/macro-sample/sync",
      headers: user.authHeader,
    });
    expect(sync.statusCode).toBe(200);
    const body = integrationSyncResponseSchema.parse(sync.json());
    // The seed cursor was batch-7 - this sync consumed batch-8.
    expect(body.sync.cursor).toBe("batch-8");
    expect(body.sync.recordsProcessed).toBeGreaterThanOrEqual(1);
  });
});
