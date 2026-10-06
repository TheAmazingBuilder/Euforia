/**
 * Nofy data access (B11) — the ONLY place the nofy context touches Prisma.
 * Rows land in nofyRow with a `kind` (NOTE | FOLDER | TAG | TEMPLATE |
 * VERSION); the row id IS the entity id (version snapshots get their own
 * uuid). Aggregate state (blocks, tagIds, …) lives in the shared-contract
 * JSON under `data`, exactly like every bounded context of the module
 * upgrade.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface NofyRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

@Injectable()
export class NofyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<NofyRow[]> {
    const rows = await this.prisma.nofyRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as NofyRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<NofyRow | null> {
    const row = await this.prisma.nofyRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as NofyRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<NofyRow> {
    const row = await this.prisma.nofyRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as NofyRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.nofyRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.nofyRow.delete({ where: { id } });
  }
}
