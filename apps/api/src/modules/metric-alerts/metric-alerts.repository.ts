/**
 * Metric alert rules data access (Dashboard Customization Phase 07) - the
 * ONLY place the metric-alerts context touches Prisma (§46 house pattern).
 * Rows live in the dedicated metricAlertRuleRow table; the shared-contract
 * rule document (including the server-managed evaluation state) lives in
 * `data`. Triggered EVENTS are alert rows owned by the discipline inbox -
 * this repository never writes them (one notification system, spec §2).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface MetricAlertRuleRow {
  id: string;
  userId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MetricAlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string): Promise<MetricAlertRuleRow[]> {
    const rows = await this.prisma.metricAlertRuleRow.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as MetricAlertRuleRow[];
  }

  async findForUser(userId: string, ruleId: string): Promise<MetricAlertRuleRow | null> {
    const row = await this.prisma.metricAlertRuleRow.findFirst({
      where: { userId, id: ruleId },
    });
    return (row as unknown as MetricAlertRuleRow) ?? null;
  }

  /**
   * Insert with the rule document's OWN id - the doc id IS the row id
   * (deterministic event ids and CAS guards key off it; the parse of a
   * stored row must reproduce the same identity).
   */
  async insert(
    userId: string,
    id: string,
    data: Prisma.InputJsonValue,
  ): Promise<MetricAlertRuleRow> {
    const row = await this.prisma.metricAlertRuleRow.create({
      data: { userId, id, data },
    });
    return row as unknown as MetricAlertRuleRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.metricAlertRuleRow.update({ where: { id }, data: { data } });
  }

  async deleteForUser(userId: string, ruleId: string): Promise<void> {
    await this.prisma.metricAlertRuleRow.deleteMany({
      where: { userId, id: ruleId },
    });
  }
}
