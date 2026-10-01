"use client";

import * as React from "react";
import { Brain, CheckCircle2, Layers, RotateCcw, Sparkles, X } from "lucide-react";

import type { AcademyFlashcard, AcademyScenario } from "@cosmoz/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { hueOf, tint } from "@/components/academy/academy-shared";
import { useAcademyFlashcards, useAcademyScenarios, useLogPractice, useReviewFlashcard } from "@/lib/api/queries";

/**
 * Daily review + decision training:
 * 1. Flashcards — Leitner spaced repetition over the glossary and every
 *    lesson's takeaways (10 cards/day; AGAIN/GOOD/EASY grading);
 * 2. Scenario Player — self-paced decision sequences with per-step feedback,
 *    every decision logged to the practice ledger.
 */

// ── 1. Flashcards ───────────────────────────────────────────────────────────

export function Flashcards() {
  const query = useAcademyFlashcards();
  const review = useReviewFlashcard();
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [graded, setGraded] = React.useState<string | null>(null);
  const [sessionDone, setSessionDone] = React.useState(false);

  const data = query.data;
  const card: AcademyFlashcard | undefined = data?.due[index];

  const grade = (value: "AGAIN" | "GOOD" | "EASY") => {
    if (!card) return;
    setGraded(value);
    review.mutate(
      { cardId: card.id, grade: value },
      {
        onSuccess: () => {
          window.setTimeout(() => {
            // Reset the card surface as we advance — no effect needed.
            setFlipped(false);
            setGraded(null);
            if (index + 1 >= (data?.due.length ?? 0)) setSessionDone(true);
            else setIndex((prev) => prev + 1);
          }, 420);
        },
      },
    );
  };

  return (
    <section aria-label="Flashcard review" className="rounded-lg border bg-surface px-4 py-4 sm:px-5" data-testid="academy-flashcards">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
          <Brain className="size-4 text-accent" aria-hidden="true" />
          Daily review — flashcards
        </h2>
        {data ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="academy-flashcards-counter">
            {sessionDone ? "session complete" : `${Math.min(index + 1, data.due.length)}/${data.due.length}`}
            {data.dueCount > data.due.length ? ` · ${data.dueCount} due today` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Spaced repetition over the glossary and every lesson takeaway — ten cards a day keeps recall honest.
      </p>

      {query.isLoading || !data ? (
        <Skeleton className="mt-3 h-44 w-full rounded-md" />
      ) : data.due.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing due right now — the deck is clear. Come back tomorrow.
        </div>
      ) : sessionDone ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-md border border-profit/40 bg-profit/5 px-4 py-6 text-center">
          <CheckCircle2 className="size-6 text-profit" aria-hidden="true" />
          <p className="text-sm font-medium">Session complete — {data.due.length} cards graded.</p>
          <p className="text-xs text-muted-foreground">Cards you marked AGAIN return tomorrow; GOOD and EASY drift further out.</p>
        </div>
      ) : card ? (
        <>
          <button
            type="button"
            onClick={() => setFlipped((prev) => !prev)}
            className="mt-3 flex min-h-44 w-full flex-col items-start justify-between rounded-md border border-border bg-surface-raised px-4 py-4 text-left transition-colors hover:bg-muted"
            aria-label={flipped ? "Show front of card" : "Reveal answer"}
            data-testid="academy-flashcard"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span
                className="rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  color: hueOf(card.categoryId),
                  backgroundColor: tint(hueOf(card.categoryId), 10),
                  borderColor: tint(hueOf(card.categoryId), 28),
                }}
              >
                {card.kind === "TERM" ? "Term" : "Takeaway"} · {card.source}
              </span>
              {card.extra ? (
                <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3" aria-hidden="true" />
                  free practice
                </span>
              ) : null}
            </span>
            <span className="mt-3 block w-full">
              {flipped ? (
                <>
                  <span className="ledger-label">Answer</span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-foreground" data-testid="academy-flashcard-back">
                    {card.back}
                  </span>
                </>
              ) : (
                <>
                  <span className="ledger-label">Prompt</span>
                  <span className="mt-1.5 block font-heading text-lg font-semibold text-foreground" data-testid="academy-flashcard-front">
                    {card.front}
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">Tap to reveal — recall first, then check.</span>
                </>
              )}
            </span>
          </button>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["AGAIN", "Again", "border-loss/50 bg-loss/10 text-loss hover:bg-loss/15"],
                ["GOOD", "Good", "border-border bg-surface text-foreground hover:bg-muted"],
                ["EASY", "Easy", "border-profit/50 bg-profit/10 text-profit hover:bg-profit/15"],
              ] as const
            ).map(([value, label, className]) => (
              <button
                key={value}
                type="button"
                disabled={!flipped || graded !== null || review.isPending}
                onClick={() => grade(value)}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  className,
                  graded === value && "ring-2 ring-ring",
                )}
                data-testid={`academy-flashcard-${value.toLowerCase()}`}
              >
                {label}
              </button>
            ))}
          </div>
          {!flipped ? <p className="mt-2 text-center text-[11px] text-muted-foreground">Grade buttons unlock after you reveal the answer.</p> : null}
        </>
      ) : null}
    </section>
  );
}

// ── 2. Scenario Player ─────────────────────────────────────────────────────

export function ScenarioPlayer() {
  const query = useAcademyScenarios();
  const logPractice = useLogPractice();
  const [scenarioId, setScenarioId] = React.useState<string | null>(null);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [choice, setChoice] = React.useState<string | null>(null);
  const [score, setScore] = React.useState(0);

  const scenarios = query.data?.scenarios ?? [];
  const scenario: AcademyScenario | undefined = scenarios.find((entry) => entry.id === scenarioId);
  const step = scenario?.steps[stepIndex];
  const finished = scenario !== undefined && stepIndex >= scenario.steps.length;

  const openScenario = (id: string) => {
    setScenarioId(id);
    setStepIndex(0);
    setChoice(null);
    setScore(0);
  };

  const choose = (optionId: string) => {
    if (!step || choice !== null) return;
    setChoice(optionId);
    const correct = optionId === step.correctOptionId;
    if (correct) setScore((prev) => prev + 1);
    logPractice.mutate({ drill: "SCENARIO", correct, refId: step.id });
  };

  return (
    <section aria-label="Scenario player" className="rounded-lg border bg-surface px-4 py-4 sm:px-5" data-testid="academy-scenarios">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Layers className="size-4 text-cat-strategies" aria-hidden="true" />
        Scenario player — what would you do?
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Step inside a market situation and choose the professional action. Every step gives feedback; every decision is logged.
      </p>

      {query.isLoading ? <Skeleton className="mt-3 h-40 w-full rounded-md" /> : null}

      {!scenario ? (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {scenarios.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => openScenario(entry.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                data-testid={`academy-scenario-${entry.id}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{entry.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{entry.context}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {entry.steps.length} steps
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : finished ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-6 text-center">
          <p className="font-heading text-lg font-semibold">
            {score}/{scenario.steps.length} aligned with the professional read
          </p>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            Alignment, not perfection — every step traded the same edge: pattern + context + location + structure + confirmation + risk.
          </p>
          <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => setScenarioId(null)} data-testid="academy-scenario-back">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Back to scenarios
          </Button>
        </div>
      ) : step ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="ledger-label">
              {scenario.title} · step <span className="tabular-nums">{stepIndex + 1}</span>/
              <span className="tabular-nums">{scenario.steps.length}</span>
            </p>
            <button
              type="button"
              onClick={() => setScenarioId(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              exit
            </button>
          </div>
          <p className="mt-2 rounded-md border border-border bg-surface-raised px-3.5 py-3 text-sm leading-relaxed" data-testid="academy-scenario-narrative">
            {step.narrative}
          </p>
          <div className="mt-3 space-y-1.5">
            {step.options.map((option) => {
              const answered = choice !== null;
              const isCorrect = option.id === step.correctOptionId;
              const state = !answered ? "idle" : isCorrect ? "correct" : option.id === choice ? "wrong" : "dim";
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={answered}
                  onClick={() => choose(option.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    state === "idle" && "border-border bg-surface hover:bg-muted",
                    state === "correct" && "border-profit/50 bg-profit/10",
                    state === "wrong" && "border-loss/50 bg-loss/10",
                    state === "dim" && "border-border bg-surface opacity-50",
                  )}
                  data-testid={`academy-scenario-option-${option.id}`}
                >
                  {option.label}
                  {state === "correct" ? <CheckCircle2 className="size-4 shrink-0 text-profit" aria-hidden="true" /> : null}
                  {state === "wrong" ? <X className="size-4 shrink-0 text-loss" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          {choice !== null ? (
            <div className="mt-3 space-y-3">
              <p className="rounded-md border border-border bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-foreground/90" data-testid="academy-scenario-feedback">
                {step.feedback}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setStepIndex((prev) => prev + 1);
                  setChoice(null);
                }}
                data-testid="academy-scenario-next"
              >
                {stepIndex + 1 >= scenario.steps.length ? "See result" : "Next step"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
