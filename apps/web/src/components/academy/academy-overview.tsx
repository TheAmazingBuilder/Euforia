"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookmarkCheck,
  BookOpen,
  CircleCheck,
  Dumbbell,
  Flame,
  Library,
  PlayCircle,
  Sparkles,
  Trophy,
} from "lucide-react";

import type { AcademyOverviewResponse } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AcademySectionTitle,
  CategoryIcon,
  HueChip,
  ProgressBar,
  ProgressRing,
  hueOf,
  tint,
} from "@/components/academy/academy-shared";
import { CATEGORY_FLAGSHIP, CourseArt } from "@/components/academy/academy-illustrations";
import {
  useAcademyBookmarks,
  useAcademyCatalog,
  useAcademyOverview,
  useAcademySuggestions,
} from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Academy Overview — the learning dashboard: where you left off, the numbers
 * that matter, recommendations, recent activity, bookmarks and the category
 * map. Every track carries its identity hue; each category card opens with
 * the chart vignette of what it teaches. Copy stays in plain probabilistic
 * language; no gamified P&L nonsense.
 */

export function AcademyOverviewPanel({
  onOpenCourse,
  onOpenLesson,
  onGoPractice,
  onGoGlossary,
}: {
  onOpenCourse: (courseId: string) => void;
  onOpenLesson: (lessonId: string) => void;
  onGoPractice: () => void;
  onGoGlossary: () => void;
}) {
  const { data: overview } = useAcademyOverview();
  const { data: bookmarks } = useAcademyBookmarks();
  const { dict } = useI18n();
  const V = dict.academy.overview;

  if (!overview) return <OverviewSkeleton />;

  return (
    <div className="space-y-6" data-testid="academy-overview">
      <ContinueLearning data={overview} onOpenLesson={onOpenLesson} onOpenCourse={onOpenCourse} />

      {/* Stat band — one ruled strip, ledger style, hue-tinted identity chips */}
      <section aria-label={V.progressAria}>
        <AcademySectionTitle className="mb-2">{V.progressTitle}</AcademySectionTitle>
        <div className="stat-strip" data-testid="academy-stats">
          <div className="stat-cell stat-hero">
            <p className="ledger-label">{V.overallProgress}</p>
            <div className="mt-3 flex items-center gap-5">
              <div className="min-w-0 flex-1">
                <ProgressBar percent={overview.progress.overall.percent} testid="academy-progress-overall" label={V.overallProgress} />
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{overview.progress.overall.completedLessons}</span> {V.of}{" "}
                  <span className="font-mono tabular-nums">{overview.progress.overall.lessonCount}</span> {V.lessonsWord} {V.across}{" "}
                  <span className="font-mono tabular-nums">{overview.progress.courseCount}</span> {V.coursesWord}
                </p>
              </div>
              <ProgressRing
                percent={overview.progress.overall.percent}
                size={76}
                strokeWidth={7}
                testid="academy-ring-overall"
                className="hidden sm:inline-flex"
              >
                <span className="font-mono text-sm font-semibold tabular-nums">{overview.progress.overall.percent}%</span>
              </ProgressRing>
            </div>
          </div>
          <div className="stat-cell stat-hero">
            <div className="flex items-start justify-between gap-3">
              <p className="ledger-label">{V.streakLabel}</p>
              <HueChip hue="var(--warning)" icon={Flame} />
            </div>
            <p className="mt-2 flex items-baseline gap-1.5 font-mono text-3xl font-semibold tabular-nums">
              {overview.progress.streak.currentDays}
              <span className="text-sm font-normal text-muted-foreground">{V.days}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {V.longest}{" "}<span className="font-mono tabular-nums">{overview.progress.streak.longestDays}</span> ·{" "}
              {overview.progress.streak.activeToday ? V.activeToday : V.noActivityToday}
            </p>
          </div>
          <div className="stat-cell stat-kpi">
            <div className="flex items-start justify-between gap-2">
              <p className="ledger-label">{V.coursesCompleted}</p>
              <HueChip hue="var(--cat-ta)" icon={BookOpen} />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums" data-testid="academy-stat-courses">
              {overview.progress.coursesCompleted}
            </p>
          </div>
          <div className="stat-cell stat-kpi">
            <div className="flex items-start justify-between gap-2">
              <p className="ledger-label">{V.lessonsCompleted}</p>
              <HueChip hue="var(--profit)" icon={CircleCheck} />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums" data-testid="academy-stat-lessons">
              {overview.progress.overall.completedLessons}
            </p>
          </div>
          <div className="stat-cell stat-kpi">
            <div className="flex items-start justify-between gap-2">
              <p className="ledger-label">{V.quizAverage}</p>
              <HueChip hue="var(--cat-pa)" icon={Trophy} />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums" data-testid="academy-stat-quiz">
              {overview.progress.quizAverage !== null ? `${overview.progress.quizAverage}%` : "-"}
            </p>
          </div>
          <div className="stat-cell stat-kpi">
            <div className="flex items-start justify-between gap-2">
              <p className="ledger-label">{V.drillAccuracy}</p>
              <HueChip hue="var(--cat-patterns)" icon={Dumbbell} />
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums" data-testid="academy-stat-practice">
              {overview.progress.practiceAttempts > 0
                ? `${Math.round((overview.progress.practiceCorrect / overview.progress.practiceAttempts) * 100)}%`
                : "-"}
            </p>
          </div>
        </div>
      </section>

      {/* Weekly plan — the habit loop: lessons / drills / quizzes this week */}
      <WeeklyPlanCard plan={overview.weeklyPlan} onGoPractice={onGoPractice} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recommendations */}
        <section aria-label={V.recommendedAria}>
          <AcademySectionTitle className="mb-2">{V.recommendedTitle}</AcademySectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-recommendations">
            {overview.recommendations.map((rec) => {
              const hue = hueOf(rec.categoryId);
              return (
                <li key={rec.courseId}>
                  <button
                    type="button"
                    onClick={() => onOpenCourse(rec.courseId)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                  >
                    <HueChip hue={hue} icon={Sparkles} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{rec.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{rec.reason}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
            {overview.recommendations.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">{V.recommendationsEmpty}</li>
            ) : null}
          </ul>
        </section>

        {/* Recent activity */}
        <section aria-label={V.recentAria}>
          <AcademySectionTitle className="mb-2">{V.recentTitle}</AcademySectionTitle>
          {overview.recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {V.recentEmpty}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-recent">
              {overview.recent.map((item) => (
                <li key={item.lessonId}>
                  <button
                    type="button"
                    onClick={() => onOpenLesson(item.lessonId)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{item.lessonTitle}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.courseTitle}</span>
                    </span>
                    <CircleCheck className="size-4 shrink-0 text-profit" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bookmarks */}
        <section aria-label={V.bookmarksAria}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <AcademySectionTitle>{V.bookmarksTitle}</AcademySectionTitle>
            {bookmarks && bookmarks.bookmarks.length > 0 ? (
              <Link
                href="/academy?tab=bookmarks"
                className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                {V.viewAll}
              </Link>
            ) : null}
          </div>
          {bookmarks && bookmarks.bookmarks.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-bookmarks">
              {bookmarks.bookmarks.slice(0, 6).map((mark) => (
                <li key={mark.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (mark.kind === "LESSON") onOpenLesson(mark.refId);
                      else onGoGlossary();
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{mark.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{mark.subtitle}</span>
                    </span>
                    <BookmarkCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {V.bookmarksEmpty}
            </div>
          )}
        </section>

        {/* Quick destinations */}
        <section aria-label={V.quickAria}>
          <AcademySectionTitle className="mb-2">{V.quickTitle}</AcademySectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onGoPractice}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:bg-muted"
            >
              <HueChip hue="var(--cat-patterns)" icon={Dumbbell} />
              <span>
                <span className="block text-sm font-medium">{V.practiceDrills}</span>
                <span className="block text-xs text-muted-foreground">{V.practiceDrillsDesc}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onGoGlossary}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:bg-muted"
            >
              <HueChip hue="var(--cat-fund)" icon={Library} />
              <span>
                <span className="block text-sm font-medium">{V.glossaryCard}</span>
                <span className="block text-xs text-muted-foreground">{V.glossaryCardDesc}</span>
              </span>
            </button>
          </div>
        </section>
      </div>

      <JournalSuggestions onOpenLesson={onOpenLesson} onOpenCourse={onOpenCourse} />

      <CategoryMap onOpenCourse={onOpenCourse} />
    </div>
  );
}

// ── Weekly plan — three honest bars against weekly targets ─────────────────

function WeeklyPlanCard({
  plan,
  onGoPractice,
}: {
  plan: AcademyOverviewResponse["weeklyPlan"];
  onGoPractice: () => void;
}) {
  const { dict } = useI18n();
  const V = dict.academy.overview;
  const rows = [
    { label: V.rowLessons, done: plan.lessonsDone, target: plan.lessonsTarget, hue: "var(--cat-fund)" },
    { label: V.rowDrills, done: plan.drillsDone, target: plan.drillsTarget, hue: "var(--cat-patterns)" },
    { label: V.rowQuizzes, done: plan.quizzesDone, target: plan.quizzesTarget, hue: "var(--cat-pa)" },
  ];
  const complete = rows.every((row) => row.done >= row.target);
  return (
    <section aria-label={V.weeklyAria} className="rounded-lg border border-border bg-surface px-5 py-4" data-testid="academy-weekly-plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ledger-label">{V.weeklyTitle}</p>
        <span
          className={cnWeekChip(complete)}
          data-testid="academy-weekly-status"
        >
          {complete ? V.weekComplete : `${V.weekOfPrefix}${plan.weekStart}`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                <span className={row.done >= row.target ? "font-semibold text-profit" : "text-foreground"}>{Math.min(row.done, row.target)}</span>/{row.target}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.min(100, (row.done / row.target) * 100)}%`, background: row.hue }}
              />
            </div>
          </div>
        ))}
      </div>
      {!complete ? (
        <button type="button" onClick={onGoPractice} className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-hover">
          {V.shortOnDrills}
        </button>
      ) : null}
    </section>
  );
}

function cnWeekChip(complete: boolean): string {
  return complete
    ? "inline-flex items-center rounded-sm border border-profit/40 bg-profit/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-profit"
    : "inline-flex items-center rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
}

// ── Journal → Academy — the bridge between trading and learning ───────────

function JournalSuggestions({
  onOpenLesson,
  onOpenCourse,
}: {
  onOpenLesson: (lessonId: string) => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const { data } = useAcademySuggestions();
  const { dict } = useI18n();
  const V = dict.academy.overview;
  const suggestions = data?.suggestions ?? [];
  if (suggestions.length === 0) return null;

  return (
    <section aria-label={V.journalAria} data-testid="academy-journal-suggestions">
      <AcademySectionTitle className="mb-2">{V.journalTitle}</AcademySectionTitle>
      <p className="mb-2.5 text-xs text-muted-foreground">{V.journalDesc}</p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {suggestions.map((suggestion) => {
          const hue = hueOf(suggestion.categoryId);
          return (
            <li key={suggestion.courseId}>
              <button
                type="button"
                onClick={() => onOpenLesson(suggestion.lessonId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                data-testid={`academy-suggestion-${suggestion.courseId}`}
              >
                <HueChip hue={hue} icon={BookOpen} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{suggestion.courseTitle}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{suggestion.reason}</span>
                </span>
                <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
                  {V.startLesson}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onOpenCourse(suggestions[0].courseId)}
        className="mt-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {V.preferCoursePrefix}
        {suggestions[0].courseTitle}
        {V.preferCourseSuffix}
      </button>
    </section>
  );
}

function ContinueLearning({
  data,
  onOpenLesson,
  onOpenCourse,
}: {
  data: AcademyOverviewResponse;
  onOpenLesson: (lessonId: string) => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const item = data.continueLearning;
  const hue = item ? hueOf(item.categoryId) : "var(--accent)";
  const { dict } = useI18n();
  const V = dict.academy.overview;
  const S = dict.academy.shared;
  return (
    <section aria-label={V.continueAria} data-testid="academy-continue">
      <AcademySectionTitle className="mb-2">{V.continueTitle}</AcademySectionTitle>
      {item ? (
        <div
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center"
          style={{ backgroundColor: tint(hue, 4) }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PlayCircle className="size-4 shrink-0" style={{ color: hue }} aria-hidden="true" />
              <p className="truncate font-heading text-base font-semibold text-foreground">{item.courseTitle}</p>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {item.lessonTitle} · {V.lessonWord}{" "}<span className="font-mono tabular-nums">{item.lessonOrder}</span>/
              <span className="font-mono tabular-nums">{item.lessonCount}</span>
            </p>
            <div className="mt-2.5 max-w-md">
              <ProgressBar percent={item.percent} hue={hue} label={`${item.courseTitle}${S.progressSuffix}`} />
            </div>
          </div>
          <CourseArt
            courseId={item.courseId}
            categoryId={item.categoryId}
            className="h-[74px] w-40 shrink-0 rounded-md border border-border"
          />
          <div className="flex shrink-0 gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => item.nextLessonId && onOpenLesson(item.nextLessonId)} data-testid="academy-continue-btn">
              <PlayCircle className="size-3.5" aria-hidden="true" />
              {V.continueLesson}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenCourse(item.courseId)}>
              {V.course}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground">{V.curriculumComplete}</p>
          <Button size="sm" variant="outline" className="mt-3 gap-1.5" asChild>
            <Link href="/academy?tab=practice">
              <Trophy className="size-3.5" aria-hidden="true" />
              {V.keepDrillsSharp}
            </Link>
          </Button>
        </div>
      )}
      {/* Resume reading - the unfinished lesson you last had open, when it
          differs from the curriculum's next-up pointer (no duplicate rows). */}
      {data.resume && item && data.resume.lessonId !== item.lessonId ? (
        <div
          className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
          data-testid="academy-resume"
        >
          <div className="min-w-0">
            <p className="ledger-label">{V.resumeTitle}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {data.resume.lessonTitle}
              <span className="text-muted-foreground">
                {" "}· {data.resume.courseTitle} · {data.resume.coursePercent}%
              </span>
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpenLesson(data.resume!.lessonId)} data-testid="academy-resume-btn">
            <BookOpen className="size-3.5" aria-hidden="true" />
            {V.resume}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function CategoryMap({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const { data: catalog } = useAcademyCatalog();
  const { dict } = useI18n();
  const V = dict.academy.overview;
  const categories = catalog?.categories ?? [];
  return (
    <section aria-label={V.categoryMapAria}>
      <AcademySectionTitle className="mb-2">{V.categoryMapTitle}</AcademySectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const courses = (catalog?.courses ?? []).filter((course) => course.categoryId === category.id);
          const done = courses.filter((course) => course.completed).length;
          const lessons = courses.reduce((sum, course) => sum + course.lessonCount, 0);
          const completed = courses.reduce((sum, course) => sum + course.completedLessons, 0);
          const hue = hueOf(category.id);
          const flagship = CATEGORY_FLAGSHIP[category.id];
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => courses[0] && onOpenCourse(courses[0].id)}
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:bg-muted"
              data-testid={`academy-category-${category.id}`}
            >
              {flagship ? (
                <span className="relative block">
                  <CourseArt courseId={flagship} categoryId={category.id} className="aspect-[32/13] w-full" />
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                    style={{ background: tint(hue, 45) }}
                    aria-hidden="true"
                  />
                </span>
              ) : null}
              <span className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border"
                      style={{ color: hue, backgroundColor: tint(hue, 12), borderColor: tint(hue, 28) }}
                    >
                      <CategoryIcon icon={category.icon} />
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{category.name}</span>
                  </span>
                  <BookOpen className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{category.description}</span>
                <span className="mt-auto pt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {courses.length}
                  {V.coursesMid}
                  {completed}/{lessons}
                  {V.lessonsSuffix}
                  {done === courses.length && courses.length > 0 ? V.doneSuffix : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 rounded-lg" />
      <div className="stat-strip">
        <Skeleton className="stat-cell stat-hero m-0 h-32 rounded-none" />
        <Skeleton className="stat-cell stat-hero m-0 h-32 rounded-none" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
