/**
 * Replay bounded context - the first-class historical replay module
 * (REPLAY MASTER PROMPT). Simulation ONLY: sessions play back historical
 * market windows while the trader records decisions, simulated trades and
 * notes. NO execution path exists anywhere in this module (§37) - the
 * word "order" appears here only in this comment.
 *
 * Dependency graph (acyclic):
 *   ReplayModule → ReplayRepository (own Prisma boundary -
 *                  SESSION | TRADE | DECISION | NOTE rows)
 *                → PlaybookModule (ownership checks for strategy/setup ids)
 *                → AccountsModule (ownership check for the account context)
 *
 * Historical candles are NOT stored here: the workspace fetches bounded
 * slices from the market service at playback time (§18/§41 - the browser
 * never receives more than the replay reveals).
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34):
 * foreign session/child ids resolve to 404, foreign strategy/setup/account
 * references are rejected before attach (§35).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { ReplayController } from "./replay.controller";
import { ReplayRepository } from "./replay.repository";
import { ReplayService } from "./replay.service";

@Module({
  imports: [PrismaModule, PlaybookModule, AccountsModule],
  controllers: [ReplayController],
  providers: [ReplayRepository, ReplayService],
})
export class ReplayModule {}
