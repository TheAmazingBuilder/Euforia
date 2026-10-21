/**
 * Replay data access — the ONLY place the replay context touches Prisma.
 * Rows land in replayRow with a `kind` (SESSION | TRADE | DECISION | NOTE);
 * the row id IS the entity id (same Row pattern as SessionLiveRow).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface ReplayRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

export const REPLAY_KINDS = {
  SESSION: "SESSION",
  TRADE: "TRADE",
  DECISION: "DECISION",
  NOTE: "NOTE",
} as const;

@Injectable()
export class ReplayRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<ReplayRow[]> {
    const rows = await this.prisma.replayRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as ReplayRow[];
  }

  async listByKindDesc(userId: string, kind: string): Promise<ReplayRow[]> {
    const rows = await this.prisma.replayRow.findMany({
      where: { userId, kind },
      orderBy: { updatedAt: "desc" },
    });
    return rows as unknown as ReplayRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<ReplayRow | null> {
    const row = await this.prisma.replayRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as ReplayRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<ReplayRow> {
    const row = await this.prisma.replayRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as ReplayRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.replayRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.replayRow.delete({ where: { id } });
  }

  /** Instrument specs for simulated-trade risk math (symbol is unique). */
  async findInstrumentSpecs(symbol: string): Promise<{ contractSize: string; pipSize: string; digits: number } | null> {
    const instrument = await this.prisma.instrument.findFirst({
      where: { symbol, isActive: true },
      select: { contractSize: true, pipSize: true, digits: true },
    });
    if (!instrument) return null;
    return {
      contractSize: instrument.contractSize.toString(),
      pipSize: instrument.pipSize.toString(),
      digits: instrument.digits,
    };
  }
}
