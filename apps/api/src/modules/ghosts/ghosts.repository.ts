/**
 * Ghost Trades data access (B6) — the ONLY place the ghosts context touches
 * Prisma (§46 house pattern). Narrow row projections out, nothing else.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { SkippedTrade } from "../../shared/contracts";

export interface SkippedTradeRow {
  id: string;
  userId: string;
  data: SkippedTradeData;
}

export interface SkippedTradeData {
  instrumentId: string;
  strategyId: string | null;
  direction: string | null;
  seenAt: string;
  reason: string;
  outcomeGuess: string | null;
  hypotheticalR: string | null;
  notes: string | null;
  createdAt: string;
}

@Injectable()
export class GhostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRows(userId: string): Promise<SkippedTradeRow[]> {
    const rows = await this.prisma.skippedTradeRow.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as SkippedTradeRow[];
  }

  async findRowForUser(skippedId: string, userId: string): Promise<SkippedTradeRow | null> {
    const row = await this.prisma.skippedTradeRow.findFirst({
      where: { id: skippedId, userId },
    });
    return (row as unknown as SkippedTradeRow) ?? null;
  }

  async insertRow(userId: string, data: Prisma.InputJsonValue): Promise<SkippedTradeRow> {
    const row = await this.prisma.skippedTradeRow.create({ data: { userId, data } });
    return row as unknown as SkippedTradeRow;
  }

  async updateRowData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.skippedTradeRow.update({ where: { id }, data: { data } });
  }

  /** Row → shared SkippedTrade contract (the row id IS the ghost id). */
  toView(row: SkippedTradeRow): SkippedTrade {
    return {
      id: row.id,
      userId: row.userId,
      instrumentId: row.data.instrumentId,
      strategyId: row.data.strategyId,
      direction: (row.data.direction ?? null) as SkippedTrade["direction"],
      seenAt: row.data.seenAt,
      reason: row.data.reason as SkippedTrade["reason"],
      outcomeGuess: (row.data.outcomeGuess ?? null) as SkippedTrade["outcomeGuess"],
      hypotheticalR: row.data.hypotheticalR,
      notes: row.data.notes,
      createdAt: row.data.createdAt,
    };
  }
}
