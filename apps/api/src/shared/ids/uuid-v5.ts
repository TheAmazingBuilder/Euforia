/**
 * Deterministic RFC-4122 v5-style UUID (SHA-1, name + namespace) —
 * stdlib-only implementation (node:crypto).
 *
 * WHY HERE: derived timeline rows (ENTRY/EXIT) need stable, contract-valid
 * ids (shared sessionEventSchema.id = uuid) WITHOUT persisting them — the
 * same trade always yields the same event id (idempotency §63, replay-safe).
 * analytics-math owns its own copy for Monte-Carlo grouping; extracting one
 * shared helper is NOT worth a cross-context dependency today (Phase 10
 * audit note — no analytics import from a closed module).
 */
import { createHash } from "node:crypto";

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}

export function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = uuidToBytes(namespace);
  const hash = createHash("sha1")
    .update(namespaceBytes)
    .update(name, "utf8")
    .digest();

  // Per RFC-4122 §4.3: set version 5 + variant bits.
  hash[6] = ((hash[6] as number) & 0x0f) | 0x50;
  hash[8] = ((hash[8] as number) & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Cosmoz stable namespace for derived session-live ids (fixed). */
export const SESSION_LIVE_DERIVED_UUID_NAMESPACE = "6f0a1b5e-8f4c-4b7a-9c0e-1d3f5a7b9c21";
