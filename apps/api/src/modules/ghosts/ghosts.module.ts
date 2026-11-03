/**
 * Ghost Trades bounded context (B6 - data-model.md "Domaine 5", the
 * "Registre des Regrets"): 10-second skipped-setup capture + deferred
 * settlement feeding Discipline Saved / Hesitation Cost.
 *
 * OWNERSHIP: this context owns the skippedTradeRow table and NOTHING else.
 * It does NOT own discipline aggregates (Discipline consumes via its own
 * context, B4), instruments (validated against the Trades context catalog
 * contract) or strategies (referenced by id only). There is intentionally
 * NO daily-stat side-effect here: B1 computes aggregates from the rows at
 * read time - no duplicate bookkeeping.
 *
 * Security: global JwtAuthGuard, every row scoped to the caller (§34);
 * ownership is part of every lookup (foreign id → 404).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { TradesModule } from "../trades/trades.module";
import { GhostsController } from "./ghosts.controller";
import { GhostsRepository } from "./ghosts.repository";
import { GhostsService } from "./ghosts.service";

@Module({
  imports: [PrismaModule, TradesModule],
  controllers: [GhostsController],
  providers: [GhostsRepository, GhostsService],
  exports: [GhostsService],
})
export class GhostsModule {}
