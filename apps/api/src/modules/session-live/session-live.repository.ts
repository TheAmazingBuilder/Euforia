/**
 * Session Live data access (B9) - the ONLY place the context touches
 * Prisma. Rows land in sessionLiveRow with a `kind`
 * (SESSION | ANALYSIS | LEVEL); the row id IS the entity id.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface SessionLiveRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

/**
 * Normalized-generation row shapes per the session_live migration
 * (prisma/migrations/20261003180600_session_live - TradingSession,
 * TradingSessionEvent, SavedAnalysis, KeyLevel, SessionNote tables).
 * The wired row-store reads SessionLiveRow; these type-only exports exist
 * so the Phase-7 contract mappers type-check against the normalized shapes
 * they were written for. Field types mirror the migration DDL.
 */

/** TradingSession row (migration 20261003180600). */
export interface TradingSessionRow {
  id: string;
  userId: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  primarySymbol: string;
  primaryTimeframe: string;
  tradingWindow: string;
  strategyId: string | null;
  setupId: string | null;
  marketBias: string;
  sessionObjective: string | null;
  notes: string | null;
  riskPerTradePct: Prisma.Decimal | null;
  dailyRiskLimitPct: Prisma.Decimal | null;
  /** Aggregated child rows (TradingSessionEvent) - repository include, not a column. */
  events: TradingSessionEventRow[];
  createdAt: Date;
  updatedAt: Date;
}

/** TradingSessionEvent row (migration 20261003180600). */
export interface TradingSessionEventRow {
  id: string;
  sessionId: string;
  at: Date;
  kind: string;
  label: string;
  detail: string | null;
  source: string | null;
}

/** SavedAnalysis row (migration 20261003180600) - JSONB chart state columns. */
export interface SavedAnalysisRow {
  id: string;
  userId: string;
  sessionId: string | null;
  symbol: string;
  timeframe: string;
  createdAt: Date;
  priceAtSave: Prisma.Decimal | null;
  bias: string;
  bullishScenario: string | null;
  bearishScenario: string | null;
  strategyId: string | null;
  setupId: string | null;
  notes: string | null;
  indicators: Prisma.JsonValue;
  drawings: Prisma.JsonValue;
  levels: Prisma.JsonValue;
}

/** KeyLevel row (migration 20261003180600). */
export interface KeyLevelRow {
  id: string;
  userId: string;
  symbol: string;
  kind: string;
  price: Prisma.Decimal;
  note: string | null;
  createdAt: Date;
}

/** SessionNote row (migration 20261003180600). */
export interface SessionNoteRow {
  id: string;
  userId: string;
  date: Date;
  at: Date;
  text: string;
  createdAt: Date;
}

@Injectable()
export class SessionLiveRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<SessionLiveRow[]> {
    const rows = await this.prisma.sessionLiveRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as SessionLiveRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<SessionLiveRow | null> {
    const row = await this.prisma.sessionLiveRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as SessionLiveRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<SessionLiveRow> {
    const row = await this.prisma.sessionLiveRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as SessionLiveRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.sessionLiveRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.sessionLiveRow.delete({ where: { id } });
  }
}
