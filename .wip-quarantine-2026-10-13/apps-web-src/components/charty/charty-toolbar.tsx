"use client";

import * as React from "react";
import {
  ChartCandlestick,
  ChartLine,
  ChartSpline,
  ChartNoAxesColumn,
  Grid3x3,
  Undo2,
} from "lucide-react";

import type { Instrument, MarketInterval } from "@cosmoz/shared";
import { usePreferences, useUpdatePreferencesDomain } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { ChartGridToolbar, type MultiChartLayout } from "@/components/session/chart-grid";
import { SymbolPicker } from "@/components/session/symbol-picker";
import { SessionTimer } from "@/components/session/session-timer";
import { cn } from "@/lib/utils";

import { ChartyAccountPicker } from "./charty-account-picker";

/**
 * Charty TOP TOOLBAR — the TradingView-style command strip, every control
 * real: symbol pill (searchable picker), timeframes, chart-style cycle +
 * volume/grid toggles (persisted chart preferences), ƒx indicators,
 * multi-chart layouts, drawing undo — and on the right the session timer
 * plus the §58 trading-account selector.
 */

export const CHARTY_TIMEFRAMES: readonly MarketInterval[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

const STYLE_CYCLE = ["CANDLES", "LINE", "AREA"] as const;

interface ChartyToolbarProps {
  symbol: string;
  instrument: Instrument | null;
  instruments: Instrument[];
  onSymbolChange: (symbol: string) => void;
  interval: MarketInterval;
  onIntervalChange: (interval: MarketInterval) => void;
  timeframeSyncTitle: string | null;
  indicators: React.ReactNode; // IndicatorsPopover slot (state owned by workspace)
  drawingsCount: number;
  onUndo: () => void;
  multi: {
    layout: MultiChartLayout;
    crosshairSync: boolean;
    timeframeSync: boolean;
  };
  onLayoutChange: (layout: MultiChartLayout) => void;
  onCrosshairSyncChange: (value: boolean) => void;
  onTimeframeSyncChange: (value: boolean) => void;
}

type ChartStyle = "CANDLES" | "LINE" | "AREA";

export function ChartyToolbar(props: ChartyToolbarProps) {
  const { dict } = useI18n();
  const S = dict.session;

  const { data: prefs } = usePreferences();
  const saveTrading = useUpdatePreferencesDomain("trading");
  const chart = prefs?.trading?.chart;
  const patchChart = React.useCallback(
    (next: Partial<{ style: ChartStyle; showVolume: boolean; showGrid: boolean }>) => {
      const trading = prefs?.trading;
      if (trading === undefined) return;
      saveTrading.mutate({ ...trading, chart: { ...trading.chart, ...next } });
    },
    [prefs, saveTrading],
  );

  const cycleStyle = () => {
    const current = chart?.style ?? "CANDLES";
    const index = STYLE_CYCLE.indexOf(current as ChartStyle);
    patchChart({ style: STYLE_CYCLE[(index + 1) % STYLE_CYCLE.length] });
  };
  const StyleIcon = (chart?.style ?? "CANDLES") === "CANDLES" ? ChartCandlestick : (chart?.style ?? "CANDLES") === "LINE" ? ChartLine : ChartSpline;

  return (
    <div
      role="toolbar"
      aria-label={S.view.chartToolbarAria}
      data-testid="charty-toolbar"
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5 border-b border-border bg-surface px-2 py-1.5"
    >
      {/* Symbol pill — searchable picker, TV-style avatar */}
      <SymbolPicker
        instruments={props.instruments}
        value={props.symbol}
        onChange={props.onSymbolChange}
        avatar
      />

      <Sep />

      {/* Timeframes */}
      <div className="flex items-center gap-0.5" role="group" aria-label={S.labels.timeframe}>
        {CHARTY_TIMEFRAMES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={props.interval === item}
            data-testid={`tf-${item}`}
            title={props.timeframeSyncTitle ?? item}
            onClick={() => props.onIntervalChange(item)}
            className={cn(
              "min-w-[30px] rounded px-1.5 py-1 text-xs font-semibold transition-colors",
              props.interval === item
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <Sep />

      {/* Chart style cycle + volume + grid — persisted chart preferences */}
      <IconToggle
        testid="charty-style-toggle"
        title={`${S.charty.styleTitle} (${chart?.style ?? "CANDLES"})`}
        ariaLabel={S.charty.styleTitle}
        onClick={cycleStyle}
      >
        <StyleIcon className="size-4" aria-hidden="true" />
      </IconToggle>
      <IconToggle
        testid="charty-volume-toggle"
        title={S.charty.volumeTitle}
        ariaLabel={S.charty.volumeTitle}
        active={chart?.showVolume ?? false}
        disabled={chart === undefined}
        onClick={() => patchChart({ showVolume: !(chart?.showVolume ?? false) })}
      >
        <ChartNoAxesColumn className="size-4" aria-hidden="true" />
      </IconToggle>
      <IconToggle
        testid="charty-grid-toggle"
        title={S.charty.gridTitle}
        ariaLabel={S.charty.gridTitle}
        active={chart?.showGrid ?? true}
        disabled={chart === undefined}
        onClick={() => patchChart({ showGrid: !(chart?.showGrid ?? true) })}
      >
        <Grid3x3 className="size-4" aria-hidden="true" />
      </IconToggle>

      {/* ƒx indicators */}
      {props.indicators}

      <Sep />

      {/* Multi-chart layouts */}
      <ChartGridToolbar
        bare
        layout={props.multi.layout}
        crosshairSync={props.multi.crosshairSync}
        timeframeSync={props.multi.timeframeSync}
        onLayoutChange={props.onLayoutChange}
        onCrosshairSyncChange={props.onCrosshairSyncChange}
        onTimeframeSyncChange={props.onTimeframeSyncChange}
      />

      <IconToggle
        testid="charty-toolbar-undo"
        title={S.toolRail.undoAria}
        ariaLabel={S.toolRail.undoAria}
        disabled={props.drawingsCount === 0}
        onClick={props.onUndo}
      >
        <Undo2 className="size-4" aria-hidden="true" />
      </IconToggle>

      {/* Right cluster — session timer + §58 account selector */}
      <div className="ml-auto flex min-w-0 items-center gap-2 pl-1">
        <SessionTimer />
        <ChartyAccountPicker />
      </div>
    </div>
  );
}

function Sep() {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />;
}

function IconToggle({
  testid,
  title,
  ariaLabel,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  testid: string;
  title: string;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-accent/15 text-accent"
            : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
