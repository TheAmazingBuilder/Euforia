/**
 * MFA / TOTP application service (Phase 2 mandate §18–§21).
 *
 * Enable flow: reauth → generate secret (+ encrypted at rest, pending) +
 * recovery codes (hashed, inactive) → shown ONCE → confirm with a live TOTP
 * code → activated. Disable: reauth → wipe everything → TFA_DISABLED event.
 * Recovery codes: single-use, hashed at rest, regeneration invalidates the
 * previous set (§20).
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { IdentityRepository, type UserRow } from "./identity.repository";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { TotpService } from "./totp.service";
import { ReauthService } from "./reauth.service";
import { SecurityEventService } from "../security/security-event.service";
import { MailerService } from "./mailer.service";
import { AuthRateLimiterService } from "./auth-rate-limiter.service";
import { BusinessRuleError, ConflictError, RateLimitError } from "../../shared/errors/app-error";
import { ROOT_LOGGER, type RootLogger } from "../../infrastructure/logging/logger.factory";

export interface TwoFactorState {
  enabled: boolean;
  pending: boolean;
  method: "AUTHENTICATOR_APP" | "EMAIL" | null;
  pendingMethod?: "AUTHENTICATOR_APP" | "EMAIL" | null;
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
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  private async recordEventBestEffort(
    input: Parameters<SecurityEventService["record"]>[0],
  ): Promise<void> {
    try {
      await this.events.record(input);
    } catch (error) {
      this.logger?.warn(
        { userId: input.userId, errorType: error instanceof Error ? error.name : "UnknownError" },
        "MFA security event could not be recorded",
      );
    }
  }

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
    const updated = await this.repository.beginTotpMfaEnrollment({
      userId: user.id,
      expectedEmail: user.email,
      expectedPendingSecretEnc: user.mfaPendingSecretEnc,
      expectedEmailCodeHash: user.mfaPendingEmailCodeHash,
      expectedEmailExpiresAt: user.mfaPendingEmailExpiresAt,
      pendingSecretEnc: this.totp.encryptSecret(secret),
      recoveryCodeHashes: plainCodes.map((code) => this.totp.hashRecoveryCode(code)),
    });
    if (!updated) {
      const current = await this.repository.findUserById(user.id);
      if (current?.mfaEnabledAt) {
        throw new ConflictError("Two-factor authentication is already enabled.", "TFA_ALREADY_ON");
      }
      throw new ConflictError(
        "Account security settings changed in another request. Please try again.",
        "NO_PENDING_ENROLLMENT",
      );
    }

    await this.recordEventBestEffort({
      userId: user.id,
      type: "SENSITIVE_SETTINGS_CHANGED",
      actor: user.email,
      context: "Two-factor enrollment started - awaiting confirmation.",
    });
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
    const codeHash = this.hashEmailEnrollmentCode(code);
    const expiresAt = new Date(Date.now() + this.config.auth.mfaChallengeMinutes * 60 * 1000);
    this.limiter.hit("mfa_email_enroll", user.email);

    // Claim the enrollment slot before delivery. A failed send restores the
    // previous code only if no newer request has replaced this candidate.
    const claimed = await this.repository.beginPendingEmailMfaChallenge({
      userId: user.id,
      expectedEmail: user.email,
      expectedPendingSecretEnc: user.mfaPendingSecretEnc,
      expectedCodeHash: user.mfaPendingEmailCodeHash,
      expectedExpiresAt: user.mfaPendingEmailExpiresAt,
      codeHash,
      expiresAt,
    });
    if (!claimed) {
      throw new ConflictError(
        "Email two-factor setup changed in another request. Please try again.",
        "EMAIL_MFA_CHALLENGE_CHANGED",
      );
    }

    try {
      await this.mailer.sendEmailMfaCode(user.email, code, `${this.config.auth.mfaChallengeMinutes} minutes`);
    } catch (error) {
      try {
        await this.repository.restorePendingEmailMfaChallenge({
          userId: user.id,
          candidateCodeHash: codeHash,
          previousCodeHash: user.mfaPendingEmailCodeHash,
          previousExpiresAt: user.mfaPendingEmailExpiresAt,
          previousAttempts: user.mfaPendingEmailAttempts,
          previousSecretEnc: user.mfaPendingSecretEnc,
        });
      } catch {
        // Preserve the SMTP error as the primary failure; retry remains possible.
      }
      throw error;
    }
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
      if (hash) {
        await this.repository.clearPendingEmailMfaChallenge(user.id, hash);
      }
      throw new BusinessRuleError(
        "The email verification code expired. Start email 2FA setup again.",
        "EMAIL_MFA_CHALLENGE_EXPIRED",
      );
    }

    const submitted = Buffer.from(this.hashEmailEnrollmentCode(code), "hex");
    const expected = Buffer.from(hash, "hex");
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
      const attempts = await this.repository.recordEmailMfaEnrollmentFailure(user.id, hash, new Date());
      if (attempts === null) {
        throw new BusinessRuleError(
          "The email verification code expired or was replaced. Start email 2FA setup again.",
          "EMAIL_MFA_CHALLENGE_EXPIRED",
        );
      }
      throw new BusinessRuleError(
        attempts >= 5
          ? "Too many incorrect codes. Start email 2FA setup again."
          : "That code didn't match. Check your email and try again.",
        attempts >= 5 ? "EMAIL_MFA_TOO_MANY_ATTEMPTS" : "INVALID_CODE",
      );
    }

    const plainCodes = this.totp.generateRecoveryCodes(10);
    const enabledAt = new Date();
    const updated = await this.repository.completeEmailMfaEnrollment({
      userId: user.id,
      expectedCodeHash: hash,
      enabledAt,
      recoveryCodeHashes: plainCodes.map((value) => this.totp.hashRecoveryCode(value)),
    });
    if (!updated) {
      const current = await this.repository.findUserById(user.id);
      if (current?.mfaEnabledAt) {
        throw new ConflictError("Two-factor authentication is already enabled.", "TFA_ALREADY_ON");
      }
      throw new BusinessRuleError(
        "The email verification code expired or was already used. Start email 2FA setup again.",
        "EMAIL_MFA_CHALLENGE_EXPIRED",
      );
    }

    await this.recordEventBestEffort({
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
    const updated = await this.repository.completeTotpMfaEnrollment({
      userId: user.id,
      pendingSecretEnc: pending,
      enabledAt: now,
    });
    if (!updated) {
      const current = await this.repository.findUserById(user.id);
      if (current?.mfaEnabledAt) {
        throw new ConflictError("Two-factor authentication is already enabled.", "TFA_ALREADY_ON");
      }
      throw new BusinessRuleError(
        "The pending authenticator setup expired or was replaced. Start two-factor setup again.",
        "NO_PENDING_ENROLLMENT",
      );
    }
    await this.recordEventBestEffort({
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
    await this.recordEventBestEffort({
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
    await this.recordEventBestEffort({
      userId: user.id,
      type: "RECOVERY_CODES_REGENERATED",
      actor: user.email,
      context: "Recovery codes regenerated - previous set invalidated.",
    });
    return { recoveryCodes: plainCodes };
  }

  /** HMAC protects a six-digit code against offline brute-force after a database leak. */
  private hashEmailEnrollmentCode(code: string): string {
    return createHmac("sha256", this.config.auth.mfaEncryptionKey).update(code).digest("hex");
  }

  /** Project the shared TwoFactorState shape. */
  async state(user: UserRow): Promise<TwoFactorState> {
    const remaining = (await this.repository.listActiveRecoveryCodes(user.id)).length;
    return {
      enabled: Boolean(user.mfaEnabledAt),
      pending: !user.mfaEnabledAt && Boolean(user.mfaPendingSecretEnc || user.mfaPendingEmailCodeHash),
      method: user.mfaEnabledAt ? (user.mfaMethod === "EMAIL" ? "EMAIL" : "AUTHENTICATOR_APP") : null,
      pendingMethod: !user.mfaEnabledAt
        ? user.mfaPendingEmailCodeHash
          ? "EMAIL"
          : user.mfaPendingSecretEnc
            ? "AUTHENTICATOR_APP"
            : null
        : null,
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
