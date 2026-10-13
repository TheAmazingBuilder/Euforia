"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatR, formatSignedMoney, type Currency, type Trade } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstruments, useTrades } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

const RECENT_COUNT = 5;

/** Calendar-day label: Today / Yesterday / "Sep 12". */
function formatDay(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function DirectionMark({ direction }: { direction: Trade["direction"] }) {
  const sell = direction === "SELL";
  const Icon = sell ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
        sell ? "bg-destructive/15 text-destructive" : "bg-profit/15 text-profit",
      )}
      aria-label={sell ? "Short" : "Long"}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}

function RecentTradesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: RECENT_COUNT }, (_, index) => (
        <Skeleton key={index} className="h-9 rounded-lg" />
      ))}
    </div>
  );
}

interface RecentTradesCardProps {
  currency: Currency;
}

/**
 * Recent trades card — the five most recently CLOSED executions, newest
 * first. Row data is a projection of GET /trades?status=CLOSED (order is a
 * rendering concern, aggregates stay server-side).
 */
export function RecentTradesCard({ currency }: RecentTradesCardProps) {
  const trades = useTrades({ status: "CLOSED" });
  const instruments = useInstruments();

  const instrumentSymbol = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const instrument of instruments.data?.instruments ?? []) {
      map.set(instrument.id, instrument.symbol);
    }
    return map;
  }, [instruments.data]);

  const recent = React.useMemo(() => {
    const list = [...(trades.data?.trades ?? [])].sort(
      (a, b) =>
        (b.tradingDate + (b.exitAt ?? "")).localeCompare(a.tradingDate + (a.exitAt ?? "")),
    );
    return list.slice(0, RECENT_COUNT);
  }, [trades.data]);

  return (
    <Card className="bg-surface" data-testid="recent-trades-card">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">Recent trades</CardTitle>
        <CardDescription>The five last closed executions, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {trades.isLoading || instruments.isLoading ? (
          <RecentTradesSkeleton />
        ) : recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="recent-trades-empty">
            No closed trades yet
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="recent-trades-list">
            {recent.map((trade) => {
              const pnl = Number(trade.pnlNet);
              const tint =
                !Number.isFinite(pnl) || pnl === 0
                  ? "text-muted-foreground"
                  : pnl > 0
                    ? "text-profit"
                    : "text-loss";
              return (
                <li key={trade.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <DirectionMark direction={trade.direction} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {instrumentSymbol.get(trade.instrumentId) ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDay(trade.tradingDate)}
                    </div>
                  </div>
                  {trade.rMultiple !== null ? (
                    <span className={cn("font-mono text-xs font-medium tabular-nums", tint)}>
                      {formatR(trade.rMultiple)}
                    </span>
                  ) : null}
                  <span className={cn("w-24 text-right font-mono text-sm font-medium tabular-nums", tint)}>
                    {trade.pnlNet === null ? "—" : formatSignedMoney(trade.pnlNet, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/trades"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
        >
          View all trades
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
