/**
 * Setup controller (Phase 7) — market opportunities within a strategy.
 * All routes authenticated (global guard); ownership enforced in the
 * service; static route (/insights) declared before /:setupId.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ZodValidationPipe } from "../../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../../shared/auth/current-user.decorator";
import {
  createSetupInputSchema,
  updateSetupInputSchema,
  uuidSchema,
  type CreateSetupInput,
  type Setup,
  type SetupInsightsResponse,
  type SetupsResponse,
  type UpdateSetupInput,
} from "../../../shared/contracts";
import { PlaybookService } from "../playbook.service";

@Controller("setups")
export class SetupController {
  constructor(private readonly playbook: PlaybookService) {}

  /** Light 90d realized-performance read model (product contract). */
  @Get("insights")
  insights(@CurrentUser() principal: AuthPrincipal): Promise<SetupInsightsResponse> {
    return this.playbook.setupInsights(principal.userId);
  }

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): Promise<SetupsResponse> {
    return this.playbook.listSetups(principal.userId);
  }

  @Post()
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createSetupInputSchema)) payload: CreateSetupInput,
  ): Promise<Setup> {
    return this.playbook.createSetup(principal.userId, payload);
  }

  @Patch(":setupId")
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("setupId") setupId: string,
    @Body(new ZodValidationPipe(updateSetupInputSchema)) payload: UpdateSetupInput,
  ): Promise<Setup> {
    return this.playbook.updateSetup(principal.userId, uuidSchema.parse(setupId), payload);
  }

  @Delete(":setupId")
  delete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("setupId") setupId: string,
  ): Promise<{ ok: true }> {
    return this.playbook.deleteSetup(principal.userId, uuidSchema.parse(setupId));
  }
}
