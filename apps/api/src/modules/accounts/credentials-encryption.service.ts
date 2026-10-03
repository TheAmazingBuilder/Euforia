/**
 * Trading credentials encryption at rest (Phase 3 §22).
 *
 * Credentials travel over TLS, are encrypted with AES-256-GCM under the
 * dedicated ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY, and are NEVER returned by
 * any endpoint, never logged, never serialized into client-facing shapes.
 * Only a masked hint (last characters) is stored for display.
 */
import { Inject, Injectable } from "@nestjs/common";
import { decryptWithAesGcm, encryptWithAesGcm } from "../../infrastructure/crypto/aes-gcm";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";

@Injectable()
export class CredentialsEncryptionService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encrypt(plaintext: string): string {
    return encryptWithAesGcm(this.config.accounts.credentialsEncryptionKey, plaintext);
  }

  /** `null` on any failure — callers treat it as INVALID_CREDENTIALS state. */
  decrypt(payload: string): string | null {
    if (!payload) return null;
    return decryptWithAesGcm(this.config.accounts.credentialsEncryptionKey, payload);
  }

  /**
   * Masked display hint — last 4 characters only. Never enough to
   * authenticate, safe for UI, never includes the full secret.
   */
  static hint(secret: string): string {
    if (secret.length <= 4) return "••••";
    return `••••${secret.slice(-4)}`;
  }
}
