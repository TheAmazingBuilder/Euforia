"use client";

import * as React from "react";

import Link from "next/link";

import {
  CalendarDays,
  Bell,
  BellPlus,
  House,
  Magnet,
  Maximize,
  Minimize,
  PanelBottom,
  ChartCandlestick,
  ArrowDownToLine,
  Activity,
} from "lucide-react";

import type { Instrument, MarketInterval } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";

import { OryonIconButton } from "@/components/oryon/oryon-icon-button";
import { OryonGridMenu, OryonSyncMenu } from "@/components/oryon/oryon-grid-menu";
import { OryonInstrumentSelector } from "@/components/oryon/oryon-instrument-selector";
import { OryonLayoutsMenu } from "@/components/oryon/oryon-layouts-menu";
import { OryonTemplatesMenu } from "@/components/oryon/oryon-templates-menu";
import { OryonFeedStatus } from "@/components/oryon/oryon-feed-status";
import { OryonTimeframeSelector } from "@/components/oryon/oryon-timeframe-selector";
import type { OryonUtilityPanel } from "@/components/oryon/oryon-view";
import type { OryonChartType } from "@/lib/charting/oryon-chart-engine";
import { cn } from "@/lib/utils";

/**
 * Oryon top toolbar — instrument selection (catalog + honest feed
 * coverage), the current instrument identity, the TIMEFRAME selector (the
 * shared interval contract — bar duration, restored to the top toolbar;
 * the bottom strip owns the historical RANGE, a different control), the
 * implemented chart types, indicator management, the live feed status,
 * return-to-latest, the lower-panel toggle, utility access, browser full
 * screen and the workspace exit.
 */
export function OryonToolbar({
  instruments,
  instrument,
  covered,
  feedKnown,
  feedSymbols,
  interval,
  onIntervalChange,
  chartType,
  onChartTypeChange,
  magnet,
  onMagnetChange,
  onGoLatest,
  onOpenIndicators,
  onCreateAlert,
  lowerOpen,
  onToggleLower,
  onOpenUtility,
  onSelectInstrument,
}: {
  instruments: readonly Instrument[];
  instrument: Instrument | null;
  covered: boolean;
  feedKnown: boolean;
  feedSymbols: ReadonlySet<string>;
  /** Bar duration of the ACTIVE panel — each candle's span. */
  interval: MarketInterval;
  onIntervalChange: (interval: MarketInterval) => void;
  chartType: OryonChartType;
  onChartTypeChange: (type: OryonChartType) => void;
  magnet: boolean;
  onMagnetChange: (magnet: boolean) => void;
  onGoLatest: () => void;
  onOpenIndicators: () => void;
  onCreateAlert: () => void;
  lowerOpen: boolean;
  onToggleLower: () => void;
  onOpenUtility: (panel: OryonUtilityPanel) => void;
  onSelectInstrument: (id: string) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.toolbar;

  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    // Best effort — a blocked request must never break the workspace.
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <header
      data-testid="oryon-toolbar"
      className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-surface px-2 sm:px-3"
    >
      <OryonInstrumentSelector
        instruments={instruments}
        selected={instrument}
        feedSymbols={feedSymbols}
        feedKnown={feedKnown}
        onSelect={(id) => {
          const next = instruments.find((i) => i.id === id);
          if (next !== undefined) onSelectInstrument(next.id);
        }}
      />

      <div aria-live="polite" data-testid="oryon-instrument-identity" className="ml-1 mr-1 hidden min-w-0 shrink-0 flex-col justify-center sm:flex">
        <span className="truncate font-heading text-xs font-semibold leading-tight text-foreground">
          {instrument?.name ?? "-"}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] leading-tight text-muted-foreground">
          <span className="font-mono">{instrument?.quoteCurrency ?? ""}</span>
          {feedKnown && !covered ? (
            <span className="rounded-sm bg-warning/15 px-1 font-medium uppercase tracking-wide text-warning">
              {S.noFeed}
            </span>
          ) : null}
        </span>
      </div>

      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

      {/* Timeframe selector - BACK ON THE TOP TOOLBAR (TradingView
          parity): bar duration belongs up here, the bottom strip owns the
          historical RANGE. Canonical testids (oryon-tf-*) live here;
          per-panel strips remain in the panel headers for multi-chart
          grids. */}
      <OryonTimeframeSelector value={interval} onChange={onIntervalChange} />

      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

      <div
        role="group"
        aria-label={S.chartType}
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
      >
        <OryonToolbarTypeButton
          active={chartType === "candles"}
          icon={ChartCandlestick}
          label={S.candles}
          testid="oryon-type-candles"
          onClick={() => onChartTypeChange("candles")}
        />
        <OryonToolbarTypeButton
          active={chartType === "line"}
          icon={ArrowDownToLine}
          label={S.line}
          testid="oryon-type-line"
          onClick={() => onChartTypeChange("line")}
        />
      </div>

      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

      <OryonIconButton
        icon={Activity}
        label={S.indicatorsHint}
        onClick={onOpenIndicators}
        testid="oryon-indicators"
      />

      <OryonIconButton
        icon={BellPlus}
        label={S.alertHint}
        onClick={onCreateAlert}
        testid="oryon-alert-create"
      />

      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

      {/* Phase 7 — multi-chart arrangement + synchronization. */}
      <OryonGridMenu />
      <OryonSyncMenu />

      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

      {/* Phase 6 — workspace configuration cluster: layouts + templates. */}
      <OryonLayoutsMenu />
      <OryonTemplatesMenu />

      <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

      <OryonFeedStatus />

      <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        <OryonIconButton
          icon={ArrowDownToLine}
          label={S.latestHint}
          onClick={onGoLatest}
          testid="oryon-go-latest"
        />
        <OryonIconButton
          icon={Magnet}
          label={magnet ? S.magnetHint : S.crosshairHint}
          active={magnet}
          onClick={() => onMagnetChange(!magnet)}
          testid="oryon-magnet"
        />
        <OryonIconButton
          icon={PanelBottom}
          label={S.lowerPanelHint}
          active={lowerOpen}
          onClick={onToggleLower}
          testid="oryon-lower-toggle"
        />
        <div className="h-6 w-px bg-border" aria-hidden />
        <OryonIconButton
          icon={Bell}
          label={S.notificationsHint}
          onClick={() => onOpenUtility("notifications")}
          testid="oryon-notifications"
        />
        <OryonIconButton
          icon={CalendarDays}
          label={S.calendarHint}
          onClick={() => onOpenUtility("calendar")}
          testid="oryon-calendar"
        />
        <div className="h-6 w-px bg-border" aria-hidden />
        <OryonIconButton
          icon={isFullscreen ? Minimize : Maximize}
          label={S.fullscreenHint}
          onClick={toggleFullscreen}
          testid="oryon-fullscreen"
        />
        <Link
          href="/"
          aria-label={S.exitHint}
          data-testid="oryon-exit"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <House className="size-4" aria-hidden />
        </Link>
      </div>
    </header>
  );
}

/** Segmented chart-type button (candles / line — the implemented set). */
function OryonToolbarTypeButton({
  active,
  icon: Icon,
  label,
  testid,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  testid: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      data-testid={testid}
      onClick={onClick}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
