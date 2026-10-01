"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Flag,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Star,
  StickyNote,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnalysisChart } from "@/components/session/analysis-chart";
import { formatPrice } from "@cosmoz/shared";
import type {
  CandlesResponse,
  Instrument,
  MarketInterval,
  SessionLiveEvent,
  Trade,
  TradingSession,
} from "@cosmoz/shared";
import { loadPersistedChartState } from "@/lib/utils/chart-state";
import { useCandlesRange } from "@/lib/realtime/market";
import { biasLabel } from "@/i18n/dictionaries/en/session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Session Replay — watch a COMPLETED session unfold (increment ②).
 *
 * The market data plays back up to a moving playhead (provider-served
 * historical window — real candles for Binance symbols, the labeled SIM
 * walk otherwise; nothing is fabricated here that the feed didn't serve).
 * Session events (start, notes, levels, analyses, detected trades, end)
 * appear exactly when they happened, on the scrubber and in the event
 * feed. Journal trades surface as progressive Entry/SL/TP overlays.
 *
 * READ-ONLY by construction: a replay documents the past; it exposes no
 * action of any kind (MASTER PROMPT red line).
 */

const INTERVAL_MS: Record<MarketInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

const TICK_MS = 120;
const SPEEDS = [1, 30, 120, 480] as const;
type Speed = (typeof SPEEDS)[number];

const KIND_ICON: Record<SessionLiveEvent["kind"], React.ReactNode> = {
  SESSION_STARTED: <Play className="size-3" aria-hidden="true" />,
  SESSION_ENDED: <Flag className="size-3" aria-hidden="true" />,
  TRADE_DETECTED: <Zap className="size-3" aria-hidden="true" />,
  POSITION_UPDATED: <ArrowLeftRight className="size-3" aria-hidden="true" />,
  ANALYSIS_SAVED: <Star className="size-3" aria-hidden="true" />,
  NOTE_ADDED: <StickyNote className="size-3" aria-hidden="true" />,
  LEVEL_ADDED: <Layers className="size-3" aria-hidden="true" />,
  BIAS_CHANGED: <TrendingUp className="size-3" aria-hidden="true" />,
};

function utcClock(ms: number, withSeconds: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(ms));
}

interface SessionReplayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render keyed by session id — remounts reset the playback cleanly. */
  session: TradingSession;
  strategyName: string | null;
  instruments: Instrument[];
  /** All journal trades — filtered per session symbol for the overlays. */
  trades: Trade[];
}

export function SessionReplayDialog({ open, onOpenChange, session, strategyName, instruments, trades }: SessionReplayDialogProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const start = React.useMemo(() => Date.parse(session.startedAt), [session.startedAt]);
  // Replays open from completed sessions (endedAt set by the drawer); a null
  // end degenerates to a zero-length window rather than reading the clock.
  const end = React.useMemo(() => (session.endedAt !== null ? Date.parse(session.endedAt) : start), [session.endedAt, start]);
  const bucketMs = INTERVAL_MS[session.primaryTimeframe];

  // Historical window: 20 buckets of pre-roll context before the session.
  const windowFrom = start - 20 * bucketMs;

  const candles = useCandlesRange(session.primarySymbol, session.primaryTimeframe, windowFrom, end, open);
  const windowCandles = React.useMemo(() => candles.data?.candles ?? [], [candles.data]);

  // Playback state — autoplay from the first tick of the session.
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState<Speed>(120);
  const [playhead, setPlayhead] = React.useState(start);

  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPlayhead((current) => {
        const next = current + TICK_MS * speed;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, end]);

  const displayed = React.useMemo(() => {
    const slice = windowCandles.filter((candle) => candle.t <= playhead);
    return slice;
  }, [windowCandles, playhead]);

  const events = session.events;
  const currentIndex = React.useMemo(() => {
    let index = -1;
    for (let i = 0; i < events.length; i += 1) {
      if (Date.parse(events[i].at) <= playhead) index = i;
      else break;
    }
    return index;
  }, [events, playhead]);
  const currentEvent = currentIndex >= 0 ? events[currentIndex] : null;

  // Keep the active event in view inside the feed (no state writes).
  const currentRowRef = React.useRef<HTMLLIElement | null>(null);
  React.useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIndex]);

  // The trader's own chart template seeds the replay (indicators + drawings).
  const seeded = React.useMemo(() => loadPersistedChartState(session.primarySymbol), [session.primarySymbol]);

  const instrument = React.useMemo(
    () => instruments.find((item) => item.symbol === session.primarySymbol) ?? null,
    [instruments, session.primarySymbol],
  );
  const digits = instrument?.digits ?? 5;

  // Progressive trade overlays — entries revealed as the playhead passes them.
  const overlayTrades = React.useMemo(
    () =>
      trades.filter(
        (trade) =>
          instruments.find((item) => item.id === trade.instrumentId)?.symbol === session.primarySymbol &&
          Date.parse(trade.entryAt) <= playhead,
      ),
    [trades, instruments, session.primarySymbol, playhead],
  );

  const progressPct = end > start ? Math.min(100, ((playhead - start) / (end - start)) * 100) : 100;
  const spanMs = Math.max(end - start, 1);
  const replayData: CandlesResponse | undefined = React.useMemo(
    () => (candles.data === undefined ? undefined : { ...candles.data, candles: displayed }),
    [candles.data, displayed],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto lg:max-w-5xl" data-testid="session-replay-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading" data-testid="replay-title">
            {`${S.replay.title} — ${session.primarySymbol} · ${session.primaryTimeframe}`}
          </DialogTitle>
          <DialogDescription>
            {S.replay.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="replay-meta">
          <Badge variant="outline" className="font-mono">
            {utcClock(start, false)} → {utcClock(end, false)} UTC
          </Badge>
          <Badge variant="outline">{biasLabel(S, session.marketBias).toLowerCase()}</Badge>
          {strategyName ? <Badge variant="outline">{strategyName}</Badge> : null}
          <Badge variant="outline">{`${events.length} ${S.replay.eventsCount}`}</Badge>
          <Badge variant="outline">{`${overlayTrades.length} ${overlayTrades.length === 1 ? S.replay.tradeOne : S.replay.tradeMany}`}</Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_270px]">
          {/* Chart + transport */}
          <div className="min-w-0 space-y-2">
            {/* Current event banner */}
            <div
              className="flex min-h-[38px] items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm"
              data-testid="replay-event-current"
              data-event-kind={currentEvent?.kind ?? "none"}
            >
              {currentEvent ? (
                <>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-accent">{utcClock(Date.parse(currentEvent.at), false)}</span>
                  <span className="shrink-0 text-accent">{KIND_ICON[currentEvent.kind]}</span>
                  <span className="min-w-0 truncate font-medium text-foreground">{currentEvent.label}</span>
                  {currentEvent.source ? <span className="shrink-0 text-xs text-muted-foreground">{`— ${S.labels.source}: ${currentEvent.source}`}</span> : null}
                </>
              ) : (
                <span className="text-muted-foreground">{S.replay.preSession}</span>
              )}
            </div>

            <AnalysisChart
              symbol={session.primarySymbol}
              interval={session.primaryTimeframe}
              instrument={instrument}
              data={replayData}
              isLoading={candles.isLoading}
              isError={candles.isError}
              quote={null}
              overlayTrades={overlayTrades}
              indicators={seeded.indicators ?? []}
              drawings={seeded.drawings ?? []}
              tool={null}
              onDrawingCreate={() => {}}
              onToolDone={() => {}}
              heightClass="h-[260px] sm:h-[330px]"
            />
            {!candles.isLoading && windowCandles.length === 0 ? (
              <p className="text-xs text-warning" data-testid="replay-no-data">
                {S.replay.noData}
              </p>
            ) : null}

            {/* Transport: restart · play/pause · scrubber with event dots · clock · speed */}
            <div className="rounded-xl border border-border bg-surface px-3 py-2.5" data-testid="replay-transport">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(true);
                    setPlayhead(start);
                  }}
                  aria-label={S.replay.restartAria}
                  data-testid="replay-restart"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (playhead >= end) setPlayhead(start);
                    setPlaying((value) => !value);
                  }}
                  aria-label={playing ? S.chart.pauseAria : S.chart.playAria}
                  data-testid="replay-play"
                  aria-pressed={playing}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
                >
                  {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                </button>
                <div className="relative min-w-0 flex-1">
                  <input
                    type="range"
                    min={start}
                    max={end}
                    step={500}
                    value={playhead}
                    onChange={(event) => {
                      setPlaying(false);
                      setPlayhead(Number(event.target.value));
                    }}
                    aria-label={S.replay.scrubAria}
                    data-testid="replay-scrubber"
                    className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 h-0" aria-hidden="true">
                    {events.map((event, index) => (
                      <span
                        key={event.id}
                        className={cn(
                          "absolute size-1.5 -translate-x-1/2 -translate-y-[3px] rounded-full",
                          index <= currentIndex ? "bg-accent" : "bg-muted-foreground/50",
                        )}
                        style={{ left: `${Math.min(Math.max(((Date.parse(event.at) - start) / spanMs) * 100, 0), 100)}%` }}
                      />
                    ))}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="replay-clock">
                  {utcClock(playhead, true)} UTC
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5" role="group" aria-label={S.replay.speedGroupAria}>
                <span className="ledger-label mr-1">{S.replay.speed}</span>
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={speed === value}
                    data-testid={`replay-speed-${value}`}
                    onClick={() => setSpeed(value)}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                      speed === value
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
                    )}
                  >
                    {value}×
                  </button>
                ))}
                <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">{Math.round(progressPct)}%</span>
              </div>
            </div>
          </div>

          {/* Event feed */}
          <aside className="min-w-0 rounded-xl border border-border bg-surface" aria-label={S.replay.feedAria} data-testid="replay-feed">
            <header className="border-b border-border px-3 py-2">
              <p className="ledger-label">{S.labels.timeline}</p>
              <p className="text-[11px] text-muted-foreground">{S.replay.timelineHint}</p>
            </header>
            <ul className="max-h-[300px] space-y-0.5 overflow-y-auto p-2 lg:max-h-[420px]">
              {events.map((event, index) => {
                const state = index <= currentIndex ? (index === currentIndex ? "current" : "past") : "future";
                return (
                  <li
                    key={event.id}
                    ref={state === "current" ? currentRowRef : undefined}
                    data-testid="replay-event-row"
                    data-event-kind={event.kind}
                    data-state={state}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                      state === "current" && "border border-accent/50 bg-accent/10",
                      state === "past" && "opacity-80",
                      state === "future" && "opacity-40",
                    )}
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {utcClock(Date.parse(event.at), false)}
                    </span>
                    <span className={cn("mt-0.5 shrink-0", state === "current" ? "text-accent" : "text-muted-foreground")}>
                      {KIND_ICON[event.kind]}
                    </span>
                    <span className="min-w-0">
                      <span className="block leading-snug text-foreground">{event.label}</span>
                      {event.source ? <span className="block text-[10px] text-muted-foreground">{`${S.labels.source}: ${event.source}`}</span> : null}
                    </span>
                  </li>
                );
              })}
              {events.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-muted-foreground">{S.replay.emptyEvents}</li>
              ) : null}
            </ul>
            <footer className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              {S.replay.priceAtPlayhead}{" "}
              <span className="font-mono tabular-nums text-foreground" data-testid="replay-price">
                {displayed.length > 0 ? formatPrice(displayed[displayed.length - 1].c, digits) : "—"}
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-1 inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                data-testid="replay-close"
              >
                <X className="size-3" aria-hidden="true" />
                {S.replay.closeBtn}
              </button>
            </footer>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
