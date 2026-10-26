"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, CircleCheck, Coins, FlaskConical, GraduationCap, Search, ShieldAlert, CandlestickChart, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AcademyCourseCard, AcademyLevel } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademySectionTitle, CategoryIcon, LevelBadge, ProgressBar, hueOf, tint } from "@/components/academy/academy-shared";
import { CourseArt } from "@/components/academy/academy-illustrations";
import { LessonReader } from "@/components/academy/academy-lesson";
import { CourseQuiz } from "@/components/academy/academy-lesson";
import {
  useAcademyCatalog,
  useAcademyCourse,
  useAcademySearch,
} from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Courses panel - three stacked views: the catalog (12 categories, filters,
 * full-text search across courses/lessons/glossary), the course detail
 * (objectives + lesson list + quiz) and the lesson reader. Views are
 * deep-linkable via ?course= and ?lesson=.
 */

const LEVELS: AcademyLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];
const STATUS = ["ALL", "IN_PROGRESS", "COMPLETED", "NOT_STARTED"] as const;
const DURATIONS = ["ALL", "SHORT", "MEDIUM", "LONG"] as const;
const SORTS = ["curriculum", "shortest", "longest", "progress"] as const;

// Machine ids only - labels resolve through dict.academy.courses
// (status/duration/sort objects).
type SortId = (typeof SORTS)[number];

export function AcademyCoursesPanel({
  courseId,
  lessonId,
  onOpenCourse,
  onOpenLesson,
  onBack,
}: {
  courseId: string | null;
  lessonId: string | null;
  onOpenCourse: (courseId: string) => void;
  onOpenLesson: (lessonId: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [category, setCategory] = React.useState<string>("ALL");
  const [level, setLevel] = React.useState<AcademyLevel | "ALL">("ALL");
  const [status, setStatus] = React.useState<(typeof STATUS)[number]>("ALL");
  const [duration, setDuration] = React.useState<(typeof DURATIONS)[number]>("ALL");
  const [sort, setSort] = React.useState<SortId>("curriculum");
  const { dict } = useI18n();
  const V = dict.academy.courses;
  const S = dict.academy.shared;

  // Debounce the server search (300ms) - catalog filtering stays client-side.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  if (lessonId) {
    return <LessonReader lessonId={lessonId} onOpenLesson={onOpenLesson} onBack={onBack} />;
  }
  if (courseId) {
    return <CourseDetail courseId={courseId} onOpenLesson={onOpenLesson} onBack={onBack} />;
  }

  return (
    <div className="space-y-5" data-testid="academy-catalog">
      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={V.searchPlaceholder}
            className="pl-9 pr-8"
            aria-label={V.searchAria}
            data-testid="academy-search-input"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={V.clearSearch}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {query === "" ? (
          <>
            <CategoryFilter category={category} onPick={setCategory} />
            <div className="flex flex-wrap items-center gap-1.5" data-testid="academy-filters">
              <FilterChip active={level === "ALL"} onClick={() => setLevel("ALL")}>
                {V.allLevels}
              </FilterChip>
              {LEVELS.map((l) => (
                <FilterChip key={l} active={level === l} onClick={() => setLevel(level === l ? "ALL" : l)}>
                  {S.levels[l]}
                </FilterChip>
              ))}
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              {STATUS.map((s) => (
                <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                  {V.status[s]}
                </FilterChip>
              ))}
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              {DURATIONS.map((d) => (
                <FilterChip key={d} active={duration === d} onClick={() => setDuration(d)}>
                  {V.duration[d]}
                </FilterChip>
              ))}
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {V.sortLabel}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortId)}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={V.sortAria}
                  data-testid="academy-sort"
                >
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {V.sort[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}
      </div>

      {query !== "" ? (
        <SearchResults query={query} onOpenCourse={onOpenCourse} onOpenLesson={onOpenLesson} />
      ) : (
        <>
          <LearningPaths onOpenCourse={onOpenCourse} />
          <CatalogGrid category={category} level={level} status={status} duration={duration} sort={sort} onOpenCourse={onOpenCourse} />
        </>
      )}
    </div>
  );
}

// ── Learning paths - guided cross-track sequences ──────────────────────────

const PATH_ICONS: Record<string, LucideIcon> = {
  Coins,
  ShieldAlert,
  CandlestickChart,
  FlaskConical,
};

function LearningPaths({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const { data: catalog } = useAcademyCatalog();
  const { dict } = useI18n();
  const V = dict.academy.courses;
  const S = dict.academy.shared;
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const paths = catalog?.paths ?? [];
  if (paths.length === 0) return null;

  return (
    <section aria-label={V.pathsAria} data-testid="academy-paths">
      <AcademySectionTitle className="mb-2">{V.pathsTitle}</AcademySectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {paths.map((path) => {
          const Icon = PATH_ICONS[path.icon] ?? GraduationCap;
          const open = openPath === path.id;
          return (
            <div
              key={path.id}
              className="flex flex-col rounded-lg border border-border bg-surface transition-colors"
              data-testid={`academy-path-${path.id}`}
            >
              <button
                type="button"
                onClick={() => setOpenPath((prev) => (prev === path.id ? null : path.id))}
                className="flex flex-1 flex-col px-4 pb-3 pt-3.5 text-left"
                aria-expanded={open}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent"
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {path.completedCourses}/{path.courses.length}
                    {V.coursesSuffix}
                  </span>
                </span>
                <span className="mt-2.5 block font-heading text-sm font-semibold text-foreground">{path.title}</span>
                <span className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">{path.description}</span>
                <span className="mt-3 block">
                  <ProgressBar percent={path.percent} label={`${path.title}${S.progressSuffix}`} testid={`academy-path-progress-${path.id}`} />
                </span>
              </button>
              {open ? (
                <ol className="mt-1 divide-y divide-border border-t border-border">
                  {path.courses.map((course, index) => (
                    <li key={course.id}>
                      <button
                        type="button"
                        onClick={() => onOpenCourse(course.id)}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={
                            course.completed
                              ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-profit/15 text-profit"
                              : "flex size-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[10px] tabular-nums text-muted-foreground"
                          }
                        >
                          {course.completed ? <CircleCheck className="size-3" aria-hidden="true" /> : index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{course.title}</span>
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Category filter chips (hue-dotted) ────────────────────────────────────

function CategoryFilter({ category, onPick }: { category: string; onPick: (id: string) => void }) {
  const { data: catalog } = useAcademyCatalog();
  const { dict } = useI18n();
  const V = dict.academy.courses;
  const categories = catalog?.categories ?? [];
  if (categories.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="academy-category-filter">
      <FilterChip active={category === "ALL"} onClick={() => onPick("ALL")}>
        {V.allCategories}
      </FilterChip>
      {categories.map((cat) => {
        const hue = hueOf(cat.id);
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onPick(category === cat.id ? "ALL" : cat.id)}
            aria-pressed={category === cat.id}
            className={
              category === cat.id
                ? "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-background"
                : "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            }
            style={category === cat.id ? { backgroundColor: hue } : undefined}
            data-testid={`academy-category-chip-${cat.id}`}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: category === cat.id ? "var(--background)" : hue }} />
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background"
          : "rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

// ── Catalog grid ─────────────────────────────────────────────────────────────

function CatalogGrid({
  category,
  level,
  status,
  duration,
  sort,
  onOpenCourse,
}: {
  category: string;
  level: AcademyLevel | "ALL";
  status: (typeof STATUS)[number];
  duration: (typeof DURATIONS)[number];
  sort: SortId;
  onOpenCourse: (courseId: string) => void;
}) {
  const { data: catalog, isLoading } = useAcademyCatalog();
  const { dict } = useI18n();
  const V = dict.academy.courses;

  if (isLoading || !catalog) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-lg" />
        ))}
      </div>
    );
  }

  const categoryById = new Map(catalog.categories.map((cat) => [cat.id, cat]));
  const courses = catalog.courses.filter((course) => {
    if (level !== "ALL" && course.level !== level) return false;
    if (status === "COMPLETED" && !course.completed) return false;
    if (status === "IN_PROGRESS" && (course.completed || course.completedLessons === 0)) return false;
    if (status === "NOT_STARTED" && course.completedLessons > 0) return false;
    if (duration === "SHORT" && course.estimatedMinutes >= 60) return false;
    if (duration === "MEDIUM" && (course.estimatedMinutes < 60 || course.estimatedMinutes > 120)) return false;
    if (duration === "LONG" && course.estimatedMinutes < 120) return false;
    return true;
  });

  // Sort within each category group (curriculum order = server order).
  const sortCourses = (list: AcademyCourseCard[]) => {
    if (sort === "shortest") return [...list].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
    if (sort === "longest") return [...list].sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);
    if (sort === "progress") return [...list].sort((a, b) => b.progress - a.progress);
    return list;
  };

  const grouped = catalog.categories
    .filter((cat) => category === "ALL" || cat.id === category)
    .map((cat) => ({ category: cat, courses: courses.filter((course) => course.categoryId === cat.id) }))
    .filter((group) => group.courses.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {V.noMatch}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ category: cat, courses: catCourses }) => {
        const hue = hueOf(cat.id);
        return (
          <section key={cat.id} aria-label={cat.name}>
            <div className="mb-2 flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border"
                style={{ color: hue, backgroundColor: tint(hue, 12), borderColor: tint(hue, 28) }}
              >
                <CategoryIcon icon={cat.icon} className="size-4" />
              </span>
              <h3 className="font-heading text-base font-semibold text-foreground">{cat.name}</h3>
              <LevelBadge level={cat.level} />
            </div>
            <p className="mb-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">{cat.description}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortCourses(catCourses).map((course) => (
                <CourseCard key={course.id} course={course} onOpen={() => onOpenCourse(course.id)} />
              ))}
            </div>
            <p className="sr-only">{categoryById.get(cat.id)?.name}</p>
          </section>
        );
      })}
    </div>
  );
}

function CourseCard({ course, onOpen }: { course: AcademyCourseCard; onOpen: () => void }) {
  const hue = hueOf(course.categoryId);
  const { dict } = useI18n();
  const V = dict.academy.courses;
  const S = dict.academy.shared;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:bg-muted"
      data-testid={`academy-course-card-${course.id}`}
    >
      {/* Concept vignette - the chart the course teaches, in the track hue */}
      <span className="relative block">
        <CourseArt courseId={course.id} categoryId={course.categoryId} className="aspect-[32/13] w-full" />
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{ background: tint(hue, 45) }}
          aria-hidden="true"
        />
        {course.completed ? (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--profit)", backgroundColor: tint("var(--profit)", 14), borderColor: tint("var(--profit)", 40) }}
          >
            <CircleCheck className="size-3" aria-hidden="true" />
            {V.done}
          </span>
        ) : null}
      </span>
      <span className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
        <span className="flex items-start justify-between gap-2">
          <h4 className="font-heading text-sm font-semibold leading-snug text-foreground">{course.title}</h4>
          {course.completed ? null : <LevelBadge level={course.level} />}
        </span>
        <span className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">{course.description}</span>
        <span className="mt-3 block">
          {course.completedLessons > 0 || course.completed ? (
            <ProgressBar percent={course.progress} hue={hue} label={`${course.title}${S.progressSuffix}`} testid={`academy-course-progress-${course.id}`} />
          ) : null}
        </span>
        <span className="mt-2 flex items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>
            {course.completedLessons}/{course.lessonCount}
            {V.lessonsSuffix}
          </span>
          <span aria-hidden="true">·</span>
          <span>~{course.estimatedMinutes}
            {S.minSuffix}
          </span>
          {course.quizId ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {course.quizBestScore !== null ? (
                  <>
                    {V.quizScorePrefix}
                    {Math.round((course.quizBestScore / course.lessonCount) * 100)}%
                  </>
                ) : (
                  V.quizWord
                )}
              </span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}

// ── Search results ───────────────────────────────────────────────────────────

function SearchResults({
  query,
  onOpenCourse,
  onOpenLesson,
}: {
  query: string;
  onOpenCourse: (courseId: string) => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  const { data, isLoading } = useAcademySearch(query);
  const { dict } = useI18n();
  const V = dict.academy.courses;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const empty = data.courses.length === 0 && data.lessons.length === 0 && data.glossary.length === 0;

  return (
    <div className="space-y-6" data-testid="academy-search-results">
      {empty ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {V.noResultsPrefix}
          {query}
          {V.noResultsSuffix}
        </div>
      ) : null}

      {data.courses.length > 0 ? (
        <section aria-label={V.matchingCoursesAria}>
          <AcademySectionTitle className="mb-2">{V.coursesTitle}</AcademySectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {data.courses.map((course) => (
              <li key={course.id}>
                <button type="button" onClick={() => onOpenCourse(course.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted">
                  <span>
                    <span className="block text-sm font-medium">{course.title}</span>
                    <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{course.description}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.lessons.length > 0 ? (
        <section aria-label={V.matchingLessonsAria}>
          <AcademySectionTitle className="mb-2">{V.lessonsTitle}</AcademySectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {data.lessons.map((lesson) => (
              <li key={lesson.id}>
                <button type="button" onClick={() => onOpenLesson(lesson.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{lesson.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">{lesson.courseTitle}</span>
                    {lesson.snippet ? <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{lesson.snippet}</span> : null}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.glossary.length > 0 ? (
        <section aria-label={V.matchingGlossaryAria}>
          <AcademySectionTitle className="mb-2">{V.glossaryTitle}</AcademySectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {data.glossary.map((term) => (
              <li key={term.id} className="px-4 py-3">
                <p className="text-sm font-medium">{term.term}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{term.simple}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ── Course detail ────────────────────────────────────────────────────────────

function CourseDetail({
  courseId,
  onOpenLesson,
  onBack,
}: {
  courseId: string;
  onOpenLesson: (lessonId: string) => void;
  onBack: () => void;
}) {
  const { data, isLoading, isError } = useAcademyCourse(courseId);
  const { dict } = useI18n();
  const V = dict.academy.courses;
  const S = dict.academy.shared;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{V.loadError}</p>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {V.backToCatalog}
        </Button>
      </div>
    );
  }

  const { course, lessons, objectives } = data;
  const hue = hueOf(data.category.id);

  return (
    <div className="space-y-5" data-testid="academy-course-detail">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {V.allCourses}
      </button>

      <header className="rounded-lg border bg-surface px-5 py-4" data-testid="academy-course-header">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border"
                style={{ color: hue, backgroundColor: tint(hue, 12), borderColor: tint(hue, 28) }}
              >
                <CategoryIcon icon={data.category.icon} />
              </span>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{data.category.name}</p>
              <LevelBadge level={course.level} />
              {course.completed ? <Badge variant="outline" className="gap-1 border-profit/40 text-profit"><CircleCheck className="size-3" /> {V.completedBadge}</Badge> : null}
            </div>
            <h2 className="mt-1.5 font-heading text-xl font-bold tracking-tight sm:text-2xl">{course.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{course.description}</p>
            <div className="mt-3 max-w-md">
              <ProgressBar percent={course.progress} hue={hue} label={`${course.title}${S.progressSuffix}`} />
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
              {course.completedLessons}/{course.lessonCount}
              {V.lessonsSuffix} · ~{course.estimatedMinutes}
              {S.minSuffix}
            </p>
          </div>
          {/* Concept vignette at its natural 32:15 ratio - nothing cropped */}
          <span className="hidden shrink-0 md:block">
            <CourseArt
              courseId={course.id}
              categoryId={data.category.id}
              className="aspect-[32/15] w-72 rounded-md border border-border"
            />
          </span>
        </div>
      </header>

      <section aria-label={V.objectivesAria} className="rounded-lg border px-4 py-3.5" style={{ borderColor: tint(hue, 32), backgroundColor: tint(hue, 6) }}>
        <p className="ledger-label" style={{ color: hue }}>{V.objectivesTitle}</p>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-sm leading-relaxed sm:grid-cols-2">
          {objectives.map((objective, index) => (
            <li key={index} className="flex gap-2">
              <CircleCheck className="mt-0.5 size-3.5 shrink-0" style={{ color: hue }} aria-hidden="true" />
              <span>{objective}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={V.lessonsAria}>
        <AcademySectionTitle className="mb-2">{V.lessonsTitle}</AcademySectionTitle>
        <ol className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-lesson-list">
          {lessons.map((lesson) => {
            const nextLesson = lessons.find((entry) => !entry.completed);
            const isNext = nextLesson?.id === lesson.id;
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => onOpenLesson(lesson.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                  data-testid={`academy-lesson-item-${lesson.id}`}
                >
                  <span
                    className={
                      lesson.completed
                        ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-profit/15 text-profit"
                        : isNext
                          ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
                          : "flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] tabular-nums text-muted-foreground"
                    }
                  >
                    {lesson.completed ? <CircleCheck className="size-3.5" aria-hidden="true" /> : lesson.order + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{lesson.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{lesson.summary}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {lesson.minutes}
                    {S.minSuffix}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {course.quizId ? (
        <CourseQuizSection quizId={course.quizId} />
      ) : null}
    </div>
  );
}

function CourseQuizSection({ quizId }: { quizId: string }) {
  const [open, setOpen] = React.useState(false);
  const { dict } = useI18n();
  const V = dict.academy.courses;
  return (
    <section className="rounded-lg border border-border bg-surface-raised px-4 py-3.5" aria-label={V.quizAria}>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">{V.quizTitle}</p>
          <p className="text-xs text-muted-foreground">{V.quizDesc}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((prev) => !prev)} data-testid="academy-course-quiz-toggle">
          {open ? V.hideQuiz : V.takeQuiz}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 border-t border-border pt-3">
          <CourseQuiz quizId={quizId} />
        </div>
      ) : null}
    </section>
  );
}
