import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DebouncedSaver,
  InMemoryStorage,
  createTestPersistence,
} from "@/lib/oryon/drawing-persistence";
import { parseDrawingBook, serializeDrawingBook } from "@/components/oryon/drawings/schema";
import { DEFAULT_LINE_STYLE, type DrawingObject } from "@/components/oryon/drawings/types";

/**
 * Persistence adapter tests (Phase 2 §15) — per-instrument keys, validated
 * restore, corrupt-record safety, debounced writes.
 */

const SYMBOL = "XAUUSD";

function object(id: string): DrawingObject {
  return {
    id,
    kind: "trendLine",
    anchors: [
      { time: 1000, price: 100 },
      { time: 2000, price: 120 },
    ],
    style: { ...DEFAULT_LINE_STYLE },
    locked: false,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
  } as DrawingObject;
}

let storage: InMemoryStorage;
let persistence: ReturnType<typeof createTestPersistence>;

beforeEach(() => {
  storage = new InMemoryStorage();
  persistence = createTestPersistence(storage);
});

describe("load/save", () => {
  it("round-trips a book per instrument", () => {
    const objects = [object("a"), object("b")];
    persistence.save(SYMBOL, objects, 42);
    expect(persistence.load(SYMBOL)).toEqual(objects);
  });

  it("keeps instruments isolated (no cross-instrument leak)", () => {
    persistence.save("XAUUSD", [object("gold")], 1);
    persistence.save("EURUSD", [object("euro")], 1);
    expect(persistence.load("XAUUSD")!.map((o) => o.id)).toEqual(["gold"]);
    expect(persistence.load("EURUSD")!.map((o) => o.id)).toEqual(["euro"]);
    expect(persistence.load("USTECH100")).toBeNull();
  });

  it("returns null for missing books", () => {
    expect(persistence.load(SYMBOL)).toBeNull();
  });

  it("clear removes the book", () => {
    persistence.save(SYMBOL, [object("a")], 1);
    persistence.clear(SYMBOL);
    expect(persistence.load(SYMBOL)).toBeNull();
  });
});

describe("corrupt records degrade safely", () => {
  it("non-JSON content → null (never a crash)", () => {
    storage.setItem(`cosmoz.oryon.drawings.v1:${SYMBOL}`, "{broken");
    expect(persistence.load(SYMBOL)).toBeNull();
  });

  it("a record written for another instrument → null", () => {
    const json = serializeDrawingBook("EURUSD", [object("a")], 1);
    storage.setItem(`cosmoz.oryon.drawings.v1:${SYMBOL}`, json);
    expect(persistence.load(SYMBOL)).toBeNull();
  });

  it("a hand-corrupted anchor → null", () => {
    const json = serializeDrawingBook(SYMBOL, [object("a")], 1);
    const parsed = JSON.parse(json) as { objects: { anchors: unknown[] }[] };
    parsed.objects[0]!.anchors = [{ time: "yesterday", price: null }];
    storage.setItem(`cosmoz.oryon.drawings.v1:${SYMBOL}`, JSON.stringify(parsed));
    expect(persistence.load(SYMBOL)).toBeNull();
  });
});

describe("DebouncedSaver", () => {
  it("coalesces bursts into one write per instrument", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = new DebouncedSaver({ load: () => null, save, clear: () => {} }, 250);

    saver.schedule(SYMBOL, () => [object("v1")]);
    saver.schedule(SYMBOL, () => [object("v2")]);
    saver.schedule(SYMBOL, () => [object("v3")]);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1].map((o: DrawingObject) => o.id)).toEqual(["v3"]);

    // Other instruments keep their own timers.
    saver.schedule("EURUSD", () => []);
    vi.advanceTimersByTime(300);
    expect(save).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("flush() writes immediately and cancels the pending timer", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = new DebouncedSaver({ load: () => null, save, clear: () => {} }, 250);
    saver.schedule(SYMBOL, () => [object("pending")]);
    saver.flush(SYMBOL, () => [object("final")]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1][0]!.id).toBe("final");
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1); // no double write
    vi.useRealTimers();
  });
});

describe("parse guard integration", () => {
  it("schema version 1 is the only accepted version", () => {
    const book = { version: 3, instrumentId: SYMBOL, objects: [], updatedAt: 1 };
    expect(parseDrawingBook(JSON.stringify(book), SYMBOL)).toBeNull();
  });
});
