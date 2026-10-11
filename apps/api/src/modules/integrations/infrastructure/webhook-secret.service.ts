/**
 * Webhook signing-secret encryption (Phase 14 §14) — the Integrations-domain
 * wrapper over the shared AES-256-GCM infrastructure. Key separation is the
 * audited convention: this domain uses INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY —
 * NOT the accounts credentials key and NOT the identity MFA key.
 *
 * Policy: decrypt failure (tamper/bad format) → null — callers treat null as
 * an infrastructure condition (endpoint must reject the delivery rather than
 * throw). The secret is decrypted ONLY to compute/verify signatures; it is
 * never returned by any API path and never logged (the pino redact list
 * already covers credential-shaped fields, §37).
 */

import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config";
import { decryptWithAesGcm, encryptWithAesGcm } from "../../../infrastructure/crypto/aes-gcm";

@Injectable()
export class WebhookSecretService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encrypt(secret: string): string {
    return encryptWithAesGcm(this.config.integrations.webhookEncryptionKey, secret);
  }

  /** null = undecryptable (treated as "cannot verify" — never throws). */
  decrypt(payload: string): string | null {
    return decryptWithAesGcm(this.config.integrations.webhookEncryptionKey, payload);
  }
}
