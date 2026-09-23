"use client";

import * as React from "react";
import { RefreshCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel } from "@/components/coach/chat-panel";
import {
  useInstruments,
  useMistakesLedger,
  useStatsOverview,
  useStrategies,
  useStrategiesStats,
  useTrades,
  useViolations,
} from "@/lib/api/queries";
import { buildCoachContext } from "@/lib/coach/build-context";
import { formatDateKeyShort } from "@/lib/utils/datetime";

/**
 * Coach screen (feature 11) — the AI coach conversation, grounded in the
 * user's journal. This view OWNS the data: it pulls the same queries the
 * dashboard uses (overview, strategies, mistakes, violations, trades) and
 * projects them into the compact snapshot the chat attaches to requests.
 * The chat stays disabled until the snapshot is real numbers.
 */

function CoachSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading coach">
      <Skeleton className="h-10 w-44 rounded-md" />
      <Skeleton className="h-[calc(100dvh-16rem)] min-h-80 w-full rounded-xl" />
    </div>
  );
}

function CoachError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Sparkles className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Coach data unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your journal stats could not be loaded, and the coach only speaks from your data. Check
          your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function CoachView() {
  const overview = useStatsOverview();
  const strategiesStats = useStrategiesStats();
  const strategies = useStrategies();
  const instruments = useInstruments();
  const ledger = useMistakesLedger();
  const violations = useViolations();
  const trades = useTrades();

  const context = React.useMemo(
    () =>
      buildCoachContext({
        overview: overview.data,
        strategiesStats: strategiesStats.data,
        strategies: strategies.data?.strategies,
        instruments: instruments.data?.instruments,
        ledger: ledger.data,
        violations: violations.data,
        trades: trades.data?.trades,
      }),
    [
      overview.data,
      strategiesStats.data,
      strategies.data,
      instruments.data,
      ledger.data,
      violations.data,
      trades.data,
    ],
  );

  const snapshotSummary = React.useMemo(() => {
    if (context === null) return "";
    const parts = [
      `${context.totals.trades} trade${context.totals.trades === 1 ? "" : "s"}`,
      `${context.strategies.length} ${context.strategies.length === 1 ? "strategy" : "strategies"}`,
    ];
    if (context.dataAsOf !== null) parts.push(`as of ${formatDateKeyShort(context.dataAsOf)}`);
    return parts.join(" · ");
  }, [context]);

  const retryAll = React.useCallback(() => {
    void overview.refetch();
  }, [overview]);

  if (overview.isLoading) {
    return <CoachSkeleton />;
  }

  if (overview.isError || context === null) {
    return <CoachError onRetry={retryAll} />;
  }

  return (
    <div className="flex h-[calc(100dvh-14.5rem)] min-h-96 flex-col lg:h-[calc(100dvh-11rem)]">
      {/* Page header */}
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10">
          <Sparkles className="size-5 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Coach
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            Ask your AI coach anything about your journal data.
          </p>
        </div>
      </div>

      {/* The conversation fills the rest */}
      <div className="min-h-0 flex-1">
        <ChatPanel context={context} snapshotSummary={snapshotSummary} />
      </div>
    </div>
  );
}
