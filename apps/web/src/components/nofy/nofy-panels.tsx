"use client";

import * as React from "react";
import {
  Check,
  FileText,
  Folder,
  FolderPlus,
  LayoutTemplate,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";

import type { NofyFolder, NofyNoteRow, NofyTemplate } from "@cosmoz/shared";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  useCreateNofyFolder,
  useDeleteNofyFolder,
  useInstantiateNofyTemplate,
  useNofyFolders,
  usePurgeNofyNote,
  useRestoreNofyNote,
  useUpdateNofyFolder,
} from "@/lib/api/queries";
import {
  NofyEmptyState,
  NofySectionHeader,
  NofyStatCell,
  TagChip,
  nofyRelativeTime,
} from "./nofy-shared";

/**
 * Nofy panels — Overview (the knowledge dashboard, spec §4), Folders
 * (spec §6), Templates (spec §23) and Trash (spec §44). Each stays clean
 * and purposeful: knowledge management first, not vanity analytics.
 */

// ── Shared row renderer (compact note lines) ─────────────────────────────────

export function CompactNoteRow({
  note,
  onOpen,
  testid,
}: {
  note: NofyNoteRow;
  onOpen: (noteId: string) => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(note.id)}
      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={testid}
    >
      <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">{note.icon ?? "📝"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{note.title === "" ? "Untitled note" : note.title}</span>
          {note.favorite ? <Star className="size-3 shrink-0 fill-warning text-warning" aria-hidden="true" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {note.folderName ? `${note.folderName} · ` : ""}edited {nofyRelativeTime(note.updatedAt)}
        </span>
      </span>
    </button>
  );
}

// ── Overview (spec §4) ───────────────────────────────────────────────────────

export function OverviewPanel({
  overview,
  isLoading,
  onOpenNote,
  onCreateNote,
  onGoTab,
}: {
  overview: import("@cosmoz/shared").NofyOverviewResponse | undefined;
  isLoading: boolean;
  onOpenNote: (noteId: string) => void;
  onCreateNote: () => void;
  onGoTab: (tab: "notes" | "folders" | "templates" | "favorites" | "trash") => void;
}) {
  if (isLoading || !overview) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />)}
        </div>
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const maxActivity = Math.max(1, ...overview.activity.map((week) => week.created + week.edited));

  return (
    <div className="space-y-6" data-testid="nofy-overview">
      {/* Stat band */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <NofyStatCell label="Notes" value={overview.totals.notes} hint="Active notes in your workspace" testid="nofy-stat-notes" />
        <NofyStatCell label="Created this week" value={overview.totals.createdThisWeek} hint="New notes over the last 7 days" testid="nofy-stat-created" />
        <NofyStatCell label="Favorites" value={overview.totals.favorites} hint="Starred notes" testid="nofy-stat-favorites" />
        <NofyStatCell label="Folders" value={overview.totals.folders} hint="Folders organizing your notes" testid="nofy-stat-folders" />
      </div>

      {/* Quick actions (spec §4) */}
      <div className="flex flex-wrap gap-2" data-testid="nofy-quick-actions">
        <Button size="sm" className="gap-1.5" onClick={onCreateNote} data-testid="nofy-quick-new-note">
          <Plus className="size-4" aria-hidden="true" />
          New note
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onGoTab("folders")}>
          <FolderPlus className="size-4" aria-hidden="true" />
          New folder
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onGoTab("templates")}>
          <LayoutTemplate className="size-4" aria-hidden="true" />
          From template
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Recent notes */}
        <section className="rounded-xl border bg-surface p-4 xl:col-span-2">
          <NofySectionHeader
            title="Recently edited"
            hint="Where your knowledge is being written right now"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onGoTab("notes")}>
                All notes
              </Button>
            }
          />
          {overview.recentEdited.length === 0 ? (
            <NofyEmptyState
              title="No notes yet."
              body="Start capturing your ideas, observations, research and trading knowledge."
              action={{ label: "Create your first note", onClick: onCreateNote }}
              testid="nofy-overview-empty"
            />
          ) : (
            <div className="mt-2 space-y-0.5" data-testid="nofy-recent-edited">
              {overview.recentEdited.map((note) => (
                <CompactNoteRow key={note.id} note={note} onOpen={onOpenNote} />
              ))}
            </div>
          )}
        </section>

        {/* Recently viewed */}
        <section className="rounded-xl border bg-surface p-4">
          <NofySectionHeader title="Recently viewed" hint="Pick up where you left off" />
          {overview.recentViewed.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Open a note and it will appear here.
            </p>
          ) : (
            <div className="mt-2 space-y-0.5" data-testid="nofy-recent-viewed">
              {overview.recentViewed.map((note) => (
                <CompactNoteRow key={note.id} note={note} onOpen={onOpenNote} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Favorites shelf */}
        <section className="rounded-xl border bg-surface p-4">
          <NofySectionHeader
            title="Favorites"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onGoTab("favorites")}>
                View all
              </Button>
            }
          />
          {overview.favorites.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Star important notes to access them quickly.
            </p>
          ) : (
            <div className="mt-2 space-y-0.5" data-testid="nofy-favorites-shelf">
              {overview.favorites.map((note) => (
                <CompactNoteRow key={note.id} note={note} onOpen={onOpenNote} />
              ))}
            </div>
          )}
        </section>

        {/* Folders */}
        <section className="rounded-xl border bg-surface p-4">
          <NofySectionHeader
            title="Folders"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onGoTab("folders")}>
                Manage
              </Button>
            }
          />
          {overview.folders.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Create folders to organize strategies, research and psychology notes.
            </p>
          ) : (
            <ul className="mt-2 space-y-1" data-testid="nofy-overview-folders">
              {overview.folders.slice(0, 6).map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    onClick={() => onGoTab("folders")}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{folder.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{folder.noteCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Activity + tags */}
        <section className="rounded-xl border bg-surface p-4">
          <NofySectionHeader title="Note activity" hint="Created vs edited, last 8 weeks" />
          <div className="mt-3 flex h-24 items-end gap-1.5" data-testid="nofy-activity">
            {overview.activity.map((week) => {
              const createdHeight = Math.round((week.created / maxActivity) * 100);
              const editedHeight = Math.round((week.edited / maxActivity) * 100);
              return (
                <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${week.weekStart}: ${week.created} created, ${week.edited} edited`}>
                  <div className="flex h-20 w-full flex-col justify-end gap-px">
                    <div className="w-full rounded-sm bg-accent/70" style={{ height: `${editedHeight}%` }} title={`${week.edited} edited`} />
                    <div className="w-full rounded-sm bg-accent" style={{ height: `${createdHeight}%` }} title={`${week.created} created`} />
                  </div>
                  <span className="text-[9px] text-muted-foreground/70">{week.weekStart.slice(5).replace("-", "/")}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-accent" aria-hidden="true" /> created</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-accent/70" aria-hidden="true" /> edited</span>
          </div>
          {overview.topTags.length > 0 ? (
            <>
              <NofySectionHeader title="Most-used tags" />
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="nofy-top-tags">
                {overview.topTags.map((tag) => (
                  <TagChip key={tag.id} tag={tag} onClick={() => onGoTab("notes")} />
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// ── Folders (spec §6) ────────────────────────────────────────────────────────

export function FoldersPanel({
  onOpenFolder,
  onCreateNoteIn,
}: {
  onOpenFolder: (folderId: string | null) => void;
  onCreateNoteIn: (folderId: string | null) => void;
}) {
  const foldersQuery = useNofyFolders();
  const createFolder = useCreateNofyFolder();
  const updateFolder = useUpdateNofyFolder();
  const deleteFolder = useDeleteNofyFolder();
  const [name, setName] = React.useState("");
  const [renaming, setRenaming] = React.useState<NofyFolder | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleting, setDeleting] = React.useState<NofyFolder & { noteCount: number } | null>(null);

  const folders = foldersQuery.data?.folders ?? [];

  return (
    <div className="space-y-4" data-testid="nofy-folders-panel">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim() !== "") {
              createFolder.mutate({ name }, { onSuccess: () => setName("") });
            }
          }}
          placeholder="New folder name — e.g. Strategies, Psychology, Research…"
          aria-label="New folder name"
          data-testid="nofy-folder-name-input"
          className="max-w-md"
        />
        <Button
          size="sm"
          className="gap-1.5"
          disabled={name.trim() === ""}
          onClick={() => createFolder.mutate({ name }, { onSuccess: () => setName("") })}
          data-testid="nofy-folder-create"
        >
          <Plus className="size-4" aria-hidden="true" />
          Create folder
        </Button>
      </div>

      {foldersQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : folders.length === 0 ? (
        <NofyEmptyState
          icon={Folder}
          title="No folders yet"
          body="Folders organize your notes — Strategies, Market Analysis, Psychology, Research, Trade Ideas… you own the taxonomy."
          testid="nofy-folders-empty"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="nofy-folders-grid">
          {folders.map((folder) => (
            <div key={folder.id} className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40" data-testid="nofy-folder-card">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFolder(folder.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  data-testid="nofy-folder-open"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{folder.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {folder.noteCount} note{folder.noteCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Options for ${folder.name}`}
                      className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-ring focus:opacity-100"
                    >
                      <MoreVertical className="size-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenaming(folder);
                        setRenameValue(folder.name);
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(folder)}>
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Delete folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full justify-start text-xs text-muted-foreground"
                onClick={() => onCreateNoteIn(folder.id)}
              >
                <Plus className="size-3" aria-hidden="true" />
                New note here
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renaming !== null} onOpenChange={(open) => (!open ? setRenaming(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>Notes keep their folder assignment through the rename.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label="Folder name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={renameValue.trim() === ""}
              onClick={() => {
                if (!renaming) return;
                updateFolder.mutate(
                  { folderId: renaming.id, name: renameValue },
                  { onSuccess: () => setRenaming(null) },
                );
              }}
            >
              <Check className="size-3.5" aria-hidden="true" />
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleting !== null} onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}>
        <DialogContent className="max-w-sm" data-testid="nofy-folder-delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The folder is removed; its {deleting?.noteCount ?? 0} note{(deleting?.noteCount ?? 0) === 1 ? "" : "s"} move to “No folder” — nothing is lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!deleting) return;
                deleteFolder.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
              data-testid="nofy-folder-delete-confirm"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Templates (spec §23) ─────────────────────────────────────────────────────

export function TemplatesPanel({
  templates,
  isLoading,
  onUseTemplate,
}: {
  templates: NofyTemplate[] | undefined;
  isLoading: boolean;
  onUseTemplate: (templateId: string) => void;
}) {
  const instantiate = useInstantiateNofyTemplate();

  return (
    <div className="space-y-4" data-testid="nofy-templates-panel">
      <NofySectionHeader
        title="Templates"
        hint="Reusable structures for ideas, analyses, reviews and learning notes. Create your own from any note: Note actions → Save as template."
      />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !templates || templates.length === 0 ? (
        <NofyEmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          body="Save any note as a template to reuse its structure — trading ideas, market analyses, reviews and more."
          testid="nofy-templates-empty"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="nofy-templates-grid">
          {templates.map((template) => (
            <article key={template.id} className="flex flex-col rounded-lg border border-border bg-surface p-4" data-testid="nofy-template-card">
              <div className="flex items-start gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-lg" aria-hidden="true">
                  {template.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">{template.name}</h3>
                  <p className="text-xs text-muted-foreground">{template.builtIn ? "Built-in" : "Custom"} · {template.blocks.length} blocks</p>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 min-h-8 text-xs text-muted-foreground">{template.description}</p>
              <ul className="mt-2.5 min-h-16 flex-1 space-y-0.5 rounded-md border border-border bg-background/60 p-2">
                {template.blocks.slice(0, 4).map((block) => (
                  <li key={block.id} className="truncate text-[11px] text-muted-foreground">
                    {block.type === "h1" || block.type === "h2" || block.type === "h3" ? (
                      <span className="font-semibold text-foreground">{block.text}</span>
                    ) : block.type === "todo" ? (
                      `☐ ${block.text}`
                    ) : block.type === "divider" ? (
                      "—"
                    ) : block.type === "table" ? (
                      "▦ Table"
                    ) : block.text === "" ? (
                      <span className="italic">Empty {block.type}</span>
                    ) : (
                      block.text
                    )}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                className="mt-3 w-full gap-1.5"
                disabled={instantiate.isPending}
                onClick={() => onUseTemplate(template.id)}
                data-testid={`nofy-template-use-${template.id}`}
              >
                <FileText className="size-3.5" aria-hidden="true" />
                Use template
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trash (spec §44) ─────────────────────────────────────────────────────────

export function TrashPanel({
  notes,
  isLoading,
}: {
  notes: NofyNoteRow[] | undefined;
  isLoading: boolean;
}) {
  const restore = useRestoreNofyNote();
  const purge = usePurgeNofyNote();
  const [purging, setPurging] = React.useState<NofyNoteRow | null>(null);
  const [emptying, setEmptying] = React.useState(false);

  return (
    <div className="space-y-4" data-testid="nofy-trash-panel">
      <NofySectionHeader
        title="Trash"
        hint="Deleted notes stay here until permanently removed. Restore them any time."
        action={
          notes && notes.length > 0 ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEmptying(true)} data-testid="nofy-trash-empty">
              <Trash2 className="size-3.5" aria-hidden="true" />
              Empty trash
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !notes || notes.length === 0 ? (
        <NofyEmptyState
          icon={Trash2}
          title="Trash is empty"
          body="Deleted notes land here first — nothing is lost until you empty the trash."
          testid="nofy-trash-empty"
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface" data-testid="nofy-trash-list">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center gap-3 px-4 py-3" data-testid="nofy-trash-row">
              <span className="shrink-0 text-lg" aria-hidden="true">{note.icon ?? "📝"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{note.title === "" ? "Untitled note" : note.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  deleted {nofyRelativeTime(note.deletedAt)} · created {nofyRelativeTime(note.createdAt)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1"
                onClick={() => restore.mutate(note.id)}
                data-testid={`nofy-trash-restore-${note.id}`}
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Restore
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-loss hover:text-loss" onClick={() => setPurging(note)}>
                <Trash2 className="size-3" aria-hidden="true" />
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Permanent delete confirmations */}
      <Dialog open={purging !== null || emptying} onOpenChange={(open) => { if (!open) { setPurging(null); setEmptying(false); } }}>
        <DialogContent className="max-w-sm" data-testid="nofy-purge-dialog">
          <DialogHeader>
            <DialogTitle>
              {purging ? `Delete “${purging.title === "" ? "Untitled note" : purging.title}” forever?` : "Empty the trash?"}
            </DialogTitle>
            <DialogDescription>
              {purging
                ? "This permanently removes the note, its blocks and its version history. This cannot be undone."
                : `This permanently removes ${notes?.length ?? 0} note${(notes?.length ?? 0) === 1 ? "" : "s"} with their version history. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setPurging(null); setEmptying(false); }}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="nofy-purge-confirm"
              onClick={() => {
                if (purging) {
                  purge.mutate(purging.id, { onSuccess: () => setPurging(null) });
                } else if (emptying && notes) {
                  // Sequential purges — the last one closes the dialog.
                  notes.forEach((note, index) => {
                    purge.mutate(note.id, {
                      onSuccess: () => {
                        if (index === notes.length - 1) setEmptying(false);
                      },
                    });
                  });
                }
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {purging ? "Delete forever" : "Empty trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
