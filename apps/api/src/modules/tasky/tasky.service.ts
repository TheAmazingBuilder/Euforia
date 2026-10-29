import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";

import { taskyKanbanBoardStateSchema } from "../../shared/contracts";
import { TaskyRepository } from "./tasky.repository";
import { TaskyAttachmentService } from "./tasky-attachment.service";

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
}
