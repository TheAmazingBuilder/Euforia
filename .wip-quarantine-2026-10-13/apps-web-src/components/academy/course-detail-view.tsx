"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Circle, ClipboardCheck, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademyCourse, useAcademyQuiz } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Course page — Category → Course → Modules → Lessons. Ruled module
 * sections with lesson rows (check icon, duration). The primary action is
 * always the next uncompleted lesson; the whole row set stays honest about
 * what is done and what is left.
 */

export function CourseDetailView({ courseId }: { courseId: string }) {
  const course = useAcademyCourse(courseId);

  if (course.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5" aria-busy="true">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (course.isError || !course.data) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-heading text-lg font-semibold">
            This course could not be loaded.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your connection and retry, or go back to the catalog.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/academy/courses">Back to Courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { course: outline, category, lessons, nextLessonId, completedCount } = course.data;
  const percent =
    lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;
  const allDone = nextLessonId === null;
  const ctaLessonId = nextLessonId ?? lessons[0]?.id ?? null;
  const lessonOrder = new Map(
    lessons.map((lesson, index) => [lesson.id, index + 1] as const),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6" data-testid="academy-course">
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          <Link href="/academy/courses" className="hover:text-foreground">
            Academy
          </Link>
          {" / "}
          <Link
            href={`/academy/courses?category=${category.slug}`}
            className="hover:text-foreground"
          >
            {category.title}
          </Link>
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {outline.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {outline.summary}
            </p>
          </div>
          {ctaLessonId ? (
            <Button asChild className="shrink-0">
              <Link href={`/academy/courses/${outline.id}/${ctaLessonId}`}>
                {allDone ? "Review from the start" : completedCount > 0 ? "Continue course" : "Start course"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {outline.level}
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {outline.durationMin} min
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" />
            {lessons.length} lessons
          </span>
          <div className="flex min-w-40 flex-1 items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${outline.title} progress`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  allDone ? "bg-profit" : "bg-foreground",
                )}
                style={{ width: `${Math.max(percent, allDone ? 100 : 2)}%` }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {completedCount}/{lessons.length}
            </span>
          </div>
        </div>
      </header>

      <div className="space-y-5">
        {outline.modules.map((mod) => (
          <section
            key={mod.id}
            aria-label={mod.title}
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <header className="border-b border-border px-4 py-3 sm:px-5">
              <h2 className="font-heading text-base font-semibold">{mod.title}</h2>
            </header>
            <div className="divide-y divide-border">
              {mod.lessonIds.map((lessonId) => {
                const lesson = lessons.find((item) => item.id === lessonId);
                if (!lesson) return null;
                const lessonIndex = lessonOrder.get(lesson.id) ?? 0;
                return (
                  <Link
                    key={lessonId}
                    href={`/academy/courses/${outline.id}/${lessonId}`}
                    data-testid="lesson-row"
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5"
                  >
                    {lesson.completed ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-profit"
                        aria-label="Completed"
                      />
                    ) : (
                      <Circle
                        className="size-4 shrink-0 text-muted-foreground/60"
                        aria-label="Not completed yet"
                      />
                    )}
                    <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
                      {String(lessonIndex).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {lesson.title}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {lesson.durationMin} min
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {/* Course quiz — graded server-side, best score remembered. */}
      {outline.quizId ? <QuizCard courseId={outline.id} /> : null}
    </div>
  );
}

function QuizCard({ courseId }: { courseId: string }) {
  const quiz = useAcademyQuiz(courseId);
  const stats = quiz.data
    ? `${quiz.data.questions.length} questions${
        quiz.data.attempts > 0
          ? ` · ${quiz.data.attempts} attempt${quiz.data.attempts === 1 ? "" : "s"} · best ${quiz.data.bestPercent}%`
          : ""
      }`
    : "Graded server-side with explanations.";
  return (
    <section
      aria-label="Course quiz"
      className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
      data-testid="quiz-card"
    >
      <ClipboardCheck className="size-5 shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-base font-semibold">Course quiz</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{stats}</p>
      </div>
      <Button asChild variant="outline">
        <Link href={`/academy/courses/${courseId}/quiz`}>
          {quiz.data && quiz.data.attempts > 0 ? "Retake the quiz" : "Take the quiz"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
