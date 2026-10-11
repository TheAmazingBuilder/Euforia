"use client";

import * as React from "react";

import { useTheme } from "next-themes";

import type { Candle, MarketInterval } from "@cosmoz/shared";

import { useLiveQuote } from "@/lib/realtime/market";
import { useDict } from "@/i18n/i18n-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OryonChartEngine, type OryonChartType, type OryonCrosshairBar } from "@/lib/charting/oryon-chart-engine";
import { intervalToMs } from "@/lib/charting/oryon-intervals";
import { OryonDrawingLayer } from "@/components/oryon/oryon-drawing-layer";
import { OryonIndicatorLegend } from "@/components/oryon/oryon-indicator-legend";
import { useIndicatorSnapshot } from "@/components/oryon/oryon-indicators-context";
import { useOryonPositions } from "@/components/oryon/oryon-positions-context";
import { useOryonAlerts } from "@/components/oryon/oryon-alerts-context";
import { positionsForChart } from "@/lib/oryon/positions/match";
import { buildPositionLineSpecs } from "@/lib/oryon/positions/overlay";
import { buildAlertLineSpecs } from "@/lib/oryon/alerts/overlay";
import { formatCandleTime, formatLegendVolume } from "@/lib/oryon/crosshair/format";
import { cn } from "@/lib/utils";

/**
 * Oryon price chart — the ONLY component that owns the chart engine.
 *
 * Lifecycle: the engine is created in a mount effect (client-only — never
 * during SSR), survives prop updates, and is destroyed with the unmount
 * effect. Theme changes re-apply resolved tokens; type/magnet changes are
 * engine option updates, not recreations.
 *
 * Tick discipline: <OryonTickBridge> subscribes to the quote store so ticks
 * re-render ONLY the bridge (which renders null) and update the engine
 * imperatively — the workspace tree never re-renders per tick.
 */
export function OryonPriceChart({
  dataSymbol,
  liveSymbol,
  interval,
  chartType,
  magnet,
  candles,
  digits,
  pipSize,
  source,
  fitKey,
  onEngineReady,
}: {
  /** Symbol of the data ACTUALLY displayed — the legend labels this. */
  dataSymbol: string;
  /** Selected symbol for live ticks — null while placeholder data shows. */
  liveSymbol: string | null;
  interval: MarketInterval;
  chartType: OryonChartType;
  magnet: boolean;
  candles: Candle[];
  digits: number;
  /** Price increment of one pip (measure readout) — instrument contract. */
  pipSize: string;
  source: "real" | "sim";
  /** Symbol+interval key — data windows for a NEW key fit content; refetches keep the viewport. */
  fitKey: string;
  /** Exposes the engine's return-to-latest to the toolbar (via the panel). */
  onEngineReady?: (goToLatest: () => void) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const engineRef = React.useRef<OryonChartEngine | null>(null);
  const fitKeyRef = React.useRef<string>("");
  const [hoverBar, setHoverBar] = React.useState<OryonCrosshairBar | null>(null);
  /** Engine + host held in STATE for render access (refs are for effects). */
  const [chartInstance, setChartInstance] = React.useState<{
    engine: OryonChartEngine;
    host: HTMLDivElement;
  } | null>(null);
  const { resolvedTheme } = useTheme();
  // Indicator instances (rare commits) — the engine diffs them imperatively.
  const indicatorSnapshot = useIndicatorSnapshot();

  // Mount once / destroy on unmount (no duplicate instances, no leaks).
  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const engine = new OryonChartEngine();
    engine.mount(container);
    engine.onCrosshair(setHoverBar);
    engineRef.current = engine;
    onEngineReady?.(() => engine.goToLatest());
    const host = wrapperRef.current;
    if (host !== null) setChartInstance({ engine, host }); // Gates the drawing layer.
    return () => {
      engineRef.current = null;
      setChartInstance(null);
      engine.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);
  React.useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    const fit = fitKey !== fitKeyRef.current;
    fitKeyRef.current = fitKey;
    engine.setCandles(candles, digits, intervalToMs(interval), fit);
    // Seed the legend with the newest bar — OHLC must be populated without
    // requiring a hover first (crosshair moves then override it).
    setHoverBar(engine.lastBar);
  }, [candles, digits, interval, fitKey]);

  React.useEffect(() => {
    engineRef.current?.setChartType(chartType);
  }, [chartType]);

  React.useEffect(() => {
    engineRef.current?.setMagnet(magnet);
  }, [magnet]);

  React.useEffect(() => {
    engineRef.current?.applyTheme();
  }, [resolvedTheme]);

  // Structural indicator sync — runs AFTER the candles effect on mount
  // (declaration order), so the first sync already sees the loaded window.
  React.useEffect(() => {
    engineRef.current?.setIndicators(indicatorSnapshot.indicators);
  }, [indicatorSnapshot]);

  // Dev-probe handle — structural assertions without scraping the canvas.
  React.useEffect(() => {
    if (chartInstance === null || process.env.NODE_ENV === "production") return;
    const readChartStats = (): { series: number; panes: number } | null =>
      engineRef.current?.debugStats ?? null;
    const host = window as unknown as {
      __ORYON_CHART_DEBUG__?: () => { series: number; panes: number } | null;
    };
    host.__ORYON_CHART_DEBUG__ = readChartStats;
    return () => {
      delete host.__ORYON_CHART_DEBUG__;
    };
  }, [chartInstance]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <div ref={containerRef} data-testid="oryon-chart-canvas" className="h-full w-full" />
      {chartInstance !== null ? (
        <OryonDrawingLayer
          engine={chartInstance.engine}
          interactionHost={chartInstance.host}
          symbol={dataSymbol}
          digits={digits}
          pipSize={pipSize}
        />
      ) : null}
      <OryonTickBridge engineRef={engineRef} symbol={liveSymbol ?? dataSymbol} />
      <OryonPositionsOverlayBridge engineRef={engineRef} dataSymbol={dataSymbol} mounted={chartInstance !== null} />
      <OryonAlertsOverlayBridge engineRef={engineRef} dataSymbol={dataSymbol} mounted={chartInstance !== null} />
      <OryonChartLegend
        symbol={dataSymbol}
        interval={interval}
        source={source}
        bar={hoverBar}
        hasData={candles.length > 0}
      >
        {chartInstance !== null ? <OryonIndicatorLegend engine={chartInstance.engine} hoverBar={hoverBar} /> : null}
      </OryonChartLegend>
    </div>
  );
}

/**
 * Imperative tick → candle bridge. Renders null; the per-tick store
 * subscription re-renders this leaf only, then the engine merges the tick
 * into the current bucket (no workspace re-render, no React state).
 */
function OryonTickBridge({
  engineRef,
  symbol,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  symbol: string;
}) {
  const quote = useLiveQuote(symbol);

  React.useEffect(() => {
    if (quote === null) return;
    engineRef.current?.applyTick(quote.price, quote.ts);
  }, [quote, engineRef]);

  return null;
}

/**
 * Imperative positions → overlay bridge (Phase 4). Renders null; the
 * positions context re-renders this leaf only (≈ broadcast cadence), then
 * the engine diffs the overlay specs onto price lines — no chart
 * reinitialization, no duplicated lines, no workspace re-render.
 *
 * Instrument filtering (spec §8.5): ONLY positions whose symbol matches the
 * DISPLAYED data exactly are projected — the bridge follows `dataSymbol`,
 * so during a placeholder-data window the overlays belong to the data
 * actually on screen, never to the incoming selection.
 */
function OryonPositionsOverlayBridge({
  engineRef,
  dataSymbol,
  mounted,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  dataSymbol: string;
  mounted: boolean;
}) {
  const { positions, selectedId } = useOryonPositions();

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    const eligible = positionsForChart(positions, dataSymbol);
    const specs = buildPositionLineSpecs(eligible, selectedId);
    engine.setPositions(specs);
  }, [positions, selectedId, dataSymbol, mounted, engineRef]);

  return null;
}

/**
 * Imperative alerts → overlay bridge (Phase 5). Renders null; the alert
 * store re-renders this leaf only on RARE commits (create/remove/status),
 * then the engine diffs the overlay specs onto price lines — no chart
 * reinitialization, no duplicated lines, no workspace re-render.
 *
 * Instrument filtering (spec §7): ONLY active alerts whose symbol matches
 * the DISPLAYED data exactly are projected — the bridge follows `dataSymbol`,
 * so switching instruments cleans up ineligible overlays automatically and
 * a triggered/disabled alert leaves the chart until re-armed.
 */
function OryonAlertsOverlayBridge({
  engineRef,
  dataSymbol,
  mounted,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  dataSymbol: string;
  mounted: boolean;
}) {
  const { store } = useOryonAlerts();
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot);

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    const specs = buildAlertLineSpecs(snapshot.alerts, dataSymbol);
    engine.setAlerts(specs);
  }, [snapshot, dataSymbol, mounted, engineRef]);

  return null;
}

/** Top-left overlay: identity, honest source badge, OHLC of the inspected bar. */
function OryonChartLegend({
  symbol,
  interval,
  source,
  bar,
  hasData,
  children = null,
}: {
  symbol: string;
  interval: MarketInterval;
  source: "real" | "sim";
  bar: OryonCrosshairBar | null;
  hasData: boolean;
  children?: React.ReactNode;
}) {
  const dict = useDict();
  const S = dict.oryon;
  const sim = source === "sim";
  // Volume is shown ONLY for a valid positive value — the locally-merged
  // forming candle reports 0 until the server refetch (never faked).
  const volumeText = formatLegendVolume(bar?.v);

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-background/85 px-2 py-1 backdrop-blur">
      <span data-testid="oryon-legend-symbol" className="font-mono text-xs font-semibold text-foreground">
        {symbol}
      </span>
      <span data-testid="oryon-legend-interval" className="font-mono text-[11px] text-muted-foreground">
        {interval}
      </span>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-testid={sim ? "oryon-source-sim" : "oryon-source-real"}
              className={cn(
                "rounded-sm px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                sim ? "bg-warning/15 text-warning" : "bg-surface-raised text-muted-foreground",
              )}
            >
              {sim ? S.source.sim : S.source.real}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {sim ? S.source.simHint : S.source.realHint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {hasData && bar !== null ? (
        <>
          <span data-testid="oryon-legend-time" className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatCandleTime(bar.t, interval)}
          </span>
          <span data-testid="oryon-legend-ohlc" className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {S.legend.open} <span className="text-foreground">{bar.o}</span>{" "}
            {S.legend.high} <span className="text-foreground">{bar.h}</span>{" "}
            {S.legend.low} <span className="text-foreground">{bar.l}</span>{" "}
            {S.legend.close} <span className="text-foreground">{bar.c}</span>
          </span>
          {volumeText !== null ? (
            <span data-testid="oryon-legend-volume" className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {S.legend.volume} <span className="text-foreground">{volumeText}</span>
            </span>
          ) : null}
        </>
      ) : null}
      {children}
    </div>
  );
}
