"use client";

import * as React from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Flame,
  Gauge,
  GraduationCap,
  ListChecks,
  Target,
} from "lucide-react";
import type { TradeReviewOverviewResponse } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GradeBadge, GRADE_BAR, GRADE_STYLES } from "@/components/trade-review/trade-review-shared";
import { Snowflake } from "lucide-react";

/**
 * Trade Review overview — the module's cockpit. Review rate, streak, lessons
 * and goal health up top; the grade distribution as a full-width segmented
 * bar; the weekly execution trend; the pending queue CTA and the freshest
 * lessons. Everything from GET /reviews/overview — the client renders, never
 * recomputes.
 */

const GRADE_ORDER = ["A", "B", "C", "D", "F"] as const;

interface OverviewPanelProps {
  overview: TradeReviewOverviewResponse | undefined;
  onGoTo: (tab: string) => void;
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
  testid,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  sub: string;
  gradient: string;
  testid: string;
}) {
  return (
    <Card className="relative overflow-hidden py-4" data-testid={testid}>
      <CardContent className="flex items-center gap-3 px-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", gradient)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-xl font-bold tabular-nums leading-tight">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewPanel({ overview, onGoTo }: OverviewPanelProps) {
  if (!overview) return null;
  const { stats, streak, goalsSummary, weeklyGradeTrend, recentLessons, pendingQueuePreview } = overview;

  const gradeTotal = GRADE_ORDER.reduce((sum, grade) => sum + stats.gradeDistribution[grade], 0);

  return (
    <div className="space-y-4" data-testid="review-overview">
      {/* ── Hero KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={ClipboardList}
          label="Review rate"
          value={`${stats.reviewRatePct}%`}
          sub={`${stats.reviewedTrades} of ${stats.closedTrades} closed trades`}
          gradient="from-violet-500 to-purple-600"
          testid="kpi-review-rate"
        />
        <KpiTile
          icon={Flame}
          label="Review streak"
          value={stats.reviewStreakDays > 0 ? `${stats.reviewStreakDays}d` : "0d"}
          sub={
            streak.frozenDays > 0
              ? `incl. ${streak.frozenDays} frozen grace day${streak.frozenDays === 1 ? "" : "s"}`
              : stats.reviewStreakDays > 0
                ? "Grace day available this week"
                : "Review one trade today"
          }
          gradient="from-amber-500 to-orange-500"
          testid="kpi-streak"
        />
        <KpiTile
          icon={GraduationCap}
          label="Lessons captured"
          value={String(stats.lessonsCaptured)}
          sub={stats.offPlaybookCount > 0 ? `${stats.offPlaybookCount} off-playbook trades` : "All inside the playbook"}
          gradient="from-emerald-500 to-teal-600"
          testid="kpi-lessons"
        />
        <KpiTile
          icon={Target}
          label="Goals on pace"
          value={`${goalsSummary.onTrack + goalsSummary.achieved}/${goalsSummary.total}`}
          sub={`${goalsSummary.atRisk} at risk · ${goalsSummary.behind} behind`}
          gradient="from-cyan-500 to-sky-600"
          testid="kpi-goals"
        />
      </div>

      {streak.frozenDays > 0 ? (
        <p
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-500 dark:text-cyan-400"
          data-testid="streak-freeze-note"
        >
          <Snowflake className="size-3 shrink-0" aria-hidden="true" />
          Honest streak: {streak.currentDays} reviewed + {streak.frozenDays} frozen (one grace day per week) — best pure run {streak.longestStreak}d.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Grade distribution ── */}
        <Card data-testid="grade-distribution-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-violet-400" aria-hidden="true" />
              Execution grades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gradeTotal === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No reviews yet — grade your first trade.</p>
            ) : (
              <>
                <div className="flex h-3.5 w-full overflow-hidden rounded-full" data-testid="grade-bar">
                  {GRADE_ORDER.map((grade) => {
                    const count = stats.gradeDistribution[grade];
                    if (count === 0) return null;
                    return (
                      <span
                        key={grade}
                        className={cn("h-full", GRADE_BAR[grade])}
                        style={{ width: `${(count / gradeTotal) * 100}%` }}
                        title={`${grade}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {GRADE_ORDER.map((grade) => (
                    <span key={grade} className="inline-flex items-center gap-1.5 text-xs">
                      <Badge variant="outline" className={cn("h-5 px-1.5 font-mono text-[10px] font-bold", GRADE_STYLES[grade])}>
                        {grade}
                      </Badge>
                      <span className="font-mono font-semibold" data-testid={`grade-count-${grade.toLowerCase()}`}>
                        {stats.gradeDistribution[grade]}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 border-t pt-3 text-center">
                  {(
                    [
                      { label: "Entry", value: stats.avgEntryQuality },
                      { label: "Exit", value: stats.avgExitQuality },
                      { label: "Risk", value: stats.avgRiskManagement },
                    ] as const
                  ).map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">Avg {label}</p>
                      <p className="font-mono text-sm font-bold">{value === null ? "—" : `${value}/5`}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Weekly trend ── */}
        <Card data-testid="weekly-trend-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="size-4 text-cyan-400" aria-hidden="true" />
              Weekly execution trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyGradeTrend.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Not enough history yet.</p>
            ) : (
              <div className="flex h-32 items-end gap-2" data-testid="weekly-trend">
                {weeklyGradeTrend.map((week) => (
                  <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="font-mono text-[10px] font-semibold text-muted-foreground">{week.avgPoints.toFixed(1)}</span>
                    <div
                      className={cn(
                        "w-full rounded-t-md bg-gradient-to-t transition-all",
                        week.avgPoints >= 4 ? "from-emerald-600/60 to-emerald-400" : week.avgPoints >= 3 ? "from-amber-600/60 to-amber-400" : "from-rose-600/60 to-rose-400",
                      )}
                      style={{ height: `${(week.avgPoints / 5) * 100}%` }}
                      title={`${week.weekStart}: ${week.reviews} reviews`}
                    />
                    <span className="w-full truncate text-center font-mono text-[10px] text-muted-foreground">
                      {week.weekStart.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              Average execution grade per week (A=5 … F=1) · plan followed {stats.followedPlanPct === null ? "—" : `${stats.followedPlanPct}%`} of the time.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Pending queue CTA ── */}
        <Card data-testid="pending-cta-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ListChecks className="size-4 text-amber-500" aria-hidden="true" />
                Waiting for review
              </span>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 font-mono text-amber-500" data-testid="overview-pending-count">
                {stats.pendingReviews}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingQueuePreview.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
                Queue clear — every closed trade has its verdict.
              </p>
            ) : (
              <>
                {pendingQueuePreview.map((row) => (
                  <div key={row.tradeId} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2" data-testid="pending-preview-row">
                    <GradeBadge grade={row.executionGrade} className="h-5 px-1.5 text-[10px]" />
                    <span className="font-mono text-sm font-semibold">{row.symbol}</span>
                    <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{row.tradingDate.slice(5)}</span>
                    <span
                      className={cn(
                        "ml-auto font-mono text-sm font-semibold",
                        (row.rMultiple ?? 0) >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {row.rMultiple === null ? "—" : `${row.rMultiple > 0 ? "+" : ""}${row.rMultiple.toFixed(2)}R`}
                    </span>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full" onClick={() => onGoTo("reviews")} data-testid="go-to-reviews">
                  Open the review queue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Recent lessons ── */}
        <Card data-testid="recent-lessons-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <GraduationCap className="size-4 text-emerald-500" aria-hidden="true" />
                Freshest lessons
              </span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onGoTo("lessons")}>
                Library
                <ArrowRight className="size-3" aria-hidden="true" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentLessons.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No lessons captured yet.</p>
            ) : (
              recentLessons.slice(0, 4).map((lesson) => (
                <div key={lesson.id} className="rounded-lg border px-3 py-2" data-testid="overview-lesson-row">
                  <div className="flex items-center gap-2 text-xs">
                    {lesson.symbol && <span className="font-mono font-semibold">{lesson.symbol}</span>}
                    <GradeBadge grade={lesson.executionGrade} className="h-5 px-1.5 text-[10px]" />
                    {lesson.rMultiple !== null && (
                      <span className={cn("font-mono", lesson.rMultiple > 0 ? "text-profit" : "text-loss")}>
                        {lesson.rMultiple > 0 ? "+" : ""}
                        {lesson.rMultiple.toFixed(2)}R
                      </span>
                    )}
                    <span className="ml-auto font-mono text-muted-foreground">{lesson.date}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{lesson.text}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
