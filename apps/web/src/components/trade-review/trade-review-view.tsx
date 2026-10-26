"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FileDown, Flame, GraduationCap, LayoutDashboard, NotebookPen, Snowflake, Target } from "lucide-react";
import type { TradeReviewOverviewResponse } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewPanel } from "@/components/trade-review/overview-panel";
import { GoalsPanel } from "@/components/trade-review/goals-panel";
import { ReviewsPanel } from "@/components/trade-review/reviews-panel";
import { LessonsPanel } from "@/components/trade-review/lessons-panel";
import { MonthlyReportDialog } from "@/components/trade-review/monthly-report-dialog";
import { useReviewOverview } from "@/lib/api/queries";

/**
 * Professional Trade Review module (fusion with Goal) - four tabs over the
 * post-trade workspace: Overview (cockpit), Goals (targets vs real behavior),
 * Reviews (grade execution against the playbook + capture lessons) and
 * Lessons (the accumulated library). The tab persists as ?tab= (module
 * convention); the overview aggregate is fetched once here and shared.
 */

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "goals", label: "Goals", icon: Target },
  { id: "reviews", label: "Reviews", icon: NotebookPen },
  { id: "lessons", label: "Lessons", icon: GraduationCap },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function TradeReviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const overviewQuery = useReviewOverview();

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TABS.some((tab) => tab.id === rawTab) ? rawTab : "overview") as TabId;
  const setTab = React.useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const overview: TradeReviewOverviewResponse | undefined = overviewQuery.data;

  // Monthly journal export (one-page printable report).
  const [reportOpen, setReportOpen] = React.useState(false);

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  if (overviewQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">The review workspace could not load.</p>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="trade-review-view">
      {/* Colorful header - the module's identity band */}
      <header className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-violet-600/15 via-fuchsia-500/10 to-cyan-500/15 px-4 py-5 sm:px-6" data-testid="review-header">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
              <NotebookPen className="size-6 text-violet-400 sm:size-7" aria-hidden="true" />
              Trade Review
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Grade execution against the playbook, capture the lesson, and hold your goals against what you actually
              do. Targets are set by you; progress is computed from real trades - you cannot cheat the bar.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setReportOpen(true)}
              data-testid="review-export-month"
            >
              <FileDown className="size-3.5" aria-hidden="true" />
              Export month
            </Button>
            {overview && (
              <>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-500"
                  title={
                    overview.streak.frozenDays > 0
                      ? `Includes ${overview.streak.frozenDays} frozen grace day${overview.streak.frozenDays === 1 ? "" : "s"} - one per week, honestly reported.`
                      : "Consecutive review days - one grace day per week is forgiven, honestly reported."
                  }
                  data-testid="header-streak"
                >
                  <Flame className="size-3.5" aria-hidden="true" />
                  <span className="font-mono font-semibold">{overview.stats.reviewStreakDays}d</span>
                  streak
                  {overview.streak.frozenDays > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-cyan-400" data-testid="header-streak-frozen">
                      <Snowflake className="size-3" aria-hidden="true" />
                      {overview.streak.frozenDays}
                    </span>
                  ) : null}
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-violet-400" data-testid="header-pending">
                  <NotebookPen className="size-3.5" aria-hidden="true" />
                  <span className="font-mono font-semibold">{overview.stats.pendingReviews}</span>
                  to review
                </Badge>
              </>
            )}
          </div>
        </div>
      </header>

      {overviewQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-0.5">
            <TabsList className="h-auto w-max flex-wrap gap-1">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs sm:text-sm" data-testid={`tab-${tab.id}`}>
                  <tab.icon className="size-3.5" aria-hidden="true" />
                  {tab.label}
                  {tab.id === "reviews" && overview && overview.stats.pendingReviews > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 font-mono text-[10px] font-bold text-amber-500">
                      {overview.stats.pendingReviews}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewPanel overview={overview} onGoTo={setTab} />
          </TabsContent>
          <TabsContent value="goals" className="mt-4">
            <GoalsPanel />
          </TabsContent>
          <TabsContent value="reviews" className="mt-4">
            <ReviewsPanel />
          </TabsContent>
          <TabsContent value="lessons" className="mt-4">
            <LessonsPanel />
          </TabsContent>
        </Tabs>
      )}

      <MonthlyReportDialog open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}
