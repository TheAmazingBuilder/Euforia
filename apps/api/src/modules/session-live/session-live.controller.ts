/**
 * Session Live controller (B9) - trading sessions, saved analyses and key
 * levels. Mirrors `mocks/handlers/sessionLive.ts` exactly (12 routes).
 * Global JwtAuthGuard, uuid-validated params. NO execution path exists.
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
  Query,
} from "@nestjs/common";
import {
  createKeyLevelInputSchema,
  createSavedAnalysisInputSchema,
  endSessionInputSchema,
  startSessionInputSchema,
  updateKeyLevelInputSchema,
  updateSessionInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { SessionLiveService } from "./session-live.service";

@Controller("session-live/sessions")
export class SessionLiveSessionsController {
  constructor(private readonly live: SessionLiveService) {}

  @Get()
  async state(@CurrentUser() principal: AuthPrincipal) {
    return this.live.state(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async start(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(startSessionInputSchema))
    payload: z.infer<typeof startSessionInputSchema>,
  ) {
    return this.live.startSession(principal.userId, payload);
  }

  @Patch(":sessionId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(updateSessionInputSchema))
    payload: z.infer<typeof updateSessionInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.live.updateSession(principal.userId, id, payload);
  }

  @Post(":sessionId/end")
  @HttpCode(HttpStatus.OK)
  async end(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(endSessionInputSchema))
    payload: z.infer<typeof endSessionInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.live.endSession(principal.userId, id, payload);
  }

  @Post(":sessionId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() principal: AuthPrincipal, @Param("sessionId") sessionId: string) {
    const id = uuidSchema.parse(sessionId);
    return this.live.cancelSession(principal.userId, id);
  }
}

@Controller("session-live/analyses")
export class SessionLiveAnalysesController {
  constructor(private readonly live: SessionLiveService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.live.listSavedAnalyses(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createSavedAnalysisInputSchema))
    payload: z.infer<typeof createSavedAnalysisInputSchema>,
  ) {
    return this.live.createSavedAnalysis(principal.userId, payload);
  }

  @Delete(":analysisId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("analysisId") analysisId: string) {
    const id = uuidSchema.parse(analysisId);
    return this.live.deleteSavedAnalysis(principal.userId, id);
  }
}

@Controller("session-live/levels")
export class SessionLiveLevelsController {
  constructor(private readonly live: SessionLiveService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal, @Query("symbol") symbol?: string) {
    return this.live.listKeyLevels(principal.userId, symbol ?? null);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createKeyLevelInputSchema))
    payload: z.infer<typeof createKeyLevelInputSchema>,
  ) {
    return this.live.createKeyLevel(principal.userId, payload);
  }

  @Patch(":levelId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("levelId") levelId: string,
    @Body(new ZodValidationPipe(updateKeyLevelInputSchema))
    payload: z.infer<typeof updateKeyLevelInputSchema>,
  ) {
    const id = uuidSchema.parse(levelId);
    return this.live.updateKeyLevel(principal.userId, id, payload);
  }

  @Delete(":levelId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("levelId") levelId: string) {
    const id = uuidSchema.parse(levelId);
    return this.live.deleteKeyLevel(principal.userId, id);
  }
}
