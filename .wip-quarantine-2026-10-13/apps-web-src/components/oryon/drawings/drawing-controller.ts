"use client";

import type { DrawingAnchor, DrawingObject, OryonTool } from "@/components/oryon/drawings/types";
import { isDrawingKind, requiredAnchors } from "@/components/oryon/drawings/types";
import {
  DEFAULT_FIBONACCI_STYLE,
  DEFAULT_LINE_STYLE,
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
} from "@/components/oryon/drawings/types";
import type { DrawingHitPart, ScreenPoint } from "@/components/oryon/drawings/geometry";
import type { CoordinateConverter } from "@/components/oryon/drawings/drawing-engine";
import {
  addDrawing,
  getActiveTool,
  getDrawingBook,
  getSelectedDrawingId,
  removeDrawing,
  replaceDrawing,
  selectDrawing,
  setActiveTool,
  undoDrawings,
  redoDrawings,
} from "@/components/oryon/drawings/drawing-store";

/**
 * Oryon drawing interaction controller — the explicit state machine
 * (PRD §8.2; cahier de charge Phase 2 §8). States are a closed union — no
 * scattered booleans:
 *
 *   idle ──(pick a drawing tool)──► toolActive ──(pointer)──► creating
 *   creating ──(complete)──► idle + object selected (+ tool → cursor)
 *   cursor tool ──(hit)──► selected ──(drag body)──► moving
 *                                        ──(drag anchor)──► editingAnchor
 *                                        ──(drag corner)──► resizingCorner
 *   text tool / dblclick on text ──► textEditing
 *
 * Invariants (cahier de charge §8):
 *   - switching tools or Escape cancels an incomplete drawing cleanly;
 *   - pointercancel restores the pre-drag state — no broken engine;
 *   - a drag is ONE committed history entry (the transient preview never
 *     touches the store; commit happens once on release);
 *   - locked objects cannot move/edit; hidden objects are not hittable;
 *   - incomplete objects are NEVER persisted as completed drawings.
 *
 * The controller is UI-free: `attachDrawingController` (bottom of this
 * file) owns the DOM capture-phase wiring, so the machine itself runs in
 * unit tests without a DOM.
 */

export type InteractionState =
  | { readonly name: "idle" }
  | { readonly name: "toolActive" }
  | {
      readonly name: "creating";
      readonly draft: DrawingObject;
      readonly lastDown: ScreenPoint;
      readonly awaitingSecondClick: boolean;
      /** True once the second click's DOWN phase has armed anchor #2. */
      readonly secondDown: boolean;
    }
  | { readonly name: "selected" }
  | {
      readonly name: "moving";
      readonly id: string;
      readonly start: ScreenPoint;
      readonly original: DrawingObject;
      readonly transient: DrawingObject;
    }
  | {
      readonly name: "editingAnchor";
      readonly id: string;
      readonly anchorIndex: number;
      readonly original: DrawingObject;
      readonly transient: DrawingObject;
    }
  | {
      readonly name: "resizingCorner";
      readonly id: string;
      readonly corner: 0 | 1 | 2 | 3;
      readonly original: DrawingObject;
      readonly transient: DrawingObject;
    }
  | {
      readonly name: "textEditing";
      /** null = creating a new annotation; string = editing existing text. */
      readonly editingId: string | null;
    };

export interface TextEditRequest {
  editingId: string | null;
  anchor: DrawingAnchor;
  initial: string;
}

export interface DrawingControllerDeps {
  symbol(): string;
  converter(): CoordinateConverter | null;
  /** Renderer notifications (redraw on every controller state change). */
  renderer(): { requestRedraw(): void; hitTest(pt: ScreenPoint): { id: string; target: DrawingHitPart } | null } | null;
  openTextEditor(request: TextEditRequest): void;
}

/** Pointer must travel this far before a selection becomes a move (px). */
const DRAG_THRESHOLD_PX = 4;

export class DrawingController {
  private state: InteractionState = { name: "idle" };
  private hoverId: string | null = null;
  private lastTool: OryonTool | null = null;
  private pendingTextObject: DrawingObject | null = null;
  private pendingDrag: {
    id: string;
    part: DrawingHitPart;
    downPt: ScreenPoint;
    original: DrawingObject;
  } | null = null;

  constructor(private readonly deps: DrawingControllerDeps) {}

  // ── Scene contributions (renderer reads these — no React involved) ──────

  getDraft(): DrawingObject | null {
    switch (this.state.name) {
      case "creating":
        return this.state.draft;
      case "moving":
      case "editingAnchor":
      case "resizingCorner":
        return this.state.transient;
      default:
        return null;
    }
  }

  /** "edit" renders the transient solid (it IS the object being moved). */
  getDraftMode(): "create" | "edit" | null {
    switch (this.state.name) {
      case "creating":
        return "create";
      case "moving":
      case "editingAnchor":
      case "resizingCorner":
        return "edit";
      default:
        return null;
    }
  }

  /** Objects hidden while their transient copy previews elsewhere. */
  getSuppressedIds(): readonly string[] {
    switch (this.state.name) {
      case "moving":
      case "editingAnchor":
      case "resizingCorner":
        return [this.state.id];
      default:
        return [];
    }
  }

  getHoverId(): string | null {
    return this.hoverId;
  }

  getState(): InteractionState {
    return this.state;
  }

  // ── Tool lifecycle ───────────────────────────────────────────────────────

  /**
   * Called on every drawing-store notification. Tool CHANGES drive
   * transitions; unrelated mutations (object edits, selection) only
   * trigger a redraw — an in-progress creation must survive them.
   */
  syncWithTool(): void {
    const tool = getActiveTool();
    if (tool !== this.lastTool) {
      this.lastTool = tool;
      if (this.state.name === "creating") this.cancelDraft();
      if (isDrawingKind(tool)) {
        this.state = { name: "toolActive" };
      } else if (tool === "crosshair") {
        selectDrawing(null);
        this.state = { name: "idle" };
      } else {
        // cursor — keep whatever selection exists
        if (this.state.name === "toolActive") this.state = { name: "idle" };
      }
    }
    this.notify();
  }

  /** Instrument/timeframe churn or panel unmount — drop all transients. */
  reset(): void {
    this.state = { name: "idle" };
    this.hoverId = null;
    this.pendingDrag = null;
    this.pendingTextObject = null;
    this.notify();
  }

  // ── Text editor callbacks (React input → controller) ────────────────────

  commitTextEdit(text: string): void {
    if (this.state.name !== "textEditing") return;
    const trimmed = text.trim();
    const symbol = this.deps.symbol();
    if (this.state.editingId === null) {
      const pending = this.pendingTextObject;
      this.pendingTextObject = null;
      // An empty annotation is meaningless — discarding it is the honest
      // cancel path (the input commits on blur to avoid losing edits).
      if (pending && trimmed.length > 0) {
        const created = { ...pending, text: trimmed } as DrawingObject;
        if (addDrawing(symbol, created)) {
          setActiveTool("cursor");
          selectDrawing(created.id);
        }
      }
    } else {
      const current = getBookObject(symbol, this.state.editingId);
      if (current && current.kind === "text" && trimmed.length > 0 && current.text !== trimmed) {
        replaceDrawing(symbol, { ...current, text: trimmed }, "text");
      }
    }
    this.state = { name: "idle" };
    this.notify();
  }

  cancelTextEdit(): void {
    if (this.state.name !== "textEditing") return;
    this.pendingTextObject = null;
    this.state = { name: "idle" };
    this.notify();
  }

  // ── Pointer events (screen points, wrapper coordinates) ─────────────────

  /** Returns true when the controller consumed the event (chart must not pan). */
  pointerDown(pt: ScreenPoint, isChartSurface: boolean): boolean {
    const tool = getActiveTool();

    if (this.state.name === "textEditing") return false; // the input owns focus

    if (isDrawingKind(tool)) {
      if (!isChartSurface) return false; // toolbar clicks never draw
      if (!this.insidePlot(pt)) return false; // axes never seed anchors
      const domain = this.toDomain(pt);
      if (!domain) return false; // unmappable — start nothing (honest null)

      if (this.state.name === "creating" && this.state.awaitingSecondClick) {
        // Click #2's down phase — arm the second anchor for a final drag.
        const draft = withAnchor(this.state.draft, 1, domain);
        this.state = {
          ...this.state,
          draft,
          lastDown: pt,
          awaitingSecondClick: false,
          secondDown: true,
        };
        this.notify();
        return true;
      }
      if (this.state.name === "creating") return true; // drag-create in flight
      if (this.state.name === "toolActive" || this.state.name === "idle") {
        this.state = {
          name: "creating",
          draft: newDraft(tool, domain),
          lastDown: pt,
          awaitingSecondClick: false,
          secondDown: false,
        };
        this.notify();
        return true;
      }
      return false;
    }

    // Cursor tool — selection & manipulation (crosshair never selects).
    if (tool !== "cursor" || !isChartSurface) return false;
    const hit = this.hitTest(pt);
    if (!hit) {
      selectDrawing(null); // clear deselection interaction (§7 Tool 1)
      this.state = { name: "idle" };
      this.notify();
      return false; // let the chart pan
    }
    const object = getBookObject(this.deps.symbol(), hit.id);
    if (!object) return false;
    selectDrawing(object.id);
    this.state = { name: "selected" };
    // Locked objects become selectable but never manipulable.
    if (!object.locked) {
      this.pendingDrag = { id: object.id, part: hit.target, downPt: pt, original: object };
    }
    this.notify();
    return true;
  }

  pointerMove(pt: ScreenPoint): void {
    // Hover affordances when nothing is in flight.
    if (
      this.state.name === "idle" ||
      this.state.name === "selected" ||
      this.state.name === "toolActive"
    ) {
      this.updateHover(pt);
    }

    switch (this.state.name) {
      case "creating": {
        const domain = this.toDomain(pt);
        if (!domain) return; // freeze the preview at the last valid position
        const index = requiredAnchors(this.state.draft.kind) === 2 ? 1 : 0;
        this.state = { ...this.state, draft: withAnchor(this.state.draft, index, domain) };
        this.notify();
        return;
      }
      case "selected": {
        if (!this.pendingDrag) return;
        if (this.distance(this.pendingDrag.downPt, pt) < DRAG_THRESHOLD_PX) return;
        this.beginDrag();
        return;
      }
      case "moving":
      case "editingAnchor":
      case "resizingCorner": {
        const transient = this.buildTransient(pt);
        if (!transient) return; // unmappable frame — freeze (honest null)
        this.state = { ...this.state, transient };
        this.notify();
        return;
      }
      default:
        return;
    }
  }

  pointerUp(pt: ScreenPoint): void {
    switch (this.state.name) {
      case "creating": {
        const { draft, lastDown, secondDown } = this.state;
        const needed = requiredAnchors(draft.kind);
        if (needed === 1) {
          // One-click tools finish on release (text opens its editor).
          this.completeOneAnchor(draft, pt);
          return;
        }
        if (secondDown) {
          this.completeDraft(draft); // click #2 finished the click-create
          return;
        }
        const dragged = this.distance(lastDown, pt) >= DRAG_THRESHOLD_PX;
        if (dragged) {
          this.completeDraft(draft); // drag-create
          return;
        }
        // Click #1 done, no drag — wait for click #2 (click-create mode).
        this.state = { ...this.state, awaitingSecondClick: true };
        this.notify();
        return;
      }
      case "moving":
      case "editingAnchor":
      case "resizingCorner": {
        // Rebuild at the release point so a single move+up commits too.
        const final = this.buildTransient(pt) ?? this.state.transient;
        if (final !== this.state.original) {
          replaceDrawing(
            this.deps.symbol(),
            final,
            this.state.name === "moving" ? "move" : "anchor",
          );
        }
        this.pendingDrag = null;
        this.state = { name: "selected" };
        this.setCursor("");
        this.notify();
        return;
      }
      case "selected": {
        this.pendingDrag = null; // plain click — selection already applied
        return;
      }
      default:
        return;
    }
  }

  /** Pointer cancellation must never leave the engine broken (§8). */
  pointerCancel(): void {
    if (
      this.state.name === "moving" ||
      this.state.name === "editingAnchor" ||
      this.state.name === "resizingCorner"
    ) {
      this.state = { name: "selected" }; // original was never mutated
      this.setCursor("");
    }
    this.pendingDrag = null;
    this.notify();
  }

  /** Double-click — open the text editor on a text annotation. */
  doubleClick(pt: ScreenPoint): boolean {
    const hit = this.hitTest(pt);
    if (!hit) return false;
    const object = getBookObject(this.deps.symbol(), hit.id);
    if (!object || object.kind !== "text" || object.locked) return false;
    this.state = { name: "textEditing", editingId: object.id };
    this.deps.openTextEditor({
      editingId: object.id,
      anchor: object.anchors[0]!,
      initial: object.text,
    });
    this.notify();
    return true;
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  /** Escape — fixed order: cancel op → un-arm tool → deselect (PRD). */
  escape(): boolean {
    switch (this.state.name) {
      case "textEditing":
        this.cancelTextEdit();
        return true;
      case "creating":
        this.cancelDraft();
        setActiveTool("cursor");
        this.state = { name: "idle" };
        this.notify();
        return true;
      case "moving":
      case "editingAnchor":
      case "resizingCorner":
        this.state = { name: "selected" };
        this.pendingDrag = null;
        this.setCursor("");
        this.notify();
        return true;
      case "toolActive":
        setActiveTool("cursor");
        this.state = { name: "idle" };
        this.notify();
        return true;
      default:
        // idle or selected — the store may hold a selection made from the
        // objects panel (the machine never saw it): deselect FIRST, so the
        // workspace's own Escape (panel close) only fires when there is
        // truly nothing drawing-related to undo.
        if (getSelectedDrawingId() !== null) {
          selectDrawing(null);
          this.state = { name: "idle" };
          this.notify();
          return true;
        }
        return false;
    }
  }

  /** Delete/Backspace on the selection (locked objects are exempt). */
  deleteSelection(): boolean {
    const id = getSelectedDrawingId();
    if (id === null) return false;
    const object = getBookObject(this.deps.symbol(), id);
    if (!object || object.locked) return false;
    removeDrawing(this.deps.symbol(), id);
    this.state = { name: "idle" };
    this.notify();
    return true;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private cancelDraft(): void {
    this.pendingTextObject = null;
  }

  private completeOneAnchor(draft: DrawingObject, pt: ScreenPoint): void {
    if (draft.kind === "text") {
      // Text opens its editor instead of committing an empty annotation;
      // blur-commits preserve unsaved edits (input contract, §7 Tool 7).
      this.pendingTextObject = draft;
      this.state = { name: "textEditing", editingId: null };
      this.deps.openTextEditor({
        editingId: null,
        anchor: draft.anchors[0]!,
        initial: "",
      });
      this.notify();
      return;
    }
    const symbol = this.deps.symbol();
    // Follow the release point — natural placement for click OR drag.
    const domain = this.toDomain(pt);
    const final = domain ? withAnchor(draft, 0, domain) : draft;
    if (addDrawing(symbol, final)) {
      setActiveTool("cursor");
      selectDrawing(final.id);
    }
    this.state = { name: "idle" };
    this.notify();
  }

  private completeDraft(draft: DrawingObject): void {
    const symbol = this.deps.symbol();
    if (addDrawing(symbol, draft)) {
      setActiveTool("cursor"); // PRD: creating → idle (objet sélectionné)
      selectDrawing(draft.id);
    }
    this.state = { name: "idle" };
    this.notify();
  }

  private beginDrag(): void {
    if (!this.pendingDrag) return;
    const { id, part, original, downPt } = this.pendingDrag;
    // `start` stays the ORIGINAL pointerdown point — the drag delta is
    // measured from where the user pressed, not from where the threshold
    // was crossed (pointerUp rebuilds the transient at the release point).
    const transient = original;
    if (part.part === "body") {
      this.state = { name: "moving", id, start: downPt, original, transient };
      this.setCursor("move");
    } else if (part.part === "anchor") {
      this.state = {
        name: "editingAnchor",
        id,
        anchorIndex: part.anchorIndex,
        original,
        transient,
      };
      this.setCursor("nwse-resize");
    } else {
      this.state = {
        name: "resizingCorner",
        id,
        corner: part.corner,
        original,
        transient,
      };
      this.setCursor("nwse-resize");
    }
    this.notify();
  }

  /** Build the dragged object's transient copy at the current pointer. */
  private buildTransient(pt: ScreenPoint): DrawingObject | null {
    const engine = this.deps.converter();
    if (!engine) return null;

    if (this.state.name === "moving") {
      const dLogical =
        (engine.xToLogical(pt.x) ?? 0) - (engine.xToLogical(this.state.start.x) ?? 0);
      const endPrice = engine.yToPrice(pt.y);
      const startPrice = engine.yToPrice(this.state.start.y);
      if (endPrice === null || startPrice === null) return null;
      const dPrice = endPrice - startPrice;
      const original = this.state.original;
      const anchors = original.anchors.map((anchor) => {
        const baseLogical = engine.timeToLogical(anchor.time);
        const time =
          baseLogical === null
            ? anchor.time
            : (engine.logicalToTime(baseLogical + dLogical) ?? anchor.time);
        return {
          time: original.kind === "horizontalLine" ? anchor.time : time,
          price: original.kind === "verticalLine" ? anchor.price : anchor.price + dPrice,
        };
      });
      return { ...original, anchors } as DrawingObject;
    }

    if (this.state.name === "editingAnchor") {
      const domain = this.toDomain(pt);
      if (!domain) return null;
      return {
        ...this.state.original,
        anchors: withAnchorList(this.state.original.anchors, this.state.anchorIndex, domain),
      } as DrawingObject;
    }

    if (this.state.name === "resizingCorner") {
      const domain = this.toDomain(pt);
      if (!domain) return null;
      const [a, b] = this.state.original.anchors;
      const corner = this.state.corner;
      // The dragged corner + the OPPOSITE corner redefine both anchors.
      const oppositeTime =
        corner === 0 || corner === 3 ? Math.max(a!.time, b!.time) : Math.min(a!.time, b!.time);
      const oppositePrice =
        corner === 0 || corner === 1 ? Math.min(a!.price, b!.price) : Math.max(a!.price, b!.price);
      return {
        ...this.state.original,
        anchors: [
          { time: domain.time, price: domain.price },
          { time: oppositeTime, price: oppositePrice },
        ],
      } as DrawingObject;
    }

    return null;
  }

  private updateHover(pt: ScreenPoint): void {
    const tool = getActiveTool();
    if (isDrawingKind(tool)) {
      this.hoverId = null;
      this.setCursor("crosshair");
      return;
    }
    const hit = this.hitTest(pt);
    this.hoverId = hit?.id ?? null;
    if (!hit) {
      this.setCursor("");
      return;
    }
    const object = getBookObject(this.deps.symbol(), hit.id);
    if (!object) return;
    if (object.locked) {
      this.setCursor("default"); // selectable, not manipulable
    } else if (hit.target.part === "anchor" || hit.target.part === "corner") {
      this.setCursor("nwse-resize");
    } else {
      this.setCursor("move");
    }
  }

  private hitTest(pt: ScreenPoint) {
    return this.deps.renderer()?.hitTest(pt) ?? null;
  }

  private toDomain(pt: ScreenPoint): DrawingAnchor | null {
    const engine = this.deps.converter();
    if (!engine) return null;
    const time = engine.xToTime(pt.x);
    const price = engine.yToPrice(pt.y);
    if (
      time === null ||
      price === null ||
      !Number.isFinite(time) ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return null;
    }
    return { time, price };
  }

  /** Pointer must sit in the PLOT area — axes never seed or grab drawings. */
  private insidePlot(pt: ScreenPoint): boolean {
    const plot = this.deps.converter()?.getPlotRect();
    if (!plot) return false;
    return (
      pt.x >= plot.left &&
      pt.x <= plot.left + plot.width &&
      pt.y >= plot.top &&
      pt.y <= plot.top + plot.height
    );
  }

  private distance(a: ScreenPoint, b: ScreenPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private setCursor(cursor: string): void {
    this.deps.converter()?.setCursor(cursor);
  }

  private notify(): void {
    this.deps.renderer()?.requestRedraw();
  }
}

// ── Pure helpers (unit-tested directly) ─────────────────────────────────────

function withAnchor(object: DrawingObject, index: number, anchor: DrawingAnchor): DrawingObject {
  return { ...object, anchors: withAnchorList(object.anchors, index, anchor) } as DrawingObject;
}

function withAnchorList(
  anchors: readonly DrawingAnchor[],
  index: number,
  anchor: DrawingAnchor,
): DrawingAnchor[] {
  const next = [...anchors];
  next[index] = anchor;
  return next;
}

/** Fresh in-progress object (controller-local; committed via addDrawing). */
function newDraft(kind: DrawingObject["kind"], anchor: DrawingAnchor): DrawingObject {
  const now = Date.now();
  const style =
    kind === "rectangle"
      ? DEFAULT_SHAPE_STYLE
      : kind === "fibonacci"
        ? DEFAULT_FIBONACCI_STYLE
        : kind === "text"
          ? DEFAULT_TEXT_STYLE
          : DEFAULT_LINE_STYLE;
  const base = {
    id: crypto.randomUUID(),
    kind,
    style,
    locked: false,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };
  if (requiredAnchors(kind) === 2) {
    return { ...base, anchors: [anchor, anchor] } as DrawingObject;
  }
  if (kind === "text") {
    return { ...base, anchors: [anchor], text: "" } as DrawingObject;
  }
  return { ...base, anchors: [anchor] } as DrawingObject;
}

function getBookObject(symbol: string, id: string): DrawingObject | null {
  return getDrawingBook(symbol).find((object) => object.id === id) ?? null;
}

// ── DOM binding (capture-phase interception — chart stays native) ───────────

export interface AttachOptions {
  /** Wrapper containing the chart container; pointer-coordinate origin. */
  wrapper: HTMLElement;
  controller: DrawingController;
  /** Only events targeting chart canvases may start drawing interactions. */
  isChartSurface(target: EventTarget | null): boolean;
}

/**
 * Wire the controller to the DOM. Pointer events are observed in the
 * CAPTURE phase on the wrapper: when the controller consumes a pointerdown
 * (hit on a drawing, or an armed drawing tool) the event is stopped BEFORE
 * Lightweight Charts sees it and pointer capture routes the drag to the
 * wrapper; otherwise the event flows through untouched — chart navigation
 * stays 100% native (cahier de charge Phase 2 §8: no panning conflicts).
 */
export function attachDrawingController(options: AttachOptions): () => void {
  const { wrapper, controller, isChartSurface } = options;

  let captured = false;

  function relativePt(event: PointerEvent | MouseEvent): ScreenPoint {
    const rect = wrapper.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  const onPointerDown = (event: PointerEvent) => {
    if (captured) return;
    const consumed = controller.pointerDown(relativePt(event), isChartSurface(event.target));
    if (consumed) {
      event.stopPropagation();
      event.preventDefault();
      try {
        wrapper.setPointerCapture(event.pointerId);
      } catch {
        // capture unavailable — move/up still bubble through the wrapper
      }
      captured = true;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    controller.pointerMove(relativePt(event));
  };

  const onPointerUp = (event: PointerEvent) => {
    controller.pointerUp(relativePt(event));
    if (captured) {
      try {
        wrapper.releasePointerCapture(event.pointerId);
      } catch {
        // pointer already released — nothing to undo
      }
      captured = false;
    }
  };

  const onPointerCancel = () => {
    controller.pointerCancel();
    captured = false;
  };

  const onDoubleClick = (event: MouseEvent) => {
    const consumed = controller.doubleClick(relativePt(event));
    if (consumed) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  wrapper.addEventListener("pointerdown", onPointerDown, true);
  wrapper.addEventListener("pointermove", onPointerMove, true);
  wrapper.addEventListener("pointerup", onPointerUp, true);
  wrapper.addEventListener("pointercancel", onPointerCancel, true);
  wrapper.addEventListener("dblclick", onDoubleClick, true);

  return () => {
    wrapper.removeEventListener("pointerdown", onPointerDown, true);
    wrapper.removeEventListener("pointermove", onPointerMove, true);
    wrapper.removeEventListener("pointerup", onPointerUp, true);
    wrapper.removeEventListener("pointercancel", onPointerCancel, true);
    wrapper.removeEventListener("dblclick", onDoubleClick, true);
  };
}

/**
 * Keyboard wiring — window-level CAPTURE with input guards (typing in the
 * annotation editor, the instrument palette or any Euforia field is never
 * hijacked; Phase 2 §12). Consumed events stop before the workspace's own
 * handlers. Shortcuts follow the PRD: Esc cancel → deselect; Suppr delete;
 * Ctrl/Cmd+Z / +Shift+Z (or Y) undo/redo; V cursor; Alt+T trend, Alt+H
 * horizontal, Alt+V vertical, Alt+Y ray, Alt+R rectangle, Alt+F fib,
 * Alt+X text.
 */
export function attachDrawingKeyboard(options: {
  controller: DrawingController;
  symbol(): string;
}): () => void {
  const { controller, symbol } = options;

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return; // never override text editing
    }

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (event.key === "Escape") {
      if (controller.escape()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && controller.deleteSelection()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (mod && key === "z" && !event.altKey) {
      if (event.shiftKey) redoDrawings(symbol());
      else undoDrawings(symbol());
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (mod && key === "y" && !event.altKey) {
      redoDrawings(symbol());
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!mod && !event.altKey && key === "v") {
      setActiveTool("cursor");
      return;
    }
    if (event.altKey && !mod) {
      const shortcuts: Record<string, OryonTool> = {
        t: "trendLine",
        h: "horizontalLine",
        v: "verticalLine",
        y: "ray",
        r: "rectangle",
        f: "fibonacci",
        x: "text",
      };
      const tool = shortcuts[key];
      if (tool) {
        event.preventDefault();
        setActiveTool(tool);
      }
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
