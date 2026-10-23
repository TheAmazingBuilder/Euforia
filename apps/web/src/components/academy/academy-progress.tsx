"use client";

import * as React from "react";
import { CircleCheck, Dumbbell, Flame, Lock, Trophy } from "lucide-react";

import type { AcademyProgressResponse } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { CertificationsSection } from "@/components/academy/academy-exams";
import {
  AcademySectionTitle,
  HueChip,
  ProgressBar,
  hueOf,
  tint,
  useInViewOnce,
  usePrefersReducedMotion,
} from "@/components/academy/academy-shared";
import { useAcademyMilestones, useAcademyProgress } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Progress panel — the honest transcript: a 12-segment ring where each arc
 * carries its category's identity hue and fills with its completion, the
 * ruled stat band, and per-category bars in the same hues. No vanity metrics.
 */

function SegmentedRing({ progress, size = 116, strokeWidth = 9 }: { progress: AcademyProgressResponse; size?: number; strokeWidth?: number }) {
  const { ref, inView } = useInViewOnce<HTMLSpanElement>();
  const reducedMotion = usePrefersReducedMotion();
  const { dict } = useI18n();
  const drawn = inView || reducedMotion;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const seg = c / progress.categories.length;
  const gap = 2.4;

  return (
    <span ref={ref} className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
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
                strokeDasharray: drawn ? `${arc} ${c - arc}` : `0.01 ${c - 0.01}`,
                strokeDashoffset: -gap / 2,
                transition: reducedMotion ? "none" : `stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1) ${index * 45}ms`,
              }}
            />
          );
        })}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold tabular-nums" data-testid="academy-progress-ring-value">
          {progress.overall.percent}%
        </span>
        <span className="ledger-label text-[9px]">{dict.academy.progress.overallRing}</span>
      </span>
    </span>
  );
}

export function AcademyProgressPanel() {
  const { data: progress, isLoading } = useAcademyProgress();
  const { dict } = useI18n();
  const V = dict.academy.progress;

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
          <p className="ledger-label">{V.overall}</p>
          <div className="mt-3 flex items-center gap-5">
            <SegmentedRing progress={progress} />
            <div className="min-w-0 flex-1">
              <ProgressBar percent={progress.overall.percent} testid="academy-progress-overall-bar" label={V.overallProgress} />
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{progress.overall.completedLessons}</span>/
                <span className="font-mono tabular-nums">{progress.overall.lessonCount}</span>
                {V.lessonsMid}
                <span className="font-mono tabular-nums">{progress.coursesCompleted}</span>/
                <span className="font-mono tabular-nums">{progress.courseCount}</span>
                {V.coursesEnd}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{V.arcsNote}</p>
            </div>
          </div>
        </div>
        <div className="stat-cell stat-hero">
          <div className="flex items-start justify-between gap-3">
            <p className="ledger-label">{V.streak}</p>
            <HueChip hue="var(--warning)" icon={Flame} />
          </div>
          <p className="mt-2 flex items-baseline gap-1.5 font-mono text-3xl font-semibold tabular-nums">
            {progress.streak.currentDays}
            <span className="text-sm font-normal text-muted-foreground">{V.days}</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {V.longestPrefix}
            <span className="font-mono tabular-nums">{progress.streak.longestDays}</span>
            {V.lastActivityPrefix}
            <span className="font-mono tabular-nums">{progress.streak.lastActivityDate ?? "-"}</span>
          </p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">{V.quizzesTaken}</p>
            <HueChip hue="var(--cat-pa)" icon={Trophy} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.quizzesTaken}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">{V.quizAverage}</p>
            <HueChip hue="var(--cat-strategies)" icon={Trophy} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.quizAverage !== null ? `${progress.quizAverage}%` : "-"}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">{V.drillAttempts}</p>
            <HueChip hue="var(--cat-patterns)" icon={Dumbbell} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{progress.practiceAttempts}</p>
        </div>
        <div className="stat-cell stat-kpi">
          <div className="flex items-start justify-between gap-2">
            <p className="ledger-label">{V.drillAccuracy}</p>
            <HueChip hue="var(--profit)" icon={CircleCheck} />
          </div>
          <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{drillAccuracy !== null ? `${drillAccuracy}%` : "-"}</p>
        </div>
      </div>

      <section aria-label={V.byCategoryAria}>
        <AcademySectionTitle className="mb-2">{V.byCategoryTitle}</AcademySectionTitle>
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
                      <Trophy className="ml-1.5 inline size-3.5 text-warning" aria-label={V.categoryCompletedAria} />
                    ) : null}
                  </p>
                </div>
                <ProgressBar className="mt-1.5" percent={category.percent} hue={hue} label={`${category.name}${dict.academy.shared.progressSuffix}`} testid={`academy-progress-cat-${category.categoryId}`} />
              </div>
            );
          })}
        </div>
      </section>

      <MilestonesSection />
      <CertificationsSection />

      {progress.coursesCompleted > 0 ? (
        <p className="text-xs text-muted-foreground">{V.rereadNote}</p>
      ) : null}
    </div>
  );
}

// ── Milestones — sober achievements with honest progress bars ──────────────

function MilestonesSection() {
  const { data, isLoading } = useAcademyMilestones();
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const reducedMotion = usePrefersReducedMotion();
  const { dict } = useI18n();
  const V = dict.academy.progress;
  const shown = inView || reducedMotion;

  return (
    <section aria-label={V.milestonesAria} data-testid="academy-milestones">
      <AcademySectionTitle className="mb-2">{V.milestonesTitle}</AcademySectionTitle>
      <p className="mb-2.5 text-xs text-muted-foreground">{V.milestonesDesc}</p>
      <div ref={ref} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading || !data
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)
          : data.milestones.map((milestone, index) => (
              <div
                key={milestone.id}
                className="flex flex-col rounded-lg border px-3.5 py-3 transition-all duration-500"
                style={
                  milestone.achieved
                    ? { borderColor: tint("var(--warning)", 35), backgroundColor: tint("var(--warning)", 6), transitionDelay: `${reducedMotion ? 0 : index * 40}ms`, opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)" }
                    : { opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)", transitionDelay: `${reducedMotion ? 0 : index * 40}ms` }
                }
                data-testid={`academy-milestone-${milestone.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{milestone.label}</p>
                  {milestone.achieved ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-warning">
                      <CircleCheck className="size-3" aria-hidden="true" />
                      {V.earnedChip}
                    </span>
                  ) : (
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{milestone.description}</p>
                {milestone.progress ? (
                  <div className="mt-auto pt-2">
                    <ProgressBar percent={Math.min(100, Math.round((milestone.progress.current / milestone.progress.target) * 100))} label={`${milestone.label}${dict.academy.shared.progressSuffix}`} />
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {milestone.progress.current}/{milestone.progress.target}
                    </p>
                  </div>
                ) : (
                  <p className="mt-auto pt-2 font-mono text-[10px] uppercase tracking-wider text-warning">
                    {V.earnedPrefix}
                    {milestone.achievedAt ? new Date(milestone.achievedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                  </p>
                )}
              </div>
            ))}
      </div>
    </section>
  );
}
