/**
 * Performance snapshots controller (Dashboard Customization Phase 08).
 * All routes authenticated (global JwtAuthGuard - no @Public), userId from
 * the auth principal (never the client), ZodValidationPipe on every body,
 * uuid-validated params, shared-contract parse on read responses.
 *
 * Routes (frontend contract): /snapshots
 *   GET    /snapshots            - the user's snapshots (newest first, capped)
 *   POST   /snapshots            - capture the current analytics scope (201)
 *   GET    /snapshots/:id        - one snapshot detail
 *   PATCH  /snapshots/:id        - rename / edit notes (METADATA ONLY)
 *   DELETE /snapshots/:id        - remove (existing deletion conventions)
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { uuidSchema } from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import {
  createPerformanceSnapshotInputSchema,
  performanceSnapshotSchema,
  performanceSnapshotsResponseSchema,
  updatePerformanceSnapshotInputSchema,
} from "../../shared/contracts";
import { SnapshotsService } from "./snapshots.service";

@Controller("snapshots")
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  /** GET /snapshots - the user's snapshot history. */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.snapshotsService.list(principal.userId);
    return performanceSnapshotsResponseSchema.parse(response);
  }

  /** POST /snapshots - capture the CURRENT analytics scope (never overwrites). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createPerformanceSnapshotInputSchema))
    payload: z.infer<typeof createPerformanceSnapshotInputSchema>,
  ) {
    const snapshot = await this.snapshotsService.create(principal.userId, payload);
    return performanceSnapshotSchema.parse(snapshot);
  }

  /** GET /snapshots/:id - detail (ownership-scoped, foreign = 404). */
  @Get(":snapshotId")
  async get(@CurrentUser() principal: AuthPrincipal, @Param("snapshotId") snapshotId: string) {
    const id = uuidSchema.parse(snapshotId);
    const snapshot = await this.snapshotsService.get(principal.userId, id);
    return performanceSnapshotSchema.parse(snapshot);
  }

  /** PATCH /snapshots/:id - metadata only (name/notes); metrics immutable. */
  @Patch(":snapshotId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("snapshotId") snapshotId: string,
    @Body(new ZodValidationPipe(updatePerformanceSnapshotInputSchema))
    payload: z.infer<typeof updatePerformanceSnapshotInputSchema>,
  ) {
    const id = uuidSchema.parse(snapshotId);
    const snapshot = await this.snapshotsService.update(principal.userId, id, payload);
    return performanceSnapshotSchema.parse(snapshot);
  }

  /** DELETE /snapshots/:id - delete per existing deletion conventions. */
  @Delete(":snapshotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("snapshotId") snapshotId: string) {
    const id = uuidSchema.parse(snapshotId);
    await this.snapshotsService.remove(principal.userId, id);
  }
}
