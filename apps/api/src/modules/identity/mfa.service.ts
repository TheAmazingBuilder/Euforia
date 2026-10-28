/**
 * MFA / TOTP application service (Phase 2 mandate §18–§21).
 *
 * Enable flow: reauth → generate secret (+ encrypted at rest, pending) +
 * recovery codes (hashed, inactive) → shown ONCE → confirm with a live TOTP
 * code → activated. Disable: reauth → wipe everything → TFA_DISABLED event.
 * Recovery codes: single-use, hashed at rest, regeneration invalidates the
 * previous set (§20).
 */
import { Inject, Injectable } from "@nestjs/common";
import { randomInt, timingSafeEqual } from "node:crypto";
import { IdentityRepository, type UserRow } from "./identity.repository";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { TotpService } from "./totp.service";
import { ReauthService } from "./reauth.service";
import { SecurityEventService } from "../security/security-event.service";
import { MailerService } from "./mailer.service";
import { AuthRateLimiterService } from "./auth-rate-limiter.service";
import { BusinessRuleError, ConflictError, RateLimitError } from "../../shared/errors/app-error";

export interface TwoFactorState {
  enabled: boolean;
  pending: boolean;
  method: "AUTHENTICATOR_APP" | "EMAIL" | null;
  enabledAt: string | null;
  disabledAt: string | null;
  lastVerifiedAt: string | null;
  recoveryCodesRemaining: number;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly totp: TotpService,
    private readonly reauth: ReauthService,
    private readonly events: SecurityEventService,
    private readonly mailer: MailerService,
    private readonly limiter: AuthRateLimiterService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** POST /security/2fa/enable - returns the one-time enrollment payload. */
  async enable(
    user: UserRow,
    reauthToken: string | undefined,
  ): Promise<{ secret: string; recoveryCodes: string[] }> {
    await this.reauth.consume(reauthToken, user.id);
    if (user.mfaEnabledAt) {
      throw new ConflictError("Two-factor authentication is already enabled.", "TFA_ALREADY_ON");
    }

    const { secret } = this.totp.generateEnrollment(user.email);
    const plainCodes = this.totp.generateRecoveryCodes(10);
    await this.repository.replaceRecoveryCodes(
      user.id,
      plainCodes.map((code) => this.totp.hashRecoveryCode(code)),
    );
    const updated = await this.repository.updateUser(user.id, {
      mfaPendingSecretEnc: this.totp.encryptSecret(secret),
    });

    await this.events.record({
      userId: user.id,
      type: "SENSITIVE_SETTINGS_CHANGED",
      actor: user.email,
      context: "Two-factor enrollment started - awaiting confirmation.",
    });
    void updated;
    return { secret, recoveryCodes: plainCodes };
  }

  /** Begin email MFA enrollment. The method stays disabled until the mailbox code is confirmed. */
  async enableEmail(
    user: UserRow,
    reauthToken: string | undefined,
  ): Promise<{ pending: true; expiresAt: string }> {
    await this.reauth.consume(reauthToken, user.id);
    if (!user.emailVerifiedAt) {
      throw new BusinessRuleError("Verify your email address before enabling email authentication.", "EMAIL_NOT_VERIFIED");
    }
    if (user.mfaEnabledAt) {
      throw new ConflictError("Disable the current two-factor method before switching methods.", "TFA_ALREADY_ON");
    }

    const sendCheck = this.limiter.check("mfa_email_enroll", user.email);
    if (!sendCheck.allowed) {
      throw new RateLimitError("Too many email verification codes requested. Please wait before trying again.", "RATE_LIMITED", sendCheck.retryAfterSeconds);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + this.config.auth.mfaChallengeMinutes * 60 * 1000);
    this.limiter.hit("mfa_email_enroll", user.email);
    await this.mailer.sendEmailMfaCode(user.email, code, `${this.config.auth.mfaChallengeMinutes} minutes`);
    await this.repository.updateUser(user.id, {
      mfaPendingEmailCodeHash: IdentityRepository.hashToken(code),
      mfaPendingEmailExpiresAt: expiresAt,
      mfaPendingEmailAttempts: 0,
      mfaPendingSecretEnc: null,
    });
    return { pending: true, expiresAt: expiresAt.toISOString() };
  }

  /** Confirm email MFA enrollment, then return one-time recovery codes. */
  async confirmEmail(
    user: UserRow,
    code: string,
  ): Promise<{ state: TwoFactorState; recoveryCodes: string[] }> {
    if (user.mfaEnabledAt) {
      throw new ConflictError("Two-factor authentication is already enabled.", "TFA_ALREADY_ON");
    }
    const hash = user.mfaPendingEmailCodeHash;
    const expiresAt = user.mfaPendingEmailExpiresAt;
    if (!hash || !expiresAt || expiresAt.getTime() <= Date.now() || user.mfaPendingEmailAttempts >= 5) {
      await this.repository.updateUser(user.id, {
        mfaPendingEmailCodeHash: null,
        mfaPendingEmailExpiresAt: null,
        mfaPendingEmailAttempts: 0,
      });
      throw new BusinessRuleError("The email verification code expired. Start email 2FA setup again.", "EMAIL_MFA_CHALLENGE_EXPIRED");
    }

    const submitted = Buffer.from(IdentityRepository.hashToken(code), "hex");
    const expected = Buffer.from(hash, "hex");
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
      const attempts = user.mfaPendingEmailAttempts + 1;
      await this.repository.updateUser(user.id, {
        mfaPendingEmailAttempts: attempts,
        ...(attempts >= 5 ? {
          mfaPendingEmailCodeHash: null,
          mfaPendingEmailExpiresAt: null,
          mfaPendingEmailAttempts: 0,
        } : {}),
      });
      throw new BusinessRuleError(
        attempts >= 5 ? "Too many incorrect codes. Start email 2FA setup again." : "That code didn't match. Check your email and try again.",
        attempts >= 5 ? "EMAIL_MFA_TOO_MANY_ATTEMPTS" : "INVALID_CODE",
      );
    }

    const plainCodes = this.totp.generateRecoveryCodes(10);
    await this.repository.replaceRecoveryCodes(user.id, plainCodes.map((value) => this.totp.hashRecoveryCode(value)));
    const now = new Date();
    const updated = await this.repository.updateUser(user.id, {
      mfaSecretEnc: null,
      mfaPendingSecretEnc: null,
      mfaPendingEmailCodeHash: null,
      mfaPendingEmailExpiresAt: null,
      mfaPendingEmailAttempts: 0,
      mfaMethod: "EMAIL",
      mfaEnabledAt: now,
      mfaDisabledAt: null,
      mfaLastVerifiedAt: now,
    });
    await this.repository.activateRecoveryCodes(user.id);
    await this.events.record({
      userId: user.id,
      type: "TFA_ENABLED",
      actor: user.email,
      context: "Two-factor authentication enabled (email code).",
    });
    return { state: await this.state(updated), recoveryCodes: plainCodes };
  }

  /** POST /security/2fa/confirm - activates the pending enrollment (no reauth: the TOTP code IS the proof). */
  async confirm(user: UserRow, code: string): Promise<TwoFactorState> {
    if (user.mfaEnabledAt) {
      throw new ConflictError("Two-factor authentication is already enabled.", "TFA_ALREADY_ON");
    }
    const pending = user.mfaPendingSecretEnc;
    if (!pending) {
      throw new ConflictError("Start two-factor setup before confirming.", "NO_PENDING_ENROLLMENT");
    }
    const secret = this.totp.decryptSecret(pending);
    if (!secret || !this.totp.verify(secret, user.email, code)) {
      throw new BusinessRuleError("That code didn't match - check your authenticator app.", "INVALID_CODE");
    }

    const now = new Date();
    const updated = await this.repository.updateUser(user.id, {
      mfaSecretEnc: pending,
      mfaPendingSecretEnc: null,
      mfaEnabledAt: now,
      mfaLastVerifiedAt: now,
      mfaDisabledAt: null,
      mfaPendingEmailCodeHash: null,
      mfaPendingEmailExpiresAt: null,
      mfaPendingEmailAttempts: 0,
      mfaMethod: "AUTHENTICATOR_APP",
    });
    await this.repository.activateRecoveryCodes(user.id);
    await this.events.record({
      userId: user.id,
      type: "TFA_ENABLED",
      actor: user.email,
      context: "Two-factor authentication enabled (authenticator app).",
    });
    return this.state(updated);
  }

  /** POST /security/2fa/disable - sensitive: reauth required, codes destroyed. */
  async disable(user: UserRow, reauthToken: string | undefined): Promise<TwoFactorState> {
    await this.reauth.consume(reauthToken, user.id);
    if (!user.mfaEnabledAt) {
      throw new ConflictError("Two-factor authentication is already disabled.", "TFA_ALREADY_OFF");
    }
    const now = new Date();
    const updated = await this.repository.updateUser(user.id, {
      mfaSecretEnc: null,
      mfaPendingSecretEnc: null,
      mfaEnabledAt: null,
      mfaDisabledAt: now,
      mfaLastVerifiedAt: null,
      mfaPendingEmailCodeHash: null,
      mfaPendingEmailExpiresAt: null,
      mfaPendingEmailAttempts: 0,
      mfaMethod: null,
    });
    await this.repository.deactivateRecoveryCodes(user.id);
    await this.events.record({
      userId: user.id,
      type: "TFA_DISABLED",
      actor: user.email,
      context: "Two-factor authentication disabled - recovery codes invalidated.",
    });
    return this.state(updated);
  }

  /** POST /security/2fa/recovery/regenerate - replaces the whole set. */
  async regenerateCodes(
    user: UserRow,
    reauthToken: string | undefined,
  ): Promise<{ recoveryCodes: string[] }> {
    await this.reauth.consume(reauthToken, user.id);
    if (!user.mfaEnabledAt) {
      throw new ConflictError("Enable two-factor authentication first.", "TFA_OFF");
    }
    const plainCodes = this.totp.generateRecoveryCodes(10);
    await this.repository.replaceRecoveryCodes(
      user.id,
      plainCodes.map((code) => this.totp.hashRecoveryCode(code)),
    );
    await this.events.record({
      userId: user.id,
      type: "RECOVERY_CODES_REGENERATED",
      actor: user.email,
      context: "Recovery codes regenerated - previous set invalidated.",
    });
    return { recoveryCodes: plainCodes };
  }

  /** Project the shared TwoFactorState shape. */
  async state(user: UserRow): Promise<TwoFactorState> {
    const remaining = (await this.repository.listActiveRecoveryCodes(user.id)).length;
    return {
      enabled: Boolean(user.mfaEnabledAt),
      pending: !user.mfaEnabledAt && Boolean(user.mfaPendingSecretEnc || user.mfaPendingEmailCodeHash),
      method: user.mfaEnabledAt ? (user.mfaMethod === "EMAIL" ? "EMAIL" : "AUTHENTICATOR_APP") : null,
      enabledAt: user.mfaEnabledAt ? mfaIso(user.mfaEnabledAt) : null,
      disabledAt: user.mfaDisabledAt ? mfaIso(user.mfaDisabledAt) : null,
      lastVerifiedAt: user.mfaLastVerifiedAt ? mfaIso(user.mfaLastVerifiedAt) : null,
      recoveryCodesRemaining: remaining,
    };
  }
}

function mfaIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
