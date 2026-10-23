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
import { useI18n } from "@/i18n/i18n-provider";
import {
  NofyEmptyState,
  NofySectionHeader,
  NofyStatCell,
  TagChip,
  nofyRelativeTime,
} from "./nofy-shared";
import { blockTypeLabel } from "./nofy-blocks";

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
  const { dict } = useI18n();
  const N = dict.nofy;
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
          <span className="truncate text-sm font-medium text-foreground">{note.title === "" ? N.shared.untitledNote : note.title}</span>
          {note.favorite ? <Star className="size-3 shrink-0 fill-warning text-warning" aria-hidden="true" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {note.folderName ? `${note.folderName} · ` : ""}{N.shared.edited} {nofyRelativeTime(note.updatedAt, N.time)}
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
  const { dict } = useI18n();
  const O = dict.nofy.overview;
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
        <NofyStatCell label={O.statNotes} value={overview.totals.notes} hint={O.statNotesHint} testid="nofy-stat-notes" />
        <NofyStatCell label={O.statCreated} value={overview.totals.createdThisWeek} hint={O.statCreatedHint} testid="nofy-stat-created" />
        <NofyStatCell label={O.statFavorites} value={overview.totals.favorites} hint={O.statFavoritesHint} testid="nofy-stat-favorites" />
        <NofyStatCell label={O.statFolders} value={overview.totals.folders} hint={O.statFoldersHint} testid="nofy-stat-folders" />
      </div>

      {/* Quick actions (spec §4) */}
      <div className="flex flex-wrap gap-2" data-testid="nofy-quick-actions">
        <Button size="sm" className="gap-1.5" onClick={onCreateNote} data-testid="nofy-quick-new-note">
          <Plus className="size-4" aria-hidden="true" />
          {O.newNote}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onGoTab("folders")}>
          <FolderPlus className="size-4" aria-hidden="true" />
          {O.newFolder}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onGoTab("templates")}>
          <LayoutTemplate className="size-4" aria-hidden="true" />
          {O.fromTemplate}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Recent notes */}
        <section className="rounded-xl border bg-surface p-4 xl:col-span-2">
          <NofySectionHeader
            title={O.recentEditedTitle}
            hint={O.recentEditedHint}
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onGoTab("notes")}>
                {O.allNotes}
              </Button>
            }
          />
          {overview.recentEdited.length === 0 ? (
            <NofyEmptyState
              title={O.emptyTitle}
              body={O.emptyBody}
              action={{ label: O.createFirstNote, onClick: onCreateNote }}
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
          <NofySectionHeader title={O.recentViewedTitle} hint={O.recentViewedHint} />
          {overview.recentViewed.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {O.recentViewedEmpty}
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
            title={O.favoritesTitle}
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onGoTab("favorites")}>
                {O.viewAll}
              </Button>
            }
          />
          {overview.favorites.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {O.favoritesEmpty}
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
            title={O.foldersTitle}
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onGoTab("folders")}>
                {O.manage}
              </Button>
            }
          />
          {overview.folders.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {O.foldersEmpty}
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
          <NofySectionHeader title={O.activityTitle} hint={O.activityHint} />
          <div className="mt-3 flex h-24 items-end gap-1.5" data-testid="nofy-activity">
            {overview.activity.map((week) => {
              const createdHeight = Math.round((week.created / maxActivity) * 100);
              const editedHeight = Math.round((week.edited / maxActivity) * 100);
              return (
                <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${week.weekStart}: ${week.created} ${O.legendCreated}, ${week.edited} ${O.legendEdited}`}>
                  <div className="flex h-20 w-full flex-col justify-end gap-px">
                    <div className="w-full rounded-sm bg-accent/70" style={{ height: `${editedHeight}%` }} title={`${week.edited} ${O.legendEdited}`} />
                    <div className="w-full rounded-sm bg-accent" style={{ height: `${createdHeight}%` }} title={`${week.created} ${O.legendCreated}`} />
                  </div>
                  <span className="text-[9px] text-muted-foreground/70">{week.weekStart.slice(5).replace("-", "/")}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-accent" aria-hidden="true" /> {O.legendCreated}</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-accent/70" aria-hidden="true" /> {O.legendEdited}</span>
          </div>
          {overview.topTags.length > 0 ? (
            <>
              <NofySectionHeader title={O.mostUsedTags} />
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
  const { dict } = useI18n();
  const N = dict.nofy;
  const F = N.folders;

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
          placeholder={F.inputPlaceholder}
          aria-label={F.inputLabel}
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
          {F.create}
        </Button>
      </div>

      {foldersQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : folders.length === 0 ? (
        <NofyEmptyState
          icon={Folder}
          title={F.emptyTitle}
          body={F.emptyBody}
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
                      {folder.noteCount} {folder.noteCount === 1 ? N.shared.noteOne : N.shared.noteMany}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${F.optionsFor} ${folder.name}`}
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
                      {F.rename}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(folder)}>
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {F.deleteFolder}
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
                {F.newNoteHere}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renaming !== null} onOpenChange={(open) => (!open ? setRenaming(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{F.renameTitle}</DialogTitle>
            <DialogDescription>{F.renameBody}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label={F.folderName}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>{dict.common.cancel}</Button>
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
              {F.rename}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleting !== null} onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}>
        <DialogContent className="max-w-sm" data-testid="nofy-folder-delete-dialog">
          <DialogHeader>
            <DialogTitle>{`${F.deleteTitlePrefix} “${deleting?.name}”?`}</DialogTitle>
            <DialogDescription>
              {`${F.deleteBodyPrefix} ${deleting?.noteCount ?? 0} ${(deleting?.noteCount ?? 0) === 1 ? N.shared.noteOne : N.shared.noteMany} ${F.deleteBodySuffix}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>{dict.common.cancel}</Button>
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
              {F.deleteFolder}
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
  const { dict } = useI18n();
  const N = dict.nofy;
  const TP = N.templates;
  const instantiate = useInstantiateNofyTemplate();

  return (
    <div className="space-y-4" data-testid="nofy-templates-panel">
      <NofySectionHeader
        title={TP.title}
        hint={TP.hint}
      />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !templates || templates.length === 0 ? (
        <NofyEmptyState
          icon={LayoutTemplate}
          title={TP.emptyTitle}
          body={TP.emptyBody}
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
                  <p className="text-xs text-muted-foreground">{template.builtIn ? TP.builtin : TP.custom} · {template.blocks.length} {template.blocks.length === 1 ? TP.blocksOne : TP.blocksMany}</p>
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
                      "-"
                    ) : block.type === "table" ? (
                      TP.tablePreview
                    ) : block.text === "" ? (
                      <span className="italic">{TP.emptyPrefix} {blockTypeLabel(block.type, N.blockTypes)}</span>
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
                {TP.use}
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
  const { dict } = useI18n();
  const N = dict.nofy;
  const TR = N.trash;

  return (
    <div className="space-y-4" data-testid="nofy-trash-panel">
      <NofySectionHeader
        title={TR.title}
        hint={TR.hint}
        action={
          notes && notes.length > 0 ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEmptying(true)} data-testid="nofy-trash-empty">
              <Trash2 className="size-3.5" aria-hidden="true" />
              {TR.empty}
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
          title={TR.emptyTitle}
          body={TR.emptyBody}
          testid="nofy-trash-empty"
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface" data-testid="nofy-trash-list">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center gap-3 px-4 py-3" data-testid="nofy-trash-row">
              <span className="shrink-0 text-lg" aria-hidden="true">{note.icon ?? "📝"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{note.title === "" ? N.shared.untitledNote : note.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {N.shared.deleted} {nofyRelativeTime(note.deletedAt, N.time)} · {N.shared.created} {nofyRelativeTime(note.createdAt, N.time)}
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
                {N.shared.restore}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-loss hover:text-loss" onClick={() => setPurging(note)}>
                <Trash2 className="size-3" aria-hidden="true" />
                {TR.deleteForever}
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
              {purging ? `${TR.purgeSinglePrefix} “${purging.title === "" ? N.shared.untitledNote : purging.title}” ${TR.purgeSingleSuffix}` : TR.purgeAllTitle}
            </DialogTitle>
            <DialogDescription>
              {purging
                ? TR.purgeBodySingle
                : `${TR.purgeBodyCountPrefix} ${notes?.length ?? 0} ${(notes?.length ?? 0) === 1 ? N.shared.noteOne : N.shared.noteMany} ${TR.purgeBodyCountSuffix}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setPurging(null); setEmptying(false); }}>{dict.common.cancel}</Button>
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
              {purging ? TR.deleteForever : TR.empty}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
