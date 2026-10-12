/**
 * Trade Review bounded context (B8) — the post-trade review workflow fused
 * with Goal setting. Reviews are one per trade (upsert) and sync the
 * trade's written trace; progress is always computed server-side from real
 * behavior (never self-entered).
 *
 * Dependency graph (acyclic):
 *   ReviewModule → ReviewRepository (own Prisma boundary — REVIEW|GOAL rows)
 *                → TradesModule (journal facts + review trace sync)
 *                → DisciplineModule (DISCIPLINE_SCORE metric facts)
 *                → AccountsModule (currency for MONEY-unit metrics)
 *                → IdentityModule (user timezone for period keys)
 *
 * Security: routes are all authenticated (global guard), ownership is
 * enforced per use case from the auth principal (§23/§24/§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { DisciplineModule } from "../discipline/discipline.module";
import { IdentityModule } from "../identity/identity.module";
import { TradesModule } from "../trades/trades.module";
import { GoalsController } from "./review.controller";
import { ReviewRepository } from "./review.repository";
import { GoalService } from "./goal.service";
import { ReviewService } from "./review.service";

@Module({
  imports: [PrismaModule, TradesModule, DisciplineModule, AccountsModule, IdentityModule],
  controllers: [GoalsController],
  providers: [ReviewRepository, GoalService, ReviewService],
  // NOTE: the legacy ReviewsController (this module) is intentionally
  // unwired — the Phase-6 TradeReviewModule owns the /reviews routes now
  // (one route owner per path). Goals stay served here (ReviewRow gen).
  // Narrow contract: Playbook compliance reads review playbookMatch rows
  // from the owning context (§26).
  exports: [ReviewRepository],
})
export class ReviewModule {}
