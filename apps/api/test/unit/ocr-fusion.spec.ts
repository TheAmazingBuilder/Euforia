/**
 * Unit — multi-screenshot fusion (V2 spec §14/§18): pure evidence
 * combination. Deterministic (V2 §77), no I/O — the DB-backed orchestration
 * is covered by ocr-sets.e2e.spec.ts.
 */
import { describe, expect, it } from "vitest";

import type { OcrExtractedField } from "../../src/shared/contracts";
import {
  buildFusedTimeline,
  deriveFusedIssues,
  fuseMemberFields,
  fusedQualityScore,
  type FusionMember,
} from "../../src/modules/ocr/fusion.logic";

function field(
  key: OcrExtractedField["field"],
  normalizedValue: string | null,
  confidence = 0.9,
): OcrExtractedField {
  return {
    field: key,
    rawValue: normalizedValue === null ? null : "raw",
    normalizedValue,
    confidence,
    confidenceBand: "HIGH",
    validationStatus: normalizedValue === null ? "MISSING" : "VALID",
    sourceRegion: null,
    warnings: [],
  };
}

const MT5_CLASSIFICATION = {
  type: "TRADE_HISTORY" as const,
  confidence: 0.9,
  alternatives: [],
  platform: "MT5" as const,
};

function member(id: string, fields: OcrExtractedField[]): FusionMember {
  return { recognitionId: id, fields, createdAt: "2026-10-07T10:00:00.000Z" };
}

describe("fuseMemberFields — agreement (V2 §18)", () => {
  it("boosts confidence when members agree, capped at 0.99", () => {
    const fusion = fuseMemberFields([
      member("11111111-1111-4111-8111-111111111111", [field("symbol", "XAUUSD", 0.9)]),
      member("22222222-2222-4222-8222-222222222222", [field("symbol", "XAUUSD", 0.85)]),
      member("33333333-3333-4333-8333-333333333333", [field("symbol", "XAUUSD", 0.8)]),
    ]);
    expect(fusion.fields[0]!.normalizedValue).toBe("XAUUSD");
    expect(fusion.fields[0]!.confidence).toBeGreaterThan(0.9);
    expect(fusion.fields[0]!.confidence).toBeLessThanOrEqual(0.99);
    expect(fusion.fields[0]!.warnings).toContain("MULTI_SOURCE_AGREEMENT");
    expect(fusion.conflicts).toEqual([]);
    expect(fusion.coherent).toBe(false); // no direction evidence — not coherent alone
  });

  it("keeps single-source evidence honestly — NO boost", () => {
    const fusion = fuseMemberFields([
      member("11111111-1111-4111-8111-111111111111", [field("profit", "123.75")]),
      member("22222222-2222-4222-8222-222222222222", [field("symbol", "XAUUSD")]),
    ]);
    const profit = fusion.fields.find((f) => f.field === "profit")!;
    expect(profit.confidence).toBe(0.9);
    expect(profit.warnings).toContain("SINGLE_SOURCE");
  });
});

describe("fuseMemberFields — conflicts (V2 §18)", () => {
  it("records BOTH values with provenance — never silently discards", () => {
    const fusion = fuseMemberFields([
      member("11111111-1111-4111-8111-111111111111", [field("entryPrice", "2645.20")]),
      member("22222222-2222-4222-8222-222222222222", [field("entryPrice", "2645.30")]),
    ]);
    const entry = fusion.fields.find((f) => f.field === "entryPrice")!;
    expect(entry.validationStatus).toBe("AMBIGUOUS");
    expect(entry.warnings).toContain("CONFLICTING_VALUES");
    expect(fusion.conflicts).toHaveLength(1);
    expect(fusion.conflicts[0]!.values.map((v) => v.value).sort()).toEqual(["2645.20", "2645.30"]);
    expect(fusion.conflicts[0]!.values.every((v) => v.recognitionId.length > 0)).toBe(true);
  });

  it("treats decimal-equal values as agreement (2345.60 == 2345.6)", () => {
    const fusion = fuseMemberFields([
      member("11111111-1111-4111-8111-111111111111", [field("entryPrice", "2345.60")]),
      member("22222222-2222-4222-8222-222222222222", [field("entryPrice", "2345.6")]),
    ]);
    expect(fusion.conflicts).toEqual([]);
    expect(fusion.fields[0]!.warnings).toContain("MULTI_SOURCE_AGREEMENT");
  });

  it("flags an incoherent set when members disagree on direction", () => {
    const fusion = fuseMemberFields([
      member("11111111-1111-4111-8111-111111111111", [field("symbol", "XAUUSD"), field("direction", "BUY")]),
      member("22222222-2222-4222-8222-222222222222", [field("symbol", "XAUUSD"), field("direction", "SELL")]),
    ]);
    expect(fusion.coherent).toBe(false);
    expect(fusion.conflicts.map((c) => c.field)).toContain("direction");
  });

  it("a coherent set agrees on symbol AND direction", () => {
    const fusion = fuseMemberFields([
      member("11111111-1111-4111-8111-111111111111", [field("symbol", "XAUUSD"), field("direction", "BUY")]),
      member("22222222-2222-4222-8222-222222222222", [field("symbol", "XAUUSD"), field("direction", "BUY")]),
    ]);
    expect(fusion.coherent).toBe(true);
  });
});

describe("deriveFusedIssues + fusedQualityScore", () => {
  it("adds CONFLICTING_FIELDS issues for recorded conflicts", () => {
    const fields = [field("symbol", "XAUUSD"), field("direction", "BUY")];
    const issues = deriveFusedIssues({
      fields,
      conflicts: [{ field: "entryPrice", values: [{ value: "1", recognitionId: "11111111-1111-4111-8111-111111111111" }, { value: "2", recognitionId: "22222222-2222-4222-8222-222222222222" }] }],
      classification: MT5_CLASSIFICATION,
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: true,
    });
    expect(issues.map((issue) => issue.code)).toContain("CONFLICTING_FIELDS");
  });

  it("penalizes consistency for an incoherent set (V2 §14 correlation)", () => {
    const fields = [field("symbol", "XAUUSD"), field("direction", "BUY")];
    const coherent = fusedQualityScore({ fields, classification: MT5_CLASSIFICATION, duplicateOf: null, coherent: true });
    const incoherent = fusedQualityScore({ fields, classification: MT5_CLASSIFICATION, duplicateOf: null, coherent: false });
    expect(incoherent!.score).toBeLessThan(coherent!.score);
  });
});

describe("buildFusedTimeline", () => {
  it("uses the EARLIEST member upload as the uploaded instant", () => {
    const timeline = buildFusedTimeline({
      fusedFields: [field("openTime", "2026-01-05T09:30:00")],
      members: [
        member("11111111-1111-4111-8111-111111111111", [], "2026-10-07T11:00:00.000Z"),
        member("22222222-2222-4222-8222-222222222222", [], "2026-10-07T10:00:00.000Z"),
      ],
      confirmedAt: null,
    });
    const uploaded = timeline.find((entry) => entry.kind === "UPLOADED");
    expect(uploaded?.at).toBe("2026-10-07T10:00:00.000Z");
  });
});
