/**
 * Oryon analysis persistence (Phase 10 → serveur) — the multi-device store.
 *
 * The analysis payload (analysis/drawings/snapshot JSONB) is IMMUTABLE after
 * save: a re-save creates a new record (the wire contract's PATCH surface is
 * metadata-only — title/notes/link). Ownership in every WHERE (IDOR → 404).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface OryonAnalysisRow {
  id: string;
  userId: string;
  symbol: string;
  interval: string;
  chartType: string;
  title: string;
  notes: string | null;
  tradeId: string | null;
  snapshot: unknown;
  analysis: unknown;
  drawings: unknown;
  /** Prisma BigInt column → converted to number at the wire boundary. */
  referenceTimeSec: bigint | null;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const LIST_LIMIT = 200;

@Injectable()
export class OryonAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: {
    symbol: string;
    interval: string;
    chartType: string;
    title: string;
    notes: string | null;
    tradeId: string | null;
    snapshot: unknown;
    analysis: unknown;
    drawings: unknown;
    referenceTimeSec: bigint | null;
  }): Promise<OryonAnalysisRow> {
    const row = await this.prisma.oryonAnalysis.create({
      data: {
        userId,
        symbol: data.symbol,
        interval: data.interval,
        chartType: data.chartType,
        title: data.title,
        notes: data.notes,
        tradeId: data.tradeId,
        snapshot: (data.snapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        analysis: data.analysis as Prisma.InputJsonValue,
        drawings: data.drawings as Prisma.InputJsonValue,
        referenceTimeSec: data.referenceTimeSec,
      },
    });
    return row;
  }

  async findByIdForUser(id: string, userId: string): Promise<OryonAnalysisRow | null> {
    const row = await this.prisma.oryonAnalysis.findFirst({ where: { id, userId } });
    return row ?? null;
  }

  async listForUser(userId: string): Promise<OryonAnalysisRow[]> {
    return this.prisma.oryonAnalysis.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  async patchMetadata(id: string, userId: string, patch: {
    title?: string;
    notes?: string | null;
    tradeId?: string | null;
  }): Promise<OryonAnalysisRow | null> {
    const row = await this.prisma.oryonAnalysis.updateMany({
      where: { id, userId },
      data: patch,
    });
    if (row.count === 0) return null;
    const updated = await this.prisma.oryonAnalysis.findFirst({ where: { id, userId } });
    return updated ?? null;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.oryonAnalysis.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async existsForUser(id: string, userId: string): Promise<boolean> {
    const row = await this.prisma.oryonAnalysis.findFirst({ where: { id, userId }, select: { id: true } });
    return row !== null;
  }
}
