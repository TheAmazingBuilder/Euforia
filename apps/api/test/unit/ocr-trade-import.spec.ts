/**
 * Unit — OCR → Trade import mapping (Phase 21): pure eligibility + input
 * building for the confirmation bridge (§72/§76/§77). No Nest, no DB, no
 * clock — the same confirmed fields always produce the same trade input
 * (§94 determinism).
 */
import { describe, expect, it } from "vitest";
import {
  buildOcrTradeInput,
  resolveTradeImportValues,
  TRADE_IMPORT_SKIPPED_INCOMPLETE,
} from "../../src/modules/ocr/trade-import.logic";
import type { OcrExtractedField, OcrFieldKey } from "../../src/shared/contracts";

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

/** A complete, coherent confirmed MT5-style field set (closed trade). */
function completeFields(overrides: Partial<Record<OcrFieldKey, OcrExtractedField>> = {}): OcrExtractedField[] {
  const base: Record<OcrFieldKey, OcrExtractedField> = {
    symbol: field({ field: "symbol", normalizedValue: "XAUUSD" }),
    direction: field({ field: "direction", normalizedValue: "BUY" }),
    volume: field({ field: "volume", normalizedValue: "0.1" }),
    entryPrice: field({ field: "entryPrice", normalizedValue: "2345.6" }),
    stopLoss: field({ field: "stopLoss", normalizedValue: "2338.5" }),
    takeProfit: field({ field: "takeProfit", normalizedValue: "2360" }),
    exitPrice: field({ field: "exitPrice", normalizedValue: "2359.98" }),
    profit: field({ field: "profit", normalizedValue: "146.8" }),
    openTime: field({ field: "openTime", normalizedValue: "2026-10-04T09:31:22" }),
    closeTime: field({ field: "closeTime", normalizedValue: "2026-10-04T11:47:09" }),
  };
  return Object.values({ ...base, ...overrides });
}

// ── Eligibility (§76 "validate fields") ─────────────────────────────────────

describe("resolveTradeImportValues — eligibility", () => {
  it("accepts a complete confirmed field set", () => {
    const resolved = resolveTradeImportValues(completeFields());
    expect(resolved.eligible).toBe(true);
    if (resolved.eligible) {
      expect(resolved.values).toMatchObject({
        symbol: "XAUUSD",
        direction: "BUY",
        entryPrice: "2345.6",
        volume: "0.1",
      });
    }
  });

  it("rejects when a core field is missing (symbol)", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ symbol: field({ field: "symbol", normalizedValue: null, validationStatus: "MISSING" }) }),
    );
    expect(resolved).toEqual({ eligible: false, reason: TRADE_IMPORT_SKIPPED_INCOMPLETE });
  });

  it("rejects when volume is non-positive (hard import floor)", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ volume: field({ field: "volume", normalizedValue: "0" }) }),
    );
    expect(resolved).toEqual({ eligible: false, reason: TRADE_IMPORT_SKIPPED_INCOMPLETE });
  });

  it("rejects when direction is not BUY/SELL", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ direction: field({ field: "direction", normalizedValue: "LONG" }) }),
    );
    expect(resolved).toEqual({ eligible: false, reason: TRADE_IMPORT_SKIPPED_INCOMPLETE });
  });

  it("rejects when entryPrice is not a decimal", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ entryPrice: field({ field: "entryPrice", normalizedValue: "around 2345" }) }),
    );
    expect(resolved).toEqual({ eligible: false, reason: TRADE_IMPORT_SKIPPED_INCOMPLETE });
  });

  it("accepts LOW_CONFIDENCE core values (review layer already surfaced them)", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ volume: field({ field: "volume", normalizedValue: "0.1", validationStatus: "LOW_CONFIDENCE" }) }),
    );
    expect(resolved.eligible).toBe(true);
  });
});

// ── Input building (§77 — canonical capture path) ──────────────────────────

describe("buildOcrTradeInput", () => {
  const deps = {
    accountId: "00000000-0000-4000-8000-00000000a001",
    instrumentId: "00000000-0000-4000-8000-00000000b001",
    externalRef: "ocr:00000000-0000-4000-8000-00000000c001",
  };

  it("builds a CLOSED capture when both exit price and close time exist", () => {
    const resolved = resolveTradeImportValues(completeFields());
    if (!resolved.eligible) throw new Error("fixture must be eligible");
    const input = buildOcrTradeInput({ values: resolved.values, ...deps });
    expect(input).toMatchObject({
      variant: "closed",
      accountId: deps.accountId,
      instrumentId: deps.instrumentId,
      direction: "BUY",
      entryPrice: "2345.6",
      size: { mode: "quantity", quantity: "0.1" },
      initialStop: "2338.5",
      initialTP: "2360",
      exitPrice: "2359.98",
      exitAt: "2026-10-04T11:47:09",
      exitReason: "MANUAL",
      externalRef: deps.externalRef,
      source: "IMPORT",
      outOfPlaybook: true,
    });
    // Provenance rides in the notes (§82) — never a P&L override.
    expect(input.reason).toContain(deps.externalRef.replace("ocr:", "recognition "));
    expect(Object.keys(input)).not.toContain("profit");
  });

  it("builds an OPEN capture when the exit price is missing", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ exitPrice: field({ field: "exitPrice", normalizedValue: null, validationStatus: "MISSING" }) }),
    );
    if (!resolved.eligible) throw new Error("fixture must be eligible");
    const input = buildOcrTradeInput({ values: resolved.values, ...deps });
    expect(input.variant).toBe("open");
    if (input.variant === "open") {
      expect("exitPrice" in input).toBe(false);
      expect("exitAt" in input).toBe(false);
    }
  });

  it("builds an OPEN capture when only the close time is missing (§54 — nothing invented)", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ closeTime: field({ field: "closeTime", normalizedValue: null, validationStatus: "MISSING" }) }),
    );
    if (!resolved.eligible) throw new Error("fixture must be eligible");
    expect(buildOcrTradeInput({ values: resolved.values, ...deps }).variant).toBe("open");
  });

  it("omits entryAt when no open time exists — the capture path stamps it", () => {
    const resolved = resolveTradeImportValues(
      completeFields({ openTime: field({ field: "openTime", normalizedValue: null, validationStatus: "MISSING" }) }),
    );
    if (!resolved.eligible) throw new Error("fixture must be eligible");
    const input = buildOcrTradeInput({ values: resolved.values, ...deps });
    expect("entryAt" in input).toBe(false);
  });

  it("drops non-positive optional prices instead of fabricating trade facts", () => {
    const resolved = resolveTradeImportValues(
      completeFields({
        stopLoss: field({ field: "stopLoss", normalizedValue: "-1" }),
        exitPrice: field({ field: "exitPrice", normalizedValue: "0" }),
      }),
    );
    if (!resolved.eligible) throw new Error("fixture must be eligible");
    const input = buildOcrTradeInput({ values: resolved.values, ...deps });
    expect(input.variant).toBe("open"); // exit price 0 is unusable
    expect(input.initialStop).toBeUndefined();
    expect(input.initialTP).toBe("2360");
  });
});
