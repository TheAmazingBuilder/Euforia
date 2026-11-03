/**
 * Playbook bounded context (B10) - the Professional Playbook: strategy
 * CRUD with server-side versioning (§17), setups, checklist templates,
 * operating rules, template library, duplicate-as-draft and the module
 * aggregates (overview / stats / insights).
 *
 * Dependency graph (acyclic):
 *   PlaybookModule → PlaybookRepository (own Prisma boundary - STRATEGY |
 *                    SETUP | CHECKLIST | RULE | VERSION rows)
 *                  → TradesModule (journal facts for aggregates; FK-RESTRICT
 *                    delete semantics)
 *                  → ReviewModule (playbookMatch for live compliance)
 *                  → AccountsModule (currency)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { ReviewModule } from "../review/review.module";
import { TradesModule } from "../trades/trades.module";
import {
  ChecklistsController,
  PlaybookMetaController,
  PlaybookRulesController,
  SetupsController,
  StrategiesController,
} from "./playbook.controller";
import { PlaybookRepository } from "./playbook.repository";
import { PlaybookService } from "./playbook.service";

@Module({
  imports: [PrismaModule, TradesModule, ReviewModule, AccountsModule],
  controllers: [
    PlaybookMetaController,
    StrategiesController,
    SetupsController,
    ChecklistsController,
    PlaybookRulesController,
  ],
  providers: [PlaybookRepository, PlaybookService],
  exports: [PlaybookService, PlaybookRepository],
})
export class PlaybookModule {}
