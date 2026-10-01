"use client";

import * as React from "react";
import { Columns2, LayoutGrid, Link2, Link2Off, Square, X } from "lucide-react";

import { AnalysisChart } from "@/components/session/analysis-chart";
import { SymbolPicker } from "@/components/session/symbol-picker";
import type { BrokerPosition, IndicatorConfig, Instrument, MarketInterval, Trade } from "@cosmoz/shared";
import type { LiveQuote } from "@/lib/realtime/market";
import { useCandles, useLiveQuote } from "@/lib/realtime/market";
import { cn } from "@/lib/utils";

/**
 * Multi-chart synchronized workspace (Session Live increment ①).
 *
 * Layouts: 1 (master only), 2 (master + 1 observation pane) and 4
 * (master + 3 panes, 2×2 on xl screens). The MASTER pane is the analytical
 * workspace exactly as before — left-rail tools, drawings, replay. The
 * AUX panes are synchronized OBSERVATION panes: their own market +
 * timeframe, the shared indicator template, read-only position overlays,
 * and crosshair/zoom mirrored with the master through an ECharts connect
 * group. Observation panes host no drawing tools — analysis stays on the
 * master (or in a saved analysis), keeping the read-only story simple.
 *
 * Synchronization toggles:
 *  - Crosshair: mirror crosshair + zoom across panes (ECharts group);
 *  - Timeframe: the LEFT-RAIL timeframe is the master — when on, switching
 *    it applies to every pane (aux chips always stay local overrides).
 *
 * Layout + toggles + aux choices persist in localStorage (write-only
 * effect at the view level — the codebase's state-persistence pattern).
 */

export type MultiChartLayout = 1 | 2 | 4;

export interface AuxPaneState {
  symbol: string;
  interval: MarketInterval;
  /** User removed the pane's market — blocks auto-suggestion until re-picked. */
  dismissed?: boolean;
}

export interface MultiChartState {
  layout: MultiChartLayout;
  crosshairSync: boolean;
  timeframeSync: boolean;
  /** Slot state for the 3 aux panes — slots beyond the layout keep their state. */
  aux: AuxPaneState[];
}

export const CHART_SYNC_GROUP = "cosmoz.session-live.charts";

/** The ECharts connect group for the current multi state (null = independent). */
export function chartSyncGroupFor(multi: MultiChartState): string | null {
  return multi.crosshairSync && multi.layout > 1 ? CHART_SYNC_GROUP : null;
}

const STORE_KEY = "cosmoz.session-live.multichart.v1";
const AUX_INTERVALS: readonly MarketInterval[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

const DEFAULT_MULTI: MultiChartState = {
  layout: 1,
  crosshairSync: true,
  timeframeSync: false,
  aux: [
    { symbol: "", interval: "15m", dismissed: false },
    { symbol: "", interval: "1H", dismissed: false },
    { symbol: "", interval: "5m", dismissed: false },
  ],
};

export function loadMultiChart(): MultiChartState {
  if (typeof window === "undefined") return DEFAULT_MULTI;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw === null) return DEFAULT_MULTI;
    const parsed = JSON.parse(raw) as Partial<MultiChartState>;
    const layout: MultiChartLayout = parsed.layout === 2 || parsed.layout === 4 ? parsed.layout : 1;
    const aux = DEFAULT_MULTI.aux.map((fallback, index) => {
      const candidate = parsed.aux?.[index];
      return {
        symbol: typeof candidate?.symbol === "string" ? candidate.symbol : fallback.symbol,
        interval: AUX_INTERVALS.includes(candidate?.interval as MarketInterval)
          ? (candidate?.interval as MarketInterval)
          : fallback.interval,
        dismissed: candidate?.dismissed === true,
      };
    });
    return {
      layout,
      crosshairSync: typeof parsed.crosshairSync === "boolean" ? parsed.crosshairSync : true,
      timeframeSync: parsed.timeframeSync === true,
      aux,
    };
  } catch {
    return DEFAULT_MULTI;
  }
}

export function persistMultiChart(state: MultiChartState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: persistence is a convenience, never a source of truth.
  }
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

interface ChartGridToolbarProps {
  layout: MultiChartLayout;
  crosshairSync: boolean;
  timeframeSync: boolean;
  onLayoutChange: (layout: MultiChartLayout) => void;
  onCrosshairSyncChange: (value: boolean) => void;
  onTimeframeSyncChange: (value: boolean) => void;
}

const LAYOUT_OPTIONS: Array<{ value: MultiChartLayout; label: string; icon: React.ReactNode; hint: string }> = [
  { value: 1, label: "1", icon: <Square className="size-3" aria-hidden="true" />, hint: "Single chart" },
  { value: 2, label: "2", icon: <Columns2 className="size-3.5" aria-hidden="true" />, hint: "Two charts" },
  { value: 4, label: "4", icon: <LayoutGrid className="size-3.5" aria-hidden="true" />, hint: "Four charts (2×2)" },
];

export function ChartGridToolbar(props: ChartGridToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2"
      data-testid="chart-grid-toolbar"
      role="toolbar"
      aria-label="Multi-chart layout and synchronization"
    >
      <span className="ledger-label shrink-0 pr-1">Layout</span>
      <div className="flex items-center gap-1" role="group" aria-label="Chart layout">
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={props.layout === option.value}
            aria-label={option.hint}
            data-testid={`chart-layout-${option.value}`}
            onClick={() => props.onLayoutChange(option.value)}
            className={cn(
              "inline-flex h-7 min-w-[30px] items-center justify-center gap-1 rounded-md border px-1.5 font-mono text-xs font-semibold transition-colors",
              props.layout === option.value
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

      <button
        type="button"
        aria-pressed={props.crosshairSync}
        data-testid="chart-sync-crosshair"
        title="Mirror crosshair and zoom across all charts"
        onClick={() => props.onCrosshairSyncChange(!props.crosshairSync)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
          props.crosshairSync
            ? "border-accent/60 bg-accent/10 text-accent"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        {props.crosshairSync ? <Link2 className="size-3.5" aria-hidden="true" /> : <Link2Off className="size-3.5" aria-hidden="true" />}
        Crosshair sync
      </button>
      <button
        type="button"
        aria-pressed={props.timeframeSync}
        data-testid="chart-sync-timeframe"
        title="The left-rail timeframe applies to every chart"
        onClick={() => props.onTimeframeSyncChange(!props.timeframeSync)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
          props.timeframeSync
            ? "border-accent/60 bg-accent/10 text-accent"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        {props.timeframeSync ? <Link2 className="size-3.5" aria-hidden="true" /> : <Link2Off className="size-3.5" aria-hidden="true" />}
        Timeframe sync
      </button>
      <span className="ml-auto hidden text-[11px] text-muted-foreground lg:block">
        Panes beyond the first are read-only observation charts.
      </span>
    </div>
  );
}

// ── Aux observation pane ─────────────────────────────────────────────────────

interface AuxChartPaneProps {
  index: number;
  pane: AuxPaneState;
  instruments: Instrument[];
  /** All open journal trades — filtered per pane symbol for overlays. */
  trades: Trade[];
  /** All real broker positions — filtered per pane symbol. */
  brokerPositions: BrokerPosition[];
  /** Shared indicator template (owned by the master pane). */
  indicators: IndicatorConfig[];
  syncGroup: string | null;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: MarketInterval) => void;
  onRemove: () => void;
}

function AuxChartPane(props: AuxChartPaneProps) {
  const { pane, index } = props;
  const instrument = React.useMemo(
    () => props.instruments.find((item) => item.symbol === pane.symbol) ?? null,
    [props.instruments, pane.symbol],
  );
  const quote: LiveQuote | null = useLiveQuote(pane.symbol || null);
  const candles = useCandles(pane.symbol, pane.interval);

  const overlayTrades = React.useMemo(
    () => props.trades.filter((trade) => props.instruments.find((item) => item.id === trade.instrumentId)?.symbol === pane.symbol),
    [props.trades, props.instruments, pane.symbol],
  );
  const brokerPositions = React.useMemo(
    () => props.brokerPositions.filter((position) => position.symbol === pane.symbol),
    [props.brokerPositions, pane.symbol],
  );

  return (
    <section
      className="rounded-xl border border-border bg-surface p-2"
      data-testid={`aux-pane-${index}`}
      data-symbol={pane.symbol}
      aria-label={`Observation chart ${index + 1}`}
    >
      <header className="mb-1.5 flex items-center gap-1.5">
        <SymbolPicker instruments={props.instruments} value={pane.symbol} onChange={props.onSymbolChange} compact />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5" role="group" aria-label={`Chart ${index + 1} timeframe`}>
          {AUX_INTERVALS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={pane.interval === item}
              data-testid={`aux-tf-${index}-${item}`}
              onClick={() => props.onIntervalChange(item)}
              className={cn(
                "rounded border px-1 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                pane.interval === item
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-transparent text-muted-foreground hover:border-accent/40 hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={`Remove chart ${index + 1}`}
          data-testid={`aux-remove-${index}`}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </header>
      {pane.symbol === "" ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center"
          style={{ height: "clamp(220px, 30vh, 340px)" }}
        >
          <p className="text-sm font-medium text-foreground">Pick a market</p>
          <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
            Choose an instrument to watch it beside the master chart — crosshair and zoom stay in sync.
          </p>
        </div>
      ) : (
        <AnalysisChart
          symbol={pane.symbol}
          interval={pane.interval}
          instrument={instrument}
          data={candles.data}
          isLoading={candles.isLoading}
          isError={candles.isError}
          quote={quote}
          overlayTrades={overlayTrades}
          brokerPositions={brokerPositions}
          indicators={props.indicators}
          drawings={[]}
          tool={null}
          onDrawingCreate={() => {}}
          onToolDone={() => {}}
          syncGroup={props.syncGroup}
          heightClass="h-[clamp(220px,30vh,340px)]"
        />
      )}
    </section>
  );
}

export interface ChartGridProps {
  /** Master pane — the full workspace chart, already composed by the caller. */
  master: React.ReactNode;
  multi: MultiChartState;
  instruments: Instrument[];
  trades: Trade[];
  brokerPositions: BrokerPosition[];
  /** Shared indicator template (master pane state). */
  indicators: IndicatorConfig[];
  onAuxSymbolChange: (slot: number, symbol: string) => void;
  onAuxIntervalChange: (slot: number, interval: MarketInterval) => void;
  onAuxRemove: (slot: number) => void;
}

/** The grid shell: master pane + active aux panes under the current layout. */
export function ChartGrid(props: ChartGridProps) {
  const { multi } = props;
  const auxCount = multi.layout - 1;
  const syncGroup = chartSyncGroupFor(multi);
  const gridClass = multi.layout > 1 ? "grid gap-3 xl:grid-cols-2" : "grid gap-3";

  return (
    <div className={gridClass} data-testid="chart-grid" data-layout={multi.layout}>
      {props.master}
      {multi.aux.slice(0, auxCount).map((pane, slot) => (
        <AuxChartPane
          key={`aux-${slot}`}
          index={slot + 1}
          pane={pane}
          instruments={props.instruments}
          trades={props.trades}
          brokerPositions={props.brokerPositions}
          indicators={props.indicators}
          syncGroup={syncGroup}
          onSymbolChange={(symbol) => props.onAuxSymbolChange(slot, symbol)}
          onIntervalChange={(interval) => props.onAuxIntervalChange(slot, interval)}
          onRemove={() => props.onAuxRemove(slot)}
        />
      ))}
    </div>
  );
}
