"use client";

import * as React from "react";
import {
  Check,
  Copy,
  FolderInput,
  Grid2x2,
  List as ListIcon,
  MoreVertical,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";

import type { NofyNoteRow } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDuplicateNofyNote,
  useNofyFolders,
  useNofyNotes,
  useNofyTags,
  useTrashNofyNote,
  useUpdateNofyNote,
  type NofyNotesParams,
} from "@/lib/api/queries";
import { FolderChip, NofyEmptyState, TagChip, nofyRelativeTime } from "./nofy-shared";

/**
 * Nofy notes browser — the shared list/grid surface behind My Notes,
 * Favorites and the per-folder views. Search is debounced and served
 * server-side (title + content + tags + folder, spec §21); sorting and
 * the list/grid views follow the module convention.
 */

export function NotesBrowser({
  params,
  onParamsChange,
  onOpenNote,
  onCreateNote,
  emptyState,
  testid,
  showTagFilter = true,
}: {
  params: NofyNotesParams;
  onParamsChange: (partial: Partial<NofyNotesParams>) => void;
  onOpenNote: (noteId: string) => void;
  onCreateNote: () => void;
  emptyState: { icon?: typeof ListIcon; title: string; body: string };
  testid?: string;
  showTagFilter?: boolean;
}) {
  const { dict } = useI18n();
  const N = dict.nofy;
  const [rawQuery, setRawQuery] = React.useState(params.q);
  const [layout, setLayout] = React.useState<"list" | "grid">("list");
  const [moveTarget, setMoveTarget] = React.useState<NofyNoteRow | null>(null);
  /** External filter changes (tab switches, chip clicks) adopt into the input —
   * render-phase adjustment with pure state (no refs). */
  const [lastExternalQuery, setLastExternalQuery] = React.useState(params.q);
  if (params.q !== lastExternalQuery) {
    setLastExternalQuery(params.q);
    setRawQuery(params.q);
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (rawQuery !== params.q) onParamsChange({ q: rawQuery });
    }, 300);
    return () => clearTimeout(timer);
  }, [rawQuery, params.q, onParamsChange]);

  const notesQuery = useNofyNotes(params);
  const tagsQuery = useNofyTags();
  const notes = notesQuery.data?.notes ?? [];
  const tags = (tagsQuery.data?.tags ?? []).filter((tag) => tag.noteCount > 0);

  return (
    <div className="space-y-3" data-testid={testid}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
            placeholder={N.notes.searchPlaceholder}
            aria-label={N.notes.searchLabel}
            className="pl-8"
            data-testid="nofy-notes-search"
          />
        </div>
        <Select value={params.sort} onValueChange={(value) => onParamsChange({ sort: value })}>
          <SelectTrigger className="h-9 w-40 text-sm" aria-label={N.notes.sortLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">{N.notes.sortUpdated}</SelectItem>
            <SelectItem value="created">{N.notes.sortCreated}</SelectItem>
            <SelectItem value="title">{N.notes.sortTitle}</SelectItem>
            <SelectItem value="viewed">{N.notes.sortViewed}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={N.notes.layoutLabel}>
          <button
            type="button"
            onClick={() => setLayout("list")}
            aria-label={N.notes.listView}
            aria-pressed={layout === "list"}
            className={cn("p-2 transition-colors", layout === "list" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground")}
          >
            <ListIcon className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setLayout("grid")}
            aria-label={N.notes.gridView}
            aria-pressed={layout === "grid"}
            className={cn("p-2 transition-colors", layout === "grid" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground")}
          >
            <Grid2x2 className="size-4" aria-hidden="true" />
          </button>
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={onCreateNote} data-testid="nofy-new-note">
          <Plus className="size-4" aria-hidden="true" />
          {N.notes.newNote}
        </Button>
      </div>

      {/* Tag filter chips */}
      {showTagFilter && tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="nofy-tag-filter">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              active={params.tagId === tag.id}
              onClick={() => onParamsChange({ tagId: params.tagId === tag.id ? "" : tag.id })}
            />
          ))}
        </div>
      ) : null}

      {/* Content */}
      {notesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        params.q !== "" ? (
          <NofyEmptyState
            icon={Search}
            title={N.notes.emptySearchTitle}
            body={N.notes.emptySearchBody}
            testid="nofy-notes-empty-search"
          />
        ) : (
          <NofyEmptyState
            icon={emptyState.icon}
            title={emptyState.title}
            body={emptyState.body}
            action={{ label: N.overview.createFirstNote, onClick: onCreateNote }}
            testid="nofy-notes-empty"
          />
        )
      ) : layout === "list" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface" data-testid="nofy-notes-list">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onOpen={() => onOpenNote(note.id)}
              onMove={() => setMoveTarget(note)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="nofy-notes-grid">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onOpen={() => onOpenNote(note.id)}
              onMove={() => setMoveTarget(note)}
            />
          ))}
        </div>
      )}

      <MoveDialog
        note={moveTarget}
        onClose={() => setMoveTarget(null)}
      />
    </div>
  );
}

// ── List row ─────────────────────────────────────────────────────────────────

function NoteRow({ note, onOpen, onMove }: { note: NofyNoteRow; onOpen: () => void; onMove: () => void }) {
  const { dict } = useI18n();
  const N = dict.nofy;
  const displayTitle = note.title === "" ? N.shared.untitledNote : note.title;
  return (
    <li>
      <div
        className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 outline-none"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter") onOpen();
        }}
        role="button"
        tabIndex={0}
        aria-label={`${N.shared.openNote} ${displayTitle}`}
        data-testid="nofy-note-row"
      >
        <span className="mt-0.5 shrink-0 text-lg leading-none" aria-hidden="true">{note.icon ?? "📝"}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{displayTitle}</span>
            {note.favorite ? <Star className="size-3 shrink-0 fill-warning text-warning" aria-hidden="true" /> : null}
            {note.todoOpen > 0 ? (
              <span className="shrink-0 rounded-sm border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground" title={N.notes.openToDos}>
                {note.todoOpen}○
              </span>
            ) : null}
            {note.refCount > 0 ? (
              <span className="shrink-0 rounded-sm border border-accent/30 bg-accent/10 px-1 font-mono text-[10px] text-accent" title={N.notes.refs}>
                {note.refCount} {note.refCount === 1 ? N.shared.refOne : N.shared.refMany}
              </span>
            ) : null}
          </span>
          {note.excerpt !== "" ? (
            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{note.excerpt}</span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <FolderChip name={note.folderName} />
            {note.tagNames.slice(0, 3).map((name) => (
              <TagChip key={name} tag={{ id: name, name }} />
            ))}
            <span className="text-[11px] text-muted-foreground/70">{N.shared.edited} {nofyRelativeTime(note.updatedAt, N.time)}</span>
          </span>
        </span>
        <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <NoteMenu note={note} onOpen={onOpen} onMove={onMove} />
        </span>
      </div>
    </li>
  );
}

// ── Grid card ────────────────────────────────────────────────────────────────

function NoteCard({ note, onOpen, onMove }: { note: NofyNoteRow; onOpen: () => void; onMove: () => void }) {
  const { dict } = useI18n();
  const N = dict.nofy;
  const displayTitle = note.title === "" ? N.shared.untitledNote : note.title;
  return (
    <div
      className="group flex cursor-pointer flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      role="button"
      tabIndex={0}
      aria-label={`${N.shared.openNote} ${displayTitle}`}
      data-testid="nofy-note-card"
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none" aria-hidden="true">{note.icon ?? "📝"}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {displayTitle}
        </span>
        <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <NoteMenu note={note} onOpen={onOpen} onMove={onMove} />
        </span>
      </div>
      {note.excerpt !== "" ? (
        <p className="mt-1.5 line-clamp-3 min-h-10 text-xs text-muted-foreground">{note.excerpt}</p>
      ) : (
        <p className="mt-1.5 min-h-10 text-xs italic text-muted-foreground/60">{N.notes.emptyNote}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.favorite ? <Star className="size-3 fill-warning text-warning" aria-hidden="true" /> : null}
        <FolderChip name={note.folderName} />
        <span className="ml-auto text-[11px] text-muted-foreground/70">{nofyRelativeTime(note.updatedAt, N.time)}</span>
      </div>
    </div>
  );
}

// ── Row actions ──────────────────────────────────────────────────────────────

function NoteMenu({ note, onOpen, onMove }: { note: NofyNoteRow; onOpen: () => void; onMove: () => void }) {
  const { dict } = useI18n();
  const N = dict.nofy;
  const trashMutation = useTrashNofyNote();
  const duplicateMutation = useDuplicateNofyNote();
  const updateMutation = useUpdateNofyNote();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={N.shared.noteActions}
          onClick={(event) => event.stopPropagation()}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onClick={onOpen}>{N.shared.openNote}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicateMutation.mutate({ noteId: note.id })}>
          <Copy className="size-3.5" aria-hidden="true" />
          {N.shared.duplicate}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove()}>
          <FolderInput className="size-3.5" aria-hidden="true" />
          {N.notes.moveToFolder}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => updateMutation.mutate({ noteId: note.id, favorite: !note.favorite })}>
          <Star className={cn("size-3.5", note.favorite && "fill-warning text-warning")} aria-hidden="true" />
          {note.favorite ? N.shared.removeFromFavorites : N.shared.addToFavorites}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => trashMutation.mutate(note.id)}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          {N.shared.moveToTrash}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Move-to-folder dialog ────────────────────────────────────────────────────

function MoveDialog({ note, onClose }: { note: NofyNoteRow | null; onClose: () => void }) {
  const { dict } = useI18n();
  const N = dict.nofy;
  const foldersQuery = useNofyFolders();
  const updateMutation = useUpdateNofyNote();
  const [folderId, setFolderId] = React.useState<string>("none");
  const [lastNoteId, setLastNoteId] = React.useState<string | null>(null);
  // Render-phase adjustment: adopt the freshly opened note's folder.
  if (note && note.id !== lastNoteId) {
    setLastNoteId(note.id);
    setFolderId(note.folderId ?? "none");
  }

  return (
    <Dialog open={note !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-sm" data-testid="nofy-move-dialog">
        <DialogHeader>
          <DialogTitle>{N.notes.moveTitle}</DialogTitle>
          <DialogDescription>
            {note ? `“${note.title === "" ? N.shared.untitledNote : note.title}” - ${N.notes.movePickWhere}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Select value={folderId} onValueChange={setFolderId}>
          <SelectTrigger className="w-full" aria-label={N.notes.targetFolder}>
            <SelectValue placeholder={N.shared.noFolder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{N.shared.noFolder}</SelectItem>
            {(foldersQuery.data?.folders ?? []).map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                {folder.name} ({folder.noteCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{dict.common.cancel}</Button>
          <Button
            size="sm"
            onClick={() => {
              if (!note) return;
              updateMutation.mutate(
                { noteId: note.id, folderId: folderId === "none" ? null : folderId },
                { onSuccess: onClose },
              );
            }}
            data-testid="nofy-move-confirm"
          >
            <Check className="size-3.5" aria-hidden="true" />
            {N.notes.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
