"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleDot,
  Download,
  FileCode,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  History,
  Image as ImageIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Quote,
  SquareCheck,
  Star,
  Table as TableIcon,
  Tag as TagIcon,
  Trash2,
  Type,
  Copy,
  FileDown,
  FolderOpen,
  X,
} from "lucide-react";

import type { NofyBlock, NofyRefHit, NofyRefKind } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateNofyTag,
  useCreateNofyTemplate,
  useDuplicateNofyNote,
  useNofyFolders,
  useNofyNote,
  useNofyTags,
  useNofyVersions,
  useRestoreNofyVersion,
  useTrashNofyNote,
  useUpdateNofyNote,
} from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/keys";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NofyBlockRow, autoResize, type NofyBlockOps } from "./nofy-blocks";
import { IconPicker, RefPickerDialog, VersionsDialog } from "./nofy-editor-dialogs";
import { NotePrintDialog } from "./nofy-print";
import { LessonOriginChip, NOFY_REF_META, TagChip, nofyRelativeTime } from "./nofy-shared";

/**
 * Nofy block editor — the writing surface (spec §9–§21). Blocks are the
 * source of truth locally; a debounced autosave PATCH persists everything
 * (title, metadata, blocks) with a visible status. Slash commands, markdown
 * shortcuts, drag-and-drop reorder, trading-entity references, version
 * history, focus mode and Markdown export all live here.
 */

// ── Local draft model ────────────────────────────────────────────────────────

type DraftState = {
  title: string;
  icon: string | null;
  folderId: string | null;
  tagIds: string[];
  favorite: boolean;
  blocks: NofyBlock[];
};

type SaveStatus = "saved" | "dirty" | "saving" | "error";

const clientBlockId = (): string => `nb-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

const fromNote = (note: { title: string; icon: string | null; folderId: string | null; tagIds: string[]; favorite: boolean; blocks: NofyBlock[] }): DraftState => ({
  title: note.title,
  icon: note.icon,
  folderId: note.folderId,
  tagIds: [...note.tagIds],
  favorite: note.favorite,
  blocks: note.blocks,
});

const wordCountOf = (blocks: NofyBlock[]): number =>
  blocks
    .map((block) => (block.text ?? "") + (block.rows ? block.rows.flat().join(" ") : ""))
    .join(" ")
    .split(/\s+/)
    .filter((word) => word !== "").length;

const TEXT_TYPES = new Set<NofyBlock["type"]>(["paragraph", "h1", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout", "code"]);

// ── Markdown export (spec §58) ───────────────────────────────────────────────

function blocksToMarkdown(
  title: string,
  blocks: NofyBlock[],
  copy: { untitledNote: string; refLabel: (kind: NofyRefKind) => string },
): string {
  const lines: string[] = [`# ${title === "" ? copy.untitledNote : title}`, ""];
  for (const block of blocks) {
    switch (block.type) {
      case "h1": lines.push(`# ${block.text}`, ""); break;
      case "h2": lines.push(`## ${block.text}`, ""); break;
      case "h3": lines.push(`### ${block.text}`, ""); break;
      case "bullet": lines.push(`- ${block.text}`); break;
      case "numbered": lines.push(`1. ${block.text}`); break;
      case "todo": lines.push(`- [${block.checked ? "x" : " "}] ${block.text}`); break;
      case "quote": lines.push(`> ${block.text}`, ""); break;
      case "callout": lines.push(`> **${(block.tone ?? "info").toUpperCase()}** - ${block.text}`, ""); break;
      case "code": lines.push("```", block.text, "```", ""); break;
      case "divider": lines.push("---", ""); break;
      case "image": {
        if (block.src) lines.push(`![${block.alt ?? block.caption ?? "image"}](${block.src})`);
        if (block.caption) lines.push(`*${block.caption}*`);
        lines.push("");
        break;
      }
      case "table": {
        const rows = block.rows ?? [];
        if (rows.length > 0) {
          lines.push(`| ${rows[0]!.join(" | ")} |`);
          lines.push(`| ${rows[0]!.map(() => "---").join(" | ")} |`);
          for (const row of rows.slice(1)) lines.push(`| ${row.join(" | ")} |`);
          lines.push("");
        }
        break;
      }
      case "ref": {
        if (block.ref) {
          const kindLabel = copy.refLabel(block.ref.kind);
          const label = block.ref.label ?? kindLabel;
          lines.push(`> **${kindLabel}** - ${label}${block.ref.href ? ` (${block.ref.href})` : ""}`, "");
        }
        break;
      }
      default: lines.push(block.text, "");
    }
  }
  return lines.join("\n");
}

// ── Slash commands (spec §12) ────────────────────────────────────────────────

/** refKinds dict key for a machine ref kind (TRADE → trade). */
const refKindKey = (kind: NofyRefKind): keyof Dictionary["nofy"]["refKinds"] =>
  kind.toLowerCase() as keyof Dictionary["nofy"]["refKinds"];

type SlashItem = {
  cmd: string;
  label: string;
  desc: string;
  icon: typeof Type;
  group: "Basic" | "Advanced" | "Trading";
  type?: NofyBlock["type"];
  extra?: Partial<NofyBlock>;
  refKind?: NofyRefKind;
};

/**
 * Slash registry — machine ids (cmd/group/type/refKind) stay constant;
 * labels, descriptions and the seeded table headers resolve through the
 * dict at render time (i18n pattern — same as the trades EMOTION_OPTIONS).
 */
function slashItemsFor(N: Dictionary["nofy"]): SlashItem[] {
  const B = N.blockTypes;
  const D = N.slash.desc;
  const R = N.refKinds;
  return [
    { cmd: "text", label: B.paragraph, desc: D.text, icon: Type, group: "Basic", type: "paragraph" },
    { cmd: "heading", label: B.h1, desc: D.heading, icon: Heading1, group: "Basic", type: "h1" },
    { cmd: "h2", label: B.h2, desc: D.h2, icon: Heading2, group: "Basic", type: "h2" },
    { cmd: "h3", label: B.h3, desc: D.h3, icon: Heading3, group: "Basic", type: "h3" },
    { cmd: "bullet", label: B.bullet, desc: D.bullet, icon: List, group: "Basic", type: "bullet" },
    { cmd: "numbered", label: B.numbered, desc: D.numbered, icon: ListOrdered, group: "Basic", type: "numbered" },
    { cmd: "todo", label: B.todo, desc: D.todo, icon: SquareCheck, group: "Basic", type: "todo", extra: { checked: false } },
    { cmd: "quote", label: B.quote, desc: D.quote, icon: Quote, group: "Advanced", type: "quote" },
    { cmd: "callout", label: B.callout, desc: D.callout, icon: CircleDot, group: "Advanced", type: "callout", extra: { tone: "info" } },
    { cmd: "code", label: B.code, desc: D.code, icon: FileCode, group: "Advanced", type: "code" },
    {
      cmd: "table", label: B.table, desc: D.table, icon: TableIcon, group: "Advanced", type: "table",
      extra: { rows: [[N.slash.seed.condition, N.slash.seed.observation, N.slash.seed.result], ["", "", ""]] },
    },
    { cmd: "divider", label: B.divider, desc: D.divider, icon: Minus, group: "Advanced", type: "divider" },
    { cmd: "image", label: B.image, desc: D.image, icon: ImageIcon, group: "Advanced", type: "image" },
    { cmd: "trade", label: R.trade, desc: D.trade, icon: NOFY_REF_META.TRADE.icon, group: "Trading", refKind: "TRADE" },
    { cmd: "strategy", label: R.strategy, desc: D.strategy, icon: NOFY_REF_META.STRATEGY.icon, group: "Trading", refKind: "STRATEGY" },
    { cmd: "setup", label: R.setup, desc: D.setup, icon: NOFY_REF_META.SETUP.icon, group: "Trading", refKind: "SETUP" },
    { cmd: "lesson", label: R.lesson, desc: D.lesson, icon: NOFY_REF_META.LESSON.icon, group: "Trading", refKind: "LESSON" },
    { cmd: "event", label: R.event, desc: D.event, icon: NOFY_REF_META.EVENT.icon, group: "Trading", refKind: "EVENT" },
    { cmd: "symbol", label: R.symbol, desc: D.symbol, icon: NOFY_REF_META.SYMBOL.icon, group: "Trading", refKind: "SYMBOL" },
    { cmd: "note", label: R.note, desc: D.note, icon: NOFY_REF_META.NOTE.icon, group: "Trading", refKind: "NOTE" },
  ];
}

// ── Editor ───────────────────────────────────────────────────────────────────

export function NofyEditor({
  noteId,
  focusMode,
  onToggleFocusMode,
  onClose,
}: {
  noteId: string;
  focusMode: boolean;
  onToggleFocusMode: (focus: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const N = dict.nofy;
  const noteQuery = useNofyNote(noteId);

  const serverNoteRef = React.useRef<{ id: string; updatedAt: string } | null>(null);
  const draftRef = React.useRef<DraftState | null>(null);
  const dirtyRef = React.useRef(false);
  const saveTimerRef = React.useRef<number | null>(null);
  const textAreasRef = React.useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [draft, setDraft] = React.useState<DraftState | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  /** Focus requests ride a ref + tick — the effect only reads the ref. */
  const pendingFocusRef = React.useRef<{ id: string; caret: "start" | "end" } | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  const [dragState, setDragState] = React.useState<{ dragId: string | null; overId: string | null; position: "above" | "below" | null }>({ dragId: null, overId: null, position: null });
  const [slashMenu, setSlashMenu] = React.useState<{ sourceId: string; filter: string; top: number; left: number } | null>(null);
  const [slashIndex, setSlashIndex] = React.useState(0);
  const [refPicker, setRefPicker] = React.useState<{ kind: NofyRefKind | null; sourceId: string | null } | null>(null);
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");

  // ── Adoption — server snapshot → local draft (never clobbers pending edits) ─
  React.useEffect(() => {
    const data = noteQuery.data;
    if (!data) return;
    if (serverNoteRef.current?.id === data.note.id && serverNoteRef.current.updatedAt === data.note.updatedAt) return;
    if (dirtyRef.current) return;
    serverNoteRef.current = { id: data.note.id, updatedAt: data.note.updatedAt };
    setDraft(fromNote(data.note));
    draftRef.current = fromNote(data.note);
    setSavedAt(data.note.updatedAt);
  }, [noteQuery.data]);

  // ── Autosave (spec §16) ──────────────────────────────────────────────────────
  const { mutate: updateNoteMutate } = useUpdateNofyNote();

  const flushSave = React.useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const current = draftRef.current;
    if (!current || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveStatus("saving");
    updateNoteMutate(
      {
        noteId,
        title: current.title,
        icon: current.icon,
        folderId: current.folderId,
        tagIds: current.tagIds,
        favorite: current.favorite,
        blocks: current.blocks,
      },
      {
        onSuccess: (data) => {
          serverNoteRef.current = { id: data.note.id, updatedAt: data.note.updatedAt };
          setSaveStatus("saved");
          setSavedAt(data.note.updatedAt);
        },
        onError: () => {
          dirtyRef.current = true;
          setSaveStatus("error");
        },
      },
    );
  }, [noteId, updateNoteMutate]);

  const scheduleSave = React.useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => flushSave(), 900);
  }, [flushSave]);

  const applyDraft = React.useCallback(
    (next: DraftState) => {
      draftRef.current = next;
      setDraft(next);
      if (!dirtyRef.current) setSaveStatus("dirty");
      dirtyRef.current = true;
      scheduleSave();
    },
    [scheduleSave],
  );

  // Flush pending changes when unmounting or switching notes.
  const flushRef = React.useRef(flushSave);
  React.useEffect(() => {
    flushRef.current = flushSave;
  });
  React.useEffect(() => () => flushRef.current(), [noteId]);

  const closeEditor = React.useCallback(() => {
    flushRef.current();
    onClose();
  }, [onClose]);

  // ── Block ops ────────────────────────────────────────────────────────────────
  const mutateBlocks = React.useCallback(
    (producer: (blocks: NofyBlock[]) => NofyBlock[]) => {
      const current = draftRef.current;
      if (!current) return;
      applyDraft({ ...current, blocks: producer(current.blocks) });
    },
    [applyDraft],
  );

  const requestFocus = React.useCallback((id: string, caret: "start" | "end") => {
    pendingFocusRef.current = { id, caret };
    setFocusTick((tick) => tick + 1);
  }, []);

  const ops = React.useMemo<NofyBlockOps>(() => ({
    updateText: (id, text) => mutateBlocks((blocks) => blocks.map((block) => (block.id === id ? { ...block, text } : block))),
    updateBlock: (id, patch) =>
      mutateBlocks((blocks) =>
        blocks.map((block) => {
          if (block.id !== id) return block;
          const next = { ...block, ...patch };
          if (patch.checked === undefined && "checked" in patch) delete next.checked;
          if (patch.src === undefined && "src" in patch) delete next.src;
          return next;
        }),
      ),
    splitBlock: (id, caret) =>
      mutateBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === id);
        if (index === -1) return blocks;
        const block = blocks[index]!;
        const before = block.text.slice(0, caret);
        const after = block.text.slice(caret);
        const nextType: NofyBlock["type"] =
          block.type === "bullet" || block.type === "numbered" || block.type === "todo" ? block.type : "paragraph";
        const fresh: NofyBlock = { id: clientBlockId(), type: nextType, text: after };
        if (nextType === "todo") fresh.checked = false;
        const next = [...blocks];
        next[index] = { ...block, text: before };
        next.splice(index + 1, 0, fresh);
        requestFocus(fresh.id, "start");
        return next;
      }),
    mergeBackward: (id) =>
      mutateBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === id);
        if (index === -1) return blocks;
        const block = blocks[index]!;
        if (index === 0) {
          if (block.text === "" && blocks.length > 1) return blocks.filter((b) => b.id !== id);
          return blocks;
        }
        const previous = blocks[index - 1]!;
        if (TEXT_TYPES.has(previous.type)) {
          const merged = { ...previous, text: previous.text + block.text };
          const next = blocks.filter((b) => b.id !== id);
          next[index - 1] = merged;
          requestFocus(merged.id, "end");
          return next;
        }
        if (block.text === "") {
          return blocks.filter((b) => b.id !== id);
        }
        return blocks;
      }),
    deleteBlock: (id) =>
      mutateBlocks((blocks) => {
        const next = blocks.filter((block) => block.id !== id);
        return next.length === 0 ? [{ id: clientBlockId(), type: "paragraph", text: "" }] : next;
      }),
    duplicateBlock: (id) =>
      mutateBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === id);
        if (index === -1) return blocks;
        const copy = { ...structuredClone(blocks[index]!), id: clientBlockId() };
        const next = [...blocks];
        next.splice(index + 1, 0, copy);
        return next;
      }),
    moveBlock: (id, direction) =>
      mutateBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === id);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= blocks.length) return blocks;
        const next = [...blocks];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved!);
        return next;
      }),
    reorder: (dragId, targetId, position) =>
      mutateBlocks((blocks) => {
        const fromIndex = blocks.findIndex((block) => block.id === dragId);
        if (fromIndex === -1) return blocks;
        const next = [...blocks];
        const [moved] = next.splice(fromIndex, 1);
        let targetIndex = next.findIndex((block) => block.id === targetId);
        if (targetIndex === -1) return blocks;
        if (position === "below") targetIndex += 1;
        next.splice(targetIndex, 0, moved!);
        return next;
      }),
    focusBlock: (id, caret) => requestFocus(id, caret),
    focusNeighbor: (id, direction) => {
      const current = draftRef.current;
      if (!current) return;
      const index = current.blocks.findIndex((block) => block.id === id);
      const neighbor = current.blocks[index + direction];
      if (neighbor && TEXT_TYPES.has(neighbor.type)) {
        requestFocus(neighbor.id, direction === -1 ? "end" : "start");
      }
    },
    registerTextArea: (id, el) => {
      if (el) textAreasRef.current.set(id, el);
      else textAreasRef.current.delete(id);
    },
    openRefPicker: (kind, sourceId) => {
      setRefPicker({ kind, sourceId });
    },
    navigateToRef: (href) => {
      flushRef.current();
      router.push(href);
    },
    openSlashMenu: (sourceId, filter) => {
      setSlashMenu((previous) => {
        if (previous && previous.sourceId === sourceId && previous.filter === filter) return previous;
        if (!previous || previous.sourceId !== sourceId) {
          const el = textAreasRef.current.get(sourceId);
          const row = el?.closest<HTMLElement>("[data-testid=nofy-block]");
          if (row) {
            const rect = row.getBoundingClientRect();
            setSlashIndex(0);
            return { sourceId, filter, top: rect.bottom + 4, left: rect.left };
          }
        } else {
          setSlashIndex(0);
        }
        return { sourceId, filter, top: previous?.top ?? 0, left: previous?.left ?? 0 };
      });
    },
    closeSlashMenu: () => {
      setSlashMenu((previous) => (previous === null ? previous : null));
    },
  }), [mutateBlocks, router, requestFocus]);

  // ── Focus resolution (runs after the blocks re-render) ──────────────────────
  React.useEffect(() => {
    if (focusTick === 0) return;
    const request = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (request) {
      const el = textAreasRef.current.get(request.id);
      if (el) {
        el.focus();
        const position = request.caret === "start" ? 0 : el.value.length;
        el.setSelectionRange(position, position);
        autoResize(el);
      }
    }
  }, [focusTick, draft]);

  // ── Slash menu filtering + application ──────────────────────────────────────
  const slashItems = React.useMemo(() => slashItemsFor(N), [N]);
  const slashMatches = React.useMemo(() => {
    if (!slashMenu) return [];
    const query = slashMenu.filter.toLowerCase();
    return slashItems.filter((item) => item.cmd.includes(query) || item.label.toLowerCase().includes(query));
  }, [slashMenu, slashItems]);

  const applySlashItem = React.useCallback(
    (item: SlashItem) => {
      const sourceId = slashMenu?.sourceId;
      setSlashMenu(null);
      if (!sourceId || !draftRef.current) return;
      if (item.refKind) {
        ops.updateText(sourceId, "");
        setRefPicker({ kind: item.refKind, sourceId });
        return;
      }
      if (item.type === "divider") {
        const fresh: NofyBlock = { id: clientBlockId(), type: "divider", text: "" };
        const paragraph: NofyBlock = { id: clientBlockId(), type: "paragraph", text: "" };
        mutateBlocks((blocks) => {
          const index = blocks.findIndex((block) => block.id === sourceId);
          if (index === -1) return blocks;
          const next = [...blocks];
          next[index] = fresh;
          next.splice(index + 1, 0, paragraph);
          return next;
        });
        requestFocus(paragraph.id, "start");
        return;
      }
      ops.updateBlock(sourceId, { type: item.type!, text: "", ...(item.extra ?? {}) });
      requestFocus(sourceId, "end");
    },
    [slashMenu, ops, mutateBlocks, requestFocus],
  );

  // ── Slash menu anchoring (scroll-safe) ──────────────────────────────────────
  // The menu stays anchored to its source block: ANY scroll (the page shell,
  // an ancestor, the editor itself) re-derives top/left from the block row's
  // live viewport rect instead of closing the menu. Scrolls that originate
  // INSIDE the menu (its own scrollable list) are ignored — closing on them
  // made the list unscrollable. A capture-phase document listener catches
  // ancestor scrollers (native scroll doesn't bubble to the editor).
  const repositionSlashMenu = React.useCallback(() => {
    setSlashMenu((previous) => {
      if (!previous) return previous;
      const el = textAreasRef.current.get(previous.sourceId);
      const row = el?.closest<HTMLElement>("[data-testid=nofy-block]");
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      // Clamp inside the viewport (menu ≈ 270px tall, 288px wide).
      const top = Math.min(rect.bottom + 4, window.innerHeight - 280);
      const left = Math.min(rect.left, window.innerWidth - 296);
      if (Math.abs(previous.top - top) < 0.5 && Math.abs(previous.left - left) < 0.5) return previous;
      return { ...previous, top, left };
    });
  }, []);

  const handleScrollCapture = (event: React.SyntheticEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-testid=nofy-slash-menu]")) return;
    repositionSlashMenu();
  };

  const slashMenuOpen = slashMenu !== null;
  React.useEffect(() => {
    if (!slashMenuOpen) return;
    const onAncestorScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-testid=nofy-slash-menu]")) return;
      repositionSlashMenu();
    };
    document.addEventListener("scroll", onAncestorScroll, { capture: true, passive: true });
    window.addEventListener("resize", repositionSlashMenu, { passive: true });
    return () => {
      document.removeEventListener("scroll", onAncestorScroll, { capture: true });
      window.removeEventListener("resize", repositionSlashMenu);
    };
  }, [slashMenuOpen, repositionSlashMenu]);

  // Keyboard navigation scrolls the highlighted option into view. Hover is
  // EXCLUDED: scrolling the list with the wheel moves items under the cursor
  // and a hover-driven scrollIntoView would snap the list back mid-gesture.
  const activeSlashRef = React.useRef<HTMLButtonElement | null>(null);
  const slashKbNavRef = React.useRef(false);
  React.useEffect(() => {
    if (!slashKbNavRef.current) return;
    slashKbNavRef.current = false;
    activeSlashRef.current?.scrollIntoView({ block: "nearest" });
  }, [slashIndex, slashMatches]);

  // ── Container-level keyboard: slash menu nav, Ctrl+S, Ctrl+B/I ──────────────
  const handleKeyDownCapture = (event: React.KeyboardEvent) => {
    if (slashMenu) {
      if (event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); slashKbNavRef.current = true; setSlashIndex((index) => Math.min(index + 1, slashMatches.length - 1)); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); slashKbNavRef.current = true; setSlashIndex((index) => Math.max(index - 1, 0)); return; }
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); const item = slashMatches[slashIndex]; if (item) applySlashItem(item); return; }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSlashMenu(null); return; }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushSave();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "b" || event.key.toLowerCase() === "i")) {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement) {
        event.preventDefault();
        const wrap = event.key.toLowerCase() === "b" ? "**" : "*";
        const { selectionStart, selectionEnd, value } = active;
        const start = selectionStart ?? 0;
        const end = selectionEnd ?? 0;
        const selected = value.slice(start, end);
        const nextValue = `${value.slice(0, start)}${wrap}${selected}${wrap}${value.slice(end)}`;
        active.value = nextValue;
        ops.updateText(active.dataset.blockId ?? "", nextValue);
        const caret = end + wrap.length;
        active.setSelectionRange(caret, caret);
        autoResize(active);
      }
    }
  };

  // ── Ref picker pick → insert/replace ref block ──────────────────────────────
  const handleRefPick = React.useCallback(
    (hit: NofyRefHit) => {
      const sourceId = refPicker?.sourceId;
      setRefPicker(null);
      if (!draftRef.current) return;
      const refBlock: NofyBlock = {
        id: clientBlockId(),
        type: "ref",
        text: "",
        ref: { kind: hit.kind, id: hit.id, label: hit.label, meta: hit.meta, href: hit.href },
      };
      mutateBlocks((blocks) => {
        const index = blocks.findIndex((block) => block.id === sourceId);
        if (index === -1) return [...blocks, refBlock];
        const source = blocks[index]!;
        if (source.type === "paragraph" && source.text.trim() === "") {
          const next = [...blocks];
          next[index] = refBlock;
          return next;
        }
        const next = [...blocks];
        next.splice(index + 1, 0, refBlock);
        return next;
      });
    },
    [refPicker, mutateBlocks],
  );

  // ── Note-level actions ──────────────────────────────────────────────────────
  const trashMutation = useTrashNofyNote();
  const duplicateMutation = useDuplicateNofyNote();
  const createTemplateMutation = useCreateNofyTemplate();
  const createTagMutation = useCreateNofyTag();
  const restoreVersionMutation = useRestoreNofyVersion();
  const versionsQuery = useNofyVersions(versionsOpen ? noteId : null);
  const foldersQuery = useNofyFolders();
  const tagsQuery = useNofyTags();
  const [printOpen, setPrintOpen] = React.useState(false);

  const exportMarkdown = () => {
    if (!draft) return;
    const markdown = blocksToMarkdown(draft.title, draft.blocks, {
      untitledNote: N.shared.untitledNote,
      refLabel: (kind) => N.refKinds[refKindKey(kind)],
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(draft.title || "note").replace(/[^\w-]+/g, "-").toLowerCase()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(N.editor.markdownToast);
  };

  const exportPdf = () => {
    flushSave();
    setPrintOpen(true);
  };

  const printNote = React.useMemo(
    () =>
      draft
        ? {
            title: draft.title,
            icon: draft.icon,
            blocks: draft.blocks,
            folderName: foldersQuery.data?.folders.find((folder) => folder.id === draft.folderId)?.name ?? null,
            tagNames: draft.tagIds
              .map((tagId) => tagsQuery.data?.tags.find((tag) => tag.id === tagId)?.name ?? null)
              .filter((name): name is string => name !== null),
            updatedAt: noteQuery.data?.note.updatedAt ?? new Date().toISOString(),
          }
        : null,
    [draft, foldersQuery.data, tagsQuery.data, noteQuery.data],
  );

  const toggleTag = (tagId: string) => {
    if (!draftRef.current) return;
    const next = draftRef.current.tagIds.includes(tagId)
      ? draftRef.current.tagIds.filter((id) => id !== tagId)
      : [...draftRef.current.tagIds, tagId];
    applyDraft({ ...draftRef.current, tagIds: next });
  };

  if (noteQuery.isLoading || !draft) {
    return (
      <div className="space-y-4 rounded-xl border bg-surface p-6" data-testid="nofy-editor-loading">
        <Skeleton className="h-10 w-2/3 rounded-md" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-6 rounded-md" />)}
        </div>
      </div>
    );
  }

  if (noteQuery.isError) {
    return (
      <div className="rounded-xl border bg-surface p-10 text-center" data-testid="nofy-editor-error">
        <p className="text-sm font-semibold text-foreground">{N.editor.loadError}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void noteQuery.refetch()}>{dict.common.retry}</Button>
          <Button variant="ghost" size="sm" onClick={closeEditor}>{N.editor.backToNotes}</Button>
        </div>
      </div>
    );
  }

  const folders = foldersQuery.data?.folders ?? [];
  const allTags = tagsQuery.data?.tags ?? [];
  const addedTags = allTags.filter((tag) => draft.tagIds.includes(tag.id));
  const suggestions = allTags.filter((tag) => !draft.tagIds.includes(tag.id)).slice(0, 8);
  const wordCount = wordCountOf(draft.blocks);
  const statusLabel =
    saveStatus === "saving" ? dict.common.saving
    : saveStatus === "dirty" ? N.editor.statusDirty
    : saveStatus === "error" ? N.editor.statusError
    : savedAt ? `${N.time.savedPrefix} ${nofyRelativeTime(savedAt, N.time)}`
    : N.editor.statusSaved;

  return (
    <div
      ref={containerRef}
      className="rounded-xl border bg-surface"
      data-testid="nofy-editor"
      onKeyDownCapture={handleKeyDownCapture}
      onScrollCapture={handleScrollCapture}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 border-b border-border px-4 pb-3 pt-4 sm:px-6">
        <IconPicker
          icon={draft.icon}
          onPick={(emoji) => applyDraft({ ...draft, icon: emoji })}
          testid="nofy-icon-button"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <input
            value={draft.title}
            onChange={(event) => applyDraft({ ...draft, title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const first = draft.blocks.find((block) => TEXT_TYPES.has(block.type));
                if (first) ops.focusBlock(first.id, "start");
              }
            }}
            placeholder={N.shared.untitledNote}
            aria-label={N.editor.titleLabel}
            data-testid="nofy-title-input"
            className="w-full bg-transparent font-heading text-xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-2xl"
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span data-testid="nofy-save-status" data-status={saveStatus} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  saveStatus === "saved" && "bg-profit",
                  saveStatus === "dirty" && "bg-warning",
                  saveStatus === "saving" && "bg-accent animate-pulse",
                  saveStatus === "error" && "bg-loss",
                )}
              />
              {statusLabel}
              {saveStatus === "error" ? (
                <button type="button" onClick={() => flushSave()} className="font-medium text-accent underline-offset-2 hover:underline">
                  {dict.common.retry}
                </button>
              ) : null}
            </span>
            <span aria-hidden="true">·</span>
            <span data-testid="nofy-word-count" className="font-mono tabular-nums">{wordCount} {wordCount === 1 ? N.shared.wordOne : N.shared.wordMany}</span>
            {noteQuery.data?.note.updatedAt ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{N.shared.edited} {nofyRelativeTime(noteQuery.data.note.updatedAt, N.time)}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => applyDraft({ ...draft, favorite: !draft.favorite })}
            aria-label={draft.favorite ? N.shared.removeFromFavorites : N.shared.addToFavorites}
            title={draft.favorite ? N.editor.favoritedTitle : N.editor.favoriteTitle}
            data-testid="nofy-favorite-toggle"
            className={cn(
              "rounded-md p-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted",
              draft.favorite ? "text-warning" : "text-muted-foreground",
            )}
          >
            <Star className={cn("size-4", draft.favorite && "fill-warning")} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onToggleFocusMode(!focusMode)}
            aria-label={focusMode ? N.editor.focusExit : N.editor.focusEnter}
            title={focusMode ? N.editor.focusExitTitle : N.editor.focusEnterTitle}
            data-testid="nofy-focus-toggle"
            className="rounded-md p-2 text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted hover:text-foreground"
          >
            {focusMode ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-2" data-testid="nofy-note-menu">
                {N.shared.noteActions}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => duplicateMutation.mutate({ noteId })}>
                <Copy className="size-3.5" aria-hidden="true" />
                {N.editor.duplicateNote}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  createTemplateMutation.mutate(
                    { name: draft.title === "" ? N.shared.untitledTemplate : draft.title, description: N.shared.savedFromNote, icon: draft.icon ?? "📄", fromNoteId: noteId },
                    { onSuccess: () => toast.success(N.editor.templatesToast) },
                  )
                }
              >
                <FileText className="size-3.5" aria-hidden="true" />
                Save as template
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  flushSave();
                  setVersionsOpen(true);
                }}
              >
                <History className="size-3.5" aria-hidden="true" />
                {N.dialogs.versionsTitle}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMarkdown}>
                <Download className="size-3.5" aria-hidden="true" />
                {N.editor.exportMarkdown}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf} data-testid="nofy-export-pdf">
                <FileDown className="size-3.5" aria-hidden="true" />
                {N.editor.exportPdf}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  trashMutation.mutate(noteId, {
                    onSuccess: () => {
                      toast.success(N.editor.trashToast);
                      dirtyRef.current = false;
                      closeEditor();
                    },
                  })
                }
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {N.shared.moveToTrash}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={closeEditor} data-testid="nofy-editor-back" aria-label={N.editor.backToNotes}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* ── Metadata row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
        <Select
          value={draft.folderId ?? "none"}
          onValueChange={(value) => applyDraft({ ...draft, folderId: value === "none" ? null : value })}
        >
          <SelectTrigger size="sm" className="h-7 w-40 text-xs" aria-label={N.editor.folderLabel} data-testid="nofy-folder-select">
            <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <SelectValue placeholder={N.shared.noFolder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{N.shared.noFolder}</SelectItem>
            {folders.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="nofy-tags-button"
            >
              <TagIcon className="size-3.5" aria-hidden="true" />
              {addedTags.length === 0 ? N.editor.addTags : `${addedTags.length} ${addedTags.length === 1 ? N.shared.tagOne : N.shared.tagMany}`}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3" data-testid="nofy-tags-popover">
            <div className="flex gap-1.5">
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && tagDraft.trim() !== "") {
                    event.preventDefault();
                    createTagMutation.mutate(tagDraft, {
                      onSuccess: (tag) => {
                        if (draftRef.current && !draftRef.current.tagIds.includes(tag.id)) {
                          applyDraft({ ...draftRef.current, tagIds: [...draftRef.current.tagIds, tag.id] });
                        }
                        setTagDraft("");
                      },
                    });
                  }
                }}
                placeholder={N.editor.tagInputPlaceholder}
                aria-label={N.editor.tagInputLabel}
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {addedTags.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1" data-testid="nofy-note-tags">
                {addedTags.map((tag) => (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} title={N.shared.removeTag}>
                    <TagChip tag={tag} active />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{N.editor.suggestions}</p>
              <div className="flex flex-wrap gap-1">
                {suggestions.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{N.editor.noOtherTags}</span>
                ) : (
                  suggestions.map((tag) => (
                    <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} title={N.shared.addTag}>
                      <TagChip tag={tag} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <LessonOriginChip lessonRef={noteQuery.data?.note.lessonRef ?? null} />

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1" data-testid="nofy-editor-tags">
          {addedTags.slice(0, 3).map((tag) => <TagChip key={tag.id} tag={tag} />)}
        </div>
      </div>

      {/* ── Blocks ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 sm:px-6" data-testid="nofy-blocks">
        {draft.blocks.map((block, index) => (
          <NofyBlockRow
            key={block.id}
            block={block}
            index={index}
            total={draft.blocks.length}
            ops={ops}
            dragState={dragState}
            setDragState={setDragState}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            const fresh: NofyBlock = { id: clientBlockId(), type: "paragraph", text: "" };
            mutateBlocks((blocks) => [...blocks, fresh]);
            requestFocus(fresh.id, "start");
          }}
          aria-label={N.editor.addBlockLabel}
          className="mt-2 h-10 w-full rounded-md text-left text-sm text-muted-foreground/40 transition-colors hover:bg-muted/40 hover:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="pl-7">{N.editor.addBlockHint}</span>
        </button>
      </div>

      {/* ── Slash command menu ─────────────────────────────────────────────── */}
      {slashMenu && slashMatches.length > 0 ? (
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          style={{ top: slashMenu.top, left: slashMenu.left }}
          data-testid="nofy-slash-menu"
          role="listbox"
          aria-label={N.editor.slashMenuLabel}
        >
          <ul className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {slashMatches.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.cmd}>
                  <button
                    type="button"
                    onClick={() => applySlashItem(item)}
                    onMouseEnter={() => setSlashIndex(index)}
                    role="option"
                    aria-selected={index === slashIndex}
                    data-testid="nofy-slash-item"
                    data-cmd={item.cmd}
                    ref={index === slashIndex ? activeSlashRef : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none",
                      index === slashIndex ? "bg-accent/10" : "",
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                      <Icon className="size-3.5 text-foreground" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">{N.slash.groups[item.group]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <RefPickerDialog
        key={refPicker?.sourceId ?? "ref-picker-closed"}
        open={refPicker !== null}
        onOpenChange={(open) => {
          if (!open) setRefPicker(null);
        }}
        initialKind={refPicker?.kind ?? null}
        onPick={handleRefPick}
      />
      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versionsQuery.data?.versions}
        isLoading={versionsQuery.isLoading}
        onRestore={(versionId) => {
          restoreVersionMutation.mutate(
            { noteId, versionId },
            {
              onSuccess: () => {
                dirtyRef.current = false;
                void queryClient.invalidateQueries({ queryKey: queryKeys.nofyNote(noteId) });
                toast.success(N.editor.versionRestoredToast);
              },
            },
          );
        }}
      />
      <NotePrintDialog open={printOpen} onOpenChange={setPrintOpen} note={printNote} />
    </div>
  );
}
