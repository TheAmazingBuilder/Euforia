"use client";

import * as React from "react";

import type { Instrument, MarketInterval } from "@cosmoz/shared";

import { useMarketServiceHealth } from "@/lib/realtime/market-health";
import { useInstruments } from "@/lib/api/queries";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { useDict } from "@/i18n/i18n-provider";

import { OryonChartPanel } from "@/components/oryon/oryon-chart-panel";
import { OryonLowerPanel } from "@/components/oryon/oryon-lower-panel";
import { OryonToolbar } from "@/components/oryon/oryon-toolbar";
import { OryonToolRail } from "@/components/oryon/oryon-tool-rail";
import { OryonUtilityRail } from "@/components/oryon/oryon-utility-rail";
import type { OryonChartType } from "@/lib/charting/oryon-chart-engine";

export type OryonUtilityPanel = "notifications" | "calendar";

/**
 * Oryon — the full-screen charting workspace (Phase 1).
 *
 * Layout contract (Phase 1 spec §6): a top toolbar, a left drawing-tool rail
 * (visual foundation — unimplemented tools are disabled, never faked), the
 * central chart canvas, a compact right utility rail (notifications +
 * economic calendar) and a collapsed lower panel reserved for the
 * open-position phase.
 *
 * Full-bleed discipline: on lg+ the workspace escapes the shell's main
 * padding (fixed, known values — px-8 / py-6 / pb-8) and fills the viewport
 * below the h-14 topbar. Below lg it stays inside the padded shell — the
 * bottom nav owns that space — with stacked compact layouts and the
 * utilities as a Sheet overlay instead of a docked rail.
 *
 * State discipline: only instrument / timeframe / chart type / magnet /
 * panel visibility live here. Ticks never re-render this tree (the tick
 * bridge updates the engine imperatively) and staleness is computed in
 * leaves.
 */
export function OryonView() {
  const dict = useDict();
  const S = dict.oryon;

  const instrumentsQuery = useInstruments();
  const healthQuery = useMarketServiceHealth();
  const isDesktop = useIsDesktop();

  const [instrumentId, setInstrumentId] = React.useState<string | null>(null);
  const [interval, setInterval] = React.useState<MarketInterval>("5m");
  const [chartType, setChartType] = React.useState<OryonChartType>("candles");
  const [magnet, setMagnet] = React.useState(false);
  const [utilityOpen, setUtilityOpen] = React.useState(false);
  const [utilityPanel, setUtilityPanel] = React.useState<OryonUtilityPanel>("notifications");
  const [lowerOpen, setLowerOpen] = React.useState(false);

  const instruments = React.useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );
  const feedSymbols = React.useMemo(
    () => new Set(healthQuery.data?.symbols ?? []),
    [healthQuery.data],
  );

  /**
   * Default instrument — DERIVED, no effect: the user's choice wins, then
   * the first active catalog instrument the market feed actually covers
   * (health.symbols is the provider's own list), then the first active one.
   * No hardcoded symbol, no cascading render.
   */
  const instrument: Instrument | null = React.useMemo(() => {
    if (instruments.length === 0) return null;
    if (instrumentId !== null) {
      const chosen = instruments.find((i) => i.id === instrumentId);
      if (chosen !== undefined) return chosen;
    }
    return (
      instruments.find((i) => i.isActive && feedSymbols.has(i.symbol)) ??
      instruments.find((i) => i.isActive) ??
      instruments[0]!
    );
  }, [instruments, instrumentId, feedSymbols]);

  const covered = instrument !== null && feedSymbols.has(instrument.symbol);

  /** "Return to latest" lives in the toolbar; the engine lives in the chart. */
  const latestRef = React.useRef<() => void>(() => {});

  const openUtility = React.useCallback((panel: OryonUtilityPanel) => {
    setUtilityPanel(panel);
    setUtilityOpen(true);
  }, []);

  return (
    <div
      data-testid="oryon-workspace"
      className="flex flex-col lg:-mx-8 lg:-mb-8 lg:-mt-6 lg:h-[calc(100dvh-3.5rem)]"
    >
      <OryonToolbar
        instruments={instruments}
        instrument={instrument}
        covered={covered}
        feedKnown={feedSymbols.size > 0}
        feedSymbols={feedSymbols}
        interval={interval}
        onIntervalChange={setInterval}
        chartType={chartType}
        onChartTypeChange={setChartType}
        magnet={magnet}
        onMagnetChange={setMagnet}
        onGoLatest={() => latestRef.current()}
        lowerOpen={lowerOpen}
        onToggleLower={() => setLowerOpen((open) => !open)}
        onOpenUtility={openUtility}
        onSelectInstrument={setInstrumentId}
      />

      <div className="flex min-h-0 flex-1">
        <OryonToolRail />

        <div className="relative min-w-0 flex-1">
          <OryonChartPanel
            instrument={instrument}
            interval={interval}
            chartType={chartType}
            magnet={magnet}
            onEngineReady={(goToLatest) => {
              latestRef.current = goToLatest;
            }}
          />
        </div>

        {/* Docked utility rail — lg+ only. */}
        {isDesktop ? (
          <OryonUtilityRail
            open={utilityOpen}
            panel={utilityPanel}
            onPanelChange={setUtilityPanel}
            onClose={() => setUtilityOpen(false)}
          />
        ) : null}
      </div>

      <OryonLowerPanel open={lowerOpen} onClose={() => setLowerOpen(false)} />

      {/* Overlay utilities below lg — same content, Sheet semantics. */}
      <OryonUtilityRail
        overlay
        open={!isDesktop && utilityOpen}
        panel={utilityPanel}
        onPanelChange={setUtilityPanel}
        onClose={() => setUtilityOpen(false)}
      />

      {/* Screen-reader summary of the workspace purpose (a11y). */}
      <p className="sr-only">
        {S.toolbar.instrument} · {S.toolbar.timeframes}
      </p>
    </div>
  );
}
