/**
 * Integration connection lifecycle (Phase 14 §16/§18/§24) - PURE domain
 * decisions, framework-free, clock-free (callers pass `now`). The mock
 * engine (`apps/web/src/mocks/integration-engine.ts`) is the audited
 * behavioural spec; these functions port its decision logic verbatim so
 * the backend and the mock stay behaviourally identical (§9 of the shared
 * contract header: provider vs connection stays distinct - a CONNECTION
 * is user state, the PROVIDER is the registry entry).
 *
 * Every produced message is secret-free by construction: credentials are
 * vault REFERENCES and the masked hint is derived from the reference, so
 * no sanitization pass is needed on these paths (§14/§15).
 */

import type {
  IntegrationAuthState,
  IntegrationStatus,
  IntegrationTestResponse,
} from "../../../shared/contracts";
import { backoffDelayMs } from "../../../shared/contracts";
import type { ProviderCatalogEntry } from "./provider-catalog";

/** The one-shot deterministic demo scenario (§32). */
export const EXPIRED_CREDENTIALS_SCENARIO = "expired-credentials";

/** Provider kind subset that drives the incremental-sync surface (§13). */
export type SyncKind = ProviderCatalogEntry["kind"];

// ── Connect (§25 - vault reference, never secret material) ───────────────────

export interface ConnectOutcome {
  readonly status: IntegrationStatus;
  readonly authState: IntegrationAuthState;
  readonly credentials: {
    readonly vaultRef: string;
    readonly maskedHint: string;
    readonly expiresAt: null;
    readonly lastRotatedAt: string;
  };
  readonly connectedAt: string;
  /** One-shot scenario bookkeeping. */
  readonly pairedOnce: boolean;
  readonly scenario: string | null;
  readonly eventType: "CONNECTED" | "TEST_FAILED";
  readonly eventMessage: string;
  /** Error codes to clear on this transition. */
  readonly clearErrorCodes: readonly string[];
}

/** Masked hint derived from the vault REFERENCE (mock §25 parity). */
export function maskedHintFor(vaultRef: string): string {
  return `••••${vaultRef.slice(-4)}`;
}

export function buildConnectOutcome(
  provider: ProviderCatalogEntry,
  isFirstPairing: boolean,
  vaultRef: string,
  now: Date,
): ConnectOutcome {
  const connectedAt = now.toISOString();
  // §32 deterministic demo: cTrader's FIRST pairing ships an expired key.
  if (provider.id === "ctrader" && isFirstPairing) {
    return {
      status: "AUTH_REQUIRED",
      authState: "EXPIRED",
      credentials: {
        vaultRef,
        maskedHint: maskedHintFor(vaultRef),
        expiresAt: null,
        lastRotatedAt: connectedAt,
      },
      connectedAt,
      pairedOnce: true,
      scenario: EXPIRED_CREDENTIALS_SCENARIO,
      eventType: "TEST_FAILED",
      eventMessage: "Paired, but the stored credential is expired - reauthorization required",
      clearErrorCodes: ["CREDENTIALS_EXPIRED"],
    };
  }
  return {
    status: "CONNECTED",
    authState: "OK",
    credentials: {
      vaultRef,
      maskedHint: maskedHintFor(vaultRef),
      expiresAt: null,
      lastRotatedAt: connectedAt,
    },
    connectedAt,
    pairedOnce: true,
    scenario: null,
    eventType: "CONNECTED",
    eventMessage: `Connected via ${vaultRef} - read-only scope`,
    clearErrorCodes: ["CREDENTIALS_EXPIRED"],
  };
}

// ── Disconnect (§26 - history preserved) ─────────────────────────────────────

export interface DisconnectOutcome {
  readonly status: IntegrationStatus;
  readonly authState: IntegrationAuthState;
  readonly connectedAt: null;
  /** Credentials are detached - the vault keeps its entry, the Hub forgets the ref. */
  readonly credentials: null;
  readonly scenario: null;
  readonly syncNextRetryAt: null;
  readonly eventType: "DISCONNECTED";
  readonly eventMessage: "Disconnected - synced history retained, credentials revoked from the vault";
  /** ALL errors of the provider are cleared on disconnect (mock parity). */
  readonly clearAllErrors: true;
}

export function buildDisconnectOutcome(): DisconnectOutcome {
  return {
    status: "DISCONNECTED",
    authState: "MISSING",
    connectedAt: null,
    credentials: null,
    scenario: null,
    syncNextRetryAt: null,
    eventType: "DISCONNECTED",
    eventMessage:
      "Disconnected - synced history retained, credentials revoked from the vault",
    clearAllErrors: true,
  };
}

// ── Connection test (§18 - safe, never trades) ───────────────────────────────

export interface TestOutcome {
  readonly response: IntegrationTestResponse;
  readonly status: IntegrationStatus;
  readonly authState: IntegrationAuthState;
  readonly lastCheckedAt: string;
  readonly eventType: "TEST_OK" | "TEST_FAILED" | "RECOVERED";
  readonly eventMessage: string;
  /** Ledger error to append on failure (null on success). */
  readonly error: {
    readonly code: "CREDENTIALS_EXPIRED";
    readonly message: string;
    readonly retryable: boolean;
    readonly actionHint: string;
  } | null;
  readonly clearErrorCodes: readonly string[];
  readonly clearAllErrors: false;
}

export function buildTestOutcome(
  provider: ProviderCatalogEntry,
  hasCredentials: boolean,
  scenario: string | null,
  now: Date,
): TestOutcome {
  const authOk = hasCredentials && scenario !== EXPIRED_CREDENTIALS_SCENARIO;
  const checks: IntegrationTestResponse["checks"] = [
    {
      name: "authentication",
      ok: authOk,
      detail: authOk
        ? "Vault credential accepted"
        : !hasCredentials
          ? "No credential stored - connect the provider first"
          : "Stored credential is expired - rotate the key and reconnect",
    },
    {
      name: "permissions",
      ok: provider.capabilities.length > 0,
      detail:
        provider.capabilities.length > 0
          ? `Scoped: ${provider.capabilities.join(", ")}`
          : "No data permissions - visualization only",
    },
    {
      name: "connectivity",
      ok: provider.latencyMs === null ? authOk : true,
      detail:
        provider.latencyMs === null
          ? "Endpoint unreachable until credentials are valid"
          : `Reachable - ${provider.latencyMs} ms round trip`,
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
    return {
      response: { ok: true, checks },
      status: "CONNECTED",
      authState: "OK",
      lastCheckedAt: now.toISOString(),
      // The service decides TEST_OK vs RECOVERED from the previous status
      // (AUTH_REQUIRED/ERROR → RECOVERED); the domain default is TEST_OK.
      eventType: "TEST_OK",
      eventMessage: "Connection test passed (auth, permissions, connectivity)",
      error: null,
      clearErrorCodes: ["AUTH_FAILED", "CREDENTIALS_EXPIRED"],
      clearAllErrors: false,
    };
  }
  return {
    response: { ok: false, checks },
    status: "AUTH_REQUIRED",
    authState: "EXPIRED",
    lastCheckedAt: now.toISOString(),
    eventType: "TEST_FAILED",
    eventMessage: "Connection test failed - credentials expired",
    error: {
      code: "CREDENTIALS_EXPIRED",
      message: "Connection test failed: stored credential expired",
      retryable: true,
      actionHint: "Rotate the key in the Security vault, then reconnect",
    },
    clearErrorCodes: [],
    clearAllErrors: false,
  };
}

/** Service-level refinement: a passing test on a degraded provider recovers. */
export function testEventTypeFor(
  previousStatus: IntegrationStatus,
): "TEST_OK" | "RECOVERED" {
  return previousStatus === "AUTH_REQUIRED" || previousStatus === "ERROR"
    ? "RECOVERED"
    : "TEST_OK";
}

/** Message parity for the recovery event (mock §18). */
export const RECOVERED_EVENT_MESSAGE = "Connection test passed - provider recovered";

// ── Synchronization (§13/§16/§17 - bounded, cursor-based) ────────────────────

/** Deterministic simulated duration (mock parity): 320 + (n*137) mod 640 ms. */
export function syncDurationMs(syncCounter: number): number {
  return 320 + ((syncCounter * 137) % 640);
}

/** §15 deterministic partial-sync beat: every 5th ECONOMIC sync drops one. */
export function partialSyncDue(kind: SyncKind, syncCounter: number): boolean {
  return kind === "ECONOMIC" && syncCounter % 5 === 0;
}

/**
 * Incremental surface per kind (§13 cursor + §14 idempotency - mock §13
 * parity). Records are COUNTED, never invented: market ticks are deduped
 * by cursor and never stored raw; snapshots count 1; nulls stay nulls.
 */
export function recordsProcessedFor(kind: SyncKind, syncCounter: number): number {
  switch (kind) {
    case "ECONOMIC":
      // One past event released + one new scheduled event per batch.
      return 2;
    case "MARKET_DATA":
      return 96 + syncCounter * 8;
    case "BROKER":
    case "EXCHANGE":
      return 1;
    default:
      return 0;
  }
}

export interface SyncPatch {
  readonly lastAttemptedAt: string;
  readonly lastSuccessAt: string | null;
  readonly lastDurationMs: number;
  readonly recordsProcessedDelta: number;
  readonly recordsFailed: number;
  readonly retryCount: number;
  readonly cursor: string | null;
  readonly nextRetryAt: string | null;
  readonly status: IntegrationStatus;
  readonly authState: IntegrationAuthState;
  readonly eventType: "SYNCED" | "DEGRADED" | "RECOVERED";
  readonly eventMessage: string;
  readonly error: {
    readonly code: "PARTIAL_SYNC";
    readonly message: string;
    readonly retryable: boolean;
    readonly actionHint: string;
  } | null;
  readonly clearAllErrors: boolean;
}

export function buildSyncOutcome(params: {
  provider: ProviderCatalogEntry;
  /** Post-increment executed-sync counter (mock parity). */
  syncCounter: number;
  /** Persisted retry count BEFORE this run (mock: sync.retryCount += 1). */
  previousRetryCount: number;
  wasDegraded: boolean;
  batch: number | null;
  now: Date;
}): SyncPatch {
  const { provider, syncCounter, previousRetryCount, wasDegraded, batch, now } = params;
  const nowIso = now.toISOString();
  const partial = partialSyncDue(provider.kind, syncCounter);
  const processed = recordsProcessedFor(provider.kind, syncCounter);
  const durationMs = syncDurationMs(syncCounter);
  const cursor = batch !== null ? `batch-${batch}` : null;

  if (partial) {
    const retryCount = previousRetryCount + 1;
    return {
      lastAttemptedAt: nowIso,
      lastSuccessAt: null,
      lastDurationMs: durationMs,
      recordsProcessedDelta: processed,
      recordsFailed: 1,
      retryCount,
      cursor,
      nextRetryAt: new Date(now.getTime() + backoffDelayMs(retryCount)).toISOString(),
      status: "DEGRADED",
      authState: "OK",
      eventType: "DEGRADED",
      eventMessage: "Partial sync - 1 record failed, cursor retained",
      error: {
        code: "PARTIAL_SYNC",
        message: "Incremental sync completed with 1 failed record",
        retryable: true,
        actionHint: "Retry the sync - the cursor resumes where it stopped",
      },
      clearAllErrors: false,
    };
  }

  return {
    lastAttemptedAt: nowIso,
    lastSuccessAt: nowIso,
    lastDurationMs: durationMs,
    recordsProcessedDelta: processed,
    recordsFailed: 0,
    retryCount: 0,
    cursor,
    nextRetryAt: null,
    status: "CONNECTED",
    authState: "OK",
    eventType: wasDegraded ? "RECOVERED" : "SYNCED",
    eventMessage: wasDegraded
      ? "Sync healthy again - provider fully operational"
      : `Incremental sync ok - ${processed} record(s) in ${durationMs} ms (cursor ${cursor ?? "n/a"})`,
    error: null,
    clearAllErrors: wasDegraded,
  };
}
