import type { OryonDrawing, OryonDrawingAnchor } from "@cosmoz/shared";

import {
  HANDLE_HIT_RADIUS,
  HIT_TOLERANCE,
  clamp,
  distanceToRay,
  distanceToSegment,
  fibLevelPrice,
  hitHandle,
  hitRect,
  hitTextBox,
  type ScreenPoint,
  type ScreenRect,
} from "./geometry";
import type { DraftOverlay } from "./draft";
import type { OryonDrawingStore } from "./store";
import type { OryonDrawingConversions } from "@/lib/charting/oryon-chart-engine";

/**
 * Oryon drawing interaction controller — the state machine (spec §4C, §8).
 *
 * Explicit states (no scattered booleans):
 *   idle → drafting (two-anchor tools) → idle
 *   idle → moving (object drag) → idle
 *   idle → anchoring (handle drag) → idle
 * One-click tools (hline/vline/text) create + hand off in a single step.
 *
 * Pointer contract:
 *  - listeners live on the chart container, in the CAPTURE phase — when the
 *    controller consumes an event (tool armed, or a hit) it stops the
 *    propagation so Lightweight Charts never starts a pan; when it does
 *    not (cursor tool, empty space) the event flows through untouched.
 *  - pointer capture is taken on consume and released on up/cancel.
 *  - draft geometry bypasses React and the store: it goes straight to the
 *    primitive via this.draft, so a drag repaints without one render.
 */

export type OryonDrawingTool =
  | "cursor"
  | "trend"
  | "hline"
  | "vline"
  | "ray"
  | "rect"
  | "text"
  | "measure"
  | "fib";

export type TwoAnchorTool = "trend" | "ray" | "rect" | "text" | "measure" | "fib";

const TWO_ANCHOR_TOOLS: ReadonlySet<string> = new Set(["trend", "ray", "rect", "measure", "fib"]);

type InteractionState =
  | { name: "idle" }
  | { name: "drafting"; tool: "trend" | "ray" | "rect" | "measure" | "fib"; a: OryonDrawingAnchor }
  | { name: "moving"; id: string; grabLogical: number; grabPrice: number; original: OryonDrawing }
  | { name: "anchoring"; id: string; index: 0 | 1; original: OryonDrawing };

export interface InteractionCallbacks {
  /** A drawing was completed — the layer disarms the tool (TV behavior). */
  onToolComplete(): void;
  /** Text annotation placed — the layer opens the editor at this anchor. */
  onTextEditRequest(id: string, screen: ScreenPoint): void;
  /** Repaint request (draft/preview updates). */
  requestRedraw(): void;
}

export interface InteractionDeps {
  /**
   * The event host — an ANCESTOR of the chart canvas (the price-chart
   * wrapper). Capture-phase listeners here run BEFORE Lightweight Charts'
   * own canvas handlers: consume() stops the descent (no pan), everything
   * else flows through untouched (pan, crosshair, scale interactions).
   * The host's top-left must coincide with the pane origin (it does: the
   * LWC container fills the wrapper, pane sits top-left).
   */
  container: HTMLElement;
  conversions: OryonDrawingConversions;
  store: OryonDrawingStore;
  /** Plot bounds provider (pane size) — from the primitive. */
  getPlotRect(): ScreenRect | null;
  /** Drawing factory (id, timestamps, default style) — layer-owned. */
  makeDrawing(tool: OryonDrawingTool, a: OryonDrawingAnchor, b: OryonDrawingAnchor | null): OryonDrawing;
  callbacks: InteractionCallbacks;
}

/** Layer UI (text editor, object list) — events inside never draw. */
function isUiTarget(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return target.closest("[data-oryon-ui]") !== null;
}

export class DrawingInteractionController {
  activeTool: OryonDrawingTool = "cursor";
  hoverId: string | null = null;
  draft: DraftOverlay | null = null;

  private state: InteractionState = { name: "idle" };
  private attached = false;
  private dragPointerId: number | null = null;

  constructor(private readonly deps: InteractionDeps) {}

  // ── public API ─────────────────────────────────────────────────────────────

  /** Arms a tool — cancels any in-progress operation cleanly (spec §8). */
  setTool(tool: OryonDrawingTool): void {
    if (this.activeTool === tool) return;
    this.cancelActive();
    this.activeTool = tool;
    this.updateCursor(null);
  }

  /** Escape semantics: cancel draft/drag, else deselect. */
  cancelActive(): void {
    this.dragPointerId = null;
    if (this.state.name === "drafting") {
      this.draft = null;
      this.state = { name: "idle" };
      this.deps.callbacks.requestRedraw();
      return;
    }
    if (this.state.name === "moving" || this.state.name === "anchoring") {
      this.deps.store.abortBatch();
      this.draft = null;
      this.state = { name: "idle" };
      this.deps.callbacks.requestRedraw();
      return;
    }
    if (this.deps.store.selectedId !== null) {
      this.deps.store.select(null);
    }
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const { container } = this.deps;
    container.addEventListener("pointerdown", this.onPointerDown, true);
    container.addEventListener("pointermove", this.onPointerMove, true);
    container.addEventListener("pointerup", this.onPointerUp, true);
    container.addEventListener("pointercancel", this.onPointerCancel, true);
    container.addEventListener("dblclick", this.onDoubleClick, true);
    container.addEventListener("pointerleave", this.onPointerLeave, true);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    const { container } = this.deps;
    container.removeEventListener("pointerdown", this.onPointerDown, true);
    container.removeEventListener("pointermove", this.onPointerMove, true);
    container.removeEventListener("pointerup", this.onPointerUp, true);
    container.removeEventListener("pointercancel", this.onPointerCancel, true);
    container.removeEventListener("dblclick", this.onDoubleClick, true);
    container.removeEventListener("pointerleave", this.onPointerLeave, true);
  }

  // ── pointer handlers (capture phase) ──────────────────────────────────────

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return; // Left button only — right/middle stay chart-native.
    if (isUiTarget(event)) return; // Layer UI (editor, list) owns its events.
    const point = this.eventPoint(event);
    if (point === null) return; // Outside the pane (over axes) — chart handles it.

    if (this.state.name === "drafting") {
      // Second pointer action completes the two-anchor drawing.
      this.completeDraft(point);
      this.consume(event);
      return;
    }

    if (this.activeTool === "cursor") {
      this.handleCursorDown(event, point);
      return;
    }

    if (this.activeTool === "hline") {
      const price = this.deps.conversions.yToPrice(point.y);
      if (price === null) return;
      const drawing = this.deps.makeDrawing("hline", { t: NaN, p: price }, null);
      this.deps.store.add(drawing);
      this.finishTool();
      this.consume(event);
      return;
    }

    if (this.activeTool === "vline") {
      const time = this.deps.conversions.xToSnappedTimeSec(point.x);
      if (time === null) return;
      const drawing = this.deps.makeDrawing("vline", { t: time, p: NaN }, null);
      this.deps.store.add(drawing);
      this.finishTool();
      this.consume(event);
      return;
    }

    if (this.activeTool === "text") {
      const anchor = this.domainAnchor(point);
      if (anchor === null) return;
      const drawing = this.deps.makeDrawing("text", anchor, null);
      this.deps.store.add(drawing);
      this.deps.callbacks.onTextEditRequest(drawing.id, point);
      this.finishTool();
      this.consume(event);
      return;
    }

    if (TWO_ANCHOR_TOOLS.has(this.activeTool)) {
      const anchor = this.domainAnchor(point);
      if (anchor === null) return;
      const tool = this.activeTool as "trend" | "ray" | "rect" | "measure" | "fib";
      this.state = { name: "drafting", tool, a: anchor };
      this.dragPointerId = event.pointerId;
      this.draft = { kind: "create", type: tool, a: anchor, b: anchor, style: this.deps.makeDrawing(tool, anchor, null).style };
      this.deps.callbacks.requestRedraw();
      this.consume(event);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (isUiTarget(event)) return;
    const point = this.eventPoint(event);
    if (point === null) return;

    if (this.state.name === "drafting") {
      const anchor = this.domainAnchor(point);
      if (anchor !== null && this.draft?.kind === "create") {
        this.draft = { ...this.draft, b: anchor };
        this.deps.callbacks.requestRedraw();
      }
      this.consume(event);
      return;
    }

    if (this.state.name === "moving") {
      this.applyMove(point);
      this.consume(event);
      return;
    }

    if (this.state.name === "anchoring") {
      this.applyAnchorEdit(point);
      this.consume(event);
      return;
    }

    // Idle: hover feedback + cursor affordances (no state changes).
    if (this.activeTool === "cursor") {
      const hit = this.hitTest(point);
      if (this.hoverId !== (hit?.id ?? null)) {
        this.hoverId = hit?.id ?? null;
        this.deps.callbacks.requestRedraw();
      }
    } else {
      if (this.hoverId !== null) {
        this.hoverId = null;
        this.deps.callbacks.requestRedraw();
      }
    }
    this.updateCursor(point);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (isUiTarget(event)) return;
    const point = this.eventPoint(event);

    if (this.state.name === "moving" || this.state.name === "anchoring") {
      this.commitBatch();
      this.state = { name: "idle" };
      this.draft = null;
      this.dragPointerId = null;
      this.deps.callbacks.requestRedraw();
      this.consume(event);
      return;
    }

    if (this.state.name === "drafting" && point !== null) {
      // Press-drag-release support: release far from the first anchor commits.
      const aScreen = this.projectAnchor(this.state.a);
      if (aScreen !== null && Math.hypot(point.x - aScreen.x, point.y - aScreen.y) >= 8) {
        this.completeDraft(point);
        this.dragPointerId = null;
        this.consume(event);
      }
      // Otherwise stay drafting (click-click mode) — capture continues via pointer id.
    }
  };

  private onPointerCancel = (): void => {
    if (this.state.name !== "idle") {
      this.cancelActive();
      this.dragPointerId = null;
    }
  };

  private onPointerLeave = (): void => {
    if (this.state.name === "idle" && this.hoverId !== null) {
      this.hoverId = null;
      this.deps.callbacks.requestRedraw();
    }
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.activeTool !== "cursor") return;
    if (isUiTarget(event)) return;
    const point = this.eventPoint(event as unknown as PointerEvent);
    if (point === null) return;
    const hit = this.hitTest(point);
    if (hit === null) return;
    const drawing = this.deps.store.drawings.find((d) => d.id === hit.id);
    if (drawing?.type === "text") {
      this.deps.callbacks.onTextEditRequest(drawing.id, point);
      this.consume(event as unknown as PointerEvent);
    }
  };

  // ── cursor tool logic ──────────────────────────────────────────────────────

  private handleCursorDown(event: PointerEvent, point: ScreenPoint): void {
    const selected = this.deps.store.getSelected();

    // 1. Anchor handles of the selected object (visible + unlocked).
    if (selected !== undefined && selected !== null && selected.visible && !selected.locked) {
      const handleIndex = this.hitSelectedHandle(selected, point);
      if (handleIndex !== null) {
        this.deps.store.beginBatch();
        this.state = { name: "anchoring", id: selected.id, index: handleIndex, original: selected };
        this.dragPointerId = event.pointerId;
        this.consume(event);
        return;
      }
    }

    // 2. Body hit → select (+ drag when unlocked).
    const hit = this.hitTest(point);
    if (hit !== null) {
      const drawing = this.deps.store.drawings.find((d) => d.id === hit.id);
      if (drawing !== undefined) {
        this.deps.store.select(drawing.id);
        if (!drawing.locked) {
          const grab = this.domainPoint(point);
          if (grab !== null) {
            this.deps.store.beginBatch();
            this.state = {
              name: "moving",
              id: drawing.id,
              grabLogical: grab.logical,
              grabPrice: grab.price,
              original: drawing,
            };
            this.dragPointerId = event.pointerId;
          }
        }
        this.consume(event);
        return;
      }
    }

    // 3. Empty space — deselect and let the chart pan (no consume).
    if (this.deps.store.selectedId !== null) {
      this.deps.store.select(null);
    }
  }

  // ── draft / move / anchor application ─────────────────────────────────────

  private completeDraft(point: ScreenPoint): void {
    if (this.state.name !== "drafting" || this.draft?.kind !== "create") return;
    const anchor = this.domainAnchor(point);
    if (anchor === null) {
      this.cancelActive();
      return;
    }
    const drawing = this.deps.makeDrawing(this.state.tool, this.state.a, anchor);
    this.draft = null;
    this.state = { name: "idle" };
    this.deps.store.add(drawing);
    this.finishTool();
    this.deps.callbacks.requestRedraw();
  }

  private applyMove(point: ScreenPoint): void {
    if (this.state.name !== "moving") return;
    const grab = this.domainPoint(point);
    if (grab === null) return;
    const deltaLogical = grab.logical - this.state.grabLogical;
    const deltaPrice = grab.price - this.state.grabPrice;
    const moved = this.translateDrawing(this.state.original, deltaLogical, deltaPrice);
    if (moved === null) return;
    this.draft = { kind: "edit", drawing: moved };
    this.deps.callbacks.requestRedraw();
  }

  private applyAnchorEdit(point: ScreenPoint): void {
    if (this.state.name !== "anchoring") return;
    const anchor = this.domainAnchor(point);
    if (anchor === null) return;
    const { original, index } = this.state;
    let edited: OryonDrawing | null = null;
    switch (original.type) {
      case "trend":
      case "ray":
      case "rect":
      case "measure":
      case "fib":
        edited = { ...original, [index === 0 ? "a" : "b"]: anchor };
        break;
      case "hline":
        edited = { ...original, price: anchor.p };
        break;
      case "vline":
        edited = { ...original, time: anchor.t };
        break;
      case "text":
        edited = { ...original, at: anchor };
        break;
    }
    if (edited === null) return;
    this.draft = { kind: "edit", drawing: edited };
    this.deps.callbacks.requestRedraw();
  }

  private commitBatch(): void {
    if (this.draft?.kind === "edit") {
      this.deps.store.replace(this.draft.drawing);
    }
    this.deps.store.endBatch();
  }

  /** Whole-object translation by (bars, price) deltas — null when unsafe. */
  private translateDrawing(
    drawing: OryonDrawing,
    deltaLogical: number,
    deltaPrice: number,
  ): OryonDrawing | null {
    const { conversions } = this.deps;
    const snapTime = (t: number): number | null => {
      const logical = conversions.timeSecToLogical(t);
      if (logical === null) return null;
      return conversions.logicalToSnappedTimeSec(logical + deltaLogical);
    };
    switch (drawing.type) {
      case "trend":
      case "ray":
      case "rect":
      case "measure":
      case "fib": {
        const ta = snapTime(drawing.a.t);
        const tb = snapTime(drawing.b.t);
        if (ta === null || tb === null) return null;
        return {
          ...drawing,
          a: { t: ta, p: drawing.a.p + deltaPrice },
          b: { t: tb, p: drawing.b.p + deltaPrice },
        };
      }
      case "hline":
        return { ...drawing, price: drawing.price + deltaPrice };
      case "vline": {
        const t = snapTime(drawing.time);
        return t === null ? null : { ...drawing, time: t };
      }
      case "text": {
        const t = snapTime(drawing.at.t);
        return t === null ? null : { ...drawing, at: { t, p: drawing.at.p + deltaPrice } };
      }
    }
  }

  // ── hit testing ────────────────────────────────────────────────────────────

  /** Hit-tests the SELECTED object's handles → 0 | 1 | null. */
  private hitSelectedHandle(selected: OryonDrawing, point: ScreenPoint): 0 | 1 | null {
    const plot = this.deps.getPlotRect();
    if (plot === null) return null;
    const points = this.handlePointsFor(selected, plot);
    if (points === null) return null;
    if (hitHandle(point.x, point.y, points[0]!)) return 0;
    if (hitHandle(point.x, point.y, points[1]!)) return 1;
    return null;
  }

  private handlePointsFor(drawing: OryonDrawing, plot: ScreenRect): [ScreenPoint, ScreenPoint] | null {
    switch (drawing.type) {
      case "trend":
      case "ray":
      case "rect":
      case "measure":
      case "fib": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        return a !== null && b !== null ? [a, b] : null;
      }
      case "hline": {
        const y = this.deps.conversions.priceToY(drawing.price);
        return y === null ? null : [{ x: (plot.left + plot.right) / 2, y }, { x: (plot.left + plot.right) / 2, y }];
      }
      case "vline": {
        const x = this.deps.conversions.timeToX(drawing.time);
        return x === null ? null : [{ x, y: (plot.top + plot.bottom) / 2 }, { x, y: (plot.top + plot.bottom) / 2 }];
      }
      case "text":
        return null; // Text moves via its body; no endpoint handles.
    }
  }

  /** Topmost visible drawing under the point (reverse creation order). */
  private hitTest(point: ScreenPoint): { id: string } | null {
    const plot = this.deps.getPlotRect();
    if (plot === null) return null;
    const tolerance = HIT_TOLERANCE;
    const drawings = this.deps.store.drawings;
    for (let i = drawings.length - 1; i >= 0; i -= 1) {
      const drawing = drawings[i]!;
      if (!drawing.visible) continue; // Hidden drawings never hit (spec §8).
      if (this.hitDrawing(drawing, point, plot, tolerance)) return { id: drawing.id };
    }
    return null;
  }

  private hitDrawing(drawing: OryonDrawing, point: ScreenPoint, plot: ScreenRect, tolerance: number): boolean {
    switch (drawing.type) {
      case "trend":
      case "ray":
      case "rect":
      case "measure":
      case "fib": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        if (a === null || b === null) return false;
        if (drawing.type === "trend") {
          return distanceToSegment(point.x, point.y, a.x, a.y, b.x, b.y) <= tolerance;
        }
        if (drawing.type === "ray") {
          return distanceToRay(point.x, point.y, a.x, a.y, b.x, b.y, plot) <= tolerance;
        }
        if (drawing.type === "rect" || drawing.type === "measure") {
          return hitRect(point.x, point.y, a, b, tolerance);
        }
        // Fibonacci — any level line within its x range.
        for (const level of this.fibLevelPrices(drawing)) {
          const y = this.deps.conversions.priceToY(level.price);
          if (y === null) continue;
          if (
            Math.abs(point.y - y) <= tolerance &&
            point.x >= Math.min(a.x, b.x) - tolerance &&
            point.x <= Math.max(a.x, b.x) + tolerance
          ) {
            return true;
          }
        }
        return false;
      }
      case "hline": {
        const y = this.deps.conversions.priceToY(drawing.price);
        return y !== null && Math.abs(point.y - y) <= tolerance;
      }
      case "vline": {
        const x = this.deps.conversions.timeToX(drawing.time);
        return x !== null && Math.abs(point.x - x) <= tolerance;
      }
      case "text": {
        const at = this.projectAnchor(drawing.at);
        if (at === null) return false;
        const extent = approximateTextBox(drawing.text, drawing.style.fontSize);
        return hitTextBox(point.x, point.y, at, extent.w, extent.h);
      }
    }
  }

  private fibLevelPrices(drawing: Extract<OryonDrawing, { type: "fib" }>): { level: number; price: number }[] {
    return FIB_HIT_LEVELS.map((level) => ({
      level,
      price: fibLevelPrice(drawing.a.p, drawing.b.p, level),
    }));
  }

  // ── coordinate + pointer plumbing ──────────────────────────────────────────

  /** Pointer event → pane-relative CSS px (null outside the plot area). */
  private eventPoint(event: { clientX: number; clientY: number }): ScreenPoint | null {
    const plot = this.deps.getPlotRect();
    if (plot === null) return null;
    const rect = this.deps.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < plot.left || x > plot.right || y < plot.top || y > plot.bottom) return null;
    return { x, y };
  }

  private domainPoint(point: ScreenPoint): { logical: number; price: number } | null {
    const { conversions } = this.deps;
    const logical = conversions.xToLogical(point.x);
    const price = conversions.yToPrice(point.y);
    if (logical === null || price === null) return null;
    return { logical, price };
  }

  /** Pointer → domain anchor: time SNAPPED to a loaded bar, price continuous. */
  private domainAnchor(point: ScreenPoint): OryonDrawingAnchor | null {
    const { conversions } = this.deps;
    const time = conversions.xToSnappedTimeSec(point.x);
    const price = conversions.yToPrice(point.y);
    if (time === null || price === null) return null;
    return { t: time, p: price };
  }

  private projectAnchor(anchor: OryonDrawingAnchor): ScreenPoint | null {
    const { conversions } = this.deps;
    const x = conversions.timeToX(anchor.t);
    const y = conversions.priceToY(anchor.p);
    if (x === null || y === null) return null;
    return { x, y };
  }

  /** One-click + two-anchor completion disarms the tool (TV behavior). */
  private finishTool(): void {
    this.activeTool = "cursor";
    this.updateCursor(null);
    this.deps.callbacks.onToolComplete();
  }

  private updateCursor(point: ScreenPoint | null): void {
    const { container } = this.deps;
    let cursor = "";
    if (this.state.name === "drafting" || (this.activeTool !== "cursor" && this.state.name === "idle")) {
      cursor = "crosshair";
    } else if (this.state.name === "moving" || this.state.name === "anchoring") {
      cursor = "grabbing";
    } else if (point !== null && this.activeTool === "cursor") {
      const selected = this.deps.store.getSelected();
      if (selected !== null && selected.visible && !selected.locked && this.hitSelectedHandle(selected, point) !== null) {
        cursor = "grab";
      } else {
        const hit = this.hitTest(point);
        if (hit !== null) {
          const drawing = this.deps.store.drawings.find((d) => d.id === hit.id);
          cursor = drawing !== undefined && drawing.locked ? "not-allowed" : "grab";
        }
      }
    }
    container.style.cursor = cursor;
  }

  /** Consumes an event: stops LWC pan + takes pointer capture while dragging. */
  private consume(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.dragPointerId !== null && this.state.name !== "idle") {
      const { container } = this.deps;
      try {
        container.setPointerCapture(this.dragPointerId);
      } catch {
        // Capture can fail on detached nodes — the up/cancel paths still run.
      }
    }
  }
}

/** Fibonacci ratios used for hit-testing mirror the renderer's band lines. */
const FIB_HIT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Generous text bounding box for hit-testing (no canvas measure here). */
export function approximateTextBox(text: string, fontSize: number): { w: number; h: number } {
  const lines = text === "" ? [] : text.split("\n").slice(0, 6);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    w: Math.max(longest * fontSize * 0.62, 12),
    h: Math.max(lines.length * fontSize * 1.3, 12),
  };
}

export { HANDLE_HIT_RADIUS, clamp };
