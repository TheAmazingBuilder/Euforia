/**
 * Unit - OCR domain logic (Phase 19 §13–§21): decimal normalization,
 * symbol/timestamp normalization, confidence banding, domain validation,
 * correction semantics, idempotency key derivation. Pure functions - no
 * Nest, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_SEPARATOR_WARNING,
  CURRENCY_STRIPPED_WARNING,
  TIMEZONE_UNKNOWN_WARNING,
  USER_CORRECTED_WARNING,
  applyCorrections,
  applyDomainValidation,
  confidenceBand,
  deriveIdempotencyKey,
  normalizeDecimal,
  normalizeDirection,
  normalizeSymbol,
  normalizeTimestamp,
  parseCorrectedDecimal,
  validateCorrection,
  CorrectionError,
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
  };
}

// ── Decimal normalization (§14) ──────────────────────────────────────────────

describe("normalizeDecimal (§14 exact financial semantics)", () => {
  it("parses plain decimals", () => {
    expect(normalizeDecimal("2345.60")).toMatchObject({ normalized: "2345.6", status: "VALID" });
    expect(normalizeDecimal("0.15")).toMatchObject({ normalized: "0.15", status: "VALID" });
    expect(normalizeDecimal("-12.34")).toMatchObject({ normalized: "-12.34", status: "VALID" });
  });

  it("resolves mixed separators by the LAST separator (thousands + decimal)", () => {
    expect(normalizeDecimal("1,234.50")).toMatchObject({ normalized: "1234.5", status: "VALID" });
    expect(normalizeDecimal("1.234,50")).toMatchObject({ normalized: "1234.5", status: "VALID" });
    expect(normalizeDecimal("12,345,678.90")).toMatchObject({ normalized: "12345678.9", status: "VALID" });
  });

  it("treats repeated single separators as thousands grouping", () => {
    expect(normalizeDecimal("1.234.567")).toMatchObject({ normalized: "1234567", status: "VALID" });
    expect(normalizeDecimal("1,234,567")).toMatchObject({ normalized: "1234567", status: "VALID" });
  });

  it("keeps a single 3-digit separator AMBIGUOUS - never silently resolved (§14)", () => {
    const result = normalizeDecimal("1.234");
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.normalized).toBeNull();
    expect(result.warnings).toContain(AMBIGUOUS_SEPARATOR_WARNING);
    // Same for the comma flavor.
    expect(normalizeDecimal("2,345").status).toBe("AMBIGUOUS");
    // And for the index-quote-looking case.
    expect(normalizeDecimal("38,500.00").status).toBe("VALID");
  });

  it("strips currency symbols with an explicit warning", () => {
    const result = normalizeDecimal("$1,234.50");
    expect(result.status).toBe("VALID");
    expect(result.normalized).toBe("1234.5");
    expect(result.warnings).toContain(CURRENCY_STRIPPED_WARNING);
    // Trailing units are stripped the same way.
    expect(normalizeDecimal("0.15 lots").normalized).toBe("0.15");
    expect(normalizeDecimal("-12.34 USD").normalized).toBe("-12.34");
  });

  it("rejects garbage and non-finite values", () => {
    expect(normalizeDecimal("12abc34").status).toBe("INVALID");
    expect(normalizeDecimal("--5").status).toBe("INVALID");
    expect(normalizeDecimal("").status).toBe("INVALID");
  });

  it("user corrections reject ambiguous decimals (the user can retype clearly)", () => {
    expect(parseCorrectedDecimal("1.234", false)).toBeNull();
    expect(parseCorrectedDecimal("1234", false)).toBe("1234");
    expect(parseCorrectedDecimal("-5.50", false)).toBeNull(); // unsigned field
    expect(parseCorrectedDecimal("-5.50", true)).toBe("-5.5"); // signed (profit)
  });
});

// ── Symbol normalization (§15) ───────────────────────────────────────────────

describe("normalizeSymbol (§15 no broker merge)", () => {
  it("uppercases and strips non-alphanumerics only", () => {
    expect(normalizeSymbol("xauusd")).toBe("XAUUSD");
    expect(normalizeSymbol("XAUUSD.a")).toBe("XAUUSDA");
    expect(normalizeSymbol("xau/usd")).toBe("XAUUSD");
  });

  it("does NOT merge known broker aliases - raw value stays preserved upstream", () => {
    // GOLD stays GOLD; mapping to XAUUSD would be inventing a broker mapping.
    expect(normalizeSymbol("GOLD")).toBe("GOLD");
    expect(normalizeSymbol("XAUUSDm")).toBe("XAUUSDM");
  });

  it("enforces a 3..16 character floor/ceiling", () => {
    expect(normalizeSymbol("ab")).toBeNull();
    expect(normalizeSymbol("A".repeat(17))).toBeNull();
    expect(normalizeSymbol("US30")).toBe("US30");
  });
});

// ── Timestamp normalization (§16) ────────────────────────────────────────────

describe("normalizeTimestamp (§16 no silent timezone assumption)", () => {
  it("normalizes MT5 dotted wall-clock WITHOUT an offset + TIMEZONE_UNKNOWN", () => {
    const result = normalizeTimestamp("2026.01.05 09:30:00");
    expect(result.normalized).toBe("2026-01-05T09:30:00");
    expect(result.warnings).toContain(TIMEZONE_UNKNOWN_WARNING);
  });

  it("accepts dashed wall-clock without seconds", () => {
    const result = normalizeTimestamp("2026-01-05 09:30");
    expect(result.normalized).toBe("2026-01-05T09:30:00");
    expect(result.warnings).toContain(TIMEZONE_UNKNOWN_WARNING);
  });

  it("rejects calendar-invalid dates instead of rolling over", () => {
    expect(normalizeTimestamp("2026.02.30 10:00:00").normalized).toBeNull();
    expect(normalizeTimestamp("2026.13.01 10:00:00").normalized).toBeNull();
  });

  it("converts ONLY explicitly-offset input to UTC (evidence-based)", () => {
    const result = normalizeTimestamp("2026-01-05T09:30:00+02:00");
    expect(result.normalized).toBe("2026-01-05T07:30:00Z");
    expect(result.warnings).not.toContain(TIMEZONE_UNKNOWN_WARNING);
    const zulu = normalizeTimestamp("2026-01-05T09:30:00Z");
    expect(zulu.normalized).toBe("2026-01-05T09:30:00Z");
  });
});

// ── Direction (shared vocabulary) ────────────────────────────────────────────

describe("normalizeDirection", () => {
  it("maps buy/sell/b/s/long/short", () => {
    expect(normalizeDirection("BUY")).toBe("BUY");
    expect(normalizeDirection("sell")).toBe("SELL");
    expect(normalizeDirection("b")).toBe("BUY");
    expect(normalizeDirection("Short")).toBe("SELL");
    expect(normalizeDirection("hold")).toBeNull();
  });
});

// ── Confidence banding (§17) ─────────────────────────────────────────────────

describe("confidenceBand (§17 heuristic bands)", () => {
  it("bands the numeric signal", () => {
    expect(confidenceBand(0.97)).toBe("HIGH");
    expect(confidenceBand(0.7)).toBe("MEDIUM");
    expect(confidenceBand(0.4)).toBe("LOW");
    expect(confidenceBand(0.1)).toBe("UNKNOWN");
    expect(confidenceBand(Number.NaN)).toBe("UNKNOWN");
  });
});

// ── Domain validation (§19) ──────────────────────────────────────────────────

describe("applyDomainValidation (§19 rules fire only with both operands)", () => {
  it("marks non-positive volume/prices INVALID", () => {
    const fields = applyDomainValidation([
      field({ field: "volume", normalizedValue: "0" }),
      field({ field: "entryPrice", normalizedValue: "-1" }),
    ]);
    expect(fields.find((f) => f.field === "volume")?.validationStatus).toBe("INVALID");
    expect(fields.find((f) => f.field === "entryPrice")?.validationStatus).toBe("INVALID");
  });

  it("BUY with SL above entry → stopLoss INVALID, entry stays VALID (no whole-reject)", () => {
    const fields = applyDomainValidation([
      field({ field: "direction", normalizedValue: "BUY" }),
      field({ field: "entryPrice", normalizedValue: "2345.6" }),
      field({ field: "stopLoss", normalizedValue: "2400.0" }),
      field({ field: "takeProfit", normalizedValue: "2400.0" }),
    ]);
    expect(fields.find((f) => f.field === "entryPrice")?.validationStatus).toBe("VALID");
    expect(fields.find((f) => f.field === "stopLoss")?.validationStatus).toBe("INVALID");
    expect(fields.find((f) => f.field === "takeProfit")?.validationStatus).toBe("VALID");
  });

  it("SELL coherence: SL must be above entry, TP below entry", () => {
    const fields = applyDomainValidation([
      field({ field: "direction", normalizedValue: "SELL" }),
      field({ field: "entryPrice", normalizedValue: "2345.6" }),
      field({ field: "stopLoss", normalizedValue: "2300.0" }),   // below entry → INVALID for SELL
      field({ field: "takeProfit", normalizedValue: "2400.0" }), // above entry → INVALID for SELL
    ]);
    expect(fields.find((f) => f.field === "stopLoss")?.validationStatus).toBe("INVALID");
    expect(fields.find((f) => f.field === "takeProfit")?.validationStatus).toBe("INVALID");
  });

  it("SELL coherent values stay VALID (SL above, TP below entry)", () => {
    const fields = applyDomainValidation([
      field({ field: "direction", normalizedValue: "SELL" }),
      field({ field: "entryPrice", normalizedValue: "2345.6" }),
      field({ field: "stopLoss", normalizedValue: "2400.0" }),
      field({ field: "takeProfit", normalizedValue: "2200.0" }),
    ]);
    expect(fields.find((f) => f.field === "stopLoss")?.validationStatus).toBe("VALID");
    expect(fields.find((f) => f.field === "takeProfit")?.validationStatus).toBe("VALID");
  });

  it("missing SL never invalidates the entry (§19 optional fields)", () => {
    const fields = applyDomainValidation([
      field({ field: "direction", normalizedValue: "BUY" }),
      field({ field: "entryPrice", normalizedValue: "2345.6" }),
      field({ field: "stopLoss", normalizedValue: null, validationStatus: "MISSING" }),
    ]);
    expect(fields.find((f) => f.field === "entryPrice")?.validationStatus).toBe("VALID");
    expect(fields.find((f) => f.field === "stopLoss")?.validationStatus).toBe("MISSING");
  });

  it("profit may be negative (signed field)", () => {
    const fields = applyDomainValidation([field({ field: "profit", normalizedValue: "-123.45" })]);
    expect(fields.find((f) => f.field === "profit")?.validationStatus).toBe("VALID");
  });
});

// ── Corrections (§21 human-in-the-loop) ──────────────────────────────────────

describe("corrections (§21 user values become authoritative)", () => {
  it("overwrites the machine value with confidence 1 + USER_CORRECTED", () => {
    const { fields } = applyCorrections(
      [field({ normalizedValue: "2345.6" })],
      { entryPrice: "2340.00" },
    );
    const entry = fields.find((f) => f.field === "entryPrice");
    expect(entry?.normalizedValue).toBe("2340");
    expect(entry?.confidence).toBe(1);
    expect(entry?.confidenceBand).toBe("HIGH");
    expect(entry?.validationStatus).toBe("VALID");
    expect(entry?.warnings).toContain(USER_CORRECTED_WARNING);
  });

  it("can ADD a field the engine missed and CLEAR one with null", () => {
    const { fields } = applyCorrections(
      [field({ field: "entryPrice", normalizedValue: "2345.6" })],
      { symbol: "xauusd", stopLoss: null },
    );
    expect(fields.find((f) => f.field === "symbol")?.normalizedValue).toBe("XAUUSD");
    const sl = fields.find((f) => f.field === "stopLoss");
    expect(sl?.normalizedValue).toBeNull();
    expect(sl?.validationStatus).toBe("MISSING");
  });

  it("re-validates coherence after correction (BUY SL above entry → INVALID)", () => {
    const { fields } = applyCorrections(
      [
        field({ field: "direction", normalizedValue: "BUY" }),
        field({ field: "entryPrice", normalizedValue: "2345.6" }),
      ],
      { stopLoss: "2400.00" },
    );
    expect(fields.find((f) => f.field === "stopLoss")?.validationStatus).toBe("INVALID");
  });

  it("rejects invalid user values (never stored silently)", () => {
    expect(() => applyCorrections([], { entryPrice: "abc" })).toThrow(CorrectionError);
    expect(() => applyCorrections([], { direction: "sideways" })).toThrow(CorrectionError);
    expect(() => applyCorrections([], { symbol: "ab" })).toThrow(CorrectionError);
    expect(() => applyCorrections([], { openTime: "not a date" })).toThrow(CorrectionError);
    expect(() => applyCorrections([], { volume: "1.234" })).toThrow(CorrectionError); // ambiguous
  });

  it("validates one correction at a time through validateCorrection", () => {
    expect(validateCorrection("entryPrice", "2345.60")).toBe("2345.6");
    expect(validateCorrection("direction", "sell")).toBe("SELL");
    expect(validateCorrection("profit", "-1.2345")).toBe("-1.2345");
    expect(validateCorrection("closeTime", "2026.01.05 10:15:00")).toBe("2026-01-05T10:15:00");
    expect(validateCorrection("symbol", null)).toBeNull();
    expect(validateCorrection("volume", "  ")).toBeNull();
  });
});

// ── Idempotency (§32) ────────────────────────────────────────────────────────

describe("idempotency key derivation (§32)", () => {
  it("is deterministic and scope-separated", () => {
    const a = deriveIdempotencyKey("user-1", "cafebabe", "TRADE_SUMMARY", "2026.10.04");
    expect(a).toBe(deriveIdempotencyKey("user-1", "cafebabe", "TRADE_SUMMARY", "2026.10.04"));
    expect(a).not.toBe(deriveIdempotencyKey("user-2", "cafebabe", "TRADE_SUMMARY", "2026.10.04"));
    expect(a).not.toBe(deriveIdempotencyKey("user-1", "deadbeef", "TRADE_SUMMARY", "2026.10.04"));
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
