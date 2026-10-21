/**
 * Oryon workspace configuration naming — pure helpers (Phase 6 spec §4, §6).
 *
 * Shared by workspace layouts AND chart templates: both are user-named
 * records with the same validation policy and the same duplicate policy.
 *
 * Duplicate-name policy (documented product decision): names are unique
 * CASE-INSENSITIVELY within their collection. " EURUSD " and "eurusd" are
 * the same name after trimming — a create/rename that collides is REJECTED
 * with an inline error instead of silently creating a confusing twin.
 *
 * These functions never throw and never touch storage — the store layers
 * them into mutation results.
 */

/** Hard cap shared with the persisted contract (`name` max length). */
export const ORYON_CONFIG_NAME_MAX = 48;

/**
 * Normalizes a user-supplied name. Returns null when the name is empty
 * after trimming or exceeds the contract cap — the two invalid shapes.
 */
export function normalizeConfigName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > ORYON_CONFIG_NAME_MAX) return null;
  return trimmed;
}

/** True when `name` already exists in `names` (case-insensitive). */
export function configNameTaken(name: string, names: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return names.some((existing) => existing.toLowerCase() === lower);
}

/**
 * Deterministic duplicate name: "<base> (copy)", then "<base> (copy 2)",
 * "<base> (copy 3)"… until unique. The suffix is guaranteed to fit inside
 * the contract cap (the base is truncated when needed), so a duplicate of
 * a maximum-length name never produces an invalid record.
 */
export function uniqueCopyName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));

  const candidate = (n: number): string => {
    const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
    return base.slice(0, ORYON_CONFIG_NAME_MAX - suffix.length) + suffix;
  };

  for (let n = 1; ; n++) {
    const name = candidate(n);
    if (!taken.has(name.toLowerCase())) return name;
  }
}
