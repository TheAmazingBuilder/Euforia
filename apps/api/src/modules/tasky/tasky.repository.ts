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

  async listAutomations(userId: string) {
    return this.prisma.taskyAutomationRule.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async findAutomation(userId: string, id: string) {
    return this.prisma.taskyAutomationRule.findFirst({ where: { id, userId } });
  }

  async createAutomation(
    userId: string,
    input: { name: string; trigger: string; enabled: boolean; config: unknown },
  ) {
    return this.prisma.taskyAutomationRule.create({
      data: {
        userId,
        name: input.name,
        trigger: input.trigger,
        enabled: input.enabled,
        config: input.config as Prisma.InputJsonValue,
      },
    });
  }

  async updateAutomation(
    userId: string,
    id: string,
    input: { name?: string; trigger?: string; enabled?: boolean; config?: unknown },
  ) {
    const result = await this.prisma.taskyAutomationRule.updateMany({
      where: { id, userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
      },
    });
    if (result.count !== 1) return null;
    return this.prisma.taskyAutomationRule.findFirst({ where: { id, userId } });
  }

  async deleteAutomation(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.taskyAutomationRule.deleteMany({ where: { id, userId } });
    return result.count === 1;
  }

  async listEnabledAutomationsForScheduler() {
    return this.prisma.taskyAutomationRule.findMany({
      where: { enabled: true, trigger: { in: ["DUE_SOON", "OVERDUE"] } },
      include: { user: { select: { timezone: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async createAutomationRun(input: {
    userId: string;
    automationId?: string | null;
    automationName: string;
    trigger: string;
    cardId?: string | null;
    cardTitle?: string | null;
    status: string;
    message: string;
    error?: string | null;
    dedupeKey?: string | null;
  }) {
    return this.prisma.taskyAutomationRun.create({
      data: {
        userId: input.userId,
        automationId: input.automationId ?? null,
        automationName: input.automationName,
        trigger: input.trigger,
        cardId: input.cardId ?? null,
        cardTitle: input.cardTitle ?? null,
        status: input.status,
        message: input.message,
        error: input.error ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  }

  async findAutomationRunByDedupeKey(dedupeKey: string) {
    return this.prisma.taskyAutomationRun.findUnique({ where: { dedupeKey } });
  }

  async updateAutomationRun(
    id: string,
    input: { status?: string; message?: string; error?: string | null },
  ) {
    return this.prisma.taskyAutomationRun.update({
      where: { id },
      data: input,
    });
  }

  async listAutomationRuns(userId: string, limit = 50) {
    return this.prisma.taskyAutomationRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone ?? "UTC";
  }
}
