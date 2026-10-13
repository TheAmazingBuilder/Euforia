import type {
  TaskyBoardResponse,
  TaskyColumnMeta,
  TaskyCreateInput,
  TaskyDeleteInput,
  TaskyMoveInput,
  TaskyTask,
  TaskyUpdateInput,
} from "@cosmoz/shared";

import {
  taskyCreateInputSchema,
  taskyDeleteInputSchema,
  taskyMoveInputSchema,
  taskyUpdateInputSchema,
} from "@cosmoz/shared";
import { MockError } from "@/mocks/store";

/**
 * Tasky engine (mock backend) — the five-column sprint board. Self-contained
 * module state (same lifecycle as the other engines): the seed regenerates
 * due dates relative to the session so the board always looks alive; moves,
 * creates and edits live in memory. Zod-validated at the handler edge.
 */

export const TASKY_COLUMNS: TaskyColumnMeta[] = [
  { id: "BACKLOG", label: "Backlog", accent: "muted" },
  { id: "TODO", label: "Todo", accent: "violet" },
  { id: "IN_PROGRESS", label: "In Progress", accent: "accent" },
  { id: "IN_REVIEW", label: "In Review", accent: "warning" },
  { id: "DONE", label: "Done", accent: "profit" },
];

/** ISO date offset from today — keeps the board seasonable year-round. */
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

type TaskSeed = Omit<TaskyTask, "dueAt" | "order"> & { dueOffsetDays: number | null };

const TASK_SEEDS: TaskSeed[] = [
  // ── Backlog (4) ──────────────────────────────────────────────────────────
  { id: "tsk-tag-april", title: "Tag last month's sessions by mistake type", tag: "Review", priority: "MEDIUM", assignee: "ME", dueOffsetDays: 20, column: "BACKLOG" },
  { id: "tsk-catalog-reversals", title: "Catalog A+ reversal setups with invalidation notes", tag: "Patterns", priority: "LOW", assignee: "JF", dueOffsetDays: 24, column: "BACKLOG" },
  { id: "tsk-equity-export", title: "Automate the weekly equity snapshot export", tag: "Reports", priority: "MEDIUM", assignee: "DA", dueOffsetDays: 15, column: "BACKLOG" },
  { id: "tsk-drawdown-checklist", title: "Draft the prop-firm drawdown checklist", tag: "Risk", priority: "HIGH", assignee: "MQ", dueOffsetDays: 27, column: "BACKLOG" },

  // ── Todo (3) ─────────────────────────────────────────────────────────────
  { id: "tsk-checklist-flow", title: "Rework the pre-market checklist flow", tag: "Checklist", priority: "HIGH", assignee: "ME", dueOffsetDays: 8, column: "TODO" },
  { id: "tsk-risk-guard-tests", title: "Unit tests for the risk guard rails", tag: "DevOps", priority: "HIGH", assignee: "DA", dueOffsetDays: 6, column: "TODO" },
  { id: "tsk-fr-prompts", title: "Localize journal prompts for the FR pack", tag: "i18n", priority: "MEDIUM", assignee: "EV", dueOffsetDays: 12, column: "TODO" },

  // ── In Progress (3) ──────────────────────────────────────────────────────
  { id: "tsk-tz-drift", title: "Fix equity curve timezone drift", tag: "Bug", priority: "URGENT", assignee: "DA", dueOffsetDays: 2, column: "IN_PROGRESS" },
  { id: "tsk-sizer-panel", title: "Build the live position sizer side panel", tag: "Feature", priority: "HIGH", assignee: "ME", dueOffsetDays: 5, column: "IN_PROGRESS" },
  { id: "tsk-ocr-thresholds", title: "Tune recognition confidence thresholds", tag: "OCR", priority: "MEDIUM", assignee: "EV", dueOffsetDays: 3, column: "IN_PROGRESS" },

  // ── In Review (2) ────────────────────────────────────────────────────────
  { id: "tsk-replay-scrubber", title: "Session replay scrubber on all charts", tag: "Enhancement", priority: "MEDIUM", assignee: "MQ", dueOffsetDays: 1, column: "IN_REVIEW" },
  { id: "tsk-rate-limit", title: "Rate limiting for the public status API", tag: "Security", priority: "HIGH", assignee: "DA", dueOffsetDays: 0, column: "IN_REVIEW" },

  // ── Done (3) ─────────────────────────────────────────────────────────────
  { id: "tsk-ci-backtests", title: "Nightly CI pipeline for the backtest suite", tag: "DevOps", priority: "HIGH", assignee: "JF", dueOffsetDays: -3, column: "DONE" },
  { id: "tsk-pg-locking", title: "Row-level locking on the journal ledger", tag: "Security", priority: "URGENT", assignee: "DA", dueOffsetDays: -5, column: "DONE" },
  { id: "tsk-webhook-signing", title: "Webhook signature validation for alerts", tag: "Bug", priority: "HIGH", assignee: "EV", dueOffsetDays: -7, column: "DONE" },
];

let tasks: TaskyTask[] = TASK_SEEDS.map((seed, index) => ({
  id: seed.id,
  title: seed.title,
  tag: seed.tag,
  priority: seed.priority,
  assignee: seed.assignee,
  dueAt: seed.dueOffsetDays === null ? null : inDays(seed.dueOffsetDays),
  column: seed.column,
  order: index, // renumbered per column below
}));

// Renumber orders per column so every column starts at 0, top→bottom.
function renumber(column?: TaskyTask["column"]): void {
  const scopes = column ? [column] : TASKY_COLUMNS.map((meta) => meta.id);
  for (const scope of scopes) {
    tasks
      .filter((task) => task.column === scope)
      .sort((a, b) => a.order - b.order)
      .forEach((task, index) => {
        task.order = index;
      });
  }
}
renumber();

function findTask(taskId: string): TaskyTask {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new MockError(404, "Tasky task not found");
  }
  return task;
}

export function taskyBoard(): TaskyBoardResponse {
  return {
    columns: TASKY_COLUMNS,
    tasks: [...tasks].sort((a, b) => a.order - b.order),
  };
}

export function createTaskyTask(input: unknown): TaskyTask {
  const data = taskyCreateInputSchema.parse(input) as TaskyCreateInput;
  const columnTasks = tasks.filter((task) => task.column === data.column);
  const task: TaskyTask = {
    id: `tsk-${Date.now()}-${tasks.length}`,
    title: data.title,
    tag: data.tag ?? "Task",
    priority: data.priority ?? "MEDIUM",
    assignee: data.assignee ?? "ME",
    dueAt: data.dueAt ?? null,
    column: data.column,
    order: columnTasks.length,
  };
  tasks.push(task);
  return task;
}

export function moveTaskyTask(input: unknown): TaskyTask {
  const data = taskyMoveInputSchema.parse(input) as TaskyMoveInput;
  const task = findTask(data.taskId);
  const origin = task.column;
  const destination = data.column;

  // Rebuild the destination column with the card inserted at `index`
  // (same object mutated — the order renumbering writes through).
  const others = tasks.filter((candidate) => candidate.id !== task.id);
  const columnTasks = others
    .filter((candidate) => candidate.column === destination)
    .sort((a, b) => a.order - b.order);
  const index = Math.min(data.index ?? columnTasks.length, columnTasks.length);
  columnTasks.splice(index, 0, task);
  columnTasks.forEach((candidate, position) => {
    candidate.column = destination;
    candidate.order = position;
  });

  // Closing the gap left behind in the origin column.
  if (origin !== destination) {
    others
      .filter((candidate) => candidate.column === origin)
      .sort((a, b) => a.order - b.order)
      .forEach((candidate, position) => {
        candidate.order = position;
      });
  }
  return task;
}

export function updateTaskyTask(input: unknown): TaskyTask {
  const data = taskyUpdateInputSchema.parse(input) as TaskyUpdateInput;
  const task = findTask(data.taskId);
  if (data.title !== undefined) task.title = data.title;
  if (data.tag !== undefined) task.tag = data.tag ?? "Task";
  if (data.priority !== undefined) task.priority = data.priority;
  if (data.dueAt !== undefined) task.dueAt = data.dueAt;
  if (data.assignee !== undefined) task.assignee = data.assignee;
  return task;
}

export function deleteTaskyTask(input: unknown): { ok: boolean } {
  const data = taskyDeleteInputSchema.parse(input) as TaskyDeleteInput;
  const task = findTask(data.taskId);
  tasks = tasks.filter((candidate) => candidate.id !== task.id);
  renumber(task.column);
  return { ok: true };
}
