"use client";

import * as React from "react";

import { toast } from "sonner";

import type { Instrument, MarketInterval, OryonLayoutPanel } from "@cosmoz/shared";

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
import { OryonEcoApproachBridge } from "@/components/oryon/oryon-eco-approach-bridge";
import { OryonAnalysisRestoreBridge } from "@/components/oryon/oryon-analysis-restore";
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
import {
  dateStartRange,
  historyRangeSpan,
  type OryonHistoryRangeId,
} from "@/lib/oryon/temporal/history-ranges";

/**
 * The panels the right utility rail can show — the SHARED layout enum
 * (persisted contract; single source of truth). "objects" docks the
 * drawing manager on the right rail (Toolbar v4).
 */
export type OryonUtilityPanel = OryonLayoutPanel;

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
   * Active panel's instrument - DERIVED, no effect: the panel's symbol wins
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

  /** The symbols the workspace panels display — the eco-approach bridge
   *  resolves each through the catalog itself (one shared pure rule). */
  const panelSymbols = React.useMemo(
    () => session.panels.map((panel) => panel.symbol) as readonly (string | null)[],
    [session.panels],
  );

  /** Chart-area box — the floating favorites bar's coordinate reference. */
  const chartAreaRef = React.useRef<HTMLDivElement | null>(null);
  /** Stage box — toolbar → viewport bottom; the favorites bar's VERTICAL
   *  travel bounds (it may extend down over the footer strip, v4). */
  const stageRef = React.useRef<HTMLDivElement | null>(null);

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
   *  panel's - read at click time, never stale. */
  const onGoLatest = React.useCallback(() => {
    const panelId = activePanel?.id;
    if (panelId === undefined) return;
    enginesRef.current.get(panelId)?.goToLatest();
  }, [activePanel]);

  // ── Historical range (Toolbar v4) — the footer strip targets the ACTIVE
  // panel's engine too, read at click time; the span math is clamped to
  // the bars the chart ACTUALLY holds (no fabricated history). A preset
  // wider than the loaded span degrades honestly to the full span.
  const [historyRange, setHistoryRange] = React.useState<OryonHistoryRangeId | null>(null);

  const onGoRange = React.useCallback(
    (id: OryonHistoryRangeId) => {
      const panelId = activePanel?.id;
      if (panelId === undefined) return;
      const engine = enginesRef.current.get(panelId);
      const span = engine?.dataSpan ?? null;
      if (engine === undefined || span === null) return;
      const range = historyRangeSpan(id, span);
      if (range === null) return;
      engine.applyVisibleRange(range);
      setHistoryRange(id);
    },
    [activePanel],
  );

  /** Calendar jump — the visible range STARTS at the picked day (ends at
   *  the latest bar); a custom range clears the preset highlight. */
  const onGoDate = React.useCallback(
    (dateMs: number) => {
      const panelId = activePanel?.id;
      if (panelId === undefined) return;
      const engine = enginesRef.current.get(panelId);
      const span = engine?.dataSpan ?? null;
      if (engine === undefined || span === null) return;
      const range = dateStartRange(dateMs, span);
      if (range === null) return;
      engine.applyVisibleRange(range);
      setHistoryRange(null);
    },
    [activePanel],
  );

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
          analysis: panel.analysis,
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
          structureLines: stats?.structureLines ?? 0,
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
        interval={activePanel?.interval ?? "5m"}
        onIntervalChange={(next: MarketInterval) => {
          if (activePanel !== null) store.setPanelInterval(activePanel.id, next);
        }}
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

      {/* Stage - everything below the top toolbar. The LEFT rail spans
          the FULL stage height (independent of the footer strip - v4);
          the footer (historical range + clock) sits at the bottom of the
          CENTER column; the favorites bar's vertical travel covers the
          whole stage. */}
      <div ref={stageRef} data-testid="oryon-stage" className="flex min-h-0 flex-1">
        <OryonToolRail
          objectsOpen={session.utilityOpen && session.utilityPanel === "objects"}
          onOpenObjects={() => store.openUtility("objects")}
        />

        {/* Center column — the chart grid + the footer strip below it. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Chart-area wrapper - the floating favorites bar's coordinate
              parent (its persisted coordinates stay relative to this box;
              the clamp bounds extend to the stage via boundsRef). */}
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

            <OryonFavoritesBar containerRef={chartAreaRef} boundsRef={stageRef} />
          </div>

          {/* Bottom bar - the ACTIVE panel's HISTORICAL RANGE strip
              (1D…All + calendar - how much history is visible, never the
              bar timeframe) + clock + display timezone (md+; below md the
              panel headers own the timeframes). */}
          <OryonBottomBar
            historyRange={historyRange}
            onRangeSelect={onGoRange}
            onDateSelect={onGoDate}
          />
        </div>

        {/* Docked utility rail - lg+ only, FULL stage height (v4: it now
            also hosts the drawing OBJECTS dock). */}
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

      {/* Eco-approach notifications (HIGH-impact events on the instruments
          the workspace panels display) - a null-rendering leaf in the
          alerts engine's pattern; the toast is the only channel. */}
      <OryonEcoApproachBridge
        instruments={instruments}
        feedSymbols={feedSymbols}
        panelSymbols={panelSymbols}
      />

      {/* Analysis deep-link restore (/oryon?analysis=<id> - Phase 10):
          applies the saved analysis to the ACTIVE panel + reconstructed-
          view banner. Null unless a link was consumed. */}
      <OryonAnalysisRestoreBridge instruments={instruments} />

      {/* Screen-reader summary of the workspace purpose (a11y). */}
      <p className="sr-only">
        {S.toolbar.instrument} · {S.toolbar.timeframes}
      </p>
      </div>
    </OryonDrawingsProvider>
  );
}
