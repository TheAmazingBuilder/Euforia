/**
 * Settings bounded context (Phase 15) — user preferences & display
 * configuration.
 *
 * Owns (§3/§43): the 9-domain preferences document (trading, risk, journal,
 * notifications, appearance, dashboard, academy, privacy, localization) —
 * HOW the user prefers Cosmoz to behave/display information.
 *
 * Does NOT own (§42): identity/profile (Identity), authentication, security
 * controls (Security), trading accounts (Accounts — Settings only holds a
 * validated default-account REFERENCE, §21), integrations, trades, calendar,
 * monitoring, system configuration (§6).
 *
 * Persistence: reuses the existing `User.preferences` JSON column through
 * IdentityRepository's narrow preferences contract (§28 — evolve, don't
 * duplicate; no new table, no migration). Audit: records into the shared
 * SecurityEvent ledger — no second audit system (§33).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { IdentityModule } from "../identity/identity.module";
import { AccountsModule } from "../accounts/accounts.module";
import { SecurityEventModule } from "../security/security-event.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [PrismaModule, IdentityModule, AccountsModule, SecurityEventModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
