"use client";

import * as React from "react";

import {
  ArrowDownToLine,
  ChartCandlestick,
  Copy,
  EllipsisVertical,
  Globe,
  Trash,
} from "lucide-react";

import type { Instrument, MarketInterval, OryonPanelContext } from "@cosmoz/shared";

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
  onInstrumentSelect,
  onIntervalChange,
  onChartTypeChange,
  onContextChange,
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
  onInstrumentSelect: (id: string) => void;
  onIntervalChange: (interval: MarketInterval) => void;
  onChartTypeChange: (type: OryonChartType) => void;
  /** Replaces THIS panel's temporal-context prefs (Phase 8). */
  onContextChange: (context: OryonPanelContext) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onGoLatest: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.panels;
  const prefix = `oryon-panel-${index}`;

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
        {instrument?.symbol ?? "—"}
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
        {/* Temporal-context menu (Phase 8 §12) — per-panel display prefs.
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
