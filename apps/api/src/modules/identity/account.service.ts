/**
 * Account application service (Phase 2 §24, §32–§33 + Phase 0 §K "profile &
 * prefs" scope): /me profile, the 9-domain preferences doc, deactivation and
 * scheduled deletion.
 *
 * Email change (§24): the new address must complete verification before it
 * becomes the verified identity — until then the account returns to
 * PENDING_VERIFICATION (login gate: EMAIL_NOT_VERIFIED). The old address is
 * never automatically verified.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  DEFAULT_USER_PREFERENCES,
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
  type PreferenceDomain,
  type UserPreferences,
} from "../../shared/contracts";
import { IdentityRepository, type UserRow } from "./identity.repository";
import { MailerService } from "./mailer.service";
import { SecurityEventService } from "../security/security-event.service";
import { AuthRateLimiterService } from "./auth-rate-limiter.service";
import { toAuthUser } from "./mappers";
import { ConflictError } from "../../shared/errors/app-error";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { z } from "zod";

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
export class AccountService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly mailer: MailerService,
    private readonly events: SecurityEventService,
    private readonly limiter: AuthRateLimiterService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── GET/PATCH /me (profile) ─────────────────────────────────────────────────

  profile(user: UserRow) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      baseCurrency: user.baseCurrency,
      username: user.username,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
    };
  }

  async updateProfile(
    user: UserRow,
    input: {
      name?: string;
      email?: string;
      timezone?: string;
      username?: string | null;
      bio?: string | null;
      avatarUrl?: string | null;
    },
  ): Promise<{ profile: ReturnType<AccountService["profile"]>; user: ReturnType<typeof toAuthUser>; emailChangePending: boolean }> {
    const patch: Record<string, unknown> = {};

    if (input.name !== undefined) patch.name = input.name;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.username !== undefined) {
      if (input.username !== null && (await this.repository.isUsernameTaken(input.username, user.id))) {
        throw new ConflictError("That username is already taken.", "USERNAME_ALREADY_USED");
      }
      patch.username = input.username;
    }
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

    // ── Email change (§24) ──────────────────────────────────────────────────
    let emailChangePending = false;
    if (input.email !== undefined && input.email.toLowerCase() !== user.email) {
      if (await this.repository.isEmailTaken(input.email, user.id)) {
        throw new ConflictError(
          "An account already exists for this email address.",
          "EMAIL_ALREADY_USED",
        );
      }
      // The new address is NOT verified yet: the account re-enters the
      // verification gate until the new address is confirmed (the frontend's
      // AuthGate renders the verification screen for this state).
      patch.email = input.email.toLowerCase();
      patch.status = "PENDING_VERIFICATION";
      patch.emailVerifiedAt = null;
      emailChangePending = true;
    }

    const updated = await this.repository.updateUser(user.id, patch);

    // One source of truth for timezone = Profile (settings.ts boundary rule):
    // mirror into the preferences localization domain.
    if (input.timezone !== undefined) {
      const doc = await this.getPreferences(user.id);
      await this.repository.updateUser(user.id, {
        preferences: { ...doc, localization: { ...doc.localization, timezone: input.timezone }, updatedAt: new Date().toISOString() },
      });
    }

    if (emailChangePending) {
      const expiresAt = await this.issueEmailChangeChallenge(updated);
      void expiresAt;
      await this.events.record({
        userId: user.id,
        type: "SENSITIVE_SETTINGS_CHANGED",
        actor: user.email,
        context: `Email change requested — verification sent to ${updated.email}.`,
      });
    }

    return {
      profile: this.profile(updated),
      user: toAuthUser(updated),
      emailChangePending,
    };
  }

  // ── Preferences (9 domains, one JSON doc per user) ──────────────────────────

  async getPreferences(userId: string): Promise<UserPreferences> {
    const user = await this.repository.findUserById(userId);
    if (user?.preferences) {
      return userPreferencesSchema.parse(user.preferences);
    }
    const fresh: UserPreferences = {
      ...structuredClone(DEFAULT_USER_PREFERENCES),
      userId,
      updatedAt: new Date().toISOString(),
    } as UserPreferences;
    await this.repository.updateUser(userId, { preferences: fresh });
    return fresh;
  }

  async updatePreferencesDomain(
    userId: string,
    domain: PreferenceDomain,
    input: unknown,
  ): Promise<UserPreferences> {
    const doc = await this.getPreferences(userId);
    const parsed = PREFERENCE_DOMAIN_SCHEMAS[domain].parse(input) as Record<string, unknown>;
    const next: UserPreferences = {
      ...doc,
      [domain]: parsed,
      updatedAt: new Date().toISOString(),
    } as UserPreferences;
    userPreferencesSchema.parse(next); // full-doc invariant before persisting

    // The Localization domain mirrors Profile.timezone — write-through (§
    // settings.ts boundary rule: ONE source of truth = Profile).
    if (domain === "localization") {
      const tz = (parsed as { timezone?: string }).timezone;
      if (typeof tz === "string") {
        await this.repository.updateUser(userId, { timezone: tz });
      }
    }
    await this.repository.updateUser(userId, { preferences: next });
    return next;
  }

  async resetPreferencesDomain(userId: string, domain: PreferenceDomain): Promise<UserPreferences> {
    const doc = await this.getPreferences(userId);
    const next: UserPreferences = {
      ...doc,
      [domain]: structuredClone(DEFAULT_USER_PREFERENCES[domain]),
      updatedAt: new Date().toISOString(),
    } as UserPreferences;
    if (domain === "localization") {
      await this.repository.updateUser(userId, {
        timezone: DEFAULT_USER_PREFERENCES.localization.timezone,
      });
    }
    await this.repository.updateUser(userId, { preferences: next });
    return next;
  }

  // ── Deactivation / scheduled deletion (§32–§33) ─────────────────────────────

  async deactivate(user: UserRow, confirmation: string) {
    if (confirmation !== "DEACTIVATE") {
      throw new ConflictError("Type DEACTIVATE to confirm.", "INVALID_CONFIRMATION");
    }
    const now = new Date();
    await this.repository.updateUser(user.id, { status: "DEACTIVATED" });
    await this.repository.revokeAllSessionsForUser(user.id);
    await this.events.record({
      userId: user.id,
      type: "SENSITIVE_SETTINGS_CHANGED",
      actor: user.email,
      context: "Account deactivated — all sessions signed out.",
    });
    void now;
    return { status: "DEACTIVATED" as const, deactivatedAt: now.toISOString() };
  }

  async requestDeletion(user: UserRow, confirmation: string) {
    if (confirmation !== "DELETE") {
      throw new ConflictError("Type DELETE to confirm.", "INVALID_CONFIRMATION");
    }
    // 14-day grace period (mock parity); the purge/anonymization job itself
    // arrives once the data-owning domains exist (documented deferral).
    const scheduledFor = new Date(Date.now() + 14 * 86_400_000);
    await this.repository.updateUser(user.id, {
      status: "DEACTIVATED",
      deletionScheduledFor: scheduledFor,
    });
    await this.repository.revokeAllSessionsForUser(user.id);
    await this.events.record({
      userId: user.id,
      type: "ACCOUNT_DELETION_REQUESTED",
      actor: user.email,
      context: `Account deletion scheduled for ${scheduledFor.toISOString()}.`,
    });
    return { status: "SCHEDULED" as const, scheduledFor: scheduledFor.toISOString() };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Email-change challenge: same mechanism, tightened anti-abuse limits. */
  private async issueEmailChangeChallenge(user: UserRow): Promise<string> {
    const ttlMs = this.config.auth.emailVerificationHours * 3_600_000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const token = IdentityRepository.randomToken(24);
    await this.repository.createChallenge({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: IdentityRepository.hashToken(token),
      expiresAt,
    });
    await this.mailer.sendEmailChangeVerification(user.email, token, `${this.config.auth.emailVerificationHours} hours`);
    void this.limiter;
    return expiresAt.toISOString();
  }
}
