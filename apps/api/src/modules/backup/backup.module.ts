/**
 * Backup bounded context (B2) - authored-data portability: full snapshot
 * export (journal trades + playbook strategies + tags) and validated
 * import (replace trades, merge strategies/tags by id, re-owned to the
 * requesting user). NO tables of its own - it operates over the owning
 * contexts' stores (the one documented cross-context Prisma exception).
 *
 * Dependency graph (acyclic):
 *   BackupModule → TradesRepository (journal rows + wire mapper)
 *               → PlaybookRepository (STRATEGY rows)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { TradesModule } from "../trades/trades.module";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

@Module({
  imports: [PrismaModule, TradesModule, PlaybookModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
