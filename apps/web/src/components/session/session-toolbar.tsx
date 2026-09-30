"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { formatPrice } from "@cosmoz/shared";
import type { Instrument, MarketInterval } from "@cosmoz/shared";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SessionTimer } from "@/components/session/session-timer";
import { STALE_MS, type FeedPhase, type LiveQuote } from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Session Live station bar (mission §22): symbol selector, timeframe
 * selector, the marked price with its change vs reference, and the feed
 * status badge (§16/§17 — LIVE vs SIM vs STALE vs RECONNECTING vs OFFLINE).
 * The badge never claims liveness it cannot prove: simulated feeds read
 * "SIM", frozen feeds read "STALE — last update Ns ago".
 */

const INTERVALS: readonly MarketInterval[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

interface FeedBadgeProps {
  quote: LiveQuote | null;
  phase: FeedPhase;
}

export function FeedBadge({ quote, phase }: FeedBadgeProps) {
  // "Last update Ns ago" copy needs a 1 Hz heartbeat — time reads stay in
  // the useNowMs effect (purity rule); the store itself stays timer-free.
  const nowMs = useNowMs();

  const ageSec =
    quote !== null && nowMs !== null ? Math.max(0, Math.round((nowMs - quote.ts) / 1000)) : null;
  const stale = quote !== null && nowMs !== null && nowMs - quote.ts > STALE_MS;

  let tone: "accent" | "warning" | "loss" | "muted";
  let label: string;
  if (quote === null) {
    if (phase === "reconnecting") {
      tone = "warning";
      label = "RECONNECTING";
    } else if (phase === "offline") {
      tone = "loss";
      label = "OFFLINE";
    } else {
      tone = "muted";
      label = "CONNECTING";
    }
  } else if (stale) {
    tone = "warning";
    label = `STALE · ${ageSec}s`;
  } else if (quote.source === "real") {
    tone = "accent";
    label = "LIVE";
  } else {
    tone = "warning";
    label = "SIM";
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        data-testid="feed-badge"
        data-state={label.split(" ")[0].toLowerCase()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
          tone === "accent" && "border-accent/40 bg-accent/10 text-accent",
          tone === "warning" && "border-warning/50 bg-warning/10 text-warning",
          tone === "loss" && "border-loss/50 bg-loss/10 text-loss",
          tone === "muted" && "border-border bg-surface-raised text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            tone === "accent" && "animate-pulse bg-accent",
            tone === "warning" && "bg-warning",
            tone === "loss" && "bg-loss",
            tone === "muted" && "bg-muted-foreground",
          )}
        />
        {label}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {ageSec === null ? "waiting for first tick…" : `last update ${ageSec}s ago`}
      </span>
    </div>
  );
}

interface SessionToolbarProps {
  instruments: Instrument[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  interval: MarketInterval;
  onIntervalChange: (interval: MarketInterval) => void;
  quote: LiveQuote | null;
  phase: FeedPhase;
}

export function SessionToolbar({
  instruments,
  symbol,
  onSymbolChange,
  interval,
  onIntervalChange,
  quote,
  phase,
}: SessionToolbarProps) {
  const instrument = instruments.find((item) => item.symbol === symbol) ?? null;
  const digits = instrument?.digits ?? 5;

  const changeAbs = quote !== null ? quote.price - quote.prevClose : null;
  const changePct =
    quote !== null && quote.prevClose !== 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : null;

  return (
    <section
      aria-label="Market station controls"
      className="rounded-xl border border-border bg-surface"
      data-testid="session-toolbar"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        {/* Symbol */}
        <div className="space-y-1">
          <p className="ledger-label">Symbol</p>
          <Select value={symbol} onValueChange={onSymbolChange}>
            <SelectTrigger
              size="sm"
              aria-label="Select symbol"
              className="w-[150px] font-mono font-semibold"
              data-testid="symbol-select"
            >
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent>
              {instruments.map((item) => (
                <SelectItem key={item.id} value={item.symbol} className="font-mono">
                  {item.symbol}
                  <span className="ml-2 font-sans text-xs text-muted-foreground">{item.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timeframe */}
        <div className="space-y-1">
          <p className="ledger-label">Timeframe</p>
          <Select
            value={interval}
            onValueChange={(value) => onIntervalChange(value as MarketInterval)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Select timeframe"
              className="w-[84px] font-mono font-semibold"
              data-testid="interval-select"
            >
              <SelectValue placeholder="TF" />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((item) => (
                <SelectItem key={item} value={item} className="font-mono">
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Marked price */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="ledger-label">Marked price</p>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span
              data-testid="marked-price"
              className="font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl"
            >
              {quote !== null ? formatPrice(quote.price, digits) : "—"}
            </span>
            {changePct !== null && changeAbs !== null ? (
              <span
                data-testid="price-change"
                className={cn(
                  "inline-flex items-center gap-0.5 font-mono text-sm tabular-nums",
                  changeAbs >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {changeAbs >= 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                )}
                {changeAbs >= 0 ? "+" : "-"}
                {Math.abs(changePct).toFixed(2)}%
              </span>
            ) : null}
            {instrument ? (
              <span className="hidden text-xs text-muted-foreground md:inline">{instrument.name}</span>
            ) : null}
          </div>
        </div>

        {/* Session timer + configurable duration cap */}
        <SessionTimer />

        {/* Feed state */}
        <FeedBadge quote={quote} phase={phase} />
      </div>
    </section>
  );
}
