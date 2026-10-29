import { Injectable, InternalServerErrorException } from "@nestjs/common";

import { taskyKanbanBoardStateSchema } from "../../shared/contracts";
import { TaskyRepository } from "./tasky.repository";

/**
 * Tasky application service. Every lookup/write is scoped to the authenticated
 * user's id; the client never supplies an owner id.
 */
@Injectable()
export class TaskyService {
  constructor(private readonly repository: TaskyRepository) {}

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
    const saved = await this.repository.saveForUser(userId, board);
    const persisted = taskyKanbanBoardStateSchema.safeParse(saved.data);
    if (!persisted.success) {
      throw new InternalServerErrorException(
        "The saved Tasky board could not be verified after writing.",
      );
    }
    return {
      board: persisted.data,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}
