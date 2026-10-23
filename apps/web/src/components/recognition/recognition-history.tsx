"use client";

import * as React from "react";
import { CameraOff, Check, FolderOpen, Maximize2, PenLine, RotateCcw, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrRecognition, OcrRecognitionStatus } from "@cosmoz/shared";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AddToCollectionMenu,
  CollectionsPanel,
} from "@/components/recognition/recognition-collections";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import { profileMetaKey, profileStampLabel } from "@/components/recognition/recognition-model";
import {
  formatRelative,
  platformLabel,
  recognitionConfidence,
} from "@/components/recognition/recognition-model";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

import { useOcrCollections } from "@/lib/api/queries";

/**
 * RecognitionHistory — every imported screenshot with its outcome
 * (PROMPT 3 §30/§31/§33).
 *
 * Desktop: a ruled ledger table. Mobile: the same rows collapse to stacked
 * ruled cards (§35 — intentional adaptation, not a shrunken table).
 * Status filters map to the empty-state messages (§33). Deleting asks for
 * confirmation in a focused dialog (§61) and goes through the service
 * layer, never a page reload (§56).
 *
 * V2 §28 — collections: a per-row membership menu, a "by collection"
 * filter over the loaded pages, and the CollectionsPanel below the table
 * (all three read the same React Query cache).
 */

const FILTERS: Array<{ key: "all" | OcrRecognitionStatus; labelKey: keyof RecognitionDict["history"]["filters"] }> = [
  { key: "all", labelKey: "all" },
  { key: "REVIEW_REQUIRED", labelKey: "review" },
  { key: "CONFIRMED", labelKey: "confirmed" },
  { key: "FAILED", labelKey: "failed" },
];

export function RecognitionHistory({
  dict,
  items,
  loading,
  onOpen,
  onDelete,
  onReprocess,
  hasMore = false,
  onLoadMore,
}: {
  dict: RecognitionDict;
  items: readonly OcrRecognition[];
  loading: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** V2 §32/§39 — re-run the pipeline on a stored row. */
  onReprocess?: (id: string) => void;
  /** V2 §62 — keyset "Load more". */
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [pendingDelete, setPendingDelete] = React.useState<OcrRecognition | null>(null);
  // V2 §62 — derived-state filters (corrected / flagged) apply client-side
  // over the loaded pages; they are read-time derivations, not columns.
  const [derivedFilter, setDerivedFilter] = React.useState<"none" | "corrected" | "flagged">("none");
  // V2 §28 — membership filter over the loaded pages (read-time too).
  const collectionList = useOcrCollections();
  const collections = collectionList.data?.collections ?? [];
  const [collectionFilterId, setCollectionFilterId] = React.useState<string | null>(null);
  const activeCollection = collections.find((collection) => collection.id === collectionFilterId) ?? null;

  const filtered = React.useMemo(
    () =>
      items.filter((item) => {
        if (filter !== "all" && item.status !== filter) return false;
        if (derivedFilter === "corrected") return item.corrections !== null && Object.keys(item.corrections).length > 0;
        if (derivedFilter === "flagged") return item.duplicateOf !== null || item.possibleTradeDuplicate !== null;
        if (activeCollection && !activeCollection.items.some((item2) => item2.recognitionId === item.id)) return false;
        return true;
      }),
    [items, filter, derivedFilter, activeCollection],
  );

  const emptyMessage = (() => {
    switch (filter) {
      case "REVIEW_REQUIRED":
        return dict.history.empty.review;
      case "CONFIRMED":
        return dict.history.empty.confirmed;
      case "FAILED":
        return dict.history.empty.failed;
      default:
        return dict.history.empty.all;
    }
  })();

  return (
    <div className="flex flex-col gap-4" data-testid="recognition-history">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={dict.history.title}>
        {FILTERS.map((entry) => (
          <Button
            key={entry.key}
            type="button"
            variant={filter === entry.key ? "secondary" : "ghost"}
            size="sm"
            className="min-h-8 font-mono text-xs"
            onClick={() => setFilter(entry.key)}
            data-testid={`recognition-filter-${entry.key.toLowerCase()}`}
            aria-pressed={filter === entry.key}
          >
            {dict.history.filters[entry.labelKey]}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {(
          [
            ["none", dict.history.filters.all],
            ["corrected", dict.history2.corrected],
            ["flagged", dict.history2.duplicates],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={derivedFilter === key ? "secondary" : "ghost"}
            size="sm"
            className="min-h-8 font-mono text-xs"
            onClick={() => setDerivedFilter(key)}
            data-testid={`recognition-derived-filter-${key}`}
            aria-pressed={derivedFilter === key}
          >
            {label}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {/* V2 §28 - "by collection" filter (members of the selected
            collection, over the loaded pages). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={activeCollection ? "secondary" : "ghost"}
              size="sm"
              className="min-h-8 font-mono text-xs"
              data-testid="recognition-collection-filter"
              aria-pressed={Boolean(activeCollection)}
            >
              <FolderOpen className="size-3.5" aria-hidden="true" />
              {activeCollection ? activeCollection.name : dict.collections.allCollections}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56" data-testid="recognition-collection-filter-menu">
            <DropdownMenuItem
              onClick={() => setCollectionFilterId(null)}
              disabled={!activeCollection}
              data-testid="recognition-collection-filter-all"
            >
              <Check className={cn("size-3.5", !activeCollection ? "opacity-100" : "opacity-0")} aria-hidden="true" />
              {dict.collections.allCollections}
            </DropdownMenuItem>
            {collections.map((collection) => {
              const selected = activeCollection?.id === collection.id;
              return (
                <DropdownMenuItem
                  key={collection.id}
                  onClick={() => setCollectionFilterId(collection.id)}
                  data-testid={`recognition-collection-filter-option-${collection.name}`}
                >
                  <Check className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {collection.items.length}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop ledger table. */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface">
              {[
                dict.history.columns.screenshot,
                dict.history.columns.platform,
                dict.history.columns.mode,
                dict.history.columns.status,
                dict.history.columns.confidence,
                dict.history.columns.created,
                "",
              ].map((column, index) => (
                <th
                  key={column || index}
                  className="px-3 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <HistoryRowSkeleton cols={7} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-raised/50"
                  data-testid="recognition-history-row"
                  data-status={item.status}
                >
                  <td className="px-3 py-2">
                    <HistoryThumbnail recognition={item} dict={dict} />
                  </td>
                  <td className="px-3 py-2 text-sm">{platformLabel(dict, item.classification)}</td>
                  <td className="px-3 py-2">
                    <ModeStamp profile={item.extractionProfile} dict={dict} />
                  </td>
                  <td className="px-3 py-2">
                    <RecognitionStatusBadge status={item.status} dict={dict} />
                    {item.corrections !== null && Object.keys(item.corrections).length > 0 ? (
                      <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-warning" title={dict.history2.corrected}>
                        <PenLine className="size-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm tabular-nums">
                    {item.status === "FAILED" ? "-" : `${recognitionConfidence(item.fields) ?? 0}%`}
                  </td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{formatRelative(item.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-8"
                        onClick={() => onOpen(item.id)}
                        data-testid={`recognition-open-${item.id}`}
                      >
                        <Maximize2 className="size-3.5" aria-hidden="true" />
                        {dict.history.open}
                      </Button>
                      {onReprocess ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-8"
                          onClick={() => onReprocess(item.id)}
                          aria-label={dict.reprocess.action}
                          data-testid={`recognition-reprocess-${item.id}`}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                        </Button>
                      ) : null}
                      <AddToCollectionMenu dict={dict} recognitionId={item.id} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-8"
                        onClick={() => setPendingDelete(item)}
                        aria-label={dict.history.delete}
                        data-testid={`recognition-delete-${item.id}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {hasMore && onLoadMore && !loading ? (
          <div className="border-t border-border/60 p-3 text-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-8 font-mono text-xs"
              onClick={onLoadMore}
              data-testid="recognition-load-more"
            >
              {dict.history2.loadMore}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Mobile — stacked ruled rows (§35). */}
      <div className="flex flex-col md:hidden">
        {loading ? (
          <HistoryRowSkeleton cols={1} mobile />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="border-b border-border/60 py-3 last:border-b-0" data-testid="recognition-history-card" data-status={item.status}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <HistoryThumbnail recognition={item} dict={dict} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{platformLabel(dict, item.classification)}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {modeStampLabel(item.extractionProfile, dict)}
                      {" · "}
                      {item.status === "FAILED" ? "-" : `${recognitionConfidence(item.fields) ?? 0}%`}
                      {" · "}
                      {formatRelative(item.createdAt)}
                    </span>
                  </div>
                </div>
                <RecognitionStatusBadge status={item.status} dict={dict} />
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="min-h-8" onClick={() => onOpen(item.id)}>
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                  {dict.history.open}
                </Button>
                {onReprocess ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-8"
                    onClick={() => onReprocess(item.id)}
                    aria-label={dict.reprocess.action}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                <AddToCollectionMenu dict={dict} recognitionId={item.id} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-8"
                  onClick={() => setPendingDelete(item)}
                  aria-label={dict.history.delete}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))
        )}
        {hasMore && onLoadMore && !loading ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-8 self-center font-mono text-xs"
            onClick={onLoadMore}
            data-testid="recognition-load-more"
          >
            {dict.history2.loadMore}
          </Button>
        ) : null}
      </div>

      {/* Delete confirmation — focused dialog, keyboard-friendly (§61). */}
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{dict.history.delete}</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${platformLabel(dict, pendingDelete.classification)} · ${formatRelative(pendingDelete.createdAt)}`
                : ""}
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
                  onDelete(pendingDelete.id);
                  setPendingDelete(null);
                }
              }}
              data-testid="recognition-delete-confirm"
            >
              {dict.history.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* V2 §28 - the collections surface (panel + its dialogs), sibling of
          the ledger: list, expand, create, delete, per-member open/remove. */}
      <CollectionsPanel dict={dict} items={items} onOpen={onOpen} />
    </div>
  );
}

/** Lazy authenticated thumbnail — placeholder while loading / on failure. */
function HistoryThumbnail({ recognition, dict }: { recognition: OcrRecognition; dict: RecognitionDict }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    import("@/lib/api/queries").then(({ fetchOcrRecognitionImage }) =>
      fetchOcrRecognitionImage(recognition.id)
        .then((result) => {
          if (revoked) {
            URL.revokeObjectURL(result.url);
            return;
          }
          objectUrl = result.url;
          setUrl(result.url);
        })
        .catch(() => {
          if (!revoked) setFailed(true);
        }),
    );
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recognition.id]);

  if (failed || !url) {
    return (
      <span
        className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground/50"
        aria-hidden="true"
      >
        <CameraOff className="size-4" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated job bytes via object URL
    <img
      src={url}
      alt={dict.history.columns.screenshot}
      className="size-10 rounded-md border border-border object-cover"
      loading="lazy"
      data-testid="recognition-history-thumb"
    />
  );
}

function HistoryRowSkeleton({ cols, mobile = false }: { cols: number; mobile?: boolean }) {
  return (
    <>
      {Array.from({ length: 3 }).map((_, row) => (
        <div
          key={row}
          className={cn("animate-pulse", mobile ? "border-b border-border/60 py-4" : "contents")}
          aria-hidden="true"
        >
          {mobile ? (
            <span className="block h-10 rounded-md bg-muted/60" />
          ) : (
            <div className="flex gap-3 border-b border-border/60 px-3 py-3">
              {Array.from({ length: cols }).map((__, col) => (
                <span
                  key={col}
                  className="h-5 rounded bg-muted/60"
                  style={{ width: col === 0 ? 40 : `${12 + ((col * 13) % 22)}%` }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** Mode stamp per extraction profile (Account & Chart V1.1). */
function modeStampLabel(
  profile: OcrRecognition["extractionProfile"],
  dict: RecognitionDict,
): string {
  return profileStampLabel(profile, dict);
}

function ModeStamp({ profile, dict }: { profile: OcrRecognition["extractionProfile"]; dict: RecognitionDict }) {
  const metaKey = profileMetaKey(profile);
  return (
    <span
      className={cn("stamp !text-[10px]", metaKey === "trade" ? "stamp-ink" : "stamp-accent")}
      data-testid="recognition-history-mode"
    >
      {modeStampLabel(profile, dict)}
    </span>
  );
}
