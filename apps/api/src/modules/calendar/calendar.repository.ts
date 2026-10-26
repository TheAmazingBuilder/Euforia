/**
 * Calendar data access (B7) - owns the calendarBlockRow table (one row per
 * marked date: planned day OFF or NEWS-blocked trading pause). The `date`
 * column is the lookup key; `data` holds the shared-contract block.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface CalendarBlockData {
  date: string;
  kind: "OFF" | "NEWS";
  note: string;
  createdAt: string;
}

export interface CalendarBlockRow {
  id: string;
  userId: string;
  date: string;
  data: CalendarBlockData;
}

@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBlocks(userId: string): Promise<CalendarBlockRow[]> {
    const rows = await this.prisma.calendarBlockRow.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });
    return rows as unknown as CalendarBlockRow[];
  }

  async findBlockByDate(userId: string, date: string): Promise<CalendarBlockRow | null> {
    const row = await this.prisma.calendarBlockRow.findFirst({
      where: { userId, date },
    });
    return (row as unknown as CalendarBlockRow) ?? null;
  }

  async upsertBlock(
    userId: string,
    date: string,
    data: CalendarBlockData,
  ): Promise<CalendarBlockRow> {
    const existing = await this.findBlockByDate(userId, date);
    if (existing !== null) {
      await this.prisma.calendarBlockRow.update({
        where: { id: existing.id },
        data: { data: data as unknown as Prisma.InputJsonValue },
      });
      return { ...existing, data };
    }
    const row = await this.prisma.calendarBlockRow.create({
      data: { userId, date, data: data as unknown as Prisma.InputJsonValue },
    });
    return row as unknown as CalendarBlockRow;
  }

  async deleteBlock(userId: string, date: string): Promise<void> {
    await this.prisma.calendarBlockRow.deleteMany({ where: { userId, date } });
  }
}
