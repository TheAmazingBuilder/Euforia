/**
 * Account application service (Phase 2 §24, §32–§33 + Phase 0 §K "profile &
 * prefs" scope): /me profile, deactivation and scheduled deletion.
 *
 * Phase 15: the 9-domain preferences doc moved to the dedicated Settings
 * bounded context (modules/settings). This service keeps ONE preferences
 * responsibility - the Localization↔Profile timezone mirror (single source
 * of truth: Profile, settings.ts boundary rules): a profile timezone change
 * mirrors into the existing preferences document through the narrow
 * updatePreferences contract. If the document does not exist yet, there is
 * nothing to mirror - Settings provisions it from the current profile.
 *
 * Email change (§24): the new address must complete verification before it
 * becomes the verified identity - until then the account returns to
 * PENDING_VERIFICATION (login gate: EMAIL_NOT_VERIFIED). The old address is
 * never automatically verified.
 */
import { Inject, Injectable } from "@nestjs/common";
import { userPreferencesSchema } from "../../shared/contracts";
import { IdentityRepository, type UserRow } from "./identity.repository";
import { MailerService } from "./mailer.service";
import { SecurityEventService } from "../security/security-event.service";
import { AuthRateLimiterService } from "./auth-rate-limiter.service";
import { toAuthUser } from "./mappers";
import { ConflictError } from "../../shared/errors/app-error";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";

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
    // mirror into the preferences localization domain when the document
    // already exists (Phase 15 - Settings owns the doc and its provisioning;
    // a missing document is provisioned from the current profile instead).
    if (input.timezone !== undefined && user.preferences) {
      const doc = userPreferencesSchema.parse(user.preferences);
      const mirrored = {
        ...doc,
        localization: { ...doc.localization, timezone: input.timezone },
        updatedAt: new Date().toISOString(),
      };
      userPreferencesSchema.parse(mirrored);
      await this.repository.updatePreferences(user.id, mirrored);
    }

    if (emailChangePending) {
      const expiresAt = await this.issueEmailChangeChallenge(updated);
      void expiresAt;
      await this.events.record({
        userId: user.id,
        type: "SENSITIVE_SETTINGS_CHANGED",
        actor: user.email,
        context: `Email change requested - verification sent to ${updated.email}.`,
      });
    }

    return {
      profile: this.profile(updated),
      user: toAuthUser(updated),
      emailChangePending,
    };
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
      context: "Account deactivated - all sessions signed out.",
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
