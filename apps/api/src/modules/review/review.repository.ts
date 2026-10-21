/**
 * Review context data access (B8) — the ONLY place the review context
 * touches Prisma. Rows land in the shared reviewRow table with a context
 * `kind` (REVIEW | GOAL); reviews additionally carry tradeId.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface ReviewTableRow {
  id: string;
  userId: string;
  kind: string;
  tradeId: string | null;
  data: Record<string, unknown>;
}

@Injectable()
export class ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<ReviewTableRow[]> {
    const rows = await this.prisma.reviewRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as ReviewTableRow[];
  }

  async listReviewsForUser(userId: string): Promise<ReviewTableRow[]> {
    return this.listByKind(userId, "REVIEW");
  }

  async findReviewByTrade(userId: string, tradeId: string): Promise<ReviewTableRow | null> {
    const rows = await this.listByKind(userId, "REVIEW");
    return rows.find((row) => row.tradeId === tradeId) ?? null;
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<ReviewTableRow | null> {
    const row = await this.prisma.reviewRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as ReviewTableRow) ?? null;
  }

  async insertReview(
    userId: string,
    tradeId: string,
    data: Prisma.InputJsonValue,
  ): Promise<ReviewTableRow> {
    const row = await this.prisma.reviewRow.create({
      data: { userId, kind: "REVIEW", tradeId, data },
    });
    return row as unknown as ReviewTableRow;
  }

  async insertGoal(userId: string, id: string, data: Prisma.InputJsonValue): Promise<ReviewTableRow> {
    // The row id IS the goal id — PATCH/DELETE address the entity directly.
    const row = await this.prisma.reviewRow.create({
      data: { id, userId, kind: "GOAL", data },
    });
    return row as unknown as ReviewTableRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.reviewRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.reviewRow.delete({ where: { id } });
  }
}
