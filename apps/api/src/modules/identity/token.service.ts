/**
 * Token service (Phase 2 mandate §12–§14, §44).
 *
 * Access tokens : short-lived HS256 JWT, payload {sub, sid} only - never
 *                 roles, emails or personal data (mock §75 precedent).
 * Refresh tokens: opaque 256-bit random values, format `<generation>.<secret>`;
 *                 ONLY the SHA-256 hash is stored (never the raw token);
 *                 delivered exclusively via an HttpOnly cookie.
 *
 * The refresh token is NEVER returned in any response body, never logged.
 */
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";

export const REFRESH_COOKIE_NAME = "cosmoz_rt";

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Access tokens ──────────────────────────────────────────────────────────

  async signAccessToken(userId: string, sessionId: string): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.config.auth.accessTtlSeconds * 1000);
    const token = await this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      {
        secret: this.config.auth.jwtSecret,
        expiresIn: this.config.auth.accessTtlSeconds,
        // Issuer/audience pinning (security-audit 2026-10-19 §1.8): a token
        // minted for another issuer/audience sharing this secret is rejected.
        issuer: this.config.auth.jwtIssuer,
        audience: this.config.auth.jwtAudience,
      },
    );
    return { token, expiresAt: expiresAt };
  }

  async verifyAccessToken(token: string): Promise<{ sub: string; sid: string }> {
    const payload = await this.jwt.verifyAsync<{ sub?: string; sid?: string }>(token, {
      secret: this.config.auth.jwtSecret,
      // Same pins as signing - signature alone is not the full contract.
      issuer: this.config.auth.jwtIssuer,
      audience: this.config.auth.jwtAudience,
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      throw new Error("malformed access token payload");
    }
    return { sub: payload.sub, sid: payload.sid };
  }

  // ── Refresh tokens ─────────────────────────────────────────────────────────

  /**
   * Issue a new refresh token for a session generation.
   * Returns the wire value (cookie) + the hash to persist.
   */
  issueRefreshToken(generation: number): { value: string; hash: string } {
    const secretPart = IdentityTokens.randomSecret();
    const value = `${generation}.${secretPart}`;
    return { value, hash: IdentityTokens.sha256(secretPart) };
  }

  /** Parse a presented cookie value; null when malformed. */
  parseRefreshToken(value: string | undefined): { generation: number; secret: string; hash: string } | null {
    if (!value) return null;
    const dot = value.indexOf(".");
    if (dot <= 0) return null;
    const generation = Number(value.slice(0, dot));
    const secret = value.slice(dot + 1);
    if (!Number.isInteger(generation) || generation < 1 || secret.length < 20) {
      return null;
    }
    return { generation, secret, hash: IdentityTokens.sha256(secret) };
  }
}

/** Small internal helpers (kept dependency-free). */
const IdentityTokens = {
  randomSecret(): string {
    return randomBytes(32).toString("base64url");
  },
  sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  },
};
