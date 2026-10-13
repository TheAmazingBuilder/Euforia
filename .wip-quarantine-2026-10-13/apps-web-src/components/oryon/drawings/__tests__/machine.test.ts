import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DrawingController,
  type TextEditRequest,
} from "@/components/oryon/drawings/drawing-controller";
import type { CoordinateConverter } from "@/components/oryon/drawings/drawing-engine";
import type { DrawingHitPart } from "@/components/oryon/drawings/geometry";
import {
  __resetOryonDrawingStoreForTests,
  addDrawing,
  clearDrawings,
  getActiveTool,
  getDrawingBook,
  getSelectedDrawingId,
  redoDrawings,
  selectDrawing,
  setActiveTool,
  toggleDrawingHidden,
  toggleDrawingLocked,
  undoDrawings,
  useOryonDrawings,
} from "@/components/oryon/drawings/drawing-store";
import {
  DEFAULT_LINE_STYLE,
  DEFAULT_SHAPE_STYLE,
  type DrawingObject,
} from "@/components/oryon/drawings/types";

/**
 * Interaction state-machine tests (Phase 2 §15) — the REAL controller and
 * REAL store run against a deterministic fake converter (10 bars, 1/min,
 * x = logical × 80, price = 400 − y) and a configurable hit-test fake.
 * Keyboard DOM wiring is browser-probe territory (node has no window).
 */

const MIN = 60_000;
const SYMBOL = "XAUUSD";

/** Deterministic time/price mapping mirroring the engine's projections. */
const fakeConverter: CoordinateConverter = {
  getPlotRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
  getRangeProjection: () => ({ from: 0, to: 10, width: 800 }),
  timeToLogical: (t) => (t - 1000) / MIN,
  logicalToTime: (l) => 1000 + l * MIN,
  logicalToX: (l) => l * 80,
  xToLogical: (x) => x / 80,
  timeToX: (t) => ((t - 1000) / MIN) * 80,
  xToTime: (x) => 1000 + (x / 80) * MIN,
  priceToY: (p) => 400 - p,
  yToPrice: (y) => 400 - y,
  setCursor: vi.fn(),
};

function domainOf(x: number, y: number) {
  return { time: fakeConverter.xToTime(x)!, price: fakeConverter.yToPrice(y)! };
}

function makeController(hits: { id: string; target: DrawingHitPart }[] = []) {
  const openTextEditor = vi.fn((request: TextEditRequest) => request);
  const requestRedraw = vi.fn();
  const controller = new DrawingController({
    symbol: () => SYMBOL,
    converter: () => fakeConverter,
    renderer: () => ({ requestRedraw, hitTest: () => hits[0] ?? null }),
    openTextEditor,
  });
  return { controller, openTextEditor, requestRedraw };
}

function line(overrides: Partial<DrawingObject> = {}): DrawingObject {
  return {
    id: "obj-1",
    kind: "trendLine",
    anchors: [
      { time: 1000 + 2 * MIN, price: 200 },
      { time: 1000 + 5 * MIN, price: 300 },
    ],
    style: { ...DEFAULT_LINE_STYLE },
    locked: false,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as unknown as DrawingObject;
}

beforeEach(() => {
  __resetOryonDrawingStoreForTests();
});

describe("creation (tool armed → click/drag → completed object)", () => {
  it("completes a trend line via drag-create and returns to cursor", () => {
    const { controller } = makeController();
    setActiveTool("trendLine");
    controller.syncWithTool();

    expect(controller.pointerDown({ x: 80, y: 200 }, true)).toBe(true);
    controller.pointerMove({ x: 160, y: 100 });
    controller.pointerUp({ x: 160, y: 100 });

    const book = getDrawingBook(SYMBOL);
    expect(book).toHaveLength(1);
    expect(book[0]!.kind).toBe("trendLine");
    expect(book[0]!.anchors[0]).toEqual(domainOf(80, 200));
    expect(book[0]!.anchors[1]).toEqual(domainOf(160, 100));
    expect(getActiveTool()).toBe("cursor"); // PRD: creating → idle + selected
    expect(getSelectedDrawingId()).toBe(book[0]!.id);
  });

  it("supports click-click creation for two-anchor tools", () => {
    const { controller } = makeController();
    setActiveTool("ray");
    controller.syncWithTool();

    controller.pointerDown({ x: 80, y: 300 }, true);
    controller.pointerUp({ x: 80, y: 300 }); // click #1 — no drag yet
    expect(getDrawingBook(SYMBOL)).toHaveLength(0); // not committed mid-way

    controller.pointerDown({ x: 240, y: 100 }, true);
    controller.pointerUp({ x: 240, y: 100 }); // click #2 — completes

    const book = getDrawingBook(SYMBOL);
    expect(book).toHaveLength(1);
    expect(book[0]!.anchors[0]).toEqual(domainOf(80, 300));
    expect(book[0]!.anchors[1]).toEqual(domainOf(240, 100));
  });

  it("creates a horizontal line from one click at the release price", () => {
    const { controller } = makeController();
    setActiveTool("horizontalLine");
    controller.syncWithTool();

    controller.pointerDown({ x: 400, y: 150 }, true);
    controller.pointerUp({ x: 400, y: 150 });

    const book = getDrawingBook(SYMBOL);
    expect(book).toHaveLength(1);
    expect(book[0]!.kind).toBe("horizontalLine");
    expect(book[0]!.anchors[0]!.price).toBe(250); // 400 − 150
  });

  it("refuses to seed anchors outside the plot (axes)", () => {
    const { controller } = makeController();
    setActiveTool("trendLine");
    controller.syncWithTool();
    // x=850 is beyond the 800-px plot (price axis area).
    expect(controller.pointerDown({ x: 850, y: 200 }, true)).toBe(false);
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
  });

  it("ignores toolbar-originated pointer events (isChartSurface=false)", () => {
    const { controller } = makeController();
    setActiveTool("trendLine");
    controller.syncWithTool();
    expect(controller.pointerDown({ x: 100, y: 100 }, false)).toBe(false);
    controller.pointerUp({ x: 100, y: 100 });
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
  });
});

describe("cancellation rules", () => {
  it("Escape cancels an in-progress drawing and un-arms the tool", () => {
    const { controller } = makeController();
    setActiveTool("trendLine");
    controller.syncWithTool();
    controller.pointerDown({ x: 80, y: 200 }, true);
    controller.pointerMove({ x: 200, y: 100 });
    expect(controller.escape()).toBe(true);

    expect(getDrawingBook(SYMBOL)).toHaveLength(0); // draft never persisted
    expect(getActiveTool()).toBe("cursor");
  });

  it("switching tools mid-creation cancels cleanly (§8)", () => {
    const { controller } = makeController();
    setActiveTool("trendLine");
    controller.syncWithTool();
    controller.pointerDown({ x: 80, y: 200 }, true);
    controller.pointerMove({ x: 160, y: 100 });

    setActiveTool("rectangle");
    controller.syncWithTool();
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
    controller.pointerDown({ x: 100, y: 100 }, true);
    controller.pointerUp({ x: 200, y: 200 });
    expect(getDrawingBook(SYMBOL)[0]!.kind).toBe("rectangle");
  });

  it("pointercancel during a move restores the original (no broken state)", () => {
    addDrawing(SYMBOL, line());
    const hit = { id: "obj-1", target: { part: "body" } as DrawingHitPart };
    const { controller } = makeController([hit]);
    controller.pointerDown({ x: 100, y: 100 }, true);
    controller.pointerMove({ x: 180, y: 60 });
    controller.pointerCancel();

    expect(getDrawingBook(SYMBOL)[0]!.anchors).toEqual(line().anchors);
    // The machine lands on `selected` — the object stays selected, the
    // transient preview is dropped, and the store was never touched.
    expect(controller.getState().name).toBe("selected");
  });
});

describe("text annotations", () => {
  it("opens the editor, commits on demand, then selects the object", () => {
    const { controller, openTextEditor } = makeController();
    setActiveTool("text");
    controller.syncWithTool();

    controller.pointerDown({ x: 100, y: 100 }, true);
    controller.pointerUp({ x: 100, y: 100 });

    expect(openTextEditor).toHaveBeenCalledTimes(1);
    expect(openTextEditor.mock.calls[0]![0].anchor).toEqual(domainOf(100, 100));
    expect(getDrawingBook(SYMBOL)).toHaveLength(0); // nothing before commit

    controller.commitTextEdit("  support zone  ");
    const book = getDrawingBook(SYMBOL);
    expect(book).toHaveLength(1);
    expect(book[0]!.kind).toBe("text");
    expect((book[0] as { text: string }).text).toBe("support zone");
    expect(getActiveTool()).toBe("cursor");
    expect(getSelectedDrawingId()).toBe(book[0]!.id);
  });

  it("discards empty text (cancel path) without creating anything", () => {
    const { controller } = makeController();
    setActiveTool("text");
    controller.syncWithTool();
    controller.pointerDown({ x: 100, y: 100 }, true);
    controller.pointerUp({ x: 100, y: 100 });
    controller.cancelTextEdit();
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
  });

  it("edits existing text via double-click", () => {
    addDrawing(SYMBOL, {
      ...line({ id: "txt-1", kind: "text", anchors: [{ time: 1000 + 2 * MIN, price: 200 }] }),
      text: "old",
    } as DrawingObject);
    const hit = { id: "txt-1", target: { part: "body" } as DrawingHitPart };
    const { controller, openTextEditor } = makeController([hit]);

    expect(controller.doubleClick({ x: 100, y: 200 })).toBe(true);
    expect(openTextEditor).toHaveBeenCalledWith(
      expect.objectContaining({ editingId: "txt-1", initial: "old" }),
    );
    controller.commitTextEdit("new");
    const book = getDrawingBook(SYMBOL);
    expect((book[0] as { text: string }).text).toBe("new");
  });
});

describe("selection, move, anchor edit (cursor tool)", () => {
  it("selects on body hit and deselects on empty click", () => {
    addDrawing(SYMBOL, line());
    const hit = { id: "obj-1", target: { part: "body" } as DrawingHitPart };
    const { controller } = makeController([hit]);

    expect(controller.pointerDown({ x: 100, y: 100 }, true)).toBe(true);
    expect(getSelectedDrawingId()).toBe("obj-1");

    makeController([]); // fresh controller without hits
    const plain = makeController([]);
    plain.controller.pointerDown({ x: 500, y: 50 }, true);
    expect(getSelectedDrawingId()).toBeNull();
    // ...and lets the chart pan (event not consumed).
    expect(plain.controller.getState().name).toBe("idle");
  });

  it("moves the whole object — one coalesced history entry per drag", () => {
    addDrawing(SYMBOL, line());
    const original = line();
    const hit = { id: "obj-1", target: { part: "body" } as DrawingHitPart };
    const { controller } = makeController([hit]);

    controller.pointerDown({ x: 100, y: 100 }, true);
    // Sub-threshold jiggle must NOT start a move (accidental-selection guard).
    controller.pointerMove({ x: 101, y: 101 });
    expect(controller.getState().name).toBe("selected");
    controller.pointerMove({ x: 180, y: 60 }); // ≥ 4 px → move
    expect(controller.getState().name).toBe("moving");
    controller.pointerUp({ x: 180, y: 60 });

    const moved = getDrawingBook(SYMBOL)[0]!;
    // dLogical = 80/80 = 1 bar → +1 min; dPrice = (400−60) − (400−100) = +40
    expect(moved.anchors[0]!.time).toBe(original.anchors[0]!.time + MIN);
    expect(moved.anchors[0]!.price).toBe(original.anchors[0]!.price + 40);
    expect(moved.anchors[1]!.time).toBe(original.anchors[1]!.time + MIN);

    undoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)[0]!.anchors).toEqual(original.anchors);
    redoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)[0]!.anchors).toEqual(moved.anchors);
  });

  it("edits a single anchor via its handle", () => {
    addDrawing(SYMBOL, line());
    const hit = { id: "obj-1", target: { part: "anchor", anchorIndex: 1 } as DrawingHitPart };
    const { controller } = makeController([hit]);

    controller.pointerDown({ x: 100, y: 100 }, true);
    controller.pointerMove({ x: 320, y: 80 });
    controller.pointerUp({ x: 320, y: 80 });

    const edited = getDrawingBook(SYMBOL)[0]!;
    expect(edited.anchors[1]).toEqual(domainOf(320, 80));
    expect(edited.anchors[0]).toEqual(line().anchors[0]); // other anchor intact
    undoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)[0]!.anchors[1]).toEqual(line().anchors[1]);
  });

  it("resizes a rectangle through corner handles (both anchors redefined)", () => {
    addDrawing(SYMBOL, {
      ...line({ id: "rect-1", kind: "rectangle", style: DEFAULT_SHAPE_STYLE }),
    } as DrawingObject);
    const hit = { id: "rect-1", target: { part: "corner", corner: 0 as const } as DrawingHitPart };
    const { controller } = makeController([hit]);

    controller.pointerDown({ x: 100, y: 100 }, true);
    controller.pointerMove({ x: 40, y: 60 });
    controller.pointerUp({ x: 40, y: 60 });

    const resized = getDrawingBook(SYMBOL)[0]!;
    expect(resized.anchors[0]).toEqual(domainOf(40, 60));
    // Opposite corner keeps the max time / min price of the original.
    expect(resized.anchors[1]).toEqual({ time: 1000 + 5 * MIN, price: 200 });
  });

  it("respects locks: selectable, never movable or editable", () => {
    toggleDrawingLocked(SYMBOL, "missing"); // no-op on unknown id
    addDrawing(SYMBOL, line({ locked: true }));
    const hit = { id: "obj-1", target: { part: "anchor", anchorIndex: 0 } as DrawingHitPart };
    const { controller } = makeController([hit]);

    expect(controller.pointerDown({ x: 100, y: 100 }, true)).toBe(true);
    expect(getSelectedDrawingId()).toBe("obj-1"); // selection allowed
    controller.pointerMove({ x: 300, y: 300 });
    controller.pointerUp({ x: 300, y: 300 });
    expect(getDrawingBook(SYMBOL)[0]!.anchors).toEqual(line({ locked: true }).anchors);
  });

  it("hidden objects stay in the book but carry the hidden flag", () => {
    addDrawing(SYMBOL, line());
    toggleDrawingHidden(SYMBOL, "obj-1");
    expect(getDrawingBook(SYMBOL)[0]!.hidden).toBe(true);
    toggleDrawingHidden(SYMBOL, "obj-1");
    expect(getDrawingBook(SYMBOL)[0]!.hidden).toBe(false);
    // Hit-testing invisibles is refused by the renderer (browser-verified);
    // the store guarantees the flag survives round-trips.
  });
  it("Escape deselects a PANEL-made selection before closing panels", () => {
    addDrawing(SYMBOL, line());
    const { controller } = makeController([]);
    // The objects panel selects via the store directly — the machine never
    // saw a pointer interaction.
    selectDrawing("obj-1");
    expect(controller.getState().name).toBe("idle");

    expect(controller.escape()).toBe(true); // consumed — workspace must not close panels
    expect(getSelectedDrawingId()).toBeNull();
    expect(controller.escape()).toBe(false); // nothing left — panel may close
  });
});

describe("deletion, clear-all, undo/redo limits", () => {
  it("deletes the selection (locked objects exempt) with undo support", () => {
    addDrawing(SYMBOL, line());
    selectDrawing("obj-1");
    toggleDrawingLocked(SYMBOL, "obj-1");

    const { controller } = makeController([]);
    expect(controller.deleteSelection()).toBe(false); // locked — exempt
    expect(getDrawingBook(SYMBOL)).toHaveLength(1);

    toggleDrawingLocked(SYMBOL, "obj-1"); // unlock
    expect(controller.deleteSelection()).toBe(true);
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
    undoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)).toHaveLength(1);
  });

  it("delete-all is ONE undoable step", () => {
    addDrawing(SYMBOL, line());
    addDrawing(SYMBOL, line({ id: "obj-2" }));
    clearDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
    undoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)).toHaveLength(2);
    redoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)).toHaveLength(0);
  });

  it("caps the history at 50 entries without breaking older state", () => {
    for (let i = 0; i < 60; i += 1) {
      addDrawing(SYMBOL, line({ id: `o-${i}` }));
    }
    expect(getDrawingBook(SYMBOL)).toHaveLength(60);
    for (let i = 0; i < 50; i += 1) undoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)).toHaveLength(10); // first 10 remain
    const before = getDrawingBook(SYMBOL).length;
    undoDrawings(SYMBOL); // 51st — stack exhausted, no-op
    expect(getDrawingBook(SYMBOL)).toHaveLength(before);
    redoDrawings(SYMBOL);
    expect(getDrawingBook(SYMBOL)).toHaveLength(before + 1);
  });

  it("a new mutation after undo clears the redo branch", () => {
    addDrawing(SYMBOL, line({ id: "a" }));
    addDrawing(SYMBOL, line({ id: "b" }));
    undoDrawings(SYMBOL); // b removed
    expect(getDrawingBook(SYMBOL)).toHaveLength(1);
    addDrawing(SYMBOL, line({ id: "c" })); // fresh timeline
    redoDrawings(SYMBOL); // must be a no-op now
    expect(getDrawingBook(SYMBOL).map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("enforces the per-book object cap", () => {
    for (let i = 0; i < 300; i += 1) {
      expect(addDrawing(SYMBOL, line({ id: `cap-${i}` }))).toBe(true);
    }
    expect(addDrawing(SYMBOL, line({ id: "overflow" }))).toBe(false);
    expect(getDrawingBook(SYMBOL)).toHaveLength(300);
  });
});

describe("hook snapshot stability", () => {
  it("returns a stable empty-book reference between renders", () => {
    const first = getDrawingBook("EMPTYBOOK");
    const second = getDrawingBook("EMPTYBOOK");
    expect(first).toBe(second);
    void useOryonDrawings; // hook wiring covered by React usage in the panel
  });
});
