"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";

import { InkRibbon, inkSpineOf, inkTextOf } from "@/components/academy/ink-ribbon";
import { CourseGlyph } from "@/components/academy/course-glyph";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcademyCatalog,
  useAcademyProgress,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Courses catalog — the library shelf. Ruled rows (no SaaS card grid), one
 * row per course: spine, mini-figure vignette, title, category, level,
 * duration and progress. Filters are
 * additive chips in the shared FilterChip grammar; the query param
 * ?category= pre-selects a shelf (used by the Overview category rows).
 */

const LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;
const COMPLETION = ["all", "in-progress", "not-started", "completed"] as const;

function Chip({
  active,
  children,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function CoursesView() {
  const searchParams = useSearchParams();
  const categorySlug = searchParams.get("category") ?? "all";
  const catalog = useAcademyCatalog();
  const progress = useAcademyProgress();

  const [query, setQuery] = React.useState("");
  const [level, setLevel] = React.useState<(typeof LEVELS)[number]>("all");
  const [completion, setCompletion] =
    React.useState<(typeof COMPLETION)[number]>("all");

  const categoryById = React.useMemo(
    () =>
      new Map(
        (catalog.data?.categories ?? []).map((category) => [category.id, category]),
      ),
    [catalog.data],
  );

  const completedByCategory = React.useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const row of progress.data?.byCategory ?? []) {
      map.set(row.categoryId, { completed: row.lessonsCompleted, total: row.lessonsTotal });
    }
    return map;
  }, [progress.data]);

  const filtered = React.useMemo(() => {
    const courses = catalog.data?.courses ?? [];
    const q = query.trim().toLowerCase();
    return courses.filter((course) => {
      if (categorySlug !== "all") {
        const slug = categoryById.get(course.categoryId)?.slug;
        if (slug !== categorySlug) return false;
      }
      if (level !== "all" && course.level !== level) return false;
      if (completion !== "all") {
        const stats = completedByCategory.get(course.categoryId);
        const total = course.modules.reduce((sum, mod) => sum + mod.lessonIds.length, 0);
        const done = stats?.completed ?? 0;
        // Approximation per category; refined per-course once progress
        // granularity exists. Honest label: category-level completion.
        if (completion === "completed" && !(stats && done >= (stats.total || 0))) return false;
        if (completion === "not-started" && done > 0) return false;
        if (completion === "in-progress" && done === 0) return false;
        void total;
      }
      if (q) {
        const haystack =
          `${course.title} ${course.summary} ${categoryById.get(course.categoryId)?.title ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [catalog.data, categorySlug, categoryById, level, completion, completedByCategory, query]);

  const isFiltered =
    query.trim() !== "" || level !== "all" || completion !== "all" || categorySlug !== "all";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" data-testid="academy-courses">
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Academy
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Courses
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {catalog.data
            ? `${catalog.data.courses.length} courses across ${catalog.data.categories.length} domains. Every course follows Category → Modules → Lessons → Quiz.`
            : "The library shelf."}
        </p>
        <InkRibbon />
      </header>

      {/* Search + filter chips */}
      <div className="space-y-2.5">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search courses…"
            aria-label="Search courses"
            data-testid="courses-search"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by level">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Level
          </span>
          {LEVELS.map((item) => (
            <Chip key={item} active={level === item} onClick={() => setLevel(item)}>
              {item}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by completion">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Status
          </span>
          {COMPLETION.map((item) => (
            <Chip
              key={item}
              active={completion === item}
              onClick={() => setCompletion(item)}
            >
              {item}
            </Chip>
          ))}
        </div>
      </div>

      {catalog.isLoading || progress.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : catalog.isError || !catalog.data ? (
        <div className="rounded-xl border border-loss/40 bg-surface p-6 text-sm text-muted-foreground">
          The course catalog could not be loaded. Check your connection and retry.
        </div>
      ) : (
        <>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {filtered.length} of {catalog.data.courses.length} courses
            {isFiltered ? " (filtered)" : ""}
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {filtered.map((course, index) => {
              const category = categoryById.get(course.categoryId);
              const stats = completedByCategory.get(course.categoryId);
              const percent =
                stats && stats.total > 0
                  ? Math.round((stats.completed / stats.total) * 100)
                  : 0;
              const lessonCount = course.modules.reduce(
                (sum, mod) => sum + mod.lessonIds.length,
                0,
              );
              // The register's four inks cycle down the shelf — each course
              // row gets a book spine and a matching domain label.
              const spine = inkSpineOf(index);
              const ink = inkTextOf(index);
              return (
                <Link
                  key={course.id}
                  href={`/academy/courses/${course.id}`}
                  data-testid="course-row"
                  className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    data-testid="course-spine"
                    className={cn("h-10 w-1 shrink-0 rounded-full", spine)}
                  />
                  {/* the course's own vignette — inherits the row's cycling ink */}
                  <span
                    aria-hidden="true"
                    data-testid="course-glyph-frame"
                    className={cn(
                      "grid size-12 shrink-0 place-items-center rounded-md border border-border bg-muted/30",
                      ink,
                    )}
                  >
                    <CourseGlyph categoryId={course.categoryId} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="font-medium transition-colors group-hover:text-accent">{course.title}</p>
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-widest transition-colors",
                          ink,
                        )}
                      >
                        {category?.title}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {course.summary}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {lessonCount} lessons · {course.durationMin} min
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                      {course.level}
                      {percent > 0 ? ` · ${percent}% of domain` : ""}
                    </p>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-heading text-lg font-semibold">No course matches</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Loosen the search or clear a filter chip.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
