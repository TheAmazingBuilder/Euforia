"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, RefreshCcw, Stars } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DisciplineBanner } from "@/components/trades/discipline-banner";
import { BrokerPanel } from "@/components/session/broker-panel";
import { EventTimeline } from "@/components/session/event-timeline";
import { GhostSettlementNotifier } from "@/components/session/ghost-settlement-notifier";
import { GhostSettlements } from "@/components/session/ghost-settlements";
import { MoodStrip } from "@/components/session/mood-strip";
import { OpenTradeCard } from "@/components/session/open-trade-card";
import { PriceChart } from "@/components/session/price-chart";
import { RegretRegistry } from "@/components/session/regret-registry";
import { SessionToolbar } from "@/components/session/session-toolbar";
import { SymbolPositions } from "@/components/session/symbol-positions";
import {
  useAlerts,
  useInstruments,
  useSessionTimeline,
  useSkippedTrades,
  useStatsOverview,
  useTrades,
} from "@/lib/api/queries";
import { useCandles, useFeedStatus, useLiveQuotes, useLiveQuote } from "@/lib/realtime/market";
import type { Alert, Instrument, MarketInterval } from "@cosmoz/shared";

/**
 * Session Live — V1 real-time monitoring station (mission §22):
 *   1. Market: real prices (Binance for crypto) or labeled SIM feed,
 *      candlestick chart with timeframe + symbol switching;
 *   2. Journal positions marked to the live feed (read-only P&L);
 *   3. Real trading account monitoring, read-only (provider contract ready,
 *      honest NOT_CONFIGURED state until a broker is linked in Phase 2);
 *   4. The existing journaling flow — open-trade cards, timeline, mood,
 *      ghost check-ins, Regret Registry — unchanged below the station.
 */

function reminderIdOf(alert: Alert): string | null {
  if (alert.type !== "SYSTEM" || alert.dismissedAt !== null) return null;
  const payload = alert.payload as { skippedTradeId?: string } | null;
  return typeof payload?.skippedTradeId === "string" ? payload.skippedTradeId : null;
}

function SessionSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading session">
      <Skeleton className="h-[120px] rounded-xl" />
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[210px] rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-[280px] rounded-xl" />
          <Skeleton className="h-[180px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ErrorSession({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Session data unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The session view could not load your open trades and timeline. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyOpenTrades() {
  return (
    <Card className="bg-surface">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <CalendarCheck className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">No open trades</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Prepare your session: review your playbook, pre-flight your checklist and wait for a setup that is yours.
        </p>
        <Button asChild className="mt-6">
          <Link href="/journal">Plan the day</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function weekdayOf(dateKey: string): string {
  // The trading date is an API-resolved calendar day; display it anchored at
  // midday UTC so no timezone can shift it to another day.
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Initial symbol: follow an open position, else showcase the real feed. */
function pickDefaultSymbol(trades: Array<{ symbol?: string }>, instruments: Instrument[]): string | null {
  if (trades.length > 0) return trades[0].symbol ?? null;
  return instruments.find((item) => item.symbol === "BTCUSDT")?.symbol ?? instruments[0]?.symbol ?? null;
}

export function SessionView() {
  const timeline = useSessionTimeline();
  const openTrades = useTrades({ status: "OPEN" });
  const skipped = useSkippedTrades();
  const overview = useStatsOverview();
  const alerts = useAlerts();
  const { data: instrumentsData } = useInstruments();
  const queryClient = useQueryClient();

  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const trades = React.useMemo(() => openTrades.data?.trades ?? [], [openTrades.data]);

  // ── Station state ────────────────────────────────────────────────────────
  // The user's selection wins; the default derives from the data (first open
  // position, else the real-feed showcase symbol) — no state-sync effects.
  const [userSymbol, setUserSymbol] = React.useState<string | null>(null);
  const [interval, setIntervalState] = React.useState<MarketInterval>("5m");

  const autoSymbol = React.useMemo(
    () =>
      pickDefaultSymbol(
        trades.map((trade) => ({
          symbol: instruments.find((item) => item.id === trade.instrumentId)?.symbol,
        })),
        instruments,
      ),
    [trades, instruments],
  );
  const symbol = userSymbol ?? autoSymbol;

  const instrument = React.useMemo(
    () => instruments.find((item) => item.symbol === symbol) ?? null,
    [instruments, symbol],
  );
  const quote = useLiveQuote(symbol);
  const { phase } = useFeedStatus();
  const candles = useCandles(symbol ?? "", interval);
  const { quotes } = useLiveQuotes();

  // Journal open trades for the station: overlay + symbol panel.
  const symbolTrades = React.useMemo(
    () => trades.filter((trade) => instruments.find((item) => item.id === trade.instrumentId)?.symbol === symbol),
    [trades, instruments, symbol],
  );

  const isLoading = timeline.isLoading || openTrades.isLoading;
  const isError = timeline.isError || openTrades.isError;

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  // The settlement queue = pending ghosts the server has reminded us about.
  const pendingGhosts = React.useMemo(() => {
    const reminders = new Set((alerts.data?.alerts ?? []).map(reminderIdOf).filter((id): id is string => id !== null));
    return (skipped.data?.skippedTrades ?? []).filter(
      (ghost) => ghost.outcomeGuess === null && reminders.has(ghost.id),
    );
  }, [alerts.data, skipped.data]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <GhostSettlementNotifier ghosts={pendingGhosts} />

      <header className="space-y-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Session Live</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {timeline.data ? weekdayOf(timeline.data.date) : "Today"}
          {" · "}Real-time market monitoring and read-only account watching. Your journal positions are marked to the
          live feed; broker execution arrives in Phase 2 — nothing here can place or modify an order.
        </p>
        <DisciplineBanner />
      </header>

      {isLoading ? (
        <SessionSkeleton />
      ) : isError ? (
        <ErrorSession onRetry={retry} />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {/* ── Monitoring station ──────────────────────────────────────── */}
          <SessionToolbar
            instruments={instruments}
            symbol={symbol ?? ""}
            onSymbolChange={setUserSymbol}
            interval={interval}
            onIntervalChange={setIntervalState}
            quote={quote}
            phase={phase}
          />

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriceChart
                symbol={symbol ?? "—"}
                interval={interval}
                instrument={instrument}
                data={candles.data}
                isLoading={candles.isLoading}
                isError={candles.isError}
                quote={quote}
                overlayTrades={symbolTrades}
              />
            </div>
            <div className="space-y-3 sm:space-y-4">
              <BrokerPanel />
              <SymbolPositions trades={symbolTrades} instrument={instrument} quote={quote} />
            </div>
          </div>

          {/* ── Journaling flow (existing, unchanged contract) ──────────── */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <div className="space-y-3 sm:space-y-4 lg:col-span-2">
              <section aria-label="Open positions" className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-base font-semibold text-foreground">Open positions</h2>
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-xs tabular-nums text-accent">
                    {trades.length}
                  </span>
                </div>
                {trades.length === 0 ? (
                  <EmptyOpenTrades />
                ) : (
                  trades.map((trade) => {
                    const tradeInstrument = instruments.find((item) => item.id === trade.instrumentId) ?? null;
                    return (
                      <OpenTradeCard key={trade.id} trade={trade} instrument={tradeInstrument} quote={quotes.get(tradeInstrument?.symbol ?? "") ?? null} />
                    );
                  })
                )}
              </section>

              {overview.data ? (
                <RegretRegistry
                  disciplineSavedR={overview.data.disciplineSaved.rSaved}
                  disciplineSavedCount={overview.data.disciplineSaved.settledCount}
                  hesitationCostR={overview.data.hesitationCost.rCost}
                  hesitationCostCount={overview.data.hesitationCost.settledCount}
                  trend={overview.data.ghostTrend}
                />
              ) : null}
            </div>

            <aside className="space-y-3 sm:space-y-4" aria-label="Session sidebar">
              {pendingGhosts.length > 0 ? (
                <section id="ghost-settlements" className="rounded-xl border border-warning/40 bg-surface">
                  <header className="border-b border-border px-4 py-3">
                    <h2 className="font-heading text-base font-semibold text-foreground">Ghost check-in</h2>
                    <p className="text-xs text-muted-foreground">
                      Setups seen, not taken — how did they play out? Two taps each.
                    </p>
                  </header>
                  <div className="p-4">
                    <GhostSettlements ghosts={pendingGhosts} />
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-border bg-surface">
                <header className="border-b border-border px-4 py-3">
                  <h2 className="font-heading text-base font-semibold text-foreground">Today&apos;s timeline</h2>
                  <p className="text-xs text-muted-foreground">Entries, exits, stop changes and coach alerts.</p>
                </header>
                <div className="p-4">
                  {timeline.data ? <EventTimeline events={timeline.data.events} /> : null}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface">
                <header className="border-b border-border px-4 py-3">
                  <h2 className="font-heading text-base font-semibold text-foreground">Mood strip</h2>
                  <p className="text-xs text-muted-foreground">Today&apos;s logged feelings — your live tilt biomarker.</p>
                </header>
                <div className="p-4">
                  {timeline.data ? <MoodStrip moods={timeline.data.moods} /> : null}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
