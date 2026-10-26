/**
 * Session data access (B5) - owns the sessionNoteRow table; every other
 * timeline fact comes from the owning contexts' narrow contracts.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface SessionNoteRow {
  id: string;
  userId: string;
  data: { date: string; at: string; text: string };
}

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listNoteRows(userId: string): Promise<SessionNoteRow[]> {
    const rows = await this.prisma.sessionNoteRow.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as SessionNoteRow[];
  }

  async findNoteForUser(userId: string, noteId: string): Promise<SessionNoteRow | null> {
    const row = await this.prisma.sessionNoteRow.findFirst({
      where: { userId, id: noteId },
    });
    return (row as unknown as SessionNoteRow) ?? null;
  }

  async insertNote(userId: string, data: Prisma.InputJsonValue): Promise<SessionNoteRow> {
    const row = await this.prisma.sessionNoteRow.create({ data: { userId, data } });
    return row as unknown as SessionNoteRow;
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    await this.prisma.sessionNoteRow.deleteMany({ where: { userId, id: noteId } });
  }
}
