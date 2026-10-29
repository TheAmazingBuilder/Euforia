import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";

import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { taskyAutomationRuleCreateSchema, taskyAutomationRuleUpdateSchema, taskyKanbanAttachmentUploadSchema, taskyKanbanBoardStateSchema, taskySavedViewCreateSchema, type TaskyAutomationRuleCreateInput, type TaskyAutomationRuleUpdateInput, type TaskyKanbanAttachmentUploadInput, type TaskyKanbanBoardState, type TaskySavedViewCreateInput, uuidSchema } from "../../shared/contracts";
import { TaskyService } from "./tasky.service";
import { TaskyAttachmentService } from "./tasky-attachment.service";
import { TaskyAutomationService } from "./tasky-automation.service";

/** Authenticated HTTP contract for the independent Tasky Kanban board. */
@Controller("tasky")
export class TaskyController {
  constructor(
    private readonly tasky: TaskyService,
    private readonly attachments: TaskyAttachmentService,
    private readonly automations: TaskyAutomationService,
  ) {}

  /** Returns null only before this user's board has been initialized. */
  @Get("board")
  async getBoard(@CurrentUser() principal: AuthPrincipal) {
    return this.tasky.getBoard(principal.userId);
  }

  /** Replaces only the authenticated user's board snapshot, validated server-side. */
  @Put("board")
  async saveBoard(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(taskyKanbanBoardStateSchema)) board: TaskyKanbanBoardState,
  ) {
    return this.tasky.saveBoard(principal.userId, board);
  }

  @Get("views")
  async listSavedViews(@CurrentUser() principal: AuthPrincipal) {
    return this.tasky.listSavedViews(principal.userId);
  }

  @Post("views")
  async createSavedView(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(taskySavedViewCreateSchema)) input: TaskySavedViewCreateInput,
  ) {
    return this.tasky.createSavedView(principal.userId, input);
  }

  @Delete("views/:viewId")
  async deleteSavedView(
    @CurrentUser() principal: AuthPrincipal,
    @Param("viewId") viewId: string,
  ) {
    return this.tasky.deleteSavedView(principal.userId, uuidSchema.parse(viewId));
  }

  @Get("automations")
  async listAutomations(@CurrentUser() principal: AuthPrincipal) {
    return this.automations.listRules(principal.userId);
  }

  @Post("automations")
  async createAutomation(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(taskyAutomationRuleCreateSchema)) input: TaskyAutomationRuleCreateInput,
  ) {
    return this.automations.createRule(principal.userId, input);
  }

  @Patch("automations/:ruleId")
  async updateAutomation(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
    @Body(new ZodValidationPipe(taskyAutomationRuleUpdateSchema)) input: TaskyAutomationRuleUpdateInput,
  ) {
    return this.automations.updateRule(principal.userId, uuidSchema.parse(ruleId), input);
  }

  @Delete("automations/:ruleId")
  async deleteAutomation(
    @CurrentUser() principal: AuthPrincipal,
    @Param("ruleId") ruleId: string,
  ) {
    return this.automations.deleteRule(principal.userId, uuidSchema.parse(ruleId));
  }

  @Get("automation-runs")
  async listAutomationRuns(@CurrentUser() principal: AuthPrincipal) {
    return this.automations.listRuns(principal.userId);
  }

  @Post("automation-runs/check-due")
  async checkDueReminders(@CurrentUser() principal: AuthPrincipal) {
    return this.automations.runDueDateChecks(principal.userId);
  }

  @Post("cards/:cardId/remind")
  async remindCard(@CurrentUser() principal: AuthPrincipal, @Param("cardId") cardId: string) {
    return this.automations.remindCard(principal.userId, cardId);
  }

  @Get("cards/:cardId/attachments")
  async listAttachments(@CurrentUser() principal: AuthPrincipal, @Param("cardId") cardId: string) {
    return this.attachments.list(principal.userId, cardId);
  }

  @Post("cards/:cardId/attachments")
  async uploadAttachment(
    @CurrentUser() principal: AuthPrincipal,
    @Param("cardId") cardId: string,
    @Body(new ZodValidationPipe(taskyKanbanAttachmentUploadSchema)) input: TaskyKanbanAttachmentUploadInput,
  ) {
    return this.attachments.upload(principal.userId, cardId, input);
  }

  @Get("cards/:cardId/attachments/:attachmentId/download")
  async downloadAttachment(
    @CurrentUser() principal: AuthPrincipal,
    @Param("cardId") cardId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.attachments.download(principal.userId, cardId, uuidSchema.parse(attachmentId));
  }

  @Delete("cards/:cardId/attachments/:attachmentId")
  async deleteAttachment(
    @CurrentUser() principal: AuthPrincipal,
    @Param("cardId") cardId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.attachments.remove(principal.userId, cardId, uuidSchema.parse(attachmentId));
  }
}
