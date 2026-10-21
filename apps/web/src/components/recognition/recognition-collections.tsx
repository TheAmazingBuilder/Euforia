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
 * membership).
 *
 * Three standalone surfaces, all reading the same React Query cache (the
 * five useOcrCollection* hooks) — no context needed:
 *   - AddToCollectionMenu   per-row membership manager (history rows AND
 *                           the result view)
 *   - CollectionsPanel      the history-side panel (list / expand / create
 *                           / delete)
 *   - RecognitionCollectionsRow  read-only chips in the result view
 *
 * No hex outside tokens, Le Registre discipline.
 */

function useCollectionMemberships(recognitionId: string): OcrCollection[] {
  const list = useOcrCollections();
  return React.useMemo(
    () => (list.data?.collections ?? []).filter((collection) =>
      collection.items.some((item) => item.recognitionId === recognitionId),
    ),
    [list.data, recognitionId],
  );
}

/**
 * AddToCollectionMenu — the membership affordance for ONE recognition.
 * Lists every collection with a membership check (clicking toggles), then
 * "New collection…" which opens the create dialog with this recognition
 * pre-targeted (create & add in one pass).
 */
export function AddToCollectionMenu({
  dict,
  recognitionId,
}: {
  dict: RecognitionDict;
  recognitionId: string;
}) {
  const list = useOcrCollections();
  const addTo = useAddToOcrCollection();
  const removeFrom = useRemoveFromOcrCollection();
  const create = useCreateOcrCollection();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const collections = React.useMemo(() => list.data?.collections ?? [], [list.data]);
  const busy = addTo.isPending || removeFrom.isPending;
  const memberIds = React.useMemo(
    () =>
      new Set(
        collections
          .filter((collection) =>
            collection.items.some((item) => item.recognitionId === recognitionId),
          )
          .map((collection) => collection.id),
      ),
    [collections, recognitionId],
  );

  function toggle(collection: OcrCollection) {
    const member = memberIds.has(collection.id);
    if (member) {
      removeFrom.mutate(
        { collectionId: collection.id, recognitionId },
        { onSuccess: () => toast.success(dict.collections.removed),
          onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }) },
      );
    } else {
      addTo.mutate(
        { collectionId: collection.id, recognitionId },
        { onSuccess: () => toast.success(dict.collections.added),
          onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }) },
      );
    }
  }

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: (data) => {
        toast.success(dict.collections.created);
        setCreateOpen(false);
        setName("");
        addTo.mutate(
          { collectionId: data.collection.id, recognitionId },
          { onSuccess: () => toast.success(dict.collections.added),
            onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }) },
        );
      },
      onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-8"
            disabled={busy}
            aria-label={dict.collections.addTo}
            title={dict.collections.addTo}
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
              const member = memberIds.has(collection.id);
              return (
                <DropdownMenuItem
                  key={collection.id}
                  onClick={() => toggle(collection)}
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
          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            data-testid="recognition-collection-menu-new"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {dict.collections.newCollection}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create & add — reached from the menu's "New collection…" entry. */}
      <Dialog open={createOpen} onOpenChange={(open) => (open ? setCreateOpen(true) : (setCreateOpen(false), setName("")))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{dict.collections.newCollection}</DialogTitle>
            <DialogDescription>{dict.collections.createAndAdd}</DialogDescription>
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
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={dict.collections.namePlaceholder}
              maxLength={64}
              data-testid="recognition-collection-name-input"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                {dict.result.states.cancel}
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending} data-testid="recognition-collection-create">
                {create.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {dict.collections.createAndAdd}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * RecognitionCollectionsRow — the result-view display: which collections
 * already hold this screenshot. Renders nothing when the recognition
 * belongs to none (no noise on fresh recognitions); the menu at the end
 * lets the reviewer manage membership without leaving the review.
 */
export function RecognitionCollectionsRow({
  dict,
  recognitionId,
}: {
  dict: RecognitionDict;
  recognitionId: string;
}) {
  const memberships = useCollectionMemberships(recognitionId);
  if (memberships.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="recognition-result-collections"
    >
      <span className="ledger-label">{dict.collections.inCollections}</span>
      {memberships.map((collection) => (
        <span
          key={collection.id}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs"
          data-testid="recognition-result-collection-chip"
        >
          <FolderOpen className="size-3 text-accent" strokeWidth={1.5} aria-hidden="true" />
          {collection.name}
        </span>
      ))}
      <AddToCollectionMenu dict={dict} recognitionId={recognitionId} />
    </div>
  );
}

/**
 * CollectionsPanel — the history-side surface: every collection as a ruled
 * row (name, member count, created), expandable to its member
 * recognitions with open / remove actions, plus create and delete.
 * Standalone: consumes the collection hooks directly (same cache as the
 * row menus).
 */
export function CollectionsPanel({
  dict,
  items,
  onOpen,
}: {
  dict: RecognitionDict;
  /** Loaded history recognitions — the first-resort member resolver. */
  items: readonly OcrRecognition[];
  /** Deep-open a recognition (?job=<id>). */
  onOpen: (id: string) => void;
}) {
  const list = useOcrCollections();
  const create = useCreateOcrCollection();
  const removeFrom = useRemoveFromOcrCollection();
  const deleteCollectionMutation = useDeleteOcrCollection();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<OcrCollection | null>(null);

  const collections = list.data?.collections ?? [];
  const known = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: () => {
        toast.success(dict.collections.created);
        setCreateOpen(false);
        setName("");
      },
      onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-4" data-testid="recognition-collections">
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
          onClick={() => setCreateOpen(true)}
          data-testid="recognition-collection-new"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {dict.collections.newCollection}
        </Button>
      </div>

      {list.isLoading ? (
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
                    onClick={() => setPendingDelete(collection)}
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
                          dict={dict}
                          known={known}
                          collectionId={collection.id}
                          recognitionId={item.recognitionId}
                          busy={removeFrom.isPending}
                          onRemove={removeFrom.mutate}
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

      {/* Create — panel header (no pre-targeted recognition). */}
      <Dialog open={createOpen} onOpenChange={(open) => (open ? setCreateOpen(true) : (setCreateOpen(false), setName("")))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{dict.collections.newCollection}</DialogTitle>
            <DialogDescription>{dict.collections.inCollections}</DialogDescription>
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
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={dict.collections.namePlaceholder}
              maxLength={64}
              data-testid="recognition-collection-name-input"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                {dict.result.states.cancel}
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending} data-testid="recognition-collection-create">
                {create.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {dict.collections.create}
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
    </div>
  );
}

/**
 * CollectionMemberRow — resolves the member recognition from the loaded
 * history pages first; only members outside the loaded pages trigger a
 * single GET (the same cached hook the focused job uses).
 */
function CollectionMemberRow({
  dict,
  known,
  collectionId,
  recognitionId,
  busy,
  onRemove,
  onOpen,
}: {
  dict: RecognitionDict;
  known: Map<string, OcrRecognition>;
  collectionId: string;
  recognitionId: string;
  busy: boolean;
  onRemove: (input: { collectionId: string; recognitionId: string }, options?: { onSuccess?: () => void }) => void;
  onOpen: (id: string) => void;
}) {
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-7"
          disabled={busy}
          onClick={() => onRemove({ collectionId, recognitionId })}
          aria-label={dict.collections.remove}
          title={dict.collections.remove}
          data-testid={`recognition-collection-remove-${recognitionId}`}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
        </Button>
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-7"
          disabled={busy}
          onClick={() => onRemove({ collectionId, recognitionId })}
          aria-label={dict.collections.remove}
          title={dict.collections.remove}
          data-testid={`recognition-collection-remove-${recognitionId}`}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
