import { describe, expect, it } from "vitest";

import {
  DrawingValidationError,
  MAX_OBJECTS_PER_BOOK,
  defaultStyleFor,
  parseDrawingBook,
  serializeDrawingBook,
} from "@/components/oryon/drawings/schema";
import {
  DEFAULT_FIBONACCI_STYLE,
  DEFAULT_LINE_STYLE,
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
  type DrawingObject,
} from "@/components/oryon/drawings/types";

/**
 * Persistence-form validation tests (PRD §8.6: versioned from day 1;
 * unknown versions and malformed records are REJECTED, never coerced).
 */

function trendLine(id: string, overrides: Record<string, unknown> = {}): DrawingObject {
  return {
    id,
    kind: "trendLine",
    anchors: [
      { time: 1000, price: 100 },
      { time: 2000, price: 110 },
    ],
    style: { ...DEFAULT_LINE_STYLE },
    locked: false,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as unknown as DrawingObject;
}

describe("serializeDrawingBook / parseDrawingBook round-trip", () => {
  it("restores objects identical to what was saved", () => {
    const objects = [
      trendLine("a"),
      trendLine("b", { locked: true, hidden: true, label: "resistance" }),
    ];
    const json = serializeDrawingBook("XAUUSD", objects, 12345);
    const restored = parseDrawingBook(json, "XAUUSD");
    expect(restored).toEqual(objects);
  });

  it("round-trips every kind with its exact anchor count", () => {
    const objects: DrawingObject[] = [
      trendLine("trend"),
      {
        id: "h",
        kind: "horizontalLine",
        anchors: [{ time: 1000, price: 50 }],
        style: { ...DEFAULT_LINE_STYLE },
        locked: false,
        hidden: false,
        createdAt: 1,
        updatedAt: 1,
      } as DrawingObject,
      {
        id: "fib",
        kind: "fibonacci",
        anchors: [
          { time: 1000, price: 300 },
          { time: 2000, price: 100 },
        ],
        style: { ...DEFAULT_FIBONACCI_STYLE },
        locked: false,
        hidden: false,
        createdAt: 1,
        updatedAt: 1,
      } as DrawingObject,
    ];
    const restored = parseDrawingBook(serializeDrawingBook("EURUSD", objects, 1), "EURUSD");
    expect(restored).toHaveLength(3);
    expect(restored![1]!.anchors).toHaveLength(1);
    expect(restored![2]!.anchors).toHaveLength(2);
  });
});

describe("parseDrawingBook rejection rules", () => {
  it("rejects non-JSON garbage without throwing", () => {
    expect(parseDrawingBook("{{{not json", "XAUUSD")).toBeNull();
  });

  it("rejects unknown schema versions", () => {
    const book = { version: 2, instrumentId: "XAUUSD", objects: [], updatedAt: 1 };
    expect(parseDrawingBook(JSON.stringify(book), "XAUUSD")).toBeNull();
  });

  it("rejects books belonging to a DIFFERENT instrument", () => {
    const json = serializeDrawingBook("XAUUSD", [trendLine("a")], 1);
    expect(parseDrawingBook(json, "EURUSD")).toBeNull();
  });

  it("rejects unknown kinds", () => {
    const book = {
      version: 1,
      instrumentId: "XAUUSD",
      updatedAt: 1,
      objects: [{ ...trendLine("a"), kind: "gannFan" }],
    };
    expect(parseDrawingBook(JSON.stringify(book), "XAUUSD")).toBeNull();
  });

  it("rejects wrong anchor counts (tuple enforcement)", () => {
    const book = {
      version: 1,
      instrumentId: "XAUUSD",
      updatedAt: 1,
      objects: [{ ...trendLine("a"), anchors: [{ time: 1, price: 1 }] }],
    };
    expect(parseDrawingBook(JSON.stringify(book), "XAUUSD")).toBeNull();
  });

  it("rejects non-finite or non-positive anchors", () => {
    for (const anchor of [
      { time: Number.NaN, price: 100 },
      { time: 0, price: 100 },
      { time: 1000, price: Number.POSITIVE_INFINITY },
      { time: 1000, price: -5 },
    ]) {
      const book = {
        version: 1,
        instrumentId: "XAUUSD",
        updatedAt: 1,
        objects: [{ ...trendLine("a"), anchors: [anchor, anchor] }],
      };
      expect(parseDrawingBook(JSON.stringify(book), "XAUUSD")).toBeNull();
    }
  });

  it("rejects unknown style color tokens", () => {
    const book = {
      version: 1,
      instrumentId: "XAUUSD",
      updatedAt: 1,
      objects: [
        { ...trendLine("a"), style: { ...DEFAULT_LINE_STYLE, color: "#ff00ff" } },
      ],
    };
    expect(parseDrawingBook(JSON.stringify(book), "XAUUSD")).toBeNull();
  });
});

describe("serialization guards", () => {
  it("throws on non-finite anchors (never writes corrupt geometry)", () => {
    const bad = [trendLine("a", { anchors: [{ time: 1, price: Number.NaN }, { time: 2, price: 1 }] })];
    expect(() => serializeDrawingBook("XAUUSD", bad, 1)).toThrow(DrawingValidationError);
  });

  it("throws beyond the per-book object cap", () => {
    const tooMany = Array.from({ length: MAX_OBJECTS_PER_BOOK + 1 }, (_, i) =>
      trendLine(`o-${i}`),
    );
    expect(() => serializeDrawingBook("XAUUSD", tooMany, 1)).toThrow(DrawingValidationError);
  });
});

describe("defaultStyleFor", () => {
  it("maps kinds to their token-driven default styles", () => {
    expect(defaultStyleFor("trendLine")).toBe(DEFAULT_LINE_STYLE);
    expect(defaultStyleFor("rectangle")).toBe(DEFAULT_SHAPE_STYLE);
    expect(defaultStyleFor("fibonacci")).toBe(DEFAULT_FIBONACCI_STYLE);
    expect(defaultStyleFor("text")).toBe(DEFAULT_TEXT_STYLE);
    expect(defaultStyleFor("horizontalLine")).toBe(DEFAULT_LINE_STYLE);
  });
});
