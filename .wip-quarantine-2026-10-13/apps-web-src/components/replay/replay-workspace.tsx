"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronLeft,
  CircleSlash,
  CornerDownLeft,
  Flag,
  Pause,
  Play,
  RotateCcw,
  StickyNote,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisChart, type SimulatedTradeOverlay } from "@/components/session/analysis-chart";
import { bucketStartOf, formatMoney, formatNumber, formatPrice, visibleCandles } from "@cosmoz/shared";
import type { ReplayDecision, ReplayTrade, ReplaySession } from "@cosmoz/shared";
import { loadPersistedChartState } from "@/lib/utils/chart-state";
import {
  feedLagging,
  useReplayFeed,
} from "@/lib/replay/use-replay-feed";
import {
  useReplayAdvance,
  useReplayComplete,
  useReplayCreateDecision,
  useReplayDeleteDecision,
  useReplayDeleteNote,
  useReplayDeleteTrade,
  useReplayDetail,
} from "@/lib/api/queries";
import { useInstruments, useSetups, useStrategies } from "@/lib/api/queries";
import { ReplayCloseTradeDialog, ReplayNoteDialog, ReplayTradeDialog } from "@/components/replay/replay-dialogs";
import { ReplayResultPanel } from "@/components/replay/replay-result";
import { REPLAY_SPEEDS, ReplayEngine, type ReplayPlaybackState, type ReplaySpeed } from "@cosmoz/shared";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Replay workspace (REPLAY MASTER PROMPT §10/§44/§19/§25/§28/§33) — the
 * playback workstation: chart center, right context panel, transport +
 * timeline under, simulated activity (trades / decisions / notes) at the
 * bottom. The market reveals candle by candle through the deterministic
 * engine; the feed and the engine together enforce the look-ahead boundary
 * (§18). Everything recorded here is SIMULATED — the header badge never
 * leaves the screen.
 */

const INTERVAL_MS: Record<ReplaySession["config"]["interval"], number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

const TICK_MS = 200;

const DECISION_ICONS: Record<ReplayDecision["kind"], React.ReactNode> = {
  ENTER: <ArrowUpRight className="size-3" aria-hidden="true" />,
  WAIT: <Pause className="size-3" aria-hidden="true" />,
  MOVE_STOP: <Flag className="size-3" aria-hidden="true" />,
  EXIT: <CornerDownLeft className="size-3" aria-hidden="true" />,
  SKIP_SETUP: <CircleSlash className="size-3" aria-hidden="true" />,
};

function utcClock(ms: number, withSeconds = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(ms));
}

type ActivityTab = "trades" | "decisions" | "notes";

export function ReplayWorkspace({ sessionId }: { sessionId: string }) {
  const { dict } = useI18n();
  const T = dict.replay;
  const detail = useReplayDetail(sessionId);
  const instrumentsQuery = useInstruments();
  const instruments = React.useMemo(() => instrumentsQuery.data?.instruments ?? [], [instrumentsQuery.data]);
  const strategiesQuery = useStrategies();
  const strategies = React.useMemo(() => strategiesQuery.data?.strategies ?? [], [strategiesQuery.data]);
  const setupsQuery = useSetups();
  const setups = React.useMemo(() => setupsQuery.data?.setups ?? [], [setupsQuery.data]);

  const advance = useReplayAdvance();
  const complete = useReplayComplete();
  const createDecision = useReplayCreateDecision(sessionId);
  const deleteDecision = useReplayDeleteDecision(sessionId);
  const deleteNote = useReplayDeleteNote(sessionId);
  const deleteTrade = useReplayDeleteTrade(sessionId);

  const [tab, setTab] = React.useState<ActivityTab>("trades");
  const [tradeDialogOpen, setTradeDialogOpen] = React.useState(false);
  const [tradeDirection, setTradeDirection] = React.useState<"BUY" | "SELL">("BUY");
  const [closingTrade, setClosingTrade] = React.useState<ReplayTrade | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);

  const session = React.useMemo(() => detail.data?.session ?? null, [detail.data]);
  const trades = React.useMemo(() => detail.data?.trades ?? [], [detail.data]);
  const decisions = React.useMemo(() => detail.data?.decisions ?? [], [detail.data]);
  const notes = React.useMemo(() => detail.data?.notes ?? [], [detail.data]);

  // ── Engine — deterministic playback core (§17) ────────────────────────────
  const [engine, setEngine] = React.useState<ReplayEngine | null>(null);
  const [engineSessionId, setEngineSessionId] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<{
    state: ReplayPlaybackState;
    currentMs: number;
    speed: ReplaySpeed;
    progressPct: number;
  } | null>(null);

  // Created exactly once per session identity — the React "adjust state when
  // props change" render-phase pattern (same as the Tasky board sync).
  if (session && engineSessionId !== session.id) {
    const created = new ReplayEngine({
      datasetStartMs: session.config.fromMs,
      datasetEndMs: session.config.toMs,
      startAtMs: Math.min(Math.max(session.currentMs, session.config.fromMs), session.config.toMs),
      stepMs: INTERVAL_MS[session.config.interval],
    });
    // Resumed sessions pick up exactly where the checkpoint left them (§33),
    // except COMPLETED ones which re-arm at the configured start point.
    if (session.status === "COMPLETED") created.reset();
    setEngineSessionId(session.id);
    setEngine(created);
    setSnapshot(created.snapshot);
  }

  // Ref mirror for the unmount checkpoint (refs are written in effects only).
  const engineRef = React.useRef<ReplayEngine | null>(null);
  React.useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  const sessionRef = React.useRef(session);
  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const bucketMs = session ? INTERVAL_MS[session.config.interval] : 60_000;
  const currentMs = snapshot?.currentMs ?? session?.config.startAtMs ?? 0;
  const playing = snapshot?.state === "PLAYING";

  // Ticker — the ONLY wall-clock input; the engine stays deterministic.
  React.useEffect(() => {
    if (!playing || engine === null) return;
    let last = window.performance.now();
    const id = window.setInterval(() => {
      const now = window.performance.now();
      const elapsed = now - last;
      last = now;
      engine.advance(elapsed);
      setSnapshot(engine.snapshot);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, engine]);

  /** Persist the resume checkpoint — on pause and on leave (§51, coarse). */
  const checkpoint = React.useCallback(() => {
    if (!session || engine === null) return;
    if (session.status === "COMPLETED" || session.status === "ARCHIVED") return;
    if (engine.snapshot.state === "COMPLETED") return;
    advance.mutate({
      sessionId: session.id,
      currentMs: Math.floor(engine.snapshot.currentMs),
      playbackState: engine.snapshot.state,
    });
  }, [session, engine, advance]);

  React.useEffect(() => {
    return () => {
      // Fire-and-forget checkpoint on unmount (§33 — resume where you left).
      const live = engineRef.current;
      const liveSession = sessionRef.current;
      if (live && liveSession && liveSession.status !== "COMPLETED" && liveSession.status !== "ARCHIVED") {
        void apiCheckpoint(liveSession.id, live.snapshot);
      }
    };
  }, []);

  // ── Feed — the look-ahead-protected candle boundary (§18) ─────────────────
  const feed = useReplayFeed({
    symbol: session?.config.symbol ?? "",
    interval: session?.config.interval ?? "15m",
    fromMs: session?.config.fromMs ?? 0,
    toMs: session?.config.toMs ?? 1,
    bucketMs,
    revealToMs: bucketStartOf(currentMs, bucketMs),
    enabled: session !== null,
  });

  const visible = React.useMemo(
    () => visibleCandles(feed.candles, currentMs),
    [feed.candles, currentMs],
  );

  const instrument = React.useMemo(
    () => instruments.find((item) => item.symbol === session?.config.symbol) ?? null,
    [instruments, session?.config.symbol],
  );
  const strategyName = React.useMemo(
    () => strategies.find((strategy) => strategy.id === session?.config.strategyId)?.name ?? null,
    [strategies, session?.config.strategyId],
  );
  const setupName = React.useMemo(
    () => setups.find((setup) => setup.id === session?.config.setupId)?.name ?? null,
    [setups, session?.config.setupId],
  );
  const digits = instrument?.digits ?? 5;
  const lastPrice = visible.length > 0 ? visible[visible.length - 1]!.c : null;

  // The trader's chart template seeds the replay workspace (indicators +
  // drawings), same semantics as the Session Live replay (§21/§22 reuse).
  const seeded = React.useMemo(
    () => loadPersistedChartState(session?.config.symbol ?? ""),
    [session?.config.symbol],
  );

  // Revealed activity — future records stay invisible until the playhead
  // passes them (§18 applies to recorded activity as much as to candles).
  const revealedTrades = React.useMemo(
    () => trades.filter((trade) => trade.openedAtMs <= currentMs),
    [trades, currentMs],
  );
  const revealedDecisions = React.useMemo(
    () => decisions.filter((decision) => decision.atMs <= currentMs),
    [decisions, currentMs],
  );
  const revealedNotes = React.useMemo(
    () => notes.filter((note) => note.atMs <= currentMs),
    [notes, currentMs],
  );

  const simOverlays = React.useMemo<SimulatedTradeOverlay[]>(
    () =>
      revealedTrades.map((trade) => ({
        id: trade.id,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        exitPrice: trade.closedAtMs !== null && trade.closedAtMs <= currentMs ? trade.exitPrice : null,
      })),
    [revealedTrades, currentMs],
  );

  // ── Loading / error shells ──────────────────────────────────────────────────
  if (detail.isLoading) {
    return (
      <div className="space-y-3" data-testid="replay-workspace-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="replay-workspace-missing">
        Replay not found.{" "}
        <Link href="/replay" className="text-accent underline-offset-2 hover:underline">
          {T.workspace.backToList}
        </Link>
      </p>
    );
  }

  const replayable = session.status !== "ARCHIVED";
  const lag = feedLagging(feed, currentMs, bucketMs);

  return (
    <div
      className="space-y-3"
      data-testid="replay-workspace"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || engine === null) return;
        if (event.key === " ") {
          event.preventDefault();
          if (playing) {
            engine.pause();
            checkpoint();
          } else {
            engine.start();
          }
          setSnapshot(engine.snapshot);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          engine.stepForward();
          setSnapshot(engine.snapshot);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          engine.stepBackward();
          setSnapshot(engine.snapshot);
        }
      }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2" data-testid="replay-workspace-header">
        <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
          <Link href="/replay">
            <ChevronLeft className="size-4" aria-hidden="true" />
            {T.workspace.backToList}
          </Link>
        </Button>
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
          {session.config.symbol} · {session.config.interval}
        </h2>
        <Badge variant="outline" className="gap-1 border-accent/40 bg-accent/10 font-mono text-accent" data-testid="replay-simulated-badge">
          <BadgeCheck className="size-3" aria-hidden="true" />
          {T.workspace.simulatedBadge}
        </Badge>
        <Badge variant="outline" className="font-mono">
          {utcClock(session.config.fromMs)} → {utcClock(session.config.toMs)} UTC
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {T.status[session.status]}
        </Badge>
        {replayable && session.status !== "COMPLETED" ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5"
            disabled={complete.isPending}
            onClick={() => {
              if (engine !== null) engine.seek(session.config.toMs);
              complete.mutate(session.id);
            }}
            data-testid="replay-complete"
          >
            <Flag className="size-3.5" aria-hidden="true" />
            {T.result.title}
          </Button>
        ) : null}
      </div>

      {session.status === "COMPLETED" && session.result ? <ReplayResultPanel session={session} /> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_270px]">
        {/* Chart column */}
        <div className="min-w-0 space-y-2">
          {/* Honest feed states (§53) */}
          {feed.status === "error" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" data-testid="replay-feed-error">
              <span>{T.workspace.feedError}</span>
              <Button size="sm" variant="outline" onClick={feed.retry} data-testid="replay-feed-retry">
                {T.workspace.feedRetry}
              </Button>
            </div>
          ) : null}
          {feed.status === "empty" ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" data-testid="replay-feed-empty">
              {T.workspace.feedEmpty}
            </p>
          ) : null}

          <AnalysisChart
            symbol={session.config.symbol}
            interval={session.config.interval}
            instrument={instrument}
            data={visible.length > 0 || feed.status === "ready" ? { symbol: session.config.symbol, interval: session.config.interval, source: feed.source ?? "sim", candles: visible } : undefined}
            isLoading={feed.status === "loading" || feed.status === "idle"}
            isError={feed.status === "error"}
            quote={null}
            overlayTrades={[]}
            simulatedTrades={simOverlays}
            indicators={seeded.indicators ?? []}
            drawings={seeded.drawings ?? []}
            tool={null}
            onDrawingCreate={() => {}}
            onToolDone={() => {}}
            heightClass="h-[280px] sm:h-[400px]"
          />

          {/* Transport (§19) */}
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5" data-testid="replay-transport">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (engine === null) return;
                  engine.reset();
                  setSnapshot(engine.snapshot);
                }}
                aria-label={T.workspace.transport.reset}
                data-testid="replay-reset"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (engine === null) return;
                  if (playing) {
                    engine.pause();
                    checkpoint();
                  } else {
                    engine.start();
                  }
                  setSnapshot(engine.snapshot);
                }}
                aria-label={playing ? T.workspace.transport.pause : T.workspace.transport.start}
                aria-pressed={playing}
                data-testid="replay-play"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
              >
                {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (engine === null) return;
                  engine.stepBackward();
                  setSnapshot(engine.snapshot);
                }}
                aria-label={T.workspace.transport.stepBack}
                data-testid="replay-step-back"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (engine === null) return;
                  engine.stepForward();
                  setSnapshot(engine.snapshot);
                }}
                aria-label={T.workspace.transport.stepForward}
                data-testid="replay-step-forward"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-3.5 -scale-x-100" aria-hidden="true" />
              </button>

              {/* Scrubber with recorded-activity markers */}
              <div className="relative min-w-0 flex-1">
                <input
                  type="range"
                  min={session.config.startAtMs}
                  max={session.config.toMs}
                  step={Math.max(Math.floor(bucketMs / 4), 1)}
                  value={currentMs}
                  onChange={(event) => {
                    if (engine === null) return;
                    engine.pause();
                    engine.seek(Number(event.target.value));
                    setSnapshot(engine.snapshot);
                    checkpoint();
                  }}
                  aria-label={T.workspace.transport.scrub}
                  data-testid="replay-scrubber"
                  className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
                />
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0" aria-hidden="true">
                  {revealedDecisions.map((decision) => (
                    <span
                      key={decision.id}
                      className="absolute size-1.5 -translate-x-1/2 -translate-y-[3px] rounded-full bg-accent"
                      style={{ left: `${pctOf(decision.atMs, session.config.startAtMs, session.config.toMs)}%` }}
                    />
                  ))}
                  {revealedTrades.map((trade) => (
                    <span
                      key={trade.id}
                      className={cn(
                        "absolute size-1.5 -translate-x-1/2 translate-y-[3px] rounded-full",
                        trade.direction === "BUY" ? "bg-profit" : "bg-loss",
                      )}
                      style={{ left: `${pctOf(trade.openedAtMs, session.config.startAtMs, session.config.toMs)}%` }}
                    />
                  ))}
                </div>
              </div>

              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="replay-clock" aria-label={T.workspace.transport.clockAria}>
                {utcClock(currentMs, true)} UTC
              </span>
              {lag ? <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" /> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={T.workspace.transport.speed}>
              <span className="ledger-label mr-1">{T.workspace.transport.speed}</span>
              {REPLAY_SPEEDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={snapshot?.speed === value}
                  data-testid={`replay-speed-${value}`}
                  onClick={() => {
                    if (engine === null) return;
                    engine.setSpeed(value);
                    setSnapshot(engine.snapshot);
                  }}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                    snapshot?.speed === value
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
                  )}
                >
                  {value}×
                </button>
              ))}
              <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                {Math.round(snapshot?.progressPct ?? 0)}%
              </span>
            </div>
          </div>

          {/* Simulate / decide / note — the trader's action bar */}
          {replayable && session.status !== "COMPLETED" ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2" data-testid="replay-actionbar">
              <Button size="sm" variant="outline" className="gap-1.5 border-profit/40 text-profit hover:bg-profit/10" onClick={() => { setTradeDirection("BUY"); setTradeDialogOpen(true); }} data-testid="replay-sim-long">
                <ArrowUpRight className="size-4" aria-hidden="true" />
                {T.trade.long}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-loss/40 text-loss hover:bg-loss/10" onClick={() => { setTradeDirection("SELL"); setTradeDialogOpen(true); }} data-testid="replay-sim-short">
                <ArrowDownRight className="size-4" aria-hidden="true" />
                {T.trade.short}
              </Button>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              {(["ENTER", "WAIT", "MOVE_STOP", "EXIT", "SKIP_SETUP"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  title={T.decision[kind]}
                  aria-label={T.decision[kind]}
                  data-testid={`replay-decision-${kind}`}
                  disabled={createDecision.isPending}
                  onClick={() => createDecision.mutate({ kind })}
                  className="inline-flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {DECISION_ICONS[kind]}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setNoteDialogOpen(true)} data-testid="replay-add-note">
                <StickyNote className="size-4" aria-hidden="true" />
                {T.note.add}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Context panel (§44) */}
        <aside className="min-w-0 space-y-3" aria-label={T.workspace.contextTitle} data-testid="replay-context">
          <div className="rounded-xl border border-border bg-surface">
            <header className="border-b border-border px-3 py-2">
              <p className="ledger-label">{T.workspace.contextTitle}</p>
            </header>
            <dl className="space-y-2 px-3 py-2.5 text-sm">
              <ContextRow label={T.workspace.priceLabel}>
                <span className="font-mono tabular-nums text-foreground" data-testid="replay-price">
                  {lastPrice !== null ? formatPrice(lastPrice, digits) : "—"}
                </span>
              </ContextRow>
              <ContextRow label={T.workspace.strategyLabel}>
                {strategyName ?? <span className="text-muted-foreground">—</span>}
              </ContextRow>
              <ContextRow label={T.workspace.setupLabel}>
                {setupName ?? <span className="text-muted-foreground">—</span>}
              </ContextRow>
              <ContextRow label={T.workspace.balanceLabel}>
                <span className="font-mono tabular-nums text-foreground">
                  {session.config.startingBalance ? formatMoney(Number(session.config.startingBalance), instrument?.quoteCurrency ?? "USD") : "—"}
                </span>
              </ContextRow>
              <ContextRow label={T.workspace.riskLabel}>
                <span className="font-mono tabular-nums text-foreground">
                  {session.config.riskPerTradePct !== null ? `${session.config.riskPerTradePct}%` : "—"}
                </span>
              </ContextRow>
              <ContextRow label={T.workspace.feedLabel}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", feed.status === "ready" ? "bg-profit" : feed.status === "error" ? "bg-loss" : "bg-warning")} aria-hidden="true" />
                  <span className="text-xs text-muted-foreground" data-testid="replay-feed-status">
                    {feed.status === "ready"
                      ? `${T.workspace.feedLive}${feed.source === "sim" ? " · SIM" : ""}`
                      : feed.status === "error"
                        ? T.workspace.feedError.slice(0, 40) + "…"
                        : T.workspace.feedLoading}
                  </span>
                </span>
              </ContextRow>
            </dl>
          </div>
        </aside>
      </div>

      {/* Activity (§24/§25/§28) */}
      <section className="rounded-xl border border-border bg-surface" data-testid="replay-activity">
        <div className="flex gap-1 border-b border-border px-2 pt-2" role="tablist">
          {(
            [
              { key: "trades" as const, label: `${T.workspace.activity.tabTrades} (${revealedTrades.length})` },
              { key: "decisions" as const, label: `${T.workspace.activity.tabDecisions} (${revealedDecisions.length})` },
              { key: "notes" as const, label: `${T.workspace.activity.tabNotes} (${revealedNotes.length})` },
            ]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-testid={`replay-tab-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-t-md px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === key ? "border border-b-transparent border-border bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[280px] overflow-y-auto p-2">
          {tab === "trades" ? (
            revealedTrades.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">{T.workspace.activity.emptyTrades}</p>
            ) : (
              <ul className="space-y-1.5">
                {revealedTrades.map((trade) => (
                  <li key={trade.id} data-testid="replay-trade-row" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
                    <span className={cn("inline-flex items-center gap-1 font-semibold", trade.direction === "BUY" ? "text-profit" : "text-loss")}>
                      {trade.direction === "BUY" ? <ArrowUpRight className="size-3" aria-hidden="true" /> : <ArrowDownRight className="size-3" aria-hidden="true" />}
                      {trade.direction === "BUY" ? T.trade.long : T.trade.short}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {T.workspace.activity.entryLabel} {formatPrice(Number(trade.entryPrice), digits)}
                      {trade.stopLoss ? ` · ${T.workspace.activity.stopLabel} ${formatPrice(Number(trade.stopLoss), digits)}` : ""}
                      {trade.takeProfit ? ` · ${T.workspace.activity.targetLabel} ${formatPrice(Number(trade.takeProfit), digits)}` : ""}
                    </span>
                    {trade.closedAtMs !== null && trade.closedAtMs <= currentMs ? (
                      <span className="font-mono tabular-nums text-muted-foreground">
                        → {T.workspace.activity.exitLabel} {formatPrice(Number(trade.exitPrice), digits)}
                      </span>
                    ) : (
                      <Badge variant="outline" className="border-warning/40 text-warning">{T.workspace.activity.openState}</Badge>
                    )}
                    {trade.closedAtMs !== null && trade.closedAtMs <= currentMs && trade.pnl !== null ? (
                      <span className={cn("ml-auto font-mono font-semibold tabular-nums", Number(trade.pnl) >= 0 ? "text-profit" : "text-loss")} data-testid="replay-trade-pnl">
                        {formatMoney(Number(trade.pnl), instrument?.quoteCurrency ?? "USD")}
                        {trade.rMultiple !== null ? ` · ${formatNumber(Number(trade.rMultiple), 2)}R` : ""}
                      </span>
                    ) : (
                      <span className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setClosingTrade(trade)} data-testid={`replay-close-${trade.id}`}>
                          {T.workspace.activity.closeTrade}
                        </Button>
                        <button
                          type="button"
                          aria-label={T.workspace.activity.deleteTrade}
                          onClick={() => deleteTrade.mutate(trade.id)}
                          className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-loss/10 hover:text-loss"
                        >
                          <Trash2 className="size-3" aria-hidden="true" />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : tab === "decisions" ? (
            revealedDecisions.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">{T.workspace.activity.emptyDecisions}</p>
            ) : (
              <ul className="space-y-1.5">
                {revealedDecisions.map((decision) => (
                  <li key={decision.id} data-testid="replay-decision-row" className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
                    <span className="font-mono tabular-nums text-muted-foreground">{utcClock(decision.atMs, true)}</span>
                    <span className="text-accent">{DECISION_ICONS[decision.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{T.decision[decision.kind]}</span>
                      {decision.note ? <span className="block text-muted-foreground">{decision.note}</span> : null}
                    </span>
                    <button
                      type="button"
                      aria-label={T.workspace.activity.deleteDecision}
                      onClick={() => deleteDecision.mutate(decision.id)}
                      className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-loss/10 hover:text-loss"
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : revealedNotes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">{T.workspace.activity.emptyNotes}</p>
          ) : (
            <ul className="space-y-1.5">
              {revealedNotes.map((note) => (
                <li key={note.id} data-testid="replay-note-row" className="flex items-start gap-2.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
                  <span className="mt-0.5 font-mono tabular-nums text-muted-foreground">{utcClock(note.atMs, true)}</span>
                  <span className="min-w-0 flex-1 leading-snug text-foreground">{note.body}</span>
                  <button
                    type="button"
                    aria-label={T.workspace.activity.deleteNote}
                    onClick={() => deleteNote.mutate(note.id)}
                    className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-loss/10 hover:text-loss"
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Dialogs */}
      <ReplayTradeDialog
        sessionId={session.id}
        open={tradeDialogOpen}
        onOpenChange={setTradeDialogOpen}
        instrument={instrument}
        lastPrice={lastPrice}
        startingBalance={session.config.startingBalance}
        riskPerTradePct={session.config.riskPerTradePct}
        direction={tradeDirection}
        onDirectionChange={setTradeDirection}
      />
      <ReplayCloseTradeDialog
        sessionId={session.id}
        trade={closingTrade}
        onOpenChange={(open) => !open && setClosingTrade(null)}
        lastPrice={lastPrice}
      />
      <ReplayNoteDialog sessionId={session.id} open={noteDialogOpen} onOpenChange={setNoteDialogOpen} currentMs={currentMs} />
    </div>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function pctOf(ms: number, from: number, to: number): number {
  if (to <= from) return 0;
  return Math.min(Math.max(((ms - from) / (to - from)) * 100, 0), 100);
}

/** Unmount checkpoint over the plain API path (mutation-free fetch). */
async function apiCheckpoint(sessionId: string, snapshot: { state: string; currentMs: number }): Promise<void> {
  try {
    const { apiRequest } = await import("@/lib/api/client");
    const { apiPaths } = await import("@/lib/api/endpoints");
    await apiRequest(apiPaths.replaySessionAdvance(sessionId), {
      method: "POST",
      body: { currentMs: Math.floor(snapshot.currentMs), playbackState: snapshot.state === "PLAYING" ? "PAUSED" : snapshot.state },
    });
  } catch {
    /* best-effort checkpoint — resume state stays honest via the last pause */
  }
}
