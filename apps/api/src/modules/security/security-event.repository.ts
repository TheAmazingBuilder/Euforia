/**
 * Security activity persistence (Phase 16 — bounded-context extraction).
 *
 * Owns the append-only SecurityEvent log and the LoginRecord history — the
 * tables were previously persisted through IdentityRepository (Phase 2);
 * they now live in the Security context so that:
 *   - Identity/Accounts record events through the SecurityEventService port
 *     without dragging the whole identity context in (§33/§34);
 *   - the Security center owns the reads (activity, audit trail, posture).
 *
 * The log is APPEND-ONLY (§10): this repository exposes append + reads —
 * no update, no delete. Retention enforcement belongs to an authorized
 * system process, never to a user-facing API (§31).
 *
 * Keyset pagination (§28): pages are cut on the compound (at DESC, id DESC)
 * key with an opaque base64url cursor, so unbounded history can be walked
 * stably regardless of concurrent inserts.
 */
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// ── Narrow row shapes (no Prisma type crosses into services) ─────────────────

export interface SecurityEventRow {
  id: string;
  userId: string | null;
  at: Date;
  type: string;
  actor: string;
  context: string;
  outcome: string;
}

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

// ── Keyset cursor codec (opaque to clients) ──────────────────────────────────

export function encodeActivityCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, "utf8").toString("base64url");
}

/** Returns null for malformed cursors — callers map that to 400. */
export function decodeActivityCursor(raw: string): { at: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) return null;
    const atIso = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!id) return null;
    const at = new Date(atIso);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export interface SecurityEventPageFilters {
  limit: number;
  cursor: { at: Date; id: string } | null;
  type?: string;
  outcome?: "SUCCESS" | "FAILURE";
  from?: Date;
  to?: Date;
}

export interface LoginRecordPageFilters {
  limit: number;
  cursor: { at: Date; id: string } | null;
  success?: boolean;
  from?: Date;
  to?: Date;
}

@Injectable()
export class SecurityEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Appends (the only writes) ───────────────────────────────────────────────

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

  // ── Reads — overview windows (bounded, Phase 2 semantics) ───────────────────

  async listSecurityEvents(userId: string, take: number): Promise<SecurityEventRow[]> {
    const rows = await this.prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { at: "desc" },
      take,
    });
    return rows as SecurityEventRow[];
  }

  async listLoginRecords(userId: string, take: number): Promise<LoginRecordRow[]> {
    const rows = await this.prisma.loginRecord.findMany({
      where: { userId },
      orderBy: { at: "desc" },
      take,
    });
    return rows as LoginRecordRow[];
  }

  async countRecentFailedLogins(userId: string, since: Date): Promise<number> {
    return this.prisma.loginRecord.count({
      where: { userId, success: false, at: { gte: since } },
    });
  }

  // ── Reads — keyset-paginated audit trail (Phase 16 §28) ─────────────────────

  async listSecurityEventPage(
    userId: string,
    filters: SecurityEventPageFilters,
  ): Promise<{ items: SecurityEventRow[]; nextCursor: string | null }> {
    const { limit, cursor, type, outcome, from, to } = filters;
    const where: Prisma.SecurityEventWhereInput = {
      userId,
      ...(type !== undefined ? { type } : {}),
      ...(outcome !== undefined ? { outcome } : {}),
      ...(from !== undefined || to !== undefined
        ? { at: { ...(from !== undefined ? { gte: from } : {}), ...(to !== undefined ? { lte: to } : {}) } }
        : {}),
      ...(cursor
        ? {
            // Strictly "before" the cursor on the compound (at, id) key.
            OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }],
          }
        : {}),
    };
    const rows = (await this.prisma.securityEvent.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
    })) as SecurityEventRow[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeActivityCursor(last.at, last.id) : null,
    };
  }

  async listLoginRecordPage(
    userId: string,
    filters: LoginRecordPageFilters,
  ): Promise<{ items: LoginRecordRow[]; nextCursor: string | null }> {
    const { limit, cursor, success, from, to } = filters;
    const where: Prisma.LoginRecordWhereInput = {
      userId,
      ...(success !== undefined ? { success } : {}),
      ...(from !== undefined || to !== undefined
        ? { at: { ...(from !== undefined ? { gte: from } : {}), ...(to !== undefined ? { lte: to } : {}) } }
        : {}),
      ...(cursor
        ? {
            OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }],
          }
        : {}),
    };
    const rows = (await this.prisma.loginRecord.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
    })) as LoginRecordRow[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeActivityCursor(last.at, last.id) : null,
    };
  }
}
