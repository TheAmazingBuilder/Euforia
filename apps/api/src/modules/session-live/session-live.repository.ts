/**
 * Session Live data access (B9) — the ONLY place the context touches
 * Prisma. Rows land in sessionLiveRow with a `kind`
 * (SESSION | ANALYSIS | LEVEL); the row id IS the entity id.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface SessionLiveRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

@Injectable()
export class SessionLiveRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<SessionLiveRow[]> {
    const rows = await this.prisma.sessionLiveRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as SessionLiveRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<SessionLiveRow | null> {
    const row = await this.prisma.sessionLiveRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as SessionLiveRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<SessionLiveRow> {
    const row = await this.prisma.sessionLiveRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as SessionLiveRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.sessionLiveRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.sessionLiveRow.delete({ where: { id } });
  }
}
