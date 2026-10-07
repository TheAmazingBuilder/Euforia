"use client";

import * as React from "react";
import { Check, ChevronDown, FolderOpen, FolderPlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { OcrCollection, OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useAddToOcrCollection,
  useCreateOcrCollection,
  useDeleteOcrCollection,
  useOcrCollections,
  useOcrRecognition,
  useRemoveFromOcrCollection,
} from "@/lib/api/queries";
import {
  formatRelative,
  platformLabel,
  profileStampLabel,
  recognitionConfidence,
} from "@/components/recognition/recognition-model";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * Recognition collections — V2 §28.
 *
 * A collection is a NAMED, ORDERED group of recognitions (up to 200) that
 * stays purely referential: adding or removing never mutates the
 * recognition itself, and deleting a collection never touches the history
 * (the backend keeps every recognition row — the collection is just
 * membership). This module owns the whole surface the audit gap listed:
 * the per-row "Add to collection" menu and the history-side panel that
 * lists, expands, creates and deletes collections.
 *
 * Server state lives in the five useOcrCollection* React Query hooks;
 * this file adds only local UI state (dialogs, expansion) and the
 * membership toggles. No hex outside tokens, Le Registre discipline.
 */

type CollectionsController = {
  dict: RecognitionDict;
  collections: OcrCollection[];
  /** Loaded history recognitions — the first-resort member resolver. */
  known: Map<string, OcrRecognition>;
  loading: boolean;
  /** Open the create dialog; optionally pre-target a recognition to add. */
  openCreate: (recognitionId?: string) => void;
  /** Toggle membership (add when absent, remove when present). */
  toggleMembership: (collection: OcrCollection, recognitionId: string) => void;
  removeMember: (collectionId: string, recognitionId: string) => void;
  deleteCollection: (collection: OcrCollection) => void;
  isBusy: (collectionId: string) => boolean;
};

const CollectionsContext = React.createContext<CollectionsController | null>(null);

function useCollections(): CollectionsController {
  const controller = React.useContext(CollectionsContext);
  if (!controller) {
    throw new Error("useCollections must be used inside <CollectionsProvider>");
  }
  return controller;
}

export function CollectionsProvider({
  dict,
  items,
  onOpen,
  children,
}: {
  dict: RecognitionDict;
  items: readonly OcrRecognition[];
  /** Deep-open a recognition (?job=<id>). */
  onOpen: (id: string) => void;
  children: React.ReactNode;
}) {
  const list = useOcrCollections();
  const create = useCreateOcrCollection();
  const addTo = useAddToOcrCollection();
  const removeFrom = useRemoveFromOcrCollection();
  const deleteCollectionMutation = useDeleteOcrCollection();

  const [createState, setCreateState] = React.useState<{ open: boolean; recognitionId: string | null; name: string }>({
    open: false,
    recognitionId: null,
    name: "",
  });
  const [pendingDelete, setPendingDelete] = React.useState<OcrCollection | null>(null);
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());

  const collections = list.data?.collections ?? [];
  const known = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const markBusy = (collectionId: string, busy: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(collectionId);
      else next.delete(collectionId);
      return next;
    });

  const controller: CollectionsController = {
    dict,
    collections,
    known,
    loading: list.isLoading,
    openCreate: (recognitionId) => setCreateState({ open: true, recognitionId: recognitionId ?? null, name: "" }),
    toggleMembership: (collection, recognitionId) => {
      const member = collection.items.some((item) => item.recognitionId === recognitionId);
      markBusy(collection.id, true);
      if (member) {
        removeFrom.mutate(
          { collectionId: collection.id, recognitionId },
          {
            onSettled: () => markBusy(collection.id, false),
            onSuccess: () => toast.success(dict.collections.removed),
            onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
          },
        );
      } else {
        addTo.mutate(
          { collectionId: collection.id, recognitionId },
          {
            onSettled: () => markBusy(collection.id, false),
            onSuccess: () => toast.success(dict.collections.added),
            onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
          },
        );
      }
    },
    removeMember: (collectionId, recognitionId) => {
      markBusy(collectionId, true);
      removeFrom.mutate(
        { collectionId, recognitionId },
        {
          onSettled: () => markBusy(collectionId, false),
          onSuccess: () => toast.success(dict.collections.removed),
          onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
        },
      );
    },
    deleteCollection: (collection) => setPendingDelete(collection),
    isBusy: (collectionId) => busyIds.has(collectionId) || addTo.isPending || removeFrom.isPending,
  };

  function handleCreate() {
    const name = createState.name.trim();
    if (!name) return;
    create.mutate(name, {
      onSuccess: (data) => {
        toast.success(dict.collections.created);
        const recognitionId = createState.recognitionId;
        setCreateState({ open: false, recognitionId: null, name: "" });
        if (recognitionId) {
          addTo.mutate(
            { collectionId: data.collection.id, recognitionId },
            {
              onSuccess: () => toast.success(dict.collections.added),
              onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
            },
          );
        }
      },
      onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
    });
  }

  return (
    <CollectionsContext.Provider value={controller}>
      {children}

      {/* Create — reached from the panel header and from the row menus
          ("New collection…" with the recognition pre-targeted). */}
      <Dialog
        open={createState.open}
        onOpenChange={(open) =>
          setCreateState((current) => (open ? current : { open: false, recognitionId: null, name: "" }))
        }
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{dict.collections.newCollection}</DialogTitle>
            <DialogDescription>
              {createState.recognitionId
                ? dict.collections.createAndAdd
                : dict.collections.inCollections}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreate();
            }}
          >
            <Input
              autoFocus
              value={createState.name}
              onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
              placeholder={dict.collections.namePlaceholder}
              maxLength={64}
              data-testid="recognition-collection-name-input"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateState({ open: false, recognitionId: null, name: "" })}
              >
                {dict.result.states.cancel}
              </Button>
              <Button type="submit" disabled={!createState.name.trim() || create.isPending} data-testid="recognition-collection-create">
                {create.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {createState.recognitionId ? dict.collections.createAndAdd : dict.collections.create}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete — focused confirmation, mirrors the history delete dialog. */}
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{dict.collections.deleteTitle}</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.name} · ${pendingDelete.items.length} ${dict.collections.items} · ${dict.collections.deleteBody}`
                : dict.collections.deleteBody}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPendingDelete(null)}>
              {dict.result.states.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingDelete) {
                  deleteCollectionMutation.mutate(pendingDelete.id, {
                    onSuccess: () => {
                      toast.success(dict.collections.deleted);
                      setPendingDelete(null);
                    },
                    onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
                  });
                }
              }}
              data-testid="recognition-collection-delete-confirm"
            >
              {dict.collections.deleteTitle}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The panel itself — rendered once by RecognitionHistory below the
          ledger table (it is a sibling of the rows, not a child). */}
      <CollectionsPanel onOpen={onOpen} />
    </CollectionsContext.Provider>
  );
}

/**
 * AddToCollectionButton — the per-row affordance. Lists every collection
 * with a membership check (clicking toggles), then "New collection…"
 * which opens the create dialog with this recognition pre-targeted.
 */
export function AddToCollectionButton({ recognitionId }: { recognitionId: string }) {
  const { dict, collections, toggleMembership, openCreate, isBusy } = useCollections();
  const busy = isBusy(recognitionId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-8"
          disabled={busy}
          aria-label={dict.collections.addTo}
          data-testid={`recognition-collection-add-${recognitionId}`}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FolderPlus className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" data-testid="recognition-collection-menu">
        <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          {dict.collections.addTo}
        </DropdownMenuLabel>
        {collections.length === 0 ? (
          <DropdownMenuSeparator />
        ) : (
          collections.map((collection) => {
            const member = collection.items.some((item) => item.recognitionId === recognitionId);
            return (
              <DropdownMenuItem
                key={collection.id}
                onClick={() => toggleMembership(collection, recognitionId)}
                data-testid={`recognition-collection-option-${collection.name}`}
              >
                <Check className={cn("size-3.5", member ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {collection.items.length}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openCreate(recognitionId)} data-testid="recognition-collection-menu-new">
          <Plus className="size-3.5" aria-hidden="true" />
          {dict.collections.newCollection}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * CollectionsPanel — the history-side surface: every collection as a ruled
 * row (name, member count, created), expandable to its member
 * recognitions with open / remove actions, plus create and delete.
 */
function CollectionsPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const { dict, collections, loading, openCreate, deleteCollection } = useCollections();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-4" data-testid="recognition-collections">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-heading text-sm font-semibold">
          <FolderOpen className="size-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
          {dict.collections.inCollections}
          {collections.length > 0 ? (
            <span className="stamp stamp-accent !text-[10px] font-mono tabular-nums">
              {collections.length}
            </span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-8 font-mono text-xs"
          onClick={() => openCreate()}
          data-testid="recognition-collection-new"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {dict.collections.newCollection}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </div>
      ) : collections.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{dict.collections.empty}</p>
      ) : (
        <div className="flex flex-col">
          {collections.map((collection) => {
            const expanded = expandedId === collection.id;
            return (
              <div key={collection.id} className="border-b border-border/60 last:border-b-0" data-testid="recognition-collection-row">
                <div className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setExpandedId(expanded ? null : collection.id)}
                    aria-expanded={expanded}
                    data-testid={`recognition-collection-expand-${collection.name}`}
                  >
                    <ChevronDown
                      className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm">{collection.name}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {collection.items.length} {dict.collections.items}
                    </span>
                  </button>
                  <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
                    {formatRelative(collection.createdAt)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-8"
                    onClick={() => deleteCollection(collection)}
                    aria-label={dict.collections.deleteTitle}
                    data-testid={`recognition-collection-delete-${collection.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                {expanded ? (
                  <div className="flex flex-col pb-2" data-testid={`recognition-collection-members-${collection.name}`}>
                    <p className="ledger-label border-b border-border/40 pb-1">{dict.collections.membersTitle}</p>
                    {collection.items.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">{dict.collections.empty}</p>
                    ) : (
                      collection.items.map((item) => (
                        <CollectionMemberRow
                          key={item.recognitionId}
                          collectionId={collection.id}
                          recognitionId={item.recognitionId}
                          onOpen={onOpen}
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * CollectionMemberRow — resolves the member recognition from the loaded
 * history pages first; only members outside the loaded pages trigger a
 * single GET (the same cached hook the focused job uses).
 */
function CollectionMemberRow({
  collectionId,
  recognitionId,
  onOpen,
}: {
  collectionId: string;
  recognitionId: string;
  onOpen: (id: string) => void;
}) {
  const { dict, known, isBusy } = useCollections();
  const knownRecognition = known.get(recognitionId) ?? null;
  // Hook is skipped (enabled: false) whenever the resolver already knows
  // the recognition — no fetch fan-out for the common case.
  const fetched = useOcrRecognition(knownRecognition ? null : recognitionId);
  const recognition: OcrRecognition | null = knownRecognition ?? fetched.data?.recognition ?? null;

  if (!recognition) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {fetched.isLoading ? "…" : recognitionId}
        </span>
        <RemoveMemberButton collectionId={collectionId} recognitionId={recognitionId} busy={isBusy(collectionId)} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5" data-testid="recognition-collection-member">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "stamp !text-[9px]",
            recognition.extractionProfile === "TRADE_SUMMARY" ? "stamp-ink" : "stamp-accent",
          )}
        >
          {profileStampLabel(recognition.extractionProfile, dict)}
        </span>
        <span className="truncate text-xs">{platformLabel(dict, recognition.classification)}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {recognition.status === "FAILED" ? "—" : `${recognitionConfidence(recognition.fields) ?? 0}%`}
        </span>
        <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
          {formatRelative(recognition.createdAt)}
        </span>
        <RecognitionStatusBadge status={recognition.status} dict={dict} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-7 font-mono text-[11px]"
          onClick={() => onOpen(recognition.id)}
          data-testid={`recognition-collection-open-${recognition.id}`}
        >
          {dict.history.open}
        </Button>
        <RemoveMemberButton collectionId={collectionId} recognitionId={recognitionId} busy={isBusy(collectionId)} />
      </div>
    </div>
  );
}

function RemoveMemberButton({
  collectionId,
  recognitionId,
  busy,
}: {
  collectionId: string;
  recognitionId: string;
  busy: boolean;
}) {
  const { dict, removeMember } = useCollections();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-7"
      disabled={busy}
      onClick={() => removeMember(collectionId, recognitionId)}
      aria-label={dict.collections.remove}
      title={dict.collections.remove}
      data-testid={`recognition-collection-remove-${recognitionId}`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
    </Button>
  );
}
