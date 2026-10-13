"use client";

import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, Flame, GraduationCap, Target, Trophy } from "lucide-react";

import { InkRibbon } from "@/components/academy/ink-ribbon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademyProgress } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Progress — the learning ledger. Per-category completion rows, the level
 * rubric (honest about being a rubric), streak and achievements. Same rule
 * as the trading pages: the record speaks, the colors stay semantic.
 */

function percentOf(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function ProgressView() {
  const progress = useAcademyProgress();

  if (progress.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (progress.isError || !progress.data) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-xl border border-loss/40 bg-surface p-6 text-sm text-muted-foreground">
          The learning record could not be loaded. Check your connection and retry.
        </div>
      </div>
    );
  }

  const data = progress.data;
  const overall = percentOf(data.lessonsCompleted, data.lessonsTotal);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6" data-testid="academy-progress">
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Academy
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Progress
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {data.lessonsCompleted} of {data.lessonsTotal} lessons, {data.quizAttempts} quiz
          attempt{data.quizAttempts === 1 ? "" : "s"}
          {data.quizAveragePercent !== null ? `, ${data.quizAveragePercent}% quiz average` : ""}.
          Progress is per account — nobody else can see or touch it.
        </p>
        <InkRibbon />
      </header>

      {/* Summary band — each metric carries its own token, same grammar as
          the Overview KPI band: level in accent, streak in ocre, trophies in
          profit once earned, overall in accent. Honest at zero. */}
      <div
        data-testid="progress-band"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4"
      >
        <div className="bg-surface p-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <GraduationCap className="size-3.5 text-accent" aria-hidden="true" />
            Level
          </p>
          <p className="mt-1.5 font-heading text-xl font-bold tabular-nums tracking-tight text-accent">
            {data.level}
            <span className="ml-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {data.levelLabel}
            </span>
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Flame
              className={cn(
                "size-3.5",
                data.streakDays > 0 ? "text-warning" : "text-muted-foreground/50",
              )}
              aria-hidden="true"
            />
            Streak
          </p>
          <p
            className={cn(
              "mt-1.5 font-heading text-xl font-bold tabular-nums tracking-tight",
              data.streakDays > 0 ? "text-warning" : "text-muted-foreground",
            )}
          >
            {data.streakDays} day{data.streakDays === 1 ? "" : "s"}
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Trophy
              className={cn(
                "size-3.5",
                data.coursesCompleted > 0 ? "text-profit" : "text-muted-foreground/50",
              )}
              aria-hidden="true"
            />
            Courses completed
          </p>
          <p
            className={cn(
              "mt-1.5 font-heading text-xl font-bold tabular-nums tracking-tight",
              data.coursesCompleted > 0 ? "text-profit" : "text-muted-foreground",
            )}
          >
            {data.coursesCompleted}
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Target className="size-3.5 text-accent" aria-hidden="true" />
            Overall
          </p>
          <p className="mt-1.5 font-heading text-xl font-bold tabular-nums tracking-tight text-accent">
            {overall}%
          </p>
        </div>
      </div>

      {/* Continue CTA — accent-ruled like the Overview continue card */}
      {data.continueCourseId && data.continueLessonId ? (
        <div className="rounded-xl border border-border border-l-2 border-l-accent bg-surface p-4 sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Continue learning
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Your current course is waiting — keep the streak honest.
            </p>
            <Button asChild>
              <Link href={`/academy/courses/${data.continueCourseId}/${data.continueLessonId}`}>
                Continue learning
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Per-category ledger */}
      <section aria-label="Progress by category">
        <h2 className="font-heading text-base font-semibold">By category</h2>
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {data.byCategory.map((row) => {
            const percent = percentOf(row.lessonsCompleted, row.lessonsTotal);
            const done = row.lessonsTotal > 0 && row.lessonsCompleted === row.lessonsTotal;
            return (
              <div
                key={row.categoryId}
                data-testid="progress-row"
                className={cn(
                  "border-l-2 py-3.5 pl-4 pr-4 sm:pr-5",
                  done ? "border-l-profit" : "border-l-accent/60",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium">
                    {row.title}
                    {done ? (
                      <CheckCircle2
                        className="ml-1.5 inline size-4 text-profit"
                        aria-label="Category complete"
                      />
                    ) : null}
                  </p>
                  <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {row.lessonsCompleted}/{row.lessonsTotal} · {percent}%
                  </p>
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${row.title} progress`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      done ? "bg-profit" : "bg-accent",
                    )}
                    style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Achievements */}
      <section aria-label="Achievements">
        <h2 className="font-heading text-base font-semibold">Achievements</h2>
        <div className="mt-2 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((achievement) => (
            <div
              key={achievement.id}
              data-testid="achievement-row"
              className={cn(
                "flex items-start gap-3 border-l-2 p-4",
                achievement.earned
                  ? "border-l-warning bg-surface"
                  : "border-l-transparent bg-surface/50",
              )}
            >
              <Award
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  achievement.earned ? "text-warning" : "text-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    !achievement.earned && "text-muted-foreground",
                  )}
                >
                  {achievement.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {achievement.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs italic text-muted-foreground/70">
          Achievements are computed from your record — they appear when you earn
          them, never before.
        </p>
      </section>
    </div>
  );
}
