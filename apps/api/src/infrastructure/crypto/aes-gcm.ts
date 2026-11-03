/**
 * Generic AES-256-GCM encryption at rest.
 *
 * Extracted as a shared infrastructure primitive in Phase 3 (§22: "If
 * Phase 1/2 does not provide the necessary primitive, implement the smallest
 * secure infrastructure required"). The wire format is identical to the
 * identity TotpService's (`v1.<iv>.<tag>.<ciphertext>`, base64url parts) so
 * a future unification is mechanical. Each consumer supplies its OWN key:
 * identity keeps AUTH_MFA_ENCRYPTION_KEY, accounts uses
 * ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY - key separation by domain.
 *
 * The key MUST be exactly 32 bytes (validated at the env boundary).
 * Tampered or corrupted payloads decrypt to `null` - never throw, never leak.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Encrypt UTF-8 plaintext under `key`; returns `v1.<iv>.<tag>.<data>` (base64url). */
export function encryptWithAesGcm(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypt a payload produced by {@link encryptWithAesGcm}; `null` on any failure/tamper. */
export function decryptWithAesGcm(key: Buffer, payload: string): string | null {
  try {
    const [version, ivPart, tagPart, dataPart] = payload.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !dataPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
