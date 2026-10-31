import { Inject, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { backoffDelayMs, idempotencyKey, isWebhookTimestampFresh, sanitizeSecrets } from "../../shared/contracts";
import type {
  IntegrationConnectInput,
  IntegrationDisconnectResponse,
  IntegrationEcoEvent,
  IntegrationEvent,
  IntegrationError,
  IntegrationProvider,
  IntegrationSyncResponse,
  IntegrationTestResponse,
  IntegrationsOverviewResponse,
  NewsItem,
  RetentionPolicy,
  TradingAccountView,
  WebhookDeliverResponse,
  WebhookSimulateInput,
} from "../../shared/contracts";

import { generateEcoEvents } from "../calendar/eco-calendar";
import {
  DEMO_ACCOUNT_VIEW,
  DEMO_WEBHOOK,
  ECO_COUNTRIES,
  INTEGRATION_RETENTION,
  PROVIDER_CATALOG,
  SEED_EVENT_LOG,
  newsSamplesAt,
  type ProviderCatalogEntry,
} from "./provider-catalog";
import { INTEGRATION_ROW_KINDS, IntegrationsRepository } from "./integrations.repository";

/**
 * Integration Hub service - the platform layer over REAL persistence
 * (MASTER PROMPT §3–§31). Ported 1:1 from `mocks/integration-engine.ts`:
 * same demo beats, same honest nulls, same §14 idempotency and §28
 * retention - but every mutation survives a restart (IntegrationRow rows).
 *
 * Secrets never appear on the wire: messages pass through `sanitizeSecrets`
 * before leaving the service, and the public provider view strips the
 * secret material (§18).
 */

// ── Results ──────────────────────────────────────────────────────────────────

type Ok<T> = { ok: true; value: T };
export type Fail = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryAfterMs?: number;
};
type Result<T> = Ok<T> | Fail;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const fail = (
  status: number,
  code: string,
  message: string,
  retryAfterMs?: number,
): Fail => ({ ok: false, status, code, message, retryAfterMs });

// ── Runtime state (the per-user slice layered over the static catalog) ──────

interface ProviderRuntimeState {
  status: ProviderCatalogEntry["status"];
  authState: "OK" | "MISSING" | "EXPIRED";
  latencyMs: number | null;
  credentials: {
    vaultRef: string;
    maskedHint: string;
    expiresAt: string | null;
    lastRotatedAt: string | null;
  } | null;
  connectedAt: string | null;
  secret: string | null;
  /** Persisted scenario flag - cTrader's first pairing ships an expired key. */
  scenario: "expired-credentials" | null;
  pairedOnce: boolean;
  syncCounter: number;
  cursor: string | null;
  sync: {
    lastAttemptedAt: string | null;
    lastSuccessAt: string | null;
    lastDurationMs: number | null;
    recordsProcessed: number;
    recordsFailed: number;
    retryCount: number;
    nextRetryAt: string | null;
  };
}

interface WebhookState {
  deliveries: IntegrationEvent extends never ? never : Array<{
    id: string;
    receivedAt: string;
    eventType: string;
    signatureValid: boolean;
    accepted: boolean;
    duplicate: boolean;
    message: string;
  }>;
  lastAcceptedEventId: string | null;
  secret: string;
}

const EVENT_RING_CAP = 80;
const ERROR_RING_CAP = 40;
const DELIVERY_RING_CAP = 12;

const nowIso = (): string => new Date().toISOString();

function baseSync() {
  return {
    lastAttemptedAt: null,
    lastSuccessAt: null,
    lastDurationMs: null,
    recordsProcessed: 0,
    recordsFailed: 0,
    retryCount: 0,
    nextRetryAt: null,
  };
}

@Injectable()
export class IntegrationsService {  /** Transient rate-limit windows - session-scoped by design (the mock's
   * quota bookkeeping never outlived the process either). */
  private rateWindows = new Map<string, { count: number; windowStartMs: number }>();

  constructor(
    private readonly repository: IntegrationsRepository,
    @Inject("INTEGRATION_NOW") private readonly now: () => number = () => Date.now(),
  ) {}

  // ── Lazy per-user seed (first overview read materializes the demo state) ──

  private async seedIfEmpty(userId: string): Promise<void> {
    const nowMs = this.now();

    // Seed every missing provider independently. If an earlier startup was
    // interrupted after writing only part of the catalog, existing rows must
    // not prevent the remaining providers from being materialized.
    for (const entry of PROVIDER_CATALOG) {
      const existing = await this.repository.findRow(userId, INTEGRATION_ROW_KINDS.PROVIDER, entry.id);
      if (existing !== null) continue;
      const state = this.freshState(entry, nowMs);
      await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.PROVIDER, entry.id, state as unknown as Prisma.InputJsonValue);
    }

    const webhookExists = await this.repository.findRow(userId, INTEGRATION_ROW_KINDS.WEBHOOK, DEMO_WEBHOOK.id);
    if (webhookExists === null) {
      await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.WEBHOOK, DEMO_WEBHOOK.id, {
      providerId: DEMO_WEBHOOK.providerId,
      path: DEMO_WEBHOOK.path,
      status: DEMO_WEBHOOK.status,
      secretMaskedHint: DEMO_WEBHOOK.secretMaskedHint,
      deliveries: [],
      lastAcceptedEventId: null,
      secret: DEMO_WEBHOOK.secret,
      } as unknown as Prisma.InputJsonValue);
    }

    if (!(await this.repository.hasAnyRow(userId, INTEGRATION_ROW_KINDS.EVENT))) {
      for (const [index, entry] of SEED_EVENT_LOG.entries()) {
        await this.repository.appendRow(userId, INTEGRATION_ROW_KINDS.EVENT, `seed-${index}`, {
          occurredAt: new Date(nowMs - (SEED_EVENT_LOG.length - index) * 7 * 60_000).toISOString(),
          providerId: entry.providerId,
          providerName: entry.providerName,
          type: entry.type,
          message: entry.message,
        });
      }
    }

    // §9 - the economic layer consumes a RAW provider payload and normalizes
    // it; the deterministic calendar generator stands in for that payload.
    if (!(await this.repository.hasAnyRow(userId, INTEGRATION_ROW_KINDS.ECO))) {
      const raw = generateEcoEvents(new Date(nowMs));
      for (const event of raw) {
        const providerKey = idempotencyKey("macro-sample", `MACRO-${event.id.slice(0, 8)}`);
        await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.SEEN, providerKey, { seeded: true });
        const eco = this.normalizeEco(event.id, event.title, event.currency, event.impact, event.scheduledAt, event.previous, event.forecast, providerKey);
        await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.ECO, providerKey, eco as unknown as Prisma.InputJsonValue);
      }
    }

    if (!(await this.repository.hasAnyRow(userId, INTEGRATION_ROW_KINDS.NEWS))) {
      for (const news of newsSamplesAt(nowMs)) {
        await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.NEWS, news.providerKey, news as unknown as Prisma.InputJsonValue);
      }
    }
  }

  private freshState(entry: ProviderCatalogEntry, nowMs: number): ProviderRuntimeState {
    const iso = (ms: number): string => new Date(ms).toISOString();
    const connected = entry.status !== "DISCONNECTED";
    return {
      status: entry.status,
      authState: entry.authState,
      latencyMs: entry.latencyMs,
      credentials: entry.seedCredentials
        ? {
            vaultRef: entry.seedCredentials.vaultRef,
            maskedHint: entry.seedCredentials.maskedHint,
            expiresAt: null,
            lastRotatedAt: iso(nowMs - entry.seedCredentials.rotatedDaysAgo * 86_400_000),
          }
        : null,
      connectedAt: entry.connectedDaysAgo === null ? null : iso(nowMs - entry.connectedDaysAgo * 86_400_000),
      secret: entry.secret,
      scenario: null,
      pairedOnce: false,
      syncCounter: 0,
      cursor: entry.seedSync.cursor,
      sync: connected
        ? {
            lastAttemptedAt: iso(nowMs - entry.seedSync.successAgoMs),
            lastSuccessAt: iso(nowMs - entry.seedSync.successAgoMs),
            lastDurationMs: 420,
            recordsProcessed: entry.seedSync.processed,
            recordsFailed: 0,
            retryCount: 0,
            nextRetryAt: null,
          }
        : baseSync(),
    };
  }

  private async loadProviderStates(userId: string): Promise<Map<string, ProviderRuntimeState>> {
    await this.seedIfEmpty(userId);
    const rows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.PROVIDER);
    const states = new Map<string, ProviderRuntimeState>();
    for (const row of rows) {
      states.set(row.refId, row.data as unknown as ProviderRuntimeState);
    }
    return states;
  }

  private async persistProvider(userId: string, providerId: string, state: ProviderRuntimeState): Promise<void> {
    await this.repository.upsertRow(
      userId,
      INTEGRATION_ROW_KINDS.PROVIDER,
      providerId,
      state as unknown as Prisma.InputJsonValue,
    );
  }

  // ── Event / error ledger ────────────────────────────────────────────────────

  private async logEvent(
    userId: string,
    provider: { id: string; name: string },
    type: IntegrationEvent["type"],
    message: string,
    secret: string | null,
  ): Promise<void> {
    await this.repository.appendRow(userId, INTEGRATION_ROW_KINDS.EVENT, `evt-${this.now()}-${Math.random().toString(36).slice(2, 8)}`, {
      occurredAt: nowIso(),
      providerId: provider.id,
      providerName: provider.name,
      type,
      message: sanitizeSecrets(message, secret ? [secret] : []),
    });
    await this.repository.pruneRowsBeyondCap(userId, INTEGRATION_ROW_KINDS.EVENT, EVENT_RING_CAP);
  }

  private async logError(
    userId: string,
    provider: { id: string },
    code: IntegrationError["code"],
    message: string,
    options: { retryable: boolean; actionHint: string; retryAfterMs?: number },
  ): Promise<void> {
    await this.repository.appendRow(userId, INTEGRATION_ROW_KINDS.ERROR, `err-${this.now()}-${Math.random().toString(36).slice(2, 8)}`, {
      providerId: provider.id,
      occurredAt: nowIso(),
      code,
      message,
      retryable: options.retryable,
      actionHint: options.actionHint,
      retryAfterMs: options.retryAfterMs ?? null,
    });
    await this.repository.pruneRowsBeyondCap(userId, INTEGRATION_ROW_KINDS.ERROR, ERROR_RING_CAP);
  }

  private async clearErrors(userId: string, providerId: string, codes?: string[]): Promise<void> {
    const rows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.ERROR);
    const targets = rows
      .filter((row) => {
        const data = row.data as IntegrationError;
        if (data.providerId !== providerId) return false;
        return codes === undefined || codes.includes(data.code);
      })
      .map((row) => row.refId);
    await this.repository.deleteRows(userId, INTEGRATION_ROW_KINDS.ERROR, targets);
  }

  // ── §5 Overview ─────────────────────────────────────────────────────────────

  async overview(userId: string): Promise<IntegrationsOverviewResponse> {
    const states = await this.loadProviderStates(userId);
    const nowMs = this.now();

    const summary: IntegrationsOverviewResponse["summary"] = {
      connected: 0, syncing: 0, degraded: 0, disconnected: 0, authRequired: 0, error: 0,
    };
    const providers: IntegrationProvider[] = [];
    for (const entry of PROVIDER_CATALOG) {
      const state = states.get(entry.id);
      if (state === undefined) continue;
      switch (state.status) {
        case "CONNECTED": summary.connected += 1; break;
        case "SYNCING": summary.syncing += 1; break;
        case "DEGRADED": summary.degraded += 1; break;
        case "DISCONNECTED": summary.disconnected += 1; break;
        case "AUTH_REQUIRED": summary.authRequired += 1; break;
        case "ERROR": summary.error += 1; break;
      }
      providers.push(this.publicView(entry, state));
    }

    const accounts: TradingAccountView[] = [{
      ...DEMO_ACCOUNT_VIEW,
      lastSyncAt: states.get("deriv")?.sync.lastSuccessAt ?? null,
    }];

    const ecoRows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.ECO);
    const ecoEvents = ecoRows
      .map((row) => row.data as IntegrationEcoEvent)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

    const newsRows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.NEWS);
    const news = newsRows
      .map((row) => row.data as NewsItem)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

    const webhookRows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.WEBHOOK);
    const webhooks: IntegrationsOverviewResponse["webhooks"] = webhookRows.map((row) => {
      const data = row.data as unknown as WebhookState & {
        providerId: string;
        path: string;
        status: "ACTIVE";
        secretMaskedHint: string;
      };
      return {
        id: row.refId,
        providerId: data.providerId,
        path: data.path,
        status: data.status,
        secretMaskedHint: data.secretMaskedHint,
        deliveries: [...(data.deliveries ?? [])].slice(-DELIVERY_RING_CAP),
      };
    });

    const eventRows = await this.repository.listRowsDesc(userId, INTEGRATION_ROW_KINDS.EVENT, 30);
    const events: IntegrationEvent[] = eventRows.map((row) => ({ id: row.id, ...(row.data as Omit<IntegrationEvent, "id">) }));

    const errorRows = await this.repository.listRowsDesc(userId, INTEGRATION_ROW_KINDS.ERROR, 12);
    const errors: IntegrationError[] = errorRows.map((row) => ({ id: row.id, ...(row.data as Omit<IntegrationError, "id">) }));

    const retention: RetentionPolicy = { ...INTEGRATION_RETENTION };
    void nowMs;
    return { summary, providers, accounts, ecoEvents, news, webhooks, events, errors, retention };
  }

  private publicView(entry: ProviderCatalogEntry, state: ProviderRuntimeState): IntegrationProvider {
    return {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      tagline: entry.tagline,
      description: entry.description,
      docsUrl: entry.docsUrl,
      capabilities: entry.capabilities,
      marketData: entry.marketData,
      licensing: entry.licensing,
      status: state.status,
      authState: state.authState,
      latencyMs: state.latencyMs,
      sync: { ...state.sync, cursor: state.cursor },
      credentials: state.credentials,
      connectedAt: state.connectedAt,
      readOnly: entry.readOnly,
    };
  }

  // ── §25–§27 Lifecycle ───────────────────────────────────────────────────────

  async connect(userId: string, providerId: string, input: IntegrationConnectInput): Promise<Result<IntegrationProvider>> {
    const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
    if (entry === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    const states = await this.loadProviderStates(userId);
    const state = states.get(providerId);
    if (state === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");

    // §29 gate - an unverified provider cannot be connected at all.
    if (!entry.licensing.verified) {
      return fail(422, "LICENSE_UNVERIFIED", `${entry.name} cannot be connected: licensing review has not passed (§29)`);
    }
    if (state.status === "CONNECTED" && state.credentials !== null) {
      return fail(409, "ALREADY_CONNECTED", `${entry.name} is already connected`);
    }

    state.credentials = {
      vaultRef: input.vaultRef,
      maskedHint: `••••${input.vaultRef.slice(-4)}`,
      expiresAt: null,
      lastRotatedAt: nowIso(),
    };
    state.secret = `${providerId}-secret-${input.vaultRef.slice(-6)}`;
    state.authState = "OK";
    state.connectedAt = nowIso();

    // §32 deterministic demo: cTrader's FIRST pairing ships an expired key.
    if (entry.firstPairingScenario === "expired-credentials" && !state.pairedOnce) {
      state.pairedOnce = true;
      state.scenario = "expired-credentials";
      state.authState = "EXPIRED";
      state.status = "AUTH_REQUIRED";
    } else {
      state.scenario = null;
      state.status = "CONNECTED";
    }

    await this.persistProvider(userId, providerId, state);
    await this.clearErrors(userId, providerId, ["CREDENTIALS_EXPIRED"]);
    await this.logEvent(
      userId,
      entry,
      state.status === "AUTH_REQUIRED" ? "TEST_FAILED" : "CONNECTED",
      state.status === "AUTH_REQUIRED"
        ? "Paired, but the stored credential is expired - reauthorization required"
        : `Connected via ${input.vaultRef} - read-only scope`,
      state.secret,
    );
    return ok(this.publicView(entry, state));
  }

  async disconnect(userId: string, providerId: string): Promise<Result<IntegrationDisconnectResponse>> {
    const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
    if (entry === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    const states = await this.loadProviderStates(userId);
    const state = states.get(providerId);
    if (state === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    if (state.status === "DISCONNECTED") {
      return fail(409, "NOT_CONNECTED", `${entry.name} is already disconnected`);
    }
    // §26 - disconnecting must not silently delete historical data.
    state.status = "DISCONNECTED";
    state.authState = "MISSING";
    state.credentials = null;
    state.secret = null;
    state.scenario = null;
    state.sync.nextRetryAt = null;
    await this.persistProvider(userId, providerId, state);
    await this.clearErrors(userId, providerId);
    await this.logEvent(
      userId,
      entry,
      "DISCONNECTED",
      "Disconnected - synced history retained, credentials revoked from the vault",
      null,
    );
    return ok({ providerId, status: state.status, historyPreserved: true });
  }

  /** §27 - safe connection test. Never creates trades or orders. */
  async test(userId: string, providerId: string): Promise<Result<IntegrationTestResponse>> {
    const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
    if (entry === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    const states = await this.loadProviderStates(userId);
    const state = states.get(providerId);
    if (state === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");

    const authOk = state.credentials !== null && state.scenario !== "expired-credentials";
    const checks: IntegrationTestResponse["checks"] = [
      {
        name: "authentication",
        ok: authOk,
        detail: authOk
          ? "Vault credential accepted"
          : state.credentials === null
            ? "No credential stored - connect the provider first"
            : "Stored credential is expired - rotate the key and reconnect",
      },
      {
        name: "permissions",
        ok: entry.capabilities.length > 0,
        detail:
          entry.capabilities.length > 0
            ? `Scoped: ${entry.capabilities.join(", ")}`
            : "No data permissions - visualization only",
      },
      {
        name: "connectivity",
        ok: state.latencyMs === null ? authOk : true,
        detail:
          state.latencyMs === null
            ? "Endpoint unreachable until credentials are valid"
            : `Reachable - ${state.latencyMs} ms round trip`,
      },
      {
        name: "providerResponse",
        ok: authOk,
        detail: authOk
          ? "Schema-valid response against the provider contract"
          : "Rejected - the provider answered with an auth error",
      },
    ];

    const allOk = checks.every((check) => check.ok);
    if (allOk) {
      await this.clearErrors(userId, providerId, ["AUTH_FAILED", "CREDENTIALS_EXPIRED"]);
      if (state.status === "AUTH_REQUIRED" || state.status === "ERROR") {
        state.status = "CONNECTED";
        state.authState = "OK";
        await this.logEvent(userId, entry, "RECOVERED", "Connection test passed - provider recovered", state.secret);
      } else {
        await this.logEvent(userId, entry, "TEST_OK", "Connection test passed (auth, permissions, connectivity)", state.secret);
      }
    } else {
      state.status = "AUTH_REQUIRED";
      state.authState = "EXPIRED";
      await this.logError(userId, entry, "CREDENTIALS_EXPIRED", "Connection test failed: stored credential expired", {
        retryable: true,
        actionHint: "Rotate the key in the Security vault, then reconnect",
      });
      await this.logEvent(userId, entry, "TEST_FAILED", "Connection test failed - credentials expired", state.secret);
    }
    await this.persistProvider(userId, providerId, state);
    return ok({ ok: allOk, checks });
  }

  // ── §13/§16/§17 Synchronization ─────────────────────────────────────────────

  async sync(userId: string, providerId: string): Promise<Result<IntegrationSyncResponse>> {
    const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
    if (entry === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    const states = await this.loadProviderStates(userId);
    const state = states.get(providerId);
    if (state === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");

    const notConnected = this.requireConnected(entry, state);
    if (notConnected !== null) return notConnected;

    const nowMs = this.now();
    const rateLimited = await this.rateLimitCheck(userId, entry, state, nowMs);
    if (rateLimited !== null) return rateLimited;

    state.syncCounter += 1;
    state.sync.lastAttemptedAt = nowIso();
    const wasDegraded = state.status === "DEGRADED" || state.authState === "EXPIRED";
    state.status = "SYNCING";
    const durationMs = 320 + (state.syncCounter * 137) % 640;

    // §15 deterministic partial-sync beat: every 5th macro sync drops one record.
    const partial = entry.kind === "ECONOMIC" && state.syncCounter % 5 === 0;
    const batch = entry.kind === "ECONOMIC" ? await this.nextEcoBatch(userId) : null;
    const processed = await this.runIncrementalSync(userId, entry, state, nowMs, partial, batch);
    state.sync.lastDurationMs = durationMs;
    if (batch !== null) state.cursor = `batch-${batch}`;
    state.sync.recordsProcessed += processed;

    if (partial) {
      state.sync.recordsFailed = 1;
      state.sync.retryCount += 1;
      state.sync.nextRetryAt = new Date(nowMs + backoffDelayMs(state.sync.retryCount)).toISOString();
      state.status = "DEGRADED";
      await this.logError(userId, entry, "PARTIAL_SYNC", "Incremental sync completed with 1 failed record", {
        retryable: true,
        actionHint: "Retry the sync - the cursor resumes where it stopped",
      });
      await this.logEvent(userId, entry, "DEGRADED", "Partial sync - 1 record failed, cursor retained", state.secret);
    } else {
      state.sync.lastSuccessAt = nowIso();
      state.sync.retryCount = 0;
      state.sync.nextRetryAt = null;
      state.sync.recordsFailed = 0;
      state.status = "CONNECTED";
      state.authState = "OK";
      if (wasDegraded) {
        await this.clearErrors(userId, providerId);
        await this.logEvent(userId, entry, "RECOVERED", "Sync healthy again - provider fully operational", state.secret);
      } else {
        await this.logEvent(
          userId,
          entry,
          "SYNCED",
          `Incremental sync ok - ${processed} record(s) in ${durationMs} ms (cursor ${state.cursor ?? "n/a"})`,
          state.secret,
        );
      }
    }

    await this.persistProvider(userId, providerId, state);
    await this.pruneRetention(userId, nowMs);
    return ok({ providerId, status: state.status, sync: { ...state.sync, cursor: state.cursor } });
  }

  private requireConnected(
    entry: ProviderCatalogEntry,
    state: ProviderRuntimeState,
  ): Fail | null {
    // Status is the source of truth - several connected data feeds (market
    // data, economic sample, charting) operate without stored credentials.
    if (state.status === "DISCONNECTED") {
      return fail(409, "NOT_CONNECTED", `${entry.name} is not connected - connect it first`);
    }
    if (state.status === "AUTH_REQUIRED") {
      return fail(409, "AUTH_REQUIRED", `${entry.name} needs reauthorization - rotate the key and reconnect`);
    }
    return null;
  }

  private async rateLimitCheck(
    userId: string,
    entry: ProviderCatalogEntry,
    state: ProviderRuntimeState,
    nowMs: number,
  ): Promise<Fail | null> {
    const windowKey = `${userId}:${entry.id}`;
    const limits = this.rateWindows.get(windowKey) ?? { count: 0, windowStartMs: nowMs };
    if (nowMs - limits.windowStartMs > entry.rateLimit.windowMs) {
      limits.windowStartMs = nowMs;
      limits.count = 0;
    }
    if (limits.count >= entry.rateLimit.limitPerWindow) {
      const retryAfterMs = Math.max(0, entry.rateLimit.windowMs - (nowMs - limits.windowStartMs));
      await this.logError(
        userId,
        entry,
        "RATE_LIMITED",
        `Provider rate limit reached (${entry.rateLimit.limitPerWindow} requests / ${Math.round(entry.rateLimit.windowMs / 1000)} s demo window)`,
        { retryable: true, actionHint: "Wait for the quota window to reset, then retry manually", retryAfterMs },
      );
      await this.logEvent(userId, entry, "SYNC_FAILED", "Rate limited - quota window exhausted", state.secret);
      this.rateWindows.set(windowKey, limits);
      return fail(429, "RATE_LIMITED", `Rate limit reached for ${entry.name} - retry after the quota window`, retryAfterMs);
    }
    limits.count += 1;
    this.rateWindows.set(windowKey, limits);
    return null;
  }

  private async nextEcoBatch(userId: string): Promise<number> {
    // batch-N continues the seed's batch-7 cursor: scan the macro provider
    // keys for MACRO-batchN upserts, otherwise start after the seed cursor.
    const rows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.ECO);
    let highest = 7;
    for (const row of rows) {
      const match = /^MACRO-batch(\d+)$/.exec(row.refId);
      if (match !== null) highest = Math.max(highest, Number(match[1]));
    }
    return highest + 1;
  }

  /** Provider-specific incremental surface (§13 cursor + §14 idempotency). */
  private async runIncrementalSync(
    userId: string,
    entry: ProviderCatalogEntry,
    state: ProviderRuntimeState,
    nowMs: number,
    partial: boolean,
    batch: number | null,
  ): Promise<number> {
    switch (entry.kind) {
      case "ECONOMIC": {
        // A "provider batch" updates one past event with its actual release
        // and schedules one new event. Upserts are idempotent by providerKey.
        let processed = 0;
        const ecoRows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.ECO);
        const ecoEvents = ecoRows.map((row) => ({ refId: row.refId, data: row.data as IntegrationEcoEvent }));
        const pending = ecoEvents
          .filter((row) => row.data.status === "SCHEDULED" && Date.parse(row.data.scheduledAt) <= nowMs)
          .sort((a, b) => a.data.scheduledAt.localeCompare(b.data.scheduledAt))[0];
        if (pending !== undefined) {
          pending.data.actual = pending.data.forecast === null ? null : pending.data.forecast;
          pending.data.status = "RELEASED";
          await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.ECO, pending.refId, pending.data as unknown as Prisma.InputJsonValue);
          processed += 1;
        }
        const day = 86_400_000;
        const nextScheduled = ecoEvents
          .filter((row) => Date.parse(row.data.scheduledAt) > nowMs)
          .map((row) => Date.parse(row.data.scheduledAt))
          .sort((a, b) => a - b)[0];
        const anchor = nextScheduled ?? nowMs + day;
        const key = idempotencyKey("macro-sample", `MACRO-batch${batch ?? 0}`);
        const seen = await this.repository.findRow(userId, INTEGRATION_ROW_KINDS.SEEN, key);
        if (seen === null) {
          await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.SEEN, key, { seeded: true });
          const newEvent: IntegrationEcoEvent = {
            id: crypto.randomUUID(),
            providerKey: key,
            providerId: "macro-sample",
            title: "US Nonfarm Payrolls",
            country: "United States",
            currency: "USD",
            impact: "HIGH",
            scheduledAt: new Date(anchor + day).toISOString(),
            previous: "216",
            forecast: "221",
            actual: null,
            status: "SCHEDULED",
          };
          await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.ECO, key, newEvent as unknown as Prisma.InputJsonValue);
          processed += 1;
        }
        if (partial) processed += 0; // the failed record never lands
        return processed;
      }
      case "MARKET_DATA": {
        // Tick ingestion is counted, deduped by stream cursor, never stored raw.
        return 96 + state.syncCounter * 8;
      }
      case "BROKER":
      case "EXCHANGE": {
        // Account snapshot refresh - nulls stay nulls until the adapter sends
        // real numbers (honesty rule: never invent balance/equity).
        return 1;
      }
      default:
        // CHARTING ping, NOTIFICATION/EXTERNAL without a data surface.
        return 0;
    }
  }

  /** §28 retention pruning - news outlives its window, logs are trimmed. */
  private async pruneRetention(userId: string, nowMs: number): Promise<void> {
    const newsCutoff = new Date(nowMs - INTEGRATION_RETENTION.newsDays * 86_400_000);
    const newsRows = await this.repository.listRows(userId, INTEGRATION_ROW_KINDS.NEWS);
    const stale = newsRows
      .map((row) => row.data as NewsItem)
      .filter((item) => item.sample && Date.parse(item.publishedAt) > INTEGRATION_RETENTION.newsDays * 86_400_000 && Date.parse(item.publishedAt) < nowMs - INTEGRATION_RETENTION.newsDays * 86_400_000)
      .map((item) => item.providerKey);
    void newsCutoff;
    if (stale.length > 0) {
      await this.repository.deleteRows(userId, INTEGRATION_ROW_KINDS.NEWS, stale);
    }
    const logCutoff = new Date(nowMs - INTEGRATION_RETENTION.syncLogsDays * 86_400_000 * 3);
    await this.repository.deleteRowsOlderThan(userId, INTEGRATION_ROW_KINDS.EVENT, logCutoff);
  }

  // ── §12 Webhook pipeline ────────────────────────────────────────────────────

  async simulateWebhook(
    userId: string,
    endpointId: string,
    input: WebhookSimulateInput,
  ): Promise<Result<WebhookDeliverResponse>> {
    await this.seedIfEmpty(userId);
    const hookRow = await this.repository.findRow(userId, INTEGRATION_ROW_KINDS.WEBHOOK, endpointId);
    if (hookRow === null) return fail(404, "UNKNOWN_WEBHOOK", "Unknown webhook endpoint");
    const hook = hookRow.data as unknown as WebhookState;
    const nowMs = this.now();

    const recordDelivery = async (
      eventType: string,
      signatureValid: boolean,
      accepted: boolean,
      duplicate: boolean,
      message: string,
    ) => {
      hook.deliveries.push({
        id: crypto.randomUUID(),
        receivedAt: nowIso(),
        eventType,
        signatureValid,
        accepted,
        duplicate,
        message: sanitizeSecrets(message, [hook.secret]),
      });
      if (hook.deliveries.length > DELIVERY_RING_CAP) {
        hook.deliveries.splice(0, hook.deliveries.length - DELIVERY_RING_CAP);
      }
      await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.WEBHOOK, endpointId, hook as unknown as Prisma.InputJsonValue);
    };

    const replay = input.mode === "replay" && hook.lastAcceptedEventId !== null;
    const eventId =
      input.mode === "replay" && hook.lastAcceptedEventId !== null
        ? hook.lastAcceptedEventId
        : `evt-${Math.abs(Math.floor(Math.sin(nowMs) * 1e9))}-${input.eventType}`;
    const timestamp = input.mode === "stale-timestamp" ? nowMs - 30 * 60_000 : nowMs;
    const rawBody = `${timestamp}.${JSON.stringify({ eventId, eventType: input.eventType, payload: input.payload })}`;
    const signature = this.hmac(hook.secret, rawBody);
    const providedSignature = input.mode === "bad-signature" ? `0${signature.slice(1)}` : signature;

    // Pipeline step 1 - timestamp freshness (replay protection).
    if (!isWebhookTimestampFresh(timestamp, nowMs)) {
      await recordDelivery(input.eventType, false, false, false, "Rejected: timestamp outside the replay window");
      return ok({
        accepted: false,
        duplicate: false,
        signatureValid: true,
        message: "Rejected - timestamp outside the replay window",
      });
    }
    // Pipeline step 2 - signature verification.
    if (providedSignature !== signature) {
      await recordDelivery(input.eventType, false, false, false, "Rejected: invalid signature");
      const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === DEMO_WEBHOOK.providerId);
      if (entry !== undefined) {
        await this.logEvent(userId, entry, "WEBHOOK_REJECTED", "Webhook rejected - invalid signature", null);
      }
      return ok({
        accepted: false,
        duplicate: false,
        signatureValid: false,
        message: "Rejected - invalid signature",
      });
    }
    // Pipeline step 3 - idempotency (§14).
    const key = idempotencyKey(DEMO_WEBHOOK.providerId, eventId);
    const seen = await this.repository.findRow(userId, INTEGRATION_ROW_KINDS.SEEN, key);
    if (seen !== null && !replay) {
      await recordDelivery(input.eventType, true, false, false, "Accepted but already processed");
      return ok({ accepted: false, duplicate: false, signatureValid: true, message: "Duplicate event - ignored" });
    }
    if (replay) {
      await recordDelivery(input.eventType, true, true, true, "Duplicate delivery ignored (idempotent)");
      const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === DEMO_WEBHOOK.providerId);
      if (entry !== undefined) {
        await this.logEvent(userId, entry, "WEBHOOK_DUPLICATE", "Replayed delivery ignored - idempotency held", null);
      }
      return ok({
        accepted: false,
        duplicate: true,
        signatureValid: true,
        message: "Duplicate - the event was already processed",
      });
    }

    // Accepted → apply the real-time event update (§22) idempotently.
    await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.SEEN, key, { acceptedAt: nowIso() });
    hook.lastAcceptedEventId = eventId;
    const payload = input.payload as Record<string, unknown>;
    // The sender references the normalized record by its full provider key.
    const providerKey = typeof payload.eventRef === "string" ? payload.eventRef : key;
    const targetRow = await this.repository.findRow(userId, INTEGRATION_ROW_KINDS.ECO, providerKey);
    if (targetRow !== null && typeof payload.actual === "string") {
      const target = targetRow.data as IntegrationEcoEvent;
      target.actual = String(payload.actual);
      target.status = "UPDATED";
      await this.repository.upsertRow(userId, INTEGRATION_ROW_KINDS.ECO, providerKey, target as unknown as Prisma.InputJsonValue);
    }
    await recordDelivery(input.eventType, true, true, false, "Signature verified - event applied");
    const macroEntry = PROVIDER_CATALOG.find((candidate) => candidate.id === DEMO_WEBHOOK.providerId);
    if (macroEntry !== undefined) {
      await this.logEvent(userId, macroEntry, "WEBHOOK_RECEIVED", `Webhook accepted - ${input.eventType} applied in real time`, null);
    }
    return ok({ accepted: true, duplicate: false, signatureValid: true, message: "Accepted - event applied" });
  }

  /** HMAC-SHA256 hex signature (node:crypto - the mock used webcrypto). */
  private hmac(secret: string, message: string): string {
    return createHmac("sha256", secret).update(message).digest("hex");
  }

  /** Provider wire → normalized domain event (§25 normalization layer). */
  private normalizeEco(
    id: string,
    title: string,
    currency: string,
    impact: string,
    scheduledAt: string,
    previous: string | null,
    forecast: string | null,
    actual: string | null,
    providerKey: string,
  ): IntegrationEcoEvent {
    const normalizedImpact = impact === "HIGH" || impact === "high" ? "HIGH" : impact === "MEDIUM" || impact === "medium" ? "MEDIUM" : "LOW";
    const released = Date.parse(scheduledAt) <= this.now();
    return {
      id,
      providerKey,
      providerId: "macro-sample",
      title,
      country: ECO_COUNTRIES[currency] ?? currency,
      currency,
      impact: normalizedImpact,
      scheduledAt,
      previous,
      forecast,
      actual,
      status: released ? (actual !== null ? "RELEASED" : "SCHEDULED") : "SCHEDULED",
    };
  }
}
