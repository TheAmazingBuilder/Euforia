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
  }): Promise<void> {
    await this.prisma.$transaction([
      // Single active challenge per purpose: issuing a new one invalidates
      // previous unused ones (resend support + replay surface reduction).
      this.prisma.authChallenge.deleteMany({
        where: { userId: data.userId, purpose: data.purpose, usedAt: null },
      }),
      this.prisma.authChallenge.create({ data }),
    ]);
  }

  async findChallengeByTokenHash(hash: string) {
    return this.prisma.authChallenge.findUnique({
      where: { tokenHash: hash },
    });
  }

  async consumeChallenge(id: string): Promise<void> {
    await this.prisma.authChallenge.update({
      where: { id },
      data: { usedAt: new Date() },
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

  async consumeRecoveryCode(id: string): Promise<void> {
    await this.prisma.recoveryCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
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
