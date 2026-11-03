import { describe, expect, it } from "vitest";
import { metricAlertRuleSchema, type MetricAlertRule } from "@cosmoz/shared";

import { alertEventObservation, alertRuleSummary } from "../alert-rule-summary";

function rule(overrides: Partial<MetricAlertRule> = {}): MetricAlertRule {
  return metricAlertRuleSchema.parse({
    id: "a0000000-0000-4000-8000-000000000001",
    userId: "a0000000-0000-4000-8000-0000000000aa",
    name: "Monthly profit target",
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

describe("alertRuleSummary", () => {
  it("summarizes a threshold rule with unit-aware formatting", () => {
    expect(alertRuleSummary(rule())).toBe(
      "Net realized P&L ≥ $1,000.00 · this month",
    );
  });

  it("mentions scope chips for account/strategy scoping", () => {
    expect(
      alertRuleSummary(
        rule({ accountId: "c0000000-0000-4000-8000-000000000001", strategyId: "none" }),
      ),
    ).toBe("Net realized P&L ≥ $1,000.00 · this month · out of playbook · scoped account");
  });

  it("summarizes goal rules without suite periods", () => {
    expect(
      alertRuleSummary(
        rule({
          kind: "GOAL",
          goalId: "b0000000-0000-4000-8000-000000000001",
          goalCondition: "PROGRESS_BELOW",
          thresholdPct: 50,
          name: "Win rate goal",
        }),
      ),
    ).toBe("Goal alert · when progress < 50%");
  });
});

describe("alertEventObservation", () => {
  it("formats the observation with the payload unit", () => {
    expect(
      alertEventObservation({ observedValue: 1250.5, threshold: 1000, unit: "MONEY" }),
    ).toBe("$1,250.50 (threshold $1,000.00)");
  });

  it("degrades missing values honestly", () => {
    expect(alertEventObservation({ observedValue: null, threshold: null, unit: null })).toBe("-");
  });
});
