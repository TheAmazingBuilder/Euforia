"use client";

import type { ChartTheme } from "@/lib/utils/chart-theme";
import { formatPrice } from "@/lib/oryon/candles";
import type { RangeProjection } from "@/components/oryon/drawings/projection";
import {
  fibLevelPrice,
  fibSpanX,
  hitTestDrawing,
  rayFarEndpoint,
  rectBounds,
  selectionHandles,
  type DrawingHitPart,
  type PlotRect,
  type ScreenPoint,
} from "@/components/oryon/drawings/geometry";
import {
  FIBONACCI_LEVELS,
  resolveDrawingColor,
  type DrawingObject,
} from "@/components/oryon/drawings/types";

/**
 * Oryon drawing renderer — one overlay canvas above the price chart, below
 * the workspace chrome (PRD §8.4). Responsibilities:
 *
 *   - project every object's chart-domain anchors to screen space through
 *     the chart engine (conversions null → object skipped, never faked);
 *   - draw all kinds + draft preview + selection handles;
 *   - cache per-object screen geometry for the centralized hit-testing;
 *   - resize with devicePixelRatio, redraw coalesced via requestAnimationFrame
 *     (never a redraw per frame when nothing moves).
 *
 * The renderer knows NOTHING about pointer events — the controller owns
 * interaction and simply calls `requestRedraw()` when its state changes.
 */

/** Structural view of the chart engine the renderer needs (test-seamable). */
export interface CoordinateConverter {
  getPlotRect(): PlotRect;
  getRangeProjection(): RangeProjection | null;
  timeToX(timeMs: number): number | null;
  xToTime(x: number): number | null;
  timeToLogical(timeMs: number): number | null;
  logicalToTime(logical: number): number | null;
  logicalToX(logical: number): number | null;
  xToLogical(x: number): number | null;
  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
  setCursor(cursor: string): void;
}

/** What the renderer draws — supplied by the panel + controller. */
export interface DrawingScene {
  symbol: string;
  objects: readonly DrawingObject[];
  selectedId: string | null;
  hoverId: string | null;
  /** In-progress object (controller-owned, never in the store). */
  draft: DrawingObject | null;
  /** "create" renders dashed; "edit" renders solid (it IS the object). */
  draftMode: "create" | "edit" | null;
  /** Committed objects hidden while their transient copy previews. */
  suppress: readonly string[];
  /** Instrument price digits for on-chart price labels. */
  priceDigits: number;
}

export interface DrawingRendererDeps {
  getScene(): DrawingScene;
  getConverter(): CoordinateConverter | null;
  getTheme(): ChartTheme;
}

interface CachedGeometry {
  anchors: ScreenPoint[];
  text?: { width: number; height: number };
}

function dashPattern(dash: string): number[] {
  if (dash === "dashed") return [6, 4];
  if (dash === "dotted") return [2, 3];
  return [];
}

const HANDLE_HALF = 3.5;

export class DrawingRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  /** Screen geometry from the LAST render — hit-testing reads this. */
  private geometryCache = new Map<string, CachedGeometry>();
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: DrawingRendererDeps,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Oryon drawings: 2D canvas unavailable");
    this.ctx = context;
  }

  /** Resize the backing store to the CSS box × devicePixelRatio. */
  resize(): void {
    if (this.destroyed) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    const backingW = Math.max(1, Math.round(width * dpr));
    const backingH = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    this.requestRedraw();
  }

  /** Coalesced redraw — multiple requests in a frame collapse into one. */
  requestRedraw(): void {
    if (this.destroyed || this.rafId !== null) return;
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.geometryCache.clear();
    this.ctx = null;
  }

  /**
   * Hit-test against the LAST rendered geometry (newest object wins, PRD
   * §8.4). Returns null before the first render or on a miss — the caller
   * then lets the chart handle the pointer.
   */
  hitTest(pt: ScreenPoint): { id: string; target: DrawingHitPart } | null {
    const scene = this.deps.getScene();
    const converter = this.deps.getConverter();
    if (!converter) return null;
    const plot = converter.getPlotRect();
    // Newest first — objects array is ascending creation order.
    for (let i = scene.objects.length - 1; i >= 0; i -= 1) {
      const object = scene.objects[i]!;
      if (object.hidden) continue; // invisible objects are not hittable
      if (scene.suppress.includes(object.id)) continue; // previewed elsewhere
      const cached = this.geometryCache.get(object.id);
      if (!cached) continue;
      const hit = hitTestDrawing(object, cached.anchors, plot, pt, undefined, cached.text);
      if (hit) return { id: object.id, target: hit.target };
    }
    return null;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  render(): void {
    if (this.destroyed || !this.ctx) return;
    const ctx = this.ctx;
    const scene = this.deps.getScene();
    const converter = this.deps.getConverter();
    const theme = this.deps.getTheme();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.geometryCache.clear();
    if (!converter) return;

    const plot = converter.getPlotRect();
    if (plot.width <= 0 || plot.height <= 0) return;

    ctx.save();
    // Drawings NEVER bleed onto the price/time axes (PRD §6).
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();

    for (const object of scene.objects) {
      if (object.hidden) continue;
      if (scene.suppress.includes(object.id)) continue; // transient shown instead
      this.renderObject(object, scene, converter, theme, plot, false);
    }
    if (scene.draft) {
      // Draft preview: dashed while CREATING, solid while being dragged —
      // a moved object is the real thing, not a sketch.
      this.renderObject(scene.draft, scene, converter, theme, plot, scene.draftMode !== "edit");
    }
    ctx.restore();
  }

  /** Project the object's anchors; null on ANY unavailable conversion. */
  private projectAnchors(
    object: DrawingObject,
    converter: CoordinateConverter,
  ): ScreenPoint[] | null {
    const anchors: ScreenPoint[] = [];
    for (const anchor of object.anchors) {
      const x = converter.timeToX(anchor.time);
      const y = converter.priceToY(anchor.price);
      if (x === null || y === null) return null; // honest skip — no fakes
      anchors.push({ x, y });
    }
    return anchors;
  }

  private renderObject(
    object: DrawingObject,
    scene: DrawingScene,
    converter: CoordinateConverter,
    theme: ChartTheme,
    plot: PlotRect,
    isDraft: boolean,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const anchors = this.projectAnchors(object, converter);
    if (!anchors) return;

    const color = resolveDrawingColor(object.style.color, theme);
    const width = object.style.width;
    const dash = isDraft ? [4, 4] : dashPattern(object.style.dash);

    // Cache geometry for hit-testing (draft is controller-managed).
    if (!isDraft) {
      const cached: CachedGeometry = { anchors };
      if (object.kind === "text") {
        cached.text = this.measureText(object, theme);
      }
      this.geometryCache.set(object.id, cached);
    }

    const selected = scene.selectedId === object.id;
    const hovered = scene.hoverId === object.id;

    // Selection/hover emphasis — a soft halo UNDER the object stroke.
    if (selected || hovered) {
      ctx.save();
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = selected ? 0.35 : 0.18;
      ctx.lineWidth = width + 3;
      this.traceObjectPath(object, anchors, plot);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);

    switch (object.kind) {
      case "trendLine": {
        const [a, b] = anchors;
        ctx.beginPath();
        ctx.moveTo(a!.x, a!.y);
        ctx.lineTo(b!.x, b!.y);
        ctx.stroke();
        break;
      }
      case "ray": {
        const [a, b] = anchors;
        const far = rayFarEndpoint(a!, b!, plot);
        if (!far) break; // degenerate direction pointing out of the plot
        ctx.beginPath();
        ctx.moveTo(a!.x, a!.y);
        ctx.lineTo(far.x, far.y);
        ctx.stroke();
        break;
      }
      case "horizontalLine": {
        const [a] = anchors;
        ctx.beginPath();
        ctx.moveTo(plot.left, a!.y);
        ctx.lineTo(plot.left + plot.width, a!.y);
        ctx.stroke();
        // Price tag on the right edge (readable at any zoom).
        this.drawLabel(
          formatPrice(object.anchors[0]!.price, scene.priceDigits),
          plot.left + plot.width - 4,
          a!.y - 4,
          theme,
          { align: "right" },
        );
        break;
      }
      case "verticalLine": {
        const [a] = anchors;
        ctx.beginPath();
        ctx.moveTo(a!.x, plot.top);
        ctx.lineTo(a!.x, plot.top + plot.height);
        ctx.stroke();
        break;
      }
      case "rectangle": {
        const [a, b] = anchors;
        const bounds = rectBounds(a!, b!);
        if (object.style.fillOpacity > 0) {
          ctx.save();
          ctx.globalAlpha = object.style.fillOpacity;
          ctx.fillStyle = resolveDrawingColor(object.style.fill, theme);
          ctx.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
          ctx.restore();
        }
        ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
        break;
      }
      case "text": {
        const [a] = anchors;
        const measured = this.measureText(object, theme);
        ctx.font = `${object.style.fontSize}px ${theme.monoFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(object.text, a!.x + 6, a!.y - 4);
        void measured;
        break;
      }
      case "fibonacci": {
        const [a, b] = anchors;
        const span = fibSpanX(a!, b!);
        const fill = resolveDrawingColor(object.style.fill, theme);
        let previousY: number | null = null;
        for (const level of FIBONACCI_LEVELS) {
          const levelPrice = fibLevelPrice(
            object.anchors[0]!.price,
            object.anchors[1]!.price,
            level,
          );
          const y = converter.priceToY(levelPrice);
          if (y === null) continue; // unmappable level — skip explicitly
          if (previousY !== null && object.style.fillOpacity > 0) {
            ctx.save();
            ctx.globalAlpha = object.style.fillOpacity;
            ctx.fillStyle = fill;
            ctx.fillRect(span.from, Math.min(previousY, y), span.to - span.from, Math.abs(y - previousY));
            ctx.restore();
          }
          ctx.beginPath();
          ctx.moveTo(span.from, y);
          ctx.lineTo(span.to, y);
          ctx.stroke();
          this.drawLabel(
            `${level}  ${formatPrice(levelPrice, scene.priceDigits)}`,
            span.from + 4,
            y - 3,
            theme,
          );
          previousY = y;
        }
        // The two anchor legs keep the retracement attached to its swing.
        ctx.beginPath();
        ctx.moveTo(a!.x, a!.y);
        ctx.lineTo(b!.x, b!.y);
        ctx.stroke();
        break;
      }
    }

    ctx.restore();

    // Selection handles (screen-fixed size — zoom-independent affordance).
    if (selected && !isDraft) {
      for (const handle of selectionHandles(object, anchors)) {
        ctx.save();
        ctx.fillStyle = theme.surfaceRaised;
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(handle.x - HANDLE_HALF, handle.y - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /** Path tracing for the halo pass (stroke happens in renderObject). */
  private traceObjectPath(
    object: DrawingObject,
    anchors: ScreenPoint[],
    plot: PlotRect,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    switch (object.kind) {
      case "trendLine":
        ctx.beginPath();
        ctx.moveTo(anchors[0]!.x, anchors[0]!.y);
        ctx.lineTo(anchors[1]!.x, anchors[1]!.y);
        break;
      case "ray": {
        const far = rayFarEndpoint(anchors[0]!, anchors[1]!, plot);
        ctx.beginPath();
        ctx.moveTo(anchors[0]!.x, anchors[0]!.y);
        if (far) ctx.lineTo(far.x, far.y);
        break;
      }
      case "horizontalLine":
        ctx.beginPath();
        ctx.moveTo(plot.left, anchors[0]!.y);
        ctx.lineTo(plot.left + plot.width, anchors[0]!.y);
        break;
      case "verticalLine":
        ctx.beginPath();
        ctx.moveTo(anchors[0]!.x, plot.top);
        ctx.lineTo(anchors[0]!.x, plot.top + plot.height);
        break;
      case "rectangle": {
        const bounds = rectBounds(anchors[0]!, anchors[1]!);
        ctx.beginPath();
        ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height);
        break;
      }
      case "fibonacci": {
        const span = fibSpanX(anchors[0]!, anchors[1]!);
        ctx.beginPath();
        for (const level of FIBONACCI_LEVELS) {
          const y = anchors[0]!.y + (anchors[1]!.y - anchors[0]!.y) * level;
          ctx.moveTo(span.from, y);
          ctx.lineTo(span.to, y);
        }
        break;
      }
      case "text":
        // No stroke halo for text — the bbox highlight would obscure it.
        ctx.beginPath();
        break;
    }
  }

  private drawLabel(
    text: string,
    x: number,
    y: number,
    theme: ChartTheme,
    options: { align?: "left" | "right" } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.font = `10px ${theme.monoFont}`;
    ctx.textAlign = options.align ?? "left";
    ctx.textBaseline = "bottom";
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 6;
    const boxH = 14;
    const boxX = options.align === "right" ? x - boxW : x - 2;
    ctx.fillStyle = theme.surfaceRaised;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(boxX, y - boxH + 2, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.textPrimary;
    ctx.fillText(text, options.align === "right" ? x - 2 : x, y);
    ctx.restore();
  }

  private measureText(object: DrawingObject, theme: ChartTheme): { width: number; height: number } {
    const ctx = this.ctx;
    if (!ctx || object.kind !== "text") return { width: 0, height: 0 };
    ctx.font = `${object.style.fontSize}px ${theme.monoFont}`;
    const metrics = ctx.measureText(object.text);
    return { width: metrics.width, height: object.style.fontSize };
  }
}
