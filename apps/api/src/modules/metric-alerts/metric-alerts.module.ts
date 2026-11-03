/**
 * Metric alerts bounded context (Dashboard Customization Phase 07) -
 * user-defined threshold monitoring over the analytics-suite summary and
 * the goal engine, with triggered events delivered through the EXISTING
 * discipline alert inbox (type METRIC_THRESHOLD - one notification system,
 * spec §2).
 *
 * Dependency graph (acyclic):
 *   MetricAlertsModule → MetricAlertRepository (own Prisma boundary -
 *                        metricAlertRuleRow)
 *                      → AnalyticsModule (the authoritative suite - the
 *                        alert engine computes no financial math)
 *                      → ReviewModule (GoalService - the only goal-status
 *                        authority, spec §10)
 *                      → DisciplineModule (inbox publish + event reads -
 *                        the alert-row owner, §26)
 *                      → AccountsModule / PlaybookModule (scope-reference
 *                        validation on write)
 *   Rule evaluation subscribes to the `trade.closed` domain event -
 *   Trades never imports this module (no cycle).
 *
 * Security: routes are all authenticated (global guard), ownership is
 * enforced per use case from the auth principal (§23/§24/§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { DisciplineModule } from "../discipline/discipline.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { ReviewModule } from "../review/review.module";
import { MetricAlertsController } from "./metric-alerts.controller";
import { MetricAlertRepository } from "./metric-alerts.repository";
import { MetricAlertsService } from "./metric-alerts.service";

@Module({
  imports: [
    PrismaModule,
    AnalyticsModule,
    ReviewModule,
    DisciplineModule,
    AccountsModule,
    PlaybookModule,
  ],
  controllers: [MetricAlertsController],
  providers: [MetricAlertRepository, MetricAlertsService],
})
export class MetricAlertsModule {}
