"use client";

import * as React from "react";
import { PanelRight } from "lucide-react";

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

import { ChartyToolbar } from "./charty-toolbar";
import { ChartyLeftRail } from "./charty-left-rail";
import { ChartyRightRail } from "./charty-right-rail";
import { ChartyBottomBar } from "./charty-bottom-bar";
import { ChartyLegend, ChartyWatermark } from "./charty-legend";
import { AnalysisChart } from "@/components/session/analysis-chart";
import { ContextTabs } from "@/components/session/context-tabs";
import { KeyLevelsPanel, MarketContextPanel } from "@/components/session/market-context-panel";
import { BrokerPanel } from "@/components/session/broker-panel";
import { PrivatePositionsStream } from "@/components/session/private-positions-stream";
import { SymbolPositions } from "@/components/session/symbol-positions";
import {
  ChartGrid,
  chartSyncGroupFor,
  type MultiChartLayout,
  type MultiChartState,
} from "@/components/session/chart-grid";
import { IndicatorsPopover } from "@/components/session/chart-tool-rail";
import { useCandles, type LiveQuote } from "@/lib/realtime/market";
import { atrNow } from "@/lib/utils/indicators";
import { loadPersistedChartState, persistChartState, defaultIndicatorTemplate } from "@/lib/utils/chart-state";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Charty WORKSPACE — the full-width charting terminal (frontend refonte of
 * the Session Live workspace; data logic unchanged).
 *
 * Layout mirrors the reference terminal:
 *  ┌ top toolbar ─────────────────────────────────────────────────────┐
 *  │ left rail │ legend + FULL-WIDTH chart │ right rail (cal/notifs) │
 *  └ bottom bar ──────────────────────────────────────────────────────┘
 *
 * The terminal breaks out of the page container (negative margins cancel
 * the shell padding) so the chart takes the ENTIRE screen width. Chart
 * state (interval, indicators, drawings) keeps the exact same owner,
 * persistence keys and default template as before; the read-only context
 * panels live below the terminal, in the standard container.
 */

const RAIL_STORE_KEY = "cosmoz.charty.rail.v1";

function loadRailOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(RAIL_STORE_KEY) !== "off";
  } catch {
    return true;
  }
}

export interface ChartyWorkspaceProps {
  symbol: string;
  instrument: Instrument | null;
  quote: LiveQuote | null;
  /** User symbol selection lives at the view level (drives default too). */
  onSymbolChange: (symbol: string) => void;
  symbolTrades: Trade[];
  openTrades: Trade[];
  brokerPositions: BrokerPosition[];
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

export function ChartyWorkspace(props: ChartyWorkspaceProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const { symbol, instrument, quote } = props;
  const digits = instrument?.digits ?? 5;

  // ── Chart state — identical owner + persistence as the old workspace ────
  const seeded = loadPersistedChartState(symbol);
  const [interval, setIntervalState] = React.useState<MarketInterval>(seeded.interval ?? "5m");
  const [indicators, setIndicators] = React.useState<IndicatorConfig[]>(seeded.indicators ?? defaultIndicatorTemplate());
  const [drawings, setDrawings] = React.useState<DrawingObject[]>(seeded.drawings ?? []);
  const [tool, setTool] = React.useState<DrawingKind | null>(null);
  const [levelsVisible, setLevelsVisible] = React.useState(false);
  const [rangePreset, setRangePreset] = React.useState<string>("ALL");
  const [railOpen, setRailOpen] = React.useState<boolean>(loadRailOpen);

  React.useEffect(() => {
    persistChartState(symbol, { interval, indicators, drawings });
  }, [symbol, interval, indicators, drawings]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_STORE_KEY, railOpen ? "on" : "off");
    } catch {
      // Convenience only.
    }
  }, [railOpen]);

  const candles = useCandles(symbol, interval);
  const candleList = React.useMemo(() => candles.data?.candles ?? [], [candles.data]);
  const atr = React.useMemo(() => atrNow(candleList, 14), [candleList]);

  // Observation-pane suggestions (same derivation as before).
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
  };

  const heightClass =
    effectiveMulti.layout > 1
      ? "h-[clamp(280px,42vh,420px)] sm:h-[clamp(320px,calc(100dvh-430px),540px)]"
      : "h-[clamp(420px,62vh,560px)] sm:h-[clamp(480px,calc(100dvh-340px),880px)]";

  return (
    <>
      {/* ── The terminal — breaks out to the full screen width ─────────── */}
      <div
        id="charty-terminal"
        data-testid="charty-terminal"
        className="-mx-4 overflow-hidden rounded-none border-y border-border bg-background sm:-mx-6 lg:-mx-8"
      >
        <ChartyToolbar
          symbol={symbol}
          instrument={instrument}
          instruments={props.instruments}
          onSymbolChange={props.onSymbolChange}
          interval={interval}
          onIntervalChange={applyIntervalToAll}
          timeframeSyncTitle={props.multi.timeframeSync ? S.view.timeframeSyncTitle : null}
          indicators={<IndicatorsPopover indicators={indicators} onChange={setIndicators} compact />}
          drawingsCount={drawings.length}
          onUndo={() => setDrawings((current) => current.slice(0, -1))}
          multi={{
            layout: effectiveMulti.layout,
            crosshairSync: effectiveMulti.crosshairSync,
            timeframeSync: effectiveMulti.timeframeSync,
          }}
          onLayoutChange={(layout: MultiChartLayout) => props.onMultiChange((current) => ({ ...current, layout }))}
          onCrosshairSyncChange={(value) => props.onMultiChange((current) => ({ ...current, crosshairSync: value }))}
          onTimeframeSyncChange={(value) => props.onMultiChange((current) => ({ ...current, timeframeSync: value }))}
        />

        <div className="flex min-w-0">
          <ChartyLeftRail
            tool={tool}
            onToolChange={setTool}
            drawings={drawings}
            onUndo={() => setDrawings((current) => current.slice(0, -1))}
            onClear={() => setDrawings([])}
          />

          {/* Center — legend overlay + FULL-WIDTH charts */}
          <div className="min-w-0 flex-1 p-2 sm:p-3">
            <div className="relative" data-testid="charty-chart-area">
              <ChartyLegend
                symbol={symbol}
                instrument={instrument}
                interval={interval}
                quote={quote}
                candles={candleList}
                digits={digits}
              />
              <ChartyWatermark />
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
                    rangePreset={rangePreset}
                    heightClass={heightClass}
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
          </div>

          <ChartyRightRail open={railOpen} onClose={() => setRailOpen(false)} />
        </div>

        <ChartyBottomBar
          rangePreset={rangePreset}
          onRangeChange={setRangePreset}
          tool={tool}
          onToolChange={setTool}
          drawings={drawings}
          interval={interval}
        />
      </div>

      {/* Rail reopen — floating at the terminal's right edge when closed (xl+) */}
      {!railOpen ? (
        <div className="-mx-4 mb-1 flex justify-end sm:-mx-6 lg:-mx-8 xl:pr-2" data-testid="charty-rail-reopen">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label={S.charty.railOpenAria}
            data-testid="charty-rail-open"
            className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground xl:inline-flex"
          >
            <PanelRight className="size-3.5" aria-hidden="true" />
            {S.charty.railOpenAria}
          </button>
        </div>
      ) : null}

      {/* ── Read-only context panels — standard container, below ────────── */}
      <div
        className={cn("mx-auto w-full max-w-[1600px] gap-3 pt-3 sm:gap-4 sm:pt-4 md:grid-cols-2 xl:grid-cols-3", "grid")}
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

      {/* Bottom context strip (Playbook / Rules / Economy / Analyses) */}
      <div className="mx-auto w-full max-w-[1600px] pt-3 sm:pt-4">
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
      </div>
    </>
  );
}
