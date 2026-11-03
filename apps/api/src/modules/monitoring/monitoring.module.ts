/**
 * Monitoring bounded context (Phase 17) - thin operational observability:
 * health, metrics, jobs, providers, errors (§2/§3).
 *
 * What Monitoring is NOT (§1/§57): not a second Security system (security
 * events stay owned by Security, Phase 16), not a second logging system
 * (pino structured logging from Phase 1 remains the one logger), not a
 * metrics platform (bounded in-memory rings, nothing persisted), not an
 * analytics engine (trading metrics belong to Analytics).
 *
 * Dependency graph (acyclic):
 *   MonitoringModule → MonitoringRepository (own Prisma boundary)
 *                    → AccountsModule (AccountsRepository - canonical sync
 *                      health + owned-entity counts, §26 "consume, never
 *                      duplicate"; Phase 20 §39)
 *                    → IdentityModule (MailerService delivery telemetry +
 *                      IdentityRepository owned-entity counts)
 *                    → SecurityEventModule (SecurityEventRepository - the
 *                      ledger/login-record counts stay owned by Security,
 *                      Phase 20 §39)
 *   Shared infrastructure: apiTelemetry ring (app.setup.ts hook), global
 *   JwtAuthGuard + ThrottlerGuard.
 */
import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityEventModule } from "../security/security-event.module";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringRepository } from "./monitoring.repository";
import { MonitoringService } from "./monitoring.service";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";

@Module({
  imports: [PrismaModule, AccountsModule, IdentityModule, SecurityEventModule],
  controllers: [MonitoringController],
  providers: [MonitoringRepository, MonitoringService],
})
export class MonitoringModule {}
