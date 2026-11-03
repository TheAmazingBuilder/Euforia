/**
 * AnalysisPlan persistence (Phase 11) - ownership in every WHERE (IDOR →
 * 404), guarded lifecycle transitions (single-statement UPDATE … WHERE
 * status IN (…)), clientRequestId unique for idempotent creates.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface PlanRow {
  id: string;
  userId: string;
  status: string;
  symbol: string;
  timeframe: string | null;
  title: string;
  thesis: string;
  tradeId: string | null;
  analysisId: string | null;
  invalidationCriteria: string | null;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
  reviewNotes: string | null;
  processTags: unknown;
  reviewedAt: Date | null;
  completedAt: Date | null;
  plannedEntry: Prisma.Decimal | null;
  plannedStop: Prisma.Decimal | null;
  plannedTargets: unknown;
  referenceTimeSec: bigint | null;
  scenarios: unknown;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: {
    status: string;
    symbol: string;
    timeframe: string | null;
    title: string;
    thesis: string;
    tradeId: string | null;
    analysisId: string | null;
    invalidationCriteria: string | null;
    plannedEntry: Prisma.Decimal | null;
    plannedStop: Prisma.Decimal | null;
    plannedTargets: unknown;
    referenceTimeSec: number | null;
    scenarios: unknown;
    clientRequestId: string | null;
  }): Promise<PlanRow> {
    const row = await this.prisma.analysisPlan.create({
      data: {
        userId,
        status: data.status as never,
        symbol: data.symbol,
        timeframe: data.timeframe,
        title: data.title,
        thesis: data.thesis,
        tradeId: data.tradeId,
        analysisId: data.analysisId,
        invalidationCriteria: data.invalidationCriteria,
        plannedEntry: data.plannedEntry,
        plannedStop: data.plannedStop,
        plannedTargets: (data.plannedTargets ?? undefined) as Prisma.InputJsonValue | undefined,
        referenceTimeSec: data.referenceTimeSec,
        scenarios: (data.scenarios ?? undefined) as Prisma.InputJsonValue | undefined,
        clientRequestId: data.clientRequestId,
      },
    });
    return row;
  }

  async findByIdForUser(id: string, userId: string): Promise<PlanRow | null> {
    const row = await this.prisma.analysisPlan.findFirst({ where: { id, userId } });
    return row ?? null;
  }

  async listForUser(userId: string, filters: {
    status?: string;
    symbol?: string;
    tradeId?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: PlanRow[]; total: number }> {
    const where: Prisma.AnalysisPlanWhereInput = {
      userId,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.symbol ? { symbol: filters.symbol } : {}),
      ...(filters.tradeId ? { tradeId: filters.tradeId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.analysisPlan.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.analysisPlan.count({ where }),
    ]);
    return { rows, total };
  }

  async listByTrade(userId: string, tradeId: string): Promise<PlanRow[]> {
    return this.prisma.analysisPlan.findMany({
      where: { userId, tradeId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** Guarded transition - WHERE carries the expected FROM status (§11.3). */
  async transition(id: string, userId: string, from: string[], to: string, extra?: Prisma.AnalysisPlanUpdateManyMutationInput): Promise<PlanRow | null> {
    const result = await this.prisma.analysisPlan.updateMany({
      where: { id, userId, status: { in: from as never[] } },
      data: { status: to as never, ...(extra ?? {}) },
    });
    if (result.count === 0) return null;
    const row = await this.prisma.analysisPlan.findFirst({ where: { id, userId } });
    return row ?? null;
  }

  async patch(id: string, userId: string, data: Prisma.AnalysisPlanUpdateManyMutationInput): Promise<PlanRow | null> {
    const result = await this.prisma.analysisPlan.updateMany({
      where: { id, userId, status: { in: ["DRAFT", "ACTIVE"] } },
      data,
    });
    if (result.count === 0) return null;
    const row = await this.prisma.analysisPlan.findFirst({ where: { id, userId } });
    return row ?? null;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.analysisPlan.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async clientRequestExists(userId: string, clientRequestId: string): Promise<boolean> {
    const row = await this.prisma.analysisPlan.findFirst({
      where: { userId, clientRequestId },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Trade/analysis linkage - FK scalar fields are not part of the updateMany
   * mutation input, so the write goes through the unique-id update AFTER an
   * ownership probe in the same call (probe + write, no cross-user leak).
   */
  async linkTrade(planId: string, userId: string, tradeId: string | null): Promise<PlanRow | null> {
    const owned = await this.prisma.analysisPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true },
    });
    if (owned === null) return null;
    const row = await this.prisma.analysisPlan.update({ where: { id: planId }, data: { tradeId } });
    return row;
  }

  async setAnalysisRef(planId: string, userId: string, analysisId: string | null): Promise<PlanRow | null> {
    const owned = await this.prisma.analysisPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true },
    });
    if (owned === null) return null;
    const row = await this.prisma.analysisPlan.update({ where: { id: planId }, data: { analysisId } });
    return row;
  }

  /** Phase-10 integration - the referenced analysis must be the caller's. */
  async analysisExistsForUser(analysisId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.oryonAnalysis.findFirst({
      where: { id: analysisId, userId },
      select: { id: true },
    });
    return row !== null;
  }
}
