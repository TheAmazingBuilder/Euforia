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
import { OryonDrawingsProvider } from "@/components/oryon/oryon-drawings-context";
import { OryonIndicatorDialog } from "@/components/oryon/oryon-indicator-dialog";
import { OryonAlertDialog } from "@/components/oryon/oryon-alerts-dialog";
import {
  OryonAlertsProvider,
  useOryonAlerts,
} from "@/components/oryon/oryon-alerts-context";
import {
  OryonIndicatorsProvider,
  useOryonIndicators,
} from "@/components/oryon/oryon-indicators-context";
import {
  OryonPositionsProvider,
} from "@/components/oryon/oryon-positions-context";
import { getLiveQuote } from "@/lib/realtime/market";
import type { OryonChartType } from "@/lib/charting/oryon-chart-engine";

export type OryonUtilityPanel = "notifications" | "alerts" | "calendar";

/**
 * Oryon — the full-screen charting workspace (Phase 1 → Phase 5).
 *
 * Provider nesting: indicator state wraps the WHOLE workspace (toolbar
 * dialog entry + chart series + legend chips share one store); position
 * state wraps it too (ONE subscription to the private stream feeds the
 * lower panel + the chart overlay bridge); alert state wraps it as well
 * (ONE subscription to the quote store feeds the evaluation engine);
 * drawing state nests inside (rail + chart layer).
 */
export function OryonView() {
  return (
    <OryonIndicatorsProvider>
      <OryonPositionsProvider>
        <OryonAlertsProvider>
          <OryonWorkspace />
          <OryonIndicatorDialog />
          <OryonAlertDialog />
        </OryonAlertsProvider>
      </OryonPositionsProvider>
    </OryonIndicatorsProvider>
  );
}

function OryonWorkspace() {
  const dict = useDict();
  const S = dict.oryon;
  const { openBrowse } = useOryonIndicators();
  const { openCreate } = useOryonAlerts();

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

  /**
   * Alert creation entry point — STABLE per instrument (never per tick):
   * the current quote is read imperatively at click time (getLiveQuote),
   * so the toolbar does not re-render on the price stream.
   */
  const onCreateAlert = React.useCallback(() => {
    if (instrument === null) return;
    const quote = getLiveQuote(instrument.symbol);
    openCreate({
      symbol: instrument.symbol,
      price: quote?.price ?? null,
      digits: instrument.digits,
    });
  }, [instrument, openCreate]);

  return (
    <OryonDrawingsProvider>
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
        onOpenIndicators={openBrowse}
        onCreateAlert={onCreateAlert}
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

      <OryonLowerPanel
        open={lowerOpen}
        onClose={() => setLowerOpen(false)}
        activeSymbol={instrument?.symbol ?? null}
      />

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
    </OryonDrawingsProvider>
  );
}
