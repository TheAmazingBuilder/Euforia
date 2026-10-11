"use client";

import * as React from "react";

import { toast } from "sonner";

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
import {
  OryonWorkspaceConfigProvider,
  useOryonWorkspaceConfig,
  useWorkspaceConfigSnapshot,
} from "@/components/oryon/oryon-workspace-context";
import { getLiveQuote } from "@/lib/realtime/market";

export type OryonUtilityPanel = "notifications" | "alerts" | "calendar";

/**
 * Oryon — the full-screen charting workspace (Phase 1 → Phase 6).
 *
 * Provider nesting: indicator state wraps the WHOLE workspace (toolbar
 * dialog entry + chart series + legend chips share one store); position
 * state wraps it too (ONE subscription to the private stream feeds the
 * lower panel + the chart overlay bridge); alert state wraps it as well
 * (ONE subscription to the quote store feeds the evaluation engine);
 * drawing state nests inside (rail + chart layer). Phase 6 adds the
 * workspace CONFIG layer (layouts + chart templates) above the workspace
 * itself: it owns the live arrangement state, restores the active layout
 * on mount and orchestrates template application into the indicator store.
 */
export function OryonView() {
  return (
    <OryonIndicatorsProvider>
      <OryonPositionsProvider>
        <OryonAlertsProvider>
          <OryonWorkspaceConfigProvider>
            <OryonWorkspace />
            <OryonIndicatorDialog />
            <OryonAlertDialog />
          </OryonWorkspaceConfigProvider>
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
  const { store } = useOryonWorkspaceConfig();
  const { session } = useWorkspaceConfigSnapshot();

  const instrumentsQuery = useInstruments();
  const healthQuery = useMarketServiceHealth();
  const isDesktop = useIsDesktop();

  const instruments = React.useMemo(
    () => instrumentsQuery.data?.instruments ?? [],
    [instrumentsQuery.data],
  );
  const feedSymbols = React.useMemo(
    () => new Set(healthQuery.data?.symbols ?? []),
    [healthQuery.data],
  );

  /**
   * Default instrument — DERIVED, no effect: a layout/session symbol wins
   * (resolved through the catalog), then the first active catalog
   * instrument the market feed actually covers (health.symbols is the
   * provider's own list), then the first active one. No hardcoded symbol,
   * no cascading render.
   */
  const instrument: Instrument | null = React.useMemo(() => {
    if (instruments.length === 0) return null;
    if (session.symbol !== null) {
      const chosen = instruments.find((i) => i.symbol === session.symbol);
      if (chosen !== undefined) return chosen;
    }
    return (
      instruments.find((i) => i.isActive && feedSymbols.has(i.symbol)) ??
      instruments.find((i) => i.isActive) ??
      instruments[0]!
    );
  }, [instruments, session.symbol, feedSymbols]);

  /**
   * Partial layout restore (spec §5): a layout may reference an instrument
   * the current catalog does not carry. Once the catalog is loaded, an
   * unresolved session symbol is reset to the default selection and the
   * limitation is REPORTED — the rest of the layout stays applied and the
   * dirty flag reflects the difference honestly.
   */
  const lastUnresolvedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (instruments.length === 0) return;
    if (session.symbol === null) {
      lastUnresolvedRef.current = null;
      return;
    }
    const known = instruments.some((i) => i.symbol === session.symbol);
    if (known) {
      lastUnresolvedRef.current = null;
      return;
    }
    if (lastUnresolvedRef.current === session.symbol) return;
    lastUnresolvedRef.current = session.symbol;
    store.setSymbol(null);
    toast.warning(S.layouts.instrumentMissingToast, {
      testId: "oryon-layout-instrument-missing-toast",
    });
  }, [instruments, session.symbol, store, S.layouts.instrumentMissingToast]);

  const covered = instrument !== null && feedSymbols.has(instrument.symbol);

  /** "Return to latest" lives in the toolbar; the engine lives in the chart. */
  const latestRef = React.useRef<() => void>(() => {});

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
        interval={session.interval}
        onIntervalChange={(next: MarketInterval) => store.setInterval(next)}
        chartType={session.chartType}
        onChartTypeChange={(next) => store.setChartType(next)}
        magnet={session.magnet}
        onMagnetChange={(next) => store.setMagnet(next)}
        onGoLatest={() => latestRef.current()}
        onOpenIndicators={openBrowse}
        onCreateAlert={onCreateAlert}
        lowerOpen={session.lowerOpen}
        onToggleLower={() => store.setLowerOpen(!session.lowerOpen)}
        onOpenUtility={(panel) => store.openUtility(panel)}
        onSelectInstrument={(id) => {
          const next = instruments.find((i) => i.id === id);
          if (next !== undefined) store.setSymbol(next.symbol);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <OryonToolRail />

        <div className="relative min-w-0 flex-1">
          <OryonChartPanel
            instrument={instrument}
            interval={session.interval}
            chartType={session.chartType}
            magnet={session.magnet}
            onEngineReady={(goToLatest) => {
              latestRef.current = goToLatest;
            }}
          />
        </div>

        {/* Docked utility rail — lg+ only. */}
        {isDesktop ? (
          <OryonUtilityRail
            open={session.utilityOpen}
            panel={session.utilityPanel}
            onPanelChange={(panel) => store.openUtility(panel)}
            onClose={() => store.setUtilityOpen(false)}
          />
        ) : null}
      </div>

      <OryonLowerPanel
        open={session.lowerOpen}
        onClose={() => store.setLowerOpen(false)}
        activeSymbol={instrument?.symbol ?? null}
      />

      {/* Overlay utilities below lg — same content, Sheet semantics. */}
      <OryonUtilityRail
        overlay
        open={!isDesktop && session.utilityOpen}
        panel={session.utilityPanel}
        onPanelChange={(panel) => store.openUtility(panel)}
        onClose={() => store.setUtilityOpen(false)}
      />

      {/* Screen-reader summary of the workspace purpose (a11y). */}
      <p className="sr-only">
        {S.toolbar.instrument} · {S.toolbar.timeframes}
      </p>
      </div>
    </OryonDrawingsProvider>
  );
}
