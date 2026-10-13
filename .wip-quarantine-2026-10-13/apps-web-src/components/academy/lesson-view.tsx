"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LessonFigure } from "@/components/academy/figures";
import { cn } from "@/lib/utils";
import {
  useAcademyLesson,
  useCompleteAcademyLesson,
  useToggleAcademyBookmark,
} from "@/lib/api/queries";

/**
 * Lesson reader — the study desk. Objectives first (the contract), then the
 * concept with its figure, takeaways and mistakes as ruled blocks, and the
 * completion action that threads progress back through the whole Academy.
 * Honest copy: lessons teach probabilistic reading, never promises.
 */

export function LessonView({ lessonId }: { lessonId: string }) {
  const lesson = useAcademyLesson(lessonId);
  const complete = useCompleteAcademyLesson();
  const bookmark = useToggleAcademyBookmark();

  if (lesson.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5" aria-busy="true">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-9 w-96" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (lesson.isError || !lesson.data) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-heading text-lg font-semibold">
            This lesson could not be loaded.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have moved — go back to the course and pick it from the list.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/academy/courses">Back to Courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  const data = lesson.data;
  const firstFigureSlot = 1; // figure lands after the first concept section

  const onComplete = () => {
    complete.mutate(data.id, {
      onSuccess: (result) => {
        toast.success(
          `Lesson completed — ${result.lessonsCompleted} total, ${result.streakDays}-day streak`,
        );
      },
      onError: () => toast.error("The completion could not be saved"),
    });
  };

  const onBookmark = () => {
    bookmark.mutate(data.id, {
      onSuccess: (result) => {
        toast.success(
          result.bookmarked
            ? "Saved to bookmarks — find it on your Academy shelf"
            : "Removed from bookmarks",
        );
      },
      onError: () => toast.error("The bookmark could not be saved"),
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" data-testid="academy-lesson">
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          <Link href="/academy" className="hover:text-foreground">
            Academy
          </Link>
          {" / "}
          <Link
            href={`/academy/courses/${data.courseId}`}
            className="hover:text-foreground"
          >
            {data.courseTitle}
          </Link>
          {" / "}
          {data.moduleTitle}
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {data.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {data.durationMin} min read
          </span>
          {data.completed ? (
            <span
              data-testid="lesson-completed-badge"
              className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-profit"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Lesson completed
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <Circle className="size-4" aria-hidden="true" />
              Not completed yet
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBookmark}
            disabled={bookmark.isPending}
            aria-pressed={data.bookmarked}
            aria-label={
              data.bookmarked
                ? "Remove this lesson from bookmarks"
                : "Save this lesson to bookmarks"
            }
            data-testid="lesson-bookmark"
            className={cn(
              "ml-auto gap-1.5 font-mono text-[11px] uppercase tracking-widest",
              data.bookmarked
                ? "text-warning hover:text-warning"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Bookmark
              className="size-4"
              fill={data.bookmarked ? "currentColor" : "none"}
              aria-hidden="true"
            />
            {data.bookmarked ? "Saved" : "Save"}
          </Button>
        </div>
      </header>

      {/* Learning objectives — the contract */}
      <section
        aria-label="Learning objectives"
        className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      >
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <ListChecks className="size-4 text-accent" aria-hidden="true" />
          After this lesson, you will be able to
        </p>
        <ul className="mt-3 space-y-2">
          {data.objectives.map((objective) => (
            <li key={objective} className="flex items-start gap-2 text-sm">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span>{objective}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Concept sections + figure */}
      <article className="space-y-6">
        {data.sections.map((section, index) => (
          <React.Fragment key={section.heading}>
            <section aria-label={section.heading}>
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                {section.heading}
              </h2>
              <div className="mt-2 space-y-3">
                {section.paragraphs.map((paragraph, pIndex) => (
                  <p
                    key={pIndex}
                    className="text-sm leading-relaxed text-foreground/90"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.bullets?.length ? (
                <ul className="mt-3 space-y-1.5 rounded-lg border border-border bg-surface p-3.5">
                  {section.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 font-mono text-xs leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            {index === firstFigureSlot - 1 && data.figure ? (
              <LessonFigure figure={data.figure} />
            ) : null}
            {/* Extra figures land one per section, in order. */}
            {index >= 1 && data.figures?.[index - 1] ? (
              <LessonFigure figure={data.figures[index - 1]} />
            ) : null}
          </React.Fragment>
        ))}
        {data.sections.length < firstFigureSlot && data.figure ? (
          <LessonFigure figure={data.figure} />
        ) : null}
        {/* Leftover figures when the lesson has fewer sections than figures. */}
        {data.figures && data.figures.length > Math.max(data.sections.length - 1, 0)
          ? data.figures
              .slice(Math.max(data.sections.length - 1, 0))
              .map((figure, figureIndex) => (
                <LessonFigure
                  key={`extra-figure-${figureIndex}`}
                  figure={figure}
                />
              ))
          : null}
      </article>

      {/* Key takeaways */}
      <section
        aria-label="Key takeaways"
        className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      >
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          Key takeaways
        </p>
        <ul className="mt-3 space-y-2">
          {data.takeaways.map((takeaway) => (
            <li key={takeaway} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground"
                aria-hidden="true"
              />
              <span className="font-medium">{takeaway}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Common mistakes */}
      <section
        aria-label="Common mistakes"
        className="rounded-xl border border-loss/40 bg-surface p-4 sm:p-5"
      >
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-loss">
          <ShieldAlert className="size-4" aria-hidden="true" />
          Common mistakes
        </p>
        <ul className="mt-3 space-y-2">
          {data.mistakes.map((mistake) => (
            <li key={mistake} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1.5 size-1 shrink-0 rounded-full bg-loss"
                aria-hidden="true"
              />
              <span>{mistake}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Completion + navigation */}
      <footer className="space-y-4 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {data.completed ? (
            <p
              data-testid="lesson-done-note"
              className="flex items-center gap-2 text-sm font-medium text-profit"
            >
              <CheckCircle2 className="size-5" aria-hidden="true" />
              Done — the journal counts it toward your streak.
            </p>
          ) : (
            <Button
              onClick={onComplete}
              disabled={complete.isPending}
              data-testid="lesson-complete-btn"
            >
              {complete.isPending ? "Saving…" : "Mark lesson complete"}
            </Button>
          )}
          {data.nextLessonId ? (
            <Button asChild variant="outline">
              <Link href={`/academy/courses/${data.courseId}/${data.nextLessonId}`}>
                Next lesson
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/academy/courses/${data.courseId}`}>
                Back to the course
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>

        <nav
          aria-label="Lesson navigation"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {data.prevLessonId ? (
            <Link
              href={`/academy/courses/${data.courseId}/${data.prevLessonId}`}
              data-testid="lesson-nav-prev"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{data.prevLessonTitle ?? "Previous lesson"}</span>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {data.nextLessonId ? (
            <Link
              href={`/academy/courses/${data.courseId}/${data.nextLessonId}`}
              data-testid="lesson-nav-next"
              className="flex items-center justify-end gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-right text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:col-start-2"
            >
              <span className="min-w-0 flex-1 truncate">{data.nextLessonTitle ?? "Next lesson"}</span>
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      </footer>
    </div>
  );
}
