/**
 * MFA / TOTP application service (Phase 2 mandate §18–§21).
 *
 * Enable flow: reauth → generate secret (+ encrypted at rest, pending) +
 * recovery codes (hashed, inactive) → shown ONCE → confirm with a live TOTP
 * code → activated. Disable: reauth → wipe everything → TFA_DISABLED event.
 * Recovery codes: single-use, hashed at rest, regeneration invalidates the
 * previous set (§20).
 */
import { Injectable } from "@nestjs/common";
import { IdentityRepository, type UserRow } from "./identity.repository";
import { TotpService } from "./totp.service";
import { ReauthService } from "./reauth.service";
import { SecurityEventService } from "../security/security-event.service";
import { BusinessRuleError, ConflictError } from "../../shared/errors/app-error";

export interface TwoFactorState {
  enabled: boolean;
  pending: boolean;
  method: "AUTHENTICATOR_APP" | null;
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

  /** POST /security/2fa/email/enable - enable email OTP as the selected second factor. */
  async enableEmail(user: UserRow, reauthToken: string | undefined): Promise<TwoFactorState> {
    await this.reauth.consume(reauthToken, user.id);
    if (!user.emailVerifiedAt) {
      throw new BusinessRuleError("Verify your email address before enabling email authentication.", "EMAIL_NOT_VERIFIED");
    }
    if (user.mfaEnabledAt) {
      throw new ConflictError("Disable the current two-factor method before switching methods.", "TFA_ALREADY_ON");
    }

    const plainCodes = this.totp.generateRecoveryCodes(10);
    await this.repository.replaceRecoveryCodes(
      user.id,
      plainCodes.map((code) => this.totp.hashRecoveryCode(code)),
    );
    const now = new Date();
    const updated = await this.repository.updateUser(user.id, {
      mfaSecretEnc: null,
      mfaPendingSecretEnc: null,
      mfaMethod: "EMAIL",
      mfaEnabledAt: now,
      mfaDisabledAt: null,
      mfaLastVerifiedAt: null,
      mfaMethod: null,
    });
    await this.repository.activateRecoveryCodes(user.id);
    await this.events.record({
      userId: user.id,
      type: "TFA_ENABLED",
      actor: user.email,
      context: "Two-factor authentication enabled (email code).",
    });
    return this.state(updated);
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
      pending: !user.mfaEnabledAt && Boolean(user.mfaPendingSecretEnc),
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
