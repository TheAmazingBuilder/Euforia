import { describe, expect, it } from "vitest";

import type { TaskyKanbanBoardState } from "@cosmoz/shared";
import { buildTaskyBoardCsvExport, buildTaskyBoardJsonExport, TASKY_BOARD_EXPORT_FORMAT, TASKY_BOARD_EXPORT_VERSION } from "./tasky-export";

const board: TaskyKanbanBoardState = {
  columns: [
    {
      id: "todo",
      title: "To do",
      dot: "bg-violet-500",
      cards: [
        {
          id: "card-1",
          title: 'Check "risk", then confirm',
          tag: "Review",
          priority: "High",
          assignee: "ME",
          due: "2026-10-30",
          description: "First line\nSecond line",
          checklist: [
            { id: "check-1", text: "Confirm risk", completed: true },
            { id: "check-2", text: "Record result", completed: false },
          ],
          comments: [{ id: "comment-1", author: "You", body: "Looks good", createdAt: "2026-10-29T12:00:00.000Z" }],
          archivedAt: "2026-10-29T12:05:00.000Z",
        },
        { id: "card-2", title: "=HYPERLINK(\"https://example.com\")", tag: "Bug", priority: "Urgent", assignee: "QA" },
      ],
    },
  ],
};

describe("Tasky board exports", () => {
  it("exports a versioned JSON snapshot containing archived cards and card details", () => {
    const exported = JSON.parse(buildTaskyBoardJsonExport(board, "2026-10-29T12:00:00.000Z"));
    expect(exported).toMatchObject({
      format: TASKY_BOARD_EXPORT_FORMAT,
      version: TASKY_BOARD_EXPORT_VERSION,
      exportedAt: "2026-10-29T12:00:00.000Z",
      board,
    });
    expect(exported.board.columns[0].cards).toHaveLength(2);
    expect(exported.board.columns[0].cards[0].checklist[0].completed).toBe(true);
  });

  it("exports every card to CSV, preserving quoted cells and row breaks", () => {
    const csv = buildTaskyBoardCsvExport(board);
    expect(csv.split("\\r\\n")).toHaveLength(3);
    expect(csv).toContain('"Check ""risk"", then confirm"');
    expect(csv).toContain('"2026-10-29T12:05:00.000Z"');
    expect(csv).toContain('"2","1","1","0"');
  });

  it("neutralizes formula-like user content in spreadsheet cells", () => {
    const csv = buildTaskyBoardCsvExport(board);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
  });

  it("returns only the header for a board with no cards", () => {
    const csv = buildTaskyBoardCsvExport({ columns: [{ id: "todo", title: "To do", dot: "bg-muted", cards: [] }] });
    expect(csv.split("\\r\\n")).toHaveLength(1);
  });
});
