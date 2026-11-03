/**
 * Unit - Analytics suite engine (Phase 8): the pure aggregation over a
 * synthetic normalized dataset. Every assertion pins ONE documented rule of
 * the shared contract (honest nulls, canonical ordering, deterministic
 * Monte Carlo, anomaly thresholds) so regressions change the chart, not the
 * test.
 */
import { describe, expect, it } from "vitest";
import type { AnalyticsFilters } from "../../src/shared/contracts";
import type { AnalyticsTradeRow } from "../../src/modules/analytics/domain/analytics-input";
import { computeAnalyticsSuite, type SuiteEnvironment } from "../../src/modules/analytics/domain/analytics-suite";

const ALL: AnalyticsFilters = { period: "ALL" };

function trade(overrides: Partial<AnalyticsTradeRow> & { id: string }): AnalyticsTradeRow {
  return {
    accountId: "a1",
    symbol: "EURUSD",
    instrumentId: "instr-1",
    instrumentSymbol: "EURUSD",
    assetClass: "FOREX",
    quoteCurrency: null,
    direction: "BUY",
    exitReason: "TP",
    entryAtIso: "2026-03-02T09:30:00.000Z",
    exitAtIso: "2026-03-02T12:00:00.000Z",
    entryAtMs: Date.parse("2026-03-02T09:30:00.000Z"),
    exitAtMs: Date.parse("2026-03-02T12:00:00.000Z"),
    tradingDate: "2026-03-02",
    pnlNet: 0,
    rMultiple: 0,
    riskMoney: null,
    riskAmountRaw: null,
    rMultipleRaw: null,
    plannedRR: null,
    followedPlan: null,
    strategyId: null,
    ...overrides,
  };
}

const ACCOUNT_USD = { id: "a1", name: "Main", currency: "USD", startingBalance: 10_000, isDefault: true };

function env(
  trades: AnalyticsTradeRow[],
  accounts = [ACCOUNT_USD],
  openTradeCount = 0,
  calendarEvents: SuiteEnvironment["calendarEvents"] = [],
): SuiteEnvironment {
  return {
    trades,
    accounts,
    strategyNames: { "s-1": "London Breakout" },
    todayKey: "2026-10-07",
    openTradeCount,
    calendarEvents,
  };
}

/** A canonical 4-trade dataset: 2 wins, 1 loss, 1 breakeven. */
function baseDataset(): AnalyticsTradeRow[] {
  return [
    trade({ id: "t1", rMultiple: 2.5, rMultipleRaw: "2.5", pnlNet: 500, riskMoney: 200, riskAmountRaw: "200" }),
    trade({
      id: "t2",
      rMultiple: -2,
      rMultipleRaw: "-2",
      pnlNet: -400,
      riskMoney: 200,
      riskAmountRaw: "200",
      tradingDate: "2026-03-03",
      entryAtIso: "2026-03-03T09:30:00.000Z",
      exitAtIso: "2026-03-03T11:00:00.000Z",
      entryAtMs: Date.parse("2026-03-03T09:30:00.000Z"),
      exitAtMs: Date.parse("2026-03-03T11:00:00.000Z"),
    }),
    trade({
      id: "t3",
      rMultiple: 0,
      pnlNet: 0,
      riskMoney: 200,
      riskAmountRaw: "200",
      tradingDate: "2026-03-04",
      entryAtIso: "2026-03-04T09:30:00.000Z",
      exitAtIso: "2026-03-04T13:30:00.000Z",
      entryAtMs: Date.parse("2026-03-04T09:30:00.000Z"),
      exitAtMs: Date.parse("2026-03-04T13:30:00.000Z"),
    }),
    trade({
      id: "t4",
      rMultiple: 1.5,
      rMultipleRaw: "1.5",
      pnlNet: 300,
      riskMoney: 200,
      riskAmountRaw: "200",
      direction: "SELL",
      exitReason: "SL",
      tradingDate: "2026-03-05",
      entryAtIso: "2026-03-05T09:30:00.000Z",
      exitAtIso: "2026-03-05T10:15:00.000Z",
      entryAtMs: Date.parse("2026-03-05T09:30:00.000Z"),
      exitAtMs: Date.parse("2026-03-05T10:15:00.000Z"),
    }),
  ];
}

describe("summary block", () => {
  it("computes the canonical ratios on the 4-trade dataset", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.summary.trades).toBe(4);
    expect(suite.summary.winningTrades).toBe(2);
    expect(suite.summary.losingTrades).toBe(1);
    expect(suite.summary.breakevenTrades).toBe(1);
    expect(suite.summary.netPnl).toBe("400");
    expect(suite.summary.grossProfit).toBe("800");
    expect(suite.summary.grossLoss).toBe("400");
    expect(suite.summary.winRate).toBe("0.5");
    expect(suite.summary.lossRate).toBe("0.25");
    expect(suite.summary.profitFactor).toBe("2");
    // expectancyR = mean(2.5, −2, 0, 1.5) = 0.5 - always emitted
    expect(suite.summary.expectancyR).toBe("0.5");
    expect(suite.summary.expectancyMoney).toBe("100");
    expect(suite.summary.avgWinR).toBe("2");
    expect(suite.summary.avgLossR).toBe("2");
    expect(suite.summary.payoffRatio).toBe("1");
    expect(suite.summary.maxDrawdownR).toBe("-2");
    expect(suite.summary.bestR).toBe("2.5");
    expect(suite.summary.worstR).toBe("-2");
    expect(suite.summary.sharpeNote).toContain("√252");
    expect(suite.summary.sortinoNote).toContain("downside");
  });

  it("returns null profit factor when gross loss is 0 - never Infinity (§11)", () => {
    const winsOnly = baseDataset().filter((t) => t.pnlNet >= 0);
    const suite = computeAnalyticsSuite(env(winsOnly), ALL, 400);
    expect(suite.summary.grossLoss).toBe("0");
    expect(suite.summary.profitFactor).toBeNull();
  });

  it("emits expectancyR = 0 on an empty dataset but null winRate (§54: zero ≠ no data)", () => {
    const suite = computeAnalyticsSuite(env([]), ALL, 400);
    expect(suite.summary.trades).toBe(0);
    expect(suite.summary.winRate).toBeNull();
    expect(suite.summary.lossRate).toBeNull();
    expect(suite.summary.expectancyR).toBe("0");
    expect(suite.summary.avgR).toBeNull();
    expect(suite.meta.warnings).toContain("No closed trades match the current filters.");
  });
});

describe("dataset meta", () => {
  it("uses the exact default descriptor string the UI string-matches", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.meta.descriptor).toBe("All accounts · all symbols");
  });

  it("echoes the active filters into the descriptor", () => {
    const suite = computeAnalyticsSuite(
      env(baseDataset()),
      { period: "ALL", accountId: "a1", strategyId: "none", direction: "BUY", exitReason: "TP" },
      400,
    );
    expect(suite.meta.descriptor).toBe("Main · Out of playbook · BUY · TP");
  });

  it("resolves ALL sentinels back to real dataset bounds", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.meta.resolvedFrom).toBe("2026-03-02");
    expect(suite.meta.resolvedTo).toBe("2026-03-05");
  });

  it("counts OPEN trades globally even though they never enter stats (§45)", () => {
    const suite = computeAnalyticsSuite(env(baseDataset(), [ACCOUNT_USD], 3), ALL, 400);
    expect(suite.meta.openTradesExcluded).toBe(3);
    expect(suite.summary.trades).toBe(4);
  });

  it("flags multi-currency datasets: money nulls, singleCurrency false, warning", () => {
    const accounts = [
      ACCOUNT_USD,
      { id: "a2", name: "Euro", currency: "EUR", startingBalance: 5000, isDefault: false },
    ];
    const trades = [...baseDataset(), trade({ id: "t5", accountId: "a2", pnlNet: -100, rMultiple: -1 })];
    const suite = computeAnalyticsSuite(env(trades, accounts), ALL, 400);
    expect(suite.meta.singleCurrency).toBe(false);
    expect(suite.meta.warnings).toContain("Multi-currency dataset: money figures are raw sums, not converted.");
    expect(suite.summary.netPnl).toBeNull();
    expect(suite.summary.profitFactor).toBeNull();
    expect(suite.equity).toEqual([]);
    expect(suite.summary.maxDrawdownPct).toBeNull();
    // R-based aggregates stay meaningful - R is currency-free.
    expect(suite.summary.expectancyR).toBe("0.2");
    expect(suite.cumulativeR).toHaveLength(5);
  });

  it("warns on small samples below 10 trades", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.meta.warnings).toContain(
      "Small sample: rates and ratios below ~10 trades are statistically unreliable.",
    );
  });
});

describe("filtering", () => {
  it("period CUSTOM narrows the tradingDate window inclusively", () => {
    const suite = computeAnalyticsSuite(
      env(baseDataset()),
      { period: "CUSTOM", customFrom: "2026-03-03", customTo: "2026-03-04" },
      400,
    );
    expect(suite.meta.closedTrades).toBe(2);
    expect(suite.meta.resolvedFrom).toBe("2026-03-03");
  });

  it("strategyId=none keeps only out-of-playbook trades; a uuid keeps only attributed ones", () => {
    const trades = [
      ...baseDataset(),
      trade({ id: "t5", strategyId: "s-1", tradingDate: "2026-03-06" }),
    ];
    const none = computeAnalyticsSuite(env(trades), { period: "ALL", strategyId: "none" }, 400);
    expect(none.meta.closedTrades).toBe(4);
    const attributed = computeAnalyticsSuite(env(trades), { period: "ALL", strategyId: "s-1" }, 400);
    expect(attributed.meta.closedTrades).toBe(1);
    expect(attributed.strategies[0]?.name).toBe("London Breakout");
  });

  it("session/direction/exitReason/accountId/assetClass/instrumentId filters all apply", () => {
    const bySession = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", session: "LONDON" }, 400);
    expect(bySession.meta.closedTrades).toBe(4); // 09:30Z is LONDON
    const byDirection = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", direction: "SELL" }, 400);
    expect(byDirection.meta.closedTrades).toBe(1);
    const byExit = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", exitReason: "SL" }, 400);
    expect(byExit.meta.closedTrades).toBe(1);
    const byAccount = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", accountId: "a1" }, 400);
    expect(byAccount.meta.closedTrades).toBe(4);
    const byClass = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", assetClass: "CRYPTO" }, 400);
    expect(byClass.meta.closedTrades).toBe(0);
    const byInstrument = computeAnalyticsSuite(
      env(baseDataset()),
      { period: "ALL", instrumentId: "instr-1" },
      400,
    );
    expect(byInstrument.meta.closedTrades).toBe(4);
  });

  it("emotion and tag filters narrow honestly to an empty dataset (no journal data yet, §8)", () => {
    const byEmotion = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", emotion: "FOMO" }, 400);
    expect(byEmotion.meta.closedTrades).toBe(0);
    expect(byEmotion.meta.warnings).toContain("No closed trades match the current filters.");
    const byTag = computeAnalyticsSuite(env(baseDataset()), { period: "ALL", tagId: "00000000-0000-4000-8000-000000000001" }, 400);
    expect(byTag.meta.closedTrades).toBe(0);
  });
});

describe("equity curve", () => {
  it("starts from the Σ startingBalance of scoped accounts, one point per trade", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.equity).toHaveLength(4);
    expect(suite.equity[0]).toEqual({ date: "2026-03-02", equity: "10500", drawdownPct: "0" });
    expect(suite.equity[1]?.equity).toBe("10100"); // 10500 − 400
    expect(Number(suite.equity[1]?.drawdownPct)).toBeLessThan(0);
    expect(suite.equity[3]?.equity).toBe("10400"); // 10100 + 0 + 300
  });
});

describe("cumulative R + rolling", () => {
  it("orders chronologically and tracks the running sum; rolling window grows to 10", () => {
    const trades = baseDataset();
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    expect(suite.cumulativeR.map((p) => p.r)).toEqual(["2.5", "-2", "0", "1.5"]);
    expect(suite.cumulativeR.map((p) => p.cumR)).toEqual(["2.5", "0.5", "0.5", "2"]);
    expect(suite.rolling).toHaveLength(4);
    expect(suite.rolling[1]?.winRate).toBe("0.5"); // window [t1, t2]
    expect(suite.rolling[3]?.avgR).toBe("0.5"); // mean of all 4 R
  });
});

describe("histograms", () => {
  it("rHistogram uses the fixed −2…+3.5R edges with open tails", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.rHistogram).toHaveLength(12);
    expect(suite.rHistogram[0]?.label).toBe("≤ -2R"); // t2 (r = −2, inclusive)
    expect(suite.rHistogram[0]?.count).toBe(1);
    expect(suite.rHistogram[11]?.label).toBe("> +3.5R");
    expect(suite.rHistogram[11]?.count).toBe(0);
    // bin (2, 2.5] holds t1 (2.5)
    expect(suite.rHistogram[8]?.count).toBe(1);
  });

  it("durationHistogram uses the fixed minute buckets, center null", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.durationHistogram.map((b) => b.label)).toEqual([
      "< 5 min",
      "5–15 min",
      "15–60 min",
      "1–4 h",
      "4–12 h",
      "> 12 h",
    ]);
    // durations: 150min, 90min, 240min, 45min
    expect(suite.durationHistogram[2]?.count).toBe(1); // 45 min
    expect(suite.durationHistogram[3]?.count).toBe(2); // 90 + 150 min
    expect(suite.durationHistogram[4]?.count).toBe(1); // 240 min
  });

  it("skips the pnl histogram on multi-currency datasets", () => {
    const accounts = [
      ACCOUNT_USD,
      { id: "a2", name: "Euro", currency: "EUR", startingBalance: 5000, isDefault: false },
    ];
    const trades = [...baseDataset(), trade({ id: "t5", accountId: "a2" })];
    const suite = computeAnalyticsSuite(env(trades, accounts), ALL, 400);
    expect(suite.pnlHistogram).toEqual([]);
  });
});

describe("drawdown periods (§11)", () => {
  it("detects a recovered drawdown with honest recovery metrics", () => {
    // Peak at +500 → trough at −500 (2 losses) → recovery at +100 (2 wins).
    const trades: AnalyticsTradeRow[] = [
      trade({ id: "t1", pnlNet: 500, rMultiple: 1, tradingDate: "2026-03-02" }),
      trade({ id: "t2", pnlNet: -600, rMultiple: -1, tradingDate: "2026-03-03" }),
      trade({ id: "t3", pnlNet: -400, rMultiple: -1, tradingDate: "2026-03-04" }),
      trade({ id: "t4", pnlNet: 600, rMultiple: 1, tradingDate: "2026-03-05" }),
      trade({ id: "t5", pnlNet: 500, rMultiple: 1, tradingDate: "2026-03-06" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    expect(suite.drawdowns).toHaveLength(1);
    const dd = suite.drawdowns[0]!;
    expect(dd.peakDate).toBe("2026-03-02");
    expect(dd.bottomDate).toBe("2026-03-04");
    // Recovery only when equity moves back ABOVE the peak (10100 < 10500 on 03-05).
    expect(dd.recoveredDate).toBe("2026-03-06");
    expect(dd.peakEquity).toBe("10500");
    expect(dd.bottomEquity).toBe("9500");
    expect(dd.drawdownMoney).toBe("-1000");
    expect(dd.drawdownR).toBe("-2"); // cumR: peak +1 → trough −1
    expect(dd.recoveryTrades).toBe(4);
    expect(dd.recoveryDays).toBe(3);
    expect(dd.durationDays).toBe(1); // ddStart (03-03) → trough (03-04)
    // The recovery trade itself moves above the peak (continue) - it is not a digger.
    expect(dd.trades.map((t) => t.id)).toEqual(["t2", "t3", "t4"]);
  });

  it("keeps an unrecovered drawdown open with null recovery fields (honest, §54)", () => {
    const trades: AnalyticsTradeRow[] = [
      trade({ id: "t1", pnlNet: 500, rMultiple: 1, tradingDate: "2026-03-02" }),
      trade({ id: "t2", pnlNet: -700, rMultiple: -1, tradingDate: "2026-03-03" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    expect(suite.drawdowns).toHaveLength(1);
    const dd = suite.drawdowns[0]!;
    expect(dd.recoveredDate).toBeNull();
    expect(dd.recoveryDays).toBeNull();
    expect(dd.recoveryTrades).toBeNull();
    expect(dd.drawdownR).toBe("-1"); // cumR: peak +1 → trough 0
  });
});

describe("risk block (§10)", () => {
  it("summarizes risk money, deviation, daily peak and concurrency", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.risk.tradesWithRisk).toBe(4);
    expect(suite.risk.avgRiskMoney).toBe("200");
    expect(suite.risk.maxRiskMoney).toBe("200");
    expect(suite.risk.minRiskMoney).toBe("200");
    expect(suite.risk.riskDeviationPct).toBe("0"); // std = 0 → (0/mean)×100 emitted as "0"
    expect(suite.risk.maxDailyRisk).toBe("200");
    expect(suite.risk.maxConcurrentPositions).toBeGreaterThanOrEqual(1);
  });

  it("buckets planned-vs-realized on the CANONICAL planned RR (5 buckets)", () => {
    const trades = [
      trade({ id: "t1", plannedRR: 0.5, rMultiple: -0.5 }),
      trade({ id: "t2", plannedRR: 1.5, rMultiple: 2, tradingDate: "2026-03-03" }),
      trade({ id: "t3", plannedRR: 2.5, rMultiple: 1, tradingDate: "2026-03-04" }),
      trade({ id: "t4", plannedRR: 4, rMultiple: 0.5, tradingDate: "2026-03-05" }),
      trade({ id: "t5", rMultiple: 3, tradingDate: "2026-03-06" }), // no plan
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    expect(suite.risk.plannedVsRealized.map((b) => b.bucket)).toEqual([
      "≤ 1R planned",
      "1–2R planned",
      "2–3R planned",
      "> 3R planned",
      "No plan",
    ]);
    expect(suite.risk.plannedVsRealized.map((b) => b.trades)).toEqual([1, 1, 1, 1, 1]);
    expect(suite.risk.plannedVsRealized.map((b) => b.avgRealizedR)).toEqual(["-0.5", "2", "1", "0.5", "3"]);
  });
});

describe("strategy rows (§12)", () => {
  it("names unattributed trades 'Out of playbook' and unknown ids 'Unknown strategy'", () => {
    const trades = [
      trade({ id: "t1", strategyId: "s-1" }),
      trade({ id: "t2", strategyId: "gone", tradingDate: "2026-03-03" }),
      trade({ id: "t3", tradingDate: "2026-03-04" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    const byName = Object.fromEntries(suite.strategies.map((s) => [s.name, s]));
    expect(byName["London Breakout"]?.trades).toBe(1);
    expect(byName["Unknown strategy"]?.trades).toBe(1);
    expect(byName["Out of playbook"]?.trades).toBe(1);
  });

  it("followedPlanPct is a 0–1 RATIO over reviewed trades only", () => {
    const trades = [
      trade({ id: "t1", strategyId: "s-1", followedPlan: true }),
      trade({ id: "t2", strategyId: "s-1", followedPlan: false, tradingDate: "2026-03-03" }),
      trade({ id: "t3", strategyId: "s-1", tradingDate: "2026-03-04" }), // not reviewed
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    const row = suite.strategies.find((s) => s.name === "London Breakout")!;
    expect(row.followedPlanPct).toBe("0.5");
  });
});

describe("time analytics (§14)", () => {
  it("heatmap covers 7 weekdays × 6 UTC hour buckets in shared order", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.heatmap).toHaveLength(42);
    expect(suite.heatmap[0]).toEqual({ weekday: 1, hourBucket: 0, trades: 0, wins: 0, avgR: null });
    // 2026-03-02 is a Monday, entry 09:30Z → bucket 2 (08–12)
    const cell = suite.heatmap.find((c) => c.weekday === 1 && c.hourBucket === 2)!;
    expect(cell.trades).toBe(1);
    expect(cell.avgR).toBe("2.5");
  });

  it("sessions/hours/weekdays carry their trades with winRate 0–1", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    const london = suite.sessions.find((s) => s.key === "LONDON")!;
    expect(london.trades).toBe(4);
    const weekdayMon = suite.weekdays.find((s) => s.key === "1")!;
    expect(weekdayMon.trades).toBe(1);
  });
});

describe("psychology block (§19/§23–§31)", () => {
  it("emotions/confidence stay honest-empty without journal data; tilt is computed", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.psychology.emotionsBefore).toEqual([]);
    expect(suite.psychology.emotionsAfter).toEqual([]);
    expect(suite.psychology.confidenceBands.map((b) => b.band)).toEqual(["1–2", "3", "4–5"]);
    expect(suite.psychology.tilt).toHaveLength(4);
    expect(suite.psychology.tilt[0]?.priorLossStreak).toBe(0);
    expect(suite.psychology.tilt[1]?.priorLossStreak).toBe(0); // t1 was a win
    expect(suite.psychology.tilt[2]?.priorLossStreak).toBe(1); // t2 was a loss
  });

  it("flags a risk spike only after ≥2 consecutive losses AND a >20% risk increase (§25)", () => {
    const trades: AnalyticsTradeRow[] = [
      trade({ id: "t1", pnlNet: -100, rMultiple: -1, riskMoney: 100, riskAmountRaw: "100" }),
      trade({ id: "t2", pnlNet: -100, rMultiple: -1, riskMoney: 100, riskAmountRaw: "100", tradingDate: "2026-03-03" }),
      trade({ id: "t3", pnlNet: 100, rMultiple: 1, riskMoney: 130, riskAmountRaw: "130", tradingDate: "2026-03-04" }),
      trade({ id: "t4", pnlNet: -100, rMultiple: -1, riskMoney: 100, riskAmountRaw: "100", tradingDate: "2026-03-05" }),
      trade({ id: "t5", pnlNet: 100, rMultiple: 1, riskMoney: 110, riskAmountRaw: "110", tradingDate: "2026-03-06" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    const byId = Object.fromEntries(suite.psychology.tilt.map((p) => [p.tradeId, p]));
    expect(byId["t3"]?.isSpike).toBe(true); // 2 losses before, +30% risk
    expect(byId["t5"]?.isSpike).toBe(false); // risk +10% below the 1.2 threshold
    expect(byId["t5"]?.priorLossStreak).toBe(1);
  });
});

describe("quality + mistakes + events blocks (§16–§21)", () => {
  it("reports plan adherence from reviews and excursions honestly unavailable", () => {
    const trades = [
      trade({ id: "t1", followedPlan: true }),
      trade({ id: "t2", followedPlan: false, tradingDate: "2026-03-03" }),
      trade({ id: "t3", tradingDate: "2026-03-04" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    expect(suite.quality.planFollowed).toEqual({ followed: 1, violated: 1, unknown: 1 });
    expect(suite.quality.excursionAvailable).toBe(false);
    expect(suite.quality.mfe).toEqual({ avgR: null, medianR: null, capturePct: null });
    expect(suite.quality.scatter).toHaveLength(3);
    expect(suite.quality.scatter[0]?.mfeR).toBeNull();
    expect(suite.quality.mfeHistogram).toHaveLength(7);
    expect(suite.quality.maeHistogram).toHaveLength(6);
  });

  it("keeps the mistakes ledger empty (discipline domain not backend) with zero cost", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.mistakes).toEqual({ entries: [], violatingTrades: 0, totalR: "0" });
  });

  it("with no calendar events, unclassifiable trades stay honestly out of every phase bucket (§21)", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    // No calendar events + uncataloged instruments (quoteCurrency null) →
    // no trade can be classified: coverage is empty and every phase
    // bucket is empty (the mock's "unknown instrument → unclassified" rule).
    expect(suite.events.calendarCoverage).toEqual({
      from: null,
      to: null,
      classifiedTrades: 0,
      unclassifiedTrades: 4,
    });
    expect(suite.events.phases.map((p) => p.key)).toEqual(["BEFORE", "DURING", "AFTER", "NONE"]);
    expect(suite.events.phases.map((p) => p.trades)).toEqual([0, 0, 0, 0]);
    expect(suite.events.byImpact.map((b) => b.trades)).toEqual([0, 0]);
  });

  it("classifies trades into economic phases against canonical events (§21, mock parity)", () => {
    // Fixed fixtures: a HIGH USD event at 12:30 and a MEDIUM EUR event at
    // 14:00; trades carry catalog quote currencies so the join is real.
    const events = [
      { id: "e-high", currency: "USD", impact: "HIGH" as const, scheduledAtMs: Date.parse("2026-03-02T12:30:00.000Z") },
      { id: "e-med", currency: "EUR", impact: "MEDIUM" as const, scheduledAtMs: Date.parse("2026-03-02T14:00:00.000Z") },
    ];
    const trades = [
      trade({ id: "t-during", quoteCurrency: "USD", entryAtMs: Date.parse("2026-03-02T12:00:00.000Z") }), // |Δ| ≤ 60 min → DURING
      trade({ id: "t-before", quoteCurrency: "USD", entryAtMs: Date.parse("2026-03-02T10:00:00.000Z") }), // −180 min → BEFORE
      trade({ id: "t-after", quoteCurrency: "USD", entryAtMs: Date.parse("2026-03-02T14:30:00.000Z") }), // +120 min → AFTER
      trade({ id: "t-eur", quoteCurrency: "EUR", entryAtMs: Date.parse("2026-03-02T13:30:00.000Z") }), // joins the EUR event → DURING
      trade({ id: "t-far", quoteCurrency: "USD", entryAtMs: Date.parse("2026-03-02T20:00:00.000Z") }), // beyond ±4h → NONE
      trade({ id: "t-unknown", quoteCurrency: null, entryAtMs: Date.parse("2026-03-02T12:00:00.000Z") }), // unclassified
    ];
    const suite = computeAnalyticsSuite(env(trades, [ACCOUNT_USD], 0, events), ALL, 400);
    expect(suite.events.calendarCoverage.from).toBe("2026-03-02");
    expect(suite.events.calendarCoverage.to).toBe("2026-03-02");
    expect(suite.events.calendarCoverage.classifiedTrades).toBe(4); // during/before/after ×2 phases
    expect(suite.events.calendarCoverage.unclassifiedTrades).toBe(2); // t-far (NONE) + t-unknown (excluded)
    expect(suite.events.phases.find((p) => p.key === "DURING")?.trades).toBe(2);
    expect(suite.events.phases.find((p) => p.key === "BEFORE")?.trades).toBe(1);
    expect(suite.events.phases.find((p) => p.key === "AFTER")?.trades).toBe(1);
    expect(suite.events.phases.find((p) => p.key === "NONE")?.trades).toBe(1); // t-far only (unknown is excluded)
    expect(suite.events.byImpact.find((b) => b.key === "HIGH")?.trades).toBe(3); // USD trades within ±4h of the HIGH event
    expect(suite.events.byImpact.find((b) => b.key === "MEDIUM")?.trades).toBe(1); // the EUR trade
  });
});

describe("advanced statistics (§24)", () => {
  it("computes the R distribution profile and breakeven-transparent streaks", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.advanced.r.mean).toBe("0.5");
    expect(suite.advanced.r.median).toBe("0.75");
    expect(suite.advanced.r.stddev).toBe("1.96");
    expect(suite.advanced.r.variance).toBe("3.83");
    expect(suite.advanced.r.p05).not.toBeNull();
    expect(suite.advanced.r.p95).not.toBeNull();
    // W(2.5/500) → L(−2/−400) → BE → W: loss streak 1, win streak 1, BE transparent
    expect(suite.advanced.streaks.longestWin).toBe(1);
    expect(suite.advanced.streaks.longestLoss).toBe(1);
    expect(suite.advanced.streaks.avgWin).toBe("1");
    expect(suite.advanced.streaks.avgLoss).toBe("1");
  });

  it("treats breakeven trades as transparent in streak accounting", () => {
    const trades = [
      trade({ id: "t1", pnlNet: 100, rMultiple: 1 }),
      trade({ id: "t2", pnlNet: 0, rMultiple: 0, tradingDate: "2026-03-03" }),
      trade({ id: "t3", pnlNet: 100, rMultiple: 1, tradingDate: "2026-03-04" }),
      trade({ id: "t4", pnlNet: 0, rMultiple: 0, tradingDate: "2026-03-05" }),
      trade({ id: "t5", pnlNet: 100, rMultiple: 1, tradingDate: "2026-03-06" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    expect(suite.advanced.streaks.longestWin).toBe(3); // BE didn't break the run
  });
});

describe("Monte Carlo (§25)", () => {
  it("clamps sims to [100, 2000] with the contract default at 400", () => {
    const low = computeAnalyticsSuite(env(baseDataset()), ALL, 50);
    expect(low.monteCarlo.simulations).toBe(100);
    const high = computeAnalyticsSuite(env(baseDataset()), ALL, 5000);
    expect(high.monteCarlo.simulations).toBe(2000);
    const normal = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(normal.monteCarlo.simulations).toBe(400);
  });

  it("is deterministic for a fixed seed and a fixed R list (§52)", () => {
    const a = computeAnalyticsSuite(env(baseDataset()), ALL, 100).monteCarlo;
    const b = computeAnalyticsSuite(env(baseDataset()), ALL, 100).monteCarlo;
    expect(a).toEqual(b);
  });

  it("tradesPerRun = dataset size, bands capped at 80 indices", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 100);
    expect(suite.monteCarlo.tradesPerRun).toBe(4);
    expect(suite.monteCarlo.bands).toHaveLength(4);
    expect(suite.monteCarlo.methodology).toContain("Simulation, not a prediction");
  });
});

describe("reports (§26)", () => {
  it("rolls up daily/weekly/monthly with ISO week keys and Σ R", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.reports.daily.map((r) => r.key)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]);
    // 2026-03-02 (Mon) → 2026-03-05 (Fri) all fall in ISO week W10.
    expect(suite.reports.weekly.map((r) => r.key)).toEqual(["2026-W10"]);
    expect(suite.reports.monthly.map((r) => r.key)).toEqual(["2026-03"]);
    expect(suite.reports.monthly[0]?.r).toBe("2"); // Σ R = 2.5 − 2 + 0 + 1.5
    expect(suite.reports.monthly[0]?.trades).toBe(4);
  });
});

describe("server-detected anomalies (§24/§49 - measured facts, never verdicts)", () => {
  it("stays silent below a 10-trade sample", () => {
    const suite = computeAnalyticsSuite(env(baseDataset()), ALL, 400);
    expect(suite.meta.anomalies).toEqual([]);
  });

  it("raises LOSS_STREAK at 5 consecutive losses (INFO) and ALERT at 8+", () => {
    // February losses - strictly consecutive, never interleaved with the March dataset.
    const losses = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        trade({ id: `l${i}`, pnlNet: -50, rMultiple: -0.5, tradingDate: `2026-02-${String(20 + i).padStart(2, "0")}`, symbol: "LOSSMAKER" }),
      );
    const paddedFive = [...losses(5), ...baseDataset(), trade({ id: "extra1", tradingDate: "2026-03-20" }), trade({ id: "extra2", tradingDate: "2026-03-21" })];
    const suiteInfo = computeAnalyticsSuite(env(paddedFive), ALL, 400);
    const streakInfo = suiteInfo.meta.anomalies.find((a) => a.code === "LOSS_STREAK");
    expect(streakInfo?.severity).toBe("INFO");
    expect(streakInfo?.message).toContain("5 consecutive losing trades");

    const eight = [...losses(8), ...baseDataset()];
    const suiteAlert = computeAnalyticsSuite(env(eight), ALL, 400);
    const streakAlert = suiteAlert.meta.anomalies.find((a) => a.code === "LOSS_STREAK");
    expect(streakAlert?.severity).toBe("ALERT");
  });

  it("raises TAIL_LOSS when the worst 5% of losses carry ≥40% of the loss mass", () => {
    const trades = [
      ...baseDataset(),
      trade({ id: "x1", pnlNet: -900, rMultiple: -9, symbol: "WHAMMER", tradingDate: "2026-03-06" }),
      trade({ id: "x2", pnlNet: -100, rMultiple: -1, tradingDate: "2026-03-07" }),
      trade({ id: "x3", pnlNet: -100, rMultiple: -1, tradingDate: "2026-03-08" }),
      trade({ id: "x4", pnlNet: -100, rMultiple: -1, tradingDate: "2026-03-09" }),
      trade({ id: "x5", pnlNet: -100, rMultiple: -1, tradingDate: "2026-03-10" }),
      trade({ id: "x6", pnlNet: -100, rMultiple: -1, tradingDate: "2026-03-11" }),
    ];
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    const tail = suite.meta.anomalies.find((a) => a.code === "TAIL_LOSS");
    expect(tail).toBeDefined();
    expect(tail?.severity).toBe("ALERT"); // 9R of 13R total = ~69%
    expect(tail?.message).toContain("worst trades carry");
  });

  it("raises OVERTRADING when busy days underperform normal days", () => {
    const trades: AnalyticsTradeRow[] = [];
    // 10 quiet days (1 trade/day, positive R) + 2 busy days (6 trades/day, negative R).
    for (let d = 1; d <= 10; d += 1) {
      trades.push(
        trade({
          id: `q${d}`,
          pnlNet: 100,
          rMultiple: 1,
          tradingDate: `2026-03-${String(d).padStart(2, "0")}`,
        }),
      );
    }
    for (const day of ["20", "21"]) {
      for (let i = 0; i < 6; i += 1) {
        trades.push(
          trade({
            id: `b${day}-${i}`,
            pnlNet: -50,
            rMultiple: -0.5,
            tradingDate: `2026-03-${day}`,
            entryAtIso: `2026-03-${day}T1${i}:30:00.000Z`,
          }),
        );
      }
    }
    const suite = computeAnalyticsSuite(env(trades), ALL, 400);
    const overtrading = suite.meta.anomalies.find((a) => a.code === "OVERTRADING");
    expect(overtrading).toBeDefined();
    expect(overtrading?.severity).toBe("WARN");
    expect(overtrading?.message).toContain("unusually busy days");
  });
});
