"use client";

import * as React from "react";

import { FileImage, ScanText, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RecognitionHistoryItem } from "@/lib/recognition/contract";
import { PLATFORM_LABELS } from "@/lib/recognition/contract";
import { ConfidenceBadge, JobStatusBadge, NeedsReviewBadge } from "./ocr-badges";
import { nowMs, useNow } from "./ocr-now";
import { formatBytes, formatRelative } from "./ocr-format";

/**
 * Recognition history (Prompt 3 §30/§31): a ruled table on desktop, stacked
 * cards on mobile. Opening a row hands the job id to the workspace (URL
 * state §44); deletion is explicit and confirm-guarded.
 */

export interface RecognitionHistoryProps {
  jobs: RecognitionHistoryItem[];
  loading: boolean;
  /** jobId → in-session blob URL, when the preview is still alive. */
  previewUrls: Map<string, string>;
  onOpen: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onImport: () => void;
}

export function RecognitionHistory({
  jobs,
  loading,
  previewUrls,
  onOpen,
  onDelete,
  onImport,
}: RecognitionHistoryProps) {
  const now = useNow();

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden data-testid="ocr-history-loading">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center"
        data-testid="ocr-history-empty"
      >
        <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface">
          <ScanText className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">No imports yet</h3>
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">
            Your recognition history will list every screenshot you analyze, with its status,
            confidence and resulting trade.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onImport} data-testid="ocr-history-empty-cta">
          Upload your first screenshot
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block" data-testid="ocr-history-table">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(TABLE_HEAD, "w-[280px] text-left")}>Screenshot</th>
              <th className={cn(TABLE_HEAD, "text-left")}>Platform</th>
              <th className={cn(TABLE_HEAD, "text-left")}>Trades</th>
              <th className={cn(TABLE_HEAD, "text-left")}>Status</th>
              <th className={cn(TABLE_HEAD, "text-left")}>Confidence</th>
              <th className={cn(TABLE_HEAD, "text-left")}>Created</th>
              <th className={cn(TABLE_HEAD, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                onClick={() => onOpen(job.id)}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                data-testid={`ocr-history-row-${job.id}`}
              >
                <td className={TABLE_CELL}>
                  <div className="flex items-center gap-2.5">
                    <HistoryThumb item={job} previewUrls={previewUrls} />
                    <div className="min-w-0">
                      <p className="max-w-[220px] truncate text-xs font-medium">{job.screenshotName}</p>
                      <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {formatBytes(job.sizeBytes)}
                        {job.mimeType === "application/pdf" && job.documentPageCount !== undefined
                          ? ` · PDF · ${job.documentPageCount}p`
                          : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={TABLE_CELL}>
                  {job.detectedPlatform !== null
                    ? PLATFORM_LABELS[job.detectedPlatform]
                    : "—"}
                </td>
                <td className={cn(TABLE_CELL, "font-mono tabular-nums")}>
                  {job.detectedTradeCount > 0
                    ? `${job.detectedTradeCount} ${job.detectedTradeCount > 1 ? "trades" : "trade"}`
                    : "—"}
                </td>
                <td className={TABLE_CELL}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <JobStatusBadge status={job.status} />
                    {job.hasWarnings && job.status === "COMPLETED" ? <NeedsReviewBadge /> : null}
                  </div>
                </td>
                <td className={TABLE_CELL}>
                  <ConfidenceBadge
                    level={
                      job.overallConfidence === null
                        ? null
                        : job.overallConfidence >= 85
                          ? "HIGH"
                          : job.overallConfidence >= 65
                            ? "MEDIUM"
                            : "LOW"
                    }
                    value={job.overallConfidence}
                  />
                </td>
                <td className={cn(TABLE_CELL, "whitespace-nowrap text-muted-foreground")}>
                  {formatRelative(job.createdAt, nowMs(now))}
                </td>
                <td className={cn(TABLE_CELL, "text-right")}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mx-auto size-7 text-muted-foreground hover:text-loss"
                    aria-label={`Delete recognition ${job.screenshotName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(job.id);
                    }}
                    data-testid={`ocr-history-delete-${job.id}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden" data-testid="ocr-history-cards">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className="cursor-pointer py-0 transition-colors hover:border-accent/50"
            onClick={() => onOpen(job.id)}
            data-testid={`ocr-history-card-${job.id}`}
          >
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <HistoryThumb item={job} previewUrls={previewUrls} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-xs font-medium">{job.screenshotName}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <JobStatusBadge status={job.status} />
                  {job.hasWarnings && job.status === "COMPLETED" ? <NeedsReviewBadge /> : null}
                  {job.overallConfidence !== null ? (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(job.overallConfidence)}%
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {formatRelative(job.createdAt, nowMs(now))}
                  {job.detectedTradeCount > 0
                    ? ` · ${job.detectedTradeCount} ${job.detectedTradeCount > 1 ? "trades" : "trade"}`
                    : ""}
                  {job.mimeType === "application/pdf" && job.documentPageCount !== undefined
                    ? ` · PDF ${job.documentPageCount}p`
                    : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-loss"
                aria-label={`Delete recognition ${job.screenshotName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(job.id);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function HistoryThumb({
  item,
  previewUrls,
}: {
  item: RecognitionHistoryItem;
  previewUrls: Map<string, string>;
}) {
  const [broken, setBroken] = React.useState(false);
  const url = previewUrls.get(item.id);
  if (url === undefined || broken) {
    return (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted",
          item.status === "FAILED" && "border-loss/30",
        )}
        aria-hidden
      >
        {item.status === "FAILED" ? (
          <TriangleAlert className="size-4 text-loss/70" />
        ) : (
          <FileImage className="size-4 text-muted-foreground" />
        )}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- session-local blob thumbnail
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="size-9 shrink-0 rounded-md border border-border object-cover"
    />
  );
}

const TABLE_HEAD =
  "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const TABLE_CELL = "px-3 py-2.5 text-left text-xs";
