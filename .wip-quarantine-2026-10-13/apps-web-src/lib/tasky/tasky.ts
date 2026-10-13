/**
 * Tasky module — pure domain layer (no React, no DOM).
 *
 * A kanban board: five columns, task cards with category/priority badges,
 * assignee and due date. State is a plain {columnId → taskId[]} ordering map
 * so drag & drop stays a pure move operation, and task CRUD is a small set of
 * pure helpers. Demo data is seeded verbatim from the product spec.
 */

export type TaskPriority = "urgent" | "high" | "medium" | "low";

export type BoardTask = {
  id: string;
  title: string;
  /** Category badge label — EN seed copy (data convention). */
  category: string;
  priority: TaskPriority;
  /** Assignee initials, e.g. "AK". */
  assignee: string;
  /** Due date "YYYY-MM-DD", rendered as "Apr 20". */
  due: string;
};

export type ColumnTone = "muted" | "violet" | "blue" | "amber" | "green";

export type BoardColumn = {
  id: string;
  title: string;
  tone: ColumnTone;
  taskIds: string[];
};

/** Column dot color — var() references only (no hex outside globals.css). */
export const COLUMN_TONE_COLOR: Record<ColumnTone, string> = {
  muted: "var(--text-muted)",
  violet: "var(--cat-pa)",
  blue: "var(--accent)",
  amber: "var(--warning)",
  green: "var(--profit)",
};

/** Priority badge tint — foreground/background var() pairs. */
export const PRIORITY_COLOR: Record<
  TaskPriority,
  { fg: string; bg: string }
> = {
  urgent: {
    fg: "var(--cat-risk)",
    bg: "color-mix(in srgb, var(--cat-risk) 22%, transparent)",
  },
  high: {
    fg: "var(--cat-risk)",
    bg: "color-mix(in srgb, var(--cat-risk) 14%, transparent)",
  },
  medium: {
    fg: "var(--cat-fund)",
    bg: "color-mix(in srgb, var(--cat-fund) 16%, transparent)",
  },
  low: {
    fg: "var(--cat-ta)",
    bg: "color-mix(in srgb, var(--cat-ta) 16%, transparent)",
  },
};

/** Priority badge label (uppercase display handled by CSS). */
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/* ------------------------------------------------------------------ */
/* Seed — demo board, verbatim from the product spec.                  */
/* ------------------------------------------------------------------ */

export const SEED_TASKS: BoardTask[] = [
  // Backlog
  { id: "t-oauth", title: "Implement OAuth 2.0 SSO integration", category: "Feature", priority: "high", assignee: "AK", due: "2025-04-20" },
  { id: "t-csv", title: "Add CSV export for reports dashboard", category: "Enhancement", priority: "medium", assignee: "SL", due: "2025-04-28" },
  { id: "t-graphql", title: "Migrate legacy REST endpoints to GraphQL", category: "Refactor", priority: "low", assignee: "JW", due: "2025-05-10" },
  { id: "t-datadog", title: "Set up Datadog APM traces for API layer", category: "DevOps", priority: "medium", assignee: "RC", due: "2025-05-05" },
  // Todo
  { id: "t-onboarding", title: "Redesign onboarding flow (3-step wizard)", category: "Design", priority: "high", assignee: "MT", due: "2025-04-18" },
  { id: "t-paytests", title: "Write unit tests for payment service", category: "Testing", priority: "high", assignee: "AK", due: "2025-04-16" },
  { id: "t-i18n", title: "Localize app strings for EU markets", category: "i18n", priority: "medium", assignee: "SL", due: "2025-04-25" },
  // In Progress
  { id: "t-wsleak", title: "Fix memory leak in WebSocket handler", category: "Bug", priority: "urgent", assignee: "JW", due: "2025-04-12" },
  { id: "t-sse", title: "Build real-time notifications with SSE", category: "Feature", priority: "high", assignee: "RC", due: "2025-04-15" },
  { id: "t-lighthouse", title: "Optimize Lighthouse score to 95+", category: "Performance", priority: "medium", assignee: "MT", due: "2025-04-22" },
  // In Review
  { id: "t-darkmode", title: "Dark mode support across all components", category: "Enhancement", priority: "medium", assignee: "AK", due: "2025-04-13" },
  { id: "t-ratelimit", title: "Rate limiting middleware for public API", category: "Security", priority: "high", assignee: "SL", due: "2025-04-11" },
  // Done
  { id: "t-cicd", title: "Set up CI/CD pipeline with GitHub Actions", category: "DevOps", priority: "high", assignee: "JW", due: "2025-04-08" },
  { id: "t-rls", title: "Implement row-level security in Postgres", category: "Security", priority: "urgent", assignee: "RC", due: "2025-04-06" },
  { id: "t-stripe", title: "Add Stripe webhook signature validation", category: "Bug", priority: "high", assignee: "MT", due: "2025-04-09" },
];

export const SEED_COLUMNS: BoardColumn[] = [
  {
    id: "backlog",
    title: "Backlog",
    tone: "muted",
    taskIds: ["t-oauth", "t-csv", "t-graphql", "t-datadog"],
  },
  {
    id: "todo",
    title: "Todo",
    tone: "violet",
    taskIds: ["t-onboarding", "t-paytests", "t-i18n"],
  },
  {
    id: "in-progress",
    title: "In Progress",
    tone: "blue",
    taskIds: ["t-wsleak", "t-sse", "t-lighthouse"],
  },
  {
    id: "in-review",
    title: "In Review",
    tone: "amber",
    taskIds: ["t-darkmode", "t-ratelimit"],
  },
  {
    id: "done",
    title: "Done",
    tone: "green",
    taskIds: ["t-cicd", "t-rls", "t-stripe"],
  },
];

/* ------------------------------------------------------------------ */
/* Board operations — pure functions over the ordering state.          */
/* ------------------------------------------------------------------ */

/** Board state: ordered task ids per column. */
export type BoardOrdering = Record<string, string[]>;

export function boardOrderingFromColumns(columns: BoardColumn[]): BoardOrdering {
  return Object.fromEntries(columns.map((column) => [column.id, [...column.taskIds]]));
}

/**
 * Move a task to a column at the given index (0-based, clamped). A drop on
 * the same column re-orders; a drop on another column moves the card.
 * Returns the SAME reference when nothing changes (render guard).
 */
export function moveTask(
  ordering: BoardOrdering,
  taskId: string,
  targetColumnId: string,
  targetIndex: number,
): BoardOrdering {
  const sourceColumnId = Object.keys(ordering).find((columnId) =>
    ordering[columnId].includes(taskId),
  );
  if (!sourceColumnId) return ordering;

  const source = ordering[sourceColumnId].filter((id) => id !== taskId);
  const isSameColumn = sourceColumnId === targetColumnId;

  const destination = isSameColumn
    ? source
    : [...ordering[targetColumnId]];
  const index = Math.max(0, Math.min(targetIndex, destination.length));
  destination.splice(index, 0, taskId);

  if (isSameColumn && destination.every((id, i) => id === ordering[sourceColumnId][i])) {
    return ordering;
  }

  // Same-column moves share ONE key — assigning it twice in a single object
  // literal would let the stale original overwrite the updated ordering.
  if (isSameColumn) {
    return { ...ordering, [targetColumnId]: destination };
  }
  return {
    ...ordering,
    [sourceColumnId]: source,
    [targetColumnId]: destination,
  };
}

/** Due date "YYYY-MM-DD" → "Apr 20" (EN, short month). */
export function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(y, (m ?? 1) - 1, d ?? 1, 12),
  );
}

/* ------------------------------------------------------------------ */
/* Task CRUD — pure helpers used by the create/edit/delete modal.       */
/* ------------------------------------------------------------------ */

/** Payload of the task modal — everything except the identity. */
export type TaskDraft = Pick<
  BoardTask,
  "title" | "category" | "priority" | "assignee" | "due"
>;

/** Session-unique id for a freshly created task (in-memory state only). */
export function nextTaskId(): string {
  return `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Append a task id at the end of a column (used on create). */
export function appendTask(
  ordering: BoardOrdering,
  taskId: string,
  columnId: string,
): BoardOrdering {
  const column = ordering[columnId] ?? [];
  return { ...ordering, [columnId]: [...column, taskId] };
}

/** Strip a task from its column (used on delete). */
export function removeTaskFromOrdering(
  ordering: BoardOrdering,
  taskId: string,
): BoardOrdering {
  const columnId = Object.keys(ordering).find((key) => ordering[key].includes(taskId));
  if (!columnId) return ordering;
  return { ...ordering, [columnId]: ordering[columnId].filter((id) => id !== taskId) };
}

/** Move a task to the END of the target column (used on column change). */
export function moveTaskToEnd(
  ordering: BoardOrdering,
  taskId: string,
  targetColumnId: string,
): BoardOrdering {
  const index = (ordering[targetColumnId] ?? []).length;
  return moveTask(ordering, taskId, targetColumnId, index);
}
