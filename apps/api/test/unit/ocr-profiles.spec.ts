/**
 * Unit - Account & Chart profile logic (Recognition V1.1): per-profile
 * required-field floors, chart quote geometry, account decimal semantics,
 * PROFILE_TYPE_MISMATCH derivation. Pure ocr.logic vectors (no DB, no app).
 */
import { describe, expect, it } from "vitest";

import {
  applyDomainValidation,
  computeQualityScore,
  deriveRecognitionIssues,
} from "../../src/modules/ocr/ocr.logic";
import type { OcrExtractedField } from "../../src/shared/contracts";

function field(
  key: string,
  value: string | null,
  overrides: Partial<OcrExtractedField> = {},
): OcrExtractedField {
  return {
    field: key as OcrExtractedField["field"],
    rawValue: value,
    normalizedValue: value,
    confidence: 0.95,
    confidenceBand: "HIGH",
    validationStatus: value === null ? "MISSING" : "VALID",
    sourceRegion: null,
    warnings: [],
    ...overrides,
  };
}

describe("chart quote geometry (domain validation)", () => {
  it("high below open invalidates the high", () => {
    const fields = applyDomainValidation([
      field("chartOpen", "100.5"),
      field("chartHigh", "99.0"),
      field("chartClose", "100.1"),
    ]);
    const high = fields.find((f) => f.field === "chartHigh")!;
    expect(high.validationStatus).toBe("INVALID");
  });

  it("price outside the low..high range invalidates the price", () => {
    const fields = applyDomainValidation([
      field("chartLow", "100.0"),
      field("chartHigh", "101.0"),
      field("chartPrice", "102.0"),
    ]);
    const price = fields.find((f) => f.field === "chartPrice")!;
    expect(price.validationStatus).toBe("INVALID");
  });

  it("a coherent quote stays valid", () => {
    const fields = applyDomainValidation([
      field("chartOpen", "100.0"),
      field("chartHigh", "101.0"),
      field("chartLow", "99.0"),
      field("chartClose", "100.5"),
      field("chartPrice", "100.5"),
    ]);
    for (const f of fields) {
      expect(f.validationStatus).toBe("VALID");
    }
  });

  it("a single operand never invalidates (§19)", () => {
    const fields = applyDomainValidation([field("chartHigh", "99.0")]);
    expect(fields[0]!.validationStatus).toBe("VALID");
  });
});

describe("account decimals (correction semantics)", () => {
  it("a negative balance stays VALID - a blown account is a truthful snapshot", () => {
    const fields = applyDomainValidation([field("accountBalance", "-5.00")]);
    expect(fields[0]!.validationStatus).toBe("VALID");
  });

  it("margin level accepts finite decimals of any sign", () => {
    const fields = applyDomainValidation([field("accountMarginLevel", "0.00")]);
    expect(fields[0]!.validationStatus).toBe("VALID");
  });
});

describe("per-profile issues + quality", () => {
  it("ACCOUNT floor: missing balance/equity/currency raise MISSING_REQUIRED_FIELD", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("accountLogin", "5102083990"), field("accountBalance", null)],
      classification: { type: "ACCOUNT_SUMMARY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: false,
      profile: "ACCOUNT_POSITION",
    });
    const missing = issues.filter((i) => i.code === "MISSING_REQUIRED_FIELD").map((i) => i.field);
    expect(missing).toContain("accountBalance");
    expect(missing).toContain("accountEquity");
    expect(missing).toContain("accountCurrency");
    expect(missing).not.toContain("accountLogin");
  });

  it("CHART floor: missing timeframe/close raise the issue, chartRsi does not", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("chartRsi", null), field("chartTimeframe", null), field("chartClose", null)],
      classification: { type: "CHART", confidence: 0.9, alternatives: [], platform: "TRADINGVIEW" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: false,
      profile: "CHART_ANALYSIS",
    });
    const missing = issues.filter((i) => i.code === "MISSING_REQUIRED_FIELD").map((i) => i.field);
    expect(missing).toEqual(["chartTimeframe", "chartClose"]);
  });

  it("a chart type on an ACCOUNT run derives PROFILE_TYPE_MISMATCH", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("accountBalance", "100.0")],
      classification: { type: "CHART", confidence: 0.9, alternatives: [], platform: "TRADINGVIEW" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: false,
      profile: "ACCOUNT_POSITION",
    });
    expect(issues.some((i) => i.code === "PROFILE_TYPE_MISMATCH")).toBe(true);
  });

  it("an account type on the matching profile derives no mismatch", () => {
    const issues = deriveRecognitionIssues({
      fields: [field("accountBalance", "100.0")],
      classification: { type: "ACCOUNT_SUMMARY", confidence: 0.9, alternatives: [], platform: "MT5" },
      duplicateOf: null,
      possibleTradeDuplicate: null,
      symbolInCatalog: false,
      profile: "ACCOUNT_POSITION",
    });
    expect(issues.some((i) => i.code === "PROFILE_TYPE_MISMATCH")).toBe(false);
  });

  it("completeness is scoped by the profile floor", () => {
    const score = computeQualityScore({
      fields: [field("chartTimeframe", "H1"), field("chartClose", "2348.9")],
      classification: { type: "CHART", confidence: 0.9, alternatives: [], platform: "TRADINGVIEW" },
      duplicateOf: null,
      profile: "CHART_ANALYSIS",
    });
    expect(score).not.toBeNull();
    expect(score!.components.completeness).toBe(1);
  });
});
