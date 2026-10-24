/**
 * Performance snapshots bounded context (Dashboard Customization Phase 08)
 * - point-in-time captures of the analytics-suite summary for a named
 * scope + period, with comparison done client-side from the pure shared
 * engine (comparePerformanceSnapshots).
 *
 * Dependency graph (acyclic):
 *   SnapshotsModule → SnapshotsRepository (own Prisma boundary -
 *                     performanceSnapshotRow)
 *                   → AnalyticsModule (the authoritative suite - this
 *                     module computes NO financial math, spec §2)
 *                   → AccountsModule / PlaybookModule (scope-reference
 *                     validation on write, spec §11)
 *
 * Security: routes are all authenticated (global guard), ownership is
 * enforced per use case from the auth principal (§23/§24/§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { SnapshotsController } from "./snapshots.controller";
import { SnapshotsRepository } from "./snapshots.repository";
import { SnapshotsService } from "./snapshots.service";

@Module({
  imports: [PrismaModule, AnalyticsModule, AccountsModule, PlaybookModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsRepository, SnapshotsService],
})
export class SnapshotsModule {}
