"use client";

import * as React from "react";
import { Trophy } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { AcademySectionTitle, ProgressBar } from "@/components/academy/academy-shared";
import { useAcademyProgress } from "@/lib/api/queries";

/**
 * Progress panel — the honest transcript: overall percent, the ruled stat
 * band, per-category bars, quiz and drill statistics. No vanity metrics.
 */

export function AcademyProgressPanel() {
  const { data: progress, isLoading } = useAcademyProgress();

  if (isLoading || !progress) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  const drillAccuracy = progress.practiceAttempts > 0 ? Math.round((progress.practiceCorrect / progress.practiceAttempts) * 100) : null;

  return (
    <div className="space-y-6" data-testid="academy-progress-panel">
      <div className="stat-strip">
        <div className="stat-cell stat-hero">
          <p className="ledger-label">Overall</p>
          <div className="mt-3">
            <ProgressBar percent={progress.overall.percent} testid="academy-progress-overall-bar" label="Overall progress" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{progress.overall.completedLessons}</span>/
            <span className="font-mono tabular-nums">{progress.overall.lessonCount}</span> lessons ·{" "}
            <span className="font-mono tabular-nums">{progress.coursesCompleted}</span>/
            <span className="font-mono tabular-nums">{progress.courseCount}</span> courses completed
          </p>
        </div>
        <div className="stat-cell stat-hero">
          <p className="ledger-label">Streak</p>
          <p className="mt-2 flex items-baseline gap-1.5 font-mono text-3xl font-semibold tabular-nums">
            {progress.streak.currentDays}
            <span className="text-sm font-normal text-muted-foreground">days</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Longest <span className="font-mono tabular-nums">{progress.streak.longestDays}</span> · last activity{" "}
            <span className="font-mono tabular-nums">{progress.streak.lastActivityDate ?? "—"}</span>
          </p>
        </div>
        <div className="stat-cell stat-kpi">
          <p className="ledger-label">Quizzes taken</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.quizzesTaken}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <p className="ledger-label">Quiz average</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.quizAverage !== null ? `${progress.quizAverage}%` : "—"}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <p className="ledger-label">Drill attempts</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.practiceAttempts}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <p className="ledger-label">Drill accuracy</p>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{drillAccuracy !== null ? `${drillAccuracy}%` : "—"}</p>
        </div>
      </div>

      <section aria-label="Progress by category">
        <AcademySectionTitle className="mb-2">By category</AcademySectionTitle>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-progress-categories">
          {progress.categories.map((category) => (
            <div key={category.categoryId} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{category.name}</p>
                <p className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {category.completedLessons}/{category.lessonCount}
                  {category.lessonCount > 0 && category.completedLessons === category.lessonCount ? (
                    <Trophy className="ml-1.5 inline size-3.5 text-warning" aria-label="Category completed" />
                  ) : null}
                </p>
              </div>
              <ProgressBar className="mt-1.5" percent={category.percent} label={`${category.name} progress`} testid={`academy-progress-cat-${category.categoryId}`} />
            </div>
          ))}
        </div>
      </section>

      {progress.coursesCompleted > 0 ? (
        <p className="text-xs text-muted-foreground">
          Completed courses stay open — rereading a lesson after a few live weeks is where it actually clicks.
        </p>
      ) : null}
    </div>
  );
}
