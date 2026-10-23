"use client";

import * as React from "react";

import {
  ArrowDownToLine,
  ChartCandlestick,
  Copy,
  EllipsisVertical,
  Activity,
  Globe,
  Trash,
} from "lucide-react";

import type {
  Instrument,
  MarketInterval,
  OryonPanelAnalysis,
  OryonPanelContext,
} from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OryonInstrumentSelector } from "@/components/oryon/oryon-instrument-selector";
import { OryonTimeframeSelector } from "@/components/oryon/oryon-timeframe-selector";
import type { OryonChartType } from "@/lib/charting/oryon-chart-engine";
import { cn } from "@/lib/utils";

/**
 * Oryon panel header — the compact per-chart control strip (Phase 7 §6):
 * instrument, timeframe and chart type for THIS panel, the active-panel
 * badge and a panel menu (duplicate / remove / return to latest).
 *
 * In a single-chart workspace the selectors stay in the toolbar (they
 * already target the only panel) — the header shows identity + actions
 * only, so no control is ever duplicated on screen. From two panels on,
 * every panel carries its own full control set.
 *
 * Testids are namespaced per panel index (`oryon-panel-{index}-*`) so they
 * never collide with the toolbar's canonical ids in strict-mode probes.
 */
export function OryonPanelHeader({
  index,
  multi,
  instrument,
  interval,
  chartType,
  active,
  instruments,
  feedSymbols,
  feedKnown,
  canRemove,
  context,
  analysis,
  onInstrumentSelect,
  onIntervalChange,
  onChartTypeChange,
  onContextChange,
  onAnalysisChange,
  onDuplicate,
  onRemove,
  onGoLatest,
}: {
  index: number;
  /** True when the grid shows more than one chart. */
  multi: boolean;
  instrument: Instrument | null;
  interval: MarketInterval;
  chartType: OryonChartType;
  active: boolean;
  instruments: readonly Instrument[];
  feedSymbols: ReadonlySet<string>;
  feedKnown: boolean;
  canRemove: boolean;
  /** THIS panel's temporal-context prefs (Phase 8 §12). */
  context: OryonPanelContext;
  /** THIS panel's structure & key-level analysis prefs (Phase 9 §7). */
  analysis: OryonPanelAnalysis;
  onInstrumentSelect: (id: string) => void;
  onIntervalChange: (interval: MarketInterval) => void;
  onChartTypeChange: (type: OryonChartType) => void;
  /** Replaces THIS panel's temporal-context prefs (Phase 8). */
  onContextChange: (context: OryonPanelContext) => void;
  /** Replaces THIS panel's analysis prefs (Phase 9). */
  onAnalysisChange: (analysis: OryonPanelAnalysis) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onGoLatest: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.panels;
  const A = dict.oryon.analysis;
  const prefix = `oryon-panel-${index}`;

  const structure = analysis.structure;
  const levels = analysis.levels;
  const anyAnalysisActive =
    structure.enabled ||
    levels.prevDayHighLow ||
    levels.prevDayOpenClose ||
    levels.prevWeekHighLow ||
    levels.prevWeekOpenClose ||
    levels.openingRange;

  const patchStructure = (partial: Partial<OryonPanelAnalysis["structure"]>): void =>
    onAnalysisChange({ ...analysis, structure: { ...structure, ...partial } });
  const patchLevels = (partial: Partial<OryonPanelAnalysis["levels"]>): void =>
    onAnalysisChange({ ...analysis, levels: { ...levels, ...partial } });

  return (
    <div
      data-testid={`${prefix}-header`}
      className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-surface px-2"
    >
      <span
        data-testid={`${prefix}-active-dot`}
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full transition-colors",
          active ? "bg-accent" : "bg-transparent",
        )}
      />
      <span
        data-testid={`${prefix}-identity`}
        className={cn(
          "shrink-0 font-mono text-[11px] font-semibold leading-none",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {instrument?.symbol ?? "-"}
      </span>
      <span
        data-testid={`${prefix}-identity-interval`}
        className="shrink-0 font-mono text-[10px] leading-none text-muted-foreground"
      >
        {interval}
      </span>

      {active ? (
        <span
          data-testid={`${prefix}-active-badge`}
          className="shrink-0 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent"
        >
          {S.activeBadge}
        </span>
      ) : null}

      {multi ? (
        <>
          <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <OryonInstrumentSelector
            instruments={instruments}
            selected={instrument}
            feedSymbols={feedSymbols}
            feedKnown={feedKnown}
            onSelect={onInstrumentSelect}
            idPrefix={prefix}
          />
          <OryonTimeframeSelector
            value={interval}
            onChange={onIntervalChange}
            idPrefix={prefix}
          />
          <div
            role="group"
            aria-label={dict.oryon.toolbar.chartType}
            className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
          >
            <PanelTypeButton
              active={chartType === "candles"}
              icon={ChartCandlestick}
              label={dict.oryon.toolbar.candles}
              testid={`${prefix}-type-candles`}
              onClick={() => onChartTypeChange("candles")}
            />
            <PanelTypeButton
              active={chartType === "line"}
              icon={ArrowDownToLine}
              label={dict.oryon.toolbar.line}
              testid={`${prefix}-type-line`}
              onClick={() => onChartTypeChange("line")}
            />
          </div>
        </>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center">
        {/* Analysis menu (Phase 9 §7) - per-panel structure + key-level
            config. Grouped, whitelist-validated values (radios over bounded
            vocabularies - no free numeric input can produce an invalid
            calculation parameter). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={A.menuHint}
              data-testid={`${prefix}-analysis-menu`}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                anyAnalysisActive ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Activity className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[70vh] min-w-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {A.menuTitle}
            </DropdownMenuLabel>

            <DropdownMenuLabel className="text-[11px] font-semibold text-foreground">
              {A.structureTitle}
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={structure.enabled}
              data-testid={`${prefix}-analysis-structure`}
              onCheckedChange={(checked) => patchStructure({ enabled: checked === true })}
            >
              {A.structureEnable}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={structure.showSwingHighs}
              disabled={!structure.enabled}
              data-testid={`${prefix}-analysis-highs`}
              onCheckedChange={(checked) => patchStructure({ showSwingHighs: checked === true })}
            >
              {A.swingHighs}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={structure.showSwingLows}
              disabled={!structure.enabled}
              data-testid={`${prefix}-analysis-lows`}
              onCheckedChange={(checked) => patchStructure({ showSwingLows: checked === true })}
            >
              {A.swingLows}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={structure.showLabels}
              disabled={!structure.enabled}
              data-testid={`${prefix}-analysis-labels`}
              onCheckedChange={(checked) => patchStructure({ showLabels: checked === true })}
            >
              {A.labels}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={structure.showProvisional}
              disabled={!structure.enabled}
              data-testid={`${prefix}-analysis-provisional`}
              onCheckedChange={(checked) => patchStructure({ showProvisional: checked === true })}
            >
              {A.provisional}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={structure.breaksEnabled}
              disabled={!structure.enabled}
              data-testid={`${prefix}-analysis-breaks`}
              onCheckedChange={(checked) => patchStructure({ breaksEnabled: checked === true })}
            >
              {A.breaks}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={structure.showBreakLines}
              disabled={!structure.enabled || !structure.breaksEnabled}
              data-testid={`${prefix}-analysis-break-lines`}
              onCheckedChange={(checked) => patchStructure({ showBreakLines: checked === true })}
            >
              {A.breakLines}
            </DropdownMenuCheckboxItem>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {A.breakMode}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={structure.breakMode}
              onValueChange={(value) =>
                patchStructure({ breakMode: value as OryonPanelAnalysis["structure"]["breakMode"] })
              }
            >
              <DropdownMenuRadioItem
                value="close"
                disabled={!structure.breaksEnabled}
                data-testid={`${prefix}-analysis-break-close`}
              >
                {A.breakModeClose}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="wick"
                disabled={!structure.breaksEnabled}
                data-testid={`${prefix}-analysis-break-wick`}
              >
                {A.breakModeWick}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {A.pivotStyle}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={structure.pivotStyle}
              onValueChange={(value) =>
                patchStructure({ pivotStyle: value as OryonPanelAnalysis["structure"]["pivotStyle"] })
              }
            >
              <DropdownMenuRadioItem
                value="arrows"
                disabled={!structure.enabled}
                data-testid={`${prefix}-analysis-pstyle-arrows`}
              >
                {A.pivotStyleArrows}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="circles"
                disabled={!structure.enabled}
                data-testid={`${prefix}-analysis-pstyle-circles`}
              >
                {A.pivotStyleCircles}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {A.pivotLeft}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(structure.leftBars)}
              onValueChange={(value) => patchStructure({ leftBars: Number(value) })}
            >
              {[2, 3, 5, 8].map((bars) => (
                <DropdownMenuRadioItem
                  key={bars}
                  value={String(bars)}
                  disabled={!structure.enabled}
                  data-testid={`${prefix}-analysis-left-${bars}`}
                >
                  {bars}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {A.pivotRight}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(structure.rightBars)}
              onValueChange={(value) => patchStructure({ rightBars: Number(value) })}
            >
              {[1, 2, 3, 5].map((bars) => (
                <DropdownMenuRadioItem
                  key={bars}
                  value={String(bars)}
                  disabled={!structure.enabled}
                  data-testid={`${prefix}-analysis-right-${bars}`}
                >
                  {bars}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold text-foreground">
              {A.levelsTitle}
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={levels.prevDayHighLow}
              data-testid={`${prefix}-analysis-pdhl`}
              onCheckedChange={(checked) => patchLevels({ prevDayHighLow: checked === true })}
            >
              {A.pdhl}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={levels.prevDayOpenClose}
              data-testid={`${prefix}-analysis-pdoc`}
              onCheckedChange={(checked) => patchLevels({ prevDayOpenClose: checked === true })}
            >
              {A.pdoc}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={levels.prevWeekHighLow}
              data-testid={`${prefix}-analysis-pwhl`}
              onCheckedChange={(checked) => patchLevels({ prevWeekHighLow: checked === true })}
            >
              {A.pwhl}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={levels.prevWeekOpenClose}
              data-testid={`${prefix}-analysis-pwoc`}
              onCheckedChange={(checked) => patchLevels({ prevWeekOpenClose: checked === true })}
            >
              {A.pwoc}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={levels.openingRange}
              data-testid={`${prefix}-analysis-or`}
              onCheckedChange={(checked) => patchLevels({ openingRange: checked === true })}
            >
              {A.orEnable}
            </DropdownMenuCheckboxItem>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {A.orSession}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={levels.orSessionId}
              onValueChange={(value) =>
                patchLevels({ orSessionId: value as OryonPanelAnalysis["levels"]["orSessionId"] })
              }
            >
              {(["sydney", "tokyo", "london", "newyork"] as const).map((sessionId) => (
                <DropdownMenuRadioItem
                  key={sessionId}
                  value={sessionId}
                  data-testid={`${prefix}-analysis-or-${sessionId}`}
                >
                  {A[sessionId]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {A.orDuration}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(levels.orDurationMinutes)}
              onValueChange={(value) =>
                patchLevels({ orDurationMinutes: Number(value) as OryonPanelAnalysis["levels"]["orDurationMinutes"] })
              }
            >
              {[15, 30, 60, 120].map((minutes) => (
                <DropdownMenuRadioItem
                  key={minutes}
                  value={String(minutes)}
                  data-testid={`${prefix}-analysis-or-${minutes}`}
                >
                  {A[`orDuration${minutes}` as keyof typeof A] as string}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuCheckboxItem
              checked={levels.orShowDeveloping}
              data-testid={`${prefix}-analysis-or-dev`}
              onCheckedChange={(checked) => patchLevels({ orShowDeveloping: checked === true })}
            >
              {A.orDeveloping}
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-normal leading-tight text-muted-foreground">
              {A.sourceNote}
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Temporal-context menu (Phase 8 §12) - per-panel display prefs.
            Session shading and event markers toggle INDEPENDENTLY; the
            importance threshold only ever widens/narrows the marker set. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={dict.oryon.context.menuHint}
              data-testid={`${prefix}-context-menu`}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                context.sessionShading || context.eventMarkers
                  ? "text-accent"
                  : "text-muted-foreground",
              )}
            >
              <Globe className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {dict.oryon.context.menuTitle}
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={context.sessionShading}
              data-testid={`${prefix}-context-sessions`}
              onCheckedChange={(checked) =>
                onContextChange({ ...context, sessionShading: checked === true })
              }
            >
              {dict.oryon.context.sessionsToggle}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={context.eventMarkers}
              data-testid={`${prefix}-context-events`}
              onCheckedChange={(checked) =>
                onContextChange({ ...context, eventMarkers: checked === true })
              }
            >
              {dict.oryon.context.eventsToggle}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {dict.oryon.context.minImportance}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={context.eventMinImportance}
              onValueChange={(value) =>
                onContextChange({
                  ...context,
                  eventMinImportance: value as OryonPanelContext["eventMinImportance"],
                })
              }
            >
              <DropdownMenuRadioItem value="LOW" data-testid={`${prefix}-context-imp-low`}>
                {dict.oryon.context.importanceLow}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="MEDIUM" data-testid={`${prefix}-context-imp-medium`}>
                {dict.oryon.context.importanceMedium}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="HIGH" data-testid={`${prefix}-context-imp-high`}>
                {dict.oryon.context.importanceHigh}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={S.menuHint}
              data-testid={`${prefix}-menu`}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <EllipsisVertical className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem
              data-testid={`${prefix}-menu-duplicate`}
              onSelect={onDuplicate}
            >
              <Copy className="size-3.5" aria-hidden />
              {S.duplicate}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`${prefix}-menu-latest`}
              onSelect={onGoLatest}
            >
              <ArrowDownToLine className="size-3.5" aria-hidden />
              {S.latest}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`${prefix}-menu-remove`}
              disabled={!canRemove}
              onSelect={onRemove}
              className="text-loss focus:text-loss"
            >
              <Trash className="size-3.5" aria-hidden />
              {S.remove}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Segmented chart-type button (candles / line — the implemented set). */
function PanelTypeButton({
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
        "flex size-6 items-center justify-center rounded-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <Icon className="size-3" aria-hidden />
    </button>
  );
}
