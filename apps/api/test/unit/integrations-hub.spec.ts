/**
 * Unit - Integrations Hub pure domain (Phase 14).
 *
 * Covers the decision layer without HTTP/DB: connect/disconnect/test/sync
 * outcome builders (mock §25-§17 parity), the webhook pipeline evaluator
 * (§12/§22/§23), the provider registry invariants (§11/§29) and the
 * deterministic sample-news adapter.
 */
import { describe, expect, it } from "vitest";

import {
  buildConnectOutcome,
  buildDisconnectOutcome,
  buildSyncOutcome,
  buildTestOutcome,
  maskedHintFor,
  partialSyncDue,
  recordsProcessedFor,
  syncDurationMs,
  testEventTypeFor,
} from "../../src/modules/integrations/domain/integration-lifecycle";
import {
  evaluateWebhookDelivery,
  generateWebhookSecret,
  serializeWebhookBody,
  signWebhookBody,
  signaturesMatch,
  simulateEventId,
  webhookSecretHint,
} from "../../src/modules/integrations/domain/webhook-pipeline";
import {
  findProvider,
  findWebhookInboundProvider,
  PROVIDER_CATALOG,
} from "../../src/modules/integrations/domain/provider-catalog";
import { listSampleNews } from "../../src/modules/integrations/infrastructure/builtin-news";

const NOW = new Date("2026-03-02T12:00:00.000Z");

// ── Provider registry (§11/§29) ──────────────────────────────────────────────

describe("provider catalog", () => {
  it("exposes the audited 12-provider registry with unique ids", () => {
    expect(PROVIDER_CATALOG).toHaveLength(12);
    const ids = PROVIDER_CATALOG.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gates the three unlicensed registrations (§29)", () => {
    for (const id of ["binance-exchange", "news-wire", "macro-sample"]) {
      expect(findProvider(id)?.licensing.verified).toBe(false);
    }
    expect(findProvider("deriv")?.licensing.verified).toBe(true);
  });

  it("carries the per-provider rate contracts (§25)", () => {
    expect(findProvider("macro-sample")?.rateLimit).toEqual({ limitPerWindow: 3, windowMs: 10_000 });
    expect(findProvider("binance-market")?.rateLimit).toEqual({ limitPerWindow: 60, windowMs: 60_000 });
    expect(findProvider("deriv")?.rateLimit).toEqual({ limitPerWindow: 30, windowMs: 60_000 });
  });

  it("declares WEBHOOK_INBOUND on exactly one provider (§10/§21)", () => {
    const inbound = PROVIDER_CATALOG.filter((provider) =>
      provider.capabilities.includes("WEBHOOK_INBOUND"),
    );
    expect(inbound).toHaveLength(1);
    expect(findWebhookInboundProvider()?.id).toBe("macro-sample");
  });

  it("keeps every registration read-only (§19 - no execution surface)", () => {
    expect(PROVIDER_CATALOG.every((provider) => provider.readOnly)).toBe(true);
  });
});

// ── Connect (§25) ────────────────────────────────────────────────────────────

describe("buildConnectOutcome", () => {
  it("connects a licensed provider with a masked hint from the vault reference", () => {
    const deriv = findProvider("deriv")!;
    const outcome = buildConnectOutcome(deriv, false, "vault://deriv/api-token", NOW);
    expect(outcome.status).toBe("CONNECTED");
    expect(outcome.authState).toBe("OK");
    expect(outcome.credentials.maskedHint).toBe("••••oken");
    expect(outcome.credentials.vaultRef).toBe("vault://deriv/api-token");
    expect(outcome.eventType).toBe("CONNECTED");
    expect(outcome.eventMessage).toContain("vault://deriv/api-token");
    expect(outcome.clearErrorCodes).toContain("CREDENTIALS_EXPIRED");
  });

  it("ships the one-shot expired-credential scenario on cTrader's first pairing (§32)", () => {
    const ctrader = findProvider("ctrader")!;
    const first = buildConnectOutcome(ctrader, true, "vault://ctrader/demo", NOW);
    expect(first.status).toBe("AUTH_REQUIRED");
    expect(first.authState).toBe("EXPIRED");
    expect(first.scenario).toBe("expired-credentials");
    expect(first.eventType).toBe("TEST_FAILED");

    const second = buildConnectOutcome(ctrader, false, "vault://ctrader/demo", NOW);
    expect(second.status).toBe("CONNECTED");
    expect(second.scenario).toBeNull();
  });
});

describe("maskedHintFor", () => {
  it("masks all but the last four characters", () => {
    expect(maskedHintFor("vault://deriv/api-token")).toBe("••••oken");
    expect(maskedHintFor("vault://ab/cd")).toBe("••••b/cd");
  });
});

// ── Disconnect (§26) ─────────────────────────────────────────────────────────

describe("buildDisconnectOutcome", () => {
  it("detaches credentials, clears retries and preserves history", () => {
    const outcome = buildDisconnectOutcome();
    expect(outcome.status).toBe("DISCONNECTED");
    expect(outcome.authState).toBe("MISSING");
    expect(outcome.credentials).toBeNull();
    expect(outcome.syncNextRetryAt).toBeNull();
    expect(outcome.eventType).toBe("DISCONNECTED");
    expect(outcome.clearAllErrors).toBe(true);
  });
});

// ── Connection test (§18) ────────────────────────────────────────────────────

describe("buildTestOutcome", () => {
  const deriv = findProvider("deriv")!;
  const tradingview = findProvider("tradingview")!;

  it("passes all four checks for a healthy connection", () => {
    const outcome = buildTestOutcome(deriv, true, null, NOW);
    expect(outcome.response.ok).toBe(true);
    expect(outcome.response.checks.map((check) => check.name)).toEqual([
      "authentication",
      "permissions",
      "connectivity",
      "providerResponse",
    ]);
    expect(outcome.status).toBe("CONNECTED");
    expect(outcome.error).toBeNull();
  });

  it("fails authentication honestly when no credential is stored", () => {
    const outcome = buildTestOutcome(deriv, false, null, NOW);
    const auth = outcome.response.checks.find((check) => check.name === "authentication");
    expect(auth?.ok).toBe(false);
    expect(auth?.detail).toBe("No credential stored - connect the provider first");
    expect(outcome.status).toBe("AUTH_REQUIRED");
    expect(outcome.error?.code).toBe("CREDENTIALS_EXPIRED");
  });

  it("reports the expired-credential scenario distinctly", () => {
    const outcome = buildTestOutcome(deriv, true, "expired-credentials", NOW);
    const auth = outcome.response.checks.find((check) => check.name === "authentication");
    expect(auth?.detail).toBe("Stored credential is expired - rotate the key and reconnect");
    expect(outcome.response.ok).toBe(false);
  });

  it("keeps visualization-only providers honest about permissions", () => {
    const outcome = buildTestOutcome(tradingview, false, null, NOW);
    const permissions = outcome.response.checks.find((check) => check.name === "permissions");
    expect(permissions?.ok).toBe(false);
    expect(permissions?.detail).toBe("No data permissions - visualization only");
  });

  it("follows auth for connectivity when the adapter has no latency", () => {
    const mt5 = findProvider("mt5-bridge")!;
    const outcome = buildTestOutcome(mt5, false, null, NOW);
    const connectivity = outcome.response.checks.find((check) => check.name === "connectivity");
    expect(connectivity?.ok).toBe(false);
    expect(connectivity?.detail).toBe("Endpoint unreachable until credentials are valid");
  });

  it("maps a passing test on a degraded provider to RECOVERED", () => {
    expect(testEventTypeFor("AUTH_REQUIRED")).toBe("RECOVERED");
    expect(testEventTypeFor("ERROR")).toBe("RECOVERED");
    expect(testEventTypeFor("CONNECTED")).toBe("TEST_OK");
    expect(testEventTypeFor("DISCONNECTED")).toBe("TEST_OK");
  });
});

// ── Sync (§13/§15/§16/§17) ───────────────────────────────────────────────────

describe("sync determinism", () => {
  const simulated = findProvider("simulated-feed")!;
  const macro = findProvider("macro-sample")!;

  it("derives the simulated duration series (mock parity)", () => {
    expect(syncDurationMs(1)).toBe(320 + 137);
    expect(syncDurationMs(2)).toBe(320 + (274 % 640));
    expect(syncDurationMs(5)).toBe(320 + (685 % 640));
  });

  it("counts records per kind without inventing data", () => {
    expect(recordsProcessedFor("MARKET_DATA", 1)).toBe(104);
    expect(recordsProcessedFor("BROKER", 1)).toBe(1);
    expect(recordsProcessedFor("CHARTING", 1)).toBe(0);
    expect(recordsProcessedFor("ECONOMIC", 1)).toBe(2);
  });

  it("beats the partial sync every 5th ECONOMIC run (§15)", () => {
    expect(partialSyncDue("ECONOMIC", 5)).toBe(true);
    expect(partialSyncDue("ECONOMIC", 10)).toBe(true);
    expect(partialSyncDue("ECONOMIC", 4)).toBe(false);
    expect(partialSyncDue("MARKET_DATA", 5)).toBe(false);
  });

  it("builds a healthy sync patch with a SYNCED event", () => {
    const outcome = buildSyncOutcome({
      provider: simulated,
      syncCounter: 1,
      previousRetryCount: 0,
      wasDegraded: false,
      batch: null,
      now: NOW,
    });
    expect(outcome.status).toBe("CONNECTED");
    expect(outcome.eventType).toBe("SYNCED");
    expect(outcome.recordsProcessedDelta).toBe(104);
    expect(outcome.retryCount).toBe(0);
    expect(outcome.recordsFailed).toBe(0);
    expect(outcome.error).toBeNull();
  });

  it("builds a partial patch with backoff nextRetryAt (capped series)", () => {
    const outcome = buildSyncOutcome({
      provider: macro,
      syncCounter: 5,
      previousRetryCount: 1,
      wasDegraded: false,
      batch: 9,
      now: NOW,
    });
    expect(outcome.status).toBe("DEGRADED");
    expect(outcome.eventType).toBe("DEGRADED");
    expect(outcome.recordsFailed).toBe(1);
    expect(outcome.retryCount).toBe(2);
    expect(outcome.nextRetryAt).toBe(new Date(NOW.getTime() + 4000).toISOString());
    expect(outcome.error?.code).toBe("PARTIAL_SYNC");
    expect(outcome.cursor).toBe("batch-9");
  });

  it("clears errors and announces recovery after a degraded run succeeds", () => {
    const outcome = buildSyncOutcome({
      provider: macro,
      syncCounter: 6,
      previousRetryCount: 2,
      wasDegraded: true,
      batch: 10,
      now: NOW,
    });
    expect(outcome.status).toBe("CONNECTED");
    expect(outcome.eventType).toBe("RECOVERED");
    expect(outcome.clearAllErrors).toBe(true);
    expect(outcome.recordsFailed).toBe(0);
  });
});

// ── Webhook pipeline (§12/§22/§23) ───────────────────────────────────────────

describe("webhook pipeline", () => {
  const secret = generateWebhookSecret();
  const body = {
    eventId: "evt-1-eco.actual.released",
    eventType: "eco.actual.released",
    payload: { eventRef: "macro-sample:MACRO-1a2b3c4d", actual: "0.4%" },
  };

  it("generates and hints secrets without ever exposing the material", () => {
    expect(secret).toMatch(/^whsec_[0-9a-f]{12}$/);
    expect(webhookSecretHint(secret)).toBe(`whsec_••••${secret.slice(-4)}`);
    expect(webhookSecretHint(secret)).not.toContain(secret.slice(0, 8));
  });

  it("signs and verifies the canonical body (round trip)", () => {
    const now = Date.now();
    const message = serializeWebhookBody(now, body);
    expect(message).toBe(`${now}.${JSON.stringify(body)}`);
    const signature = signWebhookBody(secret, message);
    expect(signaturesMatch(signature, signature)).toBe(true);
    const alteredSignature = `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`;
    expect(signaturesMatch(alteredSignature, signature)).toBe(false);
  });

  it("builds deterministic simulate event ids", () => {
    const id = simulateEventId(1_777_777_777_777, "eco.actual.released");
    expect(id).toBe(simulateEventId(1_777_777_777_777, "eco.actual.released"));
    expect(id).toContain("eco.actual.released");
  });

  it("accepts a fresh, correctly-signed, unseen delivery", () => {
    const verdict = evaluateWebhookDelivery({
      fresh: true,
      signatureValid: true,
      alreadySeen: false,
      isReplay: false,
    });
    expect(verdict.accepted).toBe(true);
    expect(verdict.duplicate).toBe(false);
    expect(verdict.signatureValid).toBe(true);
    expect(verdict.eventType).toBe("WEBHOOK_RECEIVED");
    expect(verdict.acceptedNow).toBe(true);
  });

  it("rejects stale timestamps before the signature verdict", () => {
    const verdict = evaluateWebhookDelivery({
      fresh: false,
      signatureValid: true,
      alreadySeen: false,
      isReplay: false,
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.signatureValid).toBe(true);
    expect(verdict.message).toContain("replay window");
    expect(verdict.eventType).toBeNull();
  });

  it("rejects invalid signatures with a WEBHOOK_REJECTED event", () => {
    const verdict = evaluateWebhookDelivery({
      fresh: true,
      signatureValid: false,
      alreadySeen: false,
      isReplay: false,
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.signatureValid).toBe(false);
    expect(verdict.eventType).toBe("WEBHOOK_REJECTED");
  });

  it("treats seen events as duplicates and replays as idempotent", () => {
    const seen = evaluateWebhookDelivery({
      fresh: true,
      signatureValid: true,
      alreadySeen: true,
      isReplay: false,
    });
    expect(seen.accepted).toBe(false);
    expect(seen.duplicate).toBe(false);
    expect(seen.message).toContain("Duplicate");

    const replay = evaluateWebhookDelivery({
      fresh: true,
      signatureValid: true,
      alreadySeen: true,
      isReplay: true,
    });
    expect(replay.accepted).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.eventType).toBe("WEBHOOK_DUPLICATE");
  });
});

// ── Sample news (§10) ────────────────────────────────────────────────────────

describe("builtin sample news", () => {
  it("serves six clearly-labelled samples, newest first, stable ids", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const first = listSampleNews("news-wire", now);
    expect(first).toHaveLength(6);
    expect(first.every((item) => item.sample)).toBe(true);
    expect(first.every((item) => item.providerKey.startsWith("news-wire:"))).toBe(true);
    const sorted = [...first].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    expect(first.map((item) => item.publishedAt)).toEqual(sorted.map((item) => item.publishedAt));

    const second = listSampleNews("news-wire", now);
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
  });
});
