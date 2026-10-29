import { describe, expect, it, vi } from "vitest";

import type { TaskyRepository } from "./tasky.repository";
import { TaskyService } from "./tasky.service";

const userId = "11111111-1111-4111-8111-111111111111";
const viewId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-29T14:00:00.000Z");
const filters = { query: "urgent", priority: "Urgent", due: "overdue", sort: "due" };

function savedView(overrides: Record<string, unknown> = {}) {
  return {
    id: viewId,
    userId,
    name: "Urgent overdue",
    filters,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(overrides: Record<string, unknown> = {}) {
  const repository = {
    listSavedViews: vi.fn().mockResolvedValue([savedView()]),
    countSavedViews: vi.fn().mockResolvedValue(0),
    findSavedViewByName: vi.fn().mockResolvedValue(null),
    createSavedView: vi.fn().mockImplementation(async (_userId: string, name: string, value: unknown) =>
      savedView({ name, filters: value }),
    ),
    deleteSavedView: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return {
    service: new TaskyService(repository as unknown as TaskyRepository),
    repository,
  };
}

describe("Tasky saved views", () => {
  it("lists only the authenticated user's views and validates persisted filter JSON", async () => {
    const { service, repository } = createService();

    await expect(service.listSavedViews(userId)).resolves.toEqual({
      views: [{
        id: viewId,
        name: "Urgent overdue",
        filters,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }],
    });
    expect(repository.listSavedViews).toHaveBeenCalledWith(userId);
  });

  it("trims the view name and persists validated filters", async () => {
    const { service, repository } = createService();

    await expect(service.createSavedView(userId, {
      name: "  Urgent overdue  ",
      filters: { ...filters, query: " urgent " },
    })).resolves.toMatchObject({
      view: { id: viewId, name: "Urgent overdue", filters: { ...filters, query: "urgent" } },
    });
    expect(repository.createSavedView).toHaveBeenCalledWith(userId, "Urgent overdue", {
      ...filters,
      query: "urgent",
      category: "all",
      assignee: "all",
      status: "all",
    });
  });

  it("rejects duplicate names and enforces the 20-view limit", async () => {
    const duplicate = createService({ findSavedViewByName: vi.fn().mockResolvedValue(savedView()) });
    await expect(duplicate.service.createSavedView(userId, { name: "Urgent overdue", filters }))
      .rejects.toThrow("A Tasky view with this name already exists.");
    expect(duplicate.repository.createSavedView).not.toHaveBeenCalled();

    const limited = createService({ countSavedViews: vi.fn().mockResolvedValue(20) });
    await expect(limited.service.createSavedView(userId, { name: "Another view", filters }))
      .rejects.toThrow("You can save up to 20 Tasky views.");
    expect(limited.repository.createSavedView).not.toHaveBeenCalled();
  });

  it("deletes only a view owned by the authenticated user", async () => {
    const { service, repository } = createService();

    await expect(service.deleteSavedView(userId, viewId)).resolves.toEqual({ deleted: true, id: viewId });
    expect(repository.deleteSavedView).toHaveBeenCalledWith(userId, viewId);

    const notOwned = createService({ deleteSavedView: vi.fn().mockResolvedValue(false) });
    await expect(notOwned.service.deleteSavedView(userId, viewId)).rejects.toThrow("Tasky view not found.");
  });

  it("fails closed if persisted filter JSON is malformed", async () => {
    const { service } = createService({ listSavedViews: vi.fn().mockResolvedValue([savedView({ filters: { query: 4 } })]) });
    await expect(service.listSavedViews(userId)).rejects.toThrow("A saved Tasky view could not be read safely.");
  });
});
