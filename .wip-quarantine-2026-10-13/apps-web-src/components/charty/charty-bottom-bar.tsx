"use client";

import * as React from "react";
import { CalendarDays, Maximize, Minimize } from "lucide-react";

import type { DrawingKind, DrawingObject, MarketInterval } from "@cosmoz/shared";
import { DRAWING_TOOLS } from "@/lib/utils/drawings";
import { useI18n } from "@/i18n/i18n-provider";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

import { CHARTY_TOOL_ICONS } from "./charty-tools";

/**
 * Charty BOTTOM BAR — TradingView's bottom strip, with only real controls:
 *  - Range presets (1D → 5Y + "Tout") that zoom the chart's data window
 *    (analysis-chart dispatches the dataZoom — no fake buttons);
 *  - the compact drawing-tool row (same armed-tool contract as the left rail);
 *  - the live UTC clock and a real browser-fullscreen toggle.
 */

export const CHARTY_RANGES: readonly { id: string; label: string }[] = [
  { id: "1D", label: "1D" },
  { id: "5D", label: "5D" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "6M", label: "6M" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "5Y", label: "5Y" },
  { id: "ALL", label: "Tout" },
] as const;

interface ChartyBottomBarProps {
  rangePreset: string;
  onRangeChange: (preset: string) => void;
  tool: DrawingKind | null;
  onToolChange: (tool: DrawingKind | null) => void;
  drawings: DrawingObject[];
  interval: MarketInterval;
}

export function ChartyBottomBar({ rangePreset, onRangeChange, tool, onToolChange, drawings, interval }: ChartyBottomBarProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const nowMs = useNowMs();

  const [fullscreen, setFullscreen] = React.useState(false);
  React.useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const terminal = document.getElementById("charty-terminal");
    if (terminal === null) return;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
    } else {
      void terminal.requestFullscreen();
    }
  }, []);

  const clock = React.useMemo(() => {
    if (nowMs === null) return "--:--:--";
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(nowMs));
  }, [nowMs]);

  return (
    <div
      role="toolbar"
      aria-label={S.charty.bottomBarAria}
      data-testid="charty-bottom-bar"
      className="flex h-10 items-center gap-2 overflow-x-auto border-t border-border bg-surface px-2"
    >
      {/* Range presets — real dataZoom windows over the loaded candles */}
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={S.charty.rangeGroupAria}>
        {CHARTY_RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            aria-pressed={rangePreset === range.id}
            data-testid={`charty-range-${range.id}`}
            onClick={() => onRangeChange(range.id)}
            title={range.id === "ALL" ? S.charty.rangeAllTitle : `${range.label} — ${S.charty.rangeHintTail}`}
            className={cn(
              "rounded px-1.5 py-1 text-xs font-semibold transition-colors",
              rangePreset === range.id
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      {/* Compact drawing row — same armed-tool contract as the left rail */}
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={S.toolRail.drawingsAria}>
        {DRAWING_TOOLS.slice(0, 5).map((meta) => {
          const Icon = CHARTY_TOOL_ICONS[meta.kind];
          const active = tool === meta.kind;
          return (
            <button
              key={meta.kind}
              type="button"
              title={meta.label}
              aria-label={meta.label}
              aria-pressed={active}
              data-testid={`charty-bottom-tool-${meta.kind}`}
              onClick={() => onToolChange(active ? null : meta.kind)}
              className={cn(
                "hidden size-7 items-center justify-center rounded transition-colors sm:flex",
                active ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
        {drawings.length > 0 ? (
          <span className="ml-1 hidden rounded-full bg-warning/10 px-1.5 font-mono text-[10px] text-warning sm:inline">
            {drawings.length}
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:flex" title={S.charty.intervalTitle}>
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span className="font-mono tabular-nums" data-testid="charty-interval-chip">
            {interval}
          </span>
        </span>
        <span
          className="font-mono text-[11px] tabular-nums text-muted-foreground"
          data-testid="charty-clock"
          aria-label={S.charty.utcClockAria}
        >
          {clock} UTC
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? S.charty.exitFullscreenAria : S.charty.fullscreenAria}
          aria-pressed={fullscreen}
          data-testid="charty-fullscreen"
          title={fullscreen ? S.charty.exitFullscreenAria : S.charty.fullscreenAria}
          className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
        >
          {fullscreen ? <Minimize className="size-3.5" aria-hidden="true" /> : <Maximize className="size-3.5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
