/**
 * Stats bounded context (B1) — the analytics domain. READ-ONLY: consumes
 * journal facts, account balances, discipline aggregates and the ghost
 * registry through the owning contexts' narrow contracts; owns NO tables
 * of its own (§ — analytics is a lens over the journal, not a store).
 *
 * Dependency graph (acyclic):
 *   StatsModule → TradesRepository (journal facts + instruments + tags)
 *               → AccountsRepository (currency + starting balances)
 *               → DisciplineService (daily scores + mistakes ledger)
 *               → GhostsService (settled skipped trades)
 *               → PlaybookService (strategy names)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { DisciplineModule } from "../discipline/discipline.module";
import { GhostsModule } from "../ghosts/ghosts.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { TradesModule } from "../trades/trades.module";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

@Module({
  imports: [TradesModule, AccountsModule, DisciplineModule, GhostsModule, PlaybookModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
