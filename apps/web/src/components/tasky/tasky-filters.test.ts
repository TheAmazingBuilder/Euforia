import { describe, expect, it } from "vitest";
import type { TaskyKanbanCard } from "@cosmoz/shared";
import { filterTaskyCards, type TaskyCardFilters } from "./tasky-filters";

const cards: TaskyKanbanCard[] = [
  {
    id: "card-b",
    title: "Review XAUUSD plan",
    tag: "Review",
    priority: "High",
    assignee: "ME",
    due: "2026-10-30",
    createdAt: "2026-10-22T10:00:00.000Z",
    description: "Check the London session entry.",
    checklist: [{ id: "check-1", text: "Confirm risk", completed: false }],
    comments: [{ id: "comment-1", author: "You", body: "Confirm the stop loss", createdAt: "2026-10-28T10:00:00.000Z" }],
  },
  {
    id: "card-a",
    title: "Build journal export",
    tag: "Feature",
    priority: "Low",
    assignee: "AK",
    due: "2026-10-20",
    createdAt: "2026-10-18T10:00:00.000Z",
  },
  {
    id: "card-c",
    title: "Urgent: fix broken link",
    tag: "Bug",
    priority: "Urgent",
    assignee: "QA",
    createdAt: "2026-10-25T10:00:00.000Z",
  },
];

const defaults: TaskyCardFilters = { query: "", priority: "all", due: "all", sort: "manual" };
const ids = (filters: Partial<TaskyCardFilters> = {}) =>
  filterTaskyCards(cards, { ...defaults, ...filters }, "2026-10-29").map(({ card }) => card.id);

describe("filterTaskyCards", () => {
  it("preserves the original order when no filter or sort is active", () => {
    expect(ids()).toEqual(["card-b", "card-a", "card-c"]);
  });

  it("searches titles, descriptions, checklist text, comments, tags and assignees", () => {
    expect(ids({ query: "xauusd" })).toEqual(["card-b"]);
    expect(ids({ query: "confirm risk" })).toEqual(["card-b"]);
    expect(ids({ query: "stop loss" })).toEqual(["card-b"]);
    expect(ids({ query: "feature" })).toEqual(["card-a"]);
    expect(ids({ query: " qa " })).toEqual(["card-c"]);
  });

  it("applies priority and due-date filters together", () => {
    expect(ids({ priority: "High" })).toEqual(["card-b"]);
    expect(ids({ due: "overdue" })).toEqual(["card-a"]);
    expect(ids({ due: "upcoming" })).toEqual(["card-b"]);
    expect(ids({ due: "no-date" })).toEqual(["card-c"]);
    expect(ids({ priority: "High", due: "upcoming" })).toEqual(["card-b"]);
    expect(ids({ priority: "Urgent", due: "overdue" })).toEqual([]);
  });

  it("filters by category and assignee and supports creation-date sorting", () => {
    expect(ids({ category: "Review" })).toEqual(["card-b"]);
    expect(ids({ assignee: "QA" })).toEqual(["card-c"]);
    expect(ids({ category: "Bug", assignee: "ME" })).toEqual([]);
    expect(ids({ sort: "created" })).toEqual(["card-a", "card-b", "card-c"]);
  });

  it("sorts by title, due date and priority without mutating the input", () => {
    expect(ids({ sort: "title" })).toEqual(["card-a", "card-b", "card-c"]);
    expect(ids({ sort: "due" })).toEqual(["card-a", "card-b", "card-c"]);
    expect(ids({ sort: "priority" })).toEqual(["card-c", "card-b", "card-a"]);
    expect(cards.map((card) => card.id)).toEqual(["card-b", "card-a", "card-c"]);
  });
});
