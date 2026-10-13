"use client";

import * as React from "react";

import type { Instrument, MarketInterval, QuoteSource } from "@cosmoz/shared";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useAlerts, useInstruments } from "@/lib/api/queries";
import { setOryonPrefs, useOryonPrefs } from "@/lib/oryon/workspace-store";
import { type OryonChartType } from "@/components/oryon/engine/chart-engine";
import {
  OryonToolbar,
  type OryonRightPanel,
} from "@/components/oryon/toolbar/oryon-toolbar";
import { OryonDrawingRail } from "@/components/oryon/drawing/oryon-drawing-rail";
import { OryonChartPanel } from "@/components/oryon/canvas/oryon-chart-panel";
import { OryonUtilityRail } from "@/components/oryon/right/oryon-utility-rail";
import { OryonPositionsPanel } from "@/components/oryon/bottom/oryon-positions-panel";

/**
 * Oryon full-screen workspace — the dedicated charting module route
 * (/oryon, OUTSIDE the (app) shell group; AuthGate still applies).
 *
 * Layout (docs/specs/oryon-prd.md §6.1): top toolbar, left drawing rail,
 * central chart, right utility rail (docked ≥xl, overlay on tablet),
 * lower positions panel — the chart gets the maximum practical area.
 *
 * State discipline: selection lives in the workspace store
 * (lib/oryon/workspace-store.ts — useSyncExternalStore + localStorage);
 * the Instrument OBJECT is derived from the live catalog, never cached.
 * Live ticks never touch this tree — they flow into the chart engine
 * imperatively (chart panel) and a tiny local render in the toolbar.
 */

/** The catalog + market-service define this symbol (SIM provider serves it). */
const DEFAULT_SYMBOL = "XAUUSD";

export function OryonWorkspace() {
  const prefs = useOryonPrefs();
  const [rightPanel, setRightPanel] = React.useState<OryonRightPanel>(null);
  const [bottomOpen, setBottomOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [source, setSource] = React.useState<QuoteSource | null>(null);

  const catalog = useInstruments("");
  const alertsQuery = useAlerts();
  const unreadCount = alertsQuery.data?.unreadCount ?? 0;

  const isDesktop = useMediaQuery("(min-width: 1280px)"); // xl — docked rail
  const isTablet = useMediaQuery("(min-width: 768px)"); // rails visible at all

  // The selected instrument is DERIVED (symbol in the store ↔ catalog data).
  const instrument = React.useMemo(() => {
    const instruments = catalog.data?.instruments ?? [];
    if (instruments.length === 0) return null;
    return (
      (prefs.symbol !== null
        ? instruments.find((candidate) => candidate.symbol === prefs.symbol)
        : undefined) ??
      instruments.find((candidate) => candidate.symbol === DEFAULT_SYMBOL) ??
      instruments[0] ??
      null
    );
  }, [catalog.data, prefs.symbol]);

  // ⌘K / Ctrl+K opens the instrument palette; Escape closes the utility rail
  // (it must never exit the module — drawing-cancel priority comes in Phase 2).
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      if (event.key === "Escape" && !searchOpen && rightPanel !== null) {
        setRightPanel(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, rightPanel]);

  const handleInstrumentSelect = React.useCallback((next: Instrument) => {
    setOryonPrefs({ symbol: next.symbol });
    setSearchOpen(false);
  }, []);

  const handleIntervalChange = React.useCallback((next: MarketInterval) => {
    setOryonPrefs({ interval: next });
  }, []);

  const handleChartTypeChange = React.useCallback((next: OryonChartType) => {
    setOryonPrefs({ chartType: next });
  }, []);

  const handleRightPanelToggle = React.useCallback((panel: Exclude<OryonRightPanel, null>) => {
    setRightPanel((current) => (current === panel ? null : panel));
  }, []);

  const handleSourceChange = React.useCallback((next: QuoteSource | null) => {
    setSource((current) => (current === next ? current : next));
  }, []);

  const railVariant = isDesktop === false ? "overlay" : "docked";

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-background text-foreground"
      data-testid="oryon-workspace"
    >
      <TooltipProvider delayDuration={200}>
        <OryonToolbar
          instrument={instrument}
          onInstrumentSelect={handleInstrumentSelect}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          source={source}
          interval={prefs.interval}
          onIntervalChange={handleIntervalChange}
          chartType={prefs.chartType}
          onChartTypeChange={handleChartTypeChange}
          rightPanel={rightPanel}
          onRightPanelToggle={handleRightPanelToggle}
          unreadCount={unreadCount}
        />

        <div className="relative flex min-h-0 flex-1">
          {isTablet === false ? null : (
            <OryonDrawingRail className="hidden md:flex" />
          )}

          <OryonChartPanel
            instrument={instrument}
            interval={prefs.interval}
            chartType={prefs.chartType}
            onSourceChange={handleSourceChange}
          />

          {rightPanel !== null && isTablet === true ? (
            <OryonUtilityRail
              panel={rightPanel}
              onClose={() => setRightPanel(null)}
              variant={railVariant}
              symbol={instrument?.symbol ?? ""}
              className={
                railVariant === "overlay"
                  ? "absolute inset-y-0 right-0 z-30 flex shadow-xl"
                  : "static flex"
              }
            />
          ) : null}
        </div>

        <OryonPositionsPanel
          open={bottomOpen}
          onToggle={() => setBottomOpen((value) => !value)}
        />
      </TooltipProvider>
    </div>
  );
}
