"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, GraduationCap, Lightbulb, RefreshCcw, Stars } from "lucide-react";
import type { Trade } from "@cosmoz/shared";
import { formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TradeDetailDrawer } from "@/components/trades/trade-detail-drawer";
import { TradeEditDialog } from "@/components/trades/trade-edit-dialog";
import { useInstruments, useStrategies, useTags, useTrades } from "@/lib/api/queries";
import { openGate } from "@/lib/hooks/use-judgment-flow";
import { getNavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const nav = getNavItem("/journal");

/**
 * Trade Review (/journal) — the reflection desk. The record re-reads itself:
 * ungraded closed trades wait in the review queue (results stay withheld
 * until the decision is graded — the gate is the only door), graded trades
 * form the reviewed ledger with grade/outcome/instrument filters, and the
 * lessons feed keeps the extracted wisdom one glance away. All aggregates
 * are simple counts over GET /trades — no client-side fortune telling.
 */

// Ledger grade marks — same idiom as the trades table (bordered ink, no fills).
const GRADE_MARKS: Record<string, string> = {
  A: "border-foreground/40 text-foreground",
  B: "border-foreground/30 text-foreground/90",
  C: "border-border text-muted-foreground",
  D: "border-warning/50 text-warning",
  F: "border-warning/60 text-warning",
};
const GRADE_ORDER = ["A", "B", "C", "D", "F"] as const;

type OutcomeFilter = "all" | "win" | "loss";

/** Compact duration from two ISO stamps — same idiom as the trades table. */
function formatDuration(entryAt: string, exitAt: string): string {
  const ms = Math.max(0, new Date(exitAt).getTime() - new Date(entryAt).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading trade review">
      <div className="space-y-2">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-7 w-64" />
      </div>
      <div className="ledger-band">
        {[0, 1, 2].map((key) => (
          <div key={key} className="col-span-2 space-y-3 sm:col-span-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function ReviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Trade review unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The review desk could not load your trades. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function TradeReviewView() {
  const tradesQuery = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: tagsData } = useTags();

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [editTrade, setEditTrade] = React.useState<Trade | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [gradeFilter, setGradeFilter] = React.useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = React.useState<OutcomeFilter>("all");
  const [instrumentFilter, setInstrumentFilter] = React.useState<string>("all");

  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const strategies = React.useMemo(() => strategiesData?.strategies ?? [], [strategiesData]);
  const tags = React.useMemo(() => tagsData?.tags ?? [], [tagsData]);

  const symbolOf = React.useCallback(
    (trade: Trade) => instruments.find((item) => item.id === trade.instrumentId)?.symbol ?? "—",
    [instruments],
  );
  const strategyNameOf = React.useCallback(
    (strategyId: string | null) =>
      strategyId ? strategies.find((strategy) => strategy.id === strategyId)?.name ?? null : null,
    [strategies],
  );
  const tagNameOf = React.useCallback(
    (tagId: string) => tags.find((tag) => tag.id === tagId)?.name ?? null,
    [tags],
  );

  const closed = React.useMemo(
    () => (tradesQuery.data?.trades ?? []).filter((trade) => trade.status === "CLOSED"),
    [tradesQuery.data],
  );
  const pending = React.useMemo(
    () =>
      closed
        .filter((trade) => trade.decisionGrade === null)
        .sort((a, b) => (a.tradingDate < b.tradingDate ? 1 : -1)),
    [closed],
  );
  const reviewed = React.useMemo(
    () =>
      closed
        .filter((trade) => trade.decisionGrade !== null)
        .sort((a, b) => (a.tradingDate < b.tradingDate ? 1 : -1)),
    [closed],
  );

  // ── Coverage stats (honest at zero) ──
  const stats = React.useMemo(() => {
    const coverage = closed.length > 0 ? reviewed.length / closed.length : null;
    const gradeCounts = new Map<string, number>();
    for (const trade of reviewed) {
      const grade = trade.decisionGrade ?? "";
      gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
    }
    let totalR = 0;
    let rCount = 0;
    let wins = 0;
    let lessons = 0;
    for (const trade of reviewed) {
      if (trade.rMultiple !== null) {
        totalR += Number(trade.rMultiple);
        rCount += 1;
      }
      if ((Number(trade.pnlNet ?? 0)) >= 0) wins += 1;
      if (trade.lessons !== null && trade.lessons !== "") lessons += 1;
    }
    return {
      coverage,
      gradeCounts,
      avgR: rCount > 0 ? totalR / rCount : null,
      winRate: reviewed.length > 0 ? wins / reviewed.length : null,
      lessons,
    };
  }, [closed, reviewed]);

  // ── Filters over the reviewed ledger ──
  const reviewedSymbols = React.useMemo(
    () => [...new Set(reviewed.map((trade) => symbolOf(trade)))].sort(),
    [reviewed, symbolOf],
  );
  const filteredReviewed = React.useMemo(
    () =>
      reviewed.filter((trade) => {
        if (gradeFilter !== "all" && trade.decisionGrade !== gradeFilter) return false;
        const pnl = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
        if (outcomeFilter === "win" && pnl < 0) return false;
        if (outcomeFilter === "loss" && pnl >= 0) return false;
        if (instrumentFilter !== "all" && symbolOf(trade) !== instrumentFilter) return false;
        return true;
      }),
    [reviewed, gradeFilter, outcomeFilter, instrumentFilter, symbolOf],
  );

  const lessonsFeed = React.useMemo(
    () =>
      reviewed
        .filter((trade) => trade.lessons !== null && trade.lessons !== "")
        .slice(0, 20),
    [reviewed],
  );

  if (tradesQuery.isPending) return <ReviewSkeleton />;
  if (tradesQuery.isError) return <ReviewError onRetry={() => void tradesQuery.refetch()} />;

  const detailTrade = detailId === null ? null : closed.find((trade) => trade.id === detailId) ?? null;
  const isFilterActive = gradeFilter !== "all" || outcomeFilter !== "all" || instrumentFilter !== "all";

  const openDetail = (trade: Trade) => {
    setDetailId(trade.id);
    setDetailOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="trade-review-view">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ledger-label">Trade Review — the reflection desk</p>
          <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            {nav.label}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Grade the decision, tag the mistake, extract the lesson — the journal only pays off
            when it is re-read.
          </p>
        </div>
        <div className="text-right">
          <p className="ledger-label">Review coverage</p>
          <p className="font-mono text-lg font-semibold tabular-nums" data-testid="review-coverage-value">
            {stats.coverage === null ? "—" : formatPercent(stats.coverage, 0)}
          </p>
        </div>
      </div>

      {/* Stats band */}
      <section aria-label="Review statistics" className="ledger-band">
        <div className="col-span-2 space-y-3 sm:col-span-4" data-testid="review-coverage">
          <span className="ledger-label">Closed trades reviewed</span>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
              {reviewed.length}
              <span className="text-base text-muted-foreground"> / {closed.length}</span>
            </span>
          </div>
          <div
            className="goal-track"
            role="img"
            aria-label={`${stats.coverage === null ? "No closed trade" : formatPercent(stats.coverage, 0)} of closed trades reviewed`}
          >
            <div
              className="goal-fill bg-accent"
              style={{ width: `${stats.coverage === null ? 0 : Math.min(1, stats.coverage) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {pending.length === 0
              ? closed.length === 0
                ? "No closed trade yet — the queue fills up as you close positions."
                : "Everything is reviewed — the desk is clear."
              : `${pending.length} trade${pending.length === 1 ? "" : "s"} waiting for a grade.`}
          </p>
        </div>

        <div className="col-span-2 space-y-3 sm:col-span-4" data-testid="review-grade-mix">
          <span className="ledger-label">Grade mix</span>
          <div className="flex flex-wrap items-center gap-2">
            {GRADE_ORDER.map((grade) => (
              <span
                key={grade}
                className={cn(
                  "inline-flex min-w-9 flex-col items-center rounded-sm border px-1.5 py-1",
                  GRADE_MARKS[grade],
                )}
                aria-label={`Grade ${grade}: ${stats.gradeCounts.get(grade) ?? 0} trades`}
              >
                <span className="font-heading text-sm font-bold leading-none">{grade}</span>
                <span className="mt-0.5 font-mono text-[10px] tabular-nums leading-none opacity-80">
                  {stats.gradeCounts.get(grade) ?? 0}
                </span>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            The decision grade is submitted before the result is revealed — it grades the
            process, never the outcome.
          </p>
        </div>

        <div className="col-span-2 space-y-3 sm:col-span-4" data-testid="review-stats">
          <span className="ledger-label">What the reviews say</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">Avg R</p>
              <p
                className={cn(
                  "font-mono text-base font-semibold tabular-nums",
                  stats.avgR === null
                    ? "text-muted-foreground"
                    : stats.avgR >= 0
                      ? "text-profit"
                      : "text-loss",
                )}
              >
                {stats.avgR === null ? "—" : formatR(stats.avgR)}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">Win rate</p>
              <p className="font-mono text-base font-semibold tabular-nums text-foreground">
                {stats.winRate === null ? "—" : formatPercent(stats.winRate, 0)}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">Lessons</p>
              <p className="font-mono text-base font-semibold tabular-nums text-foreground">
                {stats.lessons}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Computed over the {reviewed.length} reviewed trade{reviewed.length === 1 ? "" : "s"}.
          </p>
        </div>
      </section>

      {/* Review queue — results stay withheld until graded */}
      <section
        aria-label="Trades to review"
        className="ledger-band"
        data-testid="review-pending"
      >
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="ledger-label">To review — decision grade missing</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {pending.length} pending · results withheld until graded
            </span>
          </div>
          {pending.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground" data-testid="review-pending-empty">
              {closed.length === 0
                ? "No closed trade yet — after each close, the trade lands here for grading."
                : "Nothing to review — every closed trade has its decision recorded."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {pending.slice(0, 30).map((trade) => (
                <li
                  key={trade.id}
                  className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
                  data-testid={`review-pending-item-${trade.id}`}
                >
                  {trade.direction === "SELL" ? (
                    <ArrowDownRight className="size-4 shrink-0 text-loss" aria-hidden="true" />
                  ) : (
                    <ArrowUpRight className="size-4 shrink-0 text-profit" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {symbolOf(trade)}
                      <span className="ml-2 font-mono text-xs font-semibold text-muted-foreground">
                        {trade.direction}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {trade.tradingDate}
                      {strategyNameOf(trade.strategyId) !== null
                        ? ` · ${strategyNameOf(trade.strategyId)}`
                        : " · out of playbook"}
                      {trade.exitAt !== null
                        ? ` · held ${formatDuration(trade.entryAt, trade.exitAt)}`
                        : ""}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                    onClick={() => openGate(trade.id)}
                    data-testid={`review-grade-${trade.id}`}
                  >
                    <GraduationCap className="size-3.5" aria-hidden="true" />
                    Grade
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Reviewed ledger */}
      <section
        aria-label="Reviewed trades ledger"
        className="ledger-band"
        data-testid="review-ledger"
      >
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="ledger-label">Reviewed ledger</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {filteredReviewed.length} / {reviewed.length} shown · click a row for the full record
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2" data-testid="review-filters">
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by grade" data-testid="review-filter-grade">
                <SelectValue placeholder="Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {GRADE_ORDER.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    Grade {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={outcomeFilter}
              onValueChange={(value) => setOutcomeFilter(value as OutcomeFilter)}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by outcome" data-testid="review-filter-outcome">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="win">Wins</SelectItem>
                <SelectItem value="loss">Losses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Filter by instrument" data-testid="review-filter-instrument">
                <SelectValue placeholder="Instrument" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All instruments</SelectItem>
                {reviewedSymbols.map((symbol) => (
                  <SelectItem key={symbol} value={symbol}>
                    {symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isFilterActive ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setGradeFilter("all");
                  setOutcomeFilter("all");
                  setInstrumentFilter("all");
                }}
                data-testid="review-filters-reset"
              >
                Reset
              </Button>
            ) : null}
          </div>

          {/* Table */}
          {filteredReviewed.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground" data-testid="review-ledger-empty">
              {reviewed.length === 0
                ? "No reviewed trade yet — grade a trade from the queue above."
                : "No reviewed trade matches these filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-200 text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="ledger-label pb-2">Date</th>
                    <th scope="col" className="ledger-label pb-2">Instrument</th>
                    <th scope="col" className="ledger-label pb-2">Dir</th>
                    <th scope="col" className="ledger-label pb-2 text-center">Grade</th>
                    <th scope="col" className="ledger-label pb-2 text-right">R</th>
                    <th scope="col" className="ledger-label pb-2 text-right">Net P&amp;L</th>
                    <th scope="col" className="ledger-label pb-2">Mistakes / tags</th>
                    <th scope="col" className="ledger-label pb-2">Lesson</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviewed.slice(0, 50).map((trade) => {
                    const pnl = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
                    const tradeTags = (trade.tagIds ?? [])
                      .map(tagNameOf)
                      .filter((name): name is string => name !== null);
                    return (
                      <tr
                        key={trade.id}
                        data-testid="review-ledger-row"
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                        onClick={() => openDetail(trade)}
                      >
                        <td className="whitespace-nowrap py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {trade.tradingDate}
                        </td>
                        <td className="whitespace-nowrap py-2.5 font-mono font-semibold text-foreground">
                          {symbolOf(trade)}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 font-mono text-xs font-semibold",
                              trade.direction === "SELL" ? "text-loss" : "text-profit",
                            )}
                          >
                            {trade.direction === "SELL" ? (
                              <ArrowDownRight className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            )}
                            {trade.direction}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={cn(
                              "inline-block min-w-6 rounded-sm border px-1 py-0.5 font-heading text-xs font-bold",
                              GRADE_MARKS[trade.decisionGrade ?? ""] ?? "border-border text-muted-foreground",
                            )}
                          >
                            {trade.decisionGrade}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap py-2.5 text-right font-mono tabular-nums",
                            trade.rMultiple === null
                              ? "text-muted-foreground"
                              : Number(trade.rMultiple) >= 0
                                ? "text-profit"
                                : "text-loss",
                          )}
                        >
                          {trade.rMultiple === null ? "—" : formatR(trade.rMultiple)}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap py-2.5 text-right font-mono font-semibold tabular-nums",
                            pnl >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {formatSignedMoney(trade.pnlNet, "USD")}
                        </td>
                        <td className="py-2.5">
                          <div className="flex max-w-36 flex-wrap gap-1">
                            {tradeTags.slice(0, 2).map((name) => (
                              <span
                                key={name}
                                className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {name}
                              </span>
                            ))}
                            {tradeTags.length > 2 ? (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                +{tradeTags.length - 2}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="max-w-72 py-2.5">
                          {trade.lessons !== null && trade.lessons !== "" ? (
                            <p className="truncate text-xs text-muted-foreground" title={trade.lessons}>
                              {trade.lessons}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Lessons feed */}
      <section aria-label="Lessons extracted from reviews" className="ledger-band" data-testid="review-lessons">
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-12">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="ledger-label">Lessons — the extracted wisdom</span>
          </div>
          {lessonsFeed.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No lesson captured yet — write one in a trade&apos;s review; it lands here.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {lessonsFeed.map((trade) => (
                <li
                  key={trade.id}
                  className="cursor-pointer rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/30"
                  onClick={() => openDetail(trade)}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {symbolOf(trade)}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {trade.tradingDate}
                    </span>
                    {trade.decisionGrade !== null ? (
                      <span
                        className={cn(
                          "rounded-sm border px-1 py-0.5 font-heading text-[10px] font-bold",
                          GRADE_MARKS[trade.decisionGrade] ?? "border-border text-muted-foreground",
                        )}
                      >
                        {trade.decisionGrade}
                      </span>
                    ) : null}
                    {trade.rMultiple !== null ? (
                      <span
                        className={cn(
                          "font-mono text-[11px] tabular-nums",
                          Number(trade.rMultiple) >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {formatR(trade.rMultiple)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {trade.lessons}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Full record + edit — shared with the Trades module */}
      <TradeDetailDrawer
        trade={detailTrade}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) {
            setDetailOpen(false);
            setDetailId(null);
          }
        }}
        onEdit={(trade) => {
          setDetailOpen(false);
          setEditTrade(trade);
          setEditOpen(true);
        }}
        onDeleted={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
      />
      <TradeEditDialog trade={editTrade} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
