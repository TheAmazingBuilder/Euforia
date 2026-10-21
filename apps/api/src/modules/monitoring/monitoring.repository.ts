/**
 * Monitoring data access (infrastructure, Phase 17) — the ONLY place the
 * Monitoring context touches Prisma (§46).
 *
 * Persistence is deliberately MINIMAL (§40/§45): the single persisted entity
 * is the per-user MonitoringSetting (thresholds the user explicitly tuned).
 *
 * Phase 20 (§39 — no Prisma leakage across bounded contexts): this repository
 * touches ONLY the monitoringSetting table. Counts of observable entities are
 * consumed from the OWNING contexts' narrow contracts — IdentityRepository,
 * AccountsRepository and SecurityEventRepository each expose countUserEntities
 * over their own tables — and Monitoring composes the presentation labels.
 */
import { Injectable } from "@nestjs/common";
import type { MonitoringThresholds } from "../../shared/contracts";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class MonitoringRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<boolean> {
    return this.prisma.ping();
  }

  async getThresholds(userId: string): Promise<MonitoringThresholds | null> {
    const row = await this.prisma.monitoringSetting.findUnique({ where: { userId } });
    return row ? (row.data as MonitoringThresholds) : null;
  }

  async saveThresholds(userId: string, thresholds: MonitoringThresholds): Promise<void> {
    await this.prisma.monitoringSetting.upsert({
      where: { userId },
      create: { userId, data: thresholds },
      update: { data: thresholds },
    });
  }
}
