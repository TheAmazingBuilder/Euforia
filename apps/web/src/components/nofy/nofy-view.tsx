"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Folder,
  LayoutDashboard,
  NotebookText,
  Star,
  Trash2,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NofyEditor } from "./nofy-editor";
import { NotesBrowser } from "./nofy-notes";
import { FoldersPanel, OverviewPanel, TemplatesPanel, TrashPanel } from "./nofy-panels";
import { nofyRelativeTime } from "./nofy-shared";
import { useI18n } from "@/i18n/i18n-provider";
import {
  NOFY_DEFAULT_PARAMS,
  useCreateNofyNote,
  useInstantiateNofyTemplate,
  useNofyNote,
  useNofyOverview,
  useNofyNotes,
  useNofyTemplates,
  type NofyNotesParams,
} from "@/lib/api/queries";

/**
 * Nofy shell — the personal knowledge workspace lives on ONE route with
 * internal navigation (?tab=, module convention): Overview, My Notes,
 * Folders, Favorites, Templates and Trash. Opening a note (?note=) swaps
 * the whole content area for the block editor; Focus Mode hides the
 * chrome entirely (spec §40/§41). Nofy is a first-class module under the
 * ACADEMY section — never a sub-tab of Academy (spec §1/§78).
 */

/** Tab ids + icons only — labels resolve through dict.nofy.view.tabs. */
const TABS = [
  { id: "overview", icon: LayoutDashboard },
  { id: "notes", icon: FileText },
  { id: "folders", icon: Folder },
  { id: "favorites", icon: Star },
  { id: "templates", icon: NotebookText },
  { id: "trash", icon: Trash2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function NofyView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dict } = useI18n();
  const N = dict.nofy;

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TABS.some((tab) => tab.id === rawTab) ? rawTab : "overview") as TabId;
  const openNoteId = searchParams.get("note");
  const openNoteQuery = useNofyNote(openNoteId);
  const [focusMode, setFocusMode] = React.useState(false);

  const notesParams: NofyNotesParams = {
    ...NOFY_DEFAULT_PARAMS,
    view: (searchParams.get("view") as NofyNotesParams["view"]) ?? "all",
    folderId: searchParams.get("folder") ?? "",
    tagId: searchParams.get("tag") ?? "",
    q: searchParams.get("q") ?? "",
    sort: searchParams.get("sort") ?? "updated",
  };
  const favoritesParams: NofyNotesParams = { ...notesParams, view: "favorites" };

  const overviewQuery = useNofyOverview();
  const trashQuery = useNofyNotes({ ...NOFY_DEFAULT_PARAMS, view: "trash" });
  const templatesQuery = useNofyTemplates();

  const createNote = useCreateNofyNote();
  const instantiateTemplate = useInstantiateNofyTemplate();

  const setParams = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`/nofy${params.toString() === "" ? "" : `?${params.toString()}`}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setTab = React.useCallback(
    (tab: string) => setParams({ tab, note: null, folder: null, tag: null, q: null, sort: null, view: null }),
    [setParams],
  );

  const openNote = React.useCallback((noteId: string) => setParams({ tab: activeTab, note: noteId }), [setParams, activeTab]);
  const closeNote = React.useCallback(() => setParams({ note: null }), [setParams]);

  const handleCreateNote = React.useCallback(
    (folderId: string | null = null) => {
      createNote.mutate(
        { folderId },
        { onSuccess: (data) => openNote(data.note.id) },
      );
    },
    [createNote, openNote],
  );

  const handleUseTemplate = React.useCallback(
    (templateId: string) => {
      instantiateTemplate.mutate(
        { templateId },
        { onSuccess: (data) => openNote(data.note.id) },
      );
    },
    [instantiateTemplate, openNote],
  );

  const setNotesParams = React.useCallback(
    (partial: Partial<NofyNotesParams>) => {
      setParams({
        view: partial.view ?? null,
        folder: partial.folderId ?? null,
        tag: partial.tagId ?? null,
        q: partial.q ?? null,
        sort: partial.sort && partial.sort !== "updated" ? partial.sort : null,
      });
    },
    [setParams],
  );

  // ── Editor mode — the writing surface takes over the content area ──────────
  if (openNoteId !== null && openNoteId !== "") {
    return (
      <div className="mx-auto w-full max-w-4xl" data-testid="nofy-view">
        <div className="space-y-4">
          {!focusMode ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={closeNote}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
                data-testid="nofy-back-to-notes"
              >
                ← Nofy
              </button>
              {openNoteQuery.data?.note.updatedAt ? (
                <span className="text-xs text-muted-foreground">{N.view.lastEdited} {nofyRelativeTime(openNoteQuery.data.note.updatedAt, N.time)}</span>
              ) : null}
            </div>
          ) : null}
          <NofyEditor
            key={openNoteId}
            noteId={openNoteId}
            focusMode={focusMode}
            onToggleFocusMode={setFocusMode}
            onClose={closeNote}
          />
          {focusMode ? (
            <p className="text-center text-xs text-muted-foreground">
              {N.view.focusHint}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="nofy-view">
      {/* Identity band */}
      <header className="overflow-hidden rounded-xl border bg-surface" data-testid="nofy-header">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                <NotebookText className="size-6 text-accent sm:size-7" aria-hidden="true" />
                Nofy
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {N.view.tagline}
              </p>
            </div>
            {overviewQuery.data ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent"
                data-testid="nofy-note-count"
              >
                <span className="font-mono font-semibold tabular-nums">{overviewQuery.data.totals.notes}</span>
                {N.shared.noteMany}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {overviewQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-0.5">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 sm:w-fit">
              {TABS.map(({ id, icon: Icon }) => {
                const label = N.view.tabs[id];
                return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="gap-1.5 rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-accent/15 data-[state=active]:text-accent"
                  data-testid={`nofy-tab-${id}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewPanel
              overview={overviewQuery.data}
              isLoading={overviewQuery.isLoading}
              onOpenNote={openNote}
              onCreateNote={() => handleCreateNote()}
              onGoTab={(tab) => setTab(tab)}
            />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <NotesBrowser
              params={notesParams}
              onParamsChange={setNotesParams}
              onOpenNote={openNote}
              onCreateNote={() => handleCreateNote(notesParams.folderId === "" ? null : notesParams.folderId)}
              emptyState={{
                title: N.overview.emptyTitle,
                body: N.overview.emptyBody,
              }}
              testid="nofy-notes-panel"
            />
          </TabsContent>

          <TabsContent value="folders" className="mt-4">
            <FoldersPanel
              onOpenFolder={(folderId) =>
                setParams({ tab: "notes", view: folderId === null ? null : "folder", folder: folderId })
              }
              onCreateNoteIn={(folderId) => handleCreateNote(folderId)}
            />
          </TabsContent>

          <TabsContent value="favorites" className="mt-4">
            <NotesBrowser
              params={favoritesParams}
              onParamsChange={setNotesParams}
              onOpenNote={openNote}
              onCreateNote={() => handleCreateNote()}
              emptyState={{
                icon: Star,
                title: N.view.favoritesEmptyTitle,
                body: N.overview.favoritesEmpty,
              }}
              testid="nofy-favorites-panel"
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <TemplatesPanel
              templates={templatesQuery.data?.templates}
              isLoading={templatesQuery.isLoading}
              onUseTemplate={handleUseTemplate}
            />
          </TabsContent>

          <TabsContent value="trash" className="mt-4">
            <TrashPanel notes={trashQuery.data?.notes} isLoading={trashQuery.isLoading} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
