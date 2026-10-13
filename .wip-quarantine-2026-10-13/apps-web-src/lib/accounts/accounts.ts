import { z } from "zod";
import type {
  AccountConnectionState,
  AccountCredentialField,
  AccountSyncStatus,
} from "@cosmoz/shared";

/**
 * Accounts module — pure domain layer (no React, no DOM, no fetch).
 *
 * Shared by the MSW mock engine (server-side derivation) and the UI
 * (formatting). Sync freshness thresholds are CENTRALIZED here (prompt
 * §55) — eventually they come from provider capabilities, not the client.
 */

/** Freshness thresholds for a CONNECTED account's last successful sync. */
export const SYNC_FRESH_MS = 60_000; // < 60 s → LIVE
export const SYNC_DELAYED_MS = 300_000; // < 5 min → DELAYED
export const SYNC_STALE_MS = 900_000; // ≥ 5 min → STALE (demo horizon)

/**
 * Derive the synchronization status from the connection state + last
 * successful sync. LIVE must be EARNED by recency — never claimed merely
 * because the account was connected once (prompt §26).
 */
export function deriveSyncStatus(
  state: AccountConnectionState,
  lastSyncedAt: string | null,
  now: number = Date.now(),
): AccountSyncStatus {
  if (state === "DISCONNECTED") return "DISCONNECTED";
  if (state === "ERROR") return "ERROR";
  if (state === "CONNECTING") return "SYNCING";
  if (!lastSyncedAt) return "UNKNOWN";
  const age = now - new Date(lastSyncedAt).getTime();
  if (age < SYNC_FRESH_MS) return "LIVE";
  if (age < SYNC_DELAYED_MS) return "DELAYED";
  return "STALE";
}

/**
 * Mask a sensitive identifier — keep only the trailing `visible` chars,
 * prefix with `••••••`. The full value NEVER crosses the API boundary.
 */
export function maskTail(value: string, visible = 4, dots = 6): string {
  const tail = value.slice(-visible);
  return `${"•".repeat(dots)}${tail}`;
}

/**
 * Wizard credential form schema — built from the PROVIDER's field metadata
 * (prompt §15: the exact fields come from provider configuration, never a
 * hardcoded username+password model). Missing required values map to the
 * stable `REQUIRED` code the dict translates.
 */
export function connectionCredentialsSchema(
  fields: AccountCredentialField[],
): z.ZodType<Record<string, string>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.id] = field.required
      ? z.string().min(1, "REQUIRED")
      : z.string().default("");
  }
  return z.object(shape) as z.ZodType<Record<string, string>>;
}

/**
 * Simulated connection authentication (mock boundary — prompt §19: the
 * frontend phase mocks this behavior EXPLICITLY). Deterministic failure
 * mapping so the ERROR states are reproducible in tests:
 * - any required secret field left empty → AUTHENTICATION_FAILED
 * - a server field containing "invalid"  → INVALID_SERVER
 */
export function simulateConnectionTest(
  fields: AccountCredentialField[],
  credentials: Record<string, string>,
): { ok: true } | { ok: false; errorCode: string; fieldId: string | null } {
  for (const field of fields) {
    if (!field.required) continue;
    const value = (credentials[field.id] ?? "").trim();
    if (value === "") {
      return { ok: false, errorCode: "AUTHENTICATION_FAILED", fieldId: field.id };
    }
  }
  const server = (credentials.server ?? "").trim().toLowerCase();
  if (server.includes("invalid")) {
    return { ok: false, errorCode: "INVALID_SERVER", fieldId: "server" };
  }
  return { ok: true };
}

/** Initial snapshot balance of a freshly connected account (mock seed). */
export function initialSnapshotBalance(environment: "DEMO" | "LIVE"): string {
  return environment === "DEMO" ? "10000.00" : "5000.00";
}
