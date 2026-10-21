/**
 * OCR V2 pure-logic unit tests — arbitration, duplicate distance, corrections
 * memory diff, recrop merge, suggestions ranking. No I/O, no Nest, no DB.
 */
import { describe, expect, it } from "vitest";

import {
  DUPLICATE_HAMMING_THRESHOLD,
  correctionDiff,
  findPerceptualMatch,
  hammingDistance64,
  mergeRecropFields,
  rankSuggestions,
} from "../../src/modules/ocr/ocr.logic";
import {
  ARBITRATION_AGREEMENT_MARGIN,
  arbitrateFields,
  arbitrateTrades,
} from "../../src/modules/ocr/engine/arbitration";
import type { EngineResponse } from "../../src/modules/ocr/engine/ocr-engine.port";

/** Properly-typed engine field fixture (the port's field-key union, §54). */
type EngineField = EngineResponse["fields"][number];

// ── hamming + duplicate match ────────────────────────────────────────────────

describe("hammingDistance64", () => {
  it("counts differing bits between two hex anchors", () => {
    expect(hammingDistance64("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance64("0000000000000000", "8000000000000000")).toBe(1);
    expect(hammingDistance64("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("treats malformed anchors as maximally distant", () => {
    expect(hammingDistance64("nothex", "0000000000000000")).toBe(64);
    expect(hammingDistance64("", "0000000000000000")).toBe(64);
  });
});

describe("findPerceptualMatch", () => {
  const candidates = [
    { assetId: "a-1", perceptualHash: "0000000000000000" },
    { assetId: "a-2", perceptualHash: "00000000000007c3" }, // 7 bits apart from 0x3c
    { assetId: "a-3", perceptualHash: "0000000000000030" }, // 2 bits apart from 0x3c
  ];

  it("returns the CLOSEST match within the threshold", () => {
    const match = findPerceptualMatch("0000000000000001", candidates);
    expect(match).not.toBeNull();
    expect(match?.assetId).toBe("a-1"); // exactly 1 bit away, the closest
    expect(match?.hammingDistance).toBe(1);
  });

  it("returns null when every anchor is beyond the threshold", () => {
    expect(findPerceptualMatch("ffffffffffffffff", candidates)).toBeNull();
  });

  it("uses a threshold of 6 differing bits", () => {
    expect(DUPLICATE_HAMMING_THRESHOLD).toBe(6);
    // Query 0x3c: a-3 is 2 bits away, a-1 is 4, a-2 is 7 (out).
    const edge = findPerceptualMatch("000000000000003c", candidates);
    expect(edge?.assetId).toBe("a-3");
    expect(edge?.hammingDistance).toBe(2);
  });
});

// ── corrections memory diff ─────────────────────────────────────────────────

describe("correctionDiff", () => {
  const machine = {
    symbol: { value: "XAUUSD", state: "FOUND" as const },
    volume: { value: "0.51", state: "FOUND" as const }, // engine misread 0.15
    entryPrice: { value: "2345.60", state: "FOUND" as const },
    currency: { value: null, state: "NOT_FOUND" as const },
  };

  it("reports only the fields the user actually changed", () => {
    const diff = correctionDiff(machine, {
      symbol: "XAUUSD",
      volume: "0.15",
      entryPrice: "2345.60",
      currency: "USD",
    });
    expect(diff).toEqual([
      { field: "volume", rawValue: "0.51", correctedValue: "0.15" },
      { field: "currency", rawValue: null, correctedValue: "USD" },
    ]);
  });

  it("skips fields where both machine and user agree on missing", () => {
    const diff = correctionDiff(machine, {
      symbol: "XAUUSD",
      volume: "0.51",
      entryPrice: "2345.60",
      direction: null,
      exitPrice: null,
      stopLoss: null,
      takeProfit: null,
      profitLoss: null,
      currency: null,
    });
    expect(diff).toEqual([]);
  });
});

// ── recrop merge ────────────────────────────────────────────────────────────

describe("mergeRecropFields", () => {
  const existing = [
    {
      field: "symbol",
      rawValue: "XAUUSD",
      normalizedValue: "XAUUSD",
      confidence: 0.95,
      sourceRegion: null,
      warnings: [] as string[],
    },
    {
      field: "entryPrice",
      rawValue: "2345.60",
      normalizedValue: "2345.60",
      confidence: 0.8,
      sourceRegion: null,
      warnings: [] as string[],
    },
  ];

  it("replaces zone fields, adds new ones, keeps the rest", () => {
    const recrop = [
      {
        field: "entryPrice",
        rawValue: "2345.65",
        normalizedValue: "2345.65",
        confidence: 0.99,
        sourceRegion: null,
        warnings: [] as string[],
      },
      {
        field: "stopLoss",
        rawValue: "2335.60",
        normalizedValue: "2335.60",
        confidence: 0.9,
        sourceRegion: null,
        warnings: [] as string[],
      },
    ];
    const { fields, replacedKeys, addedKeys } = mergeRecropFields(existing, recrop);
    expect(replacedKeys).toEqual(["entryPrice"]);
    expect(addedKeys).toEqual(["stopLoss"]);
    const entry = fields.find((f) => f.field === "entryPrice");
    expect(entry?.normalizedValue).toBe("2345.65");
    expect(entry?.warnings).toContain("RECROP");
    expect(fields.find((f) => f.field === "symbol")?.normalizedValue).toBe("XAUUSD");
  });

  it("ignores zone reads with no usable value", () => {
    const recrop = [
      {
        field: "takeProfit",
        rawValue: null,
        normalizedValue: null,
        confidence: 0.4,
        sourceRegion: null,
        warnings: [] as string[],
      },
    ];
    const { fields, addedKeys } = mergeRecropFields(existing, recrop);
    expect(addedKeys).toEqual([]);
    expect(fields.find((f) => f.field === "takeProfit")).toBeUndefined();
  });
});

// ── suggestions ranking ─────────────────────────────────────────────────────

describe("rankSuggestions", () => {
  it("ranks by use count and caps at 3 values per field", () => {
    const suggestions = rankSuggestions([
      { field: "symbol", correctedValue: "EURUSD", useCount: 2 },
      { field: "symbol", correctedValue: "XAUUSD", useCount: 7 },
      { field: "symbol", correctedValue: "GBPUSD", useCount: 5 },
      { field: "symbol", correctedValue: "USDJPY", useCount: 1 },
      { field: "volume", correctedValue: "0.15", useCount: 4 },
    ]);
    const symbol = suggestions.find((s) => s.field === "symbol");
    expect(symbol?.values.map((v) => v.value)).toEqual(["XAUUSD", "GBPUSD", "EURUSD"]);
    expect(symbol?.values).toHaveLength(3);
    expect(suggestions.find((s) => s.field === "volume")?.values[0]?.count).toBe(4);
  });
});

// ── arbitration ─────────────────────────────────────────────────────────────

function field(field: EngineField["field"], normalizedValue: string | null, confidence: number): EngineField {
  return {
    field,
    rawValue: normalizedValue,
    normalizedValue,
    confidence,
    sourceRegion: null,
    notes: [],
  };
}

describe("arbitrateFields", () => {
  it("agreement keeps the value with the max confidence + a note", () => {
    const { fields, stats } = arbitrateFields(
      [field("symbol", "XAUUSD", 0.9)],
      [field("symbol", "XAUUSD", 0.7)],
    );
    expect(fields[0]?.confidence).toBe(0.9);
    expect(fields[0]?.notes).toContain("AGREEMENT_BOTH_ENGINES");
    expect(stats.agreements).toBe(1);
  });

  it("primary wins a disagreement unless the secondary is clearly better", () => {
    const primary = [field("volume", "0.15", 0.8), field("entryPrice", "2345.60", 0.6)];
    const secondary = [field("volume", "0.51", 0.82), field("entryPrice", "2345.65", 0.97)];
    const { fields, stats } = arbitrateFields(primary, secondary);
    expect(fields.find((f) => f.field === "volume")?.normalizedValue).toBe("0.15"); // margin 0.02 ≤ 0.15 → primary kept
    expect(fields.find((f) => f.field === "volume")?.notes).toContain("DISAGREEMENT_PRIMARY_KEPT");
    expect(fields.find((f) => f.field === "entryPrice")?.normalizedValue).toBe("2345.65"); // clearly better
    expect(fields.find((f) => f.field === "entryPrice")?.notes).toContain("SECONDARY_ONLY");
    expect(stats.disagreements).toBe(2);
  });

  it("joins secondary-only fields above the floor and drops the rest", () => {
    const { fields, stats } = arbitrateFields(
      [field("symbol", "XAUUSD", 0.9)],
      [field("stopLoss", "2335.60", 0.8), field("takeProfit", "2365.60", 0.3)],
    );
    expect(fields.find((f) => f.field === "stopLoss")?.normalizedValue).toBe("2335.60");
    expect(fields.find((f) => f.field === "takeProfit")).toBeUndefined();
    expect(stats.secondaryOnly).toBe(1);
  });

  it("documents the agreement margin as part of the contract", () => {
    expect(ARBITRATION_AGREEMENT_MARGIN).toBe(0.15);
  });
});

describe("arbitrateTrades", () => {
  it("merges per pageIndex and keeps unpaired primary trades intact", () => {
    const primary = [
      { pageIndex: 0, fields: [field("symbol", "XAUUSD", 0.9)] },
      { pageIndex: 1, fields: [field("symbol", "EURUSD", 0.7)] },
    ];
    const secondary = [{ pageIndex: 0, fields: [field("symbol", "XAUUSD", 0.6)] }];
    const { trades, stats } = arbitrateTrades(primary, secondary);
    expect(trades).toHaveLength(2);
    expect(trades[0]?.fields[0]?.confidence).toBe(0.9);
    expect(trades[1]?.fields[0]?.confidence).toBe(0.7);
    expect(stats.agreements).toBe(1);
  });
});
