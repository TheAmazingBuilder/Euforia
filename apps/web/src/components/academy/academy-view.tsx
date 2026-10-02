"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Flame, GraduationCap, LayoutDashboard, BookOpen, Dumbbell, Sigma, Library, Bookmark } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcademyOverviewPanel } from "@/components/academy/academy-overview";
import { AcademyCoursesPanel } from "@/components/academy/academy-courses";
import { AcademyPracticePanel } from "@/components/academy/academy-practice";
import { AcademyProgressPanel } from "@/components/academy/academy-progress";
import { AcademyGlossaryPanel } from "@/components/academy/academy-glossary";
import { AcademyBookmarksPanel } from "@/components/academy/academy-bookmarks";
import { useAcademyOverview } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { CATEGORY_HUES, tint } from "@/components/academy/academy-shared";

/**
 * Academy shell — the learning platform lives on ONE route with internal
 * navigation (?tab=, module convention): Overview (learning dashboard),
 * Courses (catalog → course → lesson, deep-linkable), Practice (drills),
 * Progress, Glossary and Bookmarks. The sidebar keeps a single "Academy"
 * entry — the 12 course categories stay inside, never in the main nav.
 */

/** Tab machine ids — labels resolve through dict.academy.view.tabs. */
const TABS = [
  { id: "overview", icon: LayoutDashboard },
  { id: "courses", icon: BookOpen },
  { id: "practice", icon: Dumbbell },
  { id: "progress", icon: Sigma },
  { id: "glossary", icon: Library },
  { id: "bookmarks", icon: Bookmark },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AcademyView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dict } = useI18n();
  const V = dict.academy.view;

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TABS.some((tab) => tab.id === rawTab) ? rawTab : "overview") as TabId;

  const course = searchParams.get("course");
  const lesson = searchParams.get("lesson");

  const overviewQuery = useAcademyOverview();

  const setParams = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`/academy${params.toString() === "" ? "" : `?${params.toString()}`}`, { scroll: false });
    },
    [router, searchParams],
  );

  const openCourse = React.useCallback(
    (courseId: string) => setParams({ tab: "courses", course: courseId, lesson: null }),
    [setParams],
  );
  const openLesson = React.useCallback(
    (lessonId: string) => setParams({ tab: "courses", lesson: lessonId }),
    [setParams],
  );
  const closeCourse = React.useCallback(
    () => setParams({ course: null, lesson: null }),
    [setParams],
  );
  const setTab = React.useCallback(
    (tab: string) => setParams({ tab, course: null, lesson: null, q: null, category: null, term: null }),
    [setParams],
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="academy-view">
      {/* Identity band — solid surface, hairline frame, crowned by the 12-hue
          prism keyline: one color per teaching track (tokens, not chrome). */}
      <header className="overflow-hidden rounded-xl border bg-surface" data-testid="academy-header">
        <div className="flex h-1.5" aria-hidden="true">
          {Object.entries(CATEGORY_HUES).map(([catId, hue]) => (
            <span key={catId} className="h-full flex-1" style={{ background: tint(hue, 85) }} />
          ))}
        </div>
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                <GraduationCap className="size-6 text-accent sm:size-7" aria-hidden="true" />
                {V.title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{V.subtitle}</p>
            </div>
            {overviewQuery.data ? (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning"
                  title={V.streakTitle}
                  data-testid="academy-streak"
                >
                  <Flame className="size-3.5" aria-hidden="true" />
                  <span className="font-mono font-semibold tabular-nums">
                    {overviewQuery.data.progress.streak.currentDays}
                    {V.streakUnit}
                  </span>
                  {V.streak}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent"
                  data-testid="academy-overall"
                >
                  <span className="font-mono font-semibold tabular-nums">{overviewQuery.data.progress.overall.percent}%</span>
                  {V.overall}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {overviewQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-0.5">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 sm:w-fit">
              {TABS.map(({ id, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="gap-1.5 rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-accent/15 data-[state=active]:text-accent"
                  data-testid={`academy-tab-${id}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {V.tabs[id]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <AcademyOverviewPanel
              onOpenCourse={openCourse}
              onOpenLesson={openLesson}
              onGoPractice={() => setParams({ tab: "practice" })}
              onGoGlossary={() => setParams({ tab: "glossary" })}
            />
          </TabsContent>

          <TabsContent value="courses" className="mt-4">
            <AcademyCoursesPanel
              courseId={course}
              lessonId={lesson}
              onOpenCourse={openCourse}
              onOpenLesson={openLesson}
              onBack={closeCourse}
            />
          </TabsContent>

          <TabsContent value="practice" className="mt-4">
            <AcademyPracticePanel />
          </TabsContent>

          <TabsContent value="progress" className="mt-4">
            <AcademyProgressPanel />
          </TabsContent>

          <TabsContent value="glossary" className="mt-4">
            <AcademyGlossaryPanel initialTerm={searchParams.get("term")} />
          </TabsContent>

          <TabsContent value="bookmarks" className="mt-4">
            <AcademyBookmarksPanel />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
