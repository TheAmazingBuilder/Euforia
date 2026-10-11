import type { OryonDrawing, OryonDrawingAnchor } from "@cosmoz/shared";
import { oryonPositionTargetPrice } from "@cosmoz/shared";

import {
  HANDLE_HIT_RADIUS,
  HIT_TOLERANCE,
  clamp,
  distanceToLineClipped,
  distanceToRay,
  distanceToSegment,
  fibExtLevelPrice,
  fibLevelPrice,
  hitEllipseEdge,
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
 *   idle → drafting3 (fibext: a, b, then c) → idle
 *   idle → moving (object drag) → idle
 *   idle → anchoring (handle drag) → idle
 * One-click tools (hline/vline/crossline/text) create + hand off in a
 * single step. Eraser: click a drawing → delete (hit-tested, undoable).
 * Cursor variants (arrow/cross/dot) BEHAVE as the select tool — they only
 * change the pointer affordance over the chart.
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
  | "cursor-cross"
  | "cursor-dot"
  | "eraser"
  | "trend"
  | "hline"
  | "vline"
  | "ray"
  | "extended"
  | "crossline"
  | "rect"
  | "ellipse"
  | "text"
  | "measure"
  | "pricerange"
  | "daterange"
  | "fib"
  | "fibext"
  | "longpos"
  | "shortpos";

export type TwoAnchorTool =
  | "trend"
  | "ray"
  | "extended"
  | "rect"
  | "ellipse"
  | "measure"
  | "pricerange"
  | "daterange"
  | "fib"
  | "longpos"
  | "shortpos";

export type ThreeAnchorTool = "fibext";

const TWO_ANCHOR_TOOLS: ReadonlySet<string> = new Set([
  "trend", "ray", "extended", "rect", "ellipse", "measure", "pricerange", "daterange", "fib", "longpos", "shortpos",
]);

/** Select-class tools — same interaction semantics as the arrow cursor. */
const SELECT_TOOLS: ReadonlySet<string> = new Set(["cursor", "cursor-cross", "cursor-dot"]);

/** Base pointer affordance per tool (applied whenever no richer state wins).
 *  SVG data-URIs are percent-encoded (%22 for quotes) — valid inside the
 *  single-quoted CSS url() AND the double-quoted TS string. */
const BASE_CURSOR: Partial<Record<OryonDrawingTool, string>> = {
  cursor: "default",
  "cursor-cross": "crosshair",
  "cursor-dot": [
    "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22",
    'width=%2212%22 height=%2212%22><circle cx=%226%22 cy=%226%22 r=%223.5%22',
    'fill=%22%23ffffff%22 stroke=%22%23000000%22 stroke-width=%221.5%22/></svg>\') 6 6, auto',
  ].join(" "),
  eraser: [
    "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22",
    'width=%2218%22 height=%2218%22><circle cx=%229%22 cy=%229%22 r=%227%22',
    'fill=%22none%22 stroke=%22%23888888%22 stroke-width=%221.5%22',
    'stroke-dasharray=%223 2%22/><line x1=%225%22 y1=%2213%22 x2=%2213%22 y2=%225%22',
    'stroke=%22%23888888%22 stroke-width=%221.5%22/></svg>\') 9 9, cell',
  ].join(" "),
};

type InteractionState =
  | { name: "idle" }
  | { name: "drafting"; tool: TwoAnchorTool; a: OryonDrawingAnchor }
  | { name: "drafting3"; tool: ThreeAnchorTool; a: OryonDrawingAnchor; b: OryonDrawingAnchor | null }
  | { name: "moving"; id: string; grabLogical: number; grabPrice: number; original: OryonDrawing }
  | { name: "anchoring"; id: string; index: number; original: OryonDrawing };

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
  /** Drawing factory (id, timestamps, default style) — layer-owned. The
   *  third anchor is the fibext projection point (null for the others). */
  makeDrawing(
    tool: OryonDrawingTool,
    a: OryonDrawingAnchor,
    b: OryonDrawingAnchor | null,
    c?: OryonDrawingAnchor | null,
  ): OryonDrawing;
  callbacks: InteractionCallbacks;
  /**
   * Phase 7 active-chart gate — NEW interactions (creation, selection,
   * hover) only start while this returns true (the panel is the active
   * one). The FIRST click on an inactive panel activates it without
   * drawing (predictable, spec §7 — a tool armed for one chart never
   * accidentally modifies another). In-progress gestures (drafting,
   * moving, anchoring) always complete — the user is mid-motion on this
   * chart. Optional: absent = always interactive (single-chart default).
   */
  canInteract?: () => boolean;
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
    if (this.state.name === "drafting" || this.state.name === "drafting3") {
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

    // Active-chart gate (Phase 7 §7): in-progress gestures ALWAYS complete;
    // new interactions only start on the active panel. The activation click
    // itself is not swallowed — the event flows through (pan) and the panel
    // wrapper's own handler activates the panel; the NEXT click interacts.
    if (this.state.name === "idle" && this.deps.canInteract !== undefined && !this.deps.canInteract()) {
      return;
    }

    if (this.state.name === "drafting3") {
      // Second/third pointer action advance the fibext gesture.
      this.advanceDraft3(point);
      this.consume(event);
      return;
    }

    if (this.state.name === "drafting") {
      // Second pointer action completes the two-anchor drawing.
      this.completeDraft(point);
      this.consume(event);
      return;
    }

    if (SELECT_TOOLS.has(this.activeTool)) {
      this.handleCursorDown(event, point);
      return;
    }

    if (this.activeTool === "eraser") {
      const hit = this.hitTest(point);
      if (hit !== null) {
        const target = this.deps.store.drawings.find((d) => d.id === hit.id);
        if (target !== undefined && !target.locked) {
          this.deps.store.remove(target.id);
          this.consume(event);
        }
        // Locked drawings stay put (the store would refuse anyway) — the
        // click falls through to the chart so the pan gesture stays live.
      }
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

    if (this.activeTool === "crossline") {
      const anchor = this.domainAnchor(point);
      if (anchor === null) return;
      const drawing = this.deps.makeDrawing("crossline", anchor, null);
      this.deps.store.add(drawing);
      this.finishTool();
      this.consume(event);
      return;
    }

    if (this.activeTool === "fibext") {
      const anchor = this.domainAnchor(point);
      if (anchor === null) return;
      const style = this.deps.makeDrawing("fibext", anchor, null).style;
      this.state = { name: "drafting3", tool: "fibext", a: anchor, b: null };
      this.dragPointerId = event.pointerId;
      this.draft = { kind: "create3", type: "fibext", a: anchor, b: null, c: null, style };
      this.deps.callbacks.requestRedraw();
      this.consume(event);
      return;
    }

    if (TWO_ANCHOR_TOOLS.has(this.activeTool)) {
      const anchor = this.domainAnchor(point);
      if (anchor === null) return;
      const tool = this.activeTool as TwoAnchorTool;
      this.state = { name: "drafting", tool, a: anchor };
      this.dragPointerId = event.pointerId;
      this.draft = { kind: "create", type: tool, a: anchor, b: anchor, style: this.deps.makeDrawing(tool, anchor, null).style };
      this.deps.callbacks.requestRedraw();
      this.consume(event);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (isUiTarget(event)) return;
    // Hover feedback follows the same gate: an inactive panel never hints
    // editability its next click will not deliver (it activates instead).
    if (this.state.name === "idle" && this.deps.canInteract !== undefined && !this.deps.canInteract()) {
      if (this.hoverId !== null) {
        this.hoverId = null;
        this.deps.callbacks.requestRedraw();
      }
      return;
    }
    const point = this.eventPoint(event);
    if (point === null) return;

    if (this.state.name === "drafting3") {
      const anchor = this.domainAnchor(point);
      if (anchor !== null && this.draft?.kind === "create3") {
        // Stage 1: the pointer previews the B end of the A→B leg; stage 2:
        // the fixed B + the pointer previews C (the extension origin).
        this.draft = this.state.b === null
          ? { ...this.draft, b: anchor }
          : { ...this.draft, c: anchor };
        this.deps.callbacks.requestRedraw();
      }
      this.consume(event);
      return;
    }

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
    if (SELECT_TOOLS.has(this.activeTool)) {
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

    if (this.state.name === "drafting3" && point !== null) {
      // Press-drag-release per stage: release far from the previous anchor
      // advances the gesture (same 8px threshold as the two-anchor tools).
      const ref = this.state.b === null ? this.state.a : this.state.b;
      const refScreen = this.projectAnchor(ref);
      if (refScreen !== null && Math.hypot(point.x - refScreen.x, point.y - refScreen.y) >= 8) {
        this.advanceDraft3(point);
        this.consume(event);
      }
      // Otherwise stay drafting3 (click-click-click mode).
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
    if (!SELECT_TOOLS.has(this.activeTool)) return;
    if (isUiTarget(event)) return;
    if (this.state.name === "idle" && this.deps.canInteract !== undefined && !this.deps.canInteract()) {
      return;
    }
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

  /**
   * fibext gesture — one stage per call:
   *   b not placed → the click FIXES b (A→B leg locked, C preview starts)
   *   b placed     → the click is C — the extension commits.
   */
  private advanceDraft3(point: ScreenPoint): void {
    if (this.state.name !== "drafting3" || this.draft?.kind !== "create3") return;
    const anchor = this.domainAnchor(point);
    if (anchor === null) {
      this.cancelActive();
      return;
    }
    if (this.state.b === null) {
      this.state = { ...this.state, b: anchor };
      this.draft = { ...this.draft, b: anchor, c: anchor };
      this.deps.callbacks.requestRedraw();
      return;
    }
    const drawing = this.deps.makeDrawing("fibext", this.state.a, this.state.b, anchor);
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
      case "extended":
      case "ellipse":
      case "pricerange":
      case "daterange":
      case "longpos":
      case "shortpos":
        edited = { ...original, [index === 0 ? "a" : "b"]: anchor };
        break;
      case "fibext":
        edited = {
          ...original,
          [index === 0 ? "a" : index === 1 ? "b" : "c"]: anchor,
        };
        break;
      case "hline":
        edited = { ...original, price: anchor.p };
        break;
      case "vline":
        edited = { ...original, time: anchor.t };
        break;
      case "crossline":
        edited = { ...original, at: anchor };
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
      case "fib":
      case "extended":
      case "ellipse":
      case "pricerange":
      case "daterange":
      case "longpos":
      case "shortpos": {
        const ta = snapTime(drawing.a.t);
        const tb = snapTime(drawing.b.t);
        if (ta === null || tb === null) return null;
        return {
          ...drawing,
          a: { t: ta, p: drawing.a.p + deltaPrice },
          b: { t: tb, p: drawing.b.p + deltaPrice },
        };
      }
      case "fibext": {
        const ta = snapTime(drawing.a.t);
        const tb = snapTime(drawing.b.t);
        const tc = snapTime(drawing.c.t);
        if (ta === null || tb === null || tc === null) return null;
        return {
          ...drawing,
          a: { t: ta, p: drawing.a.p + deltaPrice },
          b: { t: tb, p: drawing.b.p + deltaPrice },
          c: { t: tc, p: drawing.c.p + deltaPrice },
        };
      }
      case "hline":
        return { ...drawing, price: drawing.price + deltaPrice };
      case "vline": {
        const t = snapTime(drawing.time);
        return t === null ? null : { ...drawing, time: t };
      }
      case "crossline": {
        const t = snapTime(drawing.at.t);
        return t === null ? null : { ...drawing, at: { t, p: drawing.at.p + deltaPrice } };
      }
      case "text": {
        const t = snapTime(drawing.at.t);
        return t === null ? null : { ...drawing, at: { t, p: drawing.at.p + deltaPrice } };
      }
    }
  }

  // ── hit testing ────────────────────────────────────────────────────────────

  /** Hit-tests the SELECTED object's handles → handle index | null. */
  private hitSelectedHandle(selected: OryonDrawing, point: ScreenPoint): number | null {
    const plot = this.deps.getPlotRect();
    if (plot === null) return null;
    const points = this.handlePointsFor(selected, plot);
    if (points === null) return null;
    for (let i = 0; i < points.length; i += 1) {
      if (hitHandle(point.x, point.y, points[i]!)) return i;
    }
    return null;
  }

  /** Anchor handles in SELECTION order (a, b, then c for fibext). */
  private handlePointsFor(drawing: OryonDrawing, plot: ScreenRect): ScreenPoint[] | null {
    switch (drawing.type) {
      case "trend":
      case "ray":
      case "rect":
      case "measure":
      case "fib":
      case "extended":
      case "ellipse":
      case "pricerange":
      case "daterange":
      case "longpos":
      case "shortpos": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        return a !== null && b !== null ? [a, b] : null;
      }
      case "fibext": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        const c = this.projectAnchor(drawing.c);
        return a !== null && b !== null && c !== null ? [a, b, c] : null;
      }
      case "hline": {
        const y = this.deps.conversions.priceToY(drawing.price);
        const p: ScreenPoint = { x: (plot.left + plot.right) / 2, y: y ?? 0 };
        return y === null ? null : [p, p];
      }
      case "vline": {
        const x = this.deps.conversions.timeToX(drawing.time);
        const p: ScreenPoint = { x: x ?? 0, y: (plot.top + plot.bottom) / 2 };
        return x === null ? null : [p, p];
      }
      case "crossline": {
        const at = this.projectAnchor(drawing.at);
        return at === null ? null : [at, at];
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
      case "extended": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        if (a === null || b === null) return false;
        return distanceToLineClipped(point.x, point.y, a.x, a.y, b.x, b.y, plot) <= tolerance;
      }
      case "ellipse": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        if (a === null || b === null) return false;
        return hitEllipseEdge(point.x, point.y, a, b, tolerance);
      }
      case "pricerange": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        if (a === null || b === null) return false;
        // Vertical ruler drawn AT a.x between the two prices.
        return (
          Math.abs(point.x - a.x) <= tolerance &&
          point.y >= Math.min(a.y, b.y) - tolerance &&
          point.y <= Math.max(a.y, b.y) + tolerance
        );
      }
      case "daterange": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        if (a === null || b === null) return false;
        // Horizontal ruler drawn AT a.y between the two times.
        return (
          Math.abs(point.y - a.y) <= tolerance &&
          point.x >= Math.min(a.x, b.x) - tolerance &&
          point.x <= Math.max(a.x, b.x) + tolerance
        );
      }
      case "longpos":
      case "shortpos": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        if (a === null || b === null) return false;
        // Risk zone (entry↔stop) OR reward zone (entry↔derived target).
        const targetY = this.deps.conversions.priceToY(
          oryonPositionTargetPrice(drawing.a.p, drawing.b.p),
        );
        if (targetY !== null && hitRect(point.x, point.y, a, { x: b.x, y: targetY }, tolerance)) {
          return true;
        }
        return hitRect(point.x, point.y, a, b, tolerance);
      }
      case "fibext": {
        const a = this.projectAnchor(drawing.a);
        const b = this.projectAnchor(drawing.b);
        const c = this.projectAnchor(drawing.c);
        if (a === null || b === null || c === null) return false;
        // The two swing legs are draggable geometry.
        if (distanceToSegment(point.x, point.y, a.x, a.y, b.x, b.y) <= tolerance) return true;
        if (distanceToSegment(point.x, point.y, b.x, b.y, c.x, c.y) <= tolerance) return true;
        // Extension levels — from the LAST placed anchor rightward.
        const xStart = Math.max(a.x, b.x, c.x);
        for (const level of FIB_EXT_HIT_LEVELS) {
          const price = fibExtLevelPrice(drawing.a.p, drawing.b.p, drawing.c.p, level);
          const y = this.deps.conversions.priceToY(price);
          if (y === null) continue;
          if (
            Math.abs(point.y - y) <= tolerance &&
            point.x >= xStart - tolerance &&
            point.x <= plot.right + tolerance
          ) {
            return true;
          }
        }
        return false;
      }
      case "crossline": {
        const at = this.projectAnchor(drawing.at);
        if (at === null) return false;
        return Math.abs(point.y - at.y) <= tolerance || Math.abs(point.x - at.x) <= tolerance;
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
    let cursor = BASE_CURSOR[this.activeTool] ?? "";
    if (this.state.name === "drafting" || this.state.name === "drafting3") {
      cursor = "crosshair";
    } else if (this.state.name === "moving" || this.state.name === "anchoring") {
      cursor = "grabbing";
    } else if (point !== null && SELECT_TOOLS.has(this.activeTool)) {
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

/** Extension ratios used for hit-testing mirror the renderer's level set. */
const FIB_EXT_HIT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618] as const;

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
