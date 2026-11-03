/**
 * Nofy bounded context (B11) - the personal trading knowledge & notes
 * workspace: notes composed of ordered blocks (Notion-style), folders,
 * tags, templates (built-in + user), version history, search and the
 * entity picker. Trading-entity reference blocks are relational pointers
 * re-resolved server-side on every read (spec §24/§31).
 *
 * Dependency graph (acyclic):
 *   NofyModule → NofyRepository (own Prisma boundary - NOTE | FOLDER |
 *                TAG | TEMPLATE | VERSION rows)
 *              → TradesModule (journal facts + instruments for refs)
 *              → PlaybookModule (strategies/setups/rules for refs)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { TradesModule } from "../trades/trades.module";
import { NofyController } from "./nofy.controller";
import { NofyRepository } from "./nofy.repository";
import { NofyService } from "./nofy.service";

@Module({
  imports: [PrismaModule, TradesModule, PlaybookModule],
  controllers: [NofyController],
  providers: [NofyRepository, NofyService],
})
export class NofyModule {}
