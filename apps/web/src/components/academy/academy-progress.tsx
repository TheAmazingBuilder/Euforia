"use client";

import * as React from "react";
import { CircleCheck, Dumbbell, Flame, Trophy } from "lucide-react";

import type { AcademyProgressResponse } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import {
  AcademySectionTitle,
  HueChip,
  ProgressBar,
  hueOf,
} from "@/components/academy/academy-shared";
import { useAcademyProgress } from "@/lib/api/queries";

/**
 * Progress panel — the honest transcript: a 12-segment ring where each arc
 * carries its category's identity hue and fills with its completion, the
 * ruled stat band, and per-category bars in the same hues. No vanity metrics.
 */

function SegmentedRing({ progress, size = 116, strokeWidth = 9 }: { progress: AcademyProgressResponse; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const seg = c / progress.categories.length;
  const gap = 2.4;

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--surface-raised)", strokeWidth }} />
        {progress.categories.map((category, index) => {
          const hue = hueOf(category.categoryId);
          const arc = Math.max((seg * category.percent) / 100 - gap, 0);
          return (
            <circle
              key={category.categoryId}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              transform={`rotate(${-90 + index * (360 / progress.categories.length)} ${size / 2} ${size / 2})`}
              style={{
                stroke: hue,
                strokeWidth,
                strokeLinecap: "butt",
                strokeDasharray: `${arc} ${c - arc}`,
                strokeDashoffset: -gap / 2,
                transition: "stroke-dasharray 500ms cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          );
        })}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold tabular-nums" data-testid="academy-progress-ring-value">
          {progress.overall.percent}%
        </span>
        <span className="ledger-label text-[9px]">overall</span>
      </span>
    </span>
  );
}

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
          <div className="mt-3 flex items-center gap-5">
            <SegmentedRing progress={progress} />
            <div className="min-w-0 flex-1">
              <ProgressBar percent={progress.overall.percent} testid="academy-progress-overall-bar" label="Overall progress" />
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{progress.overall.completedLessons}</span>/
                <span className="font-mono tabular-nums">{progress.overall.lessonCount}</span> lessons ·{" "}
                <span className="font-mono tabular-nums">{progress.coursesCompleted}</span>/
                <span className="font-mono tabular-nums">{progress.courseCount}</span> courses completed
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Each arc is a teaching track — its length is fixed, its fill is your completion.
              </p>
            </div>
          </div>
        </div>
        <div className="stat-cell stat-hero">
          <div className="flex items-start justify-between gap-3">
            <p className="ledger-label">Streak</p>
            <HueChip hue="var(--warning)" icon={Flame} />
          </div>
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
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">Quizzes taken</p>
            <HueChip hue="var(--cat-pa)" icon={Trophy} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.quizzesTaken}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">Quiz average</p>
            <HueChip hue="var(--cat-strategies)" icon={Trophy} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.quizAverage !== null ? `${progress.quizAverage}%` : "—"}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">Drill attempts</p>
            <HueChip hue="var(--cat-patterns)" icon={Dumbbell} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.practiceAttempts}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">Drill accuracy</p>
            <HueChip hue="var(--profit)" icon={CircleCheck} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{drillAccuracy !== null ? `${drillAccuracy}%` : "—"}</p>
        </div>
      </div>

      <section aria-label="Progress by category">
        <AcademySectionTitle className="mb-2">By category</AcademySectionTitle>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-progress-categories">
          {progress.categories.map((category) => {
            const hue = hueOf(category.categoryId);
            return (
              <div key={category.categoryId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: hue }} />
                    {category.name}
                  </p>
                  <p className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {category.completedLessons}/{category.lessonCount}
                    {category.lessonCount > 0 && category.completedLessons === category.lessonCount ? (
                      <Trophy className="ml-1.5 inline size-3.5 text-warning" aria-label="Category completed" />
                    ) : null}
                  </p>
                </div>
                <ProgressBar className="mt-1.5" percent={category.percent} hue={hue} label={`${category.name} progress`} testid={`academy-progress-cat-${category.categoryId}`} />
              </div>
            );
          })}
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
