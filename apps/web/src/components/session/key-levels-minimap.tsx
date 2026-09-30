"use client";

import * as React from "react";
import { formatPrice } from "@cosmoz/shared";
import type { Candle, Trade } from "@cosmoz/shared";

import type { LiveQuote } from "@/lib/realtime/market";
import { cn } from "@/lib/utils";

/**
 * Key-levels minimap (Session Live chart overlay) — a compact vertical
 * gauge of TODAY'S key levels on the selected symbol: journal entries,
 * stops and take-profits positioned between the session's low and high,
 * next to the live price. Purely informational — the same data the chart
 * overlays draw, condensed so the distance-to-levels reads at a glance
 * without crosshair hunting. Nothing here is clickable into a broker.
 */

interface MinimapLevel {
  key: string;
  label: string;
  value: number;
  tone: "accent" | "profit" | "loss";
}

interface KeyLevelsMinimapProps {
  trades: Trade[];
  quote: LiveQuote | null;
  candles: Candle[];
  digits: number;
}

export function KeyLevelsMinimap({ trades, quote, candles, digits }: KeyLevelsMinimapProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  const levels = React.useMemo<MinimapLevel[]>(() => {
    const rows: MinimapLevel[] = [];
    for (const trade of trades) {
      const tag = trades.length > 1 ? ` #${trade.id.slice(0, 4)}` : "";
      const stop = trade.finalStop ?? trade.initialStop;
      if (trade.initialTP !== null) {
        rows.push({ key: `${trade.id}-tp`, label: `TP${tag}`, value: Number(trade.initialTP), tone: "profit" });
      }
      rows.push({ key: `${trade.id}-entry`, label: `Entry${tag}`, value: Number(trade.entryPrice), tone: "accent" });
      if (stop !== null) {
        rows.push({ key: `${trade.id}-sl`, label: `SL${tag}`, value: Number(stop), tone: "loss" });
      }
    }
    return rows;
  }, [trades]);

  // The gauge spans the wider of: the loaded candle range and the level
  // range (so an out-of-frame TP still reads), plus the live price.
  // Computed unconditionally (rules of hooks) — the early return follows.
  const bounds = React.useMemo(() => {
    const values: number[] = levels.map((level) => level.value);
    if (quote !== null) values.push(quote.price);
    for (const candle of candles) {
      values.push(candle.h, candle.l);
    }
    if (values.length === 0) return null;
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max - min < 1e-9) {
      min -= Math.abs(min) * 0.001 + 1e-9;
      max += Math.abs(max) * 0.001 + 1e-9;
    }
    return { min, max };
  }, [levels, quote, candles]);

  if (levels.length === 0 || bounds === null) return null;

  const positionOf = (value: number): number =>
    Math.min(100, Math.max(0, ((value - bounds.min) / (bounds.max - bounds.min)) * 100));

  const pricePos = quote !== null ? positionOf(quote.price) : null;

  return (
    <div
      className="absolute top-3 right-[76px] z-10 w-40 rounded-lg border border-border bg-background/85 shadow-sm backdrop-blur"
      data-testid="session-minimap"
      data-levels={levels.length}
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center justify-between px-2.5 py-1.5"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand key levels minimap" : "Collapse key levels minimap"}
        data-testid="session-minimap-toggle"
      >
        <span className="ledger-label">Key levels</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{levels.length}</span>
      </button>

      {!collapsed ? (
        <div className="flex gap-2.5 px-2.5 pb-2.5">
          {/* The gauge — levels positioned between session low and high */}
          <div className="relative w-1.5 shrink-0 overflow-visible rounded-full bg-muted" aria-hidden="true">
            {levels.map((level) => (
              <span
                key={level.key}
                className={cn(
                  "absolute -left-[3px] h-[3px] w-3 rounded-full",
                  level.tone === "accent" && "bg-accent",
                  level.tone === "profit" && "bg-profit",
                  level.tone === "loss" && "bg-loss",
                )}
                style={{ bottom: `${positionOf(level.value)}%` }}
              />
            ))}
            {pricePos !== null ? (
              <span
                className="absolute -left-1 size-3 rounded-full border-2 border-background bg-accent shadow"
                style={{ bottom: `calc(${pricePos}% - 6px)` }}
              />
            ) : null}
          </div>

          {/* Legend rows — price + signed distance to the live mark */}
          <div className="min-w-0 flex-1 space-y-1">
            {levels.map((level) => {
              const distance =
                quote !== null && quote.price !== 0
                  ? ((level.value - quote.price) / quote.price) * 100
                  : null;
              return (
                <div key={level.key} className="flex items-baseline justify-between gap-1.5" data-testid="session-minimap-level">
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        level.tone === "accent" && "bg-accent",
                        level.tone === "profit" && "bg-profit",
                        level.tone === "loss" && "bg-loss",
                      )}
                      aria-hidden="true"
                    />
                    {level.label}
                  </span>
                  <span className="min-w-0 text-right font-mono text-[10px] tabular-nums leading-tight">
                    <span className="block text-foreground">{formatPrice(level.value, digits)}</span>
                    {distance !== null ? (
                      <span className={cn("block", distance >= 0 ? "text-profit" : "text-loss")}>
                        {distance >= 0 ? "+" : ""}
                        {distance.toFixed(2)}%
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
