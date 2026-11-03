/**
 * Checklist controller (Phase 7) - reusable checklist DEFINITIONS (§22).
 * The evaluation/snapshot side belongs to the consumers (TradePlan.checklist
 * frozen at planning time - Phase 5); editing a definition never rewrites a
 * historical evaluation (§23/§26). All routes authenticated; ownership
 * enforced in the service.
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
  createChecklistInputSchema,
  updateChecklistInputSchema,
  uuidSchema,
  type ChecklistTemplate,
  type ChecklistsResponse,
  type CreateChecklistInput,
  type UpdateChecklistInput,
} from "../../../shared/contracts";
import { PlaybookService } from "../playbook.service";

@Controller("checklists")
export class ChecklistController {
  constructor(private readonly playbook: PlaybookService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): Promise<ChecklistsResponse> {
    return this.playbook.listChecklists(principal.userId);
  }

  @Post()
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createChecklistInputSchema)) payload: CreateChecklistInput,
  ): Promise<ChecklistTemplate> {
    return this.playbook.createChecklist(principal.userId, payload);
  }

  /** Items are replaced WHOLESALE (product contract) - array order is the order. */
  @Patch(":checklistId")
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("checklistId") checklistId: string,
    @Body(new ZodValidationPipe(updateChecklistInputSchema)) payload: UpdateChecklistInput,
  ): Promise<ChecklistTemplate> {
    return this.playbook.updateChecklist(principal.userId, uuidSchema.parse(checklistId), payload);
  }

  @Delete(":checklistId")
  delete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("checklistId") checklistId: string,
  ): Promise<{ ok: true }> {
    return this.playbook.deleteChecklist(principal.userId, uuidSchema.parse(checklistId));
  }
}
