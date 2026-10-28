/**
 * Identity data access (infrastructure).
 *
 * The ONLY place in the identity context that touches Prisma. All methods
 * return contract-shaped data or narrow row projections - no Prisma type
 * crosses into services or controllers (Phase 1 §10 boundary).
 */
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { createHash, randomBytes } from "node:crypto";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: string;
  role: string;
  emailVerifiedAt: Date | null;
  passwordLastChangedAt: Date;
  mfaSecretEnc: string | null;
  mfaPendingSecretEnc: string | null;
  mfaEnabledAt: Date | null;
  mfaDisabledAt: Date | null;
  mfaLastVerifiedAt: Date | null;
  mfaMethod: string | null;
  mfaPendingEmailCodeHash: string | null;
  mfaPendingEmailExpiresAt: Date | null;
  mfaPendingEmailAttempts: number;
  timezone: string;
  baseCurrency: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  preferences: unknown;
  deletionScheduledFor: Date | null;
  createdAt: Date;
}

export interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousTokenHash: string | null;
  generation: number;
  device: string;
  browser: string;
  os: string;
  ipMasked: string;
  location: string;
  userAgent: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Append-only audit event (model SecurityEvent - /security/overview feed). */
export interface SecurityEventRow {
  id: string;
  userId: string | null;
  at: Date;
  type: string;
  actor: string;
  context: string;
  outcome: string;
}

/** Append-only sign-in history row (model LoginRecord - /security/overview). */
export interface LoginRecordRow {
  id: string;
  userId: string;
  at: Date;
  success: boolean;
  device: string;
  browser: string;
  os: string;
  ipMasked: string;
  location: string;
  reason: string | null;
}

@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Hashing helpers (token/challenge storage - SHA-256 is enough here: the
  //    inputs are high-entropy random values, not user-chosen secrets).

  static hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  static randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return (row as UserRow) ?? null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return (row as UserRow) ?? null;
  }

  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { email: email.toLowerCase(), ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    });
    return count > 0;
  }

  async isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { username, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    });
    return count > 0;
  }

  async createUser(data: {
    email: string;
    name: string;
    passwordHash: string;
    preferences: unknown;
    status?: "PENDING_VERIFICATION" | "ACTIVE";
    emailVerifiedAt?: Date | null;
  }): Promise<UserRow> {
    const row = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
        status: data.status ?? "PENDING_VERIFICATION",
        emailVerifiedAt: data.emailVerifiedAt ?? null,
        preferences: data.preferences as Prisma.InputJsonValue,
      },
    });
    return row as UserRow;
  }

  /** Begin TOTP enrollment and replace inactive recovery codes as one state transition. */
  async beginTotpMfaEnrollment(data: {
    userId: string;
    expectedEmail: string;
    expectedPendingSecretEnc: string | null;
    expectedEmailCodeHash: string | null;
    expectedEmailExpiresAt: Date | null;
    pendingSecretEnc: string;
    recoveryCodeHashes: string[];
  }): Promise<UserRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: data.userId,
          email: data.expectedEmail,
          status: "ACTIVE",
          mfaEnabledAt: null,
          mfaPendingSecretEnc: data.expectedPendingSecretEnc,
          mfaPendingEmailCodeHash: data.expectedEmailCodeHash,
          mfaPendingEmailExpiresAt: data.expectedEmailExpiresAt,
        },
        data: {
          mfaPendingSecretEnc: data.pendingSecretEnc,
          mfaPendingEmailCodeHash: null,
          mfaPendingEmailExpiresAt: null,
          mfaPendingEmailAttempts: 0,
        },
      });
      if (updated.count !== 1) return null;

      await tx.recoveryCode.deleteMany({ where: { userId: data.userId } });
      if (data.recoveryCodeHashes.length > 0) {
        await tx.recoveryCode.createMany({
          data: data.recoveryCodeHashes.map((codeHash) => ({
            userId: data.userId,
            codeHash,
            active: false,
          })),
        });
      }
      const row = await tx.user.findUnique({ where: { id: data.userId } });
      return row as UserRow | null;
    });
  }

  /** Consume the pending TOTP secret only for an active account, preventing stale confirmations. */
  async completeTotpMfaEnrollment(data: {
    userId: string;
    pendingSecretEnc: string;
    enabledAt: Date;
  }): Promise<UserRow | null> {
    const updated = await this.prisma.user.updateMany({
      where: {
        id: data.userId,
        status: "ACTIVE",
        mfaEnabledAt: null,
        mfaPendingSecretEnc: data.pendingSecretEnc,
      },
      data: {
        mfaSecretEnc: data.pendingSecretEnc,
        mfaPendingSecretEnc: null,
        mfaPendingEmailCodeHash: null,
        mfaPendingEmailExpiresAt: null,
        mfaPendingEmailAttempts: 0,
        mfaMethod: "AUTHENTICATOR_APP",
        mfaEnabledAt: data.enabledAt,
        mfaDisabledAt: null,
        mfaLastVerifiedAt: data.enabledAt,
      },
    });
    if (updated.count !== 1) return null;
    const row = await this.prisma.user.findUnique({ where: { id: data.userId } });
    return row as UserRow | null;
  }

  /** Atomically count a wrong email-MFA enrollment code; lock and clear it on attempt five. */
  async recordEmailMfaEnrollmentFailure(
    userId: string,
    expectedCodeHash: string,
    now: Date,
  ): Promise<number | null> {
    const updated = await this.prisma.user.updateMany({
      where: {
        id: userId,
        status: "ACTIVE",
        mfaEnabledAt: null,
        mfaPendingEmailCodeHash: expectedCodeHash,
        mfaPendingEmailExpiresAt: { gt: now },
        mfaPendingEmailAttempts: { lt: 5 },
      },
      data: { mfaPendingEmailAttempts: { increment: 1 } },
    });
    if (updated.count !== 1) return null;

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaPendingEmailAttempts: true },
    });
    if (!current) return null;
    if (current.mfaPendingEmailAttempts >= 5) {
      await this.prisma.user.updateMany({
        where: {
          id: userId,
          mfaPendingEmailCodeHash: expectedCodeHash,
          mfaPendingEmailAttempts: { gte: 5 },
        },
        data: {
          mfaPendingEmailCodeHash: null,
          mfaPendingEmailExpiresAt: null,
          mfaPendingEmailAttempts: 0,
        },
      });
    }
    return current.mfaPendingEmailAttempts;
  }

  /** Clear only the expired enrollment challenge that the caller actually observed. */
  async clearPendingEmailMfaChallenge(userId: string, expectedCodeHash: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, mfaPendingEmailCodeHash: expectedCodeHash },
      data: {
        mfaPendingEmailCodeHash: null,
        mfaPendingEmailExpiresAt: null,
        mfaPendingEmailAttempts: 0,
      },
    });
  }

  /** Consume the enrollment code and activate email MFA/recovery codes atomically. */
  async completeEmailMfaEnrollment(data: {
    userId: string;
    expectedCodeHash: string;
    enabledAt: Date;
    recoveryCodeHashes: string[];
  }): Promise<UserRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.user.updateMany({
        where: {
          id: data.userId,
          status: "ACTIVE",
          mfaEnabledAt: null,
          mfaPendingEmailCodeHash: data.expectedCodeHash,
          mfaPendingEmailExpiresAt: { gt: data.enabledAt },
          mfaPendingEmailAttempts: { lt: 5 },
        },
        data: {
          mfaSecretEnc: null,
          mfaPendingSecretEnc: null,
          mfaPendingEmailCodeHash: null,
          mfaPendingEmailExpiresAt: null,
          mfaPendingEmailAttempts: 0,
          mfaMethod: "EMAIL",
          mfaEnabledAt: data.enabledAt,
          mfaDisabledAt: null,
          mfaLastVerifiedAt: data.enabledAt,
        },
      });
      if (consumed.count !== 1) return null;

      await tx.recoveryCode.deleteMany({ where: { userId: data.userId } });
      if (data.recoveryCodeHashes.length > 0) {
        await tx.recoveryCode.createMany({
          data: data.recoveryCodeHashes.map((codeHash) => ({
            userId: data.userId,
            codeHash,
            active: true,
          })),
        });
      }
      const row = await tx.user.findUnique({ where: { id: data.userId } });
      return row as UserRow | null;
    });
  }

  /** Atomically claim the email-MFA enrollment slot against stale/concurrent requests. */
  async beginPendingEmailMfaChallenge(data: {
    userId: string;
    expectedEmail: string;
    expectedPendingSecretEnc: string | null;
    expectedCodeHash: string | null;
    expectedExpiresAt: Date | null;
    codeHash: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: {
        id: data.userId,
        email: data.expectedEmail,
        status: "ACTIVE",
        mfaEnabledAt: null,
        mfaPendingSecretEnc: data.expectedPendingSecretEnc,
        mfaPendingEmailCodeHash: data.expectedCodeHash,
        mfaPendingEmailExpiresAt: data.expectedExpiresAt,
      },
      data: {
        mfaPendingEmailCodeHash: data.codeHash,
        mfaPendingEmailExpiresAt: data.expiresAt,
        mfaPendingEmailAttempts: 0,
        mfaPendingSecretEnc: null,
      },
    });
    return result.count === 1;
  }

  /** Restore the prior enrollment state only if this failed send still owns the slot. */
  async restorePendingEmailMfaChallenge(data: {
    userId: string;
    candidateCodeHash: string;
    previousCodeHash: string | null;
    previousExpiresAt: Date | null;
    previousAttempts: number;
    previousSecretEnc: string | null;
  }): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: data.userId, mfaPendingEmailCodeHash: data.candidateCodeHash },
      data: {
        mfaPendingEmailCodeHash: data.previousCodeHash,
        mfaPendingEmailExpiresAt: data.previousExpiresAt,
        mfaPendingEmailAttempts: data.previousAttempts,
        mfaPendingSecretEnc: data.previousSecretEnc,
      },
    });
  }

  async updateUser(
    id: string,
    data: Partial<{
      passwordHash: string;
      passwordLastChangedAt: Date;
      status: string;
      email: string;
      emailVerifiedAt: Date | null;
      name: string;
      timezone: string;
      baseCurrency: string;
      username: string | null;
      bio: string | null;
      avatarUrl: string | null;
      preferences: Prisma.InputJsonValue;
      mfaSecretEnc: string | null;
      mfaPendingSecretEnc: string | null;
      mfaEnabledAt: Date | null;
      mfaDisabledAt: Date | null;
      mfaLastVerifiedAt: Date | null;
      mfaMethod: string | null;
      mfaPendingEmailCodeHash: string | null;
      mfaPendingEmailExpiresAt: Date | null;
      mfaPendingEmailAttempts: number;
      deletionScheduledFor: Date | null;
    }>,
  ): Promise<UserRow> {
    const row = await this.prisma.user.update({
      where: { id },
      data: data as Prisma.UserUncheckedUpdateInput,
    });
    return row as UserRow;
  }

  // ── Preferences (narrow Settings contract - Phase 15 §32) ──────────────────
  // The Settings bounded context persists its JSON document through THESE
  // methods only: explicit, mass-assignment-safe field sets instead of the
  // generic updateUser patch. `updatePreferencesWithTimezone` keeps the
  // Localization→Profile timezone write-through atomic (Phase 15 §29.6).

  async updatePreferences(id: string, preferences: unknown): Promise<UserRow> {
    const row = await this.prisma.user.update({
      where: { id },
      data: { preferences: preferences as Prisma.InputJsonValue },
    });
    return row as UserRow;
  }

  async updatePreferencesWithTimezone(
    id: string,
    preferences: unknown,
    timezone: string,
  ): Promise<UserRow> {
    const [row] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { preferences: preferences as Prisma.InputJsonValue },
      }),
      this.prisma.user.update({ where: { id }, data: { timezone } }),
    ]);
    return row as UserRow;
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async findSessionByTokenHash(hash: string): Promise<SessionRow | null> {
    const row = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
    });
    return (row as SessionRow) ?? null;
  }

  async findSessionById(id: string): Promise<SessionRow | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return (row as SessionRow) ?? null;
  }

  async listSessions(userId: string): Promise<SessionRow[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return rows as SessionRow[];
  }

  async createSession(data: {
    userId: string;
    refreshTokenHash: string;
    device: string;
    browser: string;
    os: string;
    ipMasked: string;
    location: string;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<SessionRow> {
    const row = await this.prisma.session.create({ data });
    return row as SessionRow;
  }

  /** Rotation: new generation + new token hash on the SAME session row. */
  async rotateSession(
    id: string,
    data: { refreshTokenHash: string; expiresAt: Date },
  ): Promise<SessionRow> {
    const existing = await this.prisma.session.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.session.update({
      where: { id },
      data: {
        ...data,
        previousTokenHash: existing.refreshTokenHash,
        generation: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });
    return row as SessionRow;
  }

  async findSessionByPreviousTokenHash(hash: string): Promise<SessionRow | null> {
    const row = await this.prisma.session.findFirst({
      where: { previousTokenHash: hash },
    });
    return (row as SessionRow) ?? null;
  }

  async touchSession(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke every session EXCEPT the given one (password-change flow §23). */
  async revokeOtherSessionsForUser(userId: string, keepSessionId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  // ── Owned-entity counts (Phase 20 §39) ──────────────────────────────────────
  //
  // The append-only SecurityEvent log and the LoginRecord history are owned by
  // the Security context (Phase 16 bounded-context extraction): Identity never
  // reads or writes those tables directly - it records through the
  // SecurityEventService port. These counts cover ONLY Identity-owned tables
  // and are the narrow read contract Monitoring consumes (Phase 20 §39).

  async countUserEntities(userId: string): Promise<{
    sessions: number;
    apiKeys: number;
  }> {
    const [sessions, apiKeys] = await Promise.all([
      this.prisma.session.count({ where: { userId } }),
      this.prisma.apiKey.count({ where: { userId } }),
    ]);
    return { sessions, apiKeys };
  }

  // ── Append-only audit writes (Phase 2 §30) ──────────────────────────────────
  //
  // The Security CENTER owns the reads of these tables (Phase 16); the
  // identity-side SecurityEventService still records through THIS repository -
  // append-only, never update, never delete (§30).

  async appendSecurityEvent(data: {
    userId: string | null;
    type: string;
    actor: string;
    context: string;
    outcome: "SUCCESS" | "FAILURE";
  }): Promise<void> {
    await this.prisma.securityEvent.create({ data });
  }

  async appendLoginRecord(data: {
    userId: string;
    success: boolean;
    device: string;
    browser: string;
    os: string;
    ipMasked: string;
    location: string;
    reason: string | null;
  }): Promise<void> {
    await this.prisma.loginRecord.create({ data });
  }

  // ── Security center reads (append-only audit tables) ────────────────────────
  //
  // Narrow row projections for /security/overview (Phase 16) - newest first,
  // caller-scoped limit; no update, no delete (§30).

  async listSecurityEvents(userId: string, limit: number): Promise<SecurityEventRow[]> {
    const rows = await this.prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { at: "desc" },
      take: limit,
    });
    return rows as SecurityEventRow[];
  }

  async listLoginRecords(userId: string, limit: number): Promise<LoginRecordRow[]> {
    const rows = await this.prisma.loginRecord.findMany({
      where: { userId },
      orderBy: { at: "desc" },
      take: limit,
    });
    return rows as LoginRecordRow[];
  }

  /** Failed sign-ins inside the sliding window (protection check input). */
  async countRecentFailedLogins(userId: string, since: Date): Promise<number> {
    return this.prisma.loginRecord.count({
      where: { userId, success: false, at: { gte: since } },
    });
  }

  // ── Auth challenges (email verification / password reset) ──────────────────

  async createChallenge(data: {
    userId: string;
    purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
    tokenHash: string;
    expiresAt: Date;
    targetEmail?: string | null;
  }): Promise<void> {
    // Persist the candidate before delivery, but keep the previous link valid
    // until SMTP confirms success. A failed resend must not strand the user.
    await this.prisma.authChallenge.create({ data });
  }

  async findChallengeByTokenHash(hash: string) {
    return this.prisma.authChallenge.findUnique({
      where: { tokenHash: hash },
    });
  }

  /** Remove an undelivered candidate challenge without touching an older valid link. */
  async deleteChallengeByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.authChallenge.deleteMany({ where: { tokenHash, usedAt: null } });
  }

  /** Invalidate old verification links before the account's email identity changes. */
  async invalidateChallengesForUser(
    userId: string,
    purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  ): Promise<void> {
    await this.prisma.authChallenge.deleteMany({ where: { userId, purpose } });
  }

  /** Once delivery succeeds, invalidate other unused challenges of the same purpose. */
  async finalizeDeliveredChallenge(data: {
    userId: string;
    purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
    tokenHash: string;
  }): Promise<void> {
    await this.prisma.authChallenge.deleteMany({
      where: {
        userId: data.userId,
        purpose: data.purpose,
        usedAt: null,
        tokenHash: { not: data.tokenHash },
      },
    });
  }

  async createMfaLoginChallenge(data: {
    userId: string;
    tokenHash: string;
    codeHash: string | null;
    method: "AUTHENTICATOR_APP" | "EMAIL";
    remember: boolean;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction([
      // Keep active challenges valid until a replacement has been delivered;
      // prune spent/expired records so the table does not grow without bound.
      this.prisma.authChallenge.deleteMany({
        where: {
          purpose: "MFA_LOGIN",
          OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date() } }],
        },
      }),
      this.prisma.authChallenge.create({
        data: {
          userId: data.userId,
          purpose: "MFA_LOGIN",
          tokenHash: data.tokenHash,
          codeHash: data.codeHash,
          method: data.method,
          remember: data.remember,
          expiresAt: data.expiresAt,
        },
      }),
    ]);
  }

  async findMfaLoginChallengeByTokenHash(hash: string) {
    return this.prisma.authChallenge.findFirst({
      where: { tokenHash: hash, purpose: "MFA_LOGIN" },
    });
  }

  /** Retire previous login challenges only after the replacement is ready. */
  async finalizeMfaLoginChallenge(data: { userId: string; tokenHash: string }): Promise<void> {
    await this.prisma.authChallenge.deleteMany({
      where: {
        userId: data.userId,
        purpose: "MFA_LOGIN",
        usedAt: null,
        tokenHash: { not: data.tokenHash },
      },
    });
  }

  /** Remove a login challenge whose email code could not be delivered. */
  async deleteMfaLoginChallengeByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.authChallenge.deleteMany({
      where: { tokenHash, purpose: "MFA_LOGIN", usedAt: null },
    });
  }

  /** Atomically record a failed code and burn the challenge on attempt five. */
  async recordMfaLoginFailure(id: string): Promise<number | null> {
    const now = new Date();
    const updated = await this.prisma.authChallenge.updateMany({
      where: {
        id,
        purpose: "MFA_LOGIN",
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
      data: { attempts: { increment: 1 } },
    });
    if (updated.count !== 1) return null;

    const challenge = await this.prisma.authChallenge.findUnique({
      where: { id },
      select: { attempts: true },
    });
    if (!challenge) return null;
    if (challenge.attempts >= 5) {
      await this.prisma.authChallenge.updateMany({
        where: { id, purpose: "MFA_LOGIN", usedAt: null },
        data: { usedAt: now },
      });
    }
    return challenge.attempts;
  }

  /** Single-use completion guard; concurrent successful requests cannot both log in. */
  async consumeMfaLoginChallenge(id: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.authChallenge.updateMany({
      where: {
        id,
        purpose: "MFA_LOGIN",
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  /**
   * Atomically consume an unused, unexpired challenge. The conditional write
   * prevents concurrent requests from successfully replaying the same token.
   */
  async consumeChallenge(id: string): Promise<boolean> {
    const result = await this.prisma.authChallenge.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * Consume an email-verification challenge and activate the account atomically.
   * A failed account update must not burn a valid verification link.
   */
  async completeEmailVerification(data: {
    challengeId: string;
    userId: string;
    targetEmail: string;
    verifiedAt: Date;
  }): Promise<UserRow | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({
          where: { id: data.userId },
          select: { status: true, email: true },
        });
        // A stale verification link must never reactivate a suspended or
        // deactivated account or verify a different email address.
        if (
          !current ||
          current.status !== "PENDING_VERIFICATION" ||
          current.email.toLowerCase() !== data.targetEmail.toLowerCase()
        ) return null;

        const consumed = await tx.authChallenge.updateMany({
          where: {
            id: data.challengeId,
            userId: data.userId,
            purpose: "EMAIL_VERIFICATION",
            targetEmail: data.targetEmail,
            usedAt: null,
            expiresAt: { gt: data.verifiedAt },
          },
          data: { usedAt: data.verifiedAt },
        });
        if (consumed.count !== 1) return null;

        const updated = await tx.user.updateMany({
          where: {
            id: data.userId,
            email: data.targetEmail,
            status: "PENDING_VERIFICATION",
          },
          data: { status: "ACTIVE", emailVerifiedAt: data.verifiedAt },
        });
        if (updated.count !== 1) {
          // Roll back challenge consumption if account status changed mid-flight.
          throw new Error("EMAIL_VERIFICATION_STATE_CHANGED");
        }

        await tx.authChallenge.deleteMany({
          where: {
            userId: data.userId,
            purpose: "EMAIL_VERIFICATION",
            usedAt: null,
            id: { not: data.challengeId },
          },
        });
        const row = await tx.user.findUnique({ where: { id: data.userId } });
        return row as UserRow | null;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_VERIFICATION_STATE_CHANGED") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Consume a password-reset challenge and apply the credential/session changes
   * in one transaction. A failed user update must not burn a valid reset token.
   */
  async completePasswordReset(data: {
    challengeId: string;
    userId: string;
    passwordHash: string;
    changedAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authChallenge.updateMany({
        where: {
          id: data.challengeId,
          userId: data.userId,
          purpose: "PASSWORD_RESET",
          usedAt: null,
          expiresAt: { gt: data.changedAt },
        },
        data: { usedAt: data.changedAt },
      });
      if (consumed.count !== 1) return false;

      await tx.user.update({
        where: { id: data.userId },
        data: {
          passwordHash: data.passwordHash,
          passwordLastChangedAt: data.changedAt,
        },
      });
      await tx.session.updateMany({
        where: { userId: data.userId, revokedAt: null },
        data: { revokedAt: data.changedAt },
      });
      // A successful reset invalidates every other outstanding reset link.
      await tx.authChallenge.deleteMany({
        where: {
          userId: data.userId,
          purpose: "PASSWORD_RESET",
          usedAt: null,
          id: { not: data.challengeId },
        },
      });
      return true;
    });
  }

  // ── Recovery codes ─────────────────────────────────────────────────────────

  async replaceRecoveryCodes(
    userId: string,
    hashes: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      ...hashes.map((codeHash) =>
        this.prisma.recoveryCode.create({ data: { userId, codeHash, active: true } }),
      ),
    ]);
  }

  /** Activate the (inactive) codes created during enrollment start. */
  async activateRecoveryCodes(userId: string): Promise<void> {
    await this.prisma.recoveryCode.updateMany({
      where: { userId, usedAt: null },
      data: { active: true },
    });
  }

  /** Disable without deleting - the audit trail keeps counts honest. */
  async deactivateRecoveryCodes(userId: string): Promise<void> {
    await this.prisma.recoveryCode.updateMany({
      where: { userId },
      data: { active: false },
    });
  }

  async listActiveRecoveryCodes(userId: string) {
    return this.prisma.recoveryCode.findMany({
      where: { userId, active: true, usedAt: null },
    });
  }

  async findMatchingActiveRecoveryCode(userId: string, codeHash: string) {
    return this.prisma.recoveryCode.findFirst({
      where: { userId, active: true, usedAt: null, codeHash },
    });
  }

  /** Atomically consume an active, unused recovery code exactly once. */
  async consumeRecoveryCode(id: string): Promise<boolean> {
    const result = await this.prisma.recoveryCode.updateMany({
      where: { id, active: true, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  // ── API keys ───────────────────────────────────────────────────────────────

  async createApiKey(data: {
    userId: string;
    name: string;
    prefix: string;
    fingerprint: string;
    secretHash: string;
    scopes: string[];
    expiresAt: Date | null;
  }) {
    return this.prisma.apiKey.create({ data });
  }

  async listApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findApiKeyById(id: string) {
    return this.prisma.apiKey.findUnique({ where: { id } });
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
