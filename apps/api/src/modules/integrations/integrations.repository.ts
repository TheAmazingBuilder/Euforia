import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { Prisma } from "@prisma/client";

/**
 * Integration Hub persistence - one bounded table (IntegrationRow) with a
 * kind discriminator, following the module-upgrade storage pattern:
 * identity in columns (userId, kind, refId), the business aggregate in
 * `data Json`.
 *
 * Row kinds:
 *   PROVIDER - refId = providerId, data = per-user connection/sync state
 *   WEBHOOK  - refId = endpoint id, data = deliveries + lastAcceptedEventId
 *   EVENT    - row id = audit event id (bounded ring, pruned by cap + TTL)
 *   ERROR    - row id = error ledger id (bounded ring)
 *   ECO      - refId = providerKey, data = normalized economic event
 *   NEWS     - refId = providerKey, data = sample headline
 *   SEEN     - refId = idempotency key (§14 dedupe, cross webhook+eco)
 */

export const INTEGRATION_ROW_KINDS = {
  PROVIDER: "PROVIDER",
  WEBHOOK: "WEBHOOK",
  EVENT: "EVENT",
  ERROR: "ERROR",
  ECO: "ECO",
  NEWS: "NEWS",
  SEEN: "SEEN",
} as const;

export interface IntegrationRowLike {
  id: string;
  refId: string;
  data: Prisma.JsonValue;
}

@Injectable()
export class IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRows(userId: string, kind: string): Promise<IntegrationRowLike[]> {
    const rows = await this.prisma.integrationRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({ id: row.id, refId: row.refId, data: row.data }));
  }

  /** Newest-first page for the bounded event/error rings. */
  async listRowsDesc(userId: string, kind: string, take: number): Promise<IntegrationRowLike[]> {
    const rows = await this.prisma.integrationRow.findMany({
      where: { userId, kind },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return rows.map((row) => ({ id: row.id, refId: row.refId, data: row.data }));
  }

  async findRow(userId: string, kind: string, refId: string): Promise<IntegrationRowLike | null> {
    const row = await this.prisma.integrationRow.findFirst({
      where: { userId, kind, refId },
    });
    return row === null ? null : { id: row.id, refId: row.refId, data: row.data };
  }

  async upsertRow(
    userId: string,
    kind: string,
    refId: string,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.integrationRow.upsert({
      where: { userId_kind_refId: { userId, kind, refId } },
      create: { userId, kind, refId, data },
      update: { data },
    });
  }

  /** Append-only row - the DB-generated uuid IS the entity id (events/errors). */
  async appendRow(userId: string, kind: string, refId: string, data: Prisma.InputJsonValue): Promise<string> {
    const row = await this.prisma.integrationRow.create({
      data: { userId, kind, refId, data },
    });
    return row.id;
  }

  async deleteRows(userId: string, kind: string, refIds: string[]): Promise<void> {
    if (refIds.length === 0) return;
    await this.prisma.integrationRow.deleteMany({ where: { userId, kind, refId: { in: refIds } } });
  }

  async deleteRowsOlderThan(userId: string, kind: string, cutoff: Date): Promise<void> {
    await this.prisma.integrationRow.deleteMany({
      where: { userId, kind, createdAt: { lt: cutoff } },
    });
  }

  /** Cap a ring (events ≤ 80, errors ≤ 40): delete the oldest beyond `keep`. */
  async pruneRowsBeyondCap(userId: string, kind: string, keep: number): Promise<void> {
    const rows = await this.prisma.integrationRow.findMany({
      where: { userId, kind },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: keep,
      select: { id: true },
    });
    if (rows.length > 0) {
      await this.prisma.integrationRow.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    }
  }

  async hasAnyRow(userId: string, kind: string): Promise<boolean> {
    const count = await this.prisma.integrationRow.count({ where: { userId, kind } });
    return count > 0;
  }
}
