import { describe, expect, it } from "vitest";

import type { TaskyKanbanCard, TaskyKanbanColumn } from "@cosmoz/shared";
import { buildTaskyCalendarDays, buildTaskyMetrics, getTaskyStartDate, isTaskyCompletedColumn } from "./tasky-view-model";

const baseCard: TaskyKanbanCard = {
  id: "card-1",
  title: "Review setup",
  tag: "Review",
  priority: "High",
  assignee: "AK",
  due: "2026-10-30",
};
const todo: TaskyKanbanColumn = { id: "todo", title: "Todo", dot: "bg-muted", cards: [baseCard] };
const done: TaskyKanbanColumn = { id: "done", title: "Done", dot: "bg-profit", cards: [] };

describe("Tasky supplementary views", () => {
  it("builds a Monday-first calendar grid with date keys", () => {
    const days = buildTaskyCalendarDays(2026, 9);
    expect(days.length % 7).toBe(0);
    expect(days[0]).toBeNull();
    expect(days[3]).toBe("2026-10-01");
    expect(days.filter((day) => day?.startsWith("2026-10-")).length).toBe(31);
  });

  it("recognizes completed columns including localized titles", () => {
    expect(isTaskyCompletedColumn(done)).toBe(true);
    expect(isTaskyCompletedColumn({ id: "finished", title: "Terminé" })).toBe(true);
    expect(isTaskyCompletedColumn(todo)).toBe(false);
  });

  it("computes completion, overdue, due-soon, priorities and assignee workload", () => {
    const rows = [
      { card: baseCard, column: todo, boardOrder: 0 },
      { card: { ...baseCard, id: "card-2", due: "2026-10-20", priority: "Urgent" as const, assignee: "AK" }, column: todo, boardOrder: 1 },
      { card: { ...baseCard, id: "card-3", due: "2026-11-02", priority: "Low" as const, assignee: "SL" }, column: todo, boardOrder: 2 },
      { card: { ...baseCard, id: "card-4", due: "2026-10-20", priority: "Medium" as const }, column: done, boardOrder: 3 },
    ];
    expect(buildTaskyMetrics(rows, "2026-10-29")).toEqual({
      total: 4,
      completed: 1,
      overdue: 1,
      dueSoon: 2,
      completionPercent: 25,
      priorityCounts: { Urgent: 1, High: 1, Medium: 1, Low: 1 },
      workload: [{ assignee: "AK", count: 2 }, { assignee: "SL", count: 1 }, { assignee: "ME", count: 1 }],
    });
  });

  it("uses planned start date before creation metadata", () => {
    expect(getTaskyStartDate({ ...baseCard, startDate: "2026-10-01", createdAt: "2026-10-15T00:00:00.000Z" }))
      .toBe("2026-10-01");
    expect(getTaskyStartDate({ ...baseCard, createdAt: "2026-10-15T12:00:00.000Z" })).toBe("2026-10-15");
    expect(getTaskyStartDate(baseCard)).toBeNull();
  });
});
