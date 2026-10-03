/**
 * TOTP / MFA crypto infrastructure (Phase 2 mandate §18–§21).
 *
 * - RFC 6238 TOTP via `otpauth` (compatible with Google/Microsoft
 *   Authenticator, 1Password, Authy; SHA-1 + 6 digits + 30s step defaults).
 * - Secrets are ENCRYPTED AT REST with AES-256-GCM using the dedicated
 *   AUTH_MFA_ENCRYPTION_KEY — never stored plaintext, never logged,
 *   never returned after enrollment.
 * - The real backend NEVER returns a current TOTP code (the mock's
 *   `demoCode` is a documented mock-only affordance).
 */
import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";

const ISSUER = "Cosmoz";

@Injectable()
export class TotpService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Generate a new enrollment secret (base32) + its otpauth:// URI. */
  generateEnrollment(email: string): { secret: string; uri: string } {
    const secret = new Secret({ size: 20 }).base32;
    const totp = this.buildTotp(secret, email);
    return { secret, uri: totp.toString() };
  }

  /** Validate a 6-digit code with a ±1 step window (clock drift tolerance). */
  verify(secretBase32: string, email: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    try {
      const totp = this.buildTotp(secretBase32, email);
      return totp.validate({ token: code, window: 1 }) !== null;
    } catch {
      return false;
    }
  }

  // ── Encryption at rest (AES-256-GCM) ───────────────────────────────────────

  encryptSecret(plainSecret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.config.auth.mfaEncryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  decryptSecret(encrypted: string): string | null {
    try {
      const [version, ivPart, tagPart, dataPart] = encrypted.split(".");
      if (version !== "v1" || !ivPart || !tagPart || !dataPart) return null;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.config.auth.mfaEncryptionKey,
        Buffer.from(ivPart, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      return null;
    }
  }

  // ── Recovery codes (§20) ───────────────────────────────────────────────────

  /** Generate `count` codes in the contract format XXXX-XXXX (uppercase hex). */
  generateRecoveryCodes(count = 10): string[] {
    const codes: string[] = [];
    while (codes.length < count) {
      const a = randomInt(0x10000).toString(16).toUpperCase().padStart(4, "0");
      const b = randomInt(0x10000).toString(16).toUpperCase().padStart(4, "0");
      codes.push(`${a}-${b}`);
    }
    return codes;
  }

  hashRecoveryCode(code: string): string {
    // Recovery codes are high-entropy (16^8 ≈ 4.3e9) and single-use — a plain
    // SHA-256 of the normalized code is the safe storage representation (§35).
    return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
  }

  private buildTotp(secretBase32: string, email: string): TOTP {
    return new TOTP({
      issuer: ISSUER,
      label: email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
  }
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}
