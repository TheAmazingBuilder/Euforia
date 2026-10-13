"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ListChecks,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcademyQuiz,
  useSubmitAcademyQuizAttempt,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import type { AcademyQuizAttemptResponse } from "@cosmoz/shared";

/**
 * Course quiz — the Academy's grading desk. Questions arrive WITHOUT
 * answers; grading happens server-side and every question returns a
 * verdict with an explanation (including why the chosen wrong option is
 * wrong). One question per screen, submit at the end, honest scorecard.
 */

type Phase = "intro" | "active" | "result";

export function QuizView({ courseId }: { courseId: string }) {
  const quiz = useAcademyQuiz(courseId);
  const submit = useSubmitAcademyQuizAttempt(courseId);

  const [phase, setPhase] = React.useState<Phase>("intro");
  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [result, setResult] = React.useState<AcademyQuizAttemptResponse | null>(null);

  if (quiz.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (quiz.isError || !quiz.data) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
        No quiz is attached to this course yet.
      </div>
    );
  }

  const data = quiz.data;
  const questions = data.questions;
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const allAnswered = answeredCount === questions.length;
  const question = questions[current];
  const chosen = question ? answers[question.id] : undefined;
  const resultById = new Map(
    (result?.results ?? []).map((r) => [r.questionId, r]),
  );

  const start = () => {
    setAnswers({});
    setResult(null);
    setCurrent(0);
    setPhase("active");
  };

  const submitAttempt = () => {
    const payload = questions.map((q) => ({
      questionId: q.id,
      choiceIndex: answers[q.id] ?? 0,
    }));
    submit.mutate(payload, {
      onSuccess: (response) => {
        setResult(response);
        setPhase("result");
        toast.success(`Quiz graded — ${response.score}/${response.total} (${response.percent}%)`);
      },
      onError: () => toast.error("The quiz could not be graded"),
    });
  };

  return (
    <div className="space-y-5" data-testid="academy-quiz">
      <header className="space-y-1.5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Course quiz
        </p>
        <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
          {data.title}
        </h2>
      </header>

      {phase === "intro" ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <ListChecks className="size-4 text-accent" aria-hidden="true" />
            {questions.length} questions · graded server-side
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90">
            Multiple choice, true/false and scenario questions over the whole
            course. Every answer comes back with an explanation — including why
            the wrong ones are wrong. There is no passing gate: the score is
            feedback, not a verdict on you.
          </p>
          {data.attempts > 0 ? (
            <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
              Attempts: {data.attempts} · Best: {data.bestPercent}%
            </p>
          ) : null}
          <Button onClick={start} className="mt-4" data-testid="quiz-start">
            {data.attempts > 0 ? "Retake the quiz" : "Start the quiz"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </section>
      ) : null}

      {phase === "active" && question ? (
        <section className="rounded-xl border border-border bg-surface p-5" data-testid="quiz-active">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Question {current + 1} of {questions.length}
              {question.kind === "true-false" ? " · true/false" : question.kind === "scenario" ? " · scenario" : ""}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {answeredCount}/{questions.length} answered
            </p>
          </div>
          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${((current + 1) / questions.length) * 100}%` }}
            />
          </div>

          <fieldset className="mt-5">
            <legend className="font-heading text-base font-semibold leading-relaxed">
              {question.prompt}
            </legend>
            <div className="mt-4 space-y-2">
              {question.options.map((option, index) => {
                const selected = chosen === index;
                return (
                  <label
                    key={index}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors",
                      selected
                        ? "border-foreground bg-foreground/[0.04] text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      checked={selected}
                      onChange={() =>
                        setAnswers((prev) => ({ ...prev, [question.id]: index }))
                      }
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
                      aria-label={`Option ${index + 1}`}
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrent((value) => Math.max(0, value - 1))}
              disabled={current === 0}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
            {current < questions.length - 1 ? (
              <Button
                size="sm"
                onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}
                disabled={chosen === undefined}
              >
                Next
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={submitAttempt}
                disabled={!allAnswered || submit.isPending}
                data-testid="quiz-submit"
              >
                {submit.isPending ? "Grading…" : "Submit answers"}
              </Button>
            )}
          </div>
        </section>
      ) : null}

      {phase === "result" && result ? (
        <section className="space-y-4" data-testid="quiz-result">
          <div
            className={cn(
              "flex flex-wrap items-center gap-4 rounded-xl border p-5",
              result.percent >= 80
                ? "border-profit/40"
                : result.percent >= 50
                  ? "border-warning/40"
                  : "border-loss/40",
            )}
          >
            <Trophy
              className={cn(
                "size-8",
                result.percent >= 80 ? "text-profit" : result.percent >= 50 ? "text-warning" : "text-loss",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-2xl font-bold tabular-nums tracking-tight">
                {result.score} / {result.total}
                <span className="ml-2 font-mono text-sm font-semibold text-muted-foreground">
                  {result.percent}% · best {result.bestPercent}%
                </span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {result.percent >= 80
                  ? "Solid grade — reread the explanations below anyway; that is where the edge hides."
                  : result.percent >= 50
                    ? "Halfway there — the verdicts below point at exactly what to reread."
                    : "Back to the lessons listed below — then retake. The score is feedback, not a verdict."}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, index) => {
              const verdict = resultById.get(q.id);
              if (!verdict) return null;
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-start gap-2.5">
                    {verdict.correct ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-profit" aria-hidden="true" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {q.prompt}
                      </p>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                        Your answer:{" "}
                        <span className={verdict.correct ? "text-profit" : "text-loss"}>
                          {verdict.chosenIndex >= 0 ? q.options[verdict.chosenIndex] : "—"}
                        </span>
                        {!verdict.correct ? (
                          <>
                            {" · "}Correct:{" "}
                            <span className="text-profit">
                              {q.options[verdict.correctIndex]}
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs leading-relaxed text-foreground/90">
                        {verdict.explanation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={start} variant="outline">
              <RotateCcw className="size-4" aria-hidden="true" />
              Retake
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/academy/courses/${courseId}`}>Back to the course</Link>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
