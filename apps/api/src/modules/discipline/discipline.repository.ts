/**
 * Discipline data access (B4) — the ONLY place the discipline context
 * touches Prisma (§46 house pattern). Rows land in the shared
 * disciplineRow table with a context `kind` (RULE | VIOLATION | ALERT);
 * the business aggregate lives in `data` (shared-contract JSON).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface DisciplineRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

@Injectable()
export class DisciplineRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── rules ─────────────────────────────────────────────────────────────────

  async listRules(userId: string): Promise<DisciplineRow[]> {
    const rows = await this.prisma.disciplineRow.findMany({
      where: { userId, kind: "RULE" },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as DisciplineRow[];
  }

  async findRuleForUser(userId: string, ruleId: string): Promise<DisciplineRow | null> {
    const row = await this.prisma.disciplineRow.findFirst({
      where: { userId, kind: "RULE", id: ruleId },
    });
    return (row as unknown as DisciplineRow) ?? null;
  }

  async insertRule(userId: string, data: Prisma.InputJsonValue): Promise<DisciplineRow> {
    const row = await this.prisma.disciplineRow.create({
      data: { userId, kind: "RULE", data },
    });
    return row as unknown as DisciplineRow;
  }

  async updateRowData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.disciplineRow.update({ where: { id }, data: { data } });
  }

  async deleteRule(userId: string, ruleId: string): Promise<void> {
    await this.prisma.disciplineRow.deleteMany({
      where: { userId, kind: "RULE", id: ruleId },
    });
  }

  // ── violations + alerts ───────────────────────────────────────────────────

  async listByKind(userId: string, kind: string): Promise<DisciplineRow[]> {
    const rows = await this.prisma.disciplineRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as DisciplineRow[];
  }

  async findRowForUser(userId: string, kind: string, rowId: string): Promise<DisciplineRow | null> {
    const row = await this.prisma.disciplineRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as DisciplineRow) ?? null;
  }

  async insertRow(
    userId: string,
    kind: string,
    data: Prisma.InputJsonValue,
  ): Promise<DisciplineRow> {
    const row = await this.prisma.disciplineRow.create({
      data: { userId, kind, data },
    });
    return row as unknown as DisciplineRow;
  }

  /**
   * Insert with a caller-supplied deterministic id — the idempotency
   * mechanism for producer domains that derive event ids (uuid-v5) from
   * stable trigger keys: a replayed publish hits the primary key and is a
   * no-op at the caller's discretion (P2002).
   */
  async insertRowWithId(
    userId: string,
    kind: string,
    id: string,
    data: Prisma.InputJsonValue,
  ): Promise<DisciplineRow> {
    const row = await this.prisma.disciplineRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as DisciplineRow;
  }
}
