import { describe, expect, it } from "vitest";
import { queryKeys, tradeMutationInvalidations } from "@/lib/api/keys";

/**
 * Phase 09 - data-freshness contract. Every root that derives from trade
 * data MUST be invalidated by a single-trade mutation (create / edit /
 * close / decision / delete). The analytics-suite root was the audit's #1
 * finding: bulk-tag and CSV-import invalidated it, the single-trade path
 * did not - comparison widgets kept pre-mutation aggregates forever.
 *
 * This spec pins the bundle: adding a derived dataset later WITHOUT adding
 * its root here now fails this test instead of shipping stale aggregates.
 */
describe("tradeMutationInvalidations - freshness contract", () => {
  it("invalidates every trade-derived root", () => {
    expect(tradeMutationInvalidations).toContain(queryKeys.tradesRoot);
    expect(tradeMutationInvalidations).toContain(queryKeys.rulesStatusRoot);
    expect(tradeMutationInvalidations).toContain(queryKeys.alerts);
    expect(tradeMutationInvalidations).toContain(queryKeys.statsOverview);
    expect(tradeMutationInvalidations).toContain(queryKeys.sessionTimeline);
    // Phase 09: derived aggregates (dashboard comparison widgets + the
    // Analytics page cache) refresh after single-trade mutations too.
    expect(tradeMutationInvalidations).toContain(queryKeys.analyticsSuiteRoot);
  });

  it("stays prefix-based (roots, not leaf keys) so new params inherit freshness", () => {
    for (const key of tradeMutationInvalidations) {
      expect(Array.isArray(key)).toBe(true);
      expect(key.length).toBe(1); // a single root segment = prefix invalidation
    }
  });

  it("keeps the suite key parametrized by the full filter string (stale responses cannot cross keys)", () => {
    const a = queryKeys.analyticsSuite("period=ALL&sims=50");
    const b = queryKeys.analyticsSuite("period=THIS_MONTH&sims=50");
    expect(a).not.toEqual(b);
    expect(a[0]).toBe(b[0]); // same root → one invalidation covers every filter set
  });
});
