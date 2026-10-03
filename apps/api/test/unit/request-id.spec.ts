import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  resolveRequestId,
} from "../../src/shared/http/request-id";

describe("resolveRequestId", () => {
  it("reuses well-formed client-supplied ids", () => {
    const id = "01890a5d-ac96-774b-bcce-b302099a8057";
    expect(resolveRequestId(id)).toBe(id);
    expect(resolveRequestId("req-abc-123_XYZ")).toBe("req-abc-123_XYZ");
  });

  it("accepts a single-element array header value when valid", () => {
    expect(resolveRequestId(["req-abc-12345"])).toBe("req-abc-12345");
  });

  it("regenerates when the id format is unsafe", () => {
    const generated = resolveRequestId("bad id with spaces");
    expect(generated).not.toBe("bad id with spaces");
    expect(REQUEST_ID_PATTERN.test(generated)).toBe(true);

    // Header injection attempts.
    expect(resolveRequestId("id\r\nX-Evil: 1")).not.toContain("X-Evil");
    expect(resolveRequestId(["a", "b"])).toMatch(REQUEST_ID_PATTERN);
  });

  it("regenerates when nothing usable is supplied", () => {
    const generated = resolveRequestId(undefined);
    expect(REQUEST_ID_PATTERN.test(generated)).toBe(true);
    expect(resolveRequestId(null)).toMatch(REQUEST_ID_PATTERN);
  });

  it("enforces the documented length/format bounds", () => {
    expect(REQUEST_ID_PATTERN.test("short")).toBe(false); // < 8 chars
    expect(REQUEST_ID_PATTERN.test("a".repeat(65))).toBe(false); // > 64 chars
    expect(REQUEST_ID_PATTERN.test("a".repeat(64))).toBe(true);
    expect(REQUEST_ID_PATTERN.test("has.dot")).toBe(false);
  });

  it("uses the injected generator (deterministic test)", () => {
    expect(resolveRequestId(undefined, () => "fixed-generator-id")).toBe(
      "fixed-generator-id",
    );
    void randomUUID;
  });

  it("exports the canonical header name", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });
});
