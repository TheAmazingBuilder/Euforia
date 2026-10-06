/**
 * Playbook data access (B10) — the ONLY place the playbook context touches
 * Prisma. Rows land in playbookRow with a `kind`
 * (STRATEGY | SETUP | CHECKLIST | RULE | VERSION); the row id IS the
 * entity id (version snapshots get their own uuid).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface PlaybookRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

@Injectable()
export class PlaybookRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<PlaybookRow[]> {
    const rows = await this.prisma.playbookRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as PlaybookRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<PlaybookRow | null> {
    const row = await this.prisma.playbookRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as PlaybookRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<PlaybookRow> {
    const row = await this.prisma.playbookRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as PlaybookRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.playbookRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.playbookRow.delete({ where: { id } });
  }

  async deleteByDataField(userId: string, kind: string, field: string, value: string): Promise<void> {
    // Json-path filtering is Postgres-specific; the dev scale is small —
    // filter in JS for honest cross-engine behavior.
    const rows = await this.listByKind(userId, kind);
    for (const row of rows) {
      if ((row.data as Record<string, unknown>)[field] === value) {
        await this.deleteRow(row.id);
      }
    }
  }
}
