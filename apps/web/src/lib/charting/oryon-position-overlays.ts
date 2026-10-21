import {
  LineStyle,
  type CreatePriceLineOptions,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";

import type { ChartTheme } from "@/lib/utils/chart-theme";

import {
  diffPositionLines,
  type PositionLineSpec,
} from "@/lib/oryon/positions/overlay";

/**
 * Oryon position overlay manager (Phase 4 spec §8) — entry / SL / TP price
 * lines for open positions, drawn on the ACTIVE series with Lightweight
 * Charts v5's native price lines.
 *
 * Read-only by construction (spec §4): library price lines are non-interactive
 * — there is NO drag, NO click affordance, NO mutation path. They carry no
 * order semantics; they visualize broker-reported values and nothing else.
 *
 * Lifecycle contract (§8.6):
 *   - stable keys (`positionId:level`) → lines UPDATE IN PLACE on every
 *     snapshot (create/remove only when the structure changes — no churn,
 *     no duplicate lines after repeated updates);
 *   - `setSeries(null | series)` re-homes the overlay after a series rebuild
 *     (chart-type switch destroys the host series and its price lines with
 *     it — the manager replays its current specs onto the new series);
 *   - `clear()` removes everything the manager owns and nothing else —
 *     drawings, indicators and the main series are untouched;
 *   - theme changes restyle in place (never hex — resolved tokens only).
 */

/** Resolved visual treatment per level (semantic tokens, PRD §12.1). */
function lineOptions(spec: PositionLineSpec, theme: ChartTheme): CreatePriceLineOptions {
  const color =
    spec.level === "entry"
      ? spec.side === "LONG"
        ? theme.profit
        : theme.loss
      : spec.level === "sl"
        ? theme.warning
        : theme.accent;

  return {
    price: spec.price,
    color,
    lineWidth: spec.selected ? 3 : 1,
    lineStyle: spec.level === "entry" ? LineStyle.Solid : LineStyle.Dashed,
    // Entry anchors the price scale for the position; SL/TP keep the scale
    // uncluttered (their titles are painted on the line instead).
    axisLabelVisible: spec.level === "entry",
    title: spec.title,
  };
}

export class OryonPositionOverlayManager {
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null;
  /** Currently attached price lines by stable key (manager-owned ONLY). */
  private lines = new Map<string, IPriceLine>();
  /** Specs the attached lines currently render — the diff baseline. */
  private specs: PositionLineSpec[] = [];
  private theme: ChartTheme | null = null;

  /** Number of live price lines owned by this manager (debugStats). */
  get count(): number {
    return this.lines.size;
  }

  /**
   * Re-homes the overlay onto a (new) active series. A series rebuild
   * destroys its price lines, so the whole current spec set is replayed —
   * the overlay survives chart-type switches without callers knowing.
   */
  setSeries(series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null): void {
    this.series = series;
    this.lines.clear();
    if (series !== null && this.theme !== null) {
      this.applyAll(this.specs, this.theme);
    }
  }

  /** Structural sync: diff against the previous specs, apply minimal ops. */
  sync(specs: readonly PositionLineSpec[], theme: ChartTheme): void {
    this.theme = theme;
    const ops = diffPositionLines(this.specs, specs);
    this.specs = [...specs];

    if (this.series === null) {
      // Chart not mounted / series rebuilding: specs are remembered; the
      // next setSeries() replays them. Nothing is invented meanwhile.
      return;
    }

    for (const op of ops) {
      if (op.op === "remove") {
        const line = this.lines.get(op.key);
        if (line !== undefined) {
          try {
            this.series.removePriceLine(line);
          } catch {
            // Host series already gone (rebuild) — the map reset covers it.
          }
          this.lines.delete(op.key);
        }
      }
    }
    for (const op of ops) {
      if (op.op === "create") {
        this.lines.set(op.spec.key, this.series.createPriceLine(lineOptions(op.spec, theme)));
      } else if (op.op === "update") {
        const line = this.lines.get(op.spec.key);
        line?.applyOptions(lineOptions(op.spec, theme));
      }
    }
  }

  /** Re-applies resolved tokens to every owned line (theme switch). */
  restyle(theme: ChartTheme): void {
    this.theme = theme;
    if (this.series === null) return;
    this.applyAll(this.specs, theme);
  }

  /** Removes every owned line (instrument change with no eligible positions, unmount). */
  clear(): void {
    if (this.series !== null) {
      for (const [, line] of this.lines) {
        try {
          this.series.removePriceLine(line);
        } catch {
          // Already gone with a rebuilt series.
        }
      }
    }
    this.lines.clear();
    this.specs = [];
  }

  /** Detaches everything (engine destroy — the chart itself is going away). */
  destroy(): void {
    this.lines.clear();
    this.specs = [];
    this.series = null;
    this.theme = null;
  }

  /** Full replay: clears the map and recreates every spec (setSeries/restyle). */
  private applyAll(specs: readonly PositionLineSpec[], theme: ChartTheme): void {
    if (this.series === null) return;
    for (const [, line] of this.lines) {
      try {
        this.series.removePriceLine(line);
      } catch {
        // Already gone with a rebuilt series.
      }
    }
    this.lines.clear();
    for (const spec of specs) {
      this.lines.set(spec.key, this.series.createPriceLine(lineOptions(spec, theme)));
    }
  }
}
