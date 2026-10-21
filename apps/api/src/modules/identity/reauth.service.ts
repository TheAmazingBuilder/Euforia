/**
 * Re-authentication for sensitive operations (Phase 2 mandate §37; shared
 * security.ts §13): POST /security/reauth with the account password issues a
 * SINGLE-USE, 5-minute, purpose-agnostic capability token. Sensitive
 * mutations consume it — a token cannot be replayed, and failed attempts
 * are rate-limited (5 failures / 15 min, lockout message parity).
 *
 * In-memory storage matches the 5-minute TTL: restarts invalidate pending
 * tokens (fail-safe). Move to a shared store only with horizontal scaling.
 */
import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { PasswordHasherService } from "./password-hasher.service";
import type { UserRow } from "./identity.repository";
import { AuthRateLimiterService } from "./auth-rate-limiter.service";
import { RateLimitError, UnauthorizedError } from "../../shared/errors/app-error";
import { SecurityEventService } from "../security/security-event.service";

const REAUTH_LIMIT = 5;

interface PendingReauth {
  userId: string;
  expiresAt: number;
}

@Injectable()
export class ReauthService {
  private readonly pending = new Map<string, PendingReauth>();

  constructor(
    private readonly hasher: PasswordHasherService,
    private readonly limiter: AuthRateLimiterService,
    private readonly events: SecurityEventService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Verify the password and issue a single-use capability token. */
  async reauthenticate(user: UserRow, password: string): Promise<{ token: string; expiresAt: string }> {
    const check = this.limiter.check("reauth", user.email);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many attempts. Please wait before trying again.",
        "RATE_LIMITED",
        check.retryAfterSeconds,
      );
    }

    const valid = await this.hasher.verify(user.passwordHash, password);
    if (!valid) {
      this.limiter.hit("reauth", user.email);
      await this.events.record({
        userId: user.id,
        type: "REAUTH_FAILED",
        actor: user.email,
        context: "Re-authentication failed — wrong password.",
        outcome: "FAILURE",
      });
      const failuresLeft = Math.max(0, REAUTH_LIMIT - this.failuresSoFar(user.email));
      throw new UnauthorizedError(
        `Wrong password — ${failuresLeft} attempt(s) left before a temporary lock.`,
        "INVALID_CREDENTIALS",
      );
    }

    this.limiter.clear("reauth", user.email);
    this.sweepExpired();
    const ttlMs = this.config.auth.reauthMinutes * 60 * 1000;
    const token = `reauth_${randomBytes(18).toString("hex")}`;
    const expiresAt = Date.now() + ttlMs;
    this.pending.set(token, { userId: user.id, expiresAt });
    await this.events.record({
      userId: user.id,
      type: "REAUTH_OK",
      actor: user.email,
      context: "Re-authentication succeeded — sensitive-action token issued.",
    });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Consume a re-auth token for the given user (single-use). Throws the
   * canonical error codes the security UI maps: INVALID_REAUTH_TOKEN /
   * REAUTH_TOKEN_EXPIRED.
   */
  async consume(token: string | undefined, userId: string): Promise<void> {
    if (!token) {
      throw new UnauthorizedError(
        "Re-authentication required — confirm your password first.",
        "INVALID_REAUTH_TOKEN",
      );
    }
    const entry = this.pending.get(token);
    this.pending.delete(token); // single-use: consumed even on expiry
    if (!entry || entry.userId !== userId) {
      throw new UnauthorizedError(
        "Re-authentication required — confirm your password first.",
        "INVALID_REAUTH_TOKEN",
      );
    }
    if (entry.expiresAt <= Date.now()) {
      throw new UnauthorizedError(
        "This re-authentication has expired — confirm your password again.",
        "REAUTH_TOKEN_EXPIRED",
      );
    }
  }

  private failuresSoFar(email: string): number {
    return this.limiter.count("reauth", email);
  }

  /** Opportunistic cleanup — pending entries are tiny and short-lived. */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(token);
    }
  }
}
