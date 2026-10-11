/**
 * Settings domain rules (Phase 15) — PURE functions: no framework, no
 * Prisma, no I/O. Unit-testable in isolation.
 *
 * The preferences document is a SINGLETON aggregate per user (shared
 * userPreferencesSchema — one JSON doc, 9 strictly validated domains).
 * Updates are PER DOMAIN (PATCH /me/preferences/:domain — the Settings UI
 * saves one card at a time, "unrelated settings are NEVER saved together"),
 * merged under the full-document invariant before any persistence.
 *
 * Boundary rules (shared settings.ts + Phase 15 §3):
 *  - Identity owns the User row and Profile.timezone (ONE source of truth —
 *    the doc's localization.timezone is a mirror resolved at read time).
 *  - Risk preferences are DEFAULTS for the Rules Engine — they never
 *    enforce anything by themselves (§20) and are never auto-propagated.
 *  - Auth/security/account/integration secrets NEVER live here.
 */
import { z } from "zod";
import {
  DEFAULT_USER_PREFERENCES,
  tradingPreferencesSchema,
  riskPreferencesSchema,
  journalPreferencesSchema,
  notificationPreferencesSchema,
  appearancePreferencesSchema,
  dashboardPreferencesSchema,
  academyPreferencesSchema,
  privacyPreferencesSchema,
  localizationPreferencesSchema,
  userPreferencesSchema,
  type PreferenceDomain,
  type UserPreferences,
} from "../../../shared/contracts";

/** Per-domain input schemas — single source of truth: @cosmoz/shared
 * (each `<domain>PreferencesSchema` is its own input schema per settings.ts).
 * Cast note: the record is keyed by the PreferenceDomain union, and each
 * schema is a distinct object type — the widened z.ZodTypeAny view is the
 * same trade-off the mock engine already makes (mocks/store.ts). */
export const PREFERENCE_DOMAIN_SCHEMAS: Record<PreferenceDomain, z.ZodTypeAny> = {
  trading: tradingPreferencesSchema,
  risk: riskPreferencesSchema,
  journal: journalPreferencesSchema,
  notifications: notificationPreferencesSchema,
  appearance: appearancePreferencesSchema,
  dashboard: dashboardPreferencesSchema,
  academy: academyPreferencesSchema,
  privacy: privacyPreferencesSchema,
  localization: localizationPreferencesSchema,
};

/**
 * A fresh document for a new user: safe shared defaults + the server-managed
 * envelope (userId + updatedAt). Deep-cloned so callers can never mutate the
 * shared defaults object.
 */
export function buildFreshPreferences(userId: string, now = new Date()): UserPreferences {
  return {
    ...structuredClone(DEFAULT_USER_PREFERENCES),
    userId,
    updatedAt: now.toISOString(),
  } as UserPreferences;
}

/**
 * Parse the RAW stored doc (defense in depth — the DB holds a Zod-validated
 * document by construction, but a corrupted/hand-edited row must never leak
 * past the contract). Returns the safe defaults shape on absence.
 */
export function parseStoredPreferences(raw: unknown, userId: string, now = new Date()): UserPreferences {
  if (raw === null || raw === undefined) {
    return buildFreshPreferences(userId, now);
  }
  return userPreferencesSchema.parse(raw);
}

/**
 * Replace ONE validated domain inside the document (the update semantics the
 * frontend contract implements: the PATCH body is the whole domain object —
 * unrelated domains are untouched, never reset). Re-validates the FULL
 * document as the persist invariant (Phase 2 precedent), refreshing
 * updatedAt.
 */
export function mergeDomain(
  previous: UserPreferences,
  domain: PreferenceDomain,
  parsedInput: Record<string, unknown>,
  now = new Date(),
): UserPreferences {
  const next: UserPreferences = {
    ...previous,
    [domain]: parsedInput,
    updatedAt: now.toISOString(),
  } as UserPreferences;
  userPreferencesSchema.parse(next); // full-doc invariant before persistence
  return next;
}

/** Restore ONE domain to the safe shared defaults (§37 — reset is scoped:
 * it never touches other domains, and other contexts' data is out of reach). */
export function resetDomainToDefaults(
  previous: UserPreferences,
  domain: PreferenceDomain,
  now = new Date(),
): UserPreferences {
  const next: UserPreferences = {
    ...previous,
    [domain]: structuredClone(DEFAULT_USER_PREFERENCES[domain]),
    updatedAt: now.toISOString(),
  } as UserPreferences;
  userPreferencesSchema.parse(next);
  return next;
}

/**
 * Audit triage (§33) — which preference changes are security/audit relevant.
 * NOT every harmless UI preference is audited; the triage covers:
 *  - timezone change (server-side trading-day keys are computed from it),
 *  - privacy consent changes (usage analytics / diagnostics opt-ins),
 *  - default trading account reference change (cross-domain reference).
 * The returned notes are human-safe contexts — never values that could
 * carry secrets (there are none in this doc by construction).
 */
export function extractSensitiveChanges(
  domain: PreferenceDomain,
  previous: UserPreferences,
  next: UserPreferences,
): string[] {
  const notes: string[] = [];

  if (domain === "localization" && previous.localization.timezone !== next.localization.timezone) {
    notes.push(`Timezone changed to ${next.localization.timezone}.`);
  }

  if (domain === "privacy") {
    notes.push("Privacy preferences updated.");
  }

  if (domain === "trading" && previous.trading.defaultAccountId !== next.trading.defaultAccountId) {
    notes.push(
      next.trading.defaultAccountId === null
        ? "Default trading account cleared."
        : "Default trading account changed.",
    );
  }

  return notes;
}
