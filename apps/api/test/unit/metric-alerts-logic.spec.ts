/**
 * Unit - metric alert rules PURE evaluation logic (Phase 07). No Nest, no
 * DB: the transition machine, observation extraction, cooldown policy,
 * event identity determinism, unit formatting and semantic validation.
 */
import { describe, expect, it } from "vitest";
import {
  METRIC_ALERT_REGISTRY,
  metricAlertRuleSchema,
  type MetricAlertRule,
  type MetricAlertRuleState,
} from "../../src/shared/contracts";
import {
  compareCondition,
  evaluateRuleTick,
  extractSummaryObservation,
  formatMetricValue,
  metricAlertCopy,
  metricAlertEventId,
  metricAlertPayload,
  metricAlertSemanticKey,
  validateMetricAlertRuleSemantics,
} from "../../src/modules/metric-alerts/metric-alerts.logic";

const NOW = new Date("2026-10-16T12:00:00.000Z");

function thresholdRule(overrides: Partial<MetricAlertRule> = {}): MetricAlertRule {
  return metricAlertRuleSchema.parse({
    id: "a0000000-0000-4000-8000-000000000001",
    userId: "a0000000-0000-4000-8000-0000000000aa",
    name: "Monthly profit",
    kind: "THRESHOLD",
    metric: "NET_PNL",
    condition: "GREATER_THAN_OR_EQUAL",
    threshold: 1000,
    period: "THIS_MONTH",
    enabled: true,
    cooldownMinutes: 0,
    accountId: null,
    strategyId: null,
    state: {
      lastConditionMet: null,
      lastTriggeredAt: null,
      lastEvaluationAt: null,
      lastObservedValue: null,
      lastObservation: "NO_DATA",
      triggerCount: 0,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  });
}

const FRESH_STATE: MetricAlertRuleState = {
  lastConditionMet: null,
  lastTriggeredAt: null,
  lastEvaluationAt: null,
  lastObservedValue: null,
  lastObservation: "NO_DATA",
  triggerCount: 0,
};

// ── Observation extraction (authoritative summary → observation) ────────────

describe("extractSummaryObservation", () => {
  const summary = {
    netPnl: "1250.50",
    winRate: "0.625",
    profitFactor: "1.8",
    maxDrawdownPct: "-12.34",
    avgR: "0.42",
    trades: 23,
  } as unknown as Parameters<typeof extractSummaryObservation>[1];

  it("maps NET_PNL from the decimal string", () => {
    expect(extractSummaryObservation("NET_PNL", summary)).toEqual({ ok: true, value: 1250.5 });
  });

  it("reports WIN_RATE as 0..100 percent (summary stores a 0..1 ratio)", () => {
    expect(extractSummaryObservation("WIN_RATE", summary)).toEqual({ ok: true, value: 62.5 });
  });

  it("reports DRAWDOWN_PCT as a ≥0 magnitude (summary stores ≤0)", () => {
    expect(extractSummaryObservation("DRAWDOWN_PCT", summary)).toEqual({ ok: true, value: 12.34 });
  });

  it("maps PROFIT_FACTOR, AVG_R and TRADE_COUNT (0 trades is a valid observation)", () => {
    expect(extractSummaryObservation("PROFIT_FACTOR", summary)).toEqual({ ok: true, value: 1.8 });
    expect(extractSummaryObservation("AVG_R", summary)).toEqual({ ok: true, value: 0.42 });
    expect(extractSummaryObservation("TRADE_COUNT", summary)).toEqual({ ok: true, value: 23 });
    expect(
      extractSummaryObservation("TRADE_COUNT", { trades: 0 } as unknown as Parameters<
        typeof extractSummaryObservation
      >[1]),
    ).toEqual({ ok: true, value: 0 });
  });

  it("returns NO_DATA for null summary fields (empty sample / multi-currency)", () => {
    const empty = { netPnl: null, winRate: null, profitFactor: null, maxDrawdownPct: null, avgR: null, trades: 0 } as unknown as Parameters<typeof extractSummaryObservation>[1];
    expect(extractSummaryObservation("NET_PNL", empty)).toEqual({ ok: false, reason: "NO_DATA" });
    expect(extractSummaryObservation("WIN_RATE", empty)).toEqual({ ok: false, reason: "NO_DATA" });
    expect(extractSummaryObservation("DRAWDOWN_PCT", empty)).toEqual({ ok: false, reason: "NO_DATA" });
    expect(extractSummaryObservation("AVG_R", empty)).toEqual({ ok: false, reason: "NO_DATA" });
  });
});

// ── Condition comparison ─────────────────────────────────────────────────────

describe("compareCondition", () => {
  it("applies the five operators", () => {
    expect(compareCondition(5, "GREATER_THAN", 5)).toBe(false);
    expect(compareCondition(5, "GREATER_THAN_OR_EQUAL", 5)).toBe(true);
    expect(compareCondition(5, "LESS_THAN", 5)).toBe(false);
    expect(compareCondition(5, "LESS_THAN_OR_EQUAL", 5)).toBe(true);
    expect(compareCondition(5, "EQUAL", 5)).toBe(true);
    expect(compareCondition(-3, "LESS_THAN", 0)).toBe(true);
  });
});

// ── The transition machine ───────────────────────────────────────────────────

describe("evaluateRuleTick", () => {
  it("fires once when a fresh rule's condition is already true", () => {
    const rule = thresholdRule();
    const tick = evaluateRuleTick(
      rule,
      { ok: true, value: 1250 },
      FRESH_STATE,
      NOW,
    );
    expect(tick.outcome).toBe("TRIGGER");
    if (tick.outcome === "TRIGGER") {
      expect(tick.triggerCount).toBe(1);
      expect(tick.nextState.lastConditionMet).toBe(true);
      expect(tick.nextState.lastTriggeredAt).toBe(NOW.toISOString());
    }
  });

  it("never duplicates while the condition stays true (spec §6 example)", () => {
    const rule = thresholdRule();
    const after = evaluateRuleTick(rule, { ok: true, value: 1250 }, FRESH_STATE, NOW);
    if (after.outcome !== "TRIGGER") throw new Error("expected trigger");
    const repeat = evaluateRuleTick(rule, { ok: true, value: 1300 }, after.nextState, NOW);
    expect(repeat.outcome).toBe("QUIET");
    if (repeat.outcome === "QUIET") {
      expect(repeat.reason).toBe("NO_TRANSITION");
      expect(repeat.nextState.triggerCount).toBe(1);
    }
  });

  it("fires again on a genuine false→true transition", () => {
    const rule = thresholdRule({ threshold: 1000 });
    const belowState: MetricAlertRuleState = {
      ...FRESH_STATE,
      lastConditionMet: true,
      triggerCount: 1,
      lastTriggeredAt: "2026-10-10T00:00:00.000Z",
    };
    const dropped = evaluateRuleTick(rule, { ok: true, value: 500 }, belowState, NOW);
    expect(dropped.outcome).toBe("QUIET");
    if (dropped.outcome !== "QUIET") throw new Error("expected quiet");
    expect(dropped.reason).toBe("CONDITION_FALSE");
    expect(dropped.nextState.lastConditionMet).toBe(false);

    const recovered = evaluateRuleTick(rule, { ok: true, value: 1500 }, dropped.nextState, NOW);
    expect(recovered.outcome).toBe("TRIGGER");
    if (recovered.outcome === "TRIGGER") expect(recovered.triggerCount).toBe(2);
  });

  it("does NOT flip the transition state on missing data or failed calculations", () => {
    const rule = thresholdRule();
    const aboveState: MetricAlertRuleState = { ...FRESH_STATE, lastConditionMet: true };
    for (const observation of [
      { ok: false, reason: "NO_DATA" },
      { ok: false, reason: "CALC_FAILED" },
    ] as const) {
      const tick = evaluateRuleTick(rule, observation, aboveState, NOW);
      expect(tick.outcome).toBe("QUIET");
      if (tick.outcome !== "QUIET") throw new Error("expected quiet");
      expect(tick.reason).toBe(observation.reason);
      expect(tick.nextState.lastConditionMet).toBe(true); // unchanged
      expect(tick.nextState.lastObservation).toBe(observation.reason);
    }
  });

  it("respects the cooldown as a flapping guard and documents the policy", () => {
    const rule = thresholdRule({ cooldownMinutes: 60 });
    const recent: MetricAlertRuleState = {
      ...FRESH_STATE,
      lastConditionMet: false,
      lastTriggeredAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      triggerCount: 1,
    };
    const suppressed = evaluateRuleTick(rule, { ok: true, value: 1250 }, recent, NOW);
    expect(suppressed.outcome).toBe("QUIET");
    if (suppressed.outcome !== "QUIET") throw new Error("expected quiet");
    expect(suppressed.reason).toBe("COOLDOWN");
    // The suppressed trigger still commits the transition - after the
    // cooldown a NEW false→true is required (documented policy, spec §6).
    expect(suppressed.nextState.lastConditionMet).toBe(true);

    // A still-true condition after the cooldown does NOT re-fire.
    const later = new Date(NOW.getTime() + 2 * 60 * 60_000);
    const stillTrue = evaluateRuleTick(rule, { ok: true, value: 1250 }, suppressed.nextState, later);
    expect(stillTrue.outcome).toBe("QUIET");
    if (stillTrue.outcome !== "QUIET") throw new Error("expected quiet");
    expect(stillTrue.reason).toBe("NO_TRANSITION");
  });

  it("freezes the state of a disabled rule (not observed while off)", () => {
    const rule = thresholdRule({ enabled: false });
    const tick = evaluateRuleTick(rule, { ok: true, value: 1250 }, FRESH_STATE, NOW);
    expect(tick.outcome).toBe("QUIET");
    if (tick.outcome !== "QUIET") throw new Error("expected quiet");
    expect(tick.reason).toBe("DISABLED");
    expect(tick.nextState).toBe(FRESH_STATE);
  });

  it("evaluates GOAL rules: achieved on pct ≥ 100, below-threshold on slips", () => {
    const goalId = "b0000000-0000-4000-8000-000000000001";
    const achieved = thresholdRule({
      kind: "GOAL",
      goalId,
      goalCondition: "ACHIEVED",
      thresholdPct: null,
      name: "Win rate goal",
    } as Partial<MetricAlertRule>);
    const hit = evaluateRuleTick(achieved, { ok: true, value: 100 }, FRESH_STATE, NOW);
    expect(hit.outcome).toBe("TRIGGER");
    const notYet = evaluateRuleTick(achieved, { ok: true, value: 82.5 }, FRESH_STATE, NOW);
    expect(notYet.outcome).toBe("QUIET");

    const offPace = thresholdRule({
      kind: "GOAL",
      goalId,
      goalCondition: "PROGRESS_BELOW",
      thresholdPct: 50,
      name: "Win rate goal",
    } as Partial<MetricAlertRule>);
    const slipped = evaluateRuleTick(offPace, { ok: true, value: 35 }, FRESH_STATE, NOW);
    expect(slipped.outcome).toBe("TRIGGER");
    const healthy = evaluateRuleTick(offPace, { ok: true, value: 75 }, FRESH_STATE, NOW);
    expect(healthy.outcome).toBe("QUIET");
  });
});

// ── Event identity + presentation ────────────────────────────────────────────

describe("metricAlertEventId", () => {
  it("is deterministic per (rule, triggerCount) and a valid uuid", () => {
    const a = metricAlertEventId("a0000000-0000-4000-8000-000000000001", 1);
    const b = metricAlertEventId("a0000000-0000-4000-8000-000000000001", 1);
    const c = metricAlertEventId("a0000000-0000-4000-8000-000000000001", 2);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("formatMetricValue", () => {
  it("formats each unit", () => {
    expect(formatMetricValue("MONEY", 1250.5)).toBe("$1,250.50");
    expect(formatMetricValue("PERCENT", 62.5)).toBe("62.5%");
    expect(formatMetricValue("RATIO", 1.8)).toBe("1.8×");
    expect(formatMetricValue("COUNT", 23)).toBe("23");
    expect(formatMetricValue("R", 0.421)).toBe("0.42R");
  });
});

describe("metricAlertCopy", () => {
  it("writes a neutral threshold message with matching units", () => {
    const rule = thresholdRule();
    const { title, message } = metricAlertCopy(rule, 1250, "THIS_MONTH");
    expect(title).toBe("Monthly profit");
    expect(message).toContain("$1,250.00");
    expect(message).toContain("this month");
    expect(message).toContain("≥ $1,000.00");
  });

  it("writes goal copy for goal rules", () => {
    const rule = thresholdRule({
      kind: "GOAL",
      goalId: "b0000000-0000-4000-8000-000000000001",
      goalCondition: "PROGRESS_BELOW",
      thresholdPct: 50,
      name: "Win rate goal",
    } as Partial<MetricAlertRule>);
    const { title, message } = metricAlertCopy(rule, 35, null);
    expect(title).toBe("Goal off pace: Win rate goal");
    expect(message).toContain("35%");
    expect(message).toContain("50%");
  });
});

describe("metricAlertPayload", () => {
  it("freezes the threshold context", () => {
    const rule = thresholdRule();
    const payload = metricAlertPayload(rule, 1250, "t1", NOW.toISOString(), {
      period: "THIS_MONTH",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
    expect(payload.ruleId).toBe(rule.id);
    expect(payload.metric).toBe("NET_PNL");
    expect(payload.threshold).toBe(1000);
    expect(payload.observedValue).toBe(1250);
    expect(payload.unit).toBe("MONEY");
    expect(payload.period).toBe("THIS_MONTH");
    expect(payload.evaluationKey).toBe("t1");
    expect(payload.goalId).toBeNull();
  });

  it("freezes the goal context (no suite period for goal rules)", () => {
    const goalId = "b0000000-0000-4000-8000-000000000001";
    const rule = thresholdRule({
      kind: "GOAL",
      goalId,
      goalCondition: "ACHIEVED",
      thresholdPct: null,
      name: "Win rate goal",
    } as Partial<MetricAlertRule>);
    const payload = metricAlertPayload(rule, 100, "t1", NOW.toISOString(), {
      period: null,
      periodStart: null,
      periodEnd: null,
    });
    expect(payload.metric).toBeNull();
    expect(payload.goalId).toBe(goalId);
    expect(payload.period).toBeNull();
    expect(payload.unit).toBe("PERCENT");
  });
});

// ── Duplicate key + semantic validation ──────────────────────────────────────

describe("metricAlertSemanticKey", () => {
  it("collapses identical semantics, separates thresholds and scopes", () => {
    const base = thresholdRule();
    const same = thresholdRule();
    const otherThreshold = thresholdRule({ threshold: 2000 });
    const otherScope = thresholdRule({ accountId: "c0000000-0000-4000-8000-000000000001" });
    expect(metricAlertSemanticKey(base)).toBe(metricAlertSemanticKey(same));
    expect(metricAlertSemanticKey(base)).not.toBe(metricAlertSemanticKey(otherThreshold));
    expect(metricAlertSemanticKey(base)).not.toBe(metricAlertSemanticKey(otherScope));
  });

  it("distinguishes goal rules by goal + condition + threshold", () => {
    const goalA = thresholdRule({
      kind: "GOAL",
      goalId: "b0000000-0000-4000-8000-000000000001",
      goalCondition: "ACHIEVED",
      thresholdPct: null,
      name: "g",
    } as Partial<MetricAlertRule>);
    const goalB = thresholdRule({
      kind: "GOAL",
      goalId: "b0000000-0000-4000-8000-000000000001",
      goalCondition: "PROGRESS_BELOW",
      thresholdPct: 50,
      name: "g",
    } as Partial<MetricAlertRule>);
    expect(metricAlertSemanticKey(goalA)).not.toBe(metricAlertSemanticKey(goalB));
  });
});

describe("validateMetricAlertRuleSemantics", () => {
  it("rejects unsupported condition/metric combos and out-of-unit thresholds", () => {
    expect(
      validateMetricAlertRuleSemantics(
        thresholdRule({ metric: "WIN_RATE", condition: "EQUAL", threshold: 50 }) as MetricAlertRule,
      ),
    ).toMatch(/not supported/);
    expect(
      validateMetricAlertRuleSemantics(thresholdRule({ metric: "WIN_RATE", threshold: 150 })),
    ).toMatch(/≤ 100/);
    expect(
      validateMetricAlertRuleSemantics(thresholdRule({ metric: "TRADE_COUNT", threshold: 2.5 })),
    ).toMatch(/whole number/);
    expect(
      validateMetricAlertRuleSemantics(thresholdRule({ metric: "DRAWDOWN_PCT", threshold: -5 })),
    ).toMatch(/≥ 0/);
    expect(validateMetricAlertRuleSemantics(thresholdRule())).toBeNull();
  });

  it("requires a threshold for PROGRESS_BELOW goal rules", () => {
    const rule = thresholdRule({
      kind: "GOAL",
      goalId: "b0000000-0000-4000-8000-000000000001",
      goalCondition: "PROGRESS_BELOW",
      thresholdPct: null,
      name: "g",
    } as Partial<MetricAlertRule>);
    expect(validateMetricAlertRuleSemantics(rule)).toMatch(/require a progress threshold/);
  });

  it("documents every registry metric's unit semantics", () => {
    expect(METRIC_ALERT_REGISTRY.WIN_RATE.unit).toBe("PERCENT");
    expect(METRIC_ALERT_REGISTRY.NET_PNL.unit).toBe("MONEY");
    expect(METRIC_ALERT_REGISTRY.TRADE_COUNT.conditions).toContain("EQUAL");
  });
});
