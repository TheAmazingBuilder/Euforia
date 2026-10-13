"use client";

/**
 * ImportOverview — the landing surface (spec §9/§10): hero with the primary
 * upload CTA, recognition-activity stats, recent imports. When the history
 * is empty the hero becomes the professional empty state. Store-backed data
 * renders after mount (hydration-safe skeletons).
 */

import { ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { jobAverageConfidence, jobNeedsReview } from "@/lib/recognition/constants";
import type { RecognitionJob } from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import {
  ConfidenceBadge,
  formatShortTimestamp,
  JobStatusBadge,
  ScreenshotThumb,
} from "./import-shared";

export function ImportOverview({
  jobs,
  onUploadCta,
  onOpenJob,
  onOpenHistory,
}: {
  jobs: RecognitionJob[];
  onUploadCta: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenHistory: () => void;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.overview;

  const analyzed = jobs.length;
  const completed = jobs.filter((job) => job.status === "COMPLETED" && !jobNeedsReview(job)).length;
  const needsReview = jobs.filter((job) => jobNeedsReview(job)).length;
  const failed = jobs.filter((job) => job.status === "FAILED" || job.status === "CANCELLED").length;

  const stats: { key: string; label: string; value: number }[] = [
    { key: "analyzed", label: V.stats.analyzed, value: analyzed },
    { key: "completed", label: V.stats.completed, value: completed },
    { key: "needsReview", label: V.stats.needsReview, value: needsReview },
    { key: "failed", label: V.stats.failed, value: failed },
  ];

  const recent = jobs.slice(0, 4);

  return (
    <div className="space-y-4" data-testid="import-overview">
      {/* Hero / empty state (spec §10) */}
      {analyzed === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-surface px-6 py-14 text-center"
          data-testid="import-hero-empty"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <ScanLine className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{V.emptyTitle}</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">{V.emptyBody}</p>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={onUploadCta}
            data-testid="import-hero-cta"
            aria-label={dict.recognition.view.newCtaAria}
          >
            {V.emptyCta}
          </Button>
          <p className="text-xs text-muted-foreground">
            {V.heroSupports} {V.heroPlatforms}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-surface p-5 sm:p-6" data-testid="import-hero">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold">{V.heroTitle}</h2>
              <p className="max-w-xl text-sm text-muted-foreground">{V.heroBody}</p>
              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-profit" aria-hidden />
                {V.heroPrivacy}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
              <Button
                type="button"
                size="lg"
                onClick={onUploadCta}
                data-testid="import-hero-cta"
                aria-label={dict.recognition.view.newCtaAria}
              >
                {V.heroCta}
              </Button>
              <p className="text-xs text-muted-foreground">
                {V.heroSupports} {V.heroPlatforms}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats (spec §9) */}
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label={V.statsAria}
        data-testid="import-stats"
      >
        {stats.map((stat) => (
          <Card key={stat.key} size="sm" data-testid={`import-stat-${stat.key.toLowerCase()}`}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums" data-testid={`import-stat-${stat.key.toLowerCase()}-value`}>
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent imports (spec §9) */}
      <Card data-testid="import-recent">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{V.recentTitle}</CardTitle>
          <Button type="button" variant="ghost" size="xs" onClick={onOpenHistory}>
            {V.historyCta}
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="import-recent-empty">
              {V.recentEmpty}
            </p>
          ) : (
            <ul className="divide-y" data-testid="import-recent-list">
              {recent.map((job) => {
                const avg = jobAverageConfidence(job);
                return (
                  <li key={job.id}>
                    <button
                      type="button"
                      onClick={() => onOpenJob(job.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="import-recent-row"
                    >
                      <span className="block size-10 shrink-0 overflow-hidden rounded-md border">
                        <ScreenshotThumb job={job} dict={dict.recognition} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-xs" title={job.file.fileName}>
                          {job.file.fileName}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatShortTimestamp(job.createdAt)}
                        </span>
                      </span>
                      {avg !== null && <ConfidenceBadge score={avg} dict={dict.recognition} />}
                      <JobStatusBadge job={job} dict={dict.recognition} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Loading skeleton for the whole overview (hydration + future API latency). */
export function ImportOverviewSkeleton() {
  return (
    <div className="space-y-4" data-testid="import-overview-skeleton" aria-hidden>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
