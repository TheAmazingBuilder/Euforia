/**
 * Unit - Phase 05 deterministic insights engine (@cosmoz/shared
 * analytics/insights). Every assertion pins ONE documented rule from the
 * owner spec (§3 analytics principles, §4 duration dimension, §5 directional
 * exclusion, §7 behavioral rules, §8 insight engine): sample suppression,
 * reliability bands, breakeven streak transparency, multi-currency money
 * nulls, determinism and dedupe. The engine is shared with the MSW mirror -
 * these rules therefore hold for the mock too.
 */
import { describe, expect, it } from "vitest";

import {
  AFTER_STREAK_MIN,
  INSIGHT_MIN_OBSERVATIONS,
  type InsightsEngineRow,
  computeDurations,
  computeStreakProfile,
  deriveInsights,
} from "../../src/shared/contracts";

let seq = 0;
function row(overrides: Partial<InsightsEngineRow> = {}): InsightsEngineRow {
  seq += 1;
  const base: InsightsEngineRow = {
    id: `t${seq}`,
    instrumentSymbol: "EURUSD",
    assetClass: "forex",
    strategyId: "s1",
    direction: "BUY",
    tradingDate: "2026-01-10",
    entryAtMs: Date.UTC(2026, 0, 10, 10, 0),
    exitAtMs: Date.UTC(2026, 0, 10, 11, 0),
    pnlNet: 100,
    rMultiple: 1,
    riskMoney: 100,
  };
  return { ...base, ...overrides };
}

/** A losing trade 30 minutes after the previous exit (loss-following). */
function lossThenQuickEntry(rows: InsightsEngineRow[], loser: InsightsEngineRow, follower: InsightsEngineRow) {
  rows.push(loser);
  const exitMs = loser.exitAtMs ?? 0;
  rows.push({ ...follower, entryAtMs: exitMs + 30 * 60_000 });
}

describe("computeDurations (§4 duration dimension)", () => {
  it("buckets trades by holding time and keeps bucket boundaries inclusive", () => {
    const rows = [
      row({ exitAtMs: Date.UTC(2026, 0, 10, 10, 15) }), // exactly 15 min → ≤15m
      row({ exitAtMs: Date.UTC(2026, 0, 10, 11, 0) }), // 60 min → 15–60m
      row({ exitAtMs: Date.UTC(2026, 0, 10, 14, 0) }), // 4 h → 1–4h
      row({ entryAtMs: Date.UTC(2026, 0, 10, 10, 0), exitAtMs: Date.UTC(2026, 0, 11, 10, 0) }), // 24h → 4–24h
    ];
    const durations = computeDurations(rows, true);
    expect(durations.buckets.map((b) => b.trades)).toEqual([1, 1, 1, 1, 0, 0]);
    expect(durations.excludedMissingTimestamp).toBe(0);
    expect(durations.buckets[0]!.winRate).toBe("1");
  });

  it("counts trades without an exit timestamp as excluded, never hides them", () => {
    const rows = [row({ exitAtMs: null }), row({ exitAtMs: null }), row()];
    const durations = computeDurations(rows, true);
    expect(durations.excludedMissingTimestamp).toBe(2);
    expect(durations.buckets.reduce((sum, b) => sum + b.trades, 0)).toBe(1);
  });

  it("nulls money under multi-currency while R and rates survive (§3/§11)", () => {
    const rows = [row({ pnlNet: -200, rMultiple: -2 }), row(), row()]; // default 60-min holds → 15–60m bucket
    const durations = computeDurations(rows, false);
    expect(durations.buckets[1]!.netPnl).toBeNull();
    expect(durations.buckets[1]!.avgR).not.toBeNull();
    expect(durations.buckets[1]!.winRate).not.toBeNull();
  });

  it("zero gross losses in a bucket → avgR still computed, winRate honest 0", () => {
    const rows = [row({ pnlNet: -100, rMultiple: -1 }), row({ pnlNet: -50, rMultiple: -0.5 })]; // both 60-min holds
    const durations = computeDurations(rows, true);
    expect(durations.buckets[1]!.winRate).toBe("0");
    expect(durations.buckets[1]!.netPnl).toBe("-150");
  });
});

describe("computeStreakProfile (§7D)", () => {
  it("breakeven trades neither extend nor break a loss streak (documented rule)", () => {
    const rows = [
      row({ pnlNet: -100, rMultiple: -1 }),
      row({ pnlNet: 0, rMultiple: 0 }), // breakeven - transparent
      row({ pnlNet: -50, rMultiple: -0.5 }),
    ];
    const profile = computeStreakProfile(rows);
    expect(profile.currentLossStreak).toBe(2);
    expect(profile.longestLossStreak).toBe(2);
  });

  it("a win closes the streak; the trailing streak ships as current", () => {
    const rows = [
      row({ pnlNet: -100, rMultiple: -1 }),
      row({ pnlNet: -100, rMultiple: -1 }),
      row({ pnlNet: -100, rMultiple: -1 }),
      row({ pnlNet: 100, rMultiple: 1 }),
    ];
    const profile = computeStreakProfile(rows);
    expect(profile.currentLossStreak).toBe(0);
    expect(profile.currentWinStreak).toBe(1);
    expect(profile.longestLossStreak).toBe(3);
    expect(profile.distribution).toEqual([{ length: 3, occurrences: 1 }]);
  });

  it("follow-window performance after ≥3-loss streaks dedupes overlapping windows", () => {
    const rows: InsightsEngineRow[] = [];
    // Streak of 3 losses, then 3 followers, then another 3-loss streak ending
    // one trade later - overlapping windows must count each trade once.
    rows.push(row({ pnlNet: -100, rMultiple: -1 }));
    rows.push(row({ pnlNet: -100, rMultiple: -1 }));
    rows.push(row({ pnlNet: -100, rMultiple: -1 }));
    rows.push(row({ pnlNet: 200, rMultiple: 2 })); // follower
    rows.push(row({ pnlNet: 150, rMultiple: 1.5 })); // follower
    rows.push(row({ pnlNet: -20, rMultiple: -0.2 })); // follower (also next streak start)
    rows.push(row({ pnlNet: -10, rMultiple: -0.1 }));
    rows.push(row({ pnlNet: -5, rMultiple: -0.05 }));
    const profile = computeStreakProfile(rows);
    expect(profile.afterStreak.minStreak).toBe(AFTER_STREAK_MIN);
    // Follow indices: first streak ends at index 2 → 3,4,5; second streak ends
    // at index 7 (trailing) → no followers left. Unique = 3 trades.
    expect(profile.afterStreak.trades).toBe(3);
    expect(profile.afterStreak.winRate).toBe("0.67"); // 2 wins / 3
    expect(profile.afterStreak.avgR).toBe("1.1"); // (2 + 1.5 − 0.2) / 3
  });

  it("empty scope → zeroed profile with null average, never fabricated numbers", () => {
    const profile = computeStreakProfile([]);
    expect(profile.currentLossStreak).toBe(0);
    expect(profile.longestLossStreak).toBe(0);
    expect(profile.averageLossStreak).toBeNull();
    expect(profile.distribution).toEqual([]);
    expect(profile.afterStreak.trades).toBe(0);
    expect(profile.afterStreak.winRate).toBeNull();
  });
});

describe("deriveInsights (§7/§8)", () => {
  it("suppresses findings below the minimum sample per compared group", () => {
    const rows = Array.from({ length: INSIGHT_MIN_OBSERVATIONS - 1 }, () =>
      row({ direction: "BUY", pnlNet: 100, rMultiple: 1 }),
    ).concat(
      Array.from({ length: 30 }, () => row({ direction: "SELL", pnlNet: -100, rMultiple: -1 })),
    );
    const insights = deriveInsights(rows, { singleCurrency: true });
    expect(insights.insights.find((i) => i.category === "DIRECTIONAL")).toBeUndefined();
  });

  it("emits a directional finding with observation counts and a reliability band", () => {
    const rows = [
      ...Array.from({ length: 12 }, () => row({ direction: "BUY", pnlNet: 100, rMultiple: 1.2 })),
      ...Array.from({ length: 10 }, () => row({ direction: "SELL", pnlNet: -80, rMultiple: -0.8 })),
    ];
    const insights = deriveInsights(rows, { singleCurrency: true });
    const directional = insights.insights.find((i) => i.category === "DIRECTIONAL");
    expect(directional).toBeDefined();
    expect(directional!.observations).toBe(10);
    expect(directional!.reliability).toBe("EARLY_OBSERVATION"); // < 20
    expect(directional!.metrics.some((m) => m.label.includes("Long"))).toBe(true);
    expect(directional!.periodFrom).toBe("2026-01-10");
    expect(directional!.periodTo).toBe("2026-01-10");
  });

  it("reliability bands follow the documented observation thresholds", () => {
    // 20–49 → REPEATED_PATTERN, ≥ 50 → STRONG_EVIDENCE (directional, min group).
    const rowsA = [
      ...Array.from({ length: 25 }, () => row({ direction: "BUY", pnlNet: 100, rMultiple: 1 })),
      ...Array.from({ length: 22 }, () => row({ direction: "SELL", pnlNet: -80, rMultiple: -0.8 })),
    ];
    expect(deriveInsights(rowsA, { singleCurrency: true }).insights.find((i) => i.category === "DIRECTIONAL")!.reliability).toBe("REPEATED_PATTERN");
    const rowsB = [
      ...Array.from({ length: 55 }, () => row({ direction: "BUY", pnlNet: 100, rMultiple: 1 })),
      ...Array.from({ length: 50 }, () => row({ direction: "SELL", pnlNet: -80, rMultiple: -0.8 })),
    ];
    expect(deriveInsights(rowsB, { singleCurrency: true }).insights.find((i) => i.category === "DIRECTIONAL")!.reliability).toBe("STRONG_EVIDENCE");
  });

  it("loss-following cluster is reported with neutral language and its window", () => {
    const rows: InsightsEngineRow[] = [];
    for (let i = 0; i < 8; i += 1) {
      const base = Date.UTC(2026, 0, 10 + i, 9, 0);
      lossThenQuickEntry(
        rows,
        row({ id: `L${i}`, pnlNet: -100, rMultiple: -1, entryAtMs: base, exitAtMs: base + 60 * 60_000, tradingDate: `2026-01-${String(10 + i).padStart(2, "0")}` }),
        row({ id: `F${i}`, pnlNet: -60, rMultiple: -0.6 }),
      );
    }
    // A block of well-performing "other" trades so the cluster is worse.
    for (let i = 0; i < 10; i += 1) {
      const base = Date.UTC(2026, 1, 1 + i, 9, 0);
      rows.push(row({ id: `O${i}`, pnlNet: 120, rMultiple: 1.2, entryAtMs: base, exitAtMs: base + 2 * 60 * 60_000, tradingDate: `2026-02-${String(1 + i).padStart(2, "0")}` }));
    }
    const insights = deriveInsights(rows, { singleCurrency: true });
    const finding = insights.insights.find((i) => i.category === "LOSS_FOLLOWING");
    expect(finding).toBeDefined();
    expect(finding!.description).toContain("not proof of revenge intent");
    expect(finding!.observations).toBe(8);
  });

  it("risk behavior is money-gated: null under multi-currency, computed in single currency", () => {
    const build = () => {
      const rows: InsightsEngineRow[] = [];
      for (let i = 0; i < 10; i += 1) {
        rows.push(row({ id: `w${i}`, pnlNet: 100, rMultiple: 1 }));
        rows.push(row({ id: `l${i}`, pnlNet: -100, rMultiple: -1 }));
        rows.push(row({ id: `r${i}`, pnlNet: -50, rMultiple: -0.5, riskMoney: 300 })); // risk up after loss
      }
      return rows;
    };
    expect(deriveInsights(build(), { singleCurrency: false }).insights.find((i) => i.category === "RISK_BEHAVIOR")).toBeUndefined();
    const risk = deriveInsights(build(), { singleCurrency: true }).insights.find((i) => i.category === "RISK_BEHAVIOR");
    expect(risk).toBeDefined();
    expect(risk!.metrics.find((m) => m.kind === "MONEY")).toBeDefined();
  });

  it("deterioration compares equal chronological halves and discloses both sample sizes", () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => row({ id: `g${i}`, pnlNet: 100, rMultiple: 1.2 })),
      ...Array.from({ length: 15 }, (_, i) => row({ id: `b${i}`, pnlNet: -100, rMultiple: -0.9 })),
    ];
    const insights = deriveInsights(rows, { singleCurrency: true });
    const finding = insights.insights.find((i) => i.category === "DETERIORATION");
    expect(finding).toBeDefined();
    expect(finding!.metrics.some((m) => m.label === "Second-half trades" && m.value === 15)).toBe(true);
  });

  it("is deterministic: identical input → identical output order and ids", () => {
    const build = () => {
      const rows: InsightsEngineRow[] = [];
      for (let i = 0; i < 30; i += 1) {
        rows.push(
          row({
            id: `d${i}`,
            direction: i % 2 === 0 ? "BUY" : "SELL",
            pnlNet: i % 3 === 0 ? -100 : 100,
            rMultiple: i % 3 === 0 ? -1 : 0.8,
            tradingDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
          }),
        );
      }
      return rows;
    };
    const a = deriveInsights(build(), { singleCurrency: true });
    const b = deriveInsights(build(), { singleCurrency: true });
    expect(a).toEqual(b);
    const ids = a.insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // dedupe: one insight per category
  });

  it("ships the methodology rules with the payload (transparency, spec §8)", () => {
    const insights = deriveInsights([row()], { singleCurrency: true });
    expect(insights.methodology.length).toBeGreaterThanOrEqual(5);
    expect(insights.methodology.some((line) => line.includes("NOT statistical confidence"))).toBe(true);
    expect(insights.insights.find((i) => i.category === "STREAK")).toBeUndefined(); // 1 trade, no streak
  });

  it("active loss streak of ≥3 ships as a STREAK fact with follow-window evidence", () => {
    const rows = [
      row({ id: "l1", pnlNet: -100, rMultiple: -1 }),
      row({ id: "l2", pnlNet: -100, rMultiple: -1 }),
      row({ id: "l3", pnlNet: -100, rMultiple: -1 }), // qualifying streak ends here
      row({ id: "f1", pnlNet: 50, rMultiple: 0.5 }), // follow window
      row({ id: "f2", pnlNet: -30, rMultiple: -0.3 }), // follow window
      row({ id: "t1", pnlNet: -100, rMultiple: -1 }), // new ACTIVE streak (trailing)
      row({ id: "t2", pnlNet: -100, rMultiple: -1 }),
      row({ id: "t3", pnlNet: -100, rMultiple: -1 }),
      row({ id: "t4", pnlNet: -100, rMultiple: -1 }),
    ];
    const streak = deriveInsights(rows, { singleCurrency: true }).insights.find((i) => i.category === "STREAK");
    expect(streak).toBeDefined();
    // f2 (−0.3R) is itself a loss - trailing streak = f2..t4 = 5 consecutive.
    expect(streak!.title).toContain("5 trades");
    expect(streak!.metrics.some((m) => m.label.includes("after"))).toBe(true);
  });
});
