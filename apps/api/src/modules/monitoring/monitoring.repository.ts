/**
 * Monitoring data access (infrastructure, Phase 17) — the ONLY place the
 * Monitoring context touches Prisma (§46).
 *
 * Persistence is deliberately MINIMAL (§40/§45): the single persisted entity
 * is the per-user MonitoringSetting (thresholds the user explicitly tuned).
 * Entity counts are computed per request from the owning tables (scoped to
 * the caller — §34) and never stored.
 */
import { Injectable } from "@nestjs/common";
import type { MonitoringThresholds } from "../../shared/contracts";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

/** User-scoped row counts — the caller's OWN data, never platform-wide. */
export interface EntityCount {
  label: string;
  count: number;
}

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

  /**
   * Row counts for the caller's own observable entities (§10/§34). The
   * labels name the backend's REAL tables — the frontend renders them
   * verbatim, so this list can grow with the data model honestly.
   */
  async countUserEntities(userId: string): Promise<EntityCount[]> {
    const [
      sessions,
      securityEvents,
      loginRecords,
      apiKeys,
      tradingAccounts,
      positions,
      orders,
      deals,
      syncRuns,
    ] = await Promise.all([
      this.prisma.session.count({ where: { userId } }),
      this.prisma.securityEvent.count({ where: { userId } }),
      this.prisma.loginRecord.count({ where: { userId } }),
      this.prisma.apiKey.count({ where: { userId } }),
      this.prisma.tradingAccount.count({ where: { userId } }),
      this.prisma.tradingPosition.count({ where: { account: { userId } } }),
      this.prisma.tradingOrder.count({ where: { account: { userId } } }),
      this.prisma.tradingDeal.count({ where: { account: { userId } } }),
      this.prisma.tradingSyncRun.count({ where: { account: { userId } } }),
    ]);
    return [
      { label: "Sessions", count: sessions },
      { label: "Security events", count: securityEvents },
      { label: "Login records", count: loginRecords },
      { label: "API keys", count: apiKeys },
      { label: "Trading accounts", count: tradingAccounts },
      { label: "Positions", count: positions },
      { label: "Orders", count: orders },
      { label: "Deals", count: deals },
      { label: "Sync runs", count: syncRuns },
    ];
  }
}
