/**
 * Settings application service (Phase 15) — the 9-domain user preferences
 * document.
 *
 * Bounded context (Phase 15 §3): Settings owns HOW the user prefers Cosmoz
 * to behave/display information. It does NOT own identity (Profile), auth,
 * trading accounts (it only holds a validated reference, §21), integrations
 * or system configuration (§6 — no GET /settings/config exists here).
 *
 * Persistence reuses the existing `User.preferences` JSON column (§28 —
 * evolve, don't duplicate): IdentityRepository stays the ONLY writer of the
 * User table; this service goes through its narrow preferences contract.
 *
 * Security model (§31/§32): authenticated principal (global JWT guard) →
 * ownership from the token, never from the client → Zod domain validation
 * (unknown fields stripped = safely ignored) → server-managed envelope
 * (userId/updatedAt) → full-document invariant before every persist.
 */
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  userPreferencesSchema,
  tradingPreferencesSchema,
  riskPreferencesSchema,
  journalPreferencesSchema,
  notificationPreferencesSchema,
  appearancePreferencesSchema,
  dashboardPreferencesSchema,
  academyPreferencesSchema,
  privacyPreferencesSchema,
  localizationPreferencesSchema,
  SETTINGS_ERROR_CODES,
  type PreferenceDomain,
  type UserPreferences,
} from "../../shared/contracts";
import { IdentityRepository, type UserRow } from "../identity/identity.repository";
import { AccountsRepository } from "../accounts/accounts.repository";
import { SecurityEventService } from "../security/security-event.service";
import { NotFoundError } from "../../shared/errors/app-error";
import {
  freshPreferencesDoc,
  mergeDomainIntoDoc,
  resetDomainInDoc,
  timezoneWriteThroughOf,
} from "./settings.logic";

/**
 * Per-domain input schemas — single source of truth: @cosmoz/shared
 * (each `<domain>PreferencesSchema` is its own input schema per settings.ts).
 */
const PREFERENCE_DOMAIN_SCHEMAS: Record<PreferenceDomain, z.ZodTypeAny> = {
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

@Injectable()
export class SettingsService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly accounts: AccountsRepository,
    private readonly events: SecurityEventService,
  ) {}

  /** Full preferences doc — lazily provisioned from safe defaults. */
  async getPreferences(userId: string): Promise<UserPreferences> {
    const { doc } = await this.loadDoc(userId);
    return doc;
  }

  /**
   * PATCH /me/preferences/:domain — the client sends the WHOLE domain object
   * (frontend contract); only that domain changes, siblings are carried over
   * verbatim (§39 invariants).
   */
  async updatePreferencesDomain(
    userId: string,
    domain: PreferenceDomain,
    input: unknown,
  ): Promise<UserPreferences> {
    const { user, doc } = await this.loadDoc(userId);
    const parsed = PREFERENCE_DOMAIN_SCHEMAS[domain].parse(
      stripServerManagedKeys(input),
    ) as Record<string, unknown>;

    // §21 — a default trading account is a REFERENCE, not ownership: verify
    // the referenced account exists and belongs to the authenticated user
    // before persisting (foreign = not found, repo-wide IDOR convention).
    if (domain === "trading") {
      const accountId = (parsed as { defaultAccountId?: string | null }).defaultAccountId;
      if (typeof accountId === "string") {
        const account = await this.accounts.findAccountForUser(accountId, userId);
        if (account === null) {
          throw new NotFoundError(
            "Trading account not found.",
            SETTINGS_ERROR_CODES.DEFAULT_ACCOUNT_NOT_FOUND,
          );
        }
      }
    }

    const next = mergeDomainIntoDoc(doc, domain, parsed);
    userPreferencesSchema.parse(next); // full-doc invariant before persisting

    // §15 — the Localization domain mirrors Profile.timezone (ONE source of
    // truth); the write-through is atomic with the document persist (§29.6).
    const timezone = timezoneWriteThroughOf(domain, parsed);
    if (timezone !== null) {
      await this.repository.updatePreferencesWithTimezone(userId, next, timezone);
    } else {
      await this.repository.updatePreferences(userId, next);
    }

    // §33 — only security/audit-relevant preference changes hit the shared
    // ledger; cosmetic UI preferences stay noise-free (§40).
    if (domain === "privacy") {
      const before = (doc.privacy as { profileVisibility?: string }).profileVisibility;
      const after = (next.privacy as { profileVisibility?: string }).profileVisibility;
      if (before !== after) {
        await this.events.record({
          userId,
          type: "SENSITIVE_SETTINGS_CHANGED",
          actor: user.email,
          context: `Profile visibility changed from ${before} to ${after}.`,
        });
      }
    }

    return next;
  }

  /**
   * POST /me/preferences/reset — restores ONE domain's defaults (§37). The
   * localization reset keeps the mock-parity behavior: the mirrored
   * Profile.timezone follows the domain default (documented product
   * divergence from the UI copy, see PHASE-15-SETTINGS.md).
   */
  async resetPreferencesDomain(userId: string, domain: PreferenceDomain): Promise<UserPreferences> {
    const { doc } = await this.loadDoc(userId);
    const next = resetDomainInDoc(doc, domain);
    userPreferencesSchema.parse(next); // full-doc invariant before persisting

    // Mock parity: resetting localization restores the mirrored Profile
    // timezone together with the domain default (single atomic write).
    if (domain === "localization") {
      await this.repository.updatePreferencesWithTimezone(userId, next, next.localization.timezone);
    } else {
      await this.repository.updatePreferences(userId, next);
    }
    return next;
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Load the user + parsed doc, provisioning safe defaults on first read. */
  private async loadDoc(userId: string): Promise<{ user: UserRow; doc: UserPreferences }> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      // The token is valid but the user vanished between the guard and here.
      throw new NotFoundError("User not found.");
    }
    if (user.preferences) {
      return { user, doc: userPreferencesSchema.parse(user.preferences) };
    }
    const fresh = freshPreferencesDoc(userId);
    // The localization timezone MIRRORS the profile (single source of truth):
    // provisioning adopts the current profile value instead of the raw
    // default, so the mirror invariant holds from the first read (§15).
    fresh.localization.timezone = user.timezone;
    await this.repository.updatePreferences(userId, fresh);
    return { user, doc: fresh };
  }
}

/**
 * §31/§32 defense-in-depth — envelope fields are server-managed: strip them
 * from ANY incoming payload before validation so they can never be planted
 * into the document (Zod already strips unknown keys; this makes the
 * invariant explicit and independent of schema evolution).
 */
function stripServerManagedKeys(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const clone: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of ["userId", "updatedAt"]) delete clone[key];
  return clone;
}
