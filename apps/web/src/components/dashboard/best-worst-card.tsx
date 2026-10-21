"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Crown, Skull } from "lucide-react";
import type { Currency, Strategy, Trade } from "@cosmoz/shared";
import { formatR, formatSignedMoney } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts, useInstruments, useStrategies, useTrades } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/** Compact duration from two ISO stamps ("2h 15m", "3d 4h", "18m"). */
function formatDuration(fromIso: string, toIso: string): string {
  const ms = Math.max(0, Date.parse(toIso) - Date.parse(fromIso));
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

interface ExtremumCardProps {
  trade: Trade | null;
  symbol: string;
  strategyName: string | null;
  currency: Currency;
  tone: "best" | "worst";
}

/** Half of the card: one trade's verdict with its mini-metrics. */
function ExtremumBlock({ trade, symbol, strategyName, currency, tone }: ExtremumCardProps) {
  const Icon = tone === "best" ? Crown : Skull;
  const DirectionIcon = trade?.direction === "SELL" ? ArrowDownRight : ArrowUpRight;
  const isWin = trade !== null && (Number(trade.pnlNet) ?? 0) >= 0;

  return (
    <div
      data-testid={`trade-${tone}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        <Icon
          className={cn("size-3.5", tone === "best" ? "text-profit" : "text-loss")}
          aria-hidden="true"
        />
        {tone === "best" ? "Best trade" : "Worst trade"} · this month
      </p>

      {trade === null ? (
        <p className="text-sm text-muted-foreground">
          No closed trade yet this month.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate font-heading text-sm font-semibold text-foreground">
              {symbol}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] font-semibold",
                trade.direction === "BUY" ? "text-profit" : "text-loss",
              )}
            >
              <DirectionIcon className="size-3" aria-hidden="true" />
              {trade.direction}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-sm font-bold tabular-nums sm:text-base",
                isWin ? "text-profit" : "text-loss",
              )}
            >
              {formatSignedMoney(trade.pnlNet, currency, { digits: 0 })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span>
              <span className={cn(isWin ? "text-profit" : "text-loss")}>{formatR(trade.rMultiple)}</span> R
            </span>
            <span>
              {trade.exitAt !== null
                ? formatDuration(trade.entryAt, trade.exitAt)
                : "—"}
            </span>
            <span className="max-w-28 truncate">{strategyName ?? "Out of playbook"}</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Best & Worst trade of the month — the two verdicts worth remembering.
 * Ranked by R multiple (position-size independent) over closed trades whose
 * trading date falls in the current calendar month.
 */
export function BestWorstCard() {
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: accountsData } = useAccounts();

  const trades = React.useMemo(() => tradesData?.trades ?? [], [tradesData]);
  const instruments = instrumentsData?.instruments ?? [];
  const strategies: Strategy[] = strategiesData?.strategies ?? [];
  const currency: Currency =
    accountsData?.accounts.find((account) => account.isDefault)?.currency ??
    accountsData?.accounts[0]?.currency ??
    "USD";

  const monthPrefix = React.useMemo(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }, []);

  const monthTrades = React.useMemo(
    () =>
      trades.filter(
        (trade) => trade.status === "CLOSED" && trade.tradingDate.startsWith(monthPrefix),
      ),
    [trades, monthPrefix],
  );

  const best = React.useMemo(() => {
    let winner: Trade | null = null;
    for (const trade of monthTrades) {
      if (trade.rMultiple === null) continue;
      if (winner === null || (Number(trade.rMultiple) ?? 0) > (Number(winner.rMultiple) ?? 0)) {
        winner = trade;
      }
    }
    return winner;
  }, [monthTrades]);

  const worst = React.useMemo(() => {
    let loser: Trade | null = null;
    for (const trade of monthTrades) {
      if (trade.rMultiple === null) continue;
      if (loser === null || (Number(trade.rMultiple) ?? 0) < (Number(loser.rMultiple) ?? 0)) {
        loser = trade;
      }
    }
    return loser;
  }, [monthTrades]);

  const symbolOf = (trade: Trade | null): string =>
    trade ? instruments.find((item) => item.id === trade.instrumentId)?.symbol ?? "—" : "—";
  const strategyNameOf = (trade: Trade | null): string | null =>
    trade?.strategyId
      ? strategies.find((strategy) => strategy.id === trade.strategyId)?.name ?? null
      : null;

  return (
    <Card className="bg-surface" data-testid="best-worst-card">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold">Month extremes</CardTitle>
        <CardDescription className="text-xs">
          {monthTrades.length} closed trade{monthTrades.length === 1 ? "" : "s"} this month · ranked by R
          multiple
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <ExtremumBlock
          trade={best}
          symbol={symbolOf(best)}
          strategyName={strategyNameOf(best)}
          currency={currency}
          tone="best"
        />
        <ExtremumBlock
          trade={worst}
          symbol={symbolOf(worst)}
          strategyName={strategyNameOf(worst)}
          currency={currency}
          tone="worst"
        />
      </CardContent>
    </Card>
  );
}
