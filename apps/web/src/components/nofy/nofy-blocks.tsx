"use client";

import * as React from "react";
import {
  AlertTriangle,
  GripVertical,
  Info,
  Lightbulb,
  Link2,
  MoreVertical,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";

import type { NofyBlock, NofyRefKind } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NOFY_REF_META, safeNofyHref } from "./nofy-shared";

/**
 * Nofy block renderers — one component per block type. Text blocks are
 * UNCONTROLLED textareas (defaultValue only) so React re-renders from the
 * autosave loop can never move the caret. All key behaviours (Enter split,
 * Backspace merge, arrow traversal) live here and talk to the editor
 * through the ops contract below.
 */

// ── Ops contract (implemented by the editor) ─────────────────────────────────

export type NofyBlockOps = {
  updateText: (id: string, text: string) => void;
  updateBlock: (id: string, patch: Partial<NofyBlock>) => void;
  /** Enter — split the block at the caret, returning the new block's type. */
  splitBlock: (id: string, caret: number) => void;
  /** Backspace at position 0 — merge into the previous block (or delete). */
  mergeBackward: (id: string) => void;
  deleteBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (id: string, direction: -1 | 1) => void;
  reorder: (dragId: string, targetId: string, position: "above" | "below") => void;
  /** Exact focus on a known block (after transforms). */
  focusBlock: (id: string, caret: "start" | "end") => void;
  /** Arrow-key traversal — previous block end / next block start. */
  focusNeighbor: (id: string, direction: -1 | 1) => void;
  registerTextArea: (id: string, el: HTMLTextAreaElement | null) => void;
  /** Trading reference — open the entity picker for this kind. */
  openRefPicker: (kind: NofyRefKind, sourceBlockId: string) => void;
  /** Flush pending autosave, then SPA-navigate to a reference's href. */
  navigateToRef: (href: string) => void;
  /** Slash command menu — (source block id, current filter text). */
  openSlashMenu: (sourceBlockId: string, filter: string) => void;
  closeSlashMenu: () => void;
};

// ── Textarea helpers ─────────────────────────────────────────────────────────

export function autoResize(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

const TEXT_BLOCK_CLASS =
  "w-full resize-none overflow-hidden rounded-sm border border-transparent bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-border focus:bg-background";

const PLACEHOLDERS: Record<string, string> = {
  paragraph: "Write something, press '/' for commands…",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "List item…",
  numbered: "List item…",
  todo: "To-do…",
  quote: "Quote…",
  callout: "Callout text…",
  code: "Code…",
};

const HEADING_SIZES: Record<string, string> = {
  h1: "text-2xl font-bold font-heading",
  h2: "text-xl font-semibold font-heading",
  h3: "text-lg font-semibold font-heading",
};

// ── Markdown shortcuts (spec §13) ────────────────────────────────────────────

const MARKDOWN_TRANSFORMS: [RegExp, NofyBlock["type"], Partial<NofyBlock>][] = [
  [/^# $/, "h1", {}],
  [/^## $/, "h2", {}],
  [/^### $/, "h3", {}],
  [/^[-*] $/, "bullet", {}],
  [/^1\. $/, "numbered", {}],
  [/^\[\]\s?$|^\[\s?\]\s?$/, "todo", { checked: false }],
  [/^> $/, "quote", {}],
  [/^```$/, "code", {}],
  [/^---$/, "divider", {}],
];

/** Returns true when a markdown shortcut consumed the input. */
function tryMarkdownTransform(
  block: NofyBlock,
  value: string,
  ops: NofyBlockOps,
): boolean {
  if (block.type !== "paragraph") return false;
  for (const [pattern, type, extra] of MARKDOWN_TRANSFORMS) {
    if (pattern.test(value)) {
      ops.updateBlock(block.id, { type, text: type === "divider" ? "" : "", ...extra });
      ops.focusBlock(block.id, "end");
      return true;
    }
  }
  return false;
}

// ── Slash detection ──────────────────────────────────────────────────────────

/** "/" at block start opens the command menu, further chars filter it. */
function slashFilterOf(value: string, caret: number): string | null {
  const before = value.slice(0, caret);
  const match = /^\/([\w-]*)$/.exec(before);
  return match ? match[1] : null;
}

// ── Text-bearing block (paragraph/headings/lists/todo/quote/callout/code) ────

function TextBlockBody({
  block,
  ops,
  focusable,
}: {
  block: NofyBlock;
  ops: NofyBlockOps;
  focusable: boolean;
}) {
  const refCallback = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      ops.registerTextArea(block.id, el);
      if (el) autoResize(el);
    },
    [block.id, ops],
  );

  const handleInput = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    autoResize(el);
    const filter = slashFilterOf(el.value, el.selectionStart ?? 0);
    if (filter !== null) {
      ops.openSlashMenu(block.id, filter);
    } else {
      ops.closeSlashMenu();
    }
    if (tryMarkdownTransform(block, el.value, ops)) return;
    ops.updateText(block.id, el.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    const caret = el.selectionStart ?? 0;

    if (event.key === "Enter" && !event.shiftKey && block.type !== "code") {
      event.preventDefault();
      // Empty list item → exit the list into a paragraph.
      if ((block.type === "bullet" || block.type === "numbered" || block.type === "todo") && el.value.trim() === "") {
        ops.updateBlock(block.id, { type: "paragraph", checked: undefined });
        ops.focusBlock(block.id, "end");
        return;
      }
      ops.splitBlock(block.id, caret);
      return;
    }

    if (event.key === "Backspace" && caret === 0 && (el.selectionEnd ?? 0) === 0) {
      event.preventDefault();
      ops.mergeBackward(block.id);
      return;
    }

    if (event.key === "ArrowUp" && caret === 0) {
      event.preventDefault();
      ops.focusNeighbor(block.id, -1);
      return;
    }
    if (event.key === "ArrowDown" && caret === el.value.length) {
      event.preventDefault();
      ops.focusNeighbor(block.id, 1);
      return;
    }
  };

  const shared = {
    ref: refCallback,
    rows: 1,
    "data-block-id": block.id,
    className: cn(
      TEXT_BLOCK_CLASS,
      HEADING_SIZES[block.type],
      block.type === "code" && "font-mono text-[13px] leading-normal",
    ),
    placeholder: PLACEHOLDERS[block.type] ?? "",
    defaultValue: block.text,
    onInput: handleInput,
    onKeyDown: handleKeyDown,
    "aria-label": `${block.type} block`,
    onFocus: () => {
      if (focusable) return;
    },
  };

  return <textarea {...shared} />;
}

// ── Block row (gutter + body by type) ────────────────────────────────────────

export function NofyBlockRow({
  block,
  index,
  total,
  ops,
  dragState,
  setDragState,
  compactGutter,
}: {
  block: NofyBlock;
  index: number;
  total: number;
  ops: NofyBlockOps;
  dragState: { dragId: string | null; overId: string | null; position: "above" | "below" | null };
  setDragState: React.Dispatch<React.SetStateAction<{ dragId: string | null; overId: string | null; position: "above" | "below" | null }>>;
  compactGutter?: boolean;
}) {
  const isDragging = dragState.dragId === block.id;
  const dropEdge =
    dragState.dragId !== null && dragState.overId === block.id && dragState.dragId !== block.id
      ? dragState.position
      : null;

  const handleDragOver = (event: React.DragEvent) => {
    if (dragState.dragId === null || dragState.dragId === block.id) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
    if (dragState.overId !== block.id || dragState.position !== position) {
      setDragState({ dragId: dragState.dragId, overId: block.id, position });
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (dragState.dragId !== null && dragState.dragId !== block.id && dragState.position !== null) {
      ops.reorder(dragState.dragId, block.id, dragState.position);
    }
    setDragState({ dragId: null, overId: null, position: null });
  };

  return (
    <div
      className={cn("group/row relative flex gap-1", isDragging && "opacity-40")}
      data-testid="nofy-block"
      data-block-id={block.id}
      data-block-type={block.type}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragState((state) => (state.overId === block.id ? { ...state, overId: null, position: null } : state))}
      onDrop={handleDrop}
    >
      {dropEdge !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-0.5 rounded bg-accent"
          style={dropEdge === "above" ? { top: -2 } : { bottom: -2 }}
        />
      ) : null}

      {/* Gutter — drag handle + block menu, visible on hover/focus */}
      {!compactGutter ? (
        <div className="flex w-6 shrink-0 flex-col items-center pt-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDragState({ dragId: block.id, overId: null, position: null });
            }}
            onDragEnd={() => setDragState({ dragId: null, overId: null, position: null })}
            aria-label="Drag to reorder this block"
            title="Drag to reorder"
            className="cursor-grab rounded p-0.5 text-muted-foreground/60 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
          <BlockMenu block={block} index={index} total={total} ops={ops} />
        </div>
      ) : (
        <span className="w-6 shrink-0" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1 pb-0.5">
        {block.type === "paragraph" ? (
          <TextBlockBody block={block} ops={ops} focusable={false} />
        ) : block.type === "h1" || block.type === "h2" || block.type === "h3" ? (
          <TextBlockBody block={block} ops={ops} focusable={false} />
        ) : block.type === "bullet" ? (
          <div className="flex items-start gap-2">
            <span className="flex h-8 items-center text-muted-foreground" aria-hidden="true">•</span>
            <TextBlockBody block={block} ops={ops} focusable={false} />
          </div>
        ) : block.type === "numbered" ? (
          <div className="flex items-start gap-2">
            <span className="flex h-8 items-center font-mono text-xs text-muted-foreground" aria-hidden="true">{index + 1}.</span>
            <TextBlockBody block={block} ops={ops} focusable={false} />
          </div>
        ) : block.type === "todo" ? (
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={block.checked ?? false}
              onChange={(event) => ops.updateBlock(block.id, { checked: event.target.checked })}
              aria-label="Toggle to-do"
              className="mt-2.5 size-3.5 shrink-0 cursor-pointer accent-[var(--accent)]"
              data-testid="nofy-todo-check"
            />
            <div className={cn("min-w-0 flex-1", block.checked && "opacity-60")}>
              <TextBlockBody block={block} ops={ops} focusable={false} />
            </div>
          </div>
        ) : block.type === "quote" ? (
          <div className="border-l-2 border-border pl-3">
            <TextBlockBody block={block} ops={ops} focusable={false} />
          </div>
        ) : block.type === "callout" ? (
          <CalloutBody block={block} ops={ops} />
        ) : block.type === "code" ? (
          <div className="overflow-hidden rounded-md border border-border bg-muted/60">
            <TextBlockBody block={block} ops={ops} focusable={false} />
          </div>
        ) : block.type === "divider" ? (
          <div className="flex items-center gap-2 py-2">
            <hr className="h-px flex-1 border-0 bg-border" />
            <button
              type="button"
              onClick={() => ops.deleteBlock(block.id)}
              aria-label="Delete divider"
              className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-loss group-hover/row:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : block.type === "image" ? (
          <ImageBody block={block} ops={ops} />
        ) : block.type === "table" ? (
          <TableBody block={block} ops={ops} />
        ) : block.type === "ref" ? (
          <RefBody block={block} ops={ops} />
        ) : null}
      </div>
    </div>
  );
}

// ── Block menu (turn into / duplicate / move / delete) ───────────────────────

const TURN_INTO: { type: NofyBlock["type"]; label: string }[] = [
  { type: "paragraph", label: "Text" },
  { type: "h1", label: "Heading 1" },
  { type: "h2", label: "Heading 2" },
  { type: "h3", label: "Heading 3" },
  { type: "bullet", label: "Bullet list" },
  { type: "numbered", label: "Numbered list" },
  { type: "todo", label: "To-do" },
  { type: "quote", label: "Quote" },
  { type: "callout", label: "Callout" },
  { type: "code", label: "Code" },
];

function BlockMenu({
  block,
  index,
  total,
  ops,
}: {
  block: NofyBlock;
  index: number;
  total: number;
  ops: NofyBlockOps;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Block options"
          title="Block options"
          className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {isTextLike(block.type) ? (
          <>
            {TURN_INTO.map((option) => (
              <DropdownMenuItem
                key={option.type}
                disabled={option.type === block.type}
                onClick={() => ops.updateBlock(block.id, { type: option.type, ...(option.type !== "todo" ? { checked: undefined } : { checked: false }) })}
              >
                Turn into {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={() => ops.duplicateBlock(block.id)}>Duplicate</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onClick={() => ops.moveBlock(block.id, -1)}>Move up</DropdownMenuItem>
        <DropdownMenuItem disabled={index === total - 1} onClick={() => ops.moveBlock(block.id, 1)}>Move down</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => ops.deleteBlock(block.id)}>Delete block</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isTextLike(type: NofyBlock["type"]): boolean {
  return ["paragraph", "h1", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout", "code"].includes(type);
}

// ── Callout ──────────────────────────────────────────────────────────────────

const CALLOUT_TONES: { tone: NonNullable<NofyBlock["tone"]>; icon: typeof Info; hue: string; label: string }[] = [
  { tone: "info", icon: Info, hue: "var(--accent)", label: "Info" },
  { tone: "tip", icon: Lightbulb, hue: "var(--profit)", label: "Tip" },
  { tone: "warn", icon: AlertTriangle, hue: "var(--warning)", label: "Warning" },
  { tone: "risk", icon: ShieldAlert, hue: "var(--loss)", label: "Risk" },
];

function CalloutBody({ block, ops }: { block: NofyBlock; ops: NofyBlockOps }) {
  const tone = block.tone ?? "info";
  const meta = CALLOUT_TONES.find((entry) => entry.tone === tone) ?? CALLOUT_TONES[0]!;
  const Icon = meta.icon;
  return (
    <div
      className="flex gap-2.5 rounded-md border p-3"
      style={{
        borderColor: `color-mix(in srgb, ${meta.hue} 35%, transparent)`,
        background: `color-mix(in srgb, ${meta.hue} 8%, transparent)`,
      }}
      data-testid="nofy-callout"
    >
      <span className="flex flex-col items-center gap-1.5 pt-0.5">
        <Icon className="size-4 shrink-0" style={{ color: meta.hue }} aria-hidden="true" />
        <span className="flex flex-col gap-0.5">
          {CALLOUT_TONES.map((entry) => {
            const ToneIcon = entry.icon;
            return (
              <button
                key={entry.tone}
                type="button"
                onClick={() => ops.updateBlock(block.id, { tone: entry.tone })}
                aria-label={`Callout tone: ${entry.label}`}
                title={entry.label}
                className={cn(
                  "rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  entry.tone === tone ? "opacity-100" : "opacity-25 hover:opacity-70",
                )}
              >
                <ToneIcon className="size-3" style={{ color: entry.hue }} aria-hidden="true" />
              </button>
            );
          })}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <TextBlockBody block={block} ops={ops} focusable={false} />
      </div>
    </div>
  );
}

// ── Image ────────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 2_000_000;

function ImageBody({ block, ops }: { block: NofyBlock; ops: NofyBlockOps }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = React.useState("");

  const readFile = (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => ops.updateBlock(block.id, { src: String(reader.result ?? "") });
    reader.readAsDataURL(file);
  };

  if (!block.src) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-3"
        data-testid="nofy-image-empty"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file && file.type.startsWith("image/")) readFile(file);
        }}
      >
        <Upload className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && urlDraft.trim() !== "") {
              event.preventDefault();
              ops.updateBlock(block.id, { src: urlDraft.trim() });
            }
          }}
          placeholder="Paste an image URL and press Enter…"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          aria-label="Image URL"
        />
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" aria-hidden="true" />
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file);
            event.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <figure className="overflow-hidden rounded-md border border-border" data-testid="nofy-image">
      {/* Remote URLs are only ever self-seeded data URLs / user-provided image srcs
          rendered as an <img> — never injected HTML (spec §49). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.src} alt={block.alt ?? block.caption ?? "Note image"} className="max-h-96 w-full object-contain bg-muted/30" />
      <figcaption className="flex items-center gap-2 border-t border-border bg-surface px-2 py-1.5">
        <input
          value={block.caption ?? ""}
          onChange={(event) => ops.updateBlock(block.id, { caption: event.target.value })}
          placeholder="Caption…"
          aria-label="Image caption"
          className="h-6 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:border-border"
        />
        <button
          type="button"
          onClick={() => ops.updateBlock(block.id, { src: undefined })}
          aria-label="Remove image"
          className="rounded p-0.5 text-muted-foreground/60 hover:text-loss outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

function TableBody({ block, ops }: { block: NofyBlock; ops: NofyBlockOps }) {
  const rows = block.rows ?? [["", "", ""], ["", "", ""]];
  const setRows = (next: string[][]) => ops.updateBlock(block.id, { rows: next });

  const setCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = rows.map((row, r) => row.map((cell, c) => (r === rowIndex && c === colIndex ? value : cell)));
    setRows(next);
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border" data-testid="nofy-table">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={cn(rowIndex === 0 && "bg-muted/60")}>
              {row.map((cell, colIndex) => (
                <td key={colIndex} className="border-b border-border px-2 py-1 last:border-r-0 border-r">
                  <input
                    value={cell}
                    onChange={(event) => setCell(rowIndex, colIndex, event.target.value)}
                    aria-label={rowIndex === 0 ? `Header column ${colIndex + 1}` : `Row ${rowIndex} column ${colIndex + 1}`}
                    className={cn(
                      "w-full min-w-24 bg-transparent py-0.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50",
                      rowIndex === 0 && "font-semibold",
                    )}
                    placeholder="…"
                  />
                </td>
              ))}
              <td className="w-6 border-b border-border px-0.5 align-middle">
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((_, r) => r !== rowIndex))}
                  disabled={rows.length <= 1}
                  aria-label={`Delete row ${rowIndex + 1}`}
                  className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-loss focus:opacity-100 group-hover/row:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-0"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-border bg-surface px-2 py-1">
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setRows([...rows, rows[0]!.map(() => "")])}>
          + Row
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setRows(rows.map((row) => [...row, ""]))}
          disabled={rows[0]!.length >= 8}
        >
          + Column
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setRows(rows.map((row) => row.slice(0, -1)))}
          disabled={rows[0]!.length <= 1}
        >
          − Column
        </Button>
      </div>
    </div>
  );
}

// ── Trading reference ────────────────────────────────────────────────────────

function RefBody({ block, ops }: { block: NofyBlock; ops: NofyBlockOps }) {
  const ref = block.ref;
  if (!ref) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        <Link2 className="size-4" aria-hidden="true" />
        Missing reference
        <Button type="button" variant="outline" size="sm" className="ml-auto h-7" onClick={() => ops.deleteBlock(block.id)}>
          Remove
        </Button>
      </div>
    );
  }
  const meta = NOFY_REF_META[ref.kind];
  const Icon = meta.icon;
  const href = safeNofyHref(ref.href);
  return (
    <div
      className="flex items-center gap-2.5 rounded-md border p-3 transition-colors hover:bg-muted/40"
      style={{ borderColor: `color-mix(in srgb, ${meta.hue} 30%, transparent)` }}
      data-testid="nofy-ref-block"
      data-ref-kind={ref.kind}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-md"
        style={{ background: `color-mix(in srgb, ${meta.hue} 14%, transparent)` }}
        aria-hidden="true"
      >
        <Icon className="size-4" style={{ color: meta.hue }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{ref.label ?? meta.label}</span>
        {ref.meta ? <span className="block truncate text-xs text-muted-foreground">{ref.meta}</span> : null}
      </span>
      {href ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1"
          onClick={() => ops.navigateToRef(href)}
          data-testid="nofy-ref-open"
        >
          Open
        </Button>
      ) : null}
      <button
        type="button"
        onClick={() => ops.deleteBlock(block.id)}
        aria-label="Remove reference"
        className="rounded p-0.5 text-muted-foreground/60 hover:text-loss outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
