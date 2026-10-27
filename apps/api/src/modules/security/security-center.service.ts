/**
 * Security Center application service (Phase 16 bounded context).
 *
 * OWNERSHIP (Phase 16 §3/§48): this service owns security POSTURE and
 * VISIBILITY - the overview aggregate (protection checklist, deterministic
 * score), the paginated activity reads, and the orchestration of sensitive
 * account-protection flows. It deliberately does NOT re-implement any
 * identity capability:
 *   - password hashing/verification → PasswordHasherService (Identity)
 *   - re-authentication tokens      → ReauthService (Identity)
 *   - MFA/TOTP state and lifecycle  → MfaService (Identity)
 *   - session persistence/revocation→ IdentityRepository (Identity)
 *   - event/log persistence         → SecurityEventRepository (Security)
 *
 * /security/overview: server-computed aggregate of REAL state (protection
 * checks state hard facts with their methodology - no invented score).
 * Password change: reauth + revoke-other-sessions (§23) + event.
 * Session revocation: ownership-checked (IDOR-safe), scopes one/others/all.
 * API keys: prefix + fingerprint + hash - the secret is shown exactly once.
 */
import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { IdentityRepository, type UserRow } from "../identity/identity.repository";
import { ReauthService } from "../identity/reauth.service";
import { MfaService } from "../identity/mfa.service";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { toAuthSession } from "../identity/mappers";
import { SecurityEventService, toLoginRecord, toSecurityEvent } from "./security-event.service";
import { decodeActivityCursor, SecurityEventRepository } from "./security-event.repository";
import type { SecurityEventPageQuery, LoginRecordPageQuery } from "../../shared/contracts";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_AGE_DAYS = 180;
const MAX_HEALTHY_SESSIONS = 5;
const OVERVIEW_EVENTS = 60;
const OVERVIEW_LOGINS = 15;

@Injectable()
export class SecurityCenterService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly eventLog: SecurityEventRepository,
    private readonly events: SecurityEventService,
    private readonly reauth: ReauthService,
    private readonly mfa: MfaService,
    private readonly hasher: PasswordHasherService,
  ) {}

  // ── GET /security/overview ──────────────────────────────────────────────────

  async overview(user: UserRow, currentSessionId: string) {
    const [twoFactor, sessions, apiKeys, events, logins, recentFailedLogins] =
      await Promise.all([
        this.mfa.state(user),
        this.repository.listSessions(user.id),
        this.repository.listApiKeys(user.id),
        this.eventLog.listSecurityEvents(user.id, OVERVIEW_EVENTS),
        this.eventLog.listLoginRecords(user.id, OVERVIEW_LOGINS),
        this.eventLog.countRecentFailedLogins(
          user.id,
          new Date(Date.now() - 15 * 60 * 1000),
        ),
      ]);

    const passwordAgeDays = Math.floor(
      (Date.now() - user.passwordLastChangedAt.getTime()) / 86_400_000,
    );

    const protection = [
      {
        id: "two-factor",
        label: "Two-factor authentication",
        detail: twoFactor.enabled
          ? twoFactor.method === "EMAIL"
            ? "Email one-time codes are protecting sign-ins."
            : "Authenticator app is protecting sign-ins."
          : "Add an authenticator app or enable email codes to protect your sign-ins.",
        pass: twoFactor.enabled,
        methodology: "TFA state is enabled (server-side mfaEnabledAt).",
      },
      {
        id: "recovery-codes",
        label: "Recovery codes available",
        detail: `${twoFactor.recoveryCodesRemaining} of 10 unused.`,
        pass: twoFactor.enabled && twoFactor.recoveryCodesRemaining >= 5,
        methodology: "At least 5 single-use recovery codes remain.",
      },
      {
        id: "email-verified",
        label: "Email verified",
        detail: user.emailVerifiedAt ? "Email address verified." : "Verify your email address.",
        pass: user.emailVerifiedAt !== null,
        methodology: "emailVerifiedAt is set.",
      },
      {
        id: "password-freshness",
        label: "Password freshness",
        detail:
          passwordAgeDays < PASSWORD_MAX_AGE_DAYS
            ? `Changed ${passwordAgeDays} day(s) ago.`
            : `Changed ${passwordAgeDays} day(s) ago - consider rotating it.`,
        pass: passwordAgeDays < PASSWORD_MAX_AGE_DAYS,
        methodology: `Password younger than ${PASSWORD_MAX_AGE_DAYS} days.`,
      },
      {
        id: "api-key-hygiene",
        label: "API key hygiene",
        detail: apiKeys.some((k) => !k.revokedAt)
          ? "Review keys you no longer use and revoke them."
          : "No active API keys - nothing to review.",
        pass: !apiKeys.some((k) => !k.revokedAt && k.lastUsedAt === null && daysSince(k.createdAt) > 30),
        methodology: "No active key unused for more than 30 days.",
      },
      {
        id: "session-hygiene",
        label: "Session hygiene",
        detail: `${sessions.length} active session(s).`,
        pass: sessions.length <= MAX_HEALTHY_SESSIONS,
        methodology: `At most ${MAX_HEALTHY_SESSIONS} active sessions.`,
      },
      {
        id: "failed-signins",
        label: "No recent failed sign-ins",
        detail:
          recentFailedLogins === 0
            ? "No failed sign-ins in the last 15 minutes."
            : `${recentFailedLogins} failed sign-in(s) in the last 15 minutes.`,
        pass: recentFailedLogins === 0,
        methodology: "Zero failures in the last 15 minutes.",
      },
    ];

    const passed = protection.filter((check) => check.pass).length;
    const total = protection.length;
    const score = Math.round((passed / total) * 100);

    return {
      auth: {
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        passwordLastChangedAt: iso(user.passwordLastChangedAt),
        passwordMinLength: PASSWORD_MIN_LENGTH,
      },
      twoFactor,
      sessions: sessions.map((session) => toAuthSession(session, currentSessionId)),
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        fingerprint: key.fingerprint,
        scopes: key.scopes,
        createdAt: iso(key.createdAt),
        lastUsedAt: key.lastUsedAt ? iso(key.lastUsedAt) : null,
        expiresAt: key.expiresAt ? iso(key.expiresAt) : null,
        revoked: key.revokedAt !== null,
      })),
      // Integrations are a separate bounded context (backend Phase 14 was
      // never executed - no provider registry exists yet). Security exposes
      // an honestly EMPTY projection rather than inventing one; when the
      // Integrations context lands it will emit INTEGRATION_* events through
      // the shared event log and this projection reads from its public
      // contract. Security NEVER owns provider credentials (§23/§24).
      connectedAccounts: [],
      events: events.map(toSecurityEvent),
      logins: logins.map(toLoginRecord),
      protection,
      securityScore: {
        score,
        passed,
        total,
        rating: score >= 85 ? ("STRONG" as const) : score >= 60 ? ("FAIR" as const) : ("WEAK" as const),
      },
      rateLimits: [
        { scope: "Sign-in", limit: 5, windowLabel: "15 min", detail: "Per email address, sliding window." },
        { scope: "Email MFA codes", limit: 3, windowLabel: "15 min", detail: "Code delivery requests per email address." },
        { scope: "Re-authentication", limit: 5, windowLabel: "15 min", detail: "Failed attempts only." },
        { scope: "Password reset", limit: 3, windowLabel: "15 min", detail: "Reset emails per address." },
        { scope: "API endpoints", limit: 120, windowLabel: "min / key", detail: "Default global API rate limit." },
      ],
      retention: { securityEventsDays: 365, loginHistoryDays: 180 },
    };
  }

  // ── GET /security/events - paginated audit trail (Phase 16 §28/§29) ────────

  async listEventsPage(userId: string, query: SecurityEventPageQuery) {
    const cursor = this.decodeCursor(query.cursor);
    const page = await this.eventLog.listSecurityEventPage(userId, {
      limit: query.limit,
      cursor,
      type: query.type,
      outcome: query.outcome,
      from: query.from !== undefined ? new Date(query.from) : undefined,
      to: query.to !== undefined ? new Date(query.to) : undefined,
    });
    return {
      items: page.items.map(toSecurityEvent),
      nextCursor: page.nextCursor,
    };
  }

  // ── GET /security/logins - paginated login history (Phase 16 §28/§29) ──────

  async listLoginsPage(userId: string, query: LoginRecordPageQuery) {
    const cursor = this.decodeCursor(query.cursor);
    const page = await this.eventLog.listLoginRecordPage(userId, {
      limit: query.limit,
      cursor,
      success: query.success,
      from: query.from !== undefined ? new Date(query.from) : undefined,
      to: query.to !== undefined ? new Date(query.to) : undefined,
    });
    return {
      items: page.items.map(toLoginRecord),
      nextCursor: page.nextCursor,
    };
  }

  /** Malformed cursors are a client error - 400, never a 500 (§27). */
  private decodeCursor(raw: string | undefined) {
    if (raw === undefined) return null;
    const cursor = decodeActivityCursor(raw);
    if (!cursor) {
      throw new ValidationError(
        "The pagination cursor is invalid.",
        [{ path: "cursor", message: "Malformed cursor" }],
        "INVALID_CURSOR",
      );
    }
    return cursor;
  }

  // ── POST /security/reauth ───────────────────────────────────────────────────

  async reauthenticate(user: UserRow, password: string) {
    return this.reauth.reauthenticate(user, password);
  }

  // ── POST /security/password (§23) ───────────────────────────────────────────

  async changePassword(
    user: UserRow,
    currentSessionId: string,
    input: { reauthToken?: string; newPassword: string },
  ): Promise<{ changedAt: string }> {
    await this.reauth.consume(input.reauthToken, user.id);

    if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new ConflictError(
        `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
        "WEAK_PASSWORD",
      );
    }
    if (await this.hasher.verify(user.passwordHash, input.newPassword)) {
      throw new ConflictError("The new password must differ from the current one.", "PASSWORD_UNCHANGED");
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.repository.updateUser(user.id, {
      passwordHash,
      passwordLastChangedAt: new Date(),
    });
    // §23: a credential change must not silently preserve other sessions.
    // The CURRENT session stays untouched (the user just re-proved ownership
    // via reauth, and rotating it would invalidate their live cookie);
    // every OTHER session is signed out.
    const revoked = await this.repository.revokeOtherSessionsForUser(user.id, currentSessionId);
    await this.events.record({
      userId: user.id,
      type: "PASSWORD_CHANGED",
      actor: user.email,
      context: `Password changed. ${revoked} other session(s) signed out.`,
    });
    return { changedAt: new Date().toISOString() };
  }

  // ── POST /security/sessions/revoke (§16) ────────────────────────────────────

  async revokeSessions(
    user: UserRow,
    currentSessionId: string,
    input: { sessionId: string | null; scope: "one" | "others" | "all" },
  ): Promise<{ revokedCount: number; currentSessionAffected: boolean }> {
    const sessions = await this.repository.listSessions(user.id);

    if (input.scope === "one") {
      if (!input.sessionId) {
        throw new ConflictError("A session id is required for scope \"one\".", "MISSING_SESSION");
      }
      const target = sessions.find((session) => session.id === input.sessionId);
      // Ownership check - another user's session id is simply not found (404).
      if (!target) {
        throw new NotFoundError("That session does not exist.", "SESSION_NOT_FOUND");
      }
      await this.repository.revokeSession(target.id);
      await this.events.record({
        userId: user.id,
        type: "SESSION_REVOKED",
        actor: user.email,
        context: `Session on ${target.device} (${target.browser}) revoked.`,
      });
      return { revokedCount: 1, currentSessionAffected: target.id === currentSessionId };
    }

    const targets =
      input.scope === "others"
        ? sessions.filter((session) => session.id !== currentSessionId)
        : sessions;
    for (const session of targets) {
      await this.repository.revokeSession(session.id);
    }
    if (targets.length > 0) {
      await this.events.record({
        userId: user.id,
        type: "SESSION_REVOKED",
        actor: user.email,
        context:
          input.scope === "others"
            ? `All other sessions revoked (${targets.length}).`
            : `All sessions revoked (${targets.length}) - including the current one.`,
      });
    }
    return {
      revokedCount: targets.length,
      currentSessionAffected: input.scope === "all",
    };
  }

  // ── API keys (§8) ───────────────────────────────────────────────────────────

  async createApiKey(
    user: UserRow,
    input: { reauthToken?: string; name: string; scopes: string[]; expiresInDays: number | null },
  ): Promise<{ key: { id: string; name: string; prefix: string; fingerprint: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revoked: boolean }; secret: string }> {
    await this.reauth.consume(input.reauthToken, user.id);

    const secret = `cz_live_${randomBytes(16).toString("hex")}`;
    const prefix = secret.slice(0, 12);
    const fingerprint = createHash("sha256").update(secret).digest("hex").slice(0, 12);
    const expiresAt =
      input.expiresInDays !== null
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null;

    const created = await this.repository.createApiKey({
      userId: user.id,
      name: input.name,
      prefix,
      fingerprint,
      secretHash: createHash("sha256").update(secret).digest("hex"),
      scopes: [...input.scopes],
      expiresAt,
    });

    await this.events.record({
      userId: user.id,
      type: "API_KEY_CREATED",
      actor: user.email,
      context: `API key "${input.name}" created (${input.scopes.join(", ")}).`,
    });

    return {
      key: {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        fingerprint: created.fingerprint,
        scopes: created.scopes,
        createdAt: iso(created.createdAt),
        lastUsedAt: null,
        expiresAt: created.expiresAt ? iso(created.expiresAt) : null,
        revoked: false,
      },
      // The ONLY response that ever carries the plaintext secret (§8).
      secret,
    };
  }

  async revokeApiKey(
    user: UserRow,
    keyId: string,
    reauthToken: string | undefined,
  ): Promise<{ id: string }> {
    await this.reauth.consume(reauthToken, user.id);
    const key = await this.repository.findApiKeyById(keyId);
    // Ownership: another user's key id is "not found" (IDOR-safe, §43).
    if (!key || key.userId !== user.id) {
      throw new NotFoundError("That API key does not exist.", "KEY_NOT_FOUND");
    }
    if (key.revokedAt) {
      throw new ConflictError("That API key is already revoked.", "KEY_ALREADY_REVOKED");
    }
    await this.repository.revokeApiKey(key.id);
    await this.events.record({
      userId: user.id,
      type: "API_KEY_REVOKED",
      actor: user.email,
      context: `API key "${key.name}" revoked.`,
    });
    return { id: key.id };
  }
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
