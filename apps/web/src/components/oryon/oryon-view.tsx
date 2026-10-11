"use client";

import * as React from "react";

import { toast } from "sonner";

import type { Instrument, MarketInterval } from "@cosmoz/shared";

import { useMarketServiceHealth } from "@/lib/realtime/market-health";
import { useInstruments } from "@/lib/api/queries";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { useDict } from "@/i18n/i18n-provider";

import { OryonChartGrid, OryonChartGridPanel, useResolvedInstrument } from "@/components/oryon/oryon-chart-grid";
import { OryonBottomBar } from "@/components/oryon/oryon-bottom-bar";
import { OryonFavoritesBar } from "@/components/oryon/oryon-favorites-bar";
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
import { OryonSyncCoordinator } from "@/lib/oryon/sync/sync-engine";
import type { OryonChartEngine } from "@/lib/charting/oryon-chart-engine";
import { getLiveQuote } from "@/lib/realtime/market";

export type OryonUtilityPanel = "notifications" | "alerts" | "calendar";

/**
 * Oryon — the full-screen charting workspace (Phase 1 → Phase 7).
 *
 * Provider nesting: indicator state wraps the WHOLE workspace — since
 * Phase 7 it is a REGISTRY (one store per chart panel; the toolbar dialog
 * and template flows resolve the ACTIVE panel's store); position state
 * wraps it too (ONE subscription to the private stream feeds the lower
 * panel + every chart overlay bridge); alert state wraps it as well (ONE
 * subscription to the quote store feeds the evaluation engine); drawing
 * state nests inside (a per-symbol store registry + the rail binding).
 * Phase 6 adds the workspace CONFIG layer (layouts + chart templates)
 * above the workspace itself: it owns the live arrangement state, restores
 * the active layout on mount and orchestrates template application into
 * the active panel's indicator store.
 *
 * Phase 7 adds the multi-chart grid: several INDEPENDENT chart panels
 * (own instrument/timeframe/type/indicators/drawings), an explicit
 * active-chart model, optional synchronization (time scale + crosshair at
 * the engine level, instrument + timeframe at the config level) and
 * multi-chart layout persistence.
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

  /** The ACTIVE chart panel — every chart-specific toolbar action targets it. */
  const activePanel = React.useMemo(
    () =>
      session.panels.find((p) => p.id === session.activePanelId) ??
      session.panels[0] ??
      null,
    [session.panels, session.activePanelId],
  );

  /**
   * Active panel's instrument — DERIVED, no effect: the panel's symbol wins
   * (resolved through the catalog), then the first active catalog
   * instrument the market feed actually covers (health.symbols is the
   * provider's own list), then the first active one. No hardcoded symbol,
   * no cascading render.
   */
  const instrument: Instrument | null = useResolvedInstrument(
    activePanel?.symbol ?? null,
    instruments,
    feedSymbols,
  );

  /**
   * Partial layout restore (spec §5): a layout's panels may reference
   * instruments the current catalog does not carry. Once the catalog is
   * loaded, unresolved panel symbols reset to the default selection and the
   * limitation is REPORTED once (aggregated) — the rest of the layout stays
   * applied and the dirty flag reflects the difference honestly.
   */
  const lastResetSignatureRef = React.useRef<string>("");
  React.useEffect(() => {
    if (instruments.length === 0) return;
    const unknown = session.panels.filter(
      (p) => p.symbol !== null && !instruments.some((i) => i.symbol === p.symbol),
    );
    if (unknown.length === 0) {
      lastResetSignatureRef.current = "";
      return;
    }
    const signature = unknown.map((p) => `${p.id}:${p.symbol}`).join("|");
    if (lastResetSignatureRef.current === signature) return;
    lastResetSignatureRef.current = signature;
    for (const panel of unknown) {
      store.setPanelSymbol(panel.id, null);
    }
    toast.warning(S.panels.instrumentsMissingToast, {
      testId: "oryon-layout-instrument-missing-toast",
    });
  }, [instruments, session.panels, store, S.panels.instrumentsMissingToast]);

  const covered = instrument !== null && feedSymbols.has(instrument.symbol);

  /** Chart-area box — the floating favorites bar's coordinate reference. */
  const chartAreaRef = React.useRef<HTMLDivElement | null>(null);

  // ── Sync coordinator (engine-level: time scale + crosshair) ───────────────
  // Created lazily on FIRST USE — an effect or a child's engine-ready
  // callback, never during render (react-hooks/refs discipline) — and
  // disposed on unmount. Registration always flows through the accessor,
  // so a re-created engine re-registers against a live coordinator.
  const syncRef = React.useRef<OryonSyncCoordinator | null>(null);
  const getSync = React.useCallback((): OryonSyncCoordinator => {
    if (syncRef.current === null) syncRef.current = new OryonSyncCoordinator();
    return syncRef.current;
  }, []);

  React.useEffect(() => {
    // Settings changes are rare commits — pushed imperatively, never via
    // re-render (the engines read nothing from React).
    getSync().setFeatures(session.sync);
  }, [getSync, session.sync]);

  React.useEffect(() => {
    return () => {
      syncRef.current?.dispose();
      syncRef.current = null;
    };
  }, [getSync]);

  // ── Engine registry (toolbar go-latest + sync registration) ───────────────
  const enginesRef = React.useRef<Map<string, OryonChartEngine>>(new Map());

  const handleEngineReady = React.useCallback(
    (panelId: string, engine: OryonChartEngine) => {
      enginesRef.current.set(panelId, engine);
      // The engine implements the coordinator's adapter surface directly —
      // clearCrosshairPosition is adapted to the adapter's clearCrosshair.
      getSync().register(panelId, {
        getVisibleRange: () => engine.getVisibleRange(),
        applyVisibleRange: (range) => engine.applyVisibleRange(range),
        onVisibleRangeChange: (handler) => engine.onVisibleRangeChange(handler),
        applyCrosshairAtTime: (timeSec) => engine.applyCrosshairAtTime(timeSec),
        clearCrosshair: () => engine.clearCrosshairPosition(),
        onCrosshairTime: (handler) => engine.onCrosshairTime(handler),
      });
    },
    [getSync],
  );

  const handleEngineGone = React.useCallback(
    (panelId: string) => {
      enginesRef.current.delete(panelId);
      getSync().unregister(panelId);
    },
    [getSync],
  );

  /** "Return to latest" lives in the toolbar; the engine is the ACTIVE
   *  panel's — read at click time, never stale. */
  const onGoLatest = React.useCallback(() => {
    const panelId = activePanel?.id;
    if (panelId === undefined) return;
    enginesRef.current.get(panelId)?.goToLatest();
  }, [activePanel]);

  // Dev-probe handle (multi-chart, dev builds only — mirrors the single-
  // chart __ORYON_CHART_DEBUG__ convention): per-panel identity, sync
  // state and engine observables WITHOUT scraping canvases. Never shipped
  // to production, never read by the app itself.
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const host = window as unknown as {
      __ORYON_PANELS_DEBUG__?: () => unknown;
    };
    host.__ORYON_PANELS_DEBUG__ = () => {
      const snap = store.getSnapshot();
      return snap.session.panels.map((panel, index) => {
        const engine = enginesRef.current.get(panel.id) ?? null;
        const stats = engine?.debugStats ?? null;
        const range = engine?.getVisibleRange() ?? null;
        return {
          panelId: panel.id,
          index,
          symbol: panel.symbol,
          interval: panel.interval,
          chartType: panel.chartType,
          active: snap.session.activePanelId === panel.id,
          grid: snap.session.grid,
          sync: snap.session.sync,
          visibleRange: range ? { from: range.from, to: range.to } : null,
          crosshairTime: engine?.observedCrosshairTime ?? null,
          lastCandleTime: engine?.lastCandleTime ?? null,
          series: stats?.series ?? 0,
          panes: stats?.panes ?? 0,
          priceLines: stats?.priceLines ?? 0,
          alertLines: stats?.alertLines ?? 0,
          // Phase 8 structural counters (dev probes only).
          sessionBands: stats?.sessionBands ?? 0,
          eventMarkers: stats?.eventMarkers ?? 0,
          firstMarker: engine?.firstEventMarkerScreen() ?? null,
          // Phase 9 structural counters (dev probes only).
          structureMarkers: stats?.structureMarkers ?? 0,
          keyLevelLines: stats?.keyLevelLines ?? 0,
          orBoxes: stats?.orBoxes ?? 0,
        };
      });
    };
    return () => {
      delete host.__ORYON_PANELS_DEBUG__;
    };
  }, [store]);

  /**
   * Alert creation entry point — STABLE per instrument (never per tick):
   * the current quote is read imperatively at click time (getLiveQuote),
   * so the toolbar does not re-render on the price stream. Alerts always
   * bind to the ACTIVE panel's instrument.
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
        chartType={activePanel?.chartType ?? "candles"}
        onChartTypeChange={(next) => {
          if (activePanel !== null) store.setPanelChartType(activePanel.id, next);
        }}
        magnet={session.magnet}
        onMagnetChange={(next) => store.setMagnet(next)}
        onGoLatest={onGoLatest}
        onOpenIndicators={openBrowse}
        onCreateAlert={onCreateAlert}
        lowerOpen={session.lowerOpen}
        onToggleLower={() => store.setLowerOpen(!session.lowerOpen)}
        onOpenUtility={(panel) => store.openUtility(panel)}
        onSelectInstrument={(id) => {
          const next = instruments.find((i) => i.id === id);
          if (next !== undefined && activePanel !== null) {
            store.setPanelSymbol(activePanel.id, next.symbol);
          }
        }}
      />

      <div className="flex min-h-0 flex-1">
        <OryonToolRail />

        {/* Chart-area wrapper — the favorites bar floats INSIDE this box
            (its persisted coordinates are relative to the chart area, and
            its clamp bounds are exactly what the user sees as "the chart"). */}
        <div ref={chartAreaRef} className="relative flex min-h-0 min-w-0 flex-1">
          <OryonChartGrid grid={session.grid}>
            {session.panels.map((panel, index) => (
              <OryonChartGridPanel
                key={panel.id}
                panel={panel}
                index={index}
                multi={session.panels.length > 1}
                active={panel.id === session.activePanelId}
                magnet={session.magnet}
                instruments={instruments}
                feedSymbols={feedSymbols}
                feedKnown={feedSymbols.size > 0}
                onEngineReady={handleEngineReady}
                onEngineGone={handleEngineGone}
              />
            ))}
          </OryonChartGrid>

          <OryonFavoritesBar containerRef={chartAreaRef} />
        </div>

        {/* Docked utility rail — lg+ only. */}
        {isDesktop ? (
          <OryonUtilityRail
            open={session.utilityOpen}
            panel={session.utilityPanel}
            onPanelChange={(panel) => store.openUtility(panel)}
            onClose={() => store.setUtilityOpen(false)}
            activeInstrument={instrument}
          />
        ) : null}
      </div>

      {/* Bottom bar — the ACTIVE panel's timeframe strip + clock + display
          timezone (md+; below md the panel headers own the timeframes). */}
      <OryonBottomBar
        interval={activePanel?.interval ?? "5m"}
        onIntervalChange={(next: MarketInterval) => {
          if (activePanel !== null) store.setPanelInterval(activePanel.id, next);
        }}
      />

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
        activeInstrument={instrument}
      />

      {/* Screen-reader summary of the workspace purpose (a11y). */}
      <p className="sr-only">
        {S.toolbar.instrument} · {S.toolbar.timeframes}
      </p>
      </div>
    </OryonDrawingsProvider>
  );
}
