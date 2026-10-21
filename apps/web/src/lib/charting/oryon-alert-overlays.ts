import {
  LineStyle,
  type CreatePriceLineOptions,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";

import type { ChartTheme } from "@/lib/utils/chart-theme";

import {
  diffAlertLines,
  type AlertLineSpec,
} from "@/lib/oryon/alerts/overlay";

/**
 * Oryon alert overlay manager (Phase 5 spec §7) — one price line per ACTIVE
 * alert of the displayed instrument, drawn on the ACTIVE series with
 * Lightweight Charts v5's native price lines.
 *
 * Read-only by construction: library price lines are non-interactive —
 * there is NO drag-to-edit path (spec §7 forbids dragging an alert line to
 * modify the alert; editing happens through the management panel, which
 * validates and persists the change).
 *
 * Visual distinction (§7 — alert lines must not be confused with position
 * entry/SL/TP or user drawings): position lines use the semantic tokens
 * (entry = profit/loss, SL = warning dashed, TP = accent dashed) and user
 * drawings default to the accent; alert lines resolve to the NEUTRAL
 * text-primary token, solid, with a "▲/▼ title" painted on the line and the
 * axis label visible — unmistakable and restrained.
 *
 * Lifecycle contract (mirrors the position manager):
 *   - stable keys (the alert id) → lines UPDATE IN PLACE on store commits;
 *   - `setSeries` replays the current specs after a series rebuild (chart
 *     type switch destroys the host series and its price lines with it);
 *   - `clear()` removes everything the manager owns and nothing else —
 *     drawings, indicators, position overlays and the main series are
 *     untouched;
 *   - theme changes restyle in place (resolved tokens only — never hex).
 */

function lineOptions(spec: AlertLineSpec, theme: ChartTheme): CreatePriceLineOptions {
  return {
    price: spec.price,
    color: theme.textPrimary,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: spec.title,
  };
}

export class OryonAlertOverlayManager {
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null;
  /** Currently attached price lines by stable key (manager-owned ONLY). */
  private lines = new Map<string, IPriceLine>();
  /** Specs the attached lines currently render — the diff baseline. */
  private specs: AlertLineSpec[] = [];
  private theme: ChartTheme | null = null;

  /** Number of live price lines owned by this manager (debugStats). */
  get count(): number {
    return this.lines.size;
  }

  /**
   * Re-homes the overlay onto a (new) active series. A series rebuild
   * destroys its price lines, so the whole current spec set is replayed.
   */
  setSeries(series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null): void {
    this.series = series;
    this.lines.clear();
    if (series !== null && this.theme !== null) {
      this.applyAll(this.specs, this.theme);
    }
  }

  /** Structural sync: diff against the previous specs, apply minimal ops. */
  sync(specs: readonly AlertLineSpec[], theme: ChartTheme): void {
    this.theme = theme;
    const ops = diffAlertLines(this.specs, specs);
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

  /** Removes every owned line (instrument change / unmount). */
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
  private applyAll(specs: readonly AlertLineSpec[], theme: ChartTheme): void {
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
