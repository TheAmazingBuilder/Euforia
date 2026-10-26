/**
 * Unit - OCR V2 decision layer (V2 spec §15/§16/§17/§23/§4): structured
 * issues, quality score, timeline derivation, trade-duplicate evidence,
 * timestamp-order validation. PURE functions - no DB, no clock, fully
 * deterministic (V2 §77: same input → same output).
 */
import { describe, expect, it } from "vitest";

import type { OcrExtractedField } from "../../src/shared/contracts";
import {
  applyDomainValidation,
  buildRecognitionTimeline,
  computeQualityScore,
  deriveRecognitionIssues,
  LOW_OCR_CONFIDENCE_THRESHOLD,
  REQUIRED_FIELD_KEYS,
  tradeDuplicateEvidence,
  QUALITY_SCORE_WEIGHTS,
} from "../../src/modules/ocr/ocr.logic";

function field(
  key: OcrExtractedField["field"],
  overrides: Partial<OcrExtractedField> = {},
): OcrExtractedField {
  return {
    field: key,
    rawValue: "raw",
    normalizedValue: "1",
    confidence: 0.95,
    confidenceBand: "HIGH",
    validationStatus: "VALID",
    sourceRegion: null,
    warnings: [],
    ...overrides,
  };
}

const completeFields = (): OcrExtractedField[] => [
  field("symbol", { normalizedValue: "XAUUSD" }),
  field("direction", { normalizedValue: "BUY" }),
  field("volume", { normalizedValue: "0.15" }),
  field("entryPrice", { normalizedValue: "2345.6" }),
];

// ── V2 §16 - deriveRecognitionIssues ─────────────────────────────────────────

describe("deriveRecognitionIssues", () => {
  it("is empty for a clean, catalog-resolved recognition", () => {
    const issues = deriveRecognitionIssues({
      fields: completeFields(),
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues).toEqual([]);
  });

  it("flags missing REQUIRED fields only (optional fields stay unflagged)", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("symbol", { normalizedValue: null, rawValue: null, validationStatus: "MISSING" })],
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues).toEqual([{ code: "MISSING_REQUIRED_FIELD", field: "symbol", detail: null }]);
  });

  it("does not flag a missing optional field (profit absent is normal)", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("profit", { normalizedValue: null, rawValue: null, validationStatus: "MISSING" })],
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues).toEqual([]);
  });

  it("flags LOW_OCR_CONFIDENCE below the documented threshold", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("entryPrice", { confidence: LOW_OCR_CONFIDENCE_THRESHOLD - 0.01, confidenceBand: "LOW" })],
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues).toEqual([{ code: "LOW_OCR_CONFIDENCE", field: "entryPrice", detail: null }]);
  });

  it("splits INVALID into price-relationship vs timestamp codes", () => {
    const issues = deriveRecognitionIssues({
      fields: [
        field("stopLoss", { validationStatus: "INVALID", warnings: ["DIRECTIONAL_INCONSISTENCY"] }),
        field("closeTime", { validationStatus: "INVALID", warnings: ["TIMESTAMP_ORDER_INCONSISTENCY"] }),
      ],
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      "INVALID_PRICE_RELATIONSHIP",
      "INVALID_TIMESTAMP",
    ]);
  });

  it("flags AMBIGUOUS numbers and directions distinctly", () => {
    const issues = deriveRecognitionIssues({
      fields: [
        field("volume", { normalizedValue: null, validationStatus: "AMBIGUOUS" }),
        field("direction", { normalizedValue: null, validationStatus: "AMBIGUOUS" }),
      ],
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues.map((issue) => issue.code)).toEqual(["AMBIGUOUS_NUMBER", "AMBIGUOUS_DIRECTION"]);
  });

  it("flags unknown platform / unsupported screenshot classification", () => {
    const issues = deriveRecognitionIssues({
      fields: completeFields(),
      classification: { type: "UNKNOWN", confidence: 0.1, alternatives: [], platform: "UNKNOWN" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      "UNSUPPORTED_SCREENSHOT",
      "UNKNOWN_PLATFORM",
    ]);
  });

  it("flags UNKNOWN_SYMBOL with the unresolved symbol as detail", () => {
    const issues = deriveRecognitionIssues({
      fields: completeFields(),
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: false,
    });
    expect(issues).toEqual([{ code: "UNKNOWN_SYMBOL", field: "symbol", detail: "XAUUSD" }]);
  });

  it("carries the duplicate flags as issues with stable details", () => {
    const issues = deriveRecognitionIssues({
      fields: completeFields(),
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: { recognitionId: "11111111-1111-4111-8111-111111111111" },
      possibleTradeDuplicate: {
        tradeId: "22222222-2222-4222-8222-222222222222",
        matchedOn: ["SYMBOL"],
      },
      symbolInCatalog: true,
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      "POSSIBLE_DUPLICATE",
      "POSSIBLE_TRADE_DUPLICATE",
    ]);
    expect(issues[1]!.detail).toBe("22222222-2222-4222-8222-222222222222");
  });
});

// ── V2 §15 - computeQualityScore ─────────────────────────────────────────────

describe("computeQualityScore", () => {
  it("returns null when nothing is readable", () => {
    const score = computeQualityScore({
      fields: [field("profit", { normalizedValue: null, rawValue: null, validationStatus: "MISSING" })],
      classification: null,
      duplicateOf: null,
    });
    expect(score).toBeNull();
  });

  it("is deterministic - the same input yields the same score", () => {
    const input: Parameters<typeof computeQualityScore>[0] = {
      fields: completeFields(),
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
    };
    expect(computeQualityScore(input)).toEqual(computeQualityScore(input));
  });

  it("is bounded 0..1 and complete for a perfect recognition", () => {
    const score = computeQualityScore({
      fields: completeFields(),
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
    });
    expect(score).not.toBeNull();
    expect(score!.score).toBeGreaterThan(0.9);
    expect(score!.components.completeness).toBe(1);
    expect(score!.components.validation).toBe(1);
    expect(score!.components.consistency).toBe(1);
  });

  it("penalizes duplicates and unknown classification on consistency", () => {
    const clean = computeQualityScore({
      fields: completeFields(),
      classification: { type: "TRADE_HISTORY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
    })!;
    const flagged = computeQualityScore({
      fields: completeFields(),
      classification: { type: "UNKNOWN", confidence: 0.1, alternatives: [], platform: "UNKNOWN" },
      duplicateOf: { recognitionId: "11111111-1111-4111-8111-111111111111" },
    })!;
    expect(flagged.components.consistency).toBeLessThan(clean.components.consistency);
    expect(flagged.score).toBeLessThan(clean.score);
  });

  it("weights sum to 1 (documented, explainable mix)", () => {
    const total =
      QUALITY_SCORE_WEIGHTS.fieldConfidence +
      QUALITY_SCORE_WEIGHTS.completeness +
      QUALITY_SCORE_WEIGHTS.validation +
      QUALITY_SCORE_WEIGHTS.consistency;
    expect(total).toBeCloseTo(1, 10);
  });

  it("covers exactly the import-critical completeness floor", () => {
    expect(REQUIRED_FIELD_KEYS).toEqual(["symbol", "direction", "volume", "entryPrice"]);
  });
});

// ── V2 §23 - buildRecognitionTimeline ────────────────────────────────────────

describe("buildRecognitionTimeline", () => {
  it("omits entries without evidence - never invents a timestamp (§23)", () => {
    const timeline = buildRecognitionTimeline({
      fields: [field("profit", { normalizedValue: "12.3" })],
      uploadedAt: "2026-10-07T10:00:00.000Z",
      confirmedAt: null,
    });
    expect(timeline).toEqual([{ kind: "UPLOADED", at: "2026-10-07T10:00:00.000Z", raw: null }]);
  });

  it("orders open → close → uploaded → confirmed", () => {
    const timeline = buildRecognitionTimeline({
      fields: [
        field("closeTime", { normalizedValue: "2026-01-05T10:15:00", rawValue: "2026.01.05 10:15:00" }),
        field("openTime", { normalizedValue: "2026-01-05T09:30:00", rawValue: "2026.01.05 09:30:00" }),
      ],
      uploadedAt: "2026-10-07T10:00:00.000Z",
      confirmedAt: "2026-10-07T10:05:00.000Z",
    });
    expect(timeline.map((entry) => entry.kind)).toEqual([
      "OPEN_TIME",
      "CLOSE_TIME",
      "UPLOADED",
      "CONFIRMED",
    ]);
    // Wall-clock canonical form preserved - no timezone conversion (§16).
    expect(timeline[0]).toEqual({
      kind: "OPEN_TIME",
      at: "2026-01-05T09:30:00",
      raw: "2026.01.05 09:30:00",
    });
  });
});

// ── V2 §4 - tradeDuplicateEvidence ───────────────────────────────────────────

describe("tradeDuplicateEvidence", () => {
  const candidate = {
    symbol: "XAUUSD",
    direction: "BUY" as const,
    entryPrice: "2345.60",
    openTime: "2026-01-05T09:30:00",
  };

  it("requires at least one evidence beyond the prerequisites", () => {
    const evidence = tradeDuplicateEvidence(candidate, {
      entryPrice: "9999.99",
      entryAt: "2030-01-01T00:00:00.000Z",
    });
    expect(evidence).toEqual([]);
  });

  it("matches entry price with exact decimal semantics", () => {
    const evidence = tradeDuplicateEvidence(candidate, {
      entryPrice: "2345.6",
      entryAt: null,
    });
    expect(evidence).toEqual(["ENTRY_PRICE"]);
  });

  it("matches entry time within the documented window", () => {
    const evidence = tradeDuplicateEvidence(candidate, {
      entryPrice: "1111.11",
      entryAt: "2026-01-05T10:30:00.000Z",
    });
    expect(evidence).toEqual(["ENTRY_TIME"]);
  });

  it("rejects an entry time outside the ±48h window", () => {
    const evidence = tradeDuplicateEvidence(candidate, {
      entryPrice: null,
      entryAt: "2026-01-20T09:30:00.000Z",
    });
    expect(evidence).toEqual([]);
  });
});

// ── V2 §17 - timestamp order in applyDomainValidation ────────────────────────

describe("applyDomainValidation - timestamp order (V2 §17)", () => {
  it("marks closeTime INVALID when it precedes openTime", () => {
    const fields: OcrExtractedField[] = [
      field("openTime", { normalizedValue: "2026-01-05T10:00:00", rawValue: "2026.01.05 10:00:00" }),
      field("closeTime", { normalizedValue: "2026-01-05T09:00:00", rawValue: "2026.01.05 09:00:00" }),
    ];
    const validated = applyDomainValidation(fields);
    const close = validated.find((f) => f.field === "closeTime");
    expect(close?.validationStatus).toBe("INVALID");
    expect(close?.warnings).toContain("TIMESTAMP_ORDER_INCONSISTENCY");
  });

  it("leaves a coherent order untouched", () => {
    const fields: OcrExtractedField[] = [
      field("openTime", { normalizedValue: "2026-01-05T09:00:00" }),
      field("closeTime", { normalizedValue: "2026-01-05T10:00:00" }),
    ];
    const validated = applyDomainValidation(fields);
    expect(validated.find((f) => f.field === "closeTime")?.validationStatus).toBe("VALID");
  });

  it("only fires when BOTH timestamps are present (§19)", () => {
    const fields: OcrExtractedField[] = [
      field("closeTime", { normalizedValue: "2026-01-05T09:00:00" }),
    ];
    const validated = applyDomainValidation(fields);
    expect(validated.find((f) => f.field === "closeTime")?.validationStatus).toBe("VALID");
  });
});
