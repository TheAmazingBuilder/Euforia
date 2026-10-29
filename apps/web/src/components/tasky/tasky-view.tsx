"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  GripVertical,
  ExternalLink,
  FileText,
  History,
  Link2,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Send,
  MoreHorizontal,
  Pencil,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  taskyKanbanBoardStateSchema,
  type TaskyKanbanActivity,
  type TaskyKanbanActivityType,
  type TaskyKanbanBoardState,
  type TaskyKanbanCard as TaskyCard,
  type TaskyKanbanColumn as TaskyColumn,
  type TaskyKanbanPriority as Priority,
} from "@cosmoz/shared";
import { filterTaskyCards } from "./tasky-filters";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTaskySavedView, useDeleteTaskyAttachment, useDeleteTaskySavedView, useDownloadTaskyAttachment, useSaveTaskyBoard, useTaskyBoard, useTaskyCardAttachments, useTaskySavedViews, useUploadTaskyAttachment } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Tasky - the trading kanban (Academy section, independent module).
 * Columns flow horizontally (left → right) inside a horizontally scrollable
 * board; cards move between columns by dragging the grip handle with the
 * cursor OR a finger (unified Pointer Events path, touch-action: none on the
 * handle - page scroll stays available everywhere else). The board persists
 * through Euforia's authenticated API in PostgreSQL, with a one-time import from the previous browser-only snapshot.
 */

// Board and card contracts are shared with the authenticated API.

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

const LEGACY_STORAGE_KEY = "cosmoz.tasky.board.v1";

/**
 * One-time import only: before this API-backed version, the board lived in
 * this browser key. Once PostgreSQL has a board, the server is authoritative.
 */
function loadLegacyBoard(): TaskyColumn[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const validated = taskyKanbanBoardStateSchema.safeParse({ columns: parsed });
    return validated.success ? validated.data.columns : null;
  } catch {
    // Invalid or unavailable legacy storage is never trusted as server data.
    return null;
  }
}

function clearLegacyBoard(): void {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // The database remains authoritative; storage cleanup is best-effort.
  }
}

const TASKY_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const TASKY_ATTACHMENT_MIME_BY_EXTENSION: Record<string, "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | "text/plain" | "text/csv" | "text/markdown"> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", md: "text/markdown", markdown: "text/markdown",
};
function fileSizeLabel(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return window.btoa(chunks.join(""));
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

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function makeActivity(type: TaskyKanbanActivityType, message: string): TaskyKanbanActivity {
  return { id: newId("activity"), type, message, createdAt: new Date().toISOString() };
}

function withActivity(card: TaskyCard, type: TaskyKanbanActivityType, message: string): TaskyCard {
  return { ...card, activity: [...(card.activity ?? []), makeActivity(type, message)].slice(-100) };
}

function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const candidate = lower.startsWith("https://") || lower.startsWith("http://") ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
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
  const boardQuery = useTaskyBoard();
  const boardSave = useSaveTaskyBoard();
  const savedViewsQuery = useTaskySavedViews();
  const savedViewCreate = useCreateTaskySavedView();
  const savedViewDelete = useDeleteTaskySavedView();
  const [columns, setColumns] = React.useState<TaskyColumn[]>(seedBoard);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState<"all" | Priority>("all");
  const [dueFilter, setDueFilter] = React.useState<"all" | "overdue" | "upcoming" | "no-date">("all");
  const [sortOrder, setSortOrder] = React.useState<"manual" | "title" | "due" | "priority">("manual");
  const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
  const [savedViewDialogOpen, setSavedViewDialogOpen] = React.useState(false);
  const [savedViewName, setSavedViewName] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [addingIn, setAddingIn] = React.useState<string | null>(null);
  const [addTitle, setAddTitle] = React.useState("");
  const [addingList, setAddingList] = React.useState(false);
  const [listTitle, setListTitle] = React.useState("");
  const [editingListId, setEditingListId] = React.useState<string | null>(null);
  const [listEditTitle, setListEditTitle] = React.useState("");
  const [editingCardId, setEditingCardId] = React.useState<string | null>(null);
  const [cardDraft, setCardDraft] = React.useState<TaskyCard | null>(null);
  const [detailsCardId, setDetailsCardId] = React.useState<string | null>(null);
  const [checklistDraft, setChecklistDraft] = React.useState("");
  const [commentDraft, setCommentDraft] = React.useState("");
  const [linkTitleDraft, setLinkTitleDraft] = React.useState("");
  const [linkUrlDraft, setLinkUrlDraft] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);
  const attachmentQuery = useTaskyCardAttachments(detailsCardId);
  const attachmentUpload = useUploadTaskyAttachment();
  const attachmentDelete = useDeleteTaskyAttachment();
  const attachmentDownload = useDownloadTaskyAttachment();
  const descriptionOriginalRef = React.useRef("");

  const columnRefs = React.useRef<Map<string, HTMLElement>>(new Map());
  const dragRef = React.useRef<DragState | null>(null);
  const bootstrappedRef = React.useRef(false);
  const skipNextAutoSaveRef = React.useRef(false);
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  // Serialize full-board PUTs so a slower older request cannot finish after a newer state.
  const enqueueSave = React.useCallback((snapshot: TaskyKanbanBoardState) => {
    const next = saveQueueRef.current.catch(() => undefined).then(async () => {
      await boardSave.mutateAsync(snapshot);
      clearLegacyBoard();
    });
    saveQueueRef.current = next.then(() => undefined, () => undefined);
  }, [boardSave.mutateAsync]);

  // API wins once a board exists. If this is the first server load, import the
  // old browser-only snapshot once (or seed the familiar board for a new user).
  React.useEffect(() => {
    if (!boardQuery.isSuccess || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    skipNextAutoSaveRef.current = true;

    if (boardQuery.data.board) {
      setColumns(boardQuery.data.board.columns);
      setHydrated(true);
      // Avoid importing one account's legacy local board into another account later.
      clearLegacyBoard();
      return;
    }

    const initialColumns = loadLegacyBoard() ?? seedBoard();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from authenticated API, with a one-time legacy localStorage import only when no server board exists
    setColumns(initialColumns);
    setHydrated(true);
    enqueueSave({ columns: initialColumns });
  }, [boardQuery.data, boardQuery.isSuccess, enqueueSave]);

  // Persist the latest state after small bursts of drag/edit activity. Saves
  // are queued above; the visual interaction stays immediate and unchanged.
  React.useEffect(() => {
    if (!hydrated) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      enqueueSave({ columns });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [columns, hydrated, enqueueSave]);

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
          const destinationColumn = prev.find((column) => column.id === target.col);
          const sourceCard = fromColumn?.cards.find((card) => card.id === current.cardId);
          if (!sourceCard) return prev;
          const activityMessage = current.fromCol === target.col
            ? `Reordered within ${fromColumn?.title ?? "list"}`
            : `Moved from ${fromColumn?.title ?? "list"} to ${destinationColumn?.title ?? "list"}`;
          const moved = withActivity(sourceCard, "moved", activityMessage.slice(0, 180));
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
                withActivity(
                  { id: newId("card"), title: trimmed, tag: "Task", priority: "Medium" as Priority, assignee: "ME" },
                  "created",
                  "Created card",
                ),
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
    if (editingCardId === cardId) {
      setEditingCardId(null);
      setCardDraft(null);
    }
  };

  const beginRenameList = (column: TaskyColumn) => {
    setEditingListId(column.id);
    setListEditTitle(column.title);
  };

  const commitRenameList = () => {
    const trimmed = listEditTitle.trim();
    if (!trimmed || !editingListId) return;
    setColumns((prev) => prev.map((column) => column.id === editingListId ? { ...column, title: trimmed } : column));
    setEditingListId(null);
    setListEditTitle("");
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    setColumns((prev) => {
      const index = prev.findIndex((column) => column.id === columnId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeColumn = (column: TaskyColumn) => {
    if (columns.length <= 1) {
      window.alert("Tasky must keep at least one list.");
      return;
    }
    if (column.cards.length > 0 && !window.confirm(
      `Delete "${column.title}" and its ${column.cards.length} card(s)? This cannot be undone.`,
    )) return;
    setColumns((prev) => prev.filter((item) => item.id !== column.id));
    if (editingListId === column.id) setEditingListId(null);
    if (addingIn === column.id) setAddingIn(null);
    if (column.cards.some((card) => card.id === editingCardId)) {
      setEditingCardId(null);
      setCardDraft(null);
    }
  };

  const beginEditCard = (card: TaskyCard) => {
    setEditingCardId(card.id);
    setCardDraft({ ...card });
  };

  const updateCardDraft = <K extends keyof TaskyCard>(key: K, value: TaskyCard[K]) => {
    setCardDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const commitEditCard = (columnId: string) => {
    if (!cardDraft || !editingCardId || !cardDraft.title.trim() || !cardDraft.tag.trim() || !cardDraft.assignee.trim()) return;
    const updated = withActivity({
      ...cardDraft,
      title: cardDraft.title.trim(),
      tag: cardDraft.tag.trim(),
      assignee: cardDraft.assignee.trim(),
      due: cardDraft.due || undefined,
    }, "updated", "Updated card details");
    setColumns((prev) => prev.map((column) =>
      column.id === columnId
        ? { ...column, cards: column.cards.map((card) => card.id === editingCardId ? updated : card) }
        : column,
    ));
    setEditingCardId(null);
    setCardDraft(null);
  };

  const duplicateCard = (columnId: string, card: TaskyCard) => {
    const duplicate = withActivity({
      ...card,
      id: newId("card"),
      title: `${card.title} (copy)`.slice(0, 140),
      checklist: card.checklist?.map((item) => ({ ...item, id: newId("check") })),
      comments: [],
      activity: [],
      links: card.links?.map((link) => ({ ...link, id: newId("link"), createdAt: new Date().toISOString() })),
    }, "created", `Duplicated from “${card.title}”`.slice(0, 180));
    setColumns((prev) => prev.map((column) =>
      column.id === columnId ? { ...column, cards: [...column.cards, duplicate] } : column,
    ));
  };

  const updateCardDetails = (
    cardId: string,
    updates: Partial<Pick<TaskyCard, "description" | "checklist" | "comments" | "links">>,
    activity?: { type: TaskyKanbanActivityType; message: string },
  ) => {
    setColumns((prev) => prev.map((column) => ({
      ...column,
      cards: column.cards.map((card) => {
        if (card.id !== cardId) return card;
        const updated = { ...card, ...updates };
        return activity ? withActivity(updated, activity.type, activity.message) : updated;
      }),
    })));
  };

  const addChecklistItem = (card: TaskyCard) => {
    const text = checklistDraft.trim();
    if (!text || (card.checklist?.length ?? 0) >= 100) return;
    updateCardDetails(card.id, {
      checklist: [...(card.checklist ?? []), { id: newId("check"), text, completed: false }],
    }, { type: "checklist", message: `Added checklist step: ${text}`.slice(0, 180) });
    setChecklistDraft("");
  };

  const toggleChecklistItem = (card: TaskyCard, itemId: string, completed: boolean) => {
    const item = card.checklist?.find((entry) => entry.id === itemId);
    updateCardDetails(card.id, {
      checklist: (card.checklist ?? []).map((entry) => entry.id === itemId ? { ...entry, completed } : entry),
    }, {
      type: "checklist",
      message: `${completed ? "Completed" : "Reopened"} checklist step: ${item?.text ?? "item"}`.slice(0, 180),
    });
  };

  const removeChecklistItem = (card: TaskyCard, itemId: string) => {
    const item = card.checklist?.find((entry) => entry.id === itemId);
    updateCardDetails(card.id, {
      checklist: (card.checklist ?? []).filter((entry) => entry.id !== itemId),
    }, { type: "checklist", message: `Removed checklist step: ${item?.text ?? "item"}`.slice(0, 180) });
  };

  const addComment = (card: TaskyCard) => {
    const body = commentDraft.trim();
    if (!body || (card.comments?.length ?? 0) >= 100) return;
    const comment = { id: newId("comment"), author: "You", body, createdAt: new Date().toISOString() };
    updateCardDetails(card.id, {
      comments: [...(card.comments ?? []), comment],
    }, { type: "comment", message: "Added a comment" });
    setCommentDraft("");
  };

  const addCardLink = (card: TaskyCard) => {
    const title = linkTitleDraft.trim();
    const url = normalizeHttpUrl(linkUrlDraft);
    if (!title || (card.links?.length ?? 0) >= 30) return;
    if (!url) {
      setLinkError("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    const link = { id: newId("link"), title, url, createdAt: new Date().toISOString() };
    updateCardDetails(card.id, {
      links: [...(card.links ?? []), link],
    }, { type: "link", message: `Added link: ${title}`.slice(0, 180) });
    setLinkTitleDraft("");
    setLinkUrlDraft("");
    setLinkError(null);
  };

  const removeCardLink = (card: TaskyCard, linkId: string) => {
    const link = card.links?.find((entry) => entry.id === linkId);
    updateCardDetails(card.id, {
      links: (card.links ?? []).filter((entry) => entry.id !== linkId),
    }, { type: "link", message: `Removed link: ${link?.title ?? "link"}`.slice(0, 180) });
  };

  const uploadTaskyFile = async (event: React.ChangeEvent<HTMLInputElement>, card: TaskyCard) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setAttachmentError(null);
    if (!file) return;
    if (file.size < 1 || file.size > TASKY_ATTACHMENT_MAX_BYTES) {
      setAttachmentError("Choose a file between 1 byte and 5 MiB.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = TASKY_ATTACHMENT_MIME_BY_EXTENSION[extension];
    if (!mimeType) {
      setAttachmentError("Supported files: PNG, JPG, WebP, PDF, TXT, CSV and Markdown.");
      return;
    }
    if (file.type && file.type !== mimeType &&
      !(mimeType === "image/jpeg" && file.type === "image/jpg") &&
      !(mimeType === "text/markdown" && file.type === "text/plain")) {
      setAttachmentError("The file extension and detected file type do not match.");
      return;
    }
    try {
      await attachmentUpload.mutateAsync({
        cardId: card.id, fileName: file.name, mimeType,
        contentBase64: arrayBufferToBase64(await file.arrayBuffer()),
      });
      updateCardDetails(card.id, {}, {
        type: "attachment",
        message: `Added attachment: ${file.name}`.slice(0, 180),
      });
      setAttachmentError(null);
    } catch {
      setAttachmentError("Upload failed. Check the file and your connection, then try again.");
    }
  };

  const downloadTaskyFile = async (cardId: string, attachmentId: string) => {
    try {
      const file = await attachmentDownload.mutateAsync({ cardId, attachmentId });
      const binary = window.atob(file.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const downloadBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(downloadBuffer).set(bytes);
      const url = URL.createObjectURL(new Blob([downloadBuffer], { type: file.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { /* The mutation displays a user-facing transport error. */ }
  };

  const deleteTaskyFile = async (cardId: string, attachmentId: string, fileName: string) => {
    try {
      await attachmentDelete.mutateAsync({ cardId, attachmentId });
      updateCardDetails(cardId, {}, {
        type: "attachment",
        message: `Removed attachment: ${fileName}`.slice(0, 180),
      });
    } catch { /* The mutation displays a user-facing transport error. */ }
  };

  const detailsEntry = detailsCardId
    ? columns.flatMap((column) => column.cards.map((card) => ({ card, columnTitle: column.title })))
        .find((entry) => entry.card.id === detailsCardId)
    : undefined;

  const applySavedView = (viewId: string) => {
    const view = savedViewsQuery.data?.views.find((item) => item.id === viewId);
    if (!view) {
      setActiveSavedViewId(null);
      return;
    }
    setSearchQuery(view.filters.query);
    setPriorityFilter(view.filters.priority);
    setDueFilter(view.filters.due);
    setSortOrder(view.filters.sort);
    setActiveSavedViewId(view.id);
  };

  const saveCurrentView = async () => {
    const name = savedViewName.trim();
    if (!name) return;
    try {
      const result = await savedViewCreate.mutateAsync({
        name,
        filters: {
          query: searchQuery.trim(),
          priority: priorityFilter,
          due: dueFilter,
          sort: sortOrder,
        },
      });
      setActiveSavedViewId(result.view.id);
      setSavedViewName("");
      setSavedViewDialogOpen(false);
    } catch {
      // The mutation already reports an actionable API error.
    }
  };

  const deleteActiveSavedView = async () => {
    if (!activeSavedViewId) return;
    try {
      await savedViewDelete.mutateAsync(activeSavedViewId);
      setActiveSavedViewId(null);
    } catch {
      // The mutation already reports an actionable API error.
    }
  };

  const todayDate = new Date();
  const todayKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
  const hasActiveFilters = Boolean(searchQuery.trim()) || priorityFilter !== "all" || dueFilter !== "all" || sortOrder !== "manual";
  const visibleCardsByColumn = React.useMemo(
    () => new Map(columns.map((column) => [
      column.id,
      filterTaskyCards(column.cards, {
        query: searchQuery,
        priority: priorityFilter,
        due: dueFilter,
        sort: sortOrder,
      }, todayKey),
    ] as const)),
    [columns, searchQuery, priorityFilter, dueFilter, sortOrder, todayKey],
  );
  const totalCardCount = columns.reduce((total, column) => total + column.cards.length, 0);
  const visibleCardCount = [...visibleCardsByColumn.values()].reduce((total, cards) => total + cards.length, 0);
  const dragCard = drag ? columns.flatMap((column) => column.cards).find((card) => card.id === drag.cardId) : undefined;

  if (boardQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border p-5" data-testid="tasky-board-error">
        <p className="flex items-center gap-2 text-sm text-loss" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" />
          Tasky could not load your saved board. Your server data has not been replaced.
        </p>
        <Button variant="outline" size="sm" onClick={() => void boardQuery.refetch()} data-testid="tasky-board-retry">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status" data-testid="tasky-board-loading">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Loading your Tasky board…
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-testid="tasky-view">
      <p className="sr-only" role="status" aria-live="polite">
        {boardSave.isPending ? "Saving Tasky board" : boardSave.isError ? "Tasky board save failed" : "Tasky board ready"}
      </p>
      <section className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3" data-testid="tasky-filters">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1.8fr)_repeat(3,minmax(140px,1fr))_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="tasky-search"
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setActiveSavedViewId(null); }}
              placeholder="Search cards…"
              maxLength={180}
              aria-label="Search Tasky cards"
              data-testid="tasky-search"
              className="h-9 pl-9"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="tasky-priority-filter" className="sr-only">Filter by priority</label>
            <select
              id="tasky-priority-filter"
              value={priorityFilter}
              onChange={(event) => { setPriorityFilter(event.target.value as "all" | Priority); setActiveSavedViewId(null); }}
              data-testid="tasky-priority-filter"
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="tasky-due-filter" className="sr-only">Filter by due date</label>
            <select
              id="tasky-due-filter"
              value={dueFilter}
              onChange={(event) => { setDueFilter(event.target.value as "all" | "overdue" | "upcoming" | "no-date"); setActiveSavedViewId(null); }}
              data-testid="tasky-due-filter"
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Due today or later</option>
              <option value="no-date">No due date</option>
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="tasky-sort-order" className="sr-only">Sort cards</label>
            <select
              id="tasky-sort-order"
              value={sortOrder}
              onChange={(event) => { setSortOrder(event.target.value as "manual" | "title" | "due" | "priority"); setActiveSavedViewId(null); }}
              data-testid="tasky-sort-order"
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="manual">Manual order</option>
              <option value="title">Title A–Z</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setPriorityFilter("all");
              setDueFilter("all");
              setSortOrder("manual");
              setActiveSavedViewId(null);
            }}
            disabled={!hasActiveFilters}
            data-testid="tasky-reset-filters"
            className="h-9"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between" data-testid="tasky-saved-view-controls">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label htmlFor="tasky-saved-view-select" className="sr-only">Apply a saved view</label>
            <select
              id="tasky-saved-view-select"
              value={activeSavedViewId ?? ""}
              onChange={(event) => applySavedView(event.target.value)}
              disabled={savedViewsQuery.isLoading}
              data-testid="tasky-saved-view-select"
              className="h-9 min-w-48 max-w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Saved views ({savedViewsQuery.data?.views.length ?? 0}/20)</option>
              {(savedViewsQuery.data?.views ?? []).map((view) => (
                <option key={view.id} value={view.id}>{view.name}</option>
              ))}
            </select>
            {activeSavedViewId ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void deleteActiveSavedView()}
                disabled={savedViewDelete.isPending} data-testid="tasky-saved-view-delete">
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete view
              </Button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <span className="text-xs text-muted-foreground">Save up to 20 filter presets.</span>
            <Button type="button" size="sm" onClick={() => setSavedViewDialogOpen(true)}
              disabled={(savedViewsQuery.data?.views.length ?? 0) >= 20 || savedViewsQuery.isLoading}
              data-testid="tasky-saved-view-open">
              Save view
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span data-testid="tasky-filter-summary" role="status" aria-live="polite">
            Showing <span className="font-mono tabular-nums">{visibleCardCount}</span> of <span className="font-mono tabular-nums">{totalCardCount}</span> cards
          </span>
          {hasActiveFilters ? <span>Clear filters to drag and reorder cards.</span> : null}
        </div>
      </section>
      <Dialog open={savedViewDialogOpen} onOpenChange={setSavedViewDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="tasky-saved-view-dialog">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Save the current search, priority and due-date filters, plus the selected card order, to reuse them later.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCurrentView();
            }}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="tasky-saved-view-name" className="text-sm font-medium">View name</label>
              <Input
                id="tasky-saved-view-name"
                value={savedViewName}
                onChange={(event) => setSavedViewName(event.target.value)}
                placeholder="e.g. Urgent tasks this week"
                maxLength={40}
                autoFocus
                required
                data-testid="tasky-saved-view-name"
              />
              <span className="text-xs text-muted-foreground">{savedViewName.trim().length}/40 characters</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSavedViewDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!savedViewName.trim() || savedViewCreate.isPending} data-testid="tasky-saved-view-save">
                {savedViewCreate.isPending ? "Saving…" : "Save view"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Board - columns added horizontally (left → right), board scrolls X */}
      <div data-testid="tasky-board" className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 pt-1">
        {columns.map((column) => {
          const visibleCards = visibleCardsByColumn.get(column.id) ?? [];
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
                {editingListId === column.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    data-testid={`tasky-rename-list-form-${column.id}`}
                    onSubmit={(event) => { event.preventDefault(); commitRenameList(); }}
                  >
                    <Input
                      autoFocus
                      value={listEditTitle}
                      onChange={(event) => setListEditTitle(event.target.value)}
                      aria-label={`Rename ${column.title}`}
                      data-testid={`tasky-rename-list-input-${column.id}`}
                      maxLength={40}
                      className="h-7 min-w-0 bg-background px-2 text-sm"
                    />
                    <button type="submit" aria-label="Save list name" title="Save list name" className="grid size-6 shrink-0 place-items-center rounded text-profit hover:bg-muted">
                      <Check className="size-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setEditingListId(null)} aria-label="Cancel list rename" title="Cancel" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted">
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{column.title}</h2>
                )}
                <span
                  data-testid={`tasky-count-${column.id}`}
                  className="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums text-muted-foreground"
                >
                  {visibleCards.length}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`List actions for ${column.title}`}
                      title="List actions"
                      data-testid={`tasky-list-menu-${column.id}`}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreHorizontal className="size-3.5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem
                      disabled={columns[0]?.id === column.id}
                      onSelect={() => moveColumn(column.id, -1)}
                      data-testid={`tasky-list-left-${column.id}`}
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      Move list left
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={columns[columns.length - 1]?.id === column.id}
                      onSelect={() => moveColumn(column.id, 1)}
                      data-testid={`tasky-list-right-${column.id}`}
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                      Move list right
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => beginRenameList(column)}
                      data-testid={`tasky-list-rename-${column.id}`}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Rename list
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => removeColumn(column)}
                      data-testid={`tasky-list-delete-${column.id}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete list
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
              {visibleCards.map(({ card, originalIndex }) => {
                const index = originalIndex;
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
                      {editingCardId === card.id && cardDraft ? (
                        <form
                          className="flex flex-col gap-2"
                          data-testid={`tasky-edit-form-${card.id}`}
                          onSubmit={(event) => { event.preventDefault(); commitEditCard(column.id); }}
                        >
                          <Input
                            autoFocus
                            value={cardDraft.title}
                            onChange={(event) => updateCardDraft("title", event.target.value)}
                            maxLength={140}
                            aria-label="Card title"
                            data-testid={`tasky-edit-title-${card.id}`}
                            className="h-8 bg-background text-sm"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={cardDraft.tag}
                              onChange={(event) => updateCardDraft("tag", event.target.value)}
                              maxLength={40}
                              aria-label="Card label"
                              data-testid={`tasky-edit-tag-${card.id}`}
                              className="h-8 bg-background text-xs"
                            />
                            <select
                              value={cardDraft.priority}
                              onChange={(event) => updateCardDraft("priority", event.target.value as Priority)}
                              aria-label="Card priority"
                              data-testid={`tasky-edit-priority-${card.id}`}
                              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            >
                              <option value="Low">Low</option>
                              <option value="Medium">Medium</option>
                              <option value="High">High</option>
                              <option value="Urgent">Urgent</option>
                            </select>
                            <Input
                              value={cardDraft.assignee}
                              onChange={(event) => updateCardDraft("assignee", event.target.value)}
                              maxLength={12}
                              aria-label="Card assignee"
                              data-testid={`tasky-edit-assignee-${card.id}`}
                              className="h-8 bg-background text-xs"
                            />
                            <Input
                              type="date"
                              value={cardDraft.due ?? ""}
                              onChange={(event) => updateCardDraft("due", event.target.value || undefined)}
                              aria-label="Card due date"
                              data-testid={`tasky-edit-due-${card.id}`}
                              className="h-8 min-w-0 bg-background px-2 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button type="submit" size="sm" className="h-7 gap-1 px-2.5 text-xs" disabled={!cardDraft.title.trim() || !cardDraft.tag.trim() || !cardDraft.assignee.trim()} data-testid={`tasky-edit-save-${card.id}`}>
                              <Check className="size-3.5" aria-hidden="true" /> Save
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { setEditingCardId(null); setCardDraft(null); }}>
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <>
                      <div className="flex items-start gap-2">
                        <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug">{card.title}</h3>
                        <button
                          type="button"
                          onClick={() => beginEditCard(card)}
                          aria-label={`Edit ${card.title}`}
                          title="Edit card"
                          data-testid={`tasky-edit-${card.id}`}
                          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground [@media(hover:none)]:text-muted-foreground"
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateCard(column.id, card)}
                          aria-label={`Duplicate ${card.title}`}
                          title="Duplicate card"
                          data-testid={`tasky-duplicate-${card.id}`}
                          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground [@media(hover:none)]:text-muted-foreground"
                        >
                          <Copy className="size-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Drag ${card.title}`}
                          data-testid={`tasky-grip-${card.id}`}
                          onPointerDown={(event) => {
                            if (hasActiveFilters) return;
                            startDrag(event, card, column.id);
                          }}
                          aria-disabled={hasActiveFilters}
                          title={hasActiveFilters ? "Clear search and filters to drag this card" : "Drag to move"}
                          className={cn("-m-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground/50 transition-colors hover:text-foreground", hasActiveFilters ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing")}
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
                        <button
                          type="button"
                          onClick={() => {
                            setDetailsCardId(card.id);
                            setChecklistDraft("");
                            setCommentDraft("");
                            setLinkTitleDraft("");
                            setLinkUrlDraft("");
                            setLinkError(null);
                            descriptionOriginalRef.current = card.description ?? "";
                          }}
                          aria-label={`Open details for ${card.title}`}
                          title="Card details"
                          data-testid={`tasky-details-${card.id}`}
                          className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {card.description?.trim() ? <FileText className="size-3.5 shrink-0" aria-hidden="true" /> : <ListChecks className="size-3.5 shrink-0" aria-hidden="true" />}
                          {(card.checklist?.length ?? 0) > 0
                            ? `${card.checklist?.filter((item) => item.completed).length ?? 0}/${card.checklist?.length} checklist`
                            : "Details"}
                        </button>
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
                        </>
                      )}
                    </article>
                  </React.Fragment>
                );
              })}
              {hasActiveFilters && visibleCards.length === 0 && column.cards.length > 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  No matching cards.
                </p>
              ) : null}

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

      <Dialog
        open={detailsEntry !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsCardId(null);
            setChecklistDraft("");
            setCommentDraft("");
            setLinkTitleDraft("");
            setLinkUrlDraft("");
            setLinkError(null);
            setAttachmentError(null);
          }
        }}
      >
        {detailsEntry ? (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="tasky-card-details">
            <DialogHeader>
              <DialogTitle className="pr-8 text-lg">{detailsEntry.card.title}</DialogTitle>
              <DialogDescription>
                {detailsEntry.columnTitle} · {detailsEntry.card.tag} · {detailsEntry.card.priority}
              </DialogDescription>
            </DialogHeader>

            <section className="flex flex-col gap-2">
              <label htmlFor="tasky-card-description" className="text-sm font-medium">Description</label>
              <Textarea
                id="tasky-card-description"
                value={detailsEntry.card.description ?? ""}
                onChange={(event) => updateCardDetails(detailsEntry.card.id, { description: event.target.value })}
                onBlur={(event) => {
                  const description = event.currentTarget.value;
                  if (description !== descriptionOriginalRef.current) {
                    updateCardDetails(detailsEntry.card.id, { description }, { type: "updated", message: "Updated description" });
                    descriptionOriginalRef.current = description;
                  }
                }}
                placeholder="Add context, acceptance criteria, links or notes…"
                maxLength={4000}
                rows={4}
                data-testid="tasky-card-description"
                className="resize-y"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {(detailsEntry.card.description ?? "").length}/4000 characters
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">Checklist</h3>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {detailsEntry.card.checklist?.filter((item) => item.completed).length ?? 0}/
                    {detailsEntry.card.checklist?.length ?? 0}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">Up to 100 items</span>
              </div>

              {(detailsEntry.card.checklist?.length ?? 0) > 0 ? (
                <div className="flex flex-col gap-1" data-testid="tasky-checklist-items">
                  {detailsEntry.card.checklist?.map((item) => (
                    <div key={item.id} className="group/check flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={(event) => toggleChecklistItem(detailsEntry.card, item.id, event.target.checked)}
                        aria-label={`Complete ${item.text}`}
                        data-testid={`tasky-checklist-toggle-${item.id}`}
                        className="size-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className={cn("min-w-0 flex-1 break-words text-sm", item.completed && "text-muted-foreground line-through")}>
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(detailsEntry.card, item.id)}
                        aria-label={`Delete checklist item ${item.text}`}
                        title="Remove item"
                        data-testid={`tasky-checklist-delete-${item.id}`}
                        className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-loss/10 hover:text-loss group-hover/check:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                  No checklist items yet. Add the first step below.
                </p>
              )}

              <form
                className="flex items-center gap-2"
                data-testid="tasky-checklist-add-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addChecklistItem(detailsEntry.card);
                }}
              >
                <Input
                  value={checklistDraft}
                  onChange={(event) => setChecklistDraft(event.target.value)}
                  placeholder="Add a checklist item…"
                  aria-label="New checklist item"
                  maxLength={180}
                  data-testid="tasky-checklist-add-input"
                  disabled={(detailsEntry.card.checklist?.length ?? 0) >= 100}
                  className="h-9 min-w-0 flex-1 bg-background text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 gap-1.5"
                  disabled={!checklistDraft.trim() || (detailsEntry.card.checklist?.length ?? 0) >= 100}
                  data-testid="tasky-checklist-add-submit"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add
                </Button>
              </form>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4" data-testid="tasky-card-links">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Links</h3>
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {detailsEntry.card.links?.length ?? 0}
                </span>
              </div>
              {(detailsEntry.card.links?.length ?? 0) > 0 ? (
                <div className="flex flex-col gap-1">
                  {detailsEntry.card.links?.map((link) => (
                    <div key={link.id} className="group/link flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm text-accent underline-offset-4 hover:underline"
                        data-testid={`tasky-link-${link.id}`}
                      >
                        {link.title}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeCardLink(detailsEntry.card, link.id)}
                        aria-label={`Remove link ${link.title}`}
                        title="Remove link"
                        data-testid={`tasky-link-delete-${link.id}`}
                        className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-loss/10 hover:text-loss group-hover/link:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No links added to this card yet.</p>
              )}

              <form
                className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"
                data-testid="tasky-link-add-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addCardLink(detailsEntry.card);
                }}
              >
                <Input
                  value={linkTitleDraft}
                  onChange={(event) => setLinkTitleDraft(event.target.value)}
                  placeholder="Link title"
                  aria-label="Link title"
                  maxLength={120}
                  data-testid="tasky-link-title-input"
                  disabled={(detailsEntry.card.links?.length ?? 0) >= 30}
                  className="h-9 min-w-0 bg-background text-sm"
                />
                <Input
                  value={linkUrlDraft}
                  onChange={(event) => {
                    setLinkUrlDraft(event.target.value);
                    setLinkError(null);
                  }}
                  placeholder="https://example.com"
                  aria-label="Link URL"
                  maxLength={2048}
                  data-testid="tasky-link-url-input"
                  disabled={(detailsEntry.card.links?.length ?? 0) >= 30}
                  className="h-9 min-w-0 bg-background text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 gap-1.5"
                  disabled={!linkTitleDraft.trim() || !linkUrlDraft.trim() || (detailsEntry.card.links?.length ?? 0) >= 30}
                  data-testid="tasky-link-add-submit"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add link
                </Button>
              </form>
              {linkError ? <p className="text-xs text-loss" role="alert">{linkError}</p> : null}
              {(detailsEntry.card.links?.length ?? 0) >= 30 ? (
                <p className="text-xs text-muted-foreground">This card has reached the 30-link limit.</p>
              ) : null}
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4" data-testid="tasky-card-attachments">
              <div className="flex items-center gap-2">
                <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Attachments</h3>
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{attachmentQuery.data?.attachments.length ?? 0}/20</span>
              </div>
              {attachmentQuery.isPending ? <p className="text-sm text-muted-foreground">Loading attachments…</p> :
                attachmentQuery.isError ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <p className="text-sm text-muted-foreground">Attachments could not be loaded.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => void attachmentQuery.refetch()}><RefreshCw className="size-3.5" aria-hidden="true" />Retry</Button>
                  </div>
                ) : (attachmentQuery.data?.attachments.length ?? 0) > 0 ? (
                  <div className="flex flex-col gap-1">
                    {attachmentQuery.data?.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 px-3 py-2" data-testid={`tasky-attachment-${attachment.id}`}>
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={attachment.originalName}>{attachment.originalName}</p>
                          <p className="text-[11px] text-muted-foreground">{fileSizeLabel(attachment.sizeBytes)} · {formatTimestamp(attachment.createdAt)}</p>
                        </div>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Download ${attachment.originalName}`} title="Download" disabled={attachmentDownload.isPending} onClick={() => void downloadTaskyFile(detailsEntry.card.id, attachment.id)} data-testid={`tasky-attachment-download-${attachment.id}`}><Download className="size-4" aria-hidden="true" /></Button>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${attachment.originalName}`} title="Delete attachment" disabled={attachmentDelete.isPending} onClick={() => void deleteTaskyFile(detailsEntry.card.id, attachment.id, attachment.originalName)} data-testid={`tasky-attachment-delete-${attachment.id}`}><Trash2 className="size-4" aria-hidden="true" /></Button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No files attached to this card yet.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="tasky-attachment-file" className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted", (attachmentUpload.isPending || (attachmentQuery.data?.attachments.length ?? 0) >= 20) && "pointer-events-none opacity-50")}>
                  {attachmentUpload.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Paperclip className="size-4" aria-hidden="true" />}
                  {attachmentUpload.isPending ? "Uploading…" : "Attach file"}
                </label>
                <input id="tasky-attachment-file" type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.md,.markdown" aria-label="Choose a file to attach" disabled={attachmentUpload.isPending || (attachmentQuery.data?.attachments.length ?? 0) >= 20} onChange={(event) => void uploadTaskyFile(event, detailsEntry.card)} data-testid="tasky-attachment-file-input" />
                <span className="text-[11px] text-muted-foreground">5 MiB max per file · Up to 20 per card</span>
              </div>
              {attachmentError ? <p className="text-xs text-loss" role="alert">{attachmentError}</p> : null}
              <p className="text-[11px] text-muted-foreground">Files are private and only available to the owner of this board.</p>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4" data-testid="tasky-card-comments">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Comments</h3>
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {detailsEntry.card.comments?.length ?? 0}
                </span>
              </div>
              {(detailsEntry.card.comments?.length ?? 0) > 0 ? (
                <div className="flex flex-col gap-3">
                  {[...(detailsEntry.card.comments ?? [])].reverse().map((comment) => (
                    <article key={comment.id} className="flex gap-2.5" data-testid={`tasky-comment-${comment.id}`}>
                      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted/60 text-[10px] font-semibold text-muted-foreground">
                        {comment.author.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background/50 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold">{comment.author}</span>
                          <time dateTime={comment.createdAt} className="text-[11px] text-muted-foreground">
                            {formatTimestamp(comment.createdAt)}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet. Add context for your future self.</p>
              )}
              <form
                className="flex flex-col gap-2"
                data-testid="tasky-comment-add-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addComment(detailsEntry.card);
                }}
              >
                <Textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment…"
                  aria-label="New comment"
                  maxLength={2000}
                  rows={2}
                  data-testid="tasky-comment-input"
                  disabled={(detailsEntry.card.comments?.length ?? 0) >= 100}
                  className="resize-y"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{commentDraft.length}/2000</span>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={!commentDraft.trim() || (detailsEntry.card.comments?.length ?? 0) >= 100}
                    data-testid="tasky-comment-submit"
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                    Add comment
                  </Button>
                </div>
                {(detailsEntry.card.comments?.length ?? 0) >= 100 ? (
                  <p className="text-xs text-muted-foreground">This card has reached the 100-comment limit.</p>
                ) : null}
              </form>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4" data-testid="tasky-card-activity">
              <div className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Activity</h3>
              </div>
              {(detailsEntry.card.activity?.length ?? 0) > 0 ? (
                <ol className="flex flex-col gap-3">
                  {[...(detailsEntry.card.activity ?? [])].reverse().map((entry) => (
                    <li key={entry.id} className="flex gap-2.5" data-testid={`tasky-activity-${entry.id}`}>
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent/70" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm">{entry.message}</p>
                        <time dateTime={entry.createdAt} className="text-[11px] text-muted-foreground">
                          {formatTimestamp(entry.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Activity will appear here as this card changes.</p>
              )}
            </section>

            <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span>Changes save automatically.</span>
              <span>{detailsEntry.card.assignee} · {detailsEntry.card.due ? formatDue(detailsEntry.card.due) : "No due date"}</span>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
