import { describe, expect, it } from "vitest";

import {
  loginInputSchema,
  registerInputSchema,
} from "@cosmoz/shared";
import {
  ocrCorrectionRecordSchema,
  recognizedTradeSchema,
} from "@cosmoz/shared";

/**
 * Zod 4 migration guards (3.25 -> 4.6.7, security advisory GHSA-mrhx-c7xc-m3w5).
 *
 * The migration switched enum-keyed records from z.record() to
 * z.partialRecord(): in Zod 4, z.record(enumKeys, value) enforces TOTAL
 * records (every enum key present) which silently inverted the v3 contract
 * these schemas shipped with - partial user corrections. These tests pin
 * the partial semantics so a future upgrade cannot reintroduce the break.
 */
describe("zod 4 migration - enum-keyed records stay partial", () => {
  it("accepts a partial OCR correction record (user corrected one field)", () => {
    const result = ocrCorrectionRecordSchema.safeParse({
      symbol: "EURUSD",
    });
    expect(result.success).toBe(true);
  });

  it("still rejects unknown keys in corrections", () => {
    const result = ocrCorrectionRecordSchema.safeParse({
      notAField: "x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts nullable correction values (clearing a field)", () => {
    const result = ocrCorrectionRecordSchema.safeParse({
      symbol: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a recognized trade with a partial field map", () => {
    const result = recognizedTradeSchema.safeParse({
      index: 1,
      fields: {
        symbol: {
          key: "symbol",
          value: "XAUUSD",
          state: "FOUND",
          confidence: 92,
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("zod 4 migration - auth contracts unchanged", () => {
  it("register input validates the documented shape", () => {
    const result = registerInputSchema.safeParse({
      name: "Alex Moreau",
      email: "alex@example.com",
      password: "correct horse battery",
    });
    expect(result.success).toBe(true);
  });

  it("register rejects a short password with a field error", () => {
    const result = registerInputSchema.safeParse({
      name: "Alex",
      email: "alex@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path[0]).toBe("password");
    }
  });

  it("login input validates", () => {
    const result = loginInputSchema.safeParse({
      email: "alex@example.com",
      password: "secret",
      remember: true,
    });
    expect(result.success).toBe(true);
  });
});
