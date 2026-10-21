/**
 * Oryon analyses controller (Phase 10 → serveur) — /oryon/analyses.
 *
 * House conventions: global JwtAuthGuard, ZodValidationPipe on bodies,
 * ownership from the authenticated principal only (§34/§35), thin adapter.
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import {
  createOryonChartAnalysisInputSchema,
  patchOryonAnalysisInputSchema,
  uuidSchema,
  type OryonAnalysisMutatedResponse,
  type OryonAnalysesListResponse,
} from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { OryonAnalysisService } from "./oryon-analysis.service";

@Controller("oryon/analyses")
export class OryonAnalysisController {
  constructor(private readonly analyses: OryonAnalysisService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal): Promise<OryonAnalysesListResponse> {
    return this.analyses.list(principal.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createOryonChartAnalysisInputSchema)) input: unknown,
  ): Promise<OryonAnalysisMutatedResponse> {
    // The create contract omits id/timestamps/schemaVersion — the server owns
    // them; the optional tradeId link rides the same shape.
    const payload = input as Parameters<OryonAnalysisService["create"]>[1];
    return this.analyses.create(principal.userId, {
      ...payload,
      tradeId: payload.tradeId ?? null,
    });
  }

  @Get(":analysisId")
  async get(
    @CurrentUser() principal: AuthPrincipal,
    @Param("analysisId") analysisId: string,
  ): Promise<OryonAnalysisMutatedResponse> {
    return this.analyses.get(principal.userId, uuidSchema.parse(analysisId));
  }

  @Put(":analysisId")
  async patch(
    @CurrentUser() principal: AuthPrincipal,
    @Param("analysisId") analysisId: string,
    @Body(new ZodValidationPipe(patchOryonAnalysisInputSchema)) patch: unknown,
  ): Promise<OryonAnalysisMutatedResponse> {
    return this.analyses.patch(principal.userId, uuidSchema.parse(analysisId), patch as {
      title?: string;
      notes?: string | null;
      tradeId?: string | null;
    });
  }

  @Delete(":analysisId")
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("analysisId") analysisId: string,
  ): Promise<{ ok: true }> {
    return this.analyses.delete(principal.userId, uuidSchema.parse(analysisId));
  }
}
