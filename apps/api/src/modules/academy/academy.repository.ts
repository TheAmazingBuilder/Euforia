/**
 * Academy data access (B12) — the ONLY place the academy context touches
 * Prisma. Rows land in academyRow with a `kind` (STATE | TASK | EVENT_REG):
 * STATE is the per-user learning state blob (lesson completions, quiz
 * attempts, SRS flashcard boxes, practice ledger…), TASK/EVENT_REG rows
 * are per-entity. The row id IS the entity id for TASK/EVENT_REG.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface AcademyRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

@Injectable()
export class AcademyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<AcademyRow[]> {
    const rows = await this.prisma.academyRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as AcademyRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<AcademyRow | null> {
    const row = await this.prisma.academyRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as AcademyRow) ?? null;
  }

  async findOneByKind(userId: string, kind: string): Promise<AcademyRow | null> {
    const row = await this.prisma.academyRow.findFirst({
      where: { userId, kind },
    });
    return (row as unknown as AcademyRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<AcademyRow> {
    const row = await this.prisma.academyRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as AcademyRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.academyRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.academyRow.delete({ where: { id } });
  }
}
