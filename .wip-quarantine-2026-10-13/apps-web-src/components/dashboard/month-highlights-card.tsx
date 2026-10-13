"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Flame,
  Trophy,
} from "lucide-react";
import type {
  Currency,
  MonthHighlight,
  MonthHighlightsResponse,
} from "@cosmoz/shared";
import { formatR, formatSignedMoney } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateKeyShort } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

/** "1h 45m" / "12m" — compact session duration. */
function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function HighlightSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
    </div>
  );
}

/** One panel — Best (profit ink) or Worst (loss ink), same anatomy. */
function HighlightPanel({
  highlight,
  kind,
  currency,
}: {
  highlight: MonthHighlight;
  kind: "best" | "worst";
  currency: Currency;
}) {
  const best = kind === "best";
  const Icon = best ? Trophy : Flame;
  const pnl = Number(highlight.pnlNet);
  const ink = best ? "text-profit" : "text-loss";
  const chipBg = best ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3",
      )}
      data-testid={`highlight-${kind}`}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          chipBg,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {highlight.direction === "SELL" ? (
            <ArrowDownRight className={cn("size-3.5 shrink-0", ink)} aria-hidden="true" />
          ) : (
            <ArrowUpRight className={cn("size-3.5 shrink-0", ink)} aria-hidden="true" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">
            {highlight.symbol}
          </span>
          {highlight.strategyName ? (
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: highlight.strategyColor ?? undefined }}
                aria-hidden="true"
              />
              <span className="truncate">{highlight.strategyName}</span>
            </span>
          ) : (
            <span className="truncate text-[11px] text-muted-foreground">
              Outside the playbook
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className={cn("font-mono text-lg font-semibold tabular-nums", ink)}>
            {formatSignedMoney(pnl, currency)}
          </span>
          <span
            className={cn("font-mono text-xs font-medium tabular-nums", ink)}
            data-testid={`highlight-r-${kind}`}
          >
            {formatR(highlight.rMultiple)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock3 className="size-3" aria-hidden="true" />
            {durationLabel(highlight.durationMinutes)}
          </span>
          <span>{formatDateKeyShort(highlight.tradingDate)}</span>
          <span className="font-mono">
            entry {highlight.entryAt.slice(11, 16)} · exit {highlight.exitAt.slice(11, 16)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface MonthHighlightsCardProps {
  data: MonthHighlightsResponse | undefined;
  isLoading: boolean;
}

/**
 * Month highlights — the Best and Worst closed trade of the running month,
 * side by side (server-picked via GET /stats/highlights). Mini-metrics per
 * trade: R multiple, session duration, strategy, entry/exit window — the
 * replay material for the next journal review.
 */
export function MonthHighlightsCard({ data, isLoading }: MonthHighlightsCardProps) {
  return (
    <Card className="bg-surface" data-testid="month-highlights-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Trophy className="size-4 text-accent" aria-hidden="true" />
          Month highlights
        </CardTitle>
        <CardDescription>
          The best and worst executions of {data?.monthKey ?? "the month"} —
          what to repeat, what to never repeat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <HighlightSkeleton />
        ) : !data.best && !data.worst ? (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="highlights-empty"
          >
            No closed trade this month yet — the highlights land here after the
            first close.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.best ? (
              <HighlightPanel highlight={data.best} kind="best" currency={data.currency} />
            ) : null}
            {data.worst ? (
              <HighlightPanel highlight={data.worst} kind="worst" currency={data.currency} />
            ) : null}
          </div>
        )}
        <Link
          href="/trades"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
        >
          Review the full ledger
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
