"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardCopy,
  Crosshair,
  Flame,
  ListChecks,
  NotebookPen,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoachWeeklyReview } from "@/lib/api/queries";
import type { CoachWeeklyReviewResponse } from "@cosmoz/shared";

/** Local alias — this component was written against the review shape. */
type WeeklyReport = CoachWeeklyReviewResponse;
import { formatDateKeyShort } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

/**
 * Weekly coach report (Priorité 2) — the coach's Monday-morning review,
 * server-computed over the ISO trading week. Structure follows the fixed
 * review agenda: the numbers, the leaks, the wins, and exactly ONE focus
 * for next week ("one fix at a time"). The process is gamified — never
 * the P&L: everything is R, counts and scores.
 */

function WeekDelta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">no previous week</span>;
  }
  const positive = invert ? value < 0 : value > 0;
  const negative = invert ? value > 0 : value < 0;
  const Icon = value === 0 ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums",
        positive && "text-emerald-500 dark:text-emerald-400",
        negative && "text-red-500 dark:text-red-400",
        value === 0 && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {value > 0 ? "+" : ""}
      {value.toFixed(1)} vs prev.
    </span>
  );
}

function NumberCell({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "positive" && "text-emerald-500 dark:text-emerald-400",
          tone === "negative" && "text-red-500 dark:text-red-400",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {detail !== undefined ? <div className="mt-0.5">{detail}</div> : null}
    </div>
  );
}

function buildReportText(report: WeeklyReport): string {
  const lines = [
    `Cosmoz weekly report — ${formatDateKeyShort(report.weekStart)} → ${formatDateKeyShort(report.weekEnd)}`,
    ``,
    `Numbers: ${report.trades} closed trades · ${report.netR}R net · expectancy ${report.expectancyR ?? "—"}R · win rate ${report.winRatePct ?? "—"}%`,
    `Process: discipline ${report.disciplineScoreAvg ?? "—"}/100 · limits respected ${report.limitsRespectedDays}/${report.tradingDays} days · ${report.violationsCount} violations · checklist ${report.checklistCompletePct ?? "—"}%`,
    report.bestDay !== null ? `Best day: ${formatDateKeyShort(report.bestDay.date)} (${report.bestDay.netR}R)` : null,
    report.worstDay !== null ? `Worst day: ${formatDateKeyShort(report.worstDay.date)} (${report.worstDay.netR}R)` : null,
    report.topStrategy !== null ? `Top strategy: ${report.topStrategy.name} (${report.topStrategy.trades} trades, ${report.topStrategy.netR}R)` : null,
    report.topMistake !== null ? `Top leak: ${report.topMistake.label} (${report.topMistake.costR}R over ${report.topMistake.count}x)` : null,
    ``,
    `One focus for next week: ${report.focus.title}`,
    report.focus.detail,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

function WeeklyReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading weekly report">
      <Skeleton className="h-10 w-72 rounded-md" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function WeeklyReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Sparkles className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Weekly report unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The review could not be computed from your journal. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

const FOCUS_ICONS: Record<WeeklyReport["focus"]["code"], LucideIcon> = {
  violations: Flame,
  expensive_mistake: Crosshair,
  run_the_checklist: ListChecks,
  evening_review: NotebookPen,
  protect_the_streak: ShieldCheck,
};

export function WeeklyReportPanel() {
  const reportQuery = useCoachWeeklyReview();

  if (reportQuery.isLoading) return <WeeklyReportSkeleton />;
  if (reportQuery.isError || reportQuery.data === undefined) {
    return <WeeklyReportError onRetry={() => void reportQuery.refetch()} />;
  }

  const report = reportQuery.data;
  const FocusIcon = FOCUS_ICONS[report.focus.code];
  const netRDelta =
    report.prevNetR !== null ? Number(report.netR) - Number(report.prevNetR) : null;
  const disciplineDelta =
    report.prevDisciplineScoreAvg !== null && report.disciplineScoreAvg !== null
      ? report.disciplineScoreAvg - report.prevDisciplineScoreAvg
      : null;
  const limitsTone = report.tradingDays === 0 || report.limitsRespectedDays === report.tradingDays;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReportText(report));
      toast.success("Weekly report copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="weekly-report">
      {/* Header + copy */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Week of {formatDateKeyShort(report.weekStart)} → {formatDateKeyShort(report.weekEnd)}
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold tracking-tight text-foreground">
            Weekly review
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => void copyReport()}>
          <ClipboardCopy className="size-4" aria-hidden="true" />
          Copy report
        </Button>
      </div>

      {/* Headline: net R + week delta */}
      <div className="rounded-xl bg-surface p-4 ring-1 ring-foreground/10 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Net result (R)
            </p>
            <p
              className={cn(
                "mt-0.5 font-mono text-3xl font-bold tabular-nums",
                Number(report.netR) > 0 && "text-emerald-500 dark:text-emerald-400",
                Number(report.netR) < 0 && "text-red-500 dark:text-red-400",
              )}
            >
              {Number(report.netR) > 0 ? "+" : ""}
              {report.netR}R
            </p>
          </div>
          <div className="text-right">
            <WeekDelta value={netRDelta} />
            <p className="mt-0.5 text-xs text-muted-foreground">
              {report.trades} closed trade{report.trades === 1 ? "" : "s"} ·{" "}
              {report.tradingDays} trading day{report.tradingDays === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* The numbers grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberCell
          label="Expectancy"
          value={`${report.expectancyR === null ? "—" : report.expectancyR}R`}
          detail={<span className="text-[11px] text-muted-foreground">per closed trade</span>}
          icon={Target}
          tone={
            report.expectancyR === null
              ? "neutral"
              : Number(report.expectancyR) >= 0
                ? "positive"
                : "negative"
          }
        />
        <NumberCell
          label="Win rate"
          value={`${report.winRatePct === null ? "—" : `${report.winRatePct}%`}`}
          detail={<span className="text-[11px] text-muted-foreground">{report.trades} trades</span>}
          icon={TrendingUp}
        />
        <NumberCell
          label="Discipline avg"
          value={report.disciplineScoreAvg === null ? "—" : `${report.disciplineScoreAvg}/100`}
          detail={
            <WeekDelta
              value={disciplineDelta}
              invert={false}
            />
          }
          icon={ShieldCheck}
        />
        <NumberCell
          label="Limits respected"
          value={`${report.limitsRespectedDays}/${report.tradingDays}`}
          detail={
            <span
              className={cn(
                "text-[11px]",
                limitsTone ? "text-emerald-500 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
              )}
            >
              {limitsTone ? "clean week" : "some days over the line"}
            </span>
          }
          icon={Scale}
          tone={limitsTone ? "positive" : "neutral"}
        />
      </div>

      {/* Leaks + wins */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-surface p-4 ring-1 ring-foreground/10">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <TrendingDown className="size-3.5" aria-hidden="true" />
            Leaks
          </p>
          <ul className="mt-2.5 space-y-2.5">
            <li className="flex items-start justify-between gap-3">
              <span className="text-sm text-foreground">
                Rule violations
                {report.violationsCount === 0 ? (
                  <span className="ml-1.5 text-muted-foreground">— none</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums",
                  report.violationsCount === 0
                    ? "text-emerald-500 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400",
                )}
              >
                {report.violationsCount}
              </span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm text-foreground">
                Top mistake
                {report.topMistake === null ? (
                  <span className="ml-1.5 text-muted-foreground">— none logged</span>
                ) : (
                  <span className="block truncate text-xs text-muted-foreground">
                    {report.topMistake.count}× this week
                  </span>
                )}
              </span>
              {report.topMistake !== null ? (
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-red-500 dark:text-red-400">
                  {report.topMistake.costR}R
                </span>
              ) : (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
              )}
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-sm text-foreground">
                Pre-flight checklist
                <span className="block text-xs text-muted-foreground">
                  graded trades fully green
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                {report.checklistCompletePct === null ? "—" : `${report.checklistCompletePct}%`}
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl bg-surface p-4 ring-1 ring-foreground/10">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="size-3.5" aria-hidden="true" />
            Wins
          </p>
          <ul className="mt-2.5 space-y-2.5">
            <li className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">
                Best day
                {report.bestDay === null ? (
                  <span className="ml-1.5 text-muted-foreground">— flat week</span>
                ) : (
                  <span className="block text-xs text-muted-foreground">
                    {formatDateKeyShort(report.bestDay.date)}
                  </span>
                )}
              </span>
              {report.bestDay !== null ? (
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-emerald-500 dark:text-emerald-400">
                  +{report.bestDay.netR}R
                </span>
              ) : null}
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">
                Top strategy
                {report.topStrategy === null ? (
                  <span className="ml-1.5 text-muted-foreground">— none</span>
                ) : (
                  <span className="block truncate text-xs text-muted-foreground">
                    {report.topStrategy.trades} trade{report.topStrategy.trades === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              {report.topStrategy !== null ? (
                <span className="max-w-32 truncate text-right text-sm font-medium text-foreground">
                  {report.topStrategy.name}
                </span>
              ) : null}
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">
                Trades graded
                <span className="block text-xs text-muted-foreground">
                  through the judgment gate
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                {report.gradedCount}/{report.trades}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Worst day — honest, part of the agenda */}
      {report.worstDay !== null ? (
        <p className="text-xs text-muted-foreground">
          Worst day: {formatDateKeyShort(report.worstDay.date)} at{" "}
          <span className="font-mono tabular-nums">{report.worstDay.netR}R</span> — the review asks
          what the plan got wrong, not what the market did.
        </p>
      ) : null}

      {/* ONE focus for next week */}
      <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
          <FocusIcon className="size-3.5" aria-hidden="true" />
          One focus for next week
        </p>
        <h3 className="mt-1.5 font-heading text-lg font-semibold text-foreground">
          {report.focus.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">{report.focus.detail}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          One fix at a time — next Monday, this review grades it first.
        </p>
      </div>
    </div>
  );
}
