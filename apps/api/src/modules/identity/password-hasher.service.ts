/**
 * Password hashing (Phase 2 mandate §8): Argon2id via @node-rs/argon2
 * (prebuilt native bindings — no compilation step). OWASP-aligned defaults,
 * overridable through env for future hardware adjustments.
 *
 * Plaintext passwords and hashes NEVER appear in logs or responses — the
 * hasher returns only booleans/hashes and is the single crypto authority
 * for passwords.
 */
import { Injectable } from "@nestjs/common";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

export interface PasswordHasherOptions {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}

const OWASP_DEFAULTS: Required<PasswordHasherOptions> = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordHasherService {
  private readonly options: Required<PasswordHasherOptions>;

  constructor(options: PasswordHasherOptions = {}) {
    this.options = { ...OWASP_DEFAULTS, ...options };
  }

  hash(plain: string): Promise<string> {
    return argon2Hash(plain, this.options);
  }

  /**
   * Timing-safe verification against an Argon2id hash.
   * Returns false for malformed hashes (unknown format) without throwing.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2Verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** True when the stored hash uses Argon2id (self-check for migrations). */
  isArgon2id(hash: string): boolean {
    return hash.startsWith("$argon2id$");
  }
}
