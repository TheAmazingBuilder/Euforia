"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  GraduationCap,
  MessageSquareText,
  Tags,
} from "lucide-react";
import type { Currency, PnlDisplay, Trade } from "@cosmoz/shared";
import { formatDuration, formatR, percentOfNotional } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TradesModuleTabs } from "@/components/trades/trades-module-tabs";
import {
  useInstruments,
  useStrategies,
  useTags,
  useTrades,
  useTradesReviewSummary,
} from "@/lib/api/queries";
import { openGate, openReflect } from "@/lib/hooks/use-judgment-flow";
import { usePnlDisplay } from "@/lib/hooks/use-pnl-display";
import { formatPnlFigure } from "@/lib/utils/pnl-display";
import { cn } from "@/lib/utils";

/**
 * TRADE REVIEWS (/trades/reviews) — the reflection workspace of the journal.
 * Ledger = what happened; Reviews = what it taught you. Three buckets over
 * closed trades: to grade (Gate pending), awaiting review (graded but no
 * lesson), reviewed (Act 3 complete). The summary band reads the
 * server-computed aggregate (GET /trades/reviews/summary); per-trade bucket
 * filtering happens client-side like the ledger (row filters are not
 * aggregates). Actions reuse the global judgment flow: openGate (Act 2) and
 * openReflect (Act 3 direct entry).
 */

type Bucket = "all" | "to-grade" | "incomplete" | "reviewed";

const BUCKETS: ReadonlyArray<{ key: Bucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "to-grade", label: "To grade" },
  { key: "incomplete", label: "Awaiting review" },
  { key: "reviewed", label: "Reviewed" },
];

const BUCKET_KEYS: readonly string[] = BUCKETS.map((bucket) => bucket.key);

// Ledger grade marks: bordered ink text, no tinted fills (same language as the table).
const GRADE_COLORS: Record<string, string> = {
  A: "border-foreground/40 text-foreground",
  B: "border-foreground/30 text-foreground/90",
  C: "border-border text-muted-foreground",
  D: "border-warning/50 text-warning",
  F: "border-warning/60 text-warning",
};

function lessonOf(trade: Trade): string | null {
  const trimmed = (trade.lessons ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function bucketOf(trade: Trade): Exclude<Bucket, "all"> {
  if (trade.decisionGrade === null) return "to-grade";
  return lessonOf(trade) === null ? "incomplete" : "reviewed";
}

export function TradeReviewsView() {
  const { data: tradesData, isLoading } = useTrades();
  const { data: summary } = useTradesReviewSummary();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: tagsData } = useTags();

  const trades = React.useMemo(() => tradesData?.trades ?? [], [tradesData]);
  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const strategies = React.useMemo(() => strategiesData?.strategies ?? [], [strategiesData]);
  const tags = React.useMemo(() => tagsData?.tags ?? [], [tagsData]);
  const pnlMode = usePnlDisplay();
  const currency: Currency = "USD";

  const symbolOf = React.useMemo(() => {
    const map = new Map(instruments.map((instrument) => [instrument.id, instrument]));
    return (id: string) => map.get(id) ?? null;
  }, [instruments]);
  const strategyNameOf = React.useMemo(() => {
    const map = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));
    return (id: string | null) => (id === null ? null : map.get(id) ?? null);
  }, [strategies]);
  const tagNameOf = React.useMemo(() => {
    const map = new Map(tags.map((tag) => [tag.id, tag.name]));
    return (id: string) => map.get(id) ?? null;
  }, [tags]);

  // Closed trades only, most recent first (the ledger owns open positions).
  const closed = React.useMemo(
    () =>
      trades
        .filter((trade) => trade.status === "CLOSED")
        .sort((a, b) => (b.exitAt ?? b.entryAt).localeCompare(a.exitAt ?? a.entryAt)),
    [trades],
  );

  // ── Bucket (URL-persisted ?bucket=, shareable like the ledger filters) ──
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawBucket = searchParams.get("bucket") ?? "";
  const bucket: Bucket = (BUCKET_KEYS.includes(rawBucket) ? rawBucket : "all") as Bucket;
  const setBucket = React.useCallback(
    (next: Bucket) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("bucket");
      else params.set("bucket", next);
      const query = params.toString();
      router.replace(query ? `/trades/reviews?${query}` : "/trades/reviews", { scroll: false });
    },
    [searchParams, router],
  );

  const counts = React.useMemo(() => {
    const per = { "to-grade": 0, incomplete: 0, reviewed: 0 };
    for (const trade of closed) per[bucketOf(trade)] += 1;
    return per;
  }, [closed]);

  const filtered = React.useMemo(
    () => (bucket === "all" ? closed : closed.filter((trade) => bucketOf(trade) === bucket)),
    [closed, bucket],
  );

  return (
    <div className="space-y-4">
      {/* Header — identity + module tabs */}
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Trade Reviews
          </h1>
          <p className="text-sm text-muted-foreground">
            Close the loop on every trade — grade the decision, extract the lesson, feed the
            detector.
          </p>
        </div>
        <TradesModuleTabs active="reviews" />
      </header>

      {/* Summary band — server aggregate (GET /trades/reviews/summary) */}
      <section
        aria-label="Review summary"
        data-testid="reviews-summary"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <SummaryTile
          label="Closed trades"
          value={summary ? String(summary.closedTotal) : null}
          hint="Non-deleted journal entries"
          testId="reviews-summary-closed"
        />
        <SummaryTile
          label="Decision graded"
          value={summary ? String(summary.graded) : null}
          hint={
            summary && summary.closedTotal > 0
              ? `${Math.round((summary.graded / summary.closedTotal) * 100)} % of closed trades`
              : "Gate already passed"
          }
          testId="reviews-summary-graded"
        />
        <button
          type="button"
          onClick={() => setBucket(bucket === "to-grade" ? "all" : "to-grade")}
          data-testid="reviews-summary-awaiting"
          className={cn(
            "rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
            bucket === "to-grade" && "ring-2 ring-ring",
          )}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <GraduationCap className="size-3.5" aria-hidden="true" />
            Awaiting grade
          </p>
          {summary === undefined ? (
            <Skeleton className="mt-2 h-7 w-12" />
          ) : (
            <p
              className={cn(
                "mt-1 font-mono text-2xl font-semibold tabular-nums",
                summary.awaitingGrade > 0 ? "text-warning" : "text-foreground",
              )}
            >
              {summary.awaitingGrade}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Open the Gate queue</p>
        </button>
        <SummaryTile
          label="Review completeness"
          value={summary ? `${summary.completenessPct} %` : null}
          hint={
            summary
              ? `${summary.reviewComplete} of ${summary.closedTotal} with a lesson`
              : "Graded + lesson written"
          }
          testId="reviews-summary-completeness"
        />
      </section>

      {/* Bucket filter */}
      <div
        role="tablist"
        aria-label="Review buckets"
        data-testid="reviews-buckets"
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1 sm:inline-flex"
      >
        {BUCKETS.map((item) => {
          const isActive = item.key === bucket;
          const count =
            item.key === "all"
              ? closed.length
              : item.key === "to-grade"
                ? counts["to-grade"]
                : item.key === "incomplete"
                  ? counts.incomplete
                  : counts.reviewed;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setBucket(item.key)}
              data-testid={`reviews-bucket-${item.key}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading reviews">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState bucket={bucket} />
      ) : (
        <ul className="space-y-3" data-testid="reviews-list">
          {filtered.map((trade) => {
            const instrument = symbolOf(trade.instrumentId);
            return (
              <ReviewCard
                key={trade.id}
                trade={trade}
                symbol={instrument?.symbol ?? "—"}
                contractSize={instrument?.contractSize ?? "1"}
                strategyName={strategyNameOf(trade.strategyId)}
                tagNames={(trade.tagIds ?? [])
                  .map(tagNameOf)
                  .filter((name): name is string => name !== null)}
                pnlMode={pnlMode}
                currency={currency}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string | null;
  hint: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10" data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ReviewCard({
  trade,
  symbol,
  contractSize,
  strategyName,
  tagNames,
  pnlMode,
  currency,
}: {
  trade: Trade;
  symbol: string;
  contractSize: string;
  strategyName: string | null;
  tagNames: string[];
  pnlMode: PnlDisplay;
  currency: Currency;
}) {
  const bucket = bucketOf(trade);
  const lesson = lessonOf(trade);
  const win = (Number(trade.pnlNet) ?? 0) > 0;
  const duration = trade.exitAt === null ? null : formatDuration(trade.entryAt, trade.exitAt);

  return (
    <li
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      data-testid={`review-card-${trade.id}`}
      data-bucket={bucket}
    >
      {/* Row 1 — identity + result */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {trade.direction === "SELL" ? (
            <ArrowDownRight className="size-4 shrink-0 text-loss" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="size-4 shrink-0 text-profit" aria-hidden="true" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">
            {symbol}
            <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
              {trade.direction}
            </span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {trade.tradingDate}
            {duration !== null ? ` · ${duration}` : ""}
          </span>
          {strategyName !== null ? (
            <span className="hidden max-w-40 truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
              {strategyName}
            </span>
          ) : (
            <span className="hidden rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
              Out of playbook
            </span>
          )}
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              trade.pnlNet === null ? "text-muted-foreground" : win ? "text-profit" : "text-loss",
            )}
          >
            {trade.pnlNet === null
              ? "—"
              : formatPnlFigure(
                  pnlMode,
                  {
                    amount: trade.pnlNet,
                    r: trade.rMultiple,
                    pct: percentOfNotional({
                      pnl: trade.pnlNet,
                      entry: trade.entryPrice,
                      quantity: trade.quantity,
                      contractSize,
                    }),
                  },
                  currency,
                )}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {trade.rMultiple === null ? "—" : formatR(trade.rMultiple)}
            {trade.exitPrice !== null ? ` · exit ${trade.exitPrice}` : ""}
          </p>
        </div>
      </div>

      {/* Row 2 — grade + completeness chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {trade.decisionGrade !== null ? (
          <span
            className={cn(
              "inline-block min-w-6 rounded-sm border px-1 py-0.5 text-center font-heading text-xs font-bold",
              GRADE_COLORS[trade.decisionGrade] ?? "border-border text-muted-foreground",
            )}
            aria-label={`Decision grade ${trade.decisionGrade}`}
          >
            {trade.decisionGrade}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            <CircleDashed className="size-3" aria-hidden="true" />
            Not graded
          </span>
        )}
        <Chip
          icon={MessageSquareText}
          label={lesson === null ? "No lesson" : "Lesson"}
          done={lesson !== null}
        />
        <Chip
          icon={Tags}
          label={tagNames.length === 0 ? "No tags" : `${tagNames.length} tag${tagNames.length === 1 ? "" : "s"}`}
          done={tagNames.length > 0}
        />
        <Chip
          icon={BookOpenCheck}
          label={trade.emotionAfter === null ? "Emotion missing" : `Emotion: ${trade.emotionAfter.toLowerCase()}`}
          done={trade.emotionAfter !== null}
        />
        <Chip
          icon={CheckCircle2}
          label={
            trade.mfePrice === null && trade.maePrice === null
              ? "MFE/MAE missing"
              : `MFE ${trade.mfePrice === null ? "—" : formatR(trade.mfeR ?? null)} · MAE ${trade.maePrice === null ? "—" : formatR(trade.maeR ?? null)}`
          }
          done={trade.mfePrice !== null || trade.maePrice !== null}
        />
      </div>

      {/* Row 3 — the lesson (the point of the screen) */}
      <p
        className={cn(
          "mt-3 line-clamp-2 text-sm",
          lesson === null ? "text-muted-foreground/70 italic" : "text-foreground/90",
        )}
      >
        {lesson === null
          ? bucket === "to-grade"
            ? "Grade the decision first — the lesson waits for the reveal."
            : "No lesson captured yet. What would you do differently?"
          : lesson}
      </p>

      {/* Row 4 — action */}
      <div className="mt-3 flex justify-end">
        {bucket === "to-grade" ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => openGate(trade.id)}
            data-testid={`review-action-${trade.id}`}
          >
            <GraduationCap className="size-3.5" aria-hidden="true" />
            Grade decision
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => openReflect(trade.id)}
            data-testid={`review-action-${trade.id}`}
          >
            <BookOpenCheck className="size-3.5" aria-hidden="true" />
            {bucket === "incomplete" ? "Complete review" : "Open review"}
          </Button>
        )}
      </div>
    </li>
  );
}

function Chip({
  icon: Icon,
  label,
  done,
}: {
  icon: React.ElementType;
  label: string;
  done: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        done
          ? "border-border text-foreground/80"
          : "border-dashed border-border text-muted-foreground/80",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function EmptyState({ bucket }: { bucket: Bucket }) {
  const copy: Record<Bucket, { title: string; body: string }> = {
    all: {
      title: "No closed trades yet",
      body: "Close a trade (or capture a closed one) and it will appear here for review.",
    },
    "to-grade": {
      title: "Nothing to grade",
      body: "Every closed trade has its decision recorded. The Gate queue is clear.",
    },
    incomplete: {
      title: "No review waiting",
      body: "Graded trades all carry a lesson. Keep closing the loop as you go.",
    },
    reviewed: {
      title: "No complete reviews yet",
      body: "Grade a trade and write its lesson — it lands in this bucket.",
    },
  };
  const state = copy[bucket];
  return (
    <div
      className="rounded-xl border border-dashed border-border p-10 text-center"
      data-testid="reviews-empty"
    >
      <BookOpenCheck className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-foreground">{state.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{state.body}</p>
    </div>
  );
}
