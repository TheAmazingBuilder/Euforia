import type { TaskyKanbanCard, TaskyKanbanPriority } from "@cosmoz/shared";

export type TaskyDueFilter = "all" | "overdue" | "upcoming" | "no-date";
export type TaskySortOrder = "manual" | "title" | "due" | "priority";
export type TaskyPriorityFilter = "all" | TaskyKanbanPriority;

export interface TaskyCardFilters {
  query: string;
  priority: TaskyPriorityFilter;
  due: TaskyDueFilter;
  sort: TaskySortOrder;
}

export interface IndexedTaskyCard {
  card: TaskyKanbanCard;
  originalIndex: number;
}

const PRIORITY_RANK: Record<TaskyKanbanPriority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

/** Search card text fields without changing the underlying saved board state. */
function searchableText(card: TaskyKanbanCard): string {
  return [
    card.title,
    card.tag,
    card.assignee,
    card.description ?? "",
    ...(card.checklist ?? []).map((item) => item.text),
    ...(card.comments ?? []).map((comment) => comment.body),
    ...(card.links ?? []).map((link) => link.title),
  ].join("\n").toLocaleLowerCase();
}

/**
 * Filter and sort a column for presentation only.
 * originalIndex preserves canonical board order for drag/drop hit testing.
 */
export function filterTaskyCards(
  cards: TaskyKanbanCard[],
  filters: TaskyCardFilters,
  todayKey: string,
): IndexedTaskyCard[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered: IndexedTaskyCard[] = cards
    .map((card, originalIndex) => ({ card, originalIndex }))
    .filter(({ card }) => {
      if (query && !searchableText(card).includes(query)) return false;
      if (filters.priority !== "all" && card.priority !== filters.priority) return false;
      if (filters.due === "no-date" && card.due) return false;
      if (filters.due === "overdue" && (!card.due || card.due >= todayKey)) return false;
      if (filters.due === "upcoming" && (!card.due || card.due < todayKey)) return false;
      return true;
    });

  if (filters.sort === "title") {
    filtered.sort((a, b) =>
      a.card.title.localeCompare(b.card.title, undefined, { sensitivity: "base" }) ||
      a.originalIndex - b.originalIndex,
    );
  } else if (filters.sort === "due") {
    filtered.sort((a, b) => {
      const left = a.card.due ?? "9999-12-31";
      const right = b.card.due ?? "9999-12-31";
      return left.localeCompare(right) || a.originalIndex - b.originalIndex;
    });
  } else if (filters.sort === "priority") {
    filtered.sort((a, b) =>
      PRIORITY_RANK[a.card.priority] - PRIORITY_RANK[b.card.priority] ||
      a.originalIndex - b.originalIndex,
    );
  }

  return filtered;
}
