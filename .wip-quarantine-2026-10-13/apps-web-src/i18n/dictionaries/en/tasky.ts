import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — TASKY namespace (canonical). The independent kanban
 * module: board chrome, card metadata, quick-add and the new-task
 * dialog. Static strings — components compose dynamic parts themselves.
 */

export type TaskyDict = Dictionary["tasky"];

export const taskyDict = {
  board: {
    title: "Tasky Board",
    subtitle: "Plan and track your trading tasks",
    columnsAria: "Kanban columns",
    addTask: "New task",
    emptyColumn: "Drop tasks here",
    emptyBoard: "The board is empty — add the first card to get moving.",
  },
  card: {
    drag: "Drag task",
    dragHint: "Drag to move — long-press a card on touch, or use ←/→ keys",
    delete: "Delete task",
    noDue: "No due date",
    overdue: "Overdue",
    today: "Today",
    tomorrow: "Tomorrow",
    unassigned: "Unassigned",
  },
  form: {
    title: "New task",
    titleLabel: "Title",
    titlePlaceholder: "What needs to get done?",
    column: "Column",
    tag: "Tag",
    tagPlaceholder: "e.g. Risk",
    priority: "Priority",
    dueDate: "Due date",
    dueDateHint: "Optional",
    assignee: "Assignee initials",
    assigneePlaceholder: "ME",
    create: "Create task",
    creating: "Creating…",
    quickAddPlaceholder: "Add a task…",
    quickAdd: "Add",
  },
  priorityLabels: {
    URGENT: "Urgent",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
  },
} as const;
