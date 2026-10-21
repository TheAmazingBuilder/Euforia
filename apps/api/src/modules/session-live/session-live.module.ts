/**
 * Session Live bounded context (B9) — trading-session lifecycle, saved
 * analyses and key levels. READ-ONLY relative to any broker: NO
 * order/execution path exists anywhere in this module (§2/§50).
 *
 * Dependency graph (acyclic):
 *   SessionLiveModule → SessionLiveRepository (own Prisma boundary —
 *                       SESSION | ANALYSIS | LEVEL rows)
 *                     → TradesModule (journal facts for the end summary)
 *                     → DisciplineModule (violation rows in window)
 *                     → SessionModule (logbook notes count in window)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { DisciplineModule } from "../discipline/discipline.module";
import { SessionModule } from "../session/session.module";
import { TradesModule } from "../trades/trades.module";
import {
  SessionLiveAnalysesController,
  SessionLiveLevelsController,
  SessionLiveSessionsController,
} from "./session-live.controller";
import { SessionLiveRepository } from "./session-live.repository";
import { SessionLiveService } from "./session-live.service";

@Module({
  imports: [PrismaModule, TradesModule, DisciplineModule, SessionModule],
  controllers: [SessionLiveSessionsController, SessionLiveAnalysesController, SessionLiveLevelsController],
  providers: [SessionLiveRepository, SessionLiveService],
})
export class SessionLiveModule {}
