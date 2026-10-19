/**
 * Performance snapshots data access (Dashboard Customization Phase 08) —
 * the ONLY place the snapshots context touches Prisma (§46 house pattern).
 * Rows live in the dedicated performanceSnapshotRow table; the
 * shared-contract snapshot document (performanceSnapshotSchema, frozen
 * captured values) lives in `data`. `nameKey` (lowercased name) backs the
 * per-user case-insensitive unique-name product rule at the storage level.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface PerformanceSnapshotRow {
  id: string;
  userId: string;
  data: Record<string, unknown>;
  nameKey: string;
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first — snapshots are a history view (§9). */
  async listByUser(userId: string, limit = 200): Promise<PerformanceSnapshotRow[]> {
    const rows = await this.prisma.performanceSnapshotRow.findMany({
      where: { userId },
      orderBy: { capturedAt: "desc" },
      take: limit,
    });
    return rows as unknown as PerformanceSnapshotRow[];
  }

  /** Ownership-scoped read (IDOR battery covers cross-user 404s). */
  async findForUser(userId: string, snapshotId: string): Promise<PerformanceSnapshotRow | null> {
    const row = await this.prisma.performanceSnapshotRow.findFirst({
      where: { userId, id: snapshotId },
    });
    return (row as unknown as PerformanceSnapshotRow) ?? null;
  }

  async insert(
    userId: string,
    id: string,
    nameKey: string,
    capturedAt: Date,
    data: Prisma.InputJsonValue,
  ): Promise<PerformanceSnapshotRow> {
    const row = await this.prisma.performanceSnapshotRow.create({
      data: { id, userId, nameKey, capturedAt, data },
    });
    return row as unknown as PerformanceSnapshotRow;
  }

  /**
   * Metadata-only merge inside `data` — the repository never receives a
   * metrics/scope/period patch (the service builds the merged document from
   * the parsed stored one; the update input schema has no metric field).
   * Returns null when the row vanished / is not owned by the user.
   */
  async updateData(
    userId: string,
    snapshotId: string,
    nameKey: string | null,
    data: Prisma.InputJsonValue,
  ): Promise<PerformanceSnapshotRow | null> {
    const row = await this.prisma.performanceSnapshotRow.updateMany({
      where: { userId, id: snapshotId },
      data: {
        data: data as Prisma.InputJsonValue,
        ...(nameKey !== null ? { nameKey } : {}),
      },
    });
    if (row.count === 0) return null;
    return this.findForUser(userId, snapshotId);
  }

  async deleteForUser(userId: string, snapshotId: string): Promise<boolean> {
    const result = await this.prisma.performanceSnapshotRow.deleteMany({
      where: { userId, id: snapshotId },
    });
    return result.count > 0;
  }
}
