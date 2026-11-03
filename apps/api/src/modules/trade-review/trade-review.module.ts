/**
 * Trade Review bounded context (Phase 6) - the post-trade review workflow.
 *
 * Core domain (Phase 0 §I): flat application-service + one-repository +
 * thin-controllers discipline, matching the established contexts.
 *
 * Reuse over reinvention (§5): error taxonomy, ZodValidationPipe, auth guard
 * + principal decorator come from the Foundation / Identity; the canonical
 * Trade is consumed through Trading Core's PUBLIC contract (TradingRepository,
 * read-only) and the origin plan through Trade Planning's public repository -
 * NO second trade/plan/tag/attachment/audit system is created here (§78).
 * Instrument specs come from the Trade Planning catalog port (pip deviations).
 *
 * The THREE-LAYER model (§2/§3) is the context's reason to exist:
 *   TradePlan  → original trading intent   (read, never written)
 *   Trade      → journalized execution     (read, never written)
 *   TradeReview→ post-trade interpretation (owned here)
 *
 * Out of scope forever in this context (§47/§50/§52/§78/§82): analytics
 * aggregation, behavioral diagnosis, goals engine (deferred), playbook
 * logic, academy, session-live, broker connectivity, execution capability,
 * FastAPI workloads.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { IdentityModule } from "../identity/identity.module";
import { TradingModule } from "../trading/trading.module";
import { TradePlanningModule } from "../trade-planning/trade-planning.module";
import { TradeReviewController } from "./trade-review.controller";
import { TradeReviewRepository } from "./trade-review.repository";
import { TradeReviewService } from "./trade-review.service";

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, IdentityModule, TradingModule, TradePlanningModule],
  controllers: [TradeReviewController],
  providers: [TradeReviewRepository, TradeReviewService],
  // Phase 7 (additive): the Playbook context reads review verdicts
  // (playbookMatch) through this public contract for the live compliance
  // read model - read-only, no ownership transfer (Phase 4/6 precedent).
  exports: [TradeReviewRepository],
})
export class TradeReviewModule {}
