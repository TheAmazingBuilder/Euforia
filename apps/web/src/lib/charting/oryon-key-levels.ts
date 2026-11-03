import {
  LineStyle,
  type CreatePriceLineOptions,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";

import type { ChartTheme } from "@/lib/utils/chart-theme";

/**
 * Oryon key-level overlay manager (Phase 9 spec §6) - previous-day /
 * previous-week / opening-range reference levels rendered as native
 * Lightweight Charts v5 price lines on the ACTIVE series.
 *
 * Mirrors the Phase 4 position / Phase 5 alert overlay managers:
 *   - stable keys (`kind[:period]`) → lines UPDATE IN PLACE (no churn, no
 *     duplicates after repeated syncs);
 *   - `setSeries` re-homes the overlay after a series rebuild (chart-type
 *     switch destroys the host series and its price lines - the manager
 *     replays its current specs onto the new series);
 *   - `clear()` removes everything the manager owns and nothing else;
 *   - theme changes restyle in place (resolved tokens only - never hex).
 *
 * Visual hierarchy (spec §6.3): one restrained style per level family -
 * previous-day = solid accent, previous-week = dotted categorical,
 * opening-range = dashed categorical, open/close = muted dashed with no
 * axis label (secondary reference). Meaning is NEVER color-only: every
 * line carries its short title code (PDH/PWH/OR-H/…), so the categories
 * stay readable in every theme and for color-blind users.
 */

export type OryonKeyLevelKind =
  | "PDH"
  | "PDL"
  | "PDO"
  | "PDC"
  | "PWH"
  | "PWL"
  | "PWO"
  | "PWC"
  | "ORH"
  | "ORL";

export interface OryonKeyLevelSpec {
  /** Stable identity - kind + period key (e.g. "PDH:2026-10-09"). */
  readonly key: string;
  readonly kind: OryonKeyLevelKind;
  /** The level price - a REAL aggregated candle value (never fabricated). */
  readonly price: number;
  /** Short code painted on the line (titles, never color-only, §6.3). */
  readonly title: string;
}

function lineOptions(spec: OryonKeyLevelSpec, theme: ChartTheme): CreatePriceLineOptions {
  const secondary = spec.kind === "PDO" || spec.kind === "PDC" || spec.kind === "PWO" || spec.kind === "PWC";
  const color = spec.kind.startsWith("PD")
    ? secondary
      ? theme.textMuted
      : theme.accent
    : spec.kind.startsWith("PW")
      ? secondary
        ? theme.textMuted
        : theme.indicatorPalette[1] ?? theme.accent
      : theme.indicatorPalette[5] ?? theme.warning; // opening range

  const lineStyle = spec.kind.startsWith("PW")
    ? LineStyle.Dotted
    : spec.kind.startsWith("OR")
      ? LineStyle.Dashed
      : secondary
        ? LineStyle.Dashed
        : LineStyle.Solid;

  return {
    price: spec.price,
    color,
    lineWidth: 1,
    lineStyle,
    // H/L levels anchor the price scale (the whole point of a level);
    // open/close stay title-only to keep the axis readable (§6.3).
    axisLabelVisible: !secondary,
    title: spec.title,
  };
}

export class OryonKeyLevelsOverlayManager {
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null;
  private lines = new Map<string, IPriceLine>();
  private specs: OryonKeyLevelSpec[] = [];
  private theme: ChartTheme | null = null;

  /** Number of live price lines owned by this manager (debugStats). */
  get count(): number {
    return this.lines.size;
  }

  /** Re-homes the overlay onto a (new) active series - full replay. */
  setSeries(series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null): void {
    this.series = series;
    this.lines.clear();
    if (series !== null && this.theme !== null) {
      this.applyAll(this.specs, this.theme);
    }
  }

  /** Structural sync - small diff (≤10 lines): create/update/remove. */
  sync(specs: readonly OryonKeyLevelSpec[], theme: ChartTheme): void {
    this.theme = theme;
    const next = new Map(specs.map((spec) => [spec.key, spec]));
    for (const [key, line] of this.lines) {
      if (!next.has(key)) {
        try {
          this.series?.removePriceLine(line);
        } catch {
          // Host series already gone (rebuild) - the map reset covers it.
        }
        this.lines.delete(key);
      }
    }
    this.specs = [...specs];
    if (this.series === null) return; // remembered; replayed on setSeries
    for (const spec of specs) {
      const existing = this.lines.get(spec.key);
      if (existing === undefined) {
        this.lines.set(spec.key, this.series.createPriceLine(lineOptions(spec, theme)));
      } else {
        existing.applyOptions(lineOptions(spec, theme));
      }
    }
  }

  /** Re-applies resolved tokens to every owned line (theme switch). */
  restyle(theme: ChartTheme): void {
    this.theme = theme;
    if (this.series === null) return;
    this.applyAll(this.specs, theme);
  }

  /** Removes every owned line (analysis disabled, unmount). */
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

  destroy(): void {
    this.lines.clear();
    this.specs = [];
    this.series = null;
    this.theme = null;
  }

  private applyAll(specs: readonly OryonKeyLevelSpec[], theme: ChartTheme): void {
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
