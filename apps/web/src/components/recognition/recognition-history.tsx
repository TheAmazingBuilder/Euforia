"use client";

import * as React from "react";
import { CameraOff, Maximize2, Trash2 } from "lucide-react";

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
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import {
  formatRelative,
  platformLabel,
  recognitionConfidence,
} from "@/components/recognition/recognition-model";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionHistory — every imported screenshot with its outcome
 * (PROMPT 3 §30/§31/§33).
 *
 * Desktop: a ruled ledger table. Mobile: the same rows collapse to stacked
 * ruled cards (§35 — intentional adaptation, not a shrunken table).
 * Status filters map to the empty-state messages (§33). Deleting asks for
 * confirmation in a focused dialog (§61) and goes through the service
 * layer, never a page reload (§56).
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
}: {
  dict: RecognitionDict;
  items: readonly OcrRecognition[];
  loading: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [pendingDelete, setPendingDelete] = React.useState<OcrRecognition | null>(null);

  const filtered = React.useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [items, filter],
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
      </div>

      {/* Desktop ledger table. */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface">
              {[
                dict.history.columns.screenshot,
                dict.history.columns.platform,
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
              <HistoryRowSkeleton cols={6} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
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
                    <RecognitionStatusBadge status={item.status} dict={dict} />
                  </td>
                  <td className="px-3 py-2 font-mono text-sm tabular-nums">
                    {item.status === "FAILED" ? "—" : `${recognitionConfidence(item.fields) ?? 0}%`}
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
                      {item.status === "FAILED" ? "—" : `${recognitionConfidence(item.fields) ?? 0}%`}
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
