"use client";

import * as React from "react";
import {
  CalendarDays,
  Check,
  GripVertical,
  Plus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Tasky - the trading kanban (Academy section, independent module).
 * Columns flow horizontally (left → right) inside a horizontally scrollable
 * board; cards move between columns by dragging the grip handle with the
 * cursor OR a finger (unified Pointer Events path, touch-action: none on the
 * handle - page scroll stays available everywhere else). The board persists
 * 100% locally: Tasky is local-by-design, like the rest of the study toolkit.
 */

type Priority = "Low" | "Medium" | "High" | "Urgent";

type TaskyCard = {
  id: string;
  title: string;
  tag: string;
  priority: Priority;
  assignee: string;
  /** ISO date or undefined - rendered as “Apr 20”. */
  due?: string;
};

type TaskyColumn = {
  id: string;
  title: string;
  /** Tailwind bg class of the header dot. */
  dot: string;
  cards: TaskyCard[];
};

const PRIORITY_CLASS: Record<Priority, string> = {
  Low: "bg-blue-500 text-white",
  Medium: "bg-amber-500 text-white",
  High: "bg-orange-600 text-white",
  Urgent: "bg-red-600 text-white",
};

/** Dot palette cycled by newly created lists. */
const DOT_CYCLE = [
  "bg-violet-500",
  "bg-sky-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-pink-500",
  "bg-cyan-400",
  "bg-orange-500",
  "bg-muted-foreground",
];

function seedBoard(): TaskyColumn[] {
  return [
    {
      id: "backlog",
      title: "Backlog",
      dot: "bg-muted-foreground/70",
      cards: [
        { id: "c1", title: "Implement OAuth 2.0 SSO integration", tag: "Feature", priority: "High", assignee: "AK", due: "2026-04-20" },
        { id: "c2", title: "Add CSV export for reports dashboard", tag: "Enhancement", priority: "Medium", assignee: "SL", due: "2026-04-28" },
        { id: "c3", title: "Migrate legacy REST endpoints to GraphQL", tag: "Refactor", priority: "Low", assignee: "JW", due: "2026-05-10" },
        { id: "c4", title: "Set up Datadog APM traces for API layer", tag: "DevOps", priority: "Medium", assignee: "RC", due: "2026-05-05" },
      ],
    },
    {
      id: "todo",
      title: "Todo",
      dot: "bg-violet-500",
      cards: [
        { id: "c5", title: "Redesign onboarding flow (3-step wizard)", tag: "Design", priority: "High", assignee: "MT", due: "2026-04-18" },
        { id: "c6", title: "Write unit tests for payment service", tag: "Testing", priority: "High", assignee: "AK", due: "2026-04-16" },
        { id: "c7", title: "Localize app strings for EU markets", tag: "i18n", priority: "Medium", assignee: "SL", due: "2026-04-25" },
      ],
    },
    {
      id: "in-progress",
      title: "In Progress",
      dot: "bg-sky-500",
      cards: [
        { id: "c8", title: "Fix memory leak in WebSocket handler", tag: "Bug", priority: "Urgent", assignee: "JW", due: "2026-04-12" },
        { id: "c9", title: "Build real-time notifications with SSE", tag: "Feature", priority: "High", assignee: "RC", due: "2026-04-15" },
        { id: "c10", title: "Optimize Lighthouse score to 95+", tag: "Performance", priority: "Medium", assignee: "MT", due: "2026-04-22" },
      ],
    },
    {
      id: "in-review",
      title: "In Review",
      dot: "bg-amber-400",
      cards: [
        { id: "c11", title: "Dark mode support across all components", tag: "Enhancement", priority: "Medium", assignee: "AK", due: "2026-04-13" },
        { id: "c12", title: "Rate limiting middleware for public API", tag: "Security", priority: "High", assignee: "SL", due: "2026-04-11" },
      ],
    },
    {
      id: "done",
      title: "Done",
      dot: "bg-emerald-500",
      cards: [
        { id: "c13", title: "Set up CI/CD pipeline with GitHub Actions", tag: "DevOps", priority: "High", assignee: "JW" },
        { id: "c14", title: "Implement row-level security in Postgres", tag: "Security", priority: "Urgent", assignee: "RC" },
        { id: "c15", title: "Add Stripe webhook signature validation", tag: "Bug", priority: "High", assignee: "MT" },
      ],
    },
  ];
}

const STORAGE_KEY = "cosmoz.tasky.board.v1";

function loadBoard(): TaskyColumn[] {
  if (typeof window === "undefined") return seedBoard();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedBoard();
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (column) =>
          typeof column === "object" &&
          column !== null &&
          typeof (column as TaskyColumn).id === "string" &&
          Array.isArray((column as TaskyColumn).cards),
      )
    ) {
      return parsed as TaskyColumn[];
    }
  } catch {
    // Corrupted snapshot - fall through to the seed.
  }
  return seedBoard();
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDue(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type DragState = {
  cardId: string;
  fromCol: string;
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  width: number;
  overCol: string | null;
  overIndex: number;
};

export function TaskyView() {
  const [columns, setColumns] = React.useState<TaskyColumn[]>(seedBoard);
  const [hydrated, setHydrated] = React.useState(false);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [addingIn, setAddingIn] = React.useState<string | null>(null);
  const [addTitle, setAddTitle] = React.useState("");
  const [addingList, setAddingList] = React.useState(false);
  const [listTitle, setListTitle] = React.useState("");

  const columnRefs = React.useRef<Map<string, HTMLElement>>(new Map());
  const dragRef = React.useRef<DragState | null>(null);

  // Hydrate from local storage after mount (hydration-safe), then persist.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration-safe local load: the server renders the seed, the client swaps in the persisted board right after mount
    setColumns(loadBoard());
    setHydrated(true);
  }, []);
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch {
      // Storage full/unavailable - the board still works for the session.
    }
  }, [columns, hydrated]);

  const setDragState = React.useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /** Resolve the hovered column + insertion index from live DOM geometry. */
  const resolveTarget = React.useCallback((clientX: number, clientY: number): { col: string | null; index: number } => {
    for (const [colId, el] of columnRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top - 8 && clientY <= rect.bottom + 8) {
        const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-tasky-card]"));
        let index = cards.length;
        for (let i = 0; i < cards.length; i += 1) {
          const cardRect = cards[i].getBoundingClientRect();
          if (clientY < cardRect.top + cardRect.height / 2) {
            index = i;
            break;
          }
        }
        return { col: colId, index };
      }
    }
    return { col: null, index: 0 };
  }, []);

  const startDrag = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, card: TaskyCard, fromCol: string) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const cardEl = event.currentTarget.closest<HTMLElement>("[data-tasky-card]");
      const rect = cardEl?.getBoundingClientRect();
      const target = resolveTarget(event.clientX, event.clientY);
      setDragState({
        cardId: card.id,
        fromCol,
        grabX: rect ? event.clientX - rect.left : 124,
        grabY: rect ? event.clientY - rect.top : 24,
        x: event.clientX,
        y: event.clientY,
        width: rect?.width ?? 248,
        overCol: target.col,
        overIndex: target.index,
      });
    },
    [resolveTarget, setDragState],
  );

  // Global pointer tracking - ONE path for cursor AND finger drags.
  React.useEffect(() => {
    if (!drag) return;
    let lastPoint = { x: drag.x, y: drag.y };
    const onMove = (event: PointerEvent) => {
      lastPoint = { x: event.clientX, y: event.clientY };
      const current = dragRef.current;
      if (!current) return;
      const target = resolveTarget(event.clientX, event.clientY);
      setDragState({ ...current, x: event.clientX, y: event.clientY, overCol: target.col, overIndex: target.index });
    };
    const onUp = () => {
      const current = dragRef.current;
      if (!current) return;
      const target = resolveTarget(lastPoint.x, lastPoint.y);
      if (target.col !== null) {
        setColumns((prev) => {
          const fromColumn = prev.find((column) => column.id === current.fromCol);
          const moved = fromColumn?.cards.find((card) => card.id === current.cardId);
          if (!moved) return prev;
          // The DOM insertion index counts the dragged card itself while it
          // still sits in its source column - compensate on same-column drops.
          let insertAt = target.index ?? 0;
          if (target.col === current.fromCol && fromColumn) {
            const originalIndex = fromColumn.cards.findIndex((card) => card.id === current.cardId);
            if (originalIndex !== -1 && insertAt > originalIndex) insertAt -= 1;
          }
          return prev.map((column) => {
            const without = column.cards.filter((card) => card.id !== current.cardId);
            if (column.id === target.col) {
              const cards = [...without];
              cards.splice(Math.min(insertAt, cards.length), 0, moved);
              return { ...column, cards };
            }
            return { ...column, cards: without };
          });
        });
      }
      setDragState(null);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, resolveTarget, setDragState]);

  const commitAdd = (columnId: string) => {
    const trimmed = addTitle.trim();
    if (trimmed === "") return;
    setColumns((prev) =>
      prev.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [
                ...column.cards,
                { id: newId("card"), title: trimmed, tag: "Task", priority: "Medium" as Priority, assignee: "ME" },
              ],
            }
          : column,
      ),
    );
    setAddTitle("");
    setAddingIn(null);
  };

  const commitAddList = () => {
    const trimmed = listTitle.trim();
    if (trimmed === "") return;
    setColumns((prev) => [
      ...prev,
      { id: newId("list"), title: trimmed, dot: DOT_CYCLE[prev.length % DOT_CYCLE.length], cards: [] },
    ]);
    setListTitle("");
    setAddingList(false);
  };

  const removeCard = (columnId: string, cardId: string) => {
    setColumns((prev) =>
      prev.map((column) =>
        column.id === columnId ? { ...column, cards: column.cards.filter((card) => card.id !== cardId) } : column,
      ),
    );
  };

  const dragCard = drag ? columns.flatMap((column) => column.cards).find((card) => card.id === drag.cardId) : undefined;

  return (
    <div className="flex flex-col" data-testid="tasky-view">
      {/* Board - columns added horizontally (left → right), board scrolls X */}
      <div data-testid="tasky-board" className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 pt-1">
        {columns.map((column) => {
          const isOver = drag !== null && drag.overCol === column.id;
          return (
            <section
              key={column.id}
              ref={(el) => {
                if (el) columnRefs.current.set(column.id, el);
                else columnRefs.current.delete(column.id);
              }}
              data-testid={`tasky-column-${column.id}`}
              data-tasky-column={column.title}
              aria-label={column.title}
              className={cn(
                "flex w-[272px] shrink-0 flex-col gap-2.5 rounded-xl border bg-background/40 p-2.5 transition-colors sm:w-[280px]",
                isOver ? "border-accent/60 bg-accent/[0.04]" : "border-border/70",
              )}
            >
              <header className="flex items-center gap-2 px-1">
                <span className={cn("size-2 shrink-0 rounded-full", column.dot)} aria-hidden="true" />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{column.title}</h2>
                <span
                  data-testid={`tasky-count-${column.id}`}
                  className="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums text-muted-foreground"
                >
                  {column.cards.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAddingIn(column.id);
                    setAddTitle("");
                  }}
                  data-testid={`tasky-add-${column.id}`}
                  aria-label={`Add card to ${column.title}`}
                  title={`Add card to ${column.title}`}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
              </header>

              {/* Cards */}
              {column.cards.map((card, index) => {
                const isDragged = drag?.cardId === card.id;
                const showSlotBefore = isOver && drag?.overIndex === index && drag.cardId !== card.id;
                return (
                  <React.Fragment key={card.id}>
                    {showSlotBefore ? (
                      <div data-testid="tasky-drop-slot" className="h-1 shrink-0 rounded-full bg-accent/70" />
                    ) : null}
                    <article
                      data-tasky-card
                      data-testid={`tasky-card-${card.id}`}
                      data-column={column.id}
                      className={cn(
                        "group relative shrink-0 rounded-lg border border-border bg-surface p-3 shadow-sm transition-colors hover:border-accent/40",
                        isDragged && "opacity-30",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug">{card.title}</h3>
                        <button
                          type="button"
                          aria-label={`Drag ${card.title}`}
                          title="Drag to move"
                          data-testid={`tasky-grip-${card.id}`}
                          onPointerDown={(event) => startDrag(event, card, column.id)}
                          className="-m-1 grid size-6 shrink-0 cursor-grab place-items-center rounded text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
                          style={{ touchAction: "none" }}
                        >
                          <GripVertical className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {card.tag}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white",
                            PRIORITY_CLASS[card.priority],
                          )}
                        >
                          {card.priority}
                        </span>
                      </div>
                      <footer className="mt-2.5 flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="grid size-6 place-items-center rounded-full border border-border bg-muted/60 text-[10px] font-semibold text-muted-foreground"
                        >
                          {card.assignee}
                        </span>
                        {card.due ? (
                          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarDays className="size-3" aria-hidden="true" />
                            {formatDue(card.due)}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeCard(column.id, card.id)}
                          aria-label={`Delete ${card.title}`}
                          title="Delete card"
                          data-testid={`tasky-delete-${card.id}`}
                          className={cn(
                            "ml-auto grid size-5 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-loss/10 hover:text-loss",
                            card.due ? "ml-1" : "ml-auto",
                            "hidden group-hover:grid [@media(hover:none)]:grid",
                          )}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </footer>
                    </article>
                  </React.Fragment>
                );
              })}

              {/* Drop slot at column end */}
              {isOver && drag !== null && drag.overIndex >= column.cards.length ? (
                <div data-testid="tasky-drop-slot" className="h-1 shrink-0 rounded-full bg-accent/70" />
              ) : null}

              {/* Inline add-card form */}
              {addingIn === column.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitAdd(column.id);
                  }}
                  className="flex shrink-0 flex-col gap-2 rounded-lg border border-accent/40 bg-surface p-2"
                  data-testid={`tasky-add-form-${column.id}`}
                >
                  <Input
                    autoFocus
                    value={addTitle}
                    onChange={(event) => setAddTitle(event.target.value)}
                    placeholder="Task title…"
                    aria-label={`New card title for ${column.title}`}
                    data-testid={`tasky-add-input-${column.id}`}
                    maxLength={140}
                    className="h-8 bg-background text-sm"
                  />
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="submit"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs"
                      disabled={addTitle.trim() === ""}
                      data-testid={`tasky-add-confirm-${column.id}`}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => setAddingIn(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </section>
          );
        })}

        {/* Add list - appended at the right end of the horizontal flow */}
        <div className="w-[272px] shrink-0 sm:w-[280px]" data-testid="tasky-add-list-zone">
          {addingList ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                commitAddList();
              }}
              className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-surface p-2.5"
              data-testid="tasky-add-list-form"
            >
              <Input
                autoFocus
                value={listTitle}
                onChange={(event) => setListTitle(event.target.value)}
                placeholder="List title…"
                aria-label="New list title"
                data-testid="tasky-add-list-input"
                maxLength={40}
                className="h-8 bg-background text-sm"
              />
              <div className="flex items-center gap-1.5">
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs"
                  disabled={listTitle.trim() === ""}
                  data-testid="tasky-add-list-confirm"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  Add list
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setAddingList(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingList(true)}
              data-testid="tasky-add-list"
              className="flex h-10 w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add list
            </button>
          )}
        </div>
      </div>

      {/* Drag ghost - fixed overlay following the pointer (cursor or finger) */}
      {drag && dragCard ? (
        <div
          aria-hidden="true"
          data-testid="tasky-drag-ghost"
          className="pointer-events-none fixed z-[70] rotate-1 opacity-95"
          style={{ width: drag.width, left: drag.x - drag.grabX, top: drag.y - drag.grabY }}
        >
          <div className="rounded-lg border border-accent/60 bg-surface p-3 shadow-2xl">
            <h3 className="text-sm font-medium leading-snug">{dragCard.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {dragCard.tag}
              </span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white", PRIORITY_CLASS[dragCard.priority])}>
                {dragCard.priority}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {drag ? <div className="fixed inset-0 z-[60] cursor-grabbing" aria-hidden="true" data-testid="tasky-drag-veil" /> : null}
    </div>
  );
}
