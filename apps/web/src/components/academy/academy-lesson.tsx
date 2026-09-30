"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  Clock,
  ListChecks,
  RotateCcw,
  Sigma,
} from "lucide-react";

import type { AcademyQuizResultResponse } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LessonBlocks } from "@/components/academy/lesson-blocks";
import {
  useAcademyBookmarks,
  useAcademyLesson,
  useAcademyQuiz,
  useCompleteLesson,
  useSubmitQuiz,
  useToggleBookmark,
} from "@/lib/api/queries";

/**
 * Lesson reader — breadcrumb, objectives, the block document (text, callouts,
 * tables, SVG visuals), takeaways, completion, bookmarking and prev/next.
 * The last lesson of a course also exposes its quiz inline.
 */

export function LessonReader({
  lessonId,
  onOpenLesson,
  onBack,
}: {
  lessonId: string;
  onOpenLesson: (lessonId: string) => void;
  onBack: () => void;
}) {
  const { data: lesson, isLoading, isError } = useAcademyLesson(lessonId);
  const complete = useCompleteLesson();
  const toggleBookmark = useToggleBookmark();
  // Derived from the server state — no local mirror to keep in sync.
  const { data: bookmarksData } = useAcademyBookmarks();
  const bookmarked = bookmarksData?.bookmarks.some((mark) => mark.kind === "LESSON" && mark.refId === lessonId) ?? false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }
  if (isError || !lesson) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">This lesson could not be loaded.</p>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Button>
      </div>
    );
  }

  const isLastLesson = lesson.position === lesson.lessonCount;
  const objectivesBlock = lesson.blocks.find((block) => block.kind === "objectives");
  const bodyBlocks = lesson.blocks.filter((block) => block.kind !== "objectives");

  return (
    <article className="space-y-5" data-testid="academy-lesson-reader" aria-label={lesson.title}>
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <button type="button" onClick={onBack} className="transition-colors hover:text-foreground">
          {lesson.courseTitle}
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-mono tabular-nums">
          Lesson {lesson.position}/{lesson.lessonCount}
        </span>
      </div>

      {/* Title band */}
      <header className="rounded-lg border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">{lesson.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{lesson.summary}</p>
            <p className="mt-2 flex items-center gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                {lesson.minutes} min
              </span>
              {lesson.completed ? (
                <span className="inline-flex items-center gap-1 text-profit">
                  <CircleCheck className="size-3" aria-hidden="true" />
                  completed
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleBookmark.mutate({ kind: "LESSON", refId: lesson.id })}
            className={
              bookmarked
                ? "inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent"
                : "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            }
            aria-pressed={bookmarked}
            data-testid="academy-lesson-bookmark"
          >
            {bookmarked ? <BookmarkCheck className="size-3.5" aria-hidden="true" /> : <Bookmark className="size-3.5" aria-hidden="true" />}
            {bookmarked ? "Bookmarked" : "Bookmark"}
          </button>
        </div>
      </header>

      {/* Objectives (if authored) */}
      {objectivesBlock?.kind === "objectives" ? <LessonBlocks blocks={[objectivesBlock]} /> : null}

      {/* Body */}
      <LessonBlocks blocks={bodyBlocks} />

      {/* Takeaways + complete */}
      <footer className="space-y-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => complete.mutate(lesson.id)}
            disabled={complete.isPending || lesson.completed}
            className="gap-1.5"
            data-testid="academy-lesson-complete"
          >
            <CircleCheck className="size-4" aria-hidden="true" />
            {lesson.completed ? "Lesson completed" : "Mark lesson complete"}
          </Button>
          {lesson.completed ? (
            <Button variant="outline" className="gap-1.5" onClick={() => lesson.nextLessonId && onOpenLesson(lesson.nextLessonId)} disabled={!lesson.nextLessonId}>
              Next lesson
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" disabled={!lesson.prevLessonId} onClick={() => lesson.prevLessonId && onOpenLesson(lesson.prevLessonId)}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Previous
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" disabled={!lesson.nextLessonId} onClick={() => lesson.nextLessonId && onOpenLesson(lesson.nextLessonId)}>
            Next
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Course quiz — offered inline at the end of the course */}
        {isLastLesson && lesson.quizId ? (
          <InlineQuizTeaser quizId={lesson.quizId} onBack={onBack} />
        ) : null}
      </footer>
    </article>
  );
}

// ── Inline quiz (course-level, rendered after the last lesson) ──────────────

function InlineQuizTeaser({ quizId, onBack }: { quizId: string; onBack: () => void }) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <section className="flex flex-col items-start justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3.5 sm:flex-row sm:items-center">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ListChecks className="size-4 text-accent" aria-hidden="true" />
            Course quiz available
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A few questions with explanations — graded server-side, only your best score is kept.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} data-testid="academy-quiz-open">
          Start quiz
        </Button>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-4" aria-label="Course quiz">
      <CourseQuiz quizId={quizId} onDone={() => setOpen(false)} />
      <div className="mt-3 border-t border-border pt-3">
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to course
        </Button>
      </div>
    </section>
  );
}

export function CourseQuiz({ quizId, onDone }: { quizId: string; onDone?: () => void }) {
  const quizQuery = useAcademyQuiz(quizId);
  const submit = useSubmitQuiz(quizId);
  // Answers start empty as soon as the quiz loads — no effect needed.
  const [answers, setAnswers] = React.useState<Record<string, number | boolean | null>>({});
  const [result, setResult] = React.useState<AcademyQuizResultResponse | null>(null);

  const quiz = quizQuery.data;

  const retake = () => {
    setAnswers({});
    setResult(null);
  };

  if (quizQuery.isLoading || !quiz) return <Skeleton className="h-48 rounded-lg" />;

  if (result) {
    return (
      <div data-testid="academy-quiz-result">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-heading text-lg font-semibold">
              {result.score}/{result.total} correct
            </p>
            <p className="text-xs text-muted-foreground">
              {result.passed
                ? "Perfect score — the concept is yours."
                : result.previousBest !== null
                  ? `Previous best: ${result.previousBest}/${result.total}. Only the best score is kept.`
                  : "Review the explanations, then retake — only the best score is kept."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={retake}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Retake
            </Button>
            {onDone ? (
              <Button size="sm" variant="ghost" onClick={onDone}>
                Close
              </Button>
            ) : null}
          </div>
        </div>
        <ul className="mt-4 space-y-3">
          {result.results.map((questionResult, index) => {
            const question = quiz.questions.find((q) => q.id === questionResult.questionId);
            return (
              <li key={questionResult.questionId} className="rounded-md border border-border px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">
                    <span className="mr-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    {question?.prompt}
                  </p>
                  <span className={questionResult.correct ? "stamp stamp-win shrink-0 text-[10px]" : "stamp stamp-loss shrink-0 text-[10px]"} style={{ transform: "rotate(-1deg)" }}>
                    {questionResult.correct ? "correct" : "missed"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{questionResult.explanation}</p>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const answeredCount = quiz.questions.filter((question) => answers[question.id] !== undefined && answers[question.id] !== null).length;

  return (
    <div data-testid="academy-quiz">
      <p className="ledger-label">
        {quiz.courseTitle} — quiz · {answeredCount}/{quiz.questions.length} answered
      </p>
              <ol className="mt-3 space-y-5">
        {quiz.questions.map((question, index) => {
          const given = answers[question.id] ?? null;
          return (
            <li key={question.id}>
              <p className="text-sm font-medium leading-snug">
                <span className="mr-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                {question.prompt}
              </p>
              <div className="mt-2 space-y-1.5">
                {question.kind === "TF" ? (
                  <div className="flex gap-2">
                    {[true, false].map((value) => (
                      <QuizChoice key={String(value)} active={given === value} onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: value }))}>
                        {value ? "True" : "False"}
                      </QuizChoice>
                    ))}
                  </div>
                ) : question.options ? (
                  <div className="space-y-1.5">
                    {question.options.map((option, optionIndex) => (
                      <QuizChoice
                        key={optionIndex}
                        active={given === optionIndex}
                        onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
                      >
                        <span className="mr-2 font-mono text-[11px] text-muted-foreground">{"ABCD"[optionIndex]}</span>
                        {option}
                      </QuizChoice>
                    ))}
                  </div>
                ) : question.kind === "NUMERIC" ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    onChange={(event) => {
                      const value = event.target.value === "" ? null : Number(event.target.value);
                      setAnswers((prev) => ({ ...prev, [question.id]: value }));
                    }}
                    className="w-40 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={question.prompt}
                    placeholder={question.unit}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={submit.isPending || answeredCount < quiz.questions.length}
          onClick={() =>
            submit.mutate(
              { answers: quiz.questions.map((question) => ({ questionId: question.id, value: answers[question.id] ?? null })) },
              { onSuccess: (result) => setResult(result) },
            )
          }
          data-testid="academy-quiz-submit"
        >
          <Sigma className="size-3.5" aria-hidden="true" />
          Submit answers
        </Button>
        <p className="text-xs text-muted-foreground">Graded on the server — answers never leave the engine ungraded.</p>
      </div>
    </div>
  );
}

function QuizChoice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center rounded-md border px-3 py-2 text-left text-sm transition-colors",
        active ? "border-accent bg-accent/10 text-foreground" : "border-border bg-surface text-foreground/85 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
