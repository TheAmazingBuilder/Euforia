import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";

import { taskyKanbanBoardStateSchema, taskySavedViewCreateSchema, taskySavedViewFiltersSchema, taskySavedViewSchema, type TaskySavedViewFilters } from "../../shared/contracts";
import { TaskyRepository } from "./tasky.repository";
import { TaskyAttachmentService } from "./tasky-attachment.service";
import { TaskyAutomationService } from "./tasky-automation.service";

/**
 * Tasky application service. Every lookup/write is scoped to the authenticated
 * user's id; the client never supplies an owner id.
 */
@Injectable()
export class TaskyService {
  private readonly logger = new Logger(TaskyService.name);

  constructor(
    private readonly repository: TaskyRepository,
    private readonly attachments?: TaskyAttachmentService,
    private readonly automations?: TaskyAutomationService,
  ) {}

  async getBoard(userId: string) {
    const row = await this.repository.findByUserId(userId);
    if (!row) return { board: null };

    const parsed = taskyKanbanBoardStateSchema.safeParse(row.data);
    if (!parsed.success) {
      // Never overwrite a malformed saved board with defaults implicitly.
      throw new InternalServerErrorException(
        "The saved Tasky board could not be read. No board data was overwritten.",
      );
    }
    return { board: parsed.data };
  }

  async saveBoard(userId: string, input: unknown) {
    const board = taskyKanbanBoardStateSchema.parse(input);
    const previous = await this.repository.findByUserId(userId);
    const previousParsed = previous ? taskyKanbanBoardStateSchema.safeParse(previous.data) : null;
    const previousCardIds = previousParsed?.success
      ? previousParsed.data.columns.flatMap((column) => column.cards.map((card) => card.id))
      : [];
    const saved = await this.repository.saveForUser(userId, board);
    const persisted = taskyKanbanBoardStateSchema.safeParse(saved.data);
    if (!persisted.success) {
      throw new InternalServerErrorException(
        "The saved Tasky board could not be verified after writing.",
      );
    }
    if (previousParsed?.success && this.automations) {
      try {
        await this.automations.onBoardSaved(userId, previousParsed.data, persisted.data);
      } catch (error) {
        // Automation failures are recorded by the automation context; never
        // turn an already successful board save into a failed request.
        this.logger.warn(`Tasky automation dispatch failed after board save: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    const currentCardIds = new Set(persisted.data.columns.flatMap((column) => column.cards.map((card) => card.id)));
    const removedCardIds = [...new Set(previousCardIds)].filter((cardId) => !currentCardIds.has(cardId));
    if (removedCardIds.length > 0 && this.attachments) {
      try {
        await this.attachments.removeForDeletedCards(userId, removedCardIds);
      } catch {
        // The board write has succeeded. Keep that success honest and report
        // cleanup failure without exposing storage/database details.
        this.logger.warn("Tasky attachment cleanup failed after a board update.");
      }
    }

    return {
      board: persisted.data,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async listSavedViews(userId: string) {
    const rows = await this.repository.listSavedViews(userId);
    const views = rows.map((row) => {
      const filters = taskySavedViewFiltersSchema.safeParse(row.filters);
      if (!filters.success) {
        throw new InternalServerErrorException("A saved Tasky view could not be read safely.");
      }
      return taskySavedViewSchema.parse({
        id: row.id,
        name: row.name,
        filters: filters.data,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    });
    return { views };
  }

  async createSavedView(userId: string, input: unknown) {
    const parsed = taskySavedViewCreateSchema.parse(input);
    if (await this.repository.countSavedViews(userId) >= 20) {
      throw new BadRequestException("You can save up to 20 Tasky views.");
    }
    if (await this.repository.findSavedViewByName(userId, parsed.name)) {
      throw new ConflictException("A Tasky view with this name already exists.");
    }

    try {
      const row = await this.repository.createSavedView(
        userId,
        parsed.name,
        parsed.filters satisfies TaskySavedViewFilters,
      );
      const result = taskySavedViewSchema.safeParse({
        id: row.id,
        name: row.name,
        filters: row.filters,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
      if (!result.success) {
        throw new InternalServerErrorException("The saved Tasky view could not be verified after writing.");
      }
      return { view: result.data };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ConflictException("A Tasky view with this name already exists.");
      }
      throw error;
    }
  }

  async deleteSavedView(userId: string, id: string) {
    const deleted = await this.repository.deleteSavedView(userId, id);
    if (!deleted) throw new NotFoundException("Tasky view not found.");
    return { deleted: true as const, id };
  }
}
