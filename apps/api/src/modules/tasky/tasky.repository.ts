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

  async listSavedViews(userId: string) {
    return this.prisma.taskySavedView.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async countSavedViews(userId: string): Promise<number> {
    return this.prisma.taskySavedView.count({ where: { userId } });
  }

  async findSavedViewByName(userId: string, name: string) {
    return this.prisma.taskySavedView.findUnique({
      where: { userId_name: { userId, name } },
    });
  }

  async createSavedView(userId: string, name: string, filters: unknown) {
    return this.prisma.taskySavedView.create({
      data: { userId, name, filters: filters as Prisma.InputJsonValue },
    });
  }

  async deleteSavedView(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.taskySavedView.deleteMany({ where: { userId, id } });
    return result.count === 1;
  }
}
