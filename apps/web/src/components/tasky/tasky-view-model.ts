import type { TaskyKanbanCard, TaskyKanbanColumn, TaskyKanbanPriority } from "@cosmoz/shared";

export interface TaskyViewRow {
  card: TaskyKanbanCard;
  column: TaskyKanbanColumn;
  boardOrder: number;
}

export interface TaskyViewMetrics {
  total: number;
  completed: number;
  overdue: number;
  dueSoon: number;
  completionPercent: number;
  priorityCounts: Record<TaskyKanbanPriority, number>;
  workload: Array<{ assignee: string; count: number }>;
}

export function isTaskyCompletedColumn(column: Pick<TaskyKanbanColumn, "id" | "title">): boolean {
  const normalized = `${column.id} ${column.title}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
  return /(^|\s)(done|complete|completed|finished|fini|finie|termine|terminee)(\s|$)/.test(normalized);
}

/** Prefer the planned start date; legacy cards fall back to their creation timestamp. */
export function getTaskyStartDate(card: TaskyKanbanCard): string | null {
  if (card.startDate) return card.startDate;
  if (card.createdAt) return card.createdAt.slice(0, 10);
  const createdActivity = card.activity?.find((item) => item.type === "created");
  return createdActivity?.createdAt.slice(0, 10) ?? null;
}

export function getTaskyCreatedAt(card: TaskyKanbanCard): string {
  return card.createdAt ?? card.activity?.find((item) => item.type === "created")?.createdAt ?? "";
}

export function buildTaskyCalendarDays(year: number, monthIndex: number): Array<string | null> {
  const firstDay = new Date(year, monthIndex, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const days: Array<string | null> = Array.from({ length: cellCount }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    days[offset + day - 1] = key;
  }
  return days;
}

export function buildTaskyMetrics(rows: TaskyViewRow[], todayKey: string): TaskyViewMetrics {
  const priorityCounts: Record<TaskyKanbanPriority, number> = {
    Urgent: 0, High: 0, Medium: 0, Low: 0,
  };
  const workload = new Map<string, number>();
  let completed = 0;
  let overdue = 0;
  let dueSoon = 0;

  for (const row of rows) {
    const isCompleted = isTaskyCompletedColumn(row.column);
    if (isCompleted) completed += 1;
    else if (row.card.due && row.card.due < todayKey) overdue += 1;
    else if (row.card.due && row.card.due <= addDaysToKey(todayKey, 7)) dueSoon += 1;
    priorityCounts[row.card.priority] += 1;
    const assignee = row.card.assignee.trim() || "Unassigned";
    workload.set(assignee, (workload.get(assignee) ?? 0) + 1);
  }

  return {
    total: rows.length,
    completed,
    overdue,
    dueSoon,
    completionPercent: rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100),
    priorityCounts,
    workload: [...workload.entries()]
      .map(([assignee, count]) => ({ assignee, count }))
      .sort((a, b) => b.count - a.count || a.assignee.localeCompare(b.assignee)),
  };
}

function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
