import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskyKanbanBoardState } from "../../shared/contracts";
import type { TaskyRepository } from "./tasky.repository";
import { TaskyAutomationService, taskyDateKeyInTimezone, taskyDaysBetweenDateKeys } from "./tasky-automation.service";

const ruleId = "59a6b4c4-2f5a-4a33-89cd-09302d692c21";
const runId = "0c11a3d7-8e7f-4a9a-bab9-23de90110a9e";
const createdAt = new Date("2026-10-29T12:00:00.000Z");

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const card = {
  id: "task-card-1",
  title: "Review trading plan",
  tag: "Review",
  priority: "High" as const,
  assignee: "ME",
  due: "2026-11-01",
};

const movedRule = {
  id: ruleId,
  userId: "user-a",
  name: "Review list reminder",
  trigger: "CARD_MOVED",
  enabled: true,
  config: { destinationColumnId: "review" },
  createdAt,
  updatedAt: createdAt,
};

const dueSoonRule = {
  ...movedRule,
  name: "Deadline reminder",
  trigger: "DUE_SOON",
  config: { daysBeforeDue: 1 },
};

function runRow(input: Record<string, unknown>) {
  return {
    id: runId,
    userId: "user-a",
    automationId: (input.automationId as string | null | undefined) ?? null,
    automationName: String(input.automationName ?? "Tasky reminder"),
    trigger: String(input.trigger ?? "MANUAL_REMINDER"),
    cardId: (input.cardId as string | null | undefined) ?? null,
    cardTitle: (input.cardTitle as string | null | undefined) ?? null,
    status: String(input.status ?? "RUNNING"),
    message: String(input.message ?? "Running"),
    error: (input.error as string | null | undefined) ?? null,
    dedupeKey: (input.dedupeKey as string | null | undefined) ?? null,
    createdAt,
  };
}

describe("TaskyAutomationService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evaluates date keys using the user's timezone and a date-only due date", () => {
    expect(taskyDateKeyInTimezone(new Date("2026-10-29T03:30:00.000Z"), "America/Toronto"))
      .toBe("2026-10-28");
    expect(taskyDaysBetweenDateKeys("2026-10-29", "2026-10-30")).toBe(1);
    expect(taskyDaysBetweenDateKeys("2026-10-29", "2026-10-28")).toBe(-1);
  });

  it("publishes an inbox notification when a card changes into a configured destination list", async () => {
    const previous: TaskyKanbanBoardState = {
      columns: [
        { id: "todo", title: "Todo", dot: "bg-muted", cards: [card] },
        { id: "review", title: "Review", dot: "bg-accent", cards: [] },
      ],
    };
    const current: TaskyKanbanBoardState = {
      columns: [
        { id: "todo", title: "Todo", dot: "bg-muted", cards: [] },
        { id: "review", title: "Review", dot: "bg-accent", cards: [card] },
      ],
    };
    const repository = {
      listAutomations: vi.fn().mockResolvedValue([movedRule]),
      createAutomationRun: vi.fn().mockImplementation((input: Record<string, unknown>) => Promise.resolve(runRow(input))),
      updateAutomationRun: vi.fn().mockImplementation((_id: string, input: Record<string, unknown>) => Promise.resolve({ ...runRow({}), ...input })),
    };
    const discipline = { publishAlert: vi.fn().mockResolvedValue(true) };
    const service = new TaskyAutomationService(
      repository as unknown as TaskyRepository,
      discipline as never,
    );

    await service.onBoardSaved("user-a", previous, current);

    expect(discipline.publishAlert).toHaveBeenCalledTimes(1);
    expect(discipline.publishAlert).toHaveBeenCalledWith("user-a", expect.objectContaining({
      type: "SYSTEM",
      title: "Tasky · Review list reminder",
      payload: expect.objectContaining({ source: "tasky", cardId: card.id, fromColumnId: "todo", toColumnId: "review" }),
    }));
    expect(repository.createAutomationRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-a",
      automationId: ruleId,
      status: "RUNNING",
      cardId: card.id,
    }));
    expect(repository.updateAutomationRun).toHaveBeenCalledWith(runId, expect.objectContaining({ status: "SUCCEEDED" }));
  });

  it("changes card priority server-side when a move rule requests it", async () => {
    const previous: TaskyKanbanBoardState = {
      columns: [
        { id: "todo", title: "Todo", dot: "bg-muted", cards: [{ ...card, priority: "Medium" }] },
        { id: "review", title: "Review", dot: "bg-accent", cards: [] },
      ],
    };
    const current: TaskyKanbanBoardState = {
      columns: [
        { id: "todo", title: "Todo", dot: "bg-muted", cards: [] },
        { id: "review", title: "Review", dot: "bg-accent", cards: [{ ...card, priority: "Medium" }] },
      ],
    };
    const priorityRule = {
      ...movedRule,
      config: { destinationColumnId: "review", action: "SET_PRIORITY", targetPriority: "Urgent" },
    };
    const repository = {
      listAutomations: vi.fn().mockResolvedValue([priorityRule]),
      createAutomationRun: vi.fn().mockImplementation((input: Record<string, unknown>) => Promise.resolve(runRow(input))),
      updateAutomationRun: vi.fn().mockImplementation((_id: string, input: Record<string, unknown>) => Promise.resolve({ ...runRow({}), ...input })),
      saveForUser: vi.fn().mockImplementation((_userId: string, boardState: TaskyKanbanBoardState) =>
        Promise.resolve({ data: boardState, updatedAt: new Date("2026-10-29T12:05:00.000Z") })),
    };
    const discipline = { publishAlert: vi.fn().mockResolvedValue(true) };
    const service = new TaskyAutomationService(
      repository as unknown as TaskyRepository,
      discipline as never,
    );

    const result = await service.onBoardSaved("user-a", previous, current);

    expect(result.columns[1]?.cards[0]?.priority).toBe("Urgent");
    expect(repository.saveForUser).toHaveBeenCalledWith("user-a", expect.objectContaining({
      columns: expect.arrayContaining([
        expect.objectContaining({
          id: "review",
          cards: [expect.objectContaining({ id: card.id, priority: "Urgent" })],
        }),
      ]),
    }));
    expect(discipline.publishAlert).toHaveBeenCalledWith("user-a", expect.objectContaining({
      payload: expect.objectContaining({ action: "SET_PRIORITY", priority: "Urgent" }),
    }));
  });

  it("does not publish a second due-date reminder after the idempotency key succeeded", async () => {
    const today = taskyDateKeyInTimezone(new Date(), "UTC");
    const due = addDays(today, 1);
    const dueBoard: TaskyKanbanBoardState = {
      columns: [{ id: "todo", title: "Todo", dot: "bg-muted", cards: [{ ...card, due }] }],
    };
    const records = new Map<string, ReturnType<typeof runRow>>();
    let created = 0;
    const repository = {
      findByUserId: vi.fn().mockResolvedValue({ data: dueBoard, updatedAt: createdAt }),
      listAutomations: vi.fn().mockResolvedValue([dueSoonRule]),
      getUserTimezone: vi.fn().mockResolvedValue("UTC"),
      findAutomationRunByDedupeKey: vi.fn().mockImplementation((key: string) => Promise.resolve(records.get(key) ?? null)),
      createAutomationRun: vi.fn().mockImplementation((input: Record<string, unknown>) => {
        created += 1;
        const row = runRow({ ...input, id: `00000000-0000-4000-8000-${String(created).padStart(12, "0")}` });
        if (typeof input.dedupeKey === "string") records.set(input.dedupeKey, row);
        return Promise.resolve(row);
      }),
      updateAutomationRun: vi.fn().mockImplementation((id: string, input: Record<string, unknown>) => {
        const row = [...records.values()].find((candidate) => candidate.id === id);
        const updated = { ...(row ?? runRow({})), ...input };
        if (typeof updated.dedupeKey === "string") records.set(updated.dedupeKey, updated as ReturnType<typeof runRow>);
        return Promise.resolve(updated);
      }),
    };
    const discipline = { publishAlert: vi.fn().mockResolvedValue(true) };
    const service = new TaskyAutomationService(
      repository as unknown as TaskyRepository,
      discipline as never,
    );

    await expect(service.runDueDateChecks("user-a")).resolves.toEqual({ checked: true, notificationsCreated: 1 });
    await expect(service.runDueDateChecks("user-a")).resolves.toEqual({ checked: true, notificationsCreated: 0 });

    expect(discipline.publishAlert).toHaveBeenCalledTimes(1);
    expect(repository.createAutomationRun).toHaveBeenCalledTimes(1);
  });
});
