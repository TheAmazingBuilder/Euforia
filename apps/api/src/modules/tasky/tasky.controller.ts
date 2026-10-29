import { Body, Controller, Get, Put } from "@nestjs/common";

import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { taskyKanbanBoardStateSchema, type TaskyKanbanBoardState } from "../../shared/contracts";
import { TaskyService } from "./tasky.service";

/** Authenticated HTTP contract for the independent Tasky Kanban board. */
@Controller("tasky")
export class TaskyController {
  constructor(private readonly tasky: TaskyService) {}

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
}
