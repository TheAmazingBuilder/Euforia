import { z } from "zod";

/**
 * Tasky contracts - the independent kanban module (Academy section).
 * A five-column sprint board: BACKLOG → TODO → IN_PROGRESS → IN_REVIEW →
 * DONE. Cards carry a category tag, a priority pill, an assignee avatar and
 * an optional due date; the mock engine keeps per-session in-memory state so
 * a real NestJS module can replace it 1:1.
 */

export const taskyColumnSchema = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
]);
export type TaskyColumn = z.infer<typeof taskyColumnSchema>;

export const taskyPrioritySchema = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]);
export type TaskyPriority = z.infer<typeof taskyPrioritySchema>;

/** Column chrome - the client maps `accent` to a semantic CSS token. */
export type TaskyColumnMeta = {
  id: TaskyColumn;
  label: string;
  accent: "muted" | "violet" | "accent" | "warning" | "profit";
};

export type TaskyTask = {
  id: string;
  title: string;
  /** Neutral bordered chip - work type (Feature/Bug/Risk/...). */
  tag: string;
  priority: TaskyPriority;
  /** Avatar initials (2–3 chars) - null renders a placeholder dot. */
  assignee: string | null;
  /** ISO date (yyyy-mm-dd) - null means "no due date". */
  dueAt: string | null;
  column: TaskyColumn;
  /** Stable position inside the column (0 = top). */
  order: number;
};

export type TaskyBoardResponse = {
  columns: TaskyColumnMeta[];
  tasks: TaskyTask[];
};

export const taskyCreateInputSchema = z.object({
  title: z.string().min(1).max(140),
  column: taskyColumnSchema,
  tag: z.string().min(1).max(24).optional(),
  priority: taskyPrioritySchema.optional(),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueAt must be an ISO date (yyyy-mm-dd)")
    .nullable()
    .optional(),
  assignee: z.string().min(2).max(3).nullable().optional(),
});
export type TaskyCreateInput = z.infer<typeof taskyCreateInputSchema>;

/** Move a card within/between columns; the engine renumbers `order`. */
export const taskyMoveInputSchema = z.object({
  taskId: z.string().min(1),
  column: taskyColumnSchema,
  /** Target index in the destination column; omitted = append to the end. */
  index: z.number().int().min(0).optional(),
});
export type TaskyMoveInput = z.infer<typeof taskyMoveInputSchema>;

export const taskyUpdateInputSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(140).optional(),
  tag: z.string().min(1).max(24).nullable().optional(),
  priority: taskyPrioritySchema.optional(),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueAt must be an ISO date (yyyy-mm-dd)")
    .nullable()
    .optional(),
  assignee: z.string().min(2).max(3).nullable().optional(),
});
export type TaskyUpdateInput = z.infer<typeof taskyUpdateInputSchema>;

export const taskyDeleteInputSchema = z.object({
  taskId: z.string().min(1),
});
export type TaskyDeleteInput = z.infer<typeof taskyDeleteInputSchema>;


// ── Tasky Kanban board snapshot (independent from Academy study tasks) ────────
// This schema follows the current flexible board UI: users may add columns and
// cards, and their relative order is preserved in the serialized board state.
export const taskyKanbanPrioritySchema = z.enum(["Low", "Medium", "High", "Urgent"]);
export type TaskyKanbanPriority = z.infer<typeof taskyKanbanPrioritySchema>;

export const taskyKanbanChecklistItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(180),
  completed: z.boolean(),
});
export type TaskyKanbanChecklistItem = z.infer<typeof taskyKanbanChecklistItemSchema>;

export const taskyKanbanCardSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(140),
  tag: z.string().trim().min(1).max(40),
  priority: taskyKanbanPrioritySchema,
  assignee: z.string().trim().min(1).max(12),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(4000).optional(),
  checklist: z.array(taskyKanbanChecklistItemSchema).max(100).optional(),
});
export type TaskyKanbanCard = z.infer<typeof taskyKanbanCardSchema>;

export const taskyKanbanColumnSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(40),
  dot: z.string().trim().min(1).max(64),
  cards: z.array(taskyKanbanCardSchema).max(500),
});
export type TaskyKanbanColumn = z.infer<typeof taskyKanbanColumnSchema>;

export const taskyKanbanBoardStateSchema = z
  .object({
    columns: z.array(taskyKanbanColumnSchema).min(1).max(40),
  })
  .superRefine((board, ctx) => {
    const cardCount = board.columns.reduce((sum, column) => sum + column.cards.length, 0);
    if (cardCount > 2000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["columns"],
        message: "A Tasky board may contain at most 2,000 cards.",
      });
    }

    const ids = new Set<string>();
    board.columns.forEach((column, columnIndex) => {
      if (ids.has(column.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns", columnIndex, "id"],
          message: "Column IDs must be unique.",
        });
      }
      ids.add(column.id);
      column.cards.forEach((card, cardIndex) => {
        if (ids.has(card.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["columns", columnIndex, "cards", cardIndex, "id"],
            message: "Board and card IDs must be unique.",
          });
        }
        ids.add(card.id);
        card.checklist?.forEach((item, itemIndex) => {
          if (ids.has(item.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["columns", columnIndex, "cards", cardIndex, "checklist", itemIndex, "id"],
              message: "Board, card, and checklist IDs must be unique.",
            });
          }
          ids.add(item.id);
        });
      });;
    });
  });
export type TaskyKanbanBoardState = z.infer<typeof taskyKanbanBoardStateSchema>;

export const taskyKanbanBoardEnvelopeSchema = z.object({
  board: taskyKanbanBoardStateSchema.nullable(),
});
export type TaskyKanbanBoardEnvelope = z.infer<typeof taskyKanbanBoardEnvelopeSchema>;

export const taskyKanbanBoardSaveResponseSchema = z.object({
  board: taskyKanbanBoardStateSchema,
  updatedAt: z.string().datetime(),
});
export type TaskyKanbanBoardSaveResponse = z.infer<typeof taskyKanbanBoardSaveResponseSchema>;
