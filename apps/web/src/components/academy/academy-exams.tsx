"use client";

import * as React from "react";
import { Award, Medal, Sigma } from "lucide-react";

import type { AcademyCertification, AcademyExamResultResponse } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { hueOf, tint } from "@/components/academy/academy-shared";
import { useAcademyCertifications, useAcademyExam, useSubmitExam } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Category certifications - a 20-question exam sampled from every course
 * quiz in the track, graded server-side. Tier ladder: BRONZE ≥50%,
 * SILVER ≥70%, GOLD ≥90%. Only the best attempt is kept.
 */

const TIER_STYLE: Record<string, string> = {
  GOLD: "border-warning/50 bg-warning/10 text-warning",
  SILVER: "border-border bg-surface-raised text-foreground",
  BRONZE: "border-loss/30 bg-loss/5 text-loss",
  NONE: "border-border bg-surface text-muted-foreground",
};

export function CertificationsSection() {
  const { data, isLoading } = useAcademyCertifications();
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);
  const { dict } = useI18n();
  const V = dict.academy.exams;

  return (
    <section aria-label={V.aria} data-testid="academy-certifications">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="ledger-label">{V.title}</h2>
        <p className="text-[11px] text-muted-foreground">{V.tiersNote}</p>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {isLoading || !data
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="m-3 h-10 rounded-md" />)
          : data.certifications.map((certification) => (
              <CertificationRow
                key={certification.categoryId}
                certification={certification}
                open={openCategory === certification.categoryId}
                onToggle={() =>
                  setOpenCategory((prev) => (prev === certification.categoryId ? null : certification.categoryId))
                }
              />
            ))}
      </div>
    </section>
  );
}

function CertificationRow({
  certification,
  open,
  onToggle,
}: {
  certification: AcademyCertification;
  open: boolean;
  onToggle: () => void;
}) {
  const hue = hueOf(certification.categoryId);
  const tiered = certification.tier !== "NONE";
  const { dict } = useI18n();
  const V = dict.academy.exams;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border"
            style={{ color: hue, backgroundColor: tint(hue, 12), borderColor: tint(hue, 28) }}
          >
            <Medal className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{certification.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {certification.questionPool}
              {V.poolSuffix}
              {certification.attempts}
              {V.attempt}
              {certification.attempts === 1 ? "" : V.attemptPlural}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
              TIER_STYLE[certification.tier],
            )}
            data-testid={`academy-cert-tier-${certification.categoryId}`}
          >
            {certification.tier === "NONE" ? V.notCertified : certification.tier}
          </span>
          {certification.bestPercent !== null ? (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {V.bestPrefix}
              {certification.bestPercent}%
            </span>
          ) : null}
          <Button size="sm" variant="outline" onClick={onToggle} data-testid={`academy-cert-toggle-${certification.categoryId}`}>
            {open ? V.close : tiered ? V.improve : V.takeExam}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          <ExamRunner categoryId={certification.categoryId} />
        </div>
      ) : null}
    </div>
  );
}

function ExamRunner({ categoryId }: { categoryId: string }) {
  const examQuery = useAcademyExam(categoryId);
  const submit = useSubmitExam(categoryId);
  const [answers, setAnswers] = React.useState<Record<string, number | boolean | null>>({});
  const [result, setResult] = React.useState<AcademyExamResultResponse | null>(null);
  const { dict } = useI18n();
  const V = dict.academy.exams;
  const S = dict.academy.shared;

  const paper = examQuery.data;
  const questions = paper?.questions ?? [];

  const retake = () => {
    setAnswers({});
    setResult(null);
    void examQuery.refetch();
  };

  if (examQuery.isLoading || !paper) return <Skeleton className="h-40 rounded-md" />;

  if (result) {
    return (
      <div data-testid="academy-exam-result">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Award className={cn("size-5", result.passed ? "text-warning" : "text-muted-foreground")} aria-hidden="true" />
              {result.score}/{result.total} - {result.tier === "NONE" ? V.notYetCertified : `${result.tier}${V.tierSuffix}`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {V.bestAcrossPrefix}
              {result.bestPercent}
              {V.bestAcrossMiddle}
              {result.passed ? V.earned : V.bronzeHint}
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={retake}>
            {V.retakeNewSample}
          </Button>
        </div>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {result.results.map((questionResult, index) => (
            <li key={questionResult.questionId} className="rounded-md border border-border px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-snug">
                  <span className="mr-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  {questions.find((question) => question.id === questionResult.questionId)?.prompt}
                </p>
                <span className={cn("stamp shrink-0 text-[10px]", questionResult.correct ? "stamp-win" : "stamp-loss")}>
                  {questionResult.correct ? S.correct : S.missed}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{questionResult.explanation}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const answeredCount = questions.filter((question) => answers[question.id] !== undefined && answers[question.id] !== null).length;

  return (
    <div data-testid="academy-exam">
      <p className="ledger-label">
        {V.examHeading}
        {answeredCount}/{questions.length}
        {V.answeredSuffix}
      </p>
      <ol className="mt-3 max-h-96 space-y-4 overflow-y-auto pr-1">
        {questions.map((question, index) => {
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
                      <ExamChoice key={String(value)} active={given === value} onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: value }))}>
                        {value ? S.true : S.false}
                      </ExamChoice>
                    ))}
                  </div>
                ) : question.options ? (
                  <div className="space-y-1.5">
                    {question.options.map((option, optionIndex) => (
                      <ExamChoice
                        key={optionIndex}
                        active={given === optionIndex}
                        onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
                      >
                        <span className="mr-2 font-mono text-[11px] text-muted-foreground">{"ABCD"[optionIndex]}</span>
                        {option}
                      </ExamChoice>
                    ))}
                  </div>
                ) : (
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
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={submit.isPending || answeredCount < questions.length}
          onClick={() =>
            submit.mutate(
              { answers: questions.map((question) => ({ questionId: question.id, value: answers[question.id] ?? null })) },
              { onSuccess: (graded) => setResult(graded) },
            )
          }
          data-testid="academy-exam-submit"
        >
          <Sigma className="size-3.5" aria-hidden="true" />
          {V.submitExam}
        </Button>
        <p className="text-xs text-muted-foreground">{V.gradedServerNote}</p>
      </div>
    </div>
  );
}

function ExamChoice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
