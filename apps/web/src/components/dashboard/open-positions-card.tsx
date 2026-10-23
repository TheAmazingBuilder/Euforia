"use client";

import { ArrowDownRight, ArrowUpRight, Activity } from "lucide-react";
import type { Currency, Instrument, Trade } from "@cosmoz/shared";
import { formatSignedMoney, formatNumber } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useAccounts, useInstruments, useTrades } from "@/lib/api/queries";
import {
  useLiveQuotes,
  unrealizedPnl,
} from "@/lib/realtime/market";
import { cn } from "@/lib/utils";

interface PositionRowProps {
  trade: Trade;
  instrument: Instrument | undefined;
  currency: Currency;
  lastPrice: number | null;
  live: boolean;
}

/**
 * One open position: direction stamp, entry → live price and the unrealized
 * P&L recomputed on every market tick (qty × contract size × price delta).
 */
function PositionRow({ trade, instrument, currency, lastPrice, live }: PositionRowProps) {
  const unrealized = unrealizedPnl({
    entryPrice: trade.entryPrice,
    quantity: trade.quantity,
    contractSize: instrument?.contractSize ?? "1",
    direction: trade.direction,
    lastPrice,
  });

  const risk = trade.riskAmount !== null ? Number(trade.riskAmount) : null;
  const liveR = unrealized !== null && risk !== null && risk > 0 ? unrealized / risk : null;
  const winning = unrealized !== null && unrealized >= 0;

  return (
    <li
      data-testid="open-position-row"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-4 py-3 last:border-0"
    >
      <span
        className={cn(
          "inline-flex w-20 shrink-0 items-center gap-1 font-mono text-xs font-semibold",
          trade.direction === "BUY" ? "text-profit" : "text-loss",
        )}
      >
        {trade.direction === "BUY" ? (
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="size-3.5" aria-hidden="true" />
        )}
        {trade.direction}
      </span>

      <span className="w-24 shrink-0 font-heading text-sm font-semibold text-foreground">
        {instrument?.symbol ?? "-"}
      </span>

      <span className="hidden flex-col text-[11px] text-muted-foreground sm:flex">
        <span>
          qty <span className="font-mono tabular-nums text-foreground">{formatNumber(trade.quantity, 2)}</span>
        </span>
        <span>
          entry <span className="font-mono tabular-nums text-foreground">{formatNumber(trade.entryPrice, 2)}</span>
        </span>
      </span>

      <span className="ml-auto flex flex-col items-end gap-0.5">
        <span
          data-testid="open-position-pnl"
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            unrealized === null ? "text-muted-foreground" : winning ? "text-profit" : "text-loss",
          )}
        >
          {unrealized === null ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", live ? "bg-profit animate-pulse" : "bg-muted-foreground/40")}
              />
              waiting for tick…
            </span>
          ) : (
            formatSignedMoney(unrealized, currency, { digits: 2 })
          )}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {liveR !== null ? `${liveR >= 0 ? "+" : ""}${formatNumber(liveR, 2)} R` : "-"}
          {lastPrice !== null ? (
            <>
              {" · "}last <span className="text-foreground">{formatNumber(lastPrice, 2)}</span>
            </>
          ) : null}
        </span>
      </span>
    </li>
  );
}

/**
 * Open positions — the dashboard's live risk block. Positions come from
 * GET /trades?status=OPEN; the last price streams over the market
 * websocket (polling fallback) so the unrealized P&L breathes with the tape.
 */
export function OpenPositionsCard() {
  const { data, isLoading } = useTrades({ status: "OPEN" });
  const { data: instrumentsData } = useInstruments();
  const { data: accountsData } = useAccounts();
  const { quotes, connected, source } = useLiveQuotes();

  const openTrades: Trade[] = data?.trades ?? [];
  const instruments = instrumentsData?.instruments ?? [];
  const currency: Currency =
    accountsData?.accounts.find((account) => account.isDefault)?.currency ??
    accountsData?.accounts[0]?.currency ??
    "USD";

  // Aggregate unrealized across positions (live block in the header).
  let totalUnrealized: number | null = null;
  for (const trade of openTrades) {
    const instrument = instruments.find((item) => item.id === trade.instrumentId);
    const quote = quotes.get(instrument?.symbol ?? "");
    const value = unrealizedPnl({
      entryPrice: trade.entryPrice,
      quantity: trade.quantity,
      contractSize: instrument?.contractSize ?? "1",
      direction: trade.direction,
      lastPrice: quote?.price ?? null,
    });
    if (value !== null) {
      totalUnrealized = (totalUnrealized ?? 0) + value;
    }
  }

  return (
    <Card className="bg-surface" data-testid="open-positions-card">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            Open positions
            {openTrades.length > 0 ? (
              <span
                data-testid="open-positions-count"
                className="rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-accent"
              >
                {openTrades.length}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription className="text-xs">
            Unrealized P&L - last price in real time
            <span
              className={cn(
                "ml-1.5 inline-flex items-center gap-1",
                connected ? "text-profit" : "text-muted-foreground",
              )}
              title={connected ? "Market websocket connected" : "Reconnecting - polling fallback"}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  connected ? "animate-pulse bg-profit" : "bg-warning",
                )}
              />
              {connected ? (source === "socket" ? "live" : "live (poll)") : "connecting…"}
            </span>
          </CardDescription>
        </div>
        {totalUnrealized !== null ? (
          <span
            data-testid="open-positions-total"
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              totalUnrealized >= 0 ? "text-profit" : "text-loss",
            )}
          >
            {formatSignedMoney(totalUnrealized, currency, { digits: 2 })}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 px-4 pb-4">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : openTrades.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center" data-testid="open-positions-empty">
            <Activity className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Flat</p>
            <p className="text-xs text-muted-foreground">
              No open positions - enjoy the quiet or capture the next setup.
            </p>
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto overscroll-contain" aria-label="Open positions">
            {openTrades.map((trade) => {
              const instrument = instruments.find((item) => item.id === trade.instrumentId);
              const quote = quotes.get(instrument?.symbol ?? "");
              return (
                <PositionRow
                  key={trade.id}
                  trade={trade}
                  instrument={instrument}
                  currency={currency}
                  lastPrice={quote?.price ?? null}
                  live={connected}
                />
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
