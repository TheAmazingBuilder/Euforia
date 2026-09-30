"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, CircleCheck, Search, X } from "lucide-react";

import type { AcademyCourseCard, AcademyLevel } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademySectionTitle, CategoryIcon, LevelBadge, ProgressBar } from "@/components/academy/academy-shared";
import { LessonReader } from "@/components/academy/academy-lesson";
import { CourseQuiz } from "@/components/academy/academy-lesson";
import {
  useAcademyCatalog,
  useAcademyCourse,
  useAcademySearch,
} from "@/lib/api/queries";

/**
 * Courses panel — three stacked views: the catalog (12 categories, filters,
 * full-text search across courses/lessons/glossary), the course detail
 * (objectives + lesson list + quiz) and the lesson reader. Views are
 * deep-linkable via ?course= and ?lesson=.
 */

const LEVELS: (AcademyLevel | "ALL")[] = ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"];
const STATUS = ["ALL", "IN_PROGRESS", "COMPLETED", "NOT_STARTED"] as const;

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

  // Debounce the server search (300ms) — catalog filtering stays client-side.
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
            placeholder="Search courses, lessons, concepts… (e.g. breakout, drawdown)"
            className="pl-9 pr-8"
            aria-label="Search the Academy"
            data-testid="academy-search-input"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {query === "" ? (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="academy-filters">
            <FilterChip active={category === "ALL"} onClick={() => setCategory("ALL")}>
              All categories
            </FilterChip>
            <FilterChip active={level === "ALL"} onClick={() => setLevel("ALL")}>
              All levels
            </FilterChip>
            {LEVELS.filter((l) => l !== "ALL").map((l) => (
              <FilterChip key={l} active={level === l} onClick={() => setLevel(level === l ? "ALL" : l)}>
                {l === "BEGINNER" ? "Beginner" : l === "INTERMEDIATE" ? "Intermediate" : "Advanced"}
              </FilterChip>
            ))}
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
            {STATUS.map((s) => (
              <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                {s === "ALL" ? "Any status" : s === "IN_PROGRESS" ? "In progress" : s === "COMPLETED" ? "Completed" : "Not started"}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      {query !== "" ? (
        <SearchResults query={query} onOpenCourse={onOpenCourse} onOpenLesson={onOpenLesson} />
      ) : (
        <CatalogGrid category={category} level={level} status={status} onOpenCourse={onOpenCourse} />
      )}
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
  onOpenCourse,
}: {
  category: string;
  level: AcademyLevel | "ALL";
  status: (typeof STATUS)[number];
  onOpenCourse: (courseId: string) => void;
}) {
  const { data: catalog, isLoading } = useAcademyCatalog();

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
    return true;
  });

  const grouped = catalog.categories
    .filter((cat) => category === "ALL" || cat.id === category)
    .map((cat) => ({ category: cat, courses: courses.filter((course) => course.categoryId === cat.id) }))
    .filter((group) => group.courses.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No course matches these filters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ category: cat, courses: catCourses }) => (
        <section key={cat.id} aria-label={cat.name}>
          <div className="mb-2 flex items-center gap-2">
            <CategoryIcon icon={cat.icon} className="text-accent" />
            <h3 className="font-heading text-base font-semibold text-foreground">{cat.name}</h3>
            <LevelBadge level={cat.level} />
          </div>
          <p className="mb-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">{cat.description}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {catCourses.map((course) => (
              <CourseCard key={course.id} course={course} onOpen={() => onOpenCourse(course.id)} />
            ))}
          </div>
          <p className="sr-only">{categoryById.get(cat.id)?.name}</p>
        </section>
      ))}
    </div>
  );
}

function CourseCard({ course, onOpen }: { course: AcademyCourseCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full flex-col rounded-lg border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:bg-muted"
      data-testid={`academy-course-card-${course.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-heading text-sm font-semibold leading-snug text-foreground">{course.title}</h4>
        {course.completed ? (
          <CircleCheck className="size-4 shrink-0 text-profit" aria-label="Completed" />
        ) : (
          <LevelBadge level={course.level} />
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">{course.description}</p>
      <div className="mt-3">
        {course.completedLessons > 0 || course.completed ? (
          <ProgressBar percent={course.progress} label={`${course.title} progress`} testid={`academy-course-progress-${course.id}`} />
        ) : null}
      </div>
      <p className="mt-2 flex items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>
          {course.completedLessons}/{course.lessonCount} lessons
        </span>
        <span aria-hidden="true">·</span>
        <span>~{course.estimatedMinutes} min</span>
        {course.quizId ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{course.quizBestScore !== null ? `quiz ${Math.round((course.quizBestScore / course.lessonCount) * 100)}%` : "quiz"}</span>
          </>
        ) : null}
      </p>
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
          Nothing found for “{query}”. Try a broader term — the glossary also matches definitions.
        </div>
      ) : null}

      {data.courses.length > 0 ? (
        <section aria-label="Matching courses">
          <AcademySectionTitle className="mb-2">Courses</AcademySectionTitle>
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
        <section aria-label="Matching lessons">
          <AcademySectionTitle className="mb-2">Lessons</AcademySectionTitle>
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
        <section aria-label="Matching glossary terms">
          <AcademySectionTitle className="mb-2">Glossary</AcademySectionTitle>
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
        <p className="text-sm text-muted-foreground">This course could not be loaded.</p>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to catalog
        </Button>
      </div>
    );
  }

  const { course, lessons, objectives } = data;

  return (
    <div className="space-y-5" data-testid="academy-course-detail">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All courses
      </button>

      <header className="rounded-lg border bg-surface px-5 py-4" data-testid="academy-course-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CategoryIcon icon={data.category.icon} className="text-accent" />
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{data.category.name}</p>
              <LevelBadge level={course.level} />
              {course.completed ? <Badge variant="outline" className="gap-1 border-profit/40 text-profit"><CircleCheck className="size-3" /> Completed</Badge> : null}
            </div>
            <h2 className="mt-1.5 font-heading text-xl font-bold tracking-tight sm:text-2xl">{course.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{course.description}</p>
          </div>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {course.completedLessons}/{course.lessonCount} lessons · ~{course.estimatedMinutes} min
          </p>
        </div>
        <div className="mt-3 max-w-md">
          <ProgressBar percent={course.progress} label={`${course.title} progress`} />
        </div>
      </header>

      <section aria-label="Course objectives" className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3.5">
        <p className="ledger-label text-accent">After this course, you will be able to</p>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-sm leading-relaxed sm:grid-cols-2">
          {objectives.map((objective, index) => (
            <li key={index} className="flex gap-2">
              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span>{objective}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Lessons">
        <AcademySectionTitle className="mb-2">Lessons</AcademySectionTitle>
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
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{lesson.minutes} min</span>
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
  return (
    <section className="rounded-lg border border-border bg-surface-raised px-4 py-3.5" aria-label="Course quiz">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">Course quiz</p>
          <p className="text-xs text-muted-foreground">
            Check your understanding — a few questions, graded with explanations. Only your best score is kept.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((prev) => !prev)} data-testid="academy-course-quiz-toggle">
          {open ? "Hide quiz" : "Take the quiz"}
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
