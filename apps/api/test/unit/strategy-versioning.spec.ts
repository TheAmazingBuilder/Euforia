/**
 * Strategy versioning unit tests (Phase 7 §17) - the freeze-before-mutation
 * semantics are the historical-integrity backbone (§70/§71) and are pure
 * domain logic: cheap to test exhaustively.
 */
import { describe, expect, it } from "vitest";

import {
  STRATEGY_DEFINITION_FIELDS,
  touchesDefinition,
} from "../../src/modules/playbook/domain/strategy-versioning";

describe("strategy versioning (§17 freeze-before-mutation)", () => {
  it("freezes when ANY definition field is touched", () => {
    for (const field of STRATEGY_DEFINITION_FIELDS) {
      expect(
        touchesDefinition({ [field]: null }),
        `field ${field} must freeze a version`,
      ).toBe(true);
    }
  });

  it("freezes only once for mixed patches", () => {
    expect(
      touchesDefinition({ name: "x", status: "ACTIVE", risk: { minRR: 2 } }),
    ).toBe(true);
  });

  it("does NOT freeze for lifecycle/presentation mutations", () => {
    expect(touchesDefinition({})).toBe(false);
    expect(touchesDefinition({ name: "Renamed" })).toBe(false);
    expect(touchesDefinition({ status: "RETIRED" })).toBe(false);
    expect(touchesDefinition({ grade: "A" })).toBe(false);
    expect(touchesDefinition({ color: "#ff0000" })).toBe(false);
  });

  it("treats explicit null as a definition mutation (clearing content)", () => {
    expect(touchesDefinition({ description: null })).toBe(true);
    expect(touchesDefinition({ risk: null })).toBe(true);
  });

  it("ignores fields outside the definition set entirely", () => {
    expect(touchesDefinition({ userId: "x", version: 9, bogus: 1 })).toBe(false);
  });

  it("defines exactly the 13 product definition fields", () => {
    expect(STRATEGY_DEFINITION_FIELDS).toHaveLength(13);
  });
});
