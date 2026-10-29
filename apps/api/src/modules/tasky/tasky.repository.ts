import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { TaskyKanbanBoardState } from "../../shared/contracts";

/** Narrow persistence boundary for the one personal Kanban board per user. */
export interface TaskyBoardRecord {
  data: Prisma.JsonValue;
  updatedAt: Date;
}

@Injectable()
export class TaskyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<TaskyBoardRecord | null> {
    const row = await this.prisma.taskyBoard.findUnique({ where: { userId } });
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  }

  async saveForUser(userId: string, board: TaskyKanbanBoardState): Promise<TaskyBoardRecord> {
    const data = board as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.taskyBoard.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
    return { data: row.data, updatedAt: row.updatedAt };
  }
}
