"use client";

/**
 * RecognitionHistory — the history surface (spec §30): screenshot, platform,
 * detected trades, status, confidence, created, actions — with status
 * filters (spec §30 statuses) and per-filter empty states that always offer
 * a next action (spec §33). Desktop renders a table; mobile renders stacked
 * cards (spec §35 — adapted, not shrunk).
 */

import * as React from "react";
import { Eye, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  jobAverageConfidence,
  jobNeedsReview,
  jobTradeCount,
} from "@/lib/recognition/constants";
import type { RecognitionJob, RecognitionJobStatus } from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import {
  ConfidenceBadge,
  formatShortTimestamp,
  JobStatusBadge,
  ScreenshotThumb,
} from "./import-shared";

type HistoryFilter = "all" | "processing" | "completed" | "needsReview" | "failed";

const FILTERS: readonly HistoryFilter[] = [
  "all",
  "processing",
  "completed",
  "needsReview",
  "failed",
];

function matchesFilter(job: RecognitionJob, filter: HistoryFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "processing":
      return job.status === "PROCESSING" || job.status === "PENDING";
    case "completed":
      return job.status === "COMPLETED" && !jobNeedsReview(job);
    case "needsReview":
      return jobNeedsReview(job);
    case "failed":
      return job.status === "FAILED" || job.status === "CANCELLED";
  }
}

export function ImportHistory({
  jobs,
  onOpen,
  onRetry,
  onUploadCta,
  retryingId,
}: {
  jobs: RecognitionJob[];
  onOpen: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onUploadCta: () => void;
  retryingId: string | null;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.history;
  const [filter, setFilter] = React.useState<HistoryFilter>("all");

  const filtered = jobs.filter((job) => matchesFilter(job, filter));
  const retryable = (job: RecognitionJob) =>
    job.status === "FAILED" || job.status === "CANCELLED";

  return (
    <div className="space-y-3" data-testid="import-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{V.title}</h2>
          <p className="text-sm text-muted-foreground">{V.subtitle}</p>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={V.filtersAria}
          data-testid="import-history-filters"
        >
          {FILTERS.map((key) => (
            <Button
              key={key}
              type="button"
              size="xs"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
              data-testid={`import-filter-${key.toLowerCase()}`}
              aria-pressed={filter === key}
            >
              {V.filters[key]}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card data-testid={`import-empty-${filter}`}>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{V.empty[filter]}</p>
            <Button type="button" size="sm" variant="outline" onClick={onUploadCta}>
              {V.emptyCta}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table (spec §30 columns) */}
          <div className="overflow-hidden rounded-xl border bg-surface">
            <table className="hidden w-full text-sm md:table" data-testid="import-history-table">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{V.columns.screenshot}</th>
                  <th className="px-4 py-2.5 font-medium">{V.columns.platform}</th>
                  <th className="px-4 py-2.5 font-medium">{V.columns.trades}</th>
                  <th className="px-4 py-2.5 font-medium">{V.columns.status}</th>
                  <th className="px-4 py-2.5 font-medium">{V.columns.confidence}</th>
                  <th className="px-4 py-2.5 font-medium">{V.columns.created}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{V.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job, index) => {
                  const avg = jobAverageConfidence(job);
                  return (
                    <tr
                      key={job.id}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                      data-testid={`import-history-row-${index}`}
                      data-job-id={job.id}
                    >
                      <td className="max-w-56 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="block size-9 shrink-0 overflow-hidden rounded-md border">
                            <ScreenshotThumb job={job} dict={dict.recognition} />
                          </span>
                          <span className="truncate font-mono text-xs" title={job.file.fileName}>
                            {job.file.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {job.result?.detectedPlatform
                          ? dict.recognition.settings.platformOptions[job.result.detectedPlatform]
                          : V.valuePending}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {jobTradeCount(job) === 0
                          ? V.tradesZero
                          : jobTradeCount(job) === 1
                            ? V.tradesOne
                            : `${jobTradeCount(job)} ${V.tradesMany}`}
                      </td>
                      <td className="px-4 py-2.5">
                        <JobStatusBadge job={job} dict={dict.recognition} />
                      </td>
                      <td className="px-4 py-2.5">
                        {avg !== null ? (
                          <ConfidenceBadge score={avg} dict={dict.recognition} />
                        ) : (
                          <span className="text-muted-foreground">{V.valuePending}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatShortTimestamp(job.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => onOpen(job.id)}
                            data-testid={`import-history-open-${index}`}
                            aria-label={`${V.openAria} — ${job.file.fileName}`}
                          >
                            <Eye aria-hidden />
                            {V.open}
                          </Button>
                          {retryable(job) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => onRetry(job.id)}
                              disabled={retryingId === job.id}
                              data-testid={`import-history-retry-${index}`}
                              aria-label={`${V.retryAria} — ${job.file.fileName}`}
                            >
                              {retryingId === job.id ? (
                                <Loader2 className="animate-spin" aria-hidden />
                              ) : (
                                <RotateCcw aria-hidden />
                              )}
                              {V.retry}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (spec §35) */}
          <div className="space-y-2 md:hidden" data-testid="import-history-cards">
            {filtered.map((job, index) => {
              const avg = jobAverageConfidence(job);
              return (
                <Card key={job.id} size="sm" data-testid={`import-history-card-${index}`}>
                  <CardContent className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className="block size-12 shrink-0 overflow-hidden rounded-md border">
                        <ScreenshotThumb job={job} dict={dict.recognition} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs" title={job.file.fileName}>
                          {job.file.fileName}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatShortTimestamp(job.createdAt)}
                        </p>
                      </div>
                      <JobStatusBadge job={job} dict={dict.recognition} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{V.columns.platform}</span>
                      <span className="font-mono">
                        {job.result?.detectedPlatform
                          ? dict.recognition.settings.platformOptions[job.result.detectedPlatform]
                          : V.valuePending}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{V.columns.confidence}</span>
                      {avg !== null ? (
                        <ConfidenceBadge score={avg} dict={dict.recognition} />
                      ) : (
                        <span className="text-muted-foreground">{V.valuePending}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      {retryable(job) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => onRetry(job.id)}
                          disabled={retryingId === job.id}
                          data-testid={`import-history-card-retry-${index}`}
                          aria-label={`${V.retryAria} — ${job.file.fileName}`}
                        >
                          <RotateCcw aria-hidden />
                          {V.retry}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => onOpen(job.id)}
                        data-testid={`import-history-card-open-${index}`}
                        aria-label={`${V.openAria} — ${job.file.fileName}`}
                      >
                        <Eye aria-hidden />
                        {V.open}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Status label helper exported for the details view. */
export function historyStatusLabel(
  job: RecognitionJob,
  dict: ReturnType<typeof useI18n>["dict"],
): string {
  return jobNeedsReview(job)
    ? dict.recognition.status.NEEDS_REVIEW
    : dict.recognition.status[job.status as RecognitionJobStatus];
}
