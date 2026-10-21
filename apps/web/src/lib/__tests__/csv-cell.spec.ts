import { describe, expect, it } from "vitest";

import { csvCell } from "@cosmoz/shared";

/**
 * Phase 12 regression — ONE shared CSV cell definition for every
 * client-side export (trades ledger, analytics suite, monitoring ledger).
 *
 * Contract under test (packages/shared/src/utils/csv.ts):
 *   1. STRUCTURE — RFC 4180 escaping (comma / quote / newline wrap).
 *   2. FORMULA INJECTION — leading =, +, -, @, TAB, CR on non-numeric text
 *      gets the standard single-quote prefix; plain numbers ("-50") are
 *      NEVER touched (server-computed financial strings stay legitimate).
 */
describe("csvCell (shared CSV export definition)", () => {
  it("renders empty for null / undefined / empty string", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
  });

  it("passes plain values through untouched", () => {
    expect(csvCell("XAUUSD")).toBe("XAUUSD");
    expect(csvCell("2026-10-19")).toBe("2026-10-19");
    expect(csvCell("A grade")).toBe("A grade");
  });

  it("escapes commas with structural quotes", () => {
    expect(csvCell("win, loss")).toBe("\"win, loss\"");
  });

  it("doubles inner quotes and wraps", () => {
    expect(csvCell('say "hi"')).toBe("\"say \"\"hi\"\"\"");
  });

  it("escapes embedded newlines and carriage returns", () => {
    expect(csvCell("line1\nline2")).toBe("\"line1\nline2\"");
    expect(csvCell("line1\r\nline2")).toBe("\"line1\r\nline2\"");
  });

  // ── Formula injection guard ──────────────────────────────────────────────
  it("prefixes formula-leading text with a single quote", () => {
    expect(csvCell("=SUM(A1:A9)"))
      .toBe("'=SUM(A1:A9)");
    // Guard + structural escape compose: the payload contains quotes, so the
    // guarded cell is ALSO wrapped and inner quotes doubled (RFC 4180).
    expect(csvCell("=HYPERLINK(\"http://evil\")"))
      .toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1+cmd|'/C calc'!A0"))
      .toBe("'+1+cmd|'/C calc'!A0");
    expect(csvCell("@SUM(1)"))
      .toBe("'@SUM(1)");
  });

  it("prefixes tab- and CR-leading text (DDE payloads)", () => {
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    // The guard's leading CR would break an unquoted field — structural
    // wrapping applies to the guarded value (RFC 4180).
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
  });

  it("NEVER touches plain numeric strings — negative financial values stay intact", () => {
    expect(csvCell("-50")).toBe("-50");
    expect(csvCell("-1.5")).toBe("-1.5");
    expect(csvCell("50")).toBe("50");
    expect(csvCell("0")).toBe("0");
    expect(csvCell(-50)).toBe("-50");
    expect(csvCell(-1.5)).toBe("-1.5");
  });

  it("guards text that merely begins with a minus but is not a number", () => {
    expect(csvCell("- risky entry")).toBe("'- risky entry");
  });

  it("renders numbers via String() (no scientific surprises for integers)", () => {
    expect(csvCell(1234.5)).toBe("1234.5");
  });
});
