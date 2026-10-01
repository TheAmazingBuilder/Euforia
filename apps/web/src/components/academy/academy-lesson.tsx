"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  CircleHelp,
  Clock,
  ListChecks,
  ListTree,
  RotateCcw,
  Sigma,
  StickyNote,
} from "lucide-react";

import type { AcademyCheckpointResult, AcademyLessonNote, AcademyQuizQuestionPublic, AcademyQuizResultResponse } from "@cosmoz/shared";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { hueOf, tint } from "@/components/academy/academy-shared";
import { CourseArt } from "@/components/academy/academy-illustrations";
import { LessonBlock, LessonBlocks } from "@/components/academy/lesson-blocks";
import { useAcademyCatalog, useCreateNofyNote } from "@/lib/api/queries";
import {
  useAcademyBookmarks,
  useAcademyLesson,
  useAcademyQuiz,
  useCompleteLesson,
  useSaveLessonNote,
  useSubmitCheckpoint,
  useSubmitQuiz,
  useToggleBookmark,
} from "@/lib/api/queries";

/**
 * Lesson reader — breadcrumb, the course's concept vignette (the chart the
 * lesson teaches, in the track hue), objectives, the block document (text,
 * callouts, tables, SVG visuals), takeaways, completion, bookmarking and
 * prev/next. The last lesson of a course also exposes its quiz inline.
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
  const router = useRouter();
  const createNofyNote = useCreateNofyNote({
    onCreated: (note) => {
      toast.success("Note created in Nofy.");
      // SPA navigation keeps the MSW store (and this lesson's progress) alive.
      router.push(`/nofy?tab=notes&note=${note.id}`);
    },
  });
  // Derived from the server state — no local mirror to keep in sync.
  const { data: bookmarksData } = useAcademyBookmarks();
  const categoryName = useAcademyCatalog().data?.categories.find((cat) => cat.id === lesson?.categoryId)?.name;
  const bookmarked = bookmarksData?.bookmarks.some((mark) => mark.kind === "LESSON" && mark.refId === lessonId) ?? false;

  // Table of contents — derived from the block document (visual captions,
  // formulas, examples, tables, takeaways); text/list blocks stay unnamed.
  // Hooks stay above the early returns (rules-of-hooks).
  const tocEntries = React.useMemo(() => {
    if (!lesson) return [] as { id: string; label: string }[];
    const objectives = lesson.blocks.find((block) => block.kind === "objectives");
    const body = lesson.blocks.filter((block) => block.kind !== "objectives");
    const cp = lesson.checkpoint;
    const cpAfter = Math.max(2, Math.floor(body.length * 0.6));
    const isLast = lesson.position === lesson.lessonCount;
    const entries: { id: string; label: string }[] = [];
    if (objectives) entries.push({ id: "blk-objectives", label: "Objectives" });
    body.forEach((block, index) => {
      if (cp && index === cpAfter) entries.push({ id: "blk-checkpoint", label: "Quick check" });
      switch (block.kind) {
        case "callout":
          if (block.title) entries.push({ id: `blk-${index}`, label: block.title });
          break;
        case "formula":
          entries.push({ id: `blk-${index}`, label: block.label });
          break;
        case "example":
          entries.push({ id: `blk-${index}`, label: block.title });
          break;
        case "table":
          entries.push({ id: `blk-${index}`, label: "Reference table" });
          break;
        case "candles":
        case "structure":
        case "zones":
        case "risk":
          entries.push({ id: `blk-${index}`, label: block.caption ?? "Chart reading" });
          break;
        case "takeaways":
          entries.push({ id: `blk-${index}`, label: "Key takeaways" });
          break;
        default:
          break;
      }
    });
    if (cp && cpAfter >= body.length) entries.push({ id: "blk-checkpoint", label: "Quick check" });
    if (isLast && lesson.quizId) entries.push({ id: "blk-quiz", label: "Course quiz" });
    return entries;
  }, [lesson]);

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
  const hue = hueOf(lesson.categoryId);

  // Mid-lesson comprehension checkpoint (server-picked for long lessons).
  const checkpoint = lesson.checkpoint;
  const checkpointAfter = Math.max(2, Math.floor(bodyBlocks.length * 0.6));

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

      {/* Reading progress — thin ink bar that rides just under the topbar */}
      <ReadingProgress hue={hue} />

      {/* Title band — opens with the course concept vignette: side card on
          desktop, full-width banner on mobile (the chart this lesson teaches). */}
      <header className="overflow-hidden rounded-lg border bg-surface" data-testid="academy-lesson-header">
        <span className="relative block md:hidden">
          <CourseArt
            courseId={lesson.courseId}
            categoryId={lesson.categoryId}
            className="aspect-[32/13] w-full"
            testid="academy-lesson-vignette"
          />
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
            style={{ background: tint(hue, 45) }}
            aria-hidden="true"
          />
        </span>
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">{lesson.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{lesson.summary}</p>
            <p className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: hue }} />
                {categoryName ?? "Course"}
              </span>
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
          {/* Concept vignette at its natural ratio — nothing cropped (desktop) */}
          <span className="hidden shrink-0 md:block">
            <CourseArt
              courseId={lesson.courseId}
              categoryId={lesson.categoryId}
              className="aspect-[32/15] w-64 rounded-md border border-border"
              testid="academy-lesson-vignette"
            />
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                lesson &&
                createNofyNote.mutate({
                  title: `${lesson.title} — my notes`,
                  lessonRef: {
                    courseId: lesson.courseId,
                    courseTitle: lesson.courseTitle,
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                  },
                })
              }
              disabled={createNofyNote.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label="Take notes on this lesson in Nofy"
              data-testid="academy-lesson-take-notes"
            >
              <StickyNote className="size-3.5" aria-hidden="true" />
              Take notes
            </button>
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
        </div>
      </header>

      {/* Objectives (if authored) */}
      {objectivesBlock?.kind === "objectives" ? (
        <div id="blk-objectives" className="scroll-mt-24">
          <LessonBlocks blocks={[objectivesBlock]} />
        </div>
      ) : null}

      {/* Body with anchors + mid-lesson checkpoint; TOC rail on wide screens */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_205px] xl:gap-8">
        <div className="min-w-0 space-y-5">
          {bodyBlocks.map((block, index) => (
            <React.Fragment key={index}>
              <div id={`blk-${index}`} className="scroll-mt-24">
                <LessonBlock block={block} />
              </div>
              {checkpoint && index === checkpointAfter ? (
                <div id="blk-checkpoint" className="scroll-mt-24">
                  <CheckpointCard lessonId={lesson.id} question={checkpoint} hue={hue} />
                </div>
              ) : null}
            </React.Fragment>
          ))}
          {checkpoint && checkpointAfter >= bodyBlocks.length ? (
            <div id="blk-checkpoint" className="scroll-mt-24">
              <CheckpointCard lessonId={lesson.id} question={checkpoint} hue={hue} />
            </div>
          ) : null}
        </div>
        {tocEntries.length >= 3 ? <TocRail entries={tocEntries} hue={hue} title={lesson.title} /> : null}
      </div>

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

        {/* Personal notes — autosaved, lesson-scoped (keyed per lesson) */}
        <NotesPanel key={lesson.id} lessonId={lesson.id} note={lesson.note} />

        {/* Course quiz — offered inline at the end of the course */}
        {isLastLesson && lesson.quizId ? (
          <InlineQuizTeaser quizId={lesson.quizId} onBack={onBack} />
        ) : null}
      </footer>
    </article>
  );
}

// ── Reading progress (scroll-linked ink bar) ────────────────────────────────

function ReadingProgress({ hue }: { hue: string }) {
  const [percent, setPercent] = React.useState(0);

  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      const article = document.querySelector('[data-testid="academy-lesson-reader"]');
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const done = Math.min(Math.max(-rect.top, 0), Math.max(scrollable, 0));
      setPercent(scrollable <= 24 ? 100 : Math.round((done / scrollable) * 100));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="pointer-events-none sticky top-14 z-20 -mt-1 h-0.5" aria-hidden="true" data-testid="academy-reading-progress">
      <div className="h-full rounded-full transition-[width] duration-150 ease-out" style={{ width: `${percent}%`, backgroundColor: tint(hue, 75) }} />
    </div>
  );
}

// ── Table of contents rail (wide screens) ──────────────────────────────────

function TocRail({
  entries,
  hue,
  title,
}: {
  entries: { id: string; label: string }[];
  hue: string;
  title: string;
}) {
  const [activeId, setActiveId] = React.useState<string>(entries[0]?.id ?? "");

  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      let current = entries[0]?.id ?? "";
      for (const entry of entries) {
        const node = document.getElementById(entry.id);
        if (node && node.getBoundingClientRect().top <= 132) current = entry.id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [entries]);

  return (
    <aside className="hidden xl:block" aria-label="On this page" data-testid="academy-lesson-toc">
      <nav className="sticky top-20 space-y-0.5 border-l border-border pl-3">
        <p className="flex items-center gap-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <ListTree className="size-3" style={{ color: hue }} aria-hidden="true" />
          On this page
        </p>
        {entries.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "block truncate rounded-sm py-1 pl-2 text-xs leading-snug transition-colors -ml-3 border-l-2",
              activeId === entry.id
                ? "border-l-transparent font-medium text-foreground"
                : "border-l-transparent text-muted-foreground hover:text-foreground",
            )}
            style={activeId === entry.id ? { color: hue } : undefined}
            title={entry.label}
          >
            {entry.label}
          </a>
        ))}
        <p className="sr-only">Sections of {title}</p>
      </nav>
    </aside>
  );
}

// ── Inline checkpoint (mid-lesson quick check, graded server-side) ─────────

function CheckpointCard({
  lessonId,
  question,
  hue,
}: {
  lessonId: string;
  question: AcademyQuizQuestionPublic;
  hue: string;
}) {
  const submit = useSubmitCheckpoint(lessonId);
  const [value, setValue] = React.useState<number | boolean | null>(null);
  const [result, setResult] = React.useState<AcademyCheckpointResult | null>(null);

  return (
    <section
      className="rounded-lg border px-4 py-3.5"
      style={{ borderColor: tint(hue, 32), backgroundColor: tint(hue, 5) }}
      data-testid="academy-checkpoint"
      aria-label="Comprehension checkpoint"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: hue }}>
        <CircleHelp className="size-3.5" aria-hidden="true" />
        Quick check — do you have it?
      </p>
      <p className="mt-2 max-w-3xl text-sm font-medium leading-snug">{question.prompt}</p>

      {result ? (
        <div className="mt-2.5 flex items-start justify-between gap-3">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{result.explanation}</p>
          <span className={cn("stamp shrink-0 text-[10px]", result.correct ? "stamp-win" : "stamp-loss")} style={{ transform: "rotate(-1deg)" }}>
            {result.correct ? "correct" : "missed"}
          </span>
        </div>
      ) : (
        <div className="mt-2.5">
          {question.kind === "TF" ? (
            <div className="flex max-w-md gap-2">
              {[true, false].map((option) => (
                <QuizChoice key={String(option)} active={value === option} onClick={() => setValue(option)}>
                  {option ? "True" : "False"}
                </QuizChoice>
              ))}
            </div>
          ) : question.options ? (
            <div className="max-w-xl space-y-1.5">
              {question.options.map((option, optionIndex) => (
                <QuizChoice key={optionIndex} active={value === optionIndex} onClick={() => setValue(optionIndex)}>
                  <span className="mr-2 font-mono text-[11px] text-muted-foreground">{"ABCD"[optionIndex]}</span>
                  {option}
                </QuizChoice>
              ))}
            </div>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              onChange={(event) => setValue(event.target.value === "" ? null : Number(event.target.value))}
              className="w-40 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={question.prompt}
              placeholder={question.unit}
            />
          )}
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={value === null || submit.isPending}
              onClick={() =>
                submit.mutate(
                  { questionId: question.id, value },
                  { onSuccess: (graded) => setResult(graded) },
                )
              }
              data-testid="academy-checkpoint-submit"
            >
              <Sigma className="size-3.5" aria-hidden="true" />
              Check answer
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Personal lesson notes (autosaved) ──────────────────────────────────────

function NotesPanel({ lessonId, note }: { lessonId: string; note: AcademyLessonNote | null }) {
  const save = useSaveLessonNote(lessonId);
  const [open, setOpen] = React.useState(Boolean(note?.text));
  const [text, setText] = React.useState(note?.text ?? "");
  const [savedAt, setSavedAt] = React.useState<string | null>(note?.updatedAt ?? null);
  const timer = React.useRef<number | null>(null);
  // Local edits win: while a keystroke is pending save, an incoming server
  // note (query cache refresh) must not clobber the textarea.
  const dirtyRef = React.useRef(false);

  React.useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // Adopt the server note when it arrives/changes and nothing local is dirty.
  React.useEffect(() => {
    if (!dirtyRef.current) {
      setText(note?.text ?? "");
      setSavedAt(note?.updatedAt ?? null);
      setOpen((prev) => prev || Boolean(note?.text));
    }
  }, [note]);

  const onChange = (next: string) => {
    setText(next);
    dirtyRef.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      save.mutate(
        { text: next },
        {
          onSuccess: (response) => {
            dirtyRef.current = false;
            setSavedAt(response.note.updatedAt);
          },
        },
      );
    }, 900);
  };

  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3.5" aria-label="Your notes" data-testid="academy-lesson-notes">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground"
          aria-expanded={open}
          data-testid="academy-lesson-notes-toggle"
        >
          <StickyNote className="size-4 text-accent" aria-hidden="true" />
          Your notes
        </button>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" aria-live="polite">
          {save.isPending
            ? "Saving…"
            : savedAt
              ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Autosaves as you type"}
        </p>
      </div>
      {open ? (
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          placeholder="What clicked? What do you want to remember before the quiz — or before your next session?"
          className="mt-2.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Lesson notes"
          data-testid="academy-lesson-notes-input"
        />
      ) : null}
    </section>
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
