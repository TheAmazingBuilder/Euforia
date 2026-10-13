"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, RefreshCcw, Stars } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DisciplineBanner } from "@/components/trades/discipline-banner";
import { AnalysisChart } from "@/components/session/analysis-chart";
import { BrokerPanel } from "@/components/session/broker-panel";
import { PrivatePositionsStream } from "@/components/session/private-positions-stream";
import {
  ChartGrid,
  ChartGridToolbar,
  chartSyncGroupFor,
  loadMultiChart,
  persistMultiChart,
  type MultiChartLayout,
  type MultiChartState,
} from "@/components/session/chart-grid";
import { ContextTabs } from "@/components/session/context-tabs";
import { DrawingToolbar, IndicatorsPopover } from "@/components/session/chart-tool-rail";
import { EventTimeline } from "@/components/session/event-timeline";
import { GhostSettlementNotifier } from "@/components/session/ghost-settlement-notifier";
import { GhostSettlements } from "@/components/session/ghost-settlements";
import { KeyLevelsPanel, MarketContextPanel } from "@/components/session/market-context-panel";
import { MoodStrip } from "@/components/session/mood-strip";
import { OpenTradeCard } from "@/components/session/open-trade-card";
import { PriceAlertToaster } from "@/components/session/price-alert-toaster";
import { RegretRegistry } from "@/components/session/regret-registry";
import {
  EndSessionDialog,
  SessionHistoryDrawer,
  SessionLiveHeader,
  StartSessionDialog,
} from "@/components/session/session-shell";
import { SessionLogbook } from "@/components/session/session-logbook";
import { SessionReplayDialog } from "@/components/session/session-replay";
import { SessionTimer } from "@/components/session/session-timer";
import { SymbolPicker } from "@/components/session/symbol-picker";
import { SymbolPositions } from "@/components/session/symbol-positions";
import {
  useAlerts,
  useSavedAnalyses,
  useKeyLevels,
  useInstruments,
  useSessionLiveState,
  useSessionTimeline,
  useSkippedTrades,
  useStatsOverview,
  useStrategies,
  useTrades,
  useUpdateSessionLive,
} from "@/lib/api/queries";
import { useBrokerSession } from "@/lib/api/queries";
import { useCandles, useFeedStatus, useLiveQuote, useLiveQuotes } from "@/lib/realtime/market";
import { atrNow } from "@/lib/utils/indicators";
import { loadPersistedChartState, persistChartState, defaultIndicatorTemplate } from "@/lib/utils/chart-state";
import { useI18n } from "@/i18n/i18n-provider";
import type {
  BrokerPosition,
  DrawingKind,
  DrawingObject,
  IndicatorConfig,
  Instrument,
  KeyLevel,
  MarketBias,
  MarketInterval,
  SavedAnalysis,
  Trade,
  TradingSession,
} from "@cosmoz/shared";
import type { LiveQuote } from "@/lib/realtime/market";
import { cn } from "@/lib/utils";

/**
 * Session Live — the professional real-time ANALYSIS COCKPIT (V1 rebuild).
 *
 * MASTER PROMPT core rule: Session Live is a workspace for
 * READ MARKET + ANALYZE + MONITOR + DOCUMENT. It can never place, modify,
 * cancel or close anything — execution stays on MT5/TradingView, and every
 * panel here is read-only or edits application-owned documentation
 * (sessions, analyses, levels, notes).
 *
 * Composition (adapted from MASTER PROMPT §73 to this app's design system):
 *  - Header: session lifecycle + duration + market/broker feed badges + bias;
 *  - Left rail: market selector (search/favorites/recents), timeframes,
 *    indicators + drawings;
 *  - Center: the analysis chart (candles, indicator panes, drawings, replay,
 *    read-only position overlays);
 *  - Right rail: market context (objective vs interpretation), key levels,
 *    account + symbol positions;
 *  - Bottom: Playbook / Rules / Economy / Analyses context strip;
 *  - Below: the existing journaling flow — open-trade cards, regret
 *    registry, logbook, ghost check-ins, timeline, mood — unchanged.
 *
 * The workspace chart state (timeframe, indicators, drawings) is owned by a
 * per-symbol child (`Workspace`, keyed by symbol) whose state seeds from
 * localStorage at mount and persists through a write-only effect — the
 * pattern the codebase uses to keep effects free of setState.
 */

const TIMEFRAMES: readonly MarketInterval[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

// Per-symbol chart persistence lives in lib/utils/chart-state.ts — shared
// with the session replay so a replayed session opens with the trader's
// own indicator template.

function SessionSkeleton() {
  const { dict } = useI18n();
  const S = dict.session;
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label={S.view.loadingAria}>
      <Skeleton className="h-[72px] rounded-xl" />
      <div className="space-y-3 sm:space-y-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl sm:h-[520px] xl:h-[640px]" />
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-[230px] rounded-xl" />
          <Skeleton className="h-[230px] rounded-xl" />
          <Skeleton className="h-[230px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ErrorSession({ onRetry }: { onRetry: () => void }) {
  const { dict } = useI18n();
  const S = dict.session;
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">{S.view.errorTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {S.view.errorBody}
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          {dict.common.retry}
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyOpenTrades() {
  const { dict } = useI18n();
  const S = dict.session;
  return (
    <Card className="bg-surface">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <CalendarCheck className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">{S.view.emptyTradesTitle}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {S.view.emptyTradesBody}
        </p>
        <Button asChild className="mt-6">
          <Link href="/journal">{S.view.planTheDay}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function reminderIdOf(alert: { type: string; dismissedAt: string | null; payload: unknown }): string | null {
  if (alert.type !== "SYSTEM" || alert.dismissedAt !== null) return null;
  const payload = alert.payload as { skippedTradeId?: string } | null;
  return typeof payload?.skippedTradeId === "string" ? payload.skippedTradeId : null;
}

/** Initial symbol: follow an open position, else the real-feed showcase symbol. */
function pickDefaultSymbol(openSymbols: string[], instruments: Array<{ symbol: string }>): string | null {
  if (openSymbols.length > 0) return openSymbols[0];
  return instruments.find((item) => item.symbol === "BTCUSDT")?.symbol ?? instruments[0]?.symbol ?? null;
}

// ── Per-symbol workspace (chart state owner) ────────────────────────────────

interface WorkspaceProps {
  symbol: string;
  instrument: Instrument | null;
  quote: LiveQuote | null;
  /** Journal open trades on this symbol — chart overlays + positions panel. */
  symbolTrades: Trade[];
  /** ALL open journal trades — observation panes filter per their own symbol. */
  openTrades: Trade[];
  brokerPositions: BrokerPosition[];
  /** ALL real broker positions — observation panes filter per their own symbol. */
  allBrokerPositions: BrokerPosition[];
  instruments: Instrument[];
  levels: KeyLevel[];
  levelsLoading: boolean;
  activeSession: TradingSession | null;
  onBiasChange: (bias: MarketBias) => void;
  latestAnalysisNote: string | null;
  analyses: SavedAnalysis[];
  analysesLoading: boolean;
  multi: MultiChartState;
  onMultiChange: (updater: (current: MultiChartState) => MultiChartState) => void;
}

function Workspace(props: WorkspaceProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const { symbol, instrument, quote } = props;
  const digits = instrument?.digits ?? 5;

  // Per-symbol chart state — seeds once at mount (this component is keyed by
  // symbol), persists via a write-only effect.
  const seeded = loadPersistedChartState(symbol);
  const [interval, setIntervalState] = React.useState<MarketInterval>(seeded.interval ?? "5m");
  const [indicators, setIndicators] = React.useState<IndicatorConfig[]>(seeded.indicators ?? defaultIndicatorTemplate());
  const [drawings, setDrawings] = React.useState<DrawingObject[]>(seeded.drawings ?? []);
  const [tool, setTool] = React.useState<DrawingKind | null>(null);
  const [levelsVisible, setLevelsVisible] = React.useState(false);

  const candles = useCandles(symbol, interval);
  const candleList = React.useMemo(() => candles.data?.candles ?? [], [candles.data]);
  const atr = React.useMemo(() => atrNow(candleList, 14), [candleList]);

  React.useEffect(() => {
    persistChartState(symbol, { interval, indicators, drawings });
  }, [symbol, interval, indicators, drawings]);

  // Observation-pane suggestions: slots the user left empty (and not
  // dismissed) follow the catalog order, skipping the master symbol —
  // derived at render, user choices always win.
  const effectiveMulti = React.useMemo<MultiChartState>(() => {
    const taken = new Set([symbol]);
    const picks: string[] = [];
    for (const item of props.instruments) {
      if (taken.has(item.symbol)) continue;
      taken.add(item.symbol);
      picks.push(item.symbol);
      if (picks.length === 3) break;
    }
    return {
      ...props.multi,
      aux: props.multi.aux.map((pane, index) =>
        pane.symbol === "" && !pane.dismissed ? { ...pane, symbol: picks[index] ?? "" } : pane,
      ),
    };
  }, [props.multi, props.instruments, symbol]);

  const applyIntervalToAll = (next: MarketInterval) => {
    setIntervalState(next);
    if (props.multi.timeframeSync) {
      props.onMultiChange((current) => ({ ...current, aux: current.aux.map((pane) => ({ ...pane, interval: next })) }));
    }
  };

  const onRestoreAnalysis = (analysis: SavedAnalysis) => {
    setIndicators(analysis.indicators);
    setDrawings(analysis.drawings);
    toast.success(
      `${S.view.toastRestoredA} ${analysis.symbol} ${analysis.timeframe} ${S.view.toastRestoredB} ${new Date(analysis.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
    );
  };

  return (
    <>
      <div className="space-y-2 sm:space-y-3">
        {/* Chart toolbar — a full-width strip above the chart: timeframe,
            indicators, drawing tools, multi-chart layout, session timer.
            The chart itself takes the ENTIRE remaining width (no side rails). */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border bg-surface px-2.5 py-2"
          data-testid="session-chart-toolbar"
          role="toolbar"
          aria-label={S.view.chartToolbarAria}
        >
          <span className="ledger-label shrink-0 pr-1">{S.labels.timeframe}</span>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={S.labels.timeframe}>
            {TIMEFRAMES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={interval === item}
                data-testid={`tf-${item}`}
                title={props.multi.timeframeSync ? `${S.view.timeframeSyncTitle} — ${item}` : item}
                onClick={() => applyIntervalToAll(item)}
                className={cn(
                  "min-w-[38px] rounded-md border px-1.5 py-1 font-mono text-xs font-semibold transition-colors",
                  interval === item
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

          <IndicatorsPopover indicators={indicators} onChange={setIndicators} />
          <DrawingToolbar
            tool={tool}
            onToolChange={setTool}
            drawings={drawings}
            onDrawingDelete={(id) => setDrawings((current) => current.filter((item) => item.id !== id))}
            onDrawingsClear={() => setDrawings([])}
            onUndo={() => setDrawings((current) => current.slice(0, -1))}
          />

          <span className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden="true" />

          <ChartGridToolbar
            bare
            layout={effectiveMulti.layout}
            crosshairSync={effectiveMulti.crosshairSync}
            timeframeSync={effectiveMulti.timeframeSync}
            onLayoutChange={(layout: MultiChartLayout) => props.onMultiChange((current) => ({ ...current, layout }))}
            onCrosshairSyncChange={(value) => props.onMultiChange((current) => ({ ...current, crosshairSync: value }))}
            onTimeframeSyncChange={(value) => props.onMultiChange((current) => ({ ...current, timeframeSync: value }))}
          />

          <div className="ml-auto flex items-center border-l border-border pl-3">
            <SessionTimer />
          </div>
        </div>

        {/* The charts — master + synchronized observation panes, FULL WIDTH */}
        <div data-testid="session-chart-area" className="min-w-0">
          <ChartGrid
            master={
              <AnalysisChart
                symbol={symbol}
                interval={interval}
                instrument={instrument}
                data={candles.data}
                isLoading={candles.isLoading}
                isError={candles.isError}
                quote={quote}
                overlayTrades={props.symbolTrades}
                brokerPositions={props.brokerPositions}
                levels={props.levels}
                levelsVisible={levelsVisible}
                indicators={indicators}
                drawings={drawings}
                tool={tool}
                onDrawingCreate={(drawing) => setDrawings((current) => [...current, drawing])}
                onToolDone={() => setTool(null)}
                syncGroup={chartSyncGroupFor(effectiveMulti)}
                heightClass={
                  effectiveMulti.layout > 1 ? "h-[300px] sm:h-[380px] xl:h-[430px]" : "h-[420px] sm:h-[520px] xl:h-[640px]"
                }
              />
            }
            multi={effectiveMulti}
            instruments={props.instruments}
            trades={props.openTrades}
            brokerPositions={props.allBrokerPositions}
            indicators={indicators}
            onAuxSymbolChange={(slot, auxSymbol) =>
              props.onMultiChange((current) => ({
                ...current,
                aux: current.aux.map((pane, index) => (index === slot ? { ...pane, symbol: auxSymbol, dismissed: false } : pane)),
              }))
            }
            onAuxIntervalChange={(slot, auxInterval) =>
              props.onMultiChange((current) => ({
                ...current,
                aux: current.aux.map((pane, index) => (index === slot ? { ...pane, interval: auxInterval } : pane)),
              }))
            }
            onAuxRemove={(slot) =>
              props.onMultiChange((current) => ({
                ...current,
                aux: current.aux.map((pane, index) => (index === slot ? { ...pane, symbol: "", dismissed: true } : pane)),
              }))
            }
          />
        </div>

        {/* Market context — responsive panel grid under the full-width chart */}
        <div
          className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label={S.view.contextGridAria}
          data-testid="session-context-grid"
        >
          <MarketContextPanel
            symbol={symbol}
            digits={digits}
            quote={quote}
            candles={candleList}
            atr={atr}
            bias={props.activeSession?.marketBias ?? null}
            objective={props.activeSession?.sessionObjective ?? null}
            levels={props.levels}
            savedBiasNote={props.latestAnalysisNote}
          />
          <KeyLevelsPanel
            symbol={symbol}
            digits={digits}
            quote={quote}
            levels={props.levels}
            isLoading={props.levelsLoading}
            visible={levelsVisible}
            onToggleVisible={() => setLevelsVisible((visible) => !visible)}
          />
          <BrokerPanel />
          {/* PRIVATE WS stream (user:<id> room) — live mark-to-market, read only */}
          <PrivatePositionsStream />
          <SymbolPositions trades={props.symbolTrades} instrument={instrument} quote={quote} />
        </div>
      </div>

      {/* Bottom context strip */}
      <ContextTabs
        symbol={symbol}
        interval={interval}
        digits={digits}
        currentPrice={quote?.price ?? null}
        activeSession={props.activeSession}
        indicators={indicators}
        drawings={drawings}
        levels={props.levels}
        analyses={props.analyses}
        analysesLoading={props.analysesLoading}
        onRestoreAnalysis={onRestoreAnalysis}
      />
    </>
  );
}

// ── Top-level view ──────────────────────────────────────────────────────────

export function SessionLiveView() {
  const { dict } = useI18n();
  const S = dict.session;
  const queryClient = useQueryClient();

  // ── Data ────────────────────────────────────────────────────────────────
  const timeline = useSessionTimeline();
  const openTrades = useTrades({ status: "OPEN" });
  const allTrades = useTrades({});
  const skipped = useSkippedTrades();
  const overview = useStatsOverview();
  const alerts = useAlerts();
  const { data: instrumentsData } = useInstruments();
  const sessionState = useSessionLiveState();
  const { data: analysesData, isLoading: analysesLoading } = useSavedAnalyses();
  const { data: strategiesData } = useStrategies();
  const updateSession = useUpdateSessionLive();

  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const trades = React.useMemo(() => openTrades.data?.trades ?? [], [openTrades.data]);
  const activeSession = sessionState.data?.active ?? null;
  const history = React.useMemo(() => sessionState.data?.history ?? [], [sessionState.data]);
  const analyses = React.useMemo(() => analysesData?.analyses ?? [], [analysesData]);

  const strategyNameOf = React.useCallback(
    (strategyId: string | null) =>
      strategyId ? strategiesData?.strategies.find((item) => item.id === strategyId)?.name ?? null : null,
    [strategiesData],
  );

  // ── Symbol selection (user wins; default derives from data) ────────────
  const [userSymbol, setUserSymbol] = React.useState<string | null>(null);
  const autoSymbol = React.useMemo(() => {
    const openSymbols = trades
      .map((trade) => instruments.find((item) => item.id === trade.instrumentId)?.symbol)
      .filter((item): item is string => typeof item === "string");
    return pickDefaultSymbol(openSymbols, instruments);
  }, [trades, instruments]);
  const symbol = userSymbol ?? autoSymbol ?? "";
  const instrument = React.useMemo(() => instruments.find((item) => item.symbol === symbol) ?? null, [instruments, symbol]);

  const quote = useLiveQuote(symbol || null);
  const { phase, authError } = useFeedStatus();
  const { quotes } = useLiveQuotes();

  const { data: levelsData, isLoading: levelsLoading } = useKeyLevels(symbol || null);
  const levels = React.useMemo(() => levelsData?.levels ?? [], [levelsData]);

  const { data: brokerData } = useBrokerSession();
  const brokerPositionsOnSymbol = React.useMemo(
    () => (brokerData?.positions ?? []).filter((position) => position.symbol === symbol),
    [brokerData, symbol],
  );

  // Journal open trades on the selected symbol.
  const symbolTrades = React.useMemo(
    () => trades.filter((trade) => instruments.find((item) => item.id === trade.instrumentId)?.symbol === symbol),
    [trades, instruments, symbol],
  );

  // ── Dialogs ─────────────────────────────────────────────────────────────
  const [startOpen, setStartOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);
  // The dialog keeps a FROZEN session snapshot: ending the session invalidates
  // the state query (active → null), which would otherwise unmount the dialog
  // before its summary can render.
  const [endTarget, setEndTarget] = React.useState<TradingSession | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [replaySession, setReplaySession] = React.useState<TradingSession | null>(null);

  // Multi-chart workspace state (layout + sync toggles + observation panes).
  // Persisted through a write-only effect — never re-enters render logic.
  const [multi, setMulti] = React.useState<MultiChartState>(loadMultiChart);
  React.useEffect(() => {
    persistMultiChart(multi);
  }, [multi]);

  const isLoading = timeline.isLoading || openTrades.isLoading || sessionState.isLoading;
  const isError = timeline.isError || openTrades.isError;

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  const pendingGhosts = React.useMemo(() => {
    const reminders = new Set((alerts.data?.alerts ?? []).map(reminderIdOf).filter((id): id is string => id !== null));
    return (skipped.data?.skippedTrades ?? []).filter((ghost) => ghost.outcomeGuess === null && reminders.has(ghost.id));
  }, [alerts.data, skipped.data]);

  const onBiasChange = (bias: MarketBias) => {
    if (!activeSession) return;
    updateSession.mutate(
      { sessionId: activeSession.id, marketBias: bias },
      { onError: () => toast.error(S.view.toastBiasFailed) },
    );
  };

  const latestAnalysisNote = React.useMemo(() => {
    const latest = analyses.find((analysis) => analysis.symbol === symbol) ?? null;
    if (latest === null) return null;
    return `${latest.bias} · ${latest.timeframe} · ${new Date(latest.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }, [analyses, symbol]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-6">
      <GhostSettlementNotifier ghosts={pendingGhosts} />
      {/* Live-feed level events (TP/SL touched) — toasts, invisible UI */}
      <PriceAlertToaster trades={trades} instruments={instruments} quotes={quotes} />

      <header className="space-y-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{S.view.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {S.view.subtitle}
        </p>
        <DisciplineBanner />
      </header>

      {isLoading ? (
        <SessionSkeleton />
      ) : isError ? (
        <ErrorSession onRetry={retry} />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {/* ── Lifecycle header ────────────────────────────────────────── */}
          <SessionLiveHeader
            activeSession={activeSession}
            quote={quote}
            phase={phase}
            authError={authError}
            onBiasChange={onBiasChange}
            onStartClick={() => setStartOpen(true)}
            onEndClick={() => {
              setEndTarget(activeSession);
              setEndOpen(true);
            }}
            onOpenHistory={() => setHistoryOpen(true)}
          />

          {/* ── Market selector row (mobile-friendly, above the workspace) ─ */}
          <section className="rounded-xl border border-border bg-surface px-4 py-3" data-testid="session-market-row">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[220px] shrink-0 space-y-1">
                <p className="ledger-label">{S.labels.market}</p>
                <SymbolPicker instruments={instruments} value={symbol} onChange={setUserSymbol} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="ledger-label">{S.labels.instrument}</p>
                <p className="truncate text-sm text-foreground">
                  {instrument ? instrument.name : "—"}
                  <span className="ml-2 text-xs text-muted-foreground">{instrument?.assetClass}</span>
                </p>
              </div>
            </div>
          </section>

          {/* ── Workspace (keyed by symbol: chart state resets cleanly) ──── */}
          {symbol !== "" ? (
            <Workspace
              key={symbol}
              symbol={symbol}
              instrument={instrument}
              quote={quote}
              symbolTrades={symbolTrades}
              openTrades={trades}
              brokerPositions={brokerPositionsOnSymbol}
              allBrokerPositions={brokerData?.positions ?? []}
              instruments={instruments}
              levels={levels}
              levelsLoading={levelsLoading}
              activeSession={activeSession}
              onBiasChange={onBiasChange}
              latestAnalysisNote={latestAnalysisNote}
              analyses={analyses}
              analysesLoading={analysesLoading}
              multi={multi}
              onMultiChange={setMulti}
            />
          ) : null}

          {/* ── Journaling flow (existing, unchanged contract) ───────────── */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <div className="space-y-3 sm:space-y-4 lg:col-span-2">
              <section aria-label={S.view.openPositionsAria} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-base font-semibold text-foreground">{S.view.openPositions}</h2>
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
                      <OpenTradeCard
                        key={trade.id}
                        trade={trade}
                        instrument={tradeInstrument}
                        quote={quotes.get(tradeInstrument?.symbol ?? "") ?? null}
                      />
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

            <aside className="space-y-3 sm:space-y-4" aria-label={S.view.sessionSidebarAria}>
              <SessionLogbook />

              {pendingGhosts.length > 0 ? (
                <section id="ghost-settlements" className="rounded-xl border border-warning/40 bg-surface">
                  <header className="border-b border-border px-4 py-3">
                    <h2 className="font-heading text-base font-semibold text-foreground">{S.view.ghostCheckIn}</h2>
                    <p className="text-xs text-muted-foreground">{S.view.ghostCheckInSub}</p>
                  </header>
                  <div className="p-4">
                    <GhostSettlements ghosts={pendingGhosts} />
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-border bg-surface">
                <header className="border-b border-border px-4 py-3">
                  <h2 className="font-heading text-base font-semibold text-foreground">{S.view.todayTimeline}</h2>
                  <p className="text-xs text-muted-foreground">{S.view.todayTimelineSub}</p>
                </header>
                <div className="p-4">
                  {timeline.data ? <EventTimeline events={timeline.data.events} /> : null}
                  {activeSession && activeSession.events.length > 0 ? (
                    <div className="mt-3 border-t border-border pt-3" data-testid="session-events">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{S.view.thisSession}</p>
                      <ul className="mt-1.5 space-y-1">
                        {[...activeSession.events]
                          .reverse()
                          .slice(0, 10)
                          .map((event) => (
                            <li key={event.id} className="flex items-baseline gap-2 text-xs">
                              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                                {new Date(event.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                              </span>
                              <span className="min-w-0 text-foreground">
                                {event.label}
                                {event.source ? <span className="text-muted-foreground"> — Source: {event.source}</span> : null}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface">
                <header className="border-b border-border px-4 py-3">
                  <h2 className="font-heading text-base font-semibold text-foreground">{S.view.moodStrip}</h2>
                  <p className="text-xs text-muted-foreground">{S.view.moodStripSub}</p>
                </header>
                <div className="p-4">
                  {timeline.data ? <MoodStrip moods={timeline.data.moods} /> : null}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/* ── Lifecycle dialogs + history ─────────────────────────────────── */}
      <StartSessionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        defaultSymbol={symbol || "BTCUSDT"}
        defaultInterval={sessionState.data?.active?.primaryTimeframe ?? "5m"}
      />
      {endOpen && endTarget !== null ? (
        <EndSessionDialog
          open={endOpen}
          onOpenChange={(open) => {
            setEndOpen(open);
            if (!open) setEndTarget(null);
          }}
          session={endTarget}
          strategyName={strategyNameOf(endTarget.strategyId)}
        />
      ) : null}
      <SessionHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        strategyNameOf={strategyNameOf}
        onReplay={(session) => {
          setHistoryOpen(false);
          setReplaySession(session);
        }}
        trades={(allTrades.data?.trades ?? []).map((trade) => ({
          entryAt: trade.entryAt,
          exitAt: trade.exitAt,
          pnlNet: trade.pnlNet,
          pnlGross: trade.pnlGross,
        }))}
      />
      {replaySession !== null ? (
        <SessionReplayDialog
          key={replaySession.id}
          open
          onOpenChange={(value) => {
            if (!value) setReplaySession(null);
          }}
          session={replaySession}
          strategyName={strategyNameOf(replaySession.strategyId)}
          instruments={instruments}
          trades={allTrades.data?.trades ?? []}
        />
      ) : null}
    </div>
  );
}
