"use client";

import * as React from "react";

import { toast } from "sonner";

import type { Instrument, OryonGrid } from "@cosmoz/shared";

import type { OryonPanelSessionState } from "@/lib/oryon/workspace/layouts";

import { useDict } from "@/i18n/i18n-provider";
import type { OryonChartEngine } from "@/lib/charting/oryon-chart-engine";
import {
  useOryonWorkspaceConfig,
} from "@/components/oryon/oryon-workspace-context";
import { useOryonIndicators } from "@/components/oryon/oryon-indicators-context";
import { OryonChartPanel } from "@/components/oryon/oryon-chart-panel";
import { OryonPanelHeader } from "@/components/oryon/oryon-panel-header";
import { cn } from "@/lib/utils";

/**
 * Oryon chart grid (Phase 7 spec §5) — the CSS-grid container plus the
 * per-panel wrapper.
 *
 * Arrangements: one large chart, two side by side, two stacked, four in a
 * 2×2 grid. Below the md breakpoint everything degrades to a single-column
 * stack with a practical per-panel height — four tiny charts in a forced
 * grid would be unusable (spec §15).
 *
 * Chart lifecycle discipline: panels are keyed by their STABLE ids, so grid
 * transitions reorder/resize DOM nodes without unmounting charts — the
 * engines survive, their autoSize observers absorb the resize, and no
 * subscription is recreated. Adding/removing panels mounts/unmounts exactly
 * the affected panel.
 *
 * Active-chart model (spec §7): a pointer-down or focus anywhere inside a
 * panel activates it. The FIRST pointer-down on an inactive panel only
 * activates — drawing tools and selection need the panel to already be
 * active (the interaction controller gates on the flag; React state timing
 * makes the activation click itself non-drawing, a predictable semantic).
 */

/** Grid-template classes per arrangement (md+; below md everything stacks). */
const GRID_CLASSES: Record<OryonGrid, string> = {
  single: "md:grid-cols-1 md:grid-rows-1",
  twoHorizontal: "md:grid-cols-2 md:grid-rows-1",
  twoVertical: "md:grid-cols-1 md:grid-rows-2",
  quad: "md:grid-cols-2 md:grid-rows-2",
};

export function OryonChartGrid({
  grid,
  children,
}: {
  grid: OryonGrid;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="oryon-chart-grid"
      data-grid={grid}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-px bg-border md:auto-rows-fr md:grid",
        GRID_CLASSES[grid],
      )}
    >
      {children}
    </div>
  );
}

/**
 * Resolves a panel's instrument through the catalog: an explicit symbol
 * wins (resolved by SYMBOL — the stable cross-session identity), otherwise
 * the default selection (the first active instrument the feed actually
 * covers, then the first active one). No hardcoded symbol, no invention.
 */
export function useResolvedInstrument(
  symbol: string | null,
  instruments: readonly Instrument[],
  feedSymbols: ReadonlySet<string>,
): Instrument | null {
  return React.useMemo(() => {
    if (instruments.length === 0) return null;
    if (symbol !== null) {
      const chosen = instruments.find((i) => i.symbol === symbol);
      if (chosen !== undefined) return chosen;
    }
    return (
      instruments.find((i) => i.isActive && feedSymbols.has(i.symbol)) ??
      instruments.find((i) => i.isActive) ??
      instruments[0]!
    );
  }, [instruments, symbol, feedSymbols]);
}

export function OryonChartGridPanel({
  panel,
  index,
  multi,
  active,
  magnet,
  instruments,
  feedSymbols,
  feedKnown,
  onEngineReady,
  onEngineGone,
}: {
  panel: OryonPanelSessionState;
  index: number;
  /** True when the grid shows more than one chart. */
  multi: boolean;
  active: boolean;
  magnet: boolean;
  instruments: readonly Instrument[];
  feedSymbols: ReadonlySet<string>;
  feedKnown: boolean;
  onEngineReady: (panelId: string, engine: OryonChartEngine) => void;
  onEngineGone: (panelId: string) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.panels;
  const { store } = useOryonWorkspaceConfig();
  const { registry: indicatorRegistry } = useOryonIndicators();

  const instrument = useResolvedInstrument(panel.symbol, instruments, feedSymbols);
  const indicatorStore = indicatorRegistry.storeFor(panel.id);

  const engineRef = React.useRef<OryonChartEngine | null>(null);

  const handleActivate = React.useCallback(() => {
    if (!active) store.setActivePanel(panel.id);
  }, [active, panel.id, store]);

  /** Keyboard navigation activates a panel (spec §7). PROGRAMMATIC focus
   *  moves do NOT — e.g. Radix restoring focus to a menu trigger after a
   *  duplicate/remove action would otherwise steal activation back from
   *  the copy/survivor panel the store just activated. Mouse clicks are
   *  handled by the pointerdown capture above. */
  const handleFocusActivate = React.useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches(":focus-visible")) {
        handleActivate();
      }
    },
    [handleActivate],
  );

  const handleEngineReady = React.useCallback(
    (engine: OryonChartEngine) => {
      engineRef.current = engine;
      onEngineReady(panel.id, engine);
    },
    [panel.id, onEngineReady],
  );

  // Engine destroyed (chart unmounted for an error/empty state, or the
  // panel itself removed) — the sync registration and the toolbar's engine
  // map follow the SAME lifecycle, so a remounting chart re-registers
  // cleanly and no stale engine is ever addressed (spec §10/§14).
  const handleEngineGone = React.useCallback(() => {
    engineRef.current = null;
    onEngineGone(panel.id);
  }, [panel.id, onEngineGone]);

  const handleDuplicate = React.useCallback(() => {
    const result = store.duplicatePanel(panel.id);
    if (!result.ok && result.error === "panel_capacity") {
      toast.warning(S.duplicateCapacityToast);
    }
  }, [store, panel.id, S.duplicateCapacityToast]);

  const handleRemove = React.useCallback(() => {
    store.removePanel(panel.id);
  }, [store, panel.id]);

  const handleLatest = React.useCallback(() => {
    engineRef.current?.goToLatest();
  }, []);

  const canRemove = multi;

  return (
    <section
      role="group"
      aria-label={`${S.groupLabel}: ${instrument?.symbol ?? "—"} ${panel.interval}`}
      data-testid="oryon-panel"
      data-panel-id={panel.id}
      data-panel-index={index}
      data-active={active ? "true" : "false"}
      tabIndex={0}
      onPointerDownCapture={handleActivate}
      onFocusCapture={handleFocusActivate}
      className={cn(
        "relative flex min-h-[320px] min-w-0 flex-col bg-surface outline-none md:min-h-0",
        active
          ? "z-10 ring-1 ring-inset ring-ring/70"
          : "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/40",
      )}
    >
      <OryonPanelHeader
        index={index}
        multi={multi}
        instrument={instrument}
        interval={panel.interval}
        chartType={panel.chartType}
        active={active}
        instruments={instruments}
        feedSymbols={feedSymbols}
        feedKnown={feedKnown}
        canRemove={canRemove}
        context={panel.context}
        onInstrumentSelect={(id) => {
          const next = instruments.find((i) => i.id === id);
          if (next !== undefined) store.setPanelSymbol(panel.id, next.symbol);
        }}
        onIntervalChange={(interval) => store.setPanelInterval(panel.id, interval)}
        onChartTypeChange={(type) => store.setPanelChartType(panel.id, type)}
        onContextChange={(context) => store.setPanelContext(panel.id, context)}
        onDuplicate={handleDuplicate}
        onRemove={handleRemove}
        onGoLatest={handleLatest}
      />
      <div className="relative min-h-0 flex-1">
        <OryonChartPanel
          instrument={instrument}
          interval={panel.interval}
          chartType={panel.chartType}
          magnet={magnet}
          indicatorStore={indicatorStore}
          context={panel.context}
          interactive={active}
          onEngineReady={handleEngineReady}
          onEngineGone={handleEngineGone}
        />
      </div>
    </section>
  );
}
