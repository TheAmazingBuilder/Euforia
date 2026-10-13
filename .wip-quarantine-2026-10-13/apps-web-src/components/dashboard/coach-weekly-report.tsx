"use client";

import * as React from "react";
import { Flame, GraduationCap, ListChecks, NotebookPen, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { CoachDecision, CoachWeeklyReportResponse } from "@cosmoz/shared";
import { formatMoney, formatR } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/utils";

/**
 * Coach weekly report (Priority 2 #4): best decisions, discipline trend and
 * THE one focus for the coming week — one card, one message, never a to-do
 * list. The all-time process streaks ride along in the footer (they are the
 * same data the discipline screen renders).
 */

const STREAK_ICONS = {
  clean_days: Flame,
  journaling: NotebookPen,
  grading: GraduationCap,
  checklist: ListChecks,
} as const;

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${weekEnd}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${weekStart} → ${weekEnd}`;
  const startLabel = dayFormatter.format(start);
  const endLabel = dayFormatter.format(end);
  // Same month → "21 – 27 septembre" instead of repeating the month.
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()} – ${endLabel}`;
  }
  return `${startLabel} – ${endLabel}`;
}

function DecisionRow({ decision, tone }: { decision: CoachDecision; tone: "best" | "worst" }) {
  const r = Number(decision.r);
  return (
    <li className="space-y-0.5" data-testid={`coach-decision-${tone}`}>
      <p className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">{decision.symbol}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {decision.date}
          {decision.grade !== null ? ` · ${decision.grade}` : ""}
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-sm font-medium tabular-nums",
            r >= 0 ? "text-profit" : "text-loss",
          )}
        >
          {formatR(decision.r)}
        </span>
      </p>
      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{decision.reason}</p>
    </li>
  );
}

export function CoachWeeklyReportCard({ report }: { report: CoachWeeklyReportResponse }) {
  const score = report.disciplineScore !== null ? Number(report.disciplineScore) : null;
  const prevScore = report.disciplinePrevScore !== null ? Number(report.disciplinePrevScore) : null;
  const delta = score !== null && prevScore !== null ? score - prevScore : null;
  const netR = Number(report.netR);

  return (
    <Card className="card-hover bg-surface" data-testid="coach-weekly-report">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-base font-semibold">
              Coach weekly report
            </CardTitle>
            <CardDescription>
              Week of {formatWeekRange(report.weekStart, report.weekEnd)} · {report.closedCount} closed
              trade{report.closedCount === 1 ? "" : "s"} ·{" "}
              <span className={cn("font-mono tabular-nums", netR >= 0 ? "text-profit" : "text-loss")}>
                {formatR(report.netR)}
              </span>{" "}
              · {formatMoney(report.netPnl, report.currency)}
            </CardDescription>
          </div>
          {delta !== null ? (
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs tabular-nums",
                delta >= 0
                  ? "border-profit/30 bg-profit/10 text-profit"
                  : "border-loss/30 bg-loss/10 text-loss",
              )}
            >
              {delta >= 0 ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )}
              discipline {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Best / worst decisions of the week */}
          <section aria-label="Decisions of the week" className="space-y-3">
            <div className="space-y-2">
              <h4 className="eyebrow text-muted-foreground">Best decisions</h4>
              {report.bestDecisions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No winning decision recorded this week.</p>
              ) : (
                <ul className="space-y-2">
                  {report.bestDecisions.map((decision) => (
                    <DecisionRow key={decision.tradeId} decision={decision} tone="best" />
                  ))}
                </ul>
              )}
            </div>
            {report.worstDecisions.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-3">
                <h4 className="eyebrow text-muted-foreground">To rework</h4>
                <ul className="space-y-2">
                  {report.worstDecisions.map((decision) => (
                    <DecisionRow key={decision.tradeId} decision={decision} tone="worst" />
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Discipline trend */}
          <section aria-label="Discipline trend" className="space-y-3">
            <h4 className="eyebrow text-muted-foreground">Discipline trend</h4>
            <p className="flex items-baseline gap-2">
              {report.disciplineScore !== null ? (
                <span
                  className="font-mono text-3xl font-semibold tabular-nums text-foreground"
                  aria-label={`Discipline score ${score} out of 100`}
                >
                  <CountUp value={report.disciplineScore} />
                </span>
              ) : (
                <span className="font-mono text-3xl font-semibold text-muted-foreground">—</span>
              )}
              <span className="text-xs text-muted-foreground">
                / 100{prevScore !== null ? ` · last week ${prevScore.toFixed(0)}` : ""}
              </span>
            </p>
            <dl className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
              <div className="rounded-md border border-border bg-surface-raised px-2 py-1.5">
                <dt className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Adherence
                </dt>
                <dd className="text-foreground">
                  {report.adherencePct !== null ? `${Number(report.adherencePct).toFixed(0)}%` : "—"}
                </dd>
              </div>
              <div className="rounded-md border border-border bg-surface-raised px-2 py-1.5">
                <dt className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Journal
                </dt>
                <dd className="text-foreground">{report.journalDays}d</dd>
              </div>
              <div className="rounded-md border border-border bg-surface-raised px-2 py-1.5">
                <dt className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Violations
                </dt>
                <dd className={cn(report.violationsCount > 0 ? "text-warning" : "text-foreground")}>
                  {report.violationsCount}
                </dd>
              </div>
            </dl>
          </section>

          {/* THE one focus */}
          <section
            aria-label="Focus for next week"
            data-testid="coach-focus"
            className="rounded-lg border border-accent/40 bg-accent/5 p-4"
          >
            <h4 className="eyebrow flex items-center gap-1.5 text-accent">
              <Sparkles className="size-3" aria-hidden="true" />
              Focus for next week
            </h4>
            <p className="mt-2 font-heading text-sm font-semibold text-foreground">
              {report.focus.title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {report.focus.message}
            </p>
            {report.focus.metricLabel !== null && report.focus.metricValue !== null ? (
              <p className="mt-3 flex items-center gap-2 font-mono text-[11px] tabular-nums text-accent">
                <span className="h-px w-4 bg-accent/50" aria-hidden="true" />
                {report.focus.metricLabel} · {report.focus.metricValue}
              </p>
            ) : null}
          </section>
        </div>

        {/* Process streaks — gamify the routine, never the P&L */}
        <ul
          aria-label="Discipline streaks"
          className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3"
          data-testid="coach-streaks"
        >
          {report.streaks.map((streak) => {
            const Icon = STREAK_ICONS[streak.key];
            const hot = streak.current >= 3;
            return (
              <li key={streak.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon
                  className={cn("size-3.5", hot ? "text-accent" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                <span>{streak.label}</span>
                <span
                  className={cn(
                    "font-mono font-medium tabular-nums",
                    hot ? "text-accent" : "text-foreground",
                  )}
                >
                  {streak.current}
                </span>
                <span className="font-mono tabular-nums">best {streak.best}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
