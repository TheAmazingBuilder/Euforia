/**
 * Settings pure logic (Phase 15) — document assembly helpers.
 *
 * The Settings bounded context owns ONE aggregate: the 9-domain user
 * preferences document (shared settings.ts). These helpers are the only
 * places that build new document versions, so the invariants hold in one
 * spot:
 *   - a domain update never touches sibling domains (§39);
 *   - a reset restores ONLY that domain's defaults (§37);
 *   - the envelope fields (userId / updatedAt) are server-managed (§10/§30):
 *     a client can never supply or spoof them through a domain payload.
 *
 * Pure functions — no Prisma, no Nest — unit-tested in isolation.
 */
import {
  DEFAULT_USER_PREFERENCES,
  type PreferenceDomain,
  type UserPreferences,
} from "../../shared/contracts";

/**
 * Fresh document from safe defaults — the register flow persists
 * `preferences: null`, so the first preferences read lazily provisions it.
 */
export function freshPreferencesDoc(userId: string, now: Date = new Date()): UserPreferences {
  return {
    ...structuredClone(DEFAULT_USER_PREFERENCES),
    userId,
    updatedAt: now.toISOString(),
  } as UserPreferences;
}

/** One-domain merge — sibling domains are carried over verbatim (§39). */
export function mergeDomainIntoDoc(
  doc: UserPreferences,
  domain: PreferenceDomain,
  parsed: Record<string, unknown>,
  now: Date = new Date(),
): UserPreferences {
  return {
    ...doc,
    [domain]: parsed,
    updatedAt: now.toISOString(),
  } as UserPreferences;
}

/** Reset ONE domain to defaults — never touches unrelated domains (§37). */
export function resetDomainInDoc(
  doc: UserPreferences,
  domain: PreferenceDomain,
  now: Date = new Date(),
): UserPreferences {
  return mergeDomainIntoDoc(doc, domain, structuredClone(DEFAULT_USER_PREFERENCES[domain]), now);
}

/**
 * Timezone write-through source (Phase 15 §15): only the localization
 * domain carries the mirrored Profile.timezone. Returns the timezone the
 * profile must adopt, or null when no write-through applies. The timezone
 * of OTHER domains is irrelevant by contract (single source of truth:
 * Profile — settings.ts boundary rules).
 */
export function timezoneWriteThroughOf(
  domain: PreferenceDomain,
  parsed: Record<string, unknown>,
): string | null {
  if (domain !== "localization") return null;
  const tz = (parsed as { timezone?: unknown }).timezone;
  return typeof tz === "string" ? tz : null;
}
