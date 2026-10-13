"use client";

import * as React from "react";
import { Flame, GraduationCap, ListChecks, NotebookPen } from "lucide-react";
import type { DisciplineStreak } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCoachWeeklyReport } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Discipline streaks (Priority 2 #7): gamify the PROCESS, never the P&L.
 * Current vs best run for the four routine pillars — clean days (no rule
 * violation while trading), journaling, decision grading and checklist
 * completion. Data rides on the coach's weekly report aggregate; the card
 * stays non-blocking (renders when ready, hides on failure).
 */

const STREAK_META: Record<
  DisciplineStreak["key"],
  { icon: typeof Flame; unit: string; sample: string }
> = {
  clean_days: { icon: Flame, unit: "day", sample: "traded days" },
  journaling: { icon: NotebookPen, unit: "day", sample: "written days" },
  grading: { icon: GraduationCap, unit: "trade", sample: "closed trades" },
  checklist: { icon: ListChecks, unit: "trade", sample: "closed trades" },
};

export function DisciplineStreaksCard() {
  const report = useCoachWeeklyReport();
  if (!report.data) return null;
  const streaks = report.data.streaks;

  return (
    <Card className="card-hover bg-surface" data-testid="discipline-streaks">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">Process streaks</CardTitle>
        <CardDescription>
          The routine, on a streak counter — a clean run is its own reward. P&L deliberately
          excluded: this is process credit, not profit credit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Discipline streaks">
          {streaks.map((streak) => {
            const meta = STREAK_META[streak.key];
            const Icon = meta.icon;
            const hot = streak.current >= 3;
            const atBest = streak.current >= streak.best && streak.current > 0;
            return (
              <li
                key={streak.key}
                className="rounded-lg border border-border bg-surface-raised p-3"
                data-testid={`streak-${streak.key}`}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon
                    className={cn("size-3.5", hot ? "text-accent" : "text-muted-foreground")}
                    aria-hidden="true"
                  />
                  {streak.label}
                </p>
                <p className="mt-1.5 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "font-mono text-2xl font-semibold tabular-nums",
                      hot ? "text-accent" : "text-foreground",
                    )}
                  >
                    {streak.current}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {meta.unit}
                    {streak.current === 1 ? "" : "s"} · best {streak.best}
                  </span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-snug text-muted-foreground">
                  {atBest ? (
                    <span className="font-mono uppercase tracking-wide text-accent">
                      at your record
                    </span>
                  ) : (
                    <span className="font-mono uppercase tracking-wide">
                      {streak.best - streak.current} to tie the record
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">n {streak.n} {meta.sample}</p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
