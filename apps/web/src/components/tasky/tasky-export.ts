import type { TaskyKanbanBoardState } from "@cosmoz/shared";

export const TASKY_BOARD_EXPORT_FORMAT = "euforia-tasky-board" as const;
export const TASKY_BOARD_EXPORT_VERSION = 1 as const;

/** Full board snapshot. Uploaded binary attachments live in the API and are not embedded. */
export function buildTaskyBoardJsonExport(
  board: TaskyKanbanBoardState,
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify({
    format: TASKY_BOARD_EXPORT_FORMAT,
    version: TASKY_BOARD_EXPORT_VERSION,
    exportedAt,
    board,
  }, null, 2);
}

const CSV_COLUMNS = [
  "list_id",
  "list",
  "card_id",
  "title",
  "category",
  "priority",
  "assignee",
  "planned_start",
  "due_date",
  "archived_at",
  "description",
  "checklist_items",
  "checklist_completed",
  "comments",
  "links",
  "created_at",
] as const;

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  // Prevent user-entered values from becoming spreadsheet formulas on open.
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Flatten every card, including archived cards, into a spreadsheet-friendly CSV. */
export function buildTaskyBoardCsvExport(board: TaskyKanbanBoardState): string {
  const rows: unknown[][] = [ [...CSV_COLUMNS] ];
  for (const column of board.columns) {
    for (const card of column.cards) {
      const checklist = card.checklist ?? [];
      rows.push([
        column.id,
        column.title,
        card.id,
        card.title,
        card.tag,
        card.priority,
        card.assignee,
        card.startDate,
        card.due,
        card.archivedAt,
        card.description,
        checklist.length,
        checklist.filter((item) => item.completed).length,
        (card.comments ?? []).length,
        (card.links ?? []).length,
        card.createdAt,
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
