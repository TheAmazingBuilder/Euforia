/**
 * Playbook data access (B10) — the ONLY place the playbook context touches
 * Prisma. Rows land in playbookRow with a `kind`
 * (STRATEGY | SETUP | CHECKLIST | RULE | VERSION); the row id IS the
 * entity id (version snapshots get their own uuid).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface PlaybookRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

/**
 * Normalized-generation row shapes per the playbook migration
 * (prisma/migrations/20261003160138_playbook — Strategy, Setup,
 * ChecklistTemplate, PlaybookRule, StrategyVersionSnapshot tables).
 * The wired row-store reads PlaybookRow; these type-only exports exist so
 * the Phase-7 contract mappers type-check against the normalized shapes
 * they were written for. Field types mirror the migration DDL.
 */

/** Strategy row (migration 20261003160138) — markdown bodies + JSONB blocks. */
export interface StrategyRow {
  id: string;
  userId: string;
  status: string;
  name: string;
  description: string | null;
  entryRules: string | null;
  exitRules: string | null;
  riskRules: string | null;
  grade: string | null;
  color: string | null;
  version: number;
  tags: Prisma.JsonValue | null;
  detailedDescription: string | null;
  marketProfile: Prisma.JsonValue | null;
  marketConditions: Prisma.JsonValue | null;
  entryConditions: Prisma.JsonValue | null;
  confirmations: Prisma.JsonValue | null;
  invalidations: Prisma.JsonValue | null;
  risk: Prisma.JsonValue | null;
  tradeManagement: Prisma.JsonValue | null;
  exitPlan: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Setup row (migration 20261003160138). */
export interface SetupRow {
  id: string;
  userId: string;
  strategyId: string;
  name: string;
  status: string;
  description: string | null;
  context: string | null;
  marketCondition: string | null;
  trigger: string | null;
  confirmation: string | null;
  entryModel: string | null;
  stopModel: string | null;
  targetModel: string | null;
  invalidation: string | null;
  notes: string | null;
  tags: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

/** ChecklistTemplate row (migration 20261003160138) — JSONB items payload. */
export interface ChecklistRow {
  id: string;
  userId: string;
  strategyId: string | null;
  name: string;
  items: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

/** PlaybookRule row (migration 20261003160138). */
export interface PlaybookRuleRow {
  id: string;
  userId: string;
  title: string;
  detail: string;
  category: string;
  scope: string;
  strategyId: string | null;
  evaluatable: boolean;
  evaluationHint: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** StrategyVersionSnapshot row (migration 20261003160138) — frozen Strategy JSON. */
export interface StrategySnapshotRow {
  id: string;
  strategyId: string;
  version: number;
  snapshot: Prisma.JsonValue;
  reason: string | null;
  createdAt: Date;
}

@Injectable()
export class PlaybookRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Narrow attribution reads for cross-context consumers (analytics suite,
   * nofy reference resolver): id + display label of every owned row of a
   * kind. The row-store `data` JSON carries the label under the kind's own
   * key (STRATEGY→name, SETUP→name, RULE→title).
   */
  async listStrategies(userId: string): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.listByKind(userId, "STRATEGY");
    return rows.map((row) => {
      const data = (row.data ?? {}) as { name?: unknown };
      return { id: row.id, name: typeof data.name === "string" ? data.name : "(strategy)" };
    });
  }

  async listSetups(userId: string): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.listByKind(userId, "SETUP");
    return rows.map((row) => {
      const data = (row.data ?? {}) as { name?: unknown };
      return { id: row.id, name: typeof data.name === "string" ? data.name : "(setup)" };
    });
  }

  async listRules(userId: string): Promise<Array<{ id: string; title: string }>> {
    const rows = await this.listByKind(userId, "RULE");
    return rows.map((row) => {
      const data = (row.data ?? {}) as { title?: unknown };
      return { id: row.id, title: typeof data.title === "string" ? data.title : "(rule)" };
    });
  }

  async listByKind(userId: string, kind: string): Promise<PlaybookRow[]> {
    const rows = await this.prisma.playbookRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as PlaybookRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<PlaybookRow | null> {
    const row = await this.prisma.playbookRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as PlaybookRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<PlaybookRow> {
    const row = await this.prisma.playbookRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as PlaybookRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.playbookRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.playbookRow.delete({ where: { id } });
  }

  async deleteByDataField(userId: string, kind: string, field: string, value: string): Promise<void> {
    // Json-path filtering is Postgres-specific; the dev scale is small —
    // filter in JS for honest cross-engine behavior.
    const rows = await this.listByKind(userId, kind);
    for (const row of rows) {
      if ((row.data as Record<string, unknown>)[field] === value) {
        await this.deleteRow(row.id);
      }
    }
  }
}
