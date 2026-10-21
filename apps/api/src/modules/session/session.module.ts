/**
 * Session bounded context (B5 — trade-entry-ux.md §9): the trading day's
 * server-assembled event timeline + mood strip, and the session logbook
 * (timestamped in-session notes).
 *
 * OWNERSHIP: this context owns the sessionNoteRow table ONLY. Timeline
 * facts are CONSUMED from their owning contexts (§26/§39): journal trades
 * and plan-modification events via the Trades read contract, rule-breach
 * alerts via Discipline's repository contract. "Today" is SERVER-resolved
 * from the user's timezone — the client never derives the trading date.
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { DisciplineModule } from "../discipline/discipline.module";
import { IdentityModule } from "../identity/identity.module";
import { TradesModule } from "../trades/trades.module";
import { SessionNotesController, SessionTimelineController } from "./session.controller";
import { SessionRepository } from "./session.repository";
import { SessionService } from "./session.service";

@Module({
  imports: [PrismaModule, TradesModule, DisciplineModule, IdentityModule],
  controllers: [SessionTimelineController, SessionNotesController],
  providers: [SessionRepository, SessionService],
  // Narrow contract: Session Live's end-summary counts today's logbook notes
  // from the owning context (§26).
  exports: [SessionRepository],
})
export class SessionModule {}
