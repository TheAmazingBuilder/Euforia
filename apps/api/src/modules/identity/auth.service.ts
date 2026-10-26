/**
 * Authentication application service (Phase 2 §9–§15, §22–§23).
 *
 * Flow semantics match the frontend contract EXACTLY (mock engine is the
 * porting spec; the shared schemas are the law). Where the mock leaks
 * mock-only affordances (verificationToken / resetToken / demoCode), the
 * real backend NEVER returns them — production delivery is EMAIL.
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { REFRESH_COOKIE_NAME, TokenService } from "./token.service";
import { IdentityRepository, type SessionRow, type UserRow } from "./identity.repository";
import { PasswordHasherService } from "./password-hasher.service";
import { AuthRateLimiterService } from "./auth-rate-limiter.service";
import { SecurityEventService, type RequestFingerprint } from "../security/security-event.service";
import { TotpService } from "./totp.service";
import { MailerService } from "./mailer.service";
import {
  parseUserAgent,
  maskIp,
  UNKNOWN_LOCATION,
} from "./client-metadata";
import { toAuthSession, toAuthUser } from "./mappers";
import type { AuthSuccess } from "../../shared/contracts";
import {
  ConflictError,
  ForbiddenError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "../../shared/errors/app-error";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { ROOT_LOGGER, type RootLogger } from "../../infrastructure/logging/logger.factory";

// ── In-memory MFA login challenges (5-min TTL, single-use — mock parity) ─────

interface MfaChallenge {
  userId: string;
  expiresAt: number;
}

/** Login-shaped credentials returned by register() on auto-login accounts. */
type RegisterSession = AuthSuccess & { session: ReturnType<typeof toAuthSession> };

export interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Extract the request fingerprint (masked, minimal — §11/§17). */
export function fingerprintOf(request: RequestLike): RequestFingerprint {
  const uaHeader = request.headers["user-agent"];
  const userAgent = Array.isArray(uaHeader) ? (uaHeader[0] ?? undefined) : uaHeader;
  const meta = parseUserAgent(userAgent);
  return {
    ...meta,
    ipMasked: maskIp(request.ip),
    location: UNKNOWN_LOCATION,
    userAgent: userAgent ?? null,
  };
}

@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, MfaChallenge>();

  constructor(
    private readonly repository: IdentityRepository,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: TokenService,
    private readonly limiter: AuthRateLimiterService,
    private readonly events: SecurityEventService,
    private readonly totp: TotpService,
    private readonly mailer: MailerService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  // ── Registration (§9) ───────────────────────────────────────────────────────

  async register(
    input: { name: string; email: string; password: string },
    reply: FastifyReply,
  ): Promise<{
    user: ReturnType<typeof toAuthUser>;
    status: string;
    verificationSentAt: string;
    delivery: "EMAIL";
    verificationExpiresAt: string;
    /**
     * Auto-login affordance: when registration lands on an ACTIVE account
     * (email verification disabled), the response carries the same
     * credentials a successful login would, so the client goes straight to
     * the dashboard instead of bouncing back to /login. Pending accounts
     * omit it. The refresh cookie is set on `reply` when present.
     */
    session?: RegisterSession;
  }> {
    const check = this.limiter.check("register", input.email);
    if (!check.allowed) {
      throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", check.retryAfterSeconds);
    }
    this.limiter.hit("register", input.email);

    if (await this.repository.isEmailTaken(input.email)) {
      // Registration is inherently non-enumerable-safe? No: uniqueness is a
      // product requirement the frontend surfaces with a dedicated state —
      // the mock returns 409 EMAIL_ALREADY_USED (documented contract).
      throw new ConflictError(
        "An account already exists for this email address.",
        "EMAIL_ALREADY_USED",
      );
    }

    const requireEmail = this.config.auth.requireEmailVerification;

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.repository.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
      preferences: null, // created lazily on first preferences read
      status: requireEmail ? "PENDING_VERIFICATION" : "ACTIVE",
      emailVerifiedAt: requireEmail ? null : new Date(),
    });

    const expiresAt = requireEmail
      ? await this.issueVerificationChallenge(user, user.email)
      : new Date(Date.now() + 86_400_000).toISOString();

    // Auto-login when the account lands ACTIVE (verification disabled):
    // issue the same credentials a successful login would so the client
    // goes straight to the dashboard instead of bouncing back to /login.
    let session: RegisterSession | undefined;
    if (!requireEmail && user.status === "ACTIVE") {
      const meta = fingerprintOf({ ip: undefined, headers: reply.request.headers });
      const refresh = this.tokens.issueRefreshToken(1);
      const created = await this.repository.createSession({
        userId: user.id,
        refreshTokenHash: refresh.hash,
        device: meta.device,
        browser: meta.browser,
        os: meta.os,
        ipMasked: meta.ipMasked,
        location: meta.location,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + this.config.auth.refreshSessionHours * 3_600_000),
      });
      const access = await this.tokens.signAccessToken(user.id, created.id);
      this.setRefreshCookie(reply, refresh.value, { remember: false });
      await this.events.recordLogin(
        { userId: user.id, type: "LOGIN_SUCCESS", context: "Signed in on registration.", outcome: "SUCCESS" },
        meta,
      );
      session = {
        user: toAuthUser(user),
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        session: toAuthSession(created, created.id),
      };
    }

    return {
      user: toAuthUser(user),
      status: user.status,
      verificationSentAt: new Date().toISOString(),
      delivery: "EMAIL",
      verificationExpiresAt: expiresAt,
      ...(session ? { session } : {}),
    };
  }

  // ── Email verification (§10) ────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ user: ReturnType<typeof toAuthUser>; verifiedAt: string }> {
    const challenge = await this.repository.findChallengeByTokenHash(
      IdentityRepository.hashToken(token),
    );
    if (!challenge) {
      throw new ValidationError("This verification link is not valid.", undefined, "INVALID_TOKEN");
    }
    if (challenge.usedAt) {
      throw new ValidationError(
        "This verification link has already been used — try signing in.",
        undefined,
        "TOKEN_ALREADY_USED",
      );
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new ValidationError(
        "This verification link has expired — request a new email.",
        undefined,
        "EXPIRED_TOKEN",
      );
    }

    const user = await this.repository.findUserById(challenge.userId);
    if (!user) {
      throw new ValidationError("This verification link is not valid.", undefined, "INVALID_TOKEN");
    }

    await this.repository.consumeChallenge(challenge.id);
    const verifiedAt = new Date();
    const updated = await this.repository.updateUser(user.id, {
      status: "ACTIVE",
      emailVerifiedAt: verifiedAt,
    });
    await this.events.record({
      userId: user.id,
      type: "EMAIL_VERIFIED",
      actor: user.email,
      context: "Email address verified.",
    });
    return { user: toAuthUser(updated), verifiedAt: verifiedAt.toISOString() };
  }

  async resendVerification(
    email: string,
  ): Promise<{ sent: true; delivery: "EMAIL"; verificationExpiresAt: string | null }> {
    // Anti-enumeration (§10): the response is identical whether or not the
    // account exists / is already verified — only delivery actually happens.
    const user = await this.repository.findUserByEmail(email);
    if (!user || user.status !== "PENDING_VERIFICATION") {
      return { sent: true, delivery: "EMAIL", verificationExpiresAt: null };
    }

    const check = this.limiter.check("resend", email);
    if (!check.allowed) {
      throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", check.retryAfterSeconds);
    }
    this.limiter.hit("resend", email);

    const expiresAt = await this.issueVerificationChallenge(user, user.email);
    return { sent: true, delivery: "EMAIL", verificationExpiresAt: expiresAt };
  }

  // ── Login (§11) + MFA branch (§19) ──────────────────────────────────────────

  async login(
    input: { email: string; password: string; remember: boolean },
    request: RequestLike,
    reply: FastifyReply,
  ): Promise<
    | { outcome: "MFA_REQUIRED"; mfaRequired: true; challengeToken: string; challengeExpiresAt: string; method: "AUTHENTICATOR_APP" }
    | { outcome: "AUTHENTICATED"; user: ReturnType<typeof toAuthUser>; accessToken: string; accessTokenExpiresAt: string; session: ReturnType<typeof toAuthSession> }
  > {
    const fingerprint = fingerprintOf(request);
    const check = this.limiter.check("login", input.email);
    if (!check.allowed) {
      await this.recordFailedLogin(input.email, fingerprint, "Rate limited");
      throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", check.retryAfterSeconds);
    }

    const user = await this.repository.findUserByEmail(input.email);
    const passwordOk =
      user !== null && (await this.hasher.verify(user.passwordHash, input.password));

    if (!user || !passwordOk) {
      this.limiter.hit("login", input.email);
      // Anti-enumeration (§11): identical error for unknown email and wrong
      // password; security events only when the account exists.
      if (user) {
        await this.recordFailedLogin(user.email, fingerprint, "Invalid credentials");
      }
      throw new UnauthorizedError("Incorrect email or password.", "INVALID_CREDENTIALS");
    }

    // Account status gates (§7) — order matters (suspended before deactivated
    // before pending verification, matching the mock's precedence).
    if (user.status === "SUSPENDED") {
      throw new ForbiddenError("This account is suspended. Contact support for help.", "ACCOUNT_SUSPENDED");
    }
    if (user.status === "DEACTIVATED") {
      throw new ForbiddenError("This account is deactivated.", "ACCOUNT_DEACTIVATED");
    }
    if (!this.config.auth.requireEmailVerification && user.status === "PENDING_VERIFICATION") {
      user.status = "ACTIVE";
      await this.repository.updateUser(user.id, {
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      });
    }
    if (user.status !== "ACTIVE") {
      throw new ForbiddenError(
        "Verify your email address before signing in.",
        "EMAIL_NOT_VERIFIED",
      );
    }

    // MFA required → issue a single-use challenge (§19).
    if (user.mfaSecretEnc && user.mfaEnabledAt) {
      const mfaCheck = this.limiter.check("mfa", user.email);
      if (!mfaCheck.allowed) {
        throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", mfaCheck.retryAfterSeconds);
      }
      return this.issueMfaChallenge(user);
    }

    return this.completeLogin(user, input.remember, reply, fingerprint, "Signed in with email and password.");
  }

  async mfaChallenge(
    input: { challengeToken: string; code: string },
    request: RequestLike,
    reply: FastifyReply,
  ): Promise<{ outcome: "AUTHENTICATED"; user: ReturnType<typeof toAuthUser>; accessToken: string; accessTokenExpiresAt: string; session: ReturnType<typeof toAuthSession> }> {
    const { user, consume } = await this.peekMfaChallenge(input.challengeToken);
    const fingerprint = fingerprintOf(request);

    const mfaCheck = this.limiter.check("mfa", user.email);
    if (!mfaCheck.allowed) {
      throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", mfaCheck.retryAfterSeconds);
    }

    const secret = this.totp.decryptSecret(user.mfaSecretEnc ?? "");
    if (!secret || !this.totp.verify(secret, user.email, input.code)) {
      this.limiter.hit("mfa", user.email);
      // Phase 20 §39: the LoginRecord is Security-owned — the failure pair
      // (security event + login history row) is recorded through the shared
      // SecurityEventService port, never through raw identity Prisma access.
      await this.events.recordLogin(
        {
          userId: user.id,
          type: "TFA_CHALLENGE_FAILED",
          context: "Invalid TOTP code during sign-in.",
          outcome: "FAILURE",
          reason: "Invalid MFA code",
        },
        fingerprint,
      );
      throw new UnauthorizedError("That code didn't match. Check your authenticator app.", "INVALID_MFA_CODE");
    }

    consume();
    const updated = await this.repository.updateUser(user.id, { mfaLastVerifiedAt: new Date() });
    return this.completeLogin(updated, true, reply, fingerprint, "Signed in with two-factor authentication.");
  }

  async mfaRecover(
    input: { challengeToken: string; recoveryCode: string },
    request: RequestLike,
    reply: FastifyReply,
  ): Promise<{ outcome: "AUTHENTICATED"; user: ReturnType<typeof toAuthUser>; accessToken: string; accessTokenExpiresAt: string; session: ReturnType<typeof toAuthSession> }> {
    const { user, consume } = await this.peekMfaChallenge(input.challengeToken);
    const fingerprint = fingerprintOf(request);

    const mfaCheck = this.limiter.check("mfa", user.email);
    if (!mfaCheck.allowed) {
      throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", mfaCheck.retryAfterSeconds);
    }

    const normalized = input.recoveryCode.trim().toUpperCase();
    const match = await this.repository.findMatchingActiveRecoveryCode(
      user.id,
      this.totp.hashRecoveryCode(normalized),
    );
    if (!match) {
      this.limiter.hit("mfa", user.email);
      await this.events.record({
        userId: user.id,
        type: "TFA_CHALLENGE_FAILED",
        actor: fingerprint.device,
        context: "Invalid recovery code during sign-in.",
        outcome: "FAILURE",
      });
      throw new UnauthorizedError("That recovery code was not recognized.", "INVALID_MFA_CODE");
    }

    await this.repository.consumeRecoveryCode(match.id);
    consume();
    const updated = await this.repository.updateUser(user.id, { mfaLastVerifiedAt: new Date() });
    return this.completeLogin(
      updated,
      true,
      reply,
      fingerprint,
      "Signed in with a recovery code.",
    );
  }

  // ── Sessions: refresh (§12–§13) / logout (§15) / me (§9 P0.9) ───────────────

  async refresh(
    request: RequestLike,
    reply: FastifyReply,
  ): Promise<{ user: ReturnType<typeof toAuthUser>; accessToken: string; accessTokenExpiresAt: string; session: ReturnType<typeof toAuthSession> }> {
    const cookies = (request as FastifyRequest).cookies as Record<string, string> | undefined;
    const raw = cookies?.[REFRESH_COOKIE_NAME];
    const presented = this.tokens.parseRefreshToken(raw);
    if (!presented) {
      throw new UnauthorizedError("No active session — sign in again.", "INVALID_TOKEN");
    }

    const session = await this.repository.findSessionByTokenHash(presented.hash);

    // REUSE DETECTION (§13): a token that is neither current NOR the one
    // rotated away in this session's last rotation is unknown — and a token
    // equal to the last-rotated hash, or a stale generation, is a REUSE
    // signal: revoke every session of the user, never silently accept.
    const isReuse =
      session === null
        ? (await this.repository.findSessionByPreviousTokenHash(presented.hash)) !== null
        : presented.generation !== session.generation;

    if (isReuse && session === null) {
      const previous = await this.repository.findSessionByPreviousTokenHash(presented.hash);
      if (previous) {
        await this.repository.revokeAllSessionsForUser(previous.userId);
        await this.events.record({
          userId: previous.userId,
          type: "SESSION_REVOKED",
          actor: previous.device,
          context: "Refresh-token reuse detected — all sessions revoked.",
          outcome: "FAILURE",
        });
        this.logger?.warn({ userId: previous.userId }, "refresh-token reuse detected — all sessions revoked");
        throw new UnauthorizedError("This session was revoked — sign in again.", "INVALID_TOKEN");
      }
    }

    if (!session) {
      throw new UnauthorizedError("This session is no longer valid — sign in again.", "INVALID_TOKEN");
    }

    if (isReuse) {
      await this.repository.revokeAllSessionsForUser(session.userId);
      await this.events.record({
        userId: session.userId,
        type: "SESSION_REVOKED",
        actor: session.device,
        context: "Refresh-token reuse detected — all sessions revoked.",
        outcome: "FAILURE",
      });
      this.logger?.warn({ userId: session.userId }, "refresh-token reuse detected — all sessions revoked");
      throw new UnauthorizedError("This session was revoked — sign in again.", "INVALID_TOKEN");
    }

    if (session.revokedAt) {
      throw new UnauthorizedError("This session was revoked — sign in again.", "INVALID_TOKEN");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("This session is no longer valid — sign in again.", "INVALID_TOKEN");
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("This session is no longer valid — sign in again.", "INVALID_TOKEN");
    }

    // Rotation: same row, new generation + new hash, remember-length TTL.
    const expiresAt = new Date(Date.now() + this.config.auth.refreshRememberDays * 86_400_000);
    const rotated = this.tokens.issueRefreshToken(session.generation + 1);
    const updatedSession = await this.repository.rotateSession(session.id, {
      refreshTokenHash: rotated.hash,
      expiresAt,
    });

    const access = await this.tokens.signAccessToken(user.id, session.id);
    this.setRefreshCookie(reply, rotated.value, { remember: true });
    return {
      user: toAuthUser(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      session: toAuthSession(updatedSession, session.id),
    };
  }

  async logout(request: RequestLike, reply: FastifyReply): Promise<{ loggedOut: boolean }> {
    const cookies = (request as FastifyRequest).cookies as Record<string, string> | undefined;
    const presented = this.tokens.parseRefreshToken(cookies?.[REFRESH_COOKIE_NAME]);
    if (presented) {
      const session = await this.repository.findSessionByTokenHash(presented.hash);
      if (session && !session.revokedAt && presented.generation === session.generation) {
        await this.repository.revokeSession(session.id);
        await this.events.record({
          userId: session.userId,
          type: "LOGOUT",
          actor: session.device,
          context: "Signed out — refresh token revoked.",
        });
      }
    }
    // Always succeed and always clear the cookie (mock parity §15).
    this.clearRefreshCookie(reply);
    return { loggedOut: true };
  }

  async me(principal: { userId: string; sessionId: string }): Promise<{
    user: ReturnType<typeof toAuthUser>;
    session: ReturnType<typeof toAuthSession>;
  }> {
    const [user, session] = await Promise.all([
      this.repository.findUserById(principal.userId),
      this.repository.findSessionById(principal.sessionId),
    ]);
    if (!user || !session || session.revokedAt) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    await this.repository.touchSession(session.id);
    return { user: toAuthUser(user), session: toAuthSession(session, session.id) };
  }

  // ── Password recovery (§22) ─────────────────────────────────────────────────

  async forgotPassword(
    email: string,
    request: RequestLike,
  ): Promise<{ sent: true; delivery: "EMAIL"; resetExpiresAt: string | null }> {
    const user = await this.repository.findUserByEmail(email);
    if (!user || user.status === "DEACTIVATED") {
      // Anti-enumeration (§22): identical response when the account is unknown.
      return { sent: true, delivery: "EMAIL", resetExpiresAt: null };
    }

    const check = this.limiter.check("forgot", email);
    if (!check.allowed) {
      throw new RateLimitError("Too many attempts. Please wait before trying again.", "RATE_LIMITED", check.retryAfterSeconds);
    }
    this.limiter.hit("forgot", email);

    const ttlMs = this.config.auth.passwordResetMinutes * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const token = IdentityRepository.randomToken(24);
    await this.repository.createChallenge({
      userId: user.id,
      purpose: "PASSWORD_RESET",
      tokenHash: IdentityRepository.hashToken(token),
      expiresAt,
    });
    await this.mailer.sendPasswordReset(user.email, token, `${this.config.auth.passwordResetMinutes} minutes`);
    await this.events.record({
      userId: user.id,
      type: "PASSWORD_RESET_REQUESTED",
      actor: fingerprintOf(request).device,
      context: "Password reset requested — email sent.",
    });
    return { sent: true, delivery: "EMAIL", resetExpiresAt: expiresAt.toISOString() };
  }

  async resetPassword(
    input: { token: string; password: string },
  ): Promise<{ resetAt: string }> {
    const challenge = await this.repository.findChallengeByTokenHash(
      IdentityRepository.hashToken(input.token),
    );
    if (!challenge) {
      throw new ValidationError("This reset link is not valid.", undefined, "INVALID_TOKEN");
    }
    if (challenge.usedAt) {
      throw new ValidationError(
        "This reset link has already been used — request a new email.",
        undefined,
        "TOKEN_ALREADY_USED",
      );
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new ValidationError(
        "This reset link has expired — request a new email.",
        undefined,
        "EXPIRED_TOKEN",
      );
    }

    const passwordHash = await this.hasher.hash(input.password);
    await this.repository.consumeChallenge(challenge.id);
    await this.repository.updateUser(challenge.userId, {
      passwordHash,
      passwordLastChangedAt: new Date(),
    });
    // Defense in depth (§22): a reset invalidates the user's refresh chain.
    await this.repository.revokeAllSessionsForUser(challenge.userId);
    await this.events.record({
      userId: challenge.userId,
      type: "PASSWORD_CHANGED",
      actor: "system",
      context: "Password changed via reset link. Sessions were signed out.",
    });
    return { resetAt: new Date().toISOString() };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async issueVerificationChallenge(
    user: { id: string; email: string },
    toEmail: string,
  ): Promise<string> {
    const ttlMs = this.config.auth.emailVerificationHours * 3_600_000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const token = IdentityRepository.randomToken(24);
    await this.repository.createChallenge({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: IdentityRepository.hashToken(token),
      expiresAt,
    });
    await this.mailer.sendEmailVerification(toEmail, token, `${this.config.auth.emailVerificationHours} hours`);
    return expiresAt.toISOString();
  }

  private issueMfaChallenge(user: { id: string; email: string }): {
    outcome: "MFA_REQUIRED";
    mfaRequired: true;
    challengeToken: string;
    challengeExpiresAt: string;
    method: "AUTHENTICATOR_APP";
  } {
    this.sweepChallenges();
    const token = IdentityRepository.randomToken(24);
    const ttlMs = this.config.auth.mfaChallengeMinutes * 60 * 1000;
    this.challenges.set(token, { userId: user.id, expiresAt: Date.now() + ttlMs });
    return {
      outcome: "MFA_REQUIRED",
      mfaRequired: true,
      challengeToken: token,
      challengeExpiresAt: new Date(Date.now() + ttlMs).toISOString(),
      method: "AUTHENTICATOR_APP",
    };
  }

  /**
   * Validate a challenge WITHOUT consuming it — a wrong TOTP/recovery code
   * keeps the challenge alive (rate limiter bounds guessing); success or
   * expiry consumes it. Mirrors the mock's semantics.
   */
  private async peekMfaChallenge(challengeToken: string) {
    this.sweepChallenges();
    const challenge = this.challenges.get(challengeToken);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      this.challenges.delete(challengeToken);
      throw new UnauthorizedError(
        "This challenge expired — start again with your password.",
        "INVALID_CHALLENGE",
      );
    }
    const user = await this.repository.findUserById(challenge.userId);
    if (!user || user.status !== "ACTIVE") {
      this.challenges.delete(challengeToken);
      throw new UnauthorizedError(
        "This challenge expired — start again with your password.",
        "INVALID_CHALLENGE",
      );
    }
    return { user, consume: () => this.challenges.delete(challengeToken) };
  }

  private sweepChallenges(): void {
    const now = Date.now();
    for (const [token, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.challenges.delete(token);
    }
  }

  private async completeLogin(
    user: UserRow,
    remember: boolean,
    reply: FastifyReply,
    fingerprint: RequestFingerprint,
    context: string,
  ) {
    const ttlMs = remember
      ? this.config.auth.refreshRememberDays * 86_400_000
      : this.config.auth.refreshSessionHours * 3_600_000;

    // Refresh token bound to generation 1 of this brand-new session.
    const refresh = this.tokens.issueRefreshToken(1);
    const session = await this.repository.createSession({
      userId: user.id,
      refreshTokenHash: refresh.hash,
      device: fingerprint.device,
      browser: fingerprint.browser,
      os: fingerprint.os,
      ipMasked: fingerprint.ipMasked,
      location: fingerprint.location,
      userAgent: fingerprint.userAgent,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    const access = await this.tokens.signAccessToken(user.id, session.id);
    this.setRefreshCookie(reply, refresh.value, { remember });
    this.limiter.clear("login", user.email);

    await this.events.recordLogin(
      { userId: user.id, type: "LOGIN_SUCCESS", context, outcome: "SUCCESS" },
      fingerprint,
    );

    return {
      outcome: "AUTHENTICATED" as const,
      user: toAuthUser(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      session: toAuthSession(session, session.id),
    };
  }

  private async recordFailedLogin(email: string, fingerprint: RequestFingerprint, reason: string): Promise<void> {
    const user = await this.repository.findUserByEmail(email);
    if (!user) return;
    await this.events.recordLogin(
      {
        userId: user.id,
        type: "LOGIN_FAILED",
        context: `Sign-in failed — ${reason.toLowerCase()}.`,
        outcome: "FAILURE",
        reason,
      },
      fingerprint,
    );
  }

  // ── Cookie jar (HttpOnly — production contract; the mock documented this
  //    as its seam) ─────────────────────────────────────────────────────────────

  private setRefreshCookie(
    reply: FastifyReply,
    value: string,
    options: { remember: boolean },
  ): void {
    void reply.setCookie(REFRESH_COOKIE_NAME, value, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.isProduction,
      ...(options.remember
        ? { maxAge: this.config.auth.refreshRememberDays * 86_400 }
        : {}),
    });
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    void reply.clearCookie(REFRESH_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.isProduction,
    });
  }
}
