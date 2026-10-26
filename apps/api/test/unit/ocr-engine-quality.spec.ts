/**
 * Unit - engine-quality phase pure logic: perceptual duplicate distance,
 * corrections-memory pattern collection, playbook tag suggestions.
 * No Nest, no DB, no clock (§94 determinism).
 */
import { describe, expect, it } from "vitest";
import {
  collectCorrectionPatterns,
  DUPLICATE_HAMMING_THRESHOLD,
  HAMMING_MAX_DISTANCE,
  hammingDistance64,
  suggestedTagsForImport,
} from "../../src/modules/ocr/ocr.logic";
import type { OcrExtractedField } from "../../src/shared/contracts";

function field(overrides: Partial<OcrExtractedField> = {}): OcrExtractedField {
  return {
    field: "entryPrice",
    rawValue: "2345.60",
    normalizedValue: "2345.60",
    confidence: 0.95,
    confidenceBand: "HIGH",
    validationStatus: "VALID",
    sourceRegion: null,
    warnings: [],
    ...overrides,
  } as OcrExtractedField;
}

// ── hammingDistance64 ────────────────────────────────────────────────────────

describe("hammingDistance64", () => {
  it("is 0 for identical fingerprints", () => {
    expect(hammingDistance64("0123456789abcdef", "0123456789abcdef")).toBe(0);
  });

  it("counts differing bits across nibbles", () => {
    // 0 vs 1 → 1 bit; f vs 0 → 4 bits.
    expect(hammingDistance64("0000000000000000", "1000000000000000")).toBe(1);
    expect(hammingDistance64("0000000000000000", "f000000000000000")).toBe(4);
    expect(hammingDistance64("ffffffffffffffff", "0000000000000000")).toBe(64);
  });

  it("treats malformed input as maximally distant (V2 contract - advisory signal, never a crash)", () => {
    expect(hammingDistance64("xyz", "0123456789abcdef")).toBe(HAMMING_MAX_DISTANCE);
    expect(hammingDistance64("0123456789ABCDEF", "0123456789abcdef")).toBe(HAMMING_MAX_DISTANCE); // uppercase not allowed
    expect(hammingDistance64("", "0123456789abcdef")).toBe(HAMMING_MAX_DISTANCE);
  });

  it("threshold is the V2 decision-layer value (6 of 64 bits)", () => {
    expect(DUPLICATE_HAMMING_THRESHOLD).toBe(6);
  });
});

// ── collectCorrectionPatterns ───────────────────────────────────────────────

describe("collectCorrectionPatterns", () => {
  const machine = [
    field({ field: "entryPrice", rawValue: "2345.60" }),
    field({ field: "volume", rawValue: "0,15" }),
    field({ field: "symbol", rawValue: "XAUUSO" }),
  ];

  it("collects only fields the user actually changed", () => {
    const entries = collectCorrectionPatterns(machine, {
      entryPrice: "2345.60", // unchanged → no memory
      volume: "0.15", // comma → dot correction
      symbol: "XAUUSD", // misread glyph correction
    });
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual({ fieldKey: "volume", rawValue: "0,15", correctedValue: "0.15" });
    expect(entries).toContainEqual({ fieldKey: "symbol", rawValue: "XAUUSO", correctedValue: "XAUUSD" });
  });

  it("skips cleared (null) corrections and unknown keys", () => {
    const entries = collectCorrectionPatterns(machine, {
      exitPrice: "2359.98", // not in machine set → skipped
      volume: null, // explicit clear → never a pattern
    });
    expect(entries).toHaveLength(0);
  });

  it("survives an empty corrections record", () => {
    expect(collectCorrectionPatterns(machine, {})).toHaveLength(0);
  });
});

// ── suggestedTagsForImport ──────────────────────────────────────────────────

describe("suggestedTagsForImport", () => {
  it("always suggests the import origin", () => {
    const tags = suggestedTagsForImport({ symbol: null, openTime: null });
    expect(tags).toContain("Import");
  });

  it("derives the session bucket from the open time (UTC)", () => {
    expect(suggestedTagsForImport({ symbol: "XAUUSD", openTime: "2026-10-04T03:15:00" })).toContain("Session Asia");
    expect(suggestedTagsForImport({ symbol: "XAUUSD", openTime: "2026-10-04T08:15:00" })).toContain("Session London");
    expect(suggestedTagsForImport({ symbol: "XAUUSD", openTime: "2026-10-04T15:30:00" })).toContain("Session New York");
  });

  it("maps the instrument asset class to a tag", () => {
    const tags = suggestedTagsForImport({ symbol: "XAUUSD", openTime: null, instrumentAssetClass: "METAL" });
    expect(tags).toContain("Metals");
    expect(suggestedTagsForImport({ symbol: "EURUSD", openTime: null, instrumentAssetClass: "FOREX" })).toContain("Forex");
  });

  it("caps the suggestion list", () => {
    const tags = suggestedTagsForImport({
      symbol: "X",
      openTime: "2026-10-04T08:00:00",
      instrumentAssetClass: "FOREX",
    });
    expect(tags.length).toBeLessThanOrEqual(8);
  });
});
