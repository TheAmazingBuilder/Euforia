"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Calendar, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/i18n-provider";
import {
  COLUMN_TONE_COLOR,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  SEED_COLUMNS,
  SEED_TASKS,
  type BoardColumn,
  type BoardOrdering,
  type BoardTask,
  type TaskPriority,
  type TaskDraft,
  appendTask,
  boardOrderingFromColumns,
  formatDueDate,
  moveTask,
  moveTaskToEnd,
  nextTaskId,
  removeTaskFromOrdering,
} from "@/lib/tasky/tasky";
import { cn } from "@/lib/utils";

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

/* ------------------------------------------------------------------ */
/* Card body — shared by the inline card and the floating drag clone.  */
/* ------------------------------------------------------------------ */

function TaskCardBody({
  task,
  dueAria,
  withTestIds,
}: {
  task: BoardTask;
  dueAria: string;
  withTestIds: boolean;
}) {
  const priority = PRIORITY_COLOR[task.priority];
  return (
    <>
      <p className="pr-4 text-sm font-medium leading-snug">{task.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.category ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {task.category}
          </span>
        ) : null}
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{ color: priority.fg, backgroundColor: priority.bg }}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {task.assignee ? (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold"
            aria-label={`${dueAria} — ${task.assignee}`}
            data-testid={withTestIds ? `tasky-avatar-${task.id}` : undefined}
          >
            {task.assignee}
          </span>
        ) : (
          <span />
        )}
        {task.due ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Calendar className="h-3 w-3" aria-hidden />
            {formatDueDate(task.due)}
          </span>
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Card — pointer-based drag (mouse, touch AND pen) + click to open.   */
/* touch-none lets the pointer stream survive on touch screens: the    */
/* browser never claims the gesture for scrolling, so a finger drags   */
/* the card exactly like a cursor does. Board panning stays available  */
/* on headers, gaps and empty dropzone areas.                          */
/* ------------------------------------------------------------------ */

function TaskCard({
  task,
  dragging,
  kbdActive,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onOpen,
  onHandleKeyDown,
  dragHandleAria,
  dueAria,
}: {
  task: BoardTask;
  dragging: boolean;
  kbdActive: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, taskId: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onOpen: (taskId: string) => void;
  onHandleKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, taskId: string) => void;
  dragHandleAria: string;
  dueAria: string;
}) {
  // The click guard is resolved by the parent (drag suppresses the open).
  const handleOpen = () => onOpen(task.id);

  return (
    <div
      data-task-id={task.id}
      data-testid={`tasky-card-${task.id}`}
      onPointerDown={(event) => onPointerDown(event, task.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={handleOpen}
      className={cn(
        "group relative touch-none select-none cursor-grab rounded-lg border border-border bg-surface-raised p-3 pr-8 shadow-sm transition-[opacity,border-color,box-shadow] active:cursor-grabbing hover:border-accent/50 hover:shadow-md",
        dragging && "opacity-40",
        kbdActive && "ring-2 ring-accent",
      )}
    >
      <button
        type="button"
        aria-label={`${dragHandleAria}: ${task.title}`}
        data-testid={`tasky-handle-${task.id}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => onHandleKeyDown(event, task.id)}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <TaskCardBody task={task} dueAria={dueAria} withTestIds />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Column                                                              */
/* ------------------------------------------------------------------ */

function DropIndicator({ columnId }: { columnId: string }) {
  return (
    <div
      aria-hidden
      data-testid={`tasky-indicator-${columnId}`}
      className="h-1 shrink-0 rounded-full bg-accent/80"
    />
  );
}

function BoardColumnView({
  column,
  tasks,
  pointerDragId,
  dropTarget,
  kbdTaskId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onOpenTask,
  onHandleKeyDown,
  onQuickAdd,
  copy,
}: {
  column: BoardColumn;
  tasks: BoardTask[];
  pointerDragId: string | null;
  dropTarget: { columnId: string; index: number } | null;
  kbdTaskId: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, taskId: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onOpenTask: (taskId: string) => void;
  onHandleKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, taskId: string) => void;
  onQuickAdd: (columnId: string) => void;
  copy: {
    columnAria: string;
    dragHandleAria: string;
    dueDateAria: string;
    emptyColumn: string;
    quickAddAria: string;
  };
}) {
  const isDropTarget =
    pointerDragId !== null && dropTarget?.columnId === column.id;
  const showIndicator = isDropTarget && dropTarget !== null;

  // Cards with the insertion indicator spliced in at the drop index
  // (the index counts every card except the one being dragged).
  let othersSeen = 0;
  const nodes: React.ReactNode[] = [];
  tasks.forEach((task) => {
    const isDragged = task.id === pointerDragId;
    if (showIndicator && !isDragged && othersSeen === dropTarget?.index) {
      nodes.push(<DropIndicator key={`${column.id}-indicator`} columnId={column.id} />);
    }
    if (!isDragged) othersSeen += 1;
    nodes.push(
      <TaskCard
        key={task.id}
        task={task}
        dragging={isDragged}
        kbdActive={kbdTaskId === task.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onOpen={onOpenTask}
        onHandleKeyDown={onHandleKeyDown}
        dragHandleAria={copy.dragHandleAria}
        dueAria={copy.dueDateAria}
      />,
    );
  });
  if (showIndicator && othersSeen === dropTarget?.index) {
    nodes.push(<DropIndicator key={`${column.id}-indicator-end`} columnId={column.id} />);
  }

  return (
    <section
      role="listitem"
      aria-label={`${copy.columnAria}: ${column.title}`}
      className="flex w-[268px] shrink-0 flex-col rounded-xl border border-border bg-surface/50 p-2 sm:w-[280px]"
      data-testid={`tasky-column-${column.id}`}
      data-count={tasks.length}
    >
      <header className="flex items-center gap-2 px-1 py-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: COLUMN_TONE_COLOR[column.tone] }}
          aria-hidden
        />
        <h3 className="text-sm font-medium">{column.title}</h3>
        <span
          className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground"
          data-testid={`tasky-count-${column.id}`}
        >
          {tasks.length}
        </span>
        <button
          type="button"
          aria-label={`${copy.quickAddAria}: ${column.title}`}
          data-testid={`tasky-column-add-${column.id}`}
          onClick={() => onQuickAdd(column.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      <div
        className={cn(
          "flex min-h-[96px] flex-col gap-2 rounded-lg p-1 transition-colors",
          isDropTarget && "bg-accent/[0.05] ring-1 ring-accent/40",
        )}
        data-testid={`tasky-dropzone-${column.id}`}
        data-dropzone-column={column.id}
      >
        {nodes.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {copy.emptyColumn}
          </p>
        ) : (
          nodes
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

type ModalState = { mode: "create" } | { mode: "edit"; taskId: string } | null;

const EMPTY_FORM: TaskDraft = {
  title: "",
  category: "",
  priority: "medium",
  assignee: "",
  due: "",
};

export function SprintBoard() {
  const { dict } = useI18n();
  const t = dict.tasky;

  const [tasks, setTasks] = React.useState<BoardTask[]>(SEED_TASKS);
  const [ordering, setOrdering] = React.useState<BoardOrdering>(() =>
    boardOrderingFromColumns(SEED_COLUMNS),
  );
  const tasksById = React.useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const categoryOptions = React.useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => task.category).filter(Boolean))).sort(),
    [tasks],
  );

  /* ---------------- drag state ---------------- */
  const [pointerDragId, setPointerDragId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{
    columnId: string;
    index: number;
  } | null>(null);
  const [kbdDrag, setKbdDrag] = React.useState<{
    taskId: string;
    origin: BoardOrdering;
  } | null>(null);
  const [liveMessage, setLiveMessage] = React.useState("");

  const boardScrollRef = React.useRef<HTMLDivElement | null>(null);
  const floatRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    taskId: string;
    pointerId: number;
    startX: number;
    startY: number;
    grabDx: number;
    grabDy: number;
    width: number;
    pending: boolean;
    active: boolean;
  } | null>(null);
  const lastPointRef = React.useRef({ x: 0, y: 0 });
  const frameRef = React.useRef(0);
  const suppressClickRef = React.useRef(false);

  const columnIdOf = React.useCallback(
    (taskId: string) =>
      SEED_COLUMNS.find((column) => (ordering[column.id] ?? []).includes(taskId))
        ?.id ?? null,
    [ordering],
  );

  const endPointerDrag = React.useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    dragRef.current = null;
    setPointerDragId(null);
    setDropTarget(null);
  }, []);

  const moveFloat = React.useCallback((x: number, y: number) => {
    const drag = dragRef.current;
    const float = floatRef.current;
    if (!drag || !float) return;
    float.style.transform = `translate3d(${x - drag.grabDx}px, ${y - drag.grabDy}px, 0)`;
  }, []);

  const resolveDropTarget = React.useCallback(
    (x: number, y: number, draggedId: string) => {
      const el = document.elementFromPoint(x, y);
      const zone = el?.closest<HTMLElement>("[data-dropzone-column]");
      if (!zone?.dataset.dropzoneColumn) return null;
      const columnId = zone.dataset.dropzoneColumn;
      let index = 0;
      const cards = zone.querySelectorAll<HTMLElement>("[data-task-id]");
      for (const card of cards) {
        if (card.dataset.taskId === draggedId) continue;
        const rect = card.getBoundingClientRect();
        if (y > rect.top + rect.height / 2) index += 1;
      }
      return { columnId, index };
    },
    [],
  );

  /** One rAF loop while dragging: board edge auto-scroll + drop resolve. */
  const startDragLoop = React.useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    const step = () => {
      const drag = dragRef.current;
      if (!drag?.active) return;
      const scroller = boardScrollRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const edge = 56;
        if (lastPointRef.current.x < rect.left + edge) scroller.scrollLeft -= 12;
        else if (lastPointRef.current.x > rect.right - edge) scroller.scrollLeft += 12;
      }
      const next = resolveDropTarget(
        lastPointRef.current.x,
        lastPointRef.current.y,
        drag.taskId,
      );
      setDropTarget((prev) =>
        prev && next && prev.columnId === next.columnId && prev.index === next.index
          ? prev
          : next,
      );
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [resolveDropTarget]);

  const onCardPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, taskId: string) => {
      if (kbdDrag !== null) return; // keyboard mode owns the board while active
      if (event.pointerType === "mouse" && event.button !== 0) return;
      suppressClickRef.current = false;
      const card = event.currentTarget;
      const rect = card.getBoundingClientRect();
      dragRef.current = {
        taskId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabDx: event.clientX - rect.left,
        grabDy: event.clientY - rect.top,
        width: rect.width,
        pending: true,
        active: false,
      };
      // Keep every pointer event flowing to this element, whatever it
      // travels over (fingers included — this is what makes touch work).
      card.setPointerCapture(event.pointerId);
    },
    [kbdDrag],
  );

  const onCardPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      lastPointRef.current = { x: event.clientX, y: event.clientY };
      if (drag.pending) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.hypot(dx, dy) < 6) return;
        drag.pending = false;
        drag.active = true;
        setPointerDragId(drag.taskId);
        if (
          event.pointerType !== "mouse" &&
          typeof navigator !== "undefined" &&
          typeof navigator.vibrate === "function"
        ) {
          navigator.vibrate(8);
        }
        startDragLoop();
      }
      if (drag.active) moveFloat(event.clientX, event.clientY);
    },
    [startDragLoop, moveFloat],
  );

  const onCardPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.active) {
        suppressClickRef.current = true;
        const target = resolveDropTarget(event.clientX, event.clientY, drag.taskId);
        if (target) {
          const { columnId, index } = target;
          setOrdering((current) => moveTask(current, drag.taskId, columnId, index));
        }
      }
      endPointerDrag();
    },
    [endPointerDrag, resolveDropTarget],
  );

  const onCardPointerCancel = React.useCallback(() => {
    endPointerDrag();
  }, [endPointerDrag]);

  // Escape aborts an in-flight pointer drag.
  React.useEffect(() => {
    if (!pointerDragId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") endPointerDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endPointerDrag, pointerDragId]);

  // Position the floating clone as soon as it mounts.
  React.useEffect(() => {
    if (!pointerDragId) return;
    const drag = dragRef.current;
    const float = floatRef.current;
    if (!drag || !float) return;
    float.style.width = `${drag.width}px`;
    moveFloat(lastPointRef.current.x, lastPointRef.current.y);
  }, [moveFloat, pointerDragId]);

  React.useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  /* ---------------- keyboard drag handlers ---------------- */
  const onHandleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, taskId: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (kbdDrag && kbdDrag.taskId !== taskId) return;
        const title = tasksById.get(taskId)?.title ?? "";
        if (kbdDrag) {
          const column = SEED_COLUMNS.find(
            (item) => item.id === columnIdOf(taskId),
          );
          setKbdDrag(null);
          setLiveMessage(
            t.kbdDropped
              .replace("{title}", title)
              .replace("{column}", column?.title ?? ""),
          );
        } else {
          setKbdDrag({ taskId, origin: ordering });
          setLiveMessage(t.kbdGrabbed.replace("{title}", title));
        }
        return;
      }
      if (!kbdDrag || kbdDrag.taskId !== taskId) return;
      const columnId = columnIdOf(taskId);
      if (!columnId) return;
      const index = (ordering[columnId] ?? []).indexOf(taskId);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOrdering(
          moveTask(ordering, taskId, columnId, index + (event.key === "ArrowDown" ? 1 : -1)),
        );
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const position = SEED_COLUMNS.findIndex((item) => item.id === columnId);
        const target = SEED_COLUMNS[position + (event.key === "ArrowRight" ? 1 : -1)];
        if (target) setOrdering(moveTask(ordering, taskId, target.id, index));
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOrdering(kbdDrag.origin);
        setKbdDrag(null);
        setLiveMessage(t.kbdCancelled);
      }
    },
    [columnIdOf, kbdDrag, ordering, t, tasksById],
  );

  /* ---------------- modal + details state ---------------- */
  const [modal, setModal] = React.useState<ModalState>(null);
  const [form, setForm] = React.useState<TaskDraft>(EMPTY_FORM);
  const [formColumn, setFormColumn] = React.useState(SEED_COLUMNS[0].id);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const openCreate = React.useCallback((columnId: string) => {
    setForm(EMPTY_FORM);
    setFormColumn(columnId);
    setModal({ mode: "create" });
  }, []);

  const openEdit = React.useCallback(
    (taskId: string) => {
      const task = tasksById.get(taskId);
      if (!task) return;
      setForm({
        title: task.title,
        category: task.category,
        priority: task.priority,
        assignee: task.assignee,
        due: task.due,
      });
      setFormColumn(columnIdOf(taskId) ?? SEED_COLUMNS[0].id);
      setDetailId(null);
      setModal({ mode: "edit", taskId });
    },
    [columnIdOf, tasksById],
  );

  const openTask = React.useCallback((taskId: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDetailId(taskId);
  }, []);

  const normalizeForm = (draft: TaskDraft): TaskDraft => ({
    title: draft.title.trim(),
    category: draft.category.trim(),
    priority: draft.priority,
    assignee: draft.assignee.trim().toUpperCase().slice(0, 3),
    due: draft.due,
  });

  const submitTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    const values = normalizeForm(form);
    if (modal?.mode === "edit") {
      const taskId = modal.taskId;
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, ...values } : task,
        ),
      );
      const currentColumn = columnIdOf(taskId);
      if (currentColumn && currentColumn !== formColumn) {
        setOrdering((current) => moveTaskToEnd(current, taskId, formColumn));
      }
    } else {
      const id = nextTaskId();
      setTasks((current) => [...current, { ...values, id }]);
      setOrdering((current) => appendTask(current, id, formColumn));
    }
    setModal(null);
  };

  const deleteTask = React.useCallback(
    (taskId: string) => {
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setOrdering((current) => removeTaskFromOrdering(current, taskId));
      setDetailId(null);
      setModal(null);
    },
    [],
  );

  const detailTask = detailId ? tasksById.get(detailId) : undefined;
  const detailColumn = detailId
    ? SEED_COLUMNS.find((column) => column.id === columnIdOf(detailId))
    : undefined;
  const draggedTask = pointerDragId ? tasksById.get(pointerDragId) : undefined;

  return (
    <div className="flex flex-col gap-3" data-testid="tasky-view">
      {/* Toolbar (board title removed per product decision) */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => openCreate(SEED_COLUMNS[0].id)}
          data-testid="tasky-new-task"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t.newTask}
        </Button>
      </div>

      <div
        className="select-none overflow-x-auto pb-2"
        data-testid="tasky-board-scroll"
        ref={boardScrollRef}
      >
        <div
          role="list"
          aria-label={t.boardAria}
          className="flex min-w-max gap-3"
          data-testid="tasky-board"
        >
          {SEED_COLUMNS.map((column) => {
            const columnTasks = (ordering[column.id] ?? []).map(
              (taskId) => tasksById.get(taskId) as BoardTask,
            );
            return (
              <BoardColumnView
                key={column.id}
                column={column}
                tasks={columnTasks}
                pointerDragId={pointerDragId}
                dropTarget={dropTarget}
                kbdTaskId={kbdDrag?.taskId ?? null}
                onPointerDown={onCardPointerDown}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onPointerCancel={onCardPointerCancel}
                onOpenTask={openTask}
                onHandleKeyDown={onHandleKeyDown}
                onQuickAdd={openCreate}
                copy={{
                  columnAria: t.columnAria,
                  dragHandleAria: t.dragHandleAria,
                  dueDateAria: t.dueDateAria,
                  emptyColumn: t.emptyColumn,
                  quickAddAria: t.quickAddAria,
                }}
              />
            );
          })}
        </div>
      </div>

      <p aria-live="polite" role="status" className="sr-only" data-testid="tasky-live">
        {liveMessage}
      </p>

      {/* Floating drag clone (portal: immune to ancestor transforms) */}
      {pointerDragId && draggedTask && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={floatRef}
              aria-hidden
              className="pointer-events-none fixed left-0 top-0 z-50 rotate-[2deg] scale-[1.02] rounded-lg border border-accent/60 bg-surface-raised p-3 pr-8 shadow-xl"
            >
              <TaskCardBody task={draggedTask} dueAria={t.dueDateAria} withTestIds={false} />
            </div>,
            document.body,
          )
        : null}

      {/* Task details */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm" data-testid="tasky-detail-dialog">
          {detailTask ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailTask.title}</DialogTitle>
                <DialogDescription>{t.detailsAria}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-1.5">
                {detailTask.category ? (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {detailTask.category}
                  </span>
                ) : null}
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    color: PRIORITY_COLOR[detailTask.priority].fg,
                    backgroundColor: PRIORITY_COLOR[detailTask.priority].bg,
                  }}
                >
                  {PRIORITY_LABEL[detailTask.priority]}
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t.assigneeLabel}</dt>
                  <dd>{detailTask.assignee || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t.dueLabel}</dt>
                  <dd className="text-right tabular-nums">
                    {detailTask.due ? formatDueDate(detailTask.due) : t.noDueDate}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t.columnLabel}</dt>
                  <dd className="flex items-center gap-2 text-right">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: detailColumn
                          ? COLUMN_TONE_COLOR[detailColumn.tone]
                          : undefined,
                      }}
                      aria-hidden
                    />
                    {detailColumn?.title}
                  </dd>
                </div>
              </dl>
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => deleteTask(detailTask.id)}
                  data-testid="tasky-delete"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t.delete}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openEdit(detailTask.id)}
                  data-testid="tasky-edit"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {t.edit}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Create / edit modal */}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="tasky-task-modal">
          <DialogHeader>
            <DialogTitle data-testid="tasky-modal-title">
              {modal?.mode === "edit" ? t.editTitle : t.createTitle}
            </DialogTitle>
            <DialogDescription>{t.modalDescription}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTask} className="space-y-3" data-testid="tasky-task-form">
            <div className="space-y-1.5">
              <Label htmlFor="tasky-task-title">{t.titleLabel}</Label>
              <Input
                id="tasky-task-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder={t.titlePlaceholder}
                autoFocus
                data-testid="tasky-task-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tasky-task-category">{t.categoryLabel}</Label>
                <Input
                  id="tasky-task-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder={t.categoryPlaceholder}
                  list="tasky-category-options"
                  data-testid="tasky-task-category"
                />
                <datalist id="tasky-category-options">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tasky-task-assignee">{t.assigneeLabel}</Label>
                <Input
                  id="tasky-task-assignee"
                  value={form.assignee}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, assignee: event.target.value }))
                  }
                  placeholder={t.assigneePlaceholder}
                  maxLength={3}
                  data-testid="tasky-task-assignee"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t.priorityLabel}</Label>
              <div
                role="radiogroup"
                aria-label={t.priorityLabel}
                className="flex flex-wrap gap-1.5"
              >
                {PRIORITY_ORDER.map((priority) => {
                  const active = form.priority === priority;
                  return (
                    <button
                      key={priority}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        setForm((current) => ({ ...current, priority }))
                      }
                      data-testid={`tasky-priority-${priority}`}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-transparent"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                      )}
                      style={
                        active
                          ? {
                              color: PRIORITY_COLOR[priority].fg,
                              backgroundColor: PRIORITY_COLOR[priority].bg,
                            }
                          : undefined
                      }
                    >
                      {PRIORITY_LABEL[priority]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tasky-task-due">
                  {t.dueLabel}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({t.dueOptional})
                  </span>
                </Label>
                <Input
                  id="tasky-task-due"
                  type="date"
                  value={form.due}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, due: event.target.value }))
                  }
                  data-testid="tasky-task-due"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tasky-task-column">{t.columnLabel}</Label>
                <Select value={formColumn} onValueChange={setFormColumn}>
                  <SelectTrigger
                    id="tasky-task-column"
                    className="w-full"
                    data-testid="tasky-task-column"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEED_COLUMNS.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModal(null)}
                data-testid="tasky-task-cancel"
              >
                {t.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={!form.title.trim()} data-testid="tasky-task-submit">
                {modal?.mode === "edit" ? t.save : t.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
