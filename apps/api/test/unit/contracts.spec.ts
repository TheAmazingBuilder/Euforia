/**
 * Contract-test harness (Phase 0 §Q "contract-test harness" deliverable).
 *
 * Proves the shared contract package is liftable into the backend verbatim
 * through the src/shared/contracts barrel — the same import surface future
 * bounded contexts will use for request/response validation.
 */
import { describe, expect, it } from "vitest";
import {
  COSMOZ_VERSION,
  decimalStringSchema,
  isoDateTimeSchema,
  dateKeySchema,
  uuidSchema,
} from "../../src/shared/contracts";

describe("shared contracts liftability", () => {
  it("exposes the shared version constant", () => {
    expect(typeof COSMOZ_VERSION).toBe("string");
    expect(COSMOZ_VERSION.length).toBeGreaterThan(0);
  });

  it("decimalStringSchema — money/prices are strings on the wire, never numbers", () => {
    expect(decimalStringSchema.safeParse("12.50000000").success).toBe(true);
    expect(decimalStringSchema.safeParse("-0.5").success).toBe(true);
    // A JS number must NEVER be accepted where a decimal string is required.
    expect(decimalStringSchema.safeParse(12.5).success).toBe(false);
    expect(decimalStringSchema.safeParse("NaN").success).toBe(false);
  });

  it("isoDateTimeSchema — UTC ISO-8601 with Z suffix is mandatory", () => {
    expect(isoDateTimeSchema.safeParse("2026-10-03T09:30:00Z").success).toBe(true);
    expect(isoDateTimeSchema.safeParse("2026-10-03T09:30:00+02:00").success).toBe(false);
    expect(isoDateTimeSchema.safeParse("2026-10-03").success).toBe(false);
  });

  it("dateKeySchema — calendar-validated YYYY-MM-DD", () => {
    expect(dateKeySchema.safeParse("2026-10-03").success).toBe(true);
    expect(dateKeySchema.safeParse("2026-13-40").success).toBe(false);
  });

  it("uuidSchema — stable identifier format", () => {
    expect(uuidSchema.safeParse("01890a5d-ac96-774b-bcce-b302099a8057").success).toBe(true);
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
