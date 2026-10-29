import { describe, expect, it, vi } from "vitest";

import type { TaskyKanbanBoardState } from "../../shared/contracts";
import type { TaskyRepository } from "./tasky.repository";
import { TaskyService } from "./tasky.service";

const board: TaskyKanbanBoardState = {
  columns: [
    {
      id: "backlog",
      title: "Backlog",
      dot: "bg-muted-foreground/70",
      cards: [
        {
          id: "card-1",
          title: "Review trading plan",
          tag: "Review",
          priority: "High",
          assignee: "ME",
          description: "Review the setup, criteria and risk.",
          checklist: [
            { id: "check-1", text: "Verify entry criteria", completed: true },
            { id: "check-2", text: "Confirm risk limit", completed: false },
          ],
        },
      ],
    },
  ],
};

describe("TaskyService", () => {
  it("returns null for a user whose board has not yet been created", async () => {
    const repository = {
      findByUserId: vi.fn().mockResolvedValue(null),
      saveForUser: vi.fn(),
    };
    const service = new TaskyService(repository as unknown as TaskyRepository);

    await expect(service.getBoard("user-a")).resolves.toEqual({ board: null });
    expect(repository.findByUserId).toHaveBeenCalledWith("user-a");
    expect(repository.saveForUser).not.toHaveBeenCalled();
  });

  it("saves and returns the validated board for the authenticated user", async () => {
    const updatedAt = new Date("2026-10-29T12:00:00.000Z");
    const repository = {
      findByUserId: vi.fn(),
      saveForUser: vi.fn().mockResolvedValue({ data: board, updatedAt }),
    };
    const service = new TaskyService(repository as unknown as TaskyRepository);

    await expect(service.saveBoard("user-a", board)).resolves.toEqual({
      board,
      updatedAt: updatedAt.toISOString(),
    });
    expect(repository.saveForUser).toHaveBeenCalledWith("user-a", board);
  });

  it("round-trips descriptions and checklist progress through the board contract", async () => {
    const updatedAt = new Date("2026-10-29T12:00:00.000Z");
    const repository = {
      findByUserId: vi.fn(),
      saveForUser: vi.fn().mockResolvedValue({ data: board, updatedAt }),
    };
    const service = new TaskyService(repository as unknown as TaskyRepository);

    const response = await service.saveBoard("user-a", board);
    expect(response.board.columns[0]?.cards[0]).toMatchObject({
      description: "Review the setup, criteria and risk.",
      checklist: [
        { id: "check-1", text: "Verify entry criteria", completed: true },
        { id: "check-2", text: "Confirm risk limit", completed: false },
      ],
    });
  });

  it("rejects an invalid due date before persistence", async () => {
    const repository = {
      findByUserId: vi.fn(),
      saveForUser: vi.fn(),
    };
    const service = new TaskyService(repository as unknown as TaskyRepository);
    const firstColumn = board.columns[0];
    const firstCard = firstColumn?.cards[0];
    if (!firstColumn || !firstCard) {
      throw new Error("Tasky test fixture must contain at least one card.");
    }
    const invalidBoard = {
      columns: [{
        ...firstColumn,
        cards: [{ ...firstCard, due: "not-a-date" }],
      }],
    };

    await expect(service.saveBoard("user-a", invalidBoard)).rejects.toThrow();
    expect(repository.saveForUser).not.toHaveBeenCalled();
  });

  it("rejects an oversized or malformed board before persistence", async () => {
    const repository = {
      findByUserId: vi.fn(),
      saveForUser: vi.fn(),
    };
    const service = new TaskyService(repository as unknown as TaskyRepository);

    await expect(service.saveBoard("user-a", { columns: [] })).rejects.toThrow();
    expect(repository.saveForUser).not.toHaveBeenCalled();
  });
});
