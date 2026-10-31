import type { IntegrationStatus } from "../schemas/integration";

/**
 * Integration Hub pure helpers - used by the mock engine AND the UI.
 * No I/O, no framework, no clock reads (callers pass `now`).
 */

// ── Retries (§16) ────────────────────────────────────────────────────────────

/**
 * Exponential backoff with a hard cap: 1 s → 2 s → 4 s → … capped at 60 s.
 * `retryCount` is the number of FAILED attempts already made (0 = first retry).
 */
export function backoffDelayMs(
  retryCount: number,
  baseMs = 1000,
  factor = 2,
  capMs = 60_000,
): number {
  const safeCount = Math.max(0, Math.floor(retryCount));
  return Math.min(baseMs * factor ** safeCount, capMs);
}

/** Maximum automatic retries before dead-lettering (manual retry takes over). */
export const MAX_AUTO_RETRIES = 5;

// ── Staleness (§23 - Monitoring detects stale integrations) ─────────────────

/** Default freshness TTL for a provider sync (15 minutes). */
export const SYNC_FRESH_TTL_MS = 15 * 60 * 1000;

export function isSyncStale(
  lastSuccessAtIso: string | null,
  nowMs: number,
  ttlMs: number = SYNC_FRESH_TTL_MS,
): boolean {
  if (lastSuccessAtIso === null) return true;
  const last = Date.parse(lastSuccessAtIso);
  if (Number.isNaN(last)) return true;
  return nowMs - last > ttlMs;
}

// ── Status ordering (§5 overview severity) ───────────────────────────────────

const STATUS_SEVERITY: Record<IntegrationStatus, number> = {
  ERROR: 0,
  AUTH_REQUIRED: 1,
  DEGRADED: 2,
  SYNCING: 3,
  DISCONNECTED: 4,
  CONNECTED: 5,
};

/** Lower = more attention needed. Used to sort provider tables. */
export function statusSeverity(status: IntegrationStatus): number {
  return STATUS_SEVERITY[status];
}

// ── Idempotency (§14) ────────────────────────────────────────────────────────

/**
 * Deterministic idempotency key for an external record: `provider:eventId`.
 * The provider prefix keeps collisions impossible across sources.
 */
export function idempotencyKey(providerId: string, providerEventId: string): string {
  return `${providerId}:${providerEventId}`;
}

// ── Secret hygiene (§15, §18) ────────────────────────────────────────────────

/**
 * Replace every occurrence of the given secret strings with a masked run.
 * Used on ALL user-facing messages so provider tokens can never leak into
 * errors, logs or the UI.
 */
export function sanitizeSecrets(text: string, secrets: string[]): string {
  let safe = text;
  for (const secret of secrets) {
    if (secret.length >= 4 && safe.includes(secret)) {
      safe = safe.split(secret).join("••••••••");
    }
  }
  return safe;
}

// ── Webhook replay protection (§12) ─────────────────────────────────────────

/** Deliveries older than 5 minutes are rejected as replays. */
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function isWebhookTimestampFresh(
  timestampMs: number,
  nowMs: number,
  toleranceMs: number = WEBHOOK_REPLAY_WINDOW_MS,
): boolean {
  const delta = Math.abs(nowMs - timestampMs);
  return delta <= toleranceMs;
}
