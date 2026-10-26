"use client";

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  UTCTimestamp,
} from "lightweight-charts";

import type { OryonDrawingConversions } from "./oryon-chart-engine";
import { getThemeToken } from "@/lib/utils/theme";

/**
 * Oryon session-overlay primitive (Phase 8 spec §5) - the rendering half of
 * the session visualization.
 *
 * WHY a series primitive (same argument as the drawing primitive, audit-
 * verified against the installed 5.2.1 typings): LWC calls updateAllViews()
 * + the pane renderer before EVERY internal repaint (pan, zoom, autoscale,
 * autoSize resize, data updates, live ticks) - session shading cannot drift
 * from the candles because the library's own paint loop projects it.
 *
 * WHY zOrder "bottom": the typings expose PrimitivePaneViewZOrder = "bottom"
 * | "normal" | "top"; "bottom" renders BEHIND the series - translucent
 * session bands sit under the candles (spec §5: "subtle vertical session-
 * background shading", "do not use large opaque rectangles that obscure
 * price action"). Fill alpha ≈ 0.07, a hairline at each band start, and a
 * compact label only when the band is wide enough to hold one.
 *
 * NO per-candle DOM: one canvas, one renderer pass, bands projected from
 * UTC seconds through the engine's conversion facade (§14).
 */

/** Resolved color lookup - cleared on theme re-apply (engine applyTheme). */
export type SessionColorResolver = (tokenKey: string) => string;

export interface OryonSessionBandSpec {
  readonly sessionId: string;
  readonly startSec: number;
  readonly endSec: number;
  /** Theme token KEY - resolved at draw time, never a stored hex. */
  readonly colorToken: string;
  readonly label: string;
}

interface ProjectedBand {
  readonly band: OryonSessionBandSpec;
  readonly x1: number;
  readonly x2: number;
}

class OryonSessionPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly bands: readonly ProjectedBand[],
    private readonly color: SessionColorResolver,
    private readonly monoFont: string,
    private readonly textMuted: string,
  ) {}

  draw(target: {
    useBitmapCoordinateSpace: (
      cb: (scope: {
        context: CanvasRenderingContext2D;
        horizontalPixelRatio: number;
        verticalPixelRatio: number;
      }) => void,
    ) => void;
  }): void {
    if (this.bands.length === 0) return;
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio: hp, verticalPixelRatio: vp } = scope;
      const height = context.canvas.height;
      const labelSize = Math.max(9, Math.round(10 * hp));
      for (const { band, x1, x2 } of this.bands) {
        const left = Math.min(x1, x2) * hp;
        const right = Math.max(x1, x2) * hp;
        const width = right - left;
        if (width < 1) continue;

        // Subtle background fill - translucent by construction (§5).
        const base = this.color(band.colorToken);
        if (base !== "") {
          context.globalAlpha = 0.07;
          context.fillStyle = base;
          context.fillRect(left, 0, width, height);
          context.globalAlpha = 0.22;
          // Session START marker - a hairline on the band's left edge.
          context.fillRect(left, 0, Math.max(1, hp), height);
        }

        // Compact label - only when the band holds one without crowding
        // (§5 "compact session labels", §15 readability). Text sits on the
        // band's own fill, never over neighbouring candles.
        if (width > labelSize * band.label.length * 0.75 + 12 * hp) {
          context.globalAlpha = 0.75;
          context.fillStyle = this.textMuted;
          context.font = `${labelSize}px ${this.monoFont}`;
          context.textBaseline = "top";
          context.fillText(band.label, left + 4 * hp, 4 * vp);
        }
      }
      context.globalAlpha = 1;
    });
  }
}

export interface SessionOverlayDeps {
  getBands(): readonly OryonSessionBandSpec[];
  getColor(tokenKey: string): string;
  getMonoFont(): string;
  getTextMuted(): string;
  conversions: OryonDrawingConversions;
}

class OryonSessionPaneView implements IPrimitivePaneView {
  constructor(private readonly deps: SessionOverlayDeps) {}

  /** BEHIND the series - the documented background layer (§5). */
  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    const bands = this.deps.getBands();
    const timeToX = this.deps.conversions.timeToX;
    const projected: ProjectedBand[] = [];
    for (const band of bands) {
      const x1 = timeToX(band.startSec);
      const x2 = timeToX(band.endSec);
      if (x1 === null || x2 === null) continue;
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;
      projected.push({ band, x1, x2 });
    }
    return new OryonSessionPaneRenderer(projected, this.deps.getColor, this.deps.getMonoFont(), this.deps.getTextMuted());
  }
}

/**
 * The attachable primitive. Bands are read through deps at paint time -
 * setBands() mutates the source array holder and requests a redraw, so a
 * visibility toggle NEVER recreates the chart (spec §5/§14).
 */
export class OryonSessionOverlayPrimitive implements ISeriesPrimitive<UTCTimestamp> {
  private bands: readonly OryonSessionBandSpec[] = [];
  private view: OryonSessionPaneView | null = null;
  private attachedParameter: SeriesAttachedParameter<UTCTimestamp> | null = null;

  constructor(private readonly deps: SessionOverlayDeps) {}

  setBands(bands: readonly OryonSessionBandSpec[]): void {
    this.bands = bands;
    this.requestRedraw();
  }

  updateAllViews(): void {
    // State is read live in the renderer - nothing to precompute.
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (this.view === null) this.view = new OryonSessionPaneView(this.deps);
    return [this.view];
  }

  attached(param: SeriesAttachedParameter<UTCTimestamp>): void {
    this.attachedParameter = param;
  }

  detached(): void {
    this.attachedParameter = null;
  }

  /** Redraw through the chart API when attached (band set changed). */
  requestRedraw(): void {
    this.attachedParameter?.chart.applyOptions({});
  }
}

/**
 * Engine-facing manager - owns the attach lifecycle so the engine file
 * stays a thin boundary (mirrors the position/alert overlay managers).
 */
export class OryonSessionOverlayManager {
  private primitive: OryonSessionOverlayPrimitive | null = null;
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null;
  private bands: readonly OryonSessionBandSpec[] = [];

  constructor(private readonly deps: Omit<SessionOverlayDeps, "getBands">) {}

  setBands(bands: readonly OryonSessionBandSpec[]): void {
    this.bands = bands;
    this.primitive?.setBands(bands);
  }

  get count(): number {
    return this.bands.length;
  }

  /** (Re)attaches to the given series - no-op when already attached there. */
  attach(series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">): void {
    if (this.series === series) return;
    this.detach();
    this.series = series;
    this.primitive = new OryonSessionOverlayPrimitive({
      ...this.deps,
      getBands: () => this.bands,
    });
    try {
      series.attachPrimitive(this.primitive as unknown as Parameters<ISeriesApi<"Candlestick">["attachPrimitive"]>[0]);
      this.primitive.setBands(this.bands);
    } catch {
      // Double-attach is an upstream programming error we survive (same
      // posture as the drawing primitive).
      this.primitive = null;
    }
  }

  detach(): void {
    const series = this.series;
    const primitive = this.primitive;
    this.series = null;
    this.primitive = null;
    if (series === null || primitive === null) return;
    try {
      series.detachPrimitive(primitive as unknown as Parameters<ISeriesApi<"Candlestick">["detachPrimitive"]>[0]);
    } catch {
      // Never attached / already gone - nothing to clean.
    }
  }

  destroy(): void {
    this.detach();
    this.bands = [];
  }
}

/** Theme token resolution with a small cache - cleared on re-apply. */
export function createSessionColorResolver(): {
  resolve: SessionColorResolver;
  invalidate: () => void;
} {
  const cache = new Map<string, string>();
  return {
    resolve: (tokenKey) => {
      const hit = cache.get(tokenKey);
      if (hit !== undefined) return hit;
      let value = "";
      try {
        value = getThemeToken(`--${tokenKey}`);
      } catch {
        value = "";
      }
      cache.set(tokenKey, value);
      return value;
    },
    invalidate: () => cache.clear(),
  };
}
