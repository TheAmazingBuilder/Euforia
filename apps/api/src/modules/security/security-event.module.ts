/**
 * Security-event module (Phase 16) - the append-only activity ledger as a
 * standalone capability. Imported by Identity and Accounts (writers) and by
 * the Security center (reads) WITHOUT creating any dependency between those
 * contexts (§34: "Do not make every module directly depend on Security
 * internals" - writers depend only on this narrow port).
 *
 * Dependency graph (acyclic):
 *   IdentityModule ──────┐
 *   AccountsModule ──────┼─→ SecurityEventModule (record)
 *   SecurityModule ──────┴─→ SecurityEventModule + IdentityModule (read +
 *                            orchestrate via identity capabilities)
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { SecurityEventRepository } from "./security-event.repository";
import { SecurityEventService } from "./security-event.service";

@Module({
  imports: [PrismaModule],
  providers: [SecurityEventRepository, SecurityEventService],
  exports: [SecurityEventRepository, SecurityEventService],
})
export class SecurityEventModule {}
