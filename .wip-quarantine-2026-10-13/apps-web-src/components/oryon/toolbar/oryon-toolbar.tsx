"use client";

import * as React from "react";
import Link from "next/link";
import {
  AreaChart,
  BarChart3,
  Bell,
  CalendarDays,
  CandlestickChart,
  ChevronLeft,
  LineChart,
  Maximize,
  Minimize,
  Redo2,
  Shapes,
  Undo2,
} from "lucide-react";

import type { Instrument, MarketInterval, QuoteSource } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDict } from "@/i18n/i18n-provider";
import { formatPrice } from "@/lib/oryon/candles";
import { SUPPORTED_INTERVALS } from "@/lib/oryon/candles";
import {
  STALE_MS,
  useFeedStatus,
  useLiveQuote,
} from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import {
  ORYON_CHART_TYPES,
  type OryonChartType,
} from "@/components/oryon/engine/chart-engine";
import {
  redoDrawings,
  undoDrawings,
  useOryonDrawingHistory,
} from "@/components/oryon/drawings/drawing-store";
import { InstrumentSearch } from "@/components/oryon/toolbar/instrument-search";

export type OryonRightPanel = "notifications" | "calendar" | "objects" | null;

interface OryonToolbarProps {
  instrument: Instrument | null;
  onInstrumentSelect: (instrument: Instrument) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  /** Quote source of the loaded candle feed (badge stays honest). */
  source: QuoteSource | null;
  interval: MarketInterval;
  onIntervalChange: (interval: MarketInterval) => void;
  chartType: OryonChartType;
  onChartTypeChange: (type: OryonChartType) => void;
  rightPanel: OryonRightPanel;
  onRightPanelToggle: (panel: Exclude<OryonRightPanel, null>) => void;
  unreadCount: number;
}

const CHART_TYPE_ICONS: Record<OryonChartType, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  candles: CandlestickChart,
  bars: BarChart3,
  line: LineChart,
  area: AreaChart,
};

function Segmented({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-8 items-center overflow-hidden rounded-md border border-border bg-surface"
    >
      {children}
    </div>
  );
}

function SegmentedButton({
  active,
  onClick,
  tooltip,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tooltip: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          data-testid={testId}
          className={`h-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            active
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Undo/redo for the CURRENT instrument's drawing history (Phase 2 §12). */
function UndoRedoControls({ symbol }: { symbol: string }) {
  const dict = useDict().oryon;
  const { canUndo, canRedo } = useOryonDrawingHistory(symbol);

  return (
    <div className="flex items-center gap-0.5" data-testid="oryon-undo-redo">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => undoDrawings(symbol)}
            disabled={!canUndo}
            aria-label={dict.drawing.undo}
            data-testid="oryon-undo"
            className="text-muted-foreground"
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {dict.drawing.undo}
          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">Ctrl+Z</span>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => redoDrawings(symbol)}
            disabled={!canRedo}
            aria-label={dict.drawing.redo}
            data-testid="oryon-redo"
            className="text-muted-foreground"
          >
            <Redo2 className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {dict.drawing.redo}
          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">Ctrl+Shift+Z</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Fullscreen state lives in the browser, not in React — subscribe to it. */
function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/**
 * Oryon top toolbar — compact professional chrome. Only controls with real
 * Phase-1 behavior are rendered (cahier de charge §6.2): instrument search,
 * honest source badge, timeframes and chart types backed by the market
 * service contract, full-screen, notifications and the calendar utility
 * panel. No dead buttons.
 */
export function OryonToolbar(props: OryonToolbarProps) {
  const dict = useDict().oryon;

  // The toolbar is the ONLY workspace chrome subscribing to live ticks —
  // its re-renders stay local (small spans), the rails/panels never see one.
  const quote = useLiveQuote(props.instrument?.symbol ?? null);
  const { phase, lastTickAt } = useFeedStatus();
  const nowMs = useNowMs(1000);
  const feedStale =
    nowMs !== null && lastTickAt > 0 && nowMs - lastTickAt > STALE_MS;

  // Fullscreen availability + state come from the browser (external system).
  const fullscreenAvailable = React.useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenEnabled === true,
    () => false,
  );
  const isFullscreen = React.useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );

  const toggleFullscreen = () => {
    if (!fullscreenAvailable) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  };

  const source = props.source ?? quote?.source ?? null;
  const lastPrice = quote?.price ?? null;
  const feedDotClass =
    phase === "live"
      ? "bg-profit"
      : phase === "offline"
        ? "bg-loss"
        : "bg-warning";
  const feedLabel =
    phase === "live"
      ? dict.toolbar.feedLive
      : phase === "offline"
        ? dict.toolbar.feedOffline
        : phase === "reconnecting"
          ? dict.toolbar.feedReconnecting
          : dict.toolbar.feedConnecting;

  return (
    <header
      className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2"
      data-testid="oryon-toolbar"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            data-testid="oryon-exit"
          >
            <Link href="/" aria-label={dict.toolbar.back}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{dict.toolbar.back}</TooltipContent>
      </Tooltip>

      <span className="mr-1 hidden font-display text-sm font-semibold tracking-wide sm:block">
        {dict.title}
      </span>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <InstrumentSearch
        open={props.searchOpen}
        onOpenChange={props.onSearchOpenChange}
        selectedSymbol={props.instrument?.symbol ?? null}
        onSelect={props.onInstrumentSelect}
      />

      {props.instrument ? (
        <span className="hidden min-w-0 flex-col leading-tight lg:flex">
          <span className="truncate text-xs text-muted-foreground">
            {props.instrument.name}
          </span>
        </span>
      ) : null}

      {source ? (
        <span
          className={`ml-1 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold tracking-wider ${
            source === "real"
              ? "bg-accent/15 text-accent"
              : "border border-border text-muted-foreground"
          }`}
          data-testid="oryon-source-badge"
        >
          {source === "real" ? dict.toolbar.sourceReal : dict.toolbar.sourceSim}
        </span>
      ) : null}

      {lastPrice !== null && props.instrument ? (
        <span
          className="ml-1 hidden font-mono text-sm tabular-nums md:block"
          data-testid="oryon-last-price"
        >
          {formatPrice(lastPrice, props.instrument.digits)}
        </span>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="ml-1 inline-flex size-2 shrink-0 rounded-full"
            data-feed-phase={phase}
            data-testid="oryon-feed-dot"
            role="status"
            aria-label={feedLabel}
          >
            <span className={`size-2 rounded-full ${feedDotClass}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {feedLabel}
          {feedStale ? ` — ${dict.toolbar.feedStale}` : ""}
        </TooltipContent>
      </Tooltip>

      {feedStale ? (
        <span
          className="hidden shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-warning sm:block"
          data-testid="oryon-stale-badge"
        >
          {dict.toolbar.feedStale.toUpperCase()}
        </span>
      ) : null}

      <div className="flex-1" />

      <Segmented label={dict.toolbar.timeframeLabel}>
        {SUPPORTED_INTERVALS.map((interval) => (
          <SegmentedButton
            key={interval}
            active={interval === props.interval}
            onClick={() => props.onIntervalChange(interval)}
            tooltip={interval}
            testId={`oryon-tf-${interval}`}
          >
            {interval}
          </SegmentedButton>
        ))}
      </Segmented>

      <Segmented label={dict.toolbar.chartTypeLabel}>
        {ORYON_CHART_TYPES.map((type) => {
          const Icon = CHART_TYPE_ICONS[type];
          const tooltip =
            type === "candles"
              ? dict.toolbar.chartTypeCandles
              : type === "bars"
                ? dict.toolbar.chartTypeBars
                : type === "line"
                  ? dict.toolbar.chartTypeLine
                  : dict.toolbar.chartTypeArea;
          return (
            <SegmentedButton
              key={type}
              active={type === props.chartType}
              onClick={() => props.onChartTypeChange(type)}
              tooltip={tooltip}
              testId={`oryon-type-${type}`}
            >
              <Icon className="size-3.5" aria-hidden />
            </SegmentedButton>
          );
        })}
      </Segmented>

      {props.instrument ? <UndoRedoControls symbol={props.instrument.symbol} /> : null}

      {fullscreenAvailable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleFullscreen}
              aria-label={
                isFullscreen ? dict.toolbar.fullscreenExit : dict.toolbar.fullscreen
              }
              data-testid="oryon-fullscreen"
              className="text-muted-foreground"
            >
              {isFullscreen ? (
                <Minimize className="size-4" aria-hidden />
              ) : (
                <Maximize className="size-4" aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isFullscreen ? dict.toolbar.fullscreenExit : dict.toolbar.fullscreen}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => props.onRightPanelToggle("objects")}
            aria-pressed={props.rightPanel === "objects"}
            aria-label={dict.drawing.objectsTitle}
            data-testid="oryon-objects-toggle"
            className={`text-muted-foreground ${
              props.rightPanel === "objects" ? "bg-muted text-foreground" : ""
            }`}
          >
            <Shapes className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{dict.drawing.objectsTitle}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => props.onRightPanelToggle("notifications")}
            aria-pressed={props.rightPanel === "notifications"}
            aria-label={dict.toolbar.notifications}
            data-testid="oryon-notifications-toggle"
            className={`relative text-muted-foreground ${
              props.rightPanel === "notifications" ? "bg-muted text-foreground" : ""
            }`}
          >
            <Bell className="size-4" aria-hidden />
            {props.unreadCount > 0 ? (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 font-mono text-[9px] font-bold leading-none text-white"
                data-testid="oryon-unread-count"
              >
                {props.unreadCount > 9 ? "9+" : props.unreadCount}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{dict.toolbar.notifications}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => props.onRightPanelToggle("calendar")}
            aria-pressed={props.rightPanel === "calendar"}
            aria-label={dict.toolbar.calendar}
            data-testid="oryon-calendar-toggle"
            className={`text-muted-foreground ${
              props.rightPanel === "calendar" ? "bg-muted text-foreground" : ""
            }`}
          >
            <CalendarDays className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{dict.toolbar.calendar}</TooltipContent>
      </Tooltip>
    </header>
  );
}
