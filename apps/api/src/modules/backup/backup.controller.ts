/**
 * Backup HTTP surface (B2) — two routes: the full authored-data export
 * snapshot and the validated import (replace trades, merge strategies +
 * tags by id). All authenticated (global guard), user-scoped (§34); the
 * payload schema is the shared backup contract (schemaVersion-gated).
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { z } from "zod";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { CurrentUser } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { backupPayloadSchema } from "../../shared/contracts";
import { BackupService } from "./backup.service";

@Controller()
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  /** GET /export/backup — the full authored-data snapshot. */
  @Get("export/backup")
  async exportBackup(@CurrentUser() principal: AuthPrincipal) {
    return this.backup.exportBackup(principal.userId);
  }

  /** POST /import/backup — replace trades, merge strategies + tags. */
  @Post("import/backup")
  @HttpCode(HttpStatus.OK)
  async importBackup(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(backupPayloadSchema)) payload: z.infer<typeof backupPayloadSchema>,
  ) {
    return this.backup.importBackup(principal.userId, payload);
  }
}
