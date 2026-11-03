import {
  METRIC_ALERT_CONDITION_LABELS,
  METRIC_ALERT_PERIOD_LABELS,
  METRIC_ALERT_REGISTRY,
  formatMetricAlertValue,
  type MetricAlertRule,
} from "@cosmoz/shared";

/**
 * Pure presentation helpers for metric alert rules (Phase 07) - one
 * formatter shared with the API's inbox copy (no client-side drift).
 */

/** Compact human summary of a rule, e.g.
 * "Net realized P&L ≥ $1,000.00 · this month · all accounts". */
export function alertRuleSummary(rule: MetricAlertRule): string {
  if (rule.kind === "GOAL") {
    const condition =
      rule.goalCondition === "ACHIEVED"
        ? "when achieved"
        : `when progress < ${rule.thresholdPct ?? 0}%`;
    return `Goal alert · ${condition}`;
  }
  const meta = METRIC_ALERT_REGISTRY[rule.metric];
  const condition = METRIC_ALERT_CONDITION_LABELS[rule.condition];
  const parts = [
    `${meta.label} ${condition} ${formatMetricAlertValue(meta.unit, rule.threshold)}`,
    METRIC_ALERT_PERIOD_LABELS[rule.period],
  ];
  if (rule.strategyId === "none") parts.push("out of playbook");
  else if (rule.strategyId) parts.push("scoped strategy");
  if (rule.accountId) parts.push("scoped account");
  return parts.join(" · ");
}

/** The observation of a METRIC_THRESHOLD payload, unit-formatted. */
export function alertEventObservation(payload: {
  observedValue: number | null;
  threshold: number | null;
  unit: string | null;
}): string {
  const unit = (payload.unit ?? "COUNT") as Parameters<typeof formatMetricAlertValue>[0];
  const observed =
    payload.observedValue === null ? "-" : formatMetricAlertValue(unit, payload.observedValue);
  const threshold =
    payload.threshold === null
      ? ""
      : ` (threshold ${formatMetricAlertValue(unit, payload.threshold)})`;
  return `${observed}${threshold}`;
}
