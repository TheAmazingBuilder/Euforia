/**
 * Strategy completeness-health unit tests (Phase 7 - product §20 flags).
 * Factual indicators only - no profitability judgment ever (§82).
 */
import { describe, expect, it } from "vitest";

import { computeStrategyHealth } from "../../src/modules/playbook/domain/strategy-health";

function base(overrides: Partial<Parameters<typeof computeStrategyHealth>[0]> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "ACTIVE",
    entryRules: null,
    entryConditions: [],
    invalidations: [],
    risk: null,
    ...overrides,
  };
}

describe("strategy health flags", () => {
  it("echoes lifecycle state (DRAFT → flag, RETIRED → ARCHIVED flag)", () => {
    const usage = { lastTradeAt: new Date() };
    expect(computeStrategyHealth(base({ status: "DRAFT" }), usage, true, true)).toContain("DRAFT");
    expect(computeStrategyHealth(base({ status: "RETIRED" }), usage, true, true)).toContain(
      "ARCHIVED",
    );
    expect(
      computeStrategyHealth(base({ status: "ACTIVE" }), usage, true, true),
    ).not.toContain("DRAFT");
  });

  it("flags NO_RECENT_TRADES when usage is missing or stale (> 30 days)", () => {
    expect(computeStrategyHealth(base(), undefined, true, true)).toContain("NO_RECENT_TRADES");
    const stale = { lastTradeAt: new Date(Date.now() - 31 * 86_400_000) };
    expect(computeStrategyHealth(base(), stale, true, true)).toContain("NO_RECENT_TRADES");
    const recent = { lastTradeAt: new Date(Date.now() - 2 * 86_400_000) };
    expect(
      computeStrategyHealth(base(), recent, true, true),
    ).not.toContain("NO_RECENT_TRADES");
  });

  it("flags MISSING_RISK when the risk frame is null or every field null", () => {
    expect(computeStrategyHealth(base(), undefined, true, true)).toContain("MISSING_RISK");
    const empty = { defaultRiskPct: null, maxRiskPct: null, fixedRiskAmount: null };
    expect(computeStrategyHealth(base({ risk: empty }), undefined, true, true)).toContain(
      "MISSING_RISK",
    );
    const present = { ...empty, defaultRiskPct: 1 };
    expect(
      computeStrategyHealth(base({ risk: present }), undefined, true, true),
    ).not.toContain("MISSING_RISK");
  });

  it("flags MISSING_ENTRY_CONDITIONS only without BOTH structured and markdown entries", () => {
    expect(computeStrategyHealth(base(), undefined, true, true)).toContain(
      "MISSING_ENTRY_CONDITIONS",
    );
    expect(
      computeStrategyHealth(base({ entryRules: "Above the 400 EMA" }), undefined, true, true),
    ).not.toContain("MISSING_ENTRY_CONDITIONS");
    expect(
      computeStrategyHealth(
        base({ entryConditions: [{ id: "c1", category: "PRICE_ACTION", text: "x", group: null }] }),
        undefined,
        true,
        true,
      ),
    ).not.toContain("MISSING_ENTRY_CONDITIONS");
  });

  it("flags MISSING_INVALIDATION when no invalidation criteria exist", () => {
    expect(computeStrategyHealth(base(), undefined, true, true)).toContain("MISSING_INVALIDATION");
    expect(
      computeStrategyHealth(base({ invalidations: ["Body close back through"] }), undefined, true, true),
    ).not.toContain("MISSING_INVALIDATION");
  });

  it("flags MISSING_CHECKLIST without own AND global templates", () => {
    expect(computeStrategyHealth(base(), undefined, false, false)).toContain("MISSING_CHECKLIST");
    expect(computeStrategyHealth(base(), undefined, false, true)).not.toContain("MISSING_CHECKLIST");
    expect(computeStrategyHealth(base(), undefined, true, false)).not.toContain("MISSING_CHECKLIST");
  });
});
