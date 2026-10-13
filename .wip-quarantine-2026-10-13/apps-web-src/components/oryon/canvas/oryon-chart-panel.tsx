"use client";

import * as React from "react";
import { AlertTriangle, ArrowDown, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";

import type { Candle, Instrument, MarketInterval, QuoteSource } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { useDict } from "@/i18n/i18n-provider";
import {
  STALE_MS,
  useFeedStatus,
  useLiveQuote,
} from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { formatPrice, upsertTickBar } from "@/lib/oryon/candles";
import { useOryonCandleFeed } from "@/lib/oryon/use-oryon-candle-feed";
import { getChartTheme } from "@/lib/utils/chart-theme";
import {
  OryonChartEngine,
  type OryonChartType,
} from "@/components/oryon/engine/chart-engine";
import {
  DrawingRenderer,
  type DrawingScene,
} from "@/components/oryon/drawings/drawing-engine";
import {
  DrawingController,
  attachDrawingController,
  attachDrawingKeyboard,
  type TextEditRequest,
} from "@/components/oryon/drawings/drawing-controller";
import {
  ensureDrawingBook,
  getDrawingBook,
  getSelectedDrawingId,
  subscribeDrawingStore,
} from "@/components/oryon/drawings/drawing-store";
import { TextAnnotationInput } from "@/components/oryon/drawings/text-annotation-input";

interface OryonChartPanelProps {
  instrument: Instrument | null;
  interval: MarketInterval;
  chartType: OryonChartType;
  /** Report the loaded feed's quote source to the workspace (rare updates). */
  onSourceChange?: (source: QuoteSource | null) => void;
}

/**
 * Oryon central chart workspace — owns the DATA pipeline (feed hook + live
 * tick merge), the ENGINE lifecycle and the DRAWING subsystem (Phase 2).
 * React renders only the chrome (legend, state overlays); the canvas AND
 * the drawing overlay are imperative: no tick and no pointer movement ever
 * flows through a parent re-render.
 *
 * Drawing architecture (docs/specs/oryon-prd.md §8): a capture-phase
 * controller intercepts pointer events ONLY when a drawing is hit or a
 * drawing tool is armed — chart navigation stays 100% native otherwise.
 * The renderer projects chart-domain anchors through the engine on every
 * redraw (range change, resize, tick, mutation), so drawings stay attached
 * to their time/price coordinates (PRD ACC-4).
 */
export function OryonChartPanel({
  instrument,
  interval,
  chartType,
  onSourceChange,
}: OryonChartPanelProps) {
  const dict = useDict().oryon;
  const { resolvedTheme } = useTheme();

  const symbol = instrument?.symbol ?? "";
  const feed = useOryonCandleFeed(symbol, interval);
  const quote = useLiveQuote(symbol || null);
  const { phase, lastTickAt } = useFeedStatus();
  const nowMs = useNowMs(1000);
  const feedStale =
    nowMs !== null && lastTickAt > 0 && nowMs - lastTickAt > STALE_MS;

  // Canvas tokens cannot be CSS variables — resolve them per theme change
  // (same pattern as the ECharts bridge, components/charts/echart.tsx). The
  // `void` read documents WHY resolvedTheme is a dependency of this memo.
  const theme = React.useMemo(() => {
    void resolvedTheme; // re-resolve tokens when the active theme changes
    return getChartTheme();
  }, [resolvedTheme]);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLCanvasElement | null>(null);
  const engineRef = React.useRef<OryonChartEngine | null>(null);
  const rendererRef = React.useRef<DrawingRenderer | null>(null);
  const controllerRef = React.useRef<DrawingController | null>(null);
  const lastBarRef = React.useRef<Candle | null>(null);
  const feedKeyRef = React.useRef<string>("");
  const requestOlderRef = React.useRef<() => void>(() => {});
  const symbolRef = React.useRef(symbol);
  const digitsRef = React.useRef(instrument?.digits ?? 2);
  // Latest-ref pattern: engine callbacks outlive renders, so the fresh
  // requestOlder is published from an effect (never during render).
  React.useEffect(() => {
    requestOlderRef.current = feed.requestOlder;
  });
  React.useEffect(() => {
    symbolRef.current = symbol;
    digitsRef.current = instrument?.digits ?? 2;
  }, [symbol, instrument?.digits]);

  const [hoveredBar, setHoveredBar] = React.useState<Candle | null>(null);
  const [liveBar, setLiveBar] = React.useState<Candle | null>(null);
  const [atLatest, setAtLatest] = React.useState(true);
  const [atLeftEdge, setAtLeftEdge] = React.useState(false);
  // Text annotation editing (the only drawing UI state that needs React).
  const [textEdit, setTextEdit] = React.useState<
    (TextEditRequest & { screen: { x: number; y: number } }) | null
  >(null);
  // Instrument switch closes any open editor — React's documented
  // "adjust state when a prop changes" render pattern (lint-clean).
  const [prevSymbol, setPrevSymbol] = React.useState(symbol);
  if (prevSymbol !== symbol) {
    setPrevSymbol(symbol);
    setTextEdit(null);
  }

  // ── Engine lifecycle: create on mount / theme change, destroy on unmount ──
  React.useEffect(() => {
    if (resolvedTheme === undefined) return; // next-themes not hydrated yet
    const container = containerRef.current;
    if (!container) return;

    const engine = OryonChartEngine.create(container, getChartTheme(), {
      onVisibleRangeChange: (range) => {
        setAtLatest(engine.isLatestVisible());
        setAtLeftEdge(range !== null && range.from < 30);
        // Left edge reached while older history exists → request a window.
        if (range !== null && range.from < 10) requestOlderRef.current();
        // Pans/zooms move every projected drawing.
        rendererRef.current?.requestRedraw();
      },
      onCrosshairBar: (bar) => setHoveredBar(bar),
    });
    engineRef.current = engine;
    // New engine instance → rewire the range subscription for drawings.
    const unsubscribeRange = engine.subscribeRangeChange(() => {
      rendererRef.current?.requestRedraw();
    });

    return () => {
      unsubscribeRange();
      engine.destroy();
      engineRef.current = null;
    };
  }, [resolvedTheme]);

  // ── Drawing subsystem: controller + renderer + DOM wiring (mount-once) ────
  React.useEffect(() => {
    const canvas = overlayRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const renderer = new DrawingRenderer(canvas, {
      getScene: (): DrawingScene => ({
        symbol: symbolRef.current,
        objects: getDrawingBook(symbolRef.current),
        selectedId: getSelectedDrawingId(),
        hoverId: controllerRef.current?.getHoverId() ?? null,
        draft: controllerRef.current?.getDraft() ?? null,
        draftMode: controllerRef.current?.getDraftMode() ?? null,
        suppress: controllerRef.current?.getSuppressedIds() ?? [],
        priceDigits: digitsRef.current,
      }),
      getConverter: () => engineRef.current,
      getTheme: () => getChartTheme(),
    });
    const controller = new DrawingController({
      symbol: () => symbolRef.current,
      converter: () => engineRef.current,
      renderer: () => rendererRef.current,
      openTextEditor: (request) => {
        const engine = engineRef.current;
        const x = engine?.timeToX(request.anchor.time);
        const y = engine?.priceToY(request.anchor.price);
        setTextEdit({
          ...request,
          screen: { x: x ?? 0, y: y ?? 0 },
        });
      },
    });

    rendererRef.current = renderer;
    controllerRef.current = controller;

    const detachPointer = attachDrawingController({
      wrapper,
      controller,
      // Only the chart's own canvases may seed drawing interactions —
      // toolbar buttons and legend chips never do (Phase 2 §8).
      isChartSurface: (target) =>
        target instanceof Element && target.tagName === "CANVAS",
    });
    const detachKeyboard = attachDrawingKeyboard({
      controller,
      symbol: () => symbolRef.current,
    });
    // Store changes: tool switches drive the machine; mutations redraw.
    const unsubscribeStore = subscribeDrawingStore(() => {
      controller.syncWithTool();
      renderer.requestRedraw();
    });
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(wrapper);
    renderer.resize();

    return () => {
      observer.disconnect();
      unsubscribeStore();
      detachKeyboard();
      detachPointer();
      renderer.destroy();
      controllerRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Instrument change: drawings must never leak across books — reset the
  // transient state, then hydrate (once per session) the new instrument's.
  React.useEffect(() => {
    if (!symbol) return;
    controllerRef.current?.reset();
    ensureDrawingBook(symbol);
    rendererRef.current?.requestRedraw();
  }, [symbol]);

  // ── Data: push the merged series into the engine (fit on selection change) ─
  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setSeriesType(chartType, theme);
    if (!instrument) {
      engine.setBars([], { fit: true });
      lastBarRef.current = null;
      rendererRef.current?.requestRedraw();
      return;
    }
    engine.setPriceDigits(instrument.digits);
    const key = `${instrument.symbol}|${interval}`;
    // Fit ONLY on a selection change WITH real data — marking the key on an
    // empty dataset would consume the fit before history arrives, leaving a
    // tick-zoomed viewport that setData preserves (observed: 3-bar view).
    const fit = key !== feedKeyRef.current && feed.candles.length > 0;
    engine.setBars(feed.candles, { fit });
    lastBarRef.current =
      feed.candles.length > 0 ? feed.candles[feed.candles.length - 1]! : null;
    if (fit) {
      feedKeyRef.current = key;
      setLiveBar(null);
      setHoveredBar(null);
    }
    // New bars (backfill merges) move the logical mapping — redraw drawings.
    rendererRef.current?.requestRedraw();
  }, [theme, chartType, instrument, interval, feed.candles]);

  // Report the feed source upward (badge) — only when it actually changes.
  React.useEffect(() => {
    onSourceChange?.(feed.source);
  }, [feed.source, onSourceChange]);

  // ── Live ticks: imperative series.update, plus one small legend state ─────
  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !quote) return;
    const bar = upsertTickBar(lastBarRef.current, quote.price, quote.ts, interval);
    if (bar) {
      engine.upsertBar(bar);
      lastBarRef.current = bar;
      setLiveBar(bar);
      // Autoscale may shift the price scale — keep drawings attached.
      rendererRef.current?.requestRedraw();
    }
  }, [quote, interval]);

  const candles = feed.candles;
  const displayBar = hoveredBar ?? liveBar ?? (candles.length > 0 ? candles[candles.length - 1]! : null);
  const changePositive = displayBar ? displayBar.c >= displayBar.o : true;
  const digits = instrument?.digits ?? 2;

  return (
    <section
      className="relative min-w-0 flex-1"
      aria-label={dict.tagline}
      data-testid="oryon-chart"
    >
      <div ref={wrapperRef} className="absolute inset-0">
        {/* Engine mounts here — client-only, never during SSR */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          data-testid="oryon-chart-canvas"
        />

        {/* Drawing overlay — pointer-events:none; the controller intercepts
            events in the CAPTURE phase on the wrapper, so the overlay never
            blocks chart navigation (Phase 2 §6). */}
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 z-[5]"
          data-testid="oryon-drawing-overlay"
          aria-hidden
        />

        {/* Text annotation editor — positioned at the anchor */}
        {textEdit ? (
          <TextAnnotationInput
            screen={textEdit.screen}
            initial={textEdit.initial}
            onCommit={(value) => {
              controllerRef.current?.commitTextEdit(value);
              setTextEdit(null);
            }}
            onCancel={() => {
              controllerRef.current?.cancelTextEdit();
              setTextEdit(null);
            }}
          />
        ) : null}
      </div>

      {/* OHLC legend — crosshair-aware, falls back to the live bucket */}
      {instrument && displayBar ? (
        <div
          className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
          data-testid="oryon-legend"
        >
          <span className="font-mono text-sm font-semibold">
            {instrument.symbol}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {interval}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {dict.chart.legendOpen}{" "}
            <span className={changePositive ? "text-profit" : "text-loss"}>
              {formatPrice(displayBar.o, digits)}
            </span>{" "}
            {dict.chart.legendHigh}{" "}
            <span className={changePositive ? "text-profit" : "text-loss"}>
              {formatPrice(displayBar.h, digits)}
            </span>{" "}
            {dict.chart.legendLow}{" "}
            <span className={changePositive ? "text-profit" : "text-loss"}>
              {formatPrice(displayBar.l, digits)}
            </span>{" "}
            {dict.chart.legendClose}{" "}
            <span className={changePositive ? "text-profit" : "text-loss"}>
              {formatPrice(displayBar.c, digits)}
            </span>
          </span>
        </div>
      ) : null}

      {/* Source chip — honest labeling even without the toolbar in view */}
      {feed.source ? (
        <span
          className="pointer-events-none absolute right-3 top-2 z-10 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-muted-foreground"
          data-testid="oryon-chart-source"
        >
          {feed.source === "real" ? dict.toolbar.sourceReal : dict.toolbar.sourceSim}
        </span>
      ) : null}

      {feedStale && phase !== "offline" && candles.length > 0 ? (
        <span
          className="pointer-events-none absolute right-3 top-8 z-10 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-warning"
          data-testid="oryon-chart-stale"
        >
          {dict.chart.staleBadge}
        </span>
      ) : null}

      {feed.backfilling ? (
        <span
          className="pointer-events-none absolute bottom-6 left-3 z-10 inline-flex items-center gap-1.5 rounded bg-surface px-2 py-1 text-xs text-muted-foreground shadow-sm"
          data-testid="oryon-chart-backfilling"
        >
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {dict.chart.backfilling}
        </span>
      ) : feed.historyExhausted && candles.length > 0 && atLeftEdge ? (
        <span
          className="pointer-events-none absolute bottom-6 left-3 z-10 rounded bg-surface px-2 py-1 text-xs text-muted-foreground shadow-sm"
          data-testid="oryon-chart-history-start"
        >
          {dict.chart.historyStart}
        </span>
      ) : null}

      {!atLatest && candles.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="absolute bottom-6 right-3 z-10 h-7 gap-1.5 bg-surface text-xs"
          onClick={() => engineRef.current?.goLatest()}
          data-testid="oryon-go-latest"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          {dict.chart.goLatest}
        </Button>
      ) : null}

      {/* Honest state overlays */}
      {!instrument ? (
        <OryonOverlay data-testid="oryon-state-loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {dict.workspace.loadingWorkspace}
          </p>
        </OryonOverlay>
      ) : feed.initialLoading ? (
        <OryonOverlay data-testid="oryon-state-loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{dict.chart.loading}</p>
        </OryonOverlay>
      ) : feed.initialError ? (
        <OryonOverlay data-testid="oryon-state-error">
          <AlertTriangle className="size-5 text-loss" aria-hidden />
          <p className="text-sm font-semibold">{dict.chart.errorTitle}</p>
          <p className="max-w-sm text-center text-xs text-muted-foreground">
            {dict.chart.errorMessage}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={feed.refetch}
            data-testid="oryon-error-retry"
          >
            {dict.chart.retry}
          </Button>
        </OryonOverlay>
      ) : candles.length === 0 ? (
        <OryonOverlay data-testid="oryon-state-empty">
          <p className="text-sm font-semibold">{dict.chart.emptyTitle}</p>
          <p className="max-w-sm text-center text-xs text-muted-foreground">
            {dict.chart.emptyMessage}
          </p>
        </OryonOverlay>
      ) : null}
    </section>
  );
}

function OryonOverlay({
  children,
  ...rest
}: React.ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-[2px]"
    >
      {children}
    </div>
  );
}
