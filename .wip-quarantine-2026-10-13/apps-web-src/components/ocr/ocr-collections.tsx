"use client";

import * as React from "react";

import { toast } from "sonner";
import { ArrowLeft, FolderOpen, Images, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useAddCollectionAsset,
  useCreateRecognitionCollection,
  useDeleteRecognitionCollection,
  useRecognitionCollection,
  useRecognitionJobs,
  useRemoveCollectionAsset,
} from "@/lib/api/queries";
import type { RecognitionHistoryItem } from "@/lib/recognition/contract";
import { formatBytes, formatRelative } from "./ocr-format";
import { nowMs, useNow } from "./ocr-now";

/**
 * V3 — screenshot collections (spec §41): a lightweight, OCR-owned
 * organization of the user's uploads. A collection only REFERENCES assets —
 * removing an asset from a collection never deletes the screenshot or its
 * recognitions.
 */

// ── New-collection dialog ────────────────────────────────────────────────────

export function NewCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (collectionId: string) => void;
}) {
  const createMutation = useCreateRecognitionCollection();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setDescription("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md" data-testid="ocr-collection-dialog">
        <DialogHeader>
          <DialogTitle>New screenshot collection</DialogTitle>
          <DialogDescription>
            Group related uploads — a platform&apos;s history statements, one trading session — so
            they are easy to revisit. Collections organize; they never duplicate storage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. May MT5 statements"
              maxLength={64}
              data-testid="ocr-collection-name"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Description (optional)</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs in this collection?"
              maxLength={280}
              data-testid="ocr-collection-description"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={name.trim().length < 1 || createMutation.isPending}
            data-testid="ocr-collection-create"
            onClick={async () => {
              try {
                const { collection } = await createMutation.mutateAsync({
                  name: name.trim(),
                  description: description.trim() === "" ? null : description.trim(),
                });
                toast.success("Collection created", {
                  description: `${collection.name} is ready — add screenshots from your history.`,
                });
                setName("");
                setDescription("");
                onOpenChange(false);
                onCreated(collection.id);
              } catch (error) {
                toast.error(apiErrorMessage(error, "The collection could not be created."));
              }
            }}
          >
            {createMutation.isPending ? "Creating…" : "Create Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add-assets dialog (picker over the history's uploads) ───────────────────

export function AddAssetsDialog({
  open,
  onOpenChange,
  collectionId,
  jobs,
  existingAssetIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  /** History entries carrying a screenshotId — the pickable uploads. */
  jobs: RecognitionHistoryItem[];
  existingAssetIds: string[];
}) {
  const addMutation = useAddCollectionAsset();
  const [selected, setSelected] = React.useState<string[]>([]);
  const alreadyIn = new Set(existingAssetIds);
  const pickable = jobs.filter((job) => job.screenshotId !== undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg" data-testid="ocr-collection-add-dialog">
        <DialogHeader>
          <DialogTitle>Add screenshots to this collection</DialogTitle>
          <DialogDescription>
            Pick uploads from your recognition history. Adding a screenshot never re-runs a
            recognition — it only references the stored file.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {pickable.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No uploads available yet.
            </p>
          ) : (
            pickable.map((job) => {
              const inCollection = alreadyIn.has(job.screenshotId as string);
              return (
                <label
                  key={`${job.id}-${job.screenshotId}`}
                  className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${inCollection ? "opacity-50" : "cursor-pointer transition-colors hover:bg-muted/40"}`}
                >
                  <Checkbox
                    checked={inCollection || selected.includes(job.screenshotId as string)}
                    disabled={inCollection}
                    onCheckedChange={() =>
                      setSelected((current) => {
                        const assetId = job.screenshotId as string;
                        return current.includes(assetId)
                          ? current.filter((id) => id !== assetId)
                          : [...current, assetId];
                      })
                    }
                    aria-label={`Select ${job.screenshotName}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">{job.screenshotName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatBytes(job.sizeBytes)}
                  </span>
                  {inCollection ? (
                    <Badge variant="outline" className="px-1 py-0 font-mono text-[9px]">
                      added
                    </Badge>
                  ) : null}
                </label>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0 || addMutation.isPending}
            data-testid="ocr-collection-add-confirm"
            onClick={async () => {
              try {
                for (const assetId of selected) {
                  await addMutation.mutateAsync({ collectionId, assetId });
                }
                toast.success(
                  selected.length === 1 ? "Screenshot added" : `${selected.length} screenshots added`,
                );
                setSelected([]);
                onOpenChange(false);
              } catch (error) {
                toast.error(apiErrorMessage(error, "The screenshots could not be added."));
              }
            }}
          >
            {addMutation.isPending ? "Adding…" : `Add ${selected.length > 0 ? `(${selected.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Collection detail (?collection=<id>) ─────────────────────────────────────

export function CollectionDetail({
  collectionId,
  onBack,
}: {
  collectionId: string;
  onBack: () => void;
}) {
  const collectionQuery = useRecognitionCollection(collectionId, collectionId.length > 0);
  const collection = collectionQuery.data?.collection;
  // The add-assets picker lists the uploads from the recognition history.
  const jobsQuery = useRecognitionJobs();
  const jobs = jobsQuery.data?.jobs ?? [];
  const removeMutation = useRemoveCollectionAsset();
  const deleteMutation = useDeleteRecognitionCollection();
  const now = useNow();
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (collectionQuery.isLoading || (collection === undefined && !collectionQuery.isError)) {
    return (
      <div className="space-y-4" aria-hidden data-testid="ocr-collection-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (collectionQuery.isError || collection === undefined) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center" data-testid="ocr-collection-missing">
        <h2 className="text-base font-semibold">Collection not found</h2>
        <p className="text-sm text-muted-foreground">
          This collection doesn&apos;t exist or was created in a previous browser session.
        </p>
        <Button variant="outline" onClick={onBack}>
          Back to Overview
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="ocr-collection-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">{collection.name}</h1>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {collection.assetsCount} {collection.assetsCount === 1 ? "screenshot" : "screenshots"}
            {collection.description !== null ? ` · ${collection.description}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} data-testid="ocr-collection-add">
            <Plus className="size-3.5" aria-hidden />
            Add Screenshots
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-loss hover:text-loss"
            onClick={() => setDeleteOpen(true)}
            data-testid="ocr-collection-delete"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden />
            History
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="px-5 py-4">
          {collection.assets.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              This collection is empty — add screenshots from your recognition history.
            </p>
          ) : (
            <ul className="space-y-1.5" data-testid="ocr-collection-assets">
              {collection.assets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <Images className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs">{asset.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatBytes(asset.sizeBytes)}
                  </span>
                  <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                    {formatRelative(asset.uploadedAt, nowMs(now))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-loss hover:text-loss"
                    disabled={removeMutation.isPending}
                    onClick={async () => {
                      try {
                        await removeMutation.mutateAsync({ collectionId, assetId: asset.id });
                        toast.success("Removed from collection");
                      } catch (error) {
                        toast.error(apiErrorMessage(error, "The screenshot could not be removed."));
                      }
                    }}
                    aria-label={`Remove ${asset.name} from collection`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <FolderOpen className="size-3" aria-hidden />
            Collections reference your uploads — removing an entry never deletes the screenshot or
            its recognitions.
          </p>
        </CardContent>
      </Card>

      <AddAssetsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        collectionId={collection.id}
        jobs={jobs}
        existingAssetIds={collection.assets.map((asset) => asset.id)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this collection?</DialogTitle>
            <DialogDescription>
              {collection.name} and its list are removed. The screenshots themselves and every
              recognition stay untouched in your history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(collection.id);
                  toast.success("Collection deleted");
                  setDeleteOpen(false);
                  onBack();
                } catch (error) {
                  toast.error(apiErrorMessage(error, "The collection could not be deleted."));
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
