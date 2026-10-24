"use client";

import * as React from "react";
import { Lightbulb, Search } from "lucide-react";
import type { Grade, LessonEntry, LessonSource } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviewLessons } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { GradeBadge, SOURCE_META } from "@/components/trade-review/trade-review-shared";

/**
 * Lessons tab - the accumulated wisdom of the account. Every captured lesson
 * lands here from three sources (reviews, trade notes, journals), filterable
 * by grade bucket and searchable. Lessons are the module's actual product.
 */

const SOURCE_FILTERS: Array<{ id: "ALL" | LessonSource; label: string }> = [
  { id: "ALL", label: "All sources" },
  { id: "REVIEW", label: "Reviews" },
  { id: "TRADE_NOTE", label: "Trade notes" },
  { id: "JOURNAL", label: "Journal" },
];

const GRADE_FILTERS: Array<{ id: "ALL" | "AB" | "C" | "DF" | "OFF"; label: string; matches: (grade: string | null) => boolean }> = [
  { id: "ALL", label: "All grades", matches: () => true },
  { id: "AB", label: "A · B", matches: (g) => g === "A" || g === "B" },
  { id: "C", label: "C", matches: (g) => g === "C" },
  { id: "DF", label: "D · F", matches: (g) => g === "D" || g === "F" },
  { id: "OFF", label: "Ungraded", matches: (g) => g === null },
];

function LessonCard({ entry }: { entry: LessonEntry }) {
  const source = SOURCE_META[entry.source];
  return (
    <Card className="border-l-4 py-4" data-testid="lesson-card" data-source={entry.source}>
      <CardContent className="space-y-2 px-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className={cn("text-[10px]", source.className)}>
            {source.label}
          </Badge>
          {entry.symbol && <span className="font-mono font-semibold">{entry.symbol}</span>}
          <GradeBadge grade={entry.executionGrade} className="h-5 px-1.5 text-[10px]" />
          {entry.rMultiple !== null && (
            <span
              className={cn(
                "font-mono font-semibold",
                (entry.rMultiple ?? 0) > 0 ? "text-profit" : (entry.rMultiple ?? 0) < 0 ? "text-loss" : "text-muted-foreground",
              )}
            >
              {formatR(entry.rMultiple)}
            </span>
          )}
          {entry.strategyName && <span className="text-muted-foreground">{entry.strategyName}</span>}
          <span className="ml-auto font-mono text-muted-foreground">{entry.date}</span>
        </div>
        <p className="text-sm leading-relaxed" data-testid="lesson-text">
          <Lightbulb className="mr-1.5 mb-0.5 inline size-3.5 text-amber-500" aria-hidden="true" />
          {entry.text}
        </p>
      </CardContent>
    </Card>
  );
}

export function LessonsPanel() {
  const lessonsQuery = useReviewLessons();
  const [sourceFilter, setSourceFilter] = React.useState<(typeof SOURCE_FILTERS)[number]["id"]>("ALL");
  const [gradeFilter, setGradeFilter] = React.useState<(typeof GRADE_FILTERS)[number]["id"]>("ALL");
  const [search, setSearch] = React.useState("");

  const lessons = lessonsQuery.data?.lessons ?? [];

  const filtered = lessons.filter((entry) => {
    if (sourceFilter !== "ALL" && entry.source !== sourceFilter) return false;
    const gradeFilterDef = GRADE_FILTERS.find((f) => f.id === gradeFilter)!;
    if (!gradeFilterDef.matches(entry.executionGrade as Grade | null)) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const haystack = `${entry.text} ${entry.symbol ?? ""} ${entry.strategyName ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  if (lessonsQuery.isLoading) {
    return (
      <div className="space-y-2" data-testid="lessons-panel">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="lessons-panel">
      <div>
        <h2 className="font-heading text-lg font-semibold">Lessons library</h2>
        <p className="text-sm text-muted-foreground">
          {lessons.length} captured lessons - the residue of every review, note and journal entry. Read one before the
          session; it is cheaper than relearning it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search lessons…"
            className="h-8 w-48 pl-8"
            data-testid="lessons-search"
          />
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by source">
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={sourceFilter === filter.id}
              onClick={() => setSourceFilter(filter.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                sourceFilter === filter.id
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-400"
                  : "text-muted-foreground hover:bg-muted",
              )}
              data-testid={`lessons-source-${filter.id.toLowerCase()}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by grade">
          {GRADE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={gradeFilter === filter.id}
              onClick={() => setGradeFilter(filter.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                gradeFilter === filter.id
                  ? "border-sky-500/40 bg-sky-500/15 text-sky-400"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground" data-testid="lessons-empty">
            No lesson matches these filters - broaden the search or review a trade from the queue.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="lessons-list">
          {filtered.map((entry) => (
            <LessonCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
