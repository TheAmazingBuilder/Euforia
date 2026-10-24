import { http, HttpResponse } from "msw";
import {
  createMetricAlertRuleInputSchema,
  updateMetricAlertRuleInputSchema,
  validateMetricAlertRuleSemantics,
  type MetricAlertRule,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * Metric alert rules (Dashboard Customization Phase 07) - MSW mirror of the
 * NestJS module: rule CRUD (validated by the SAME shared schemas), the
 * manual evaluate stub (deterministic evaluation is a SERVER capability -
 * the mock reports an honest zero-trigger pass) and per-rule event history
 * read from the shared mock inbox (payload.ruleId).
 */

/** In-memory rule documents (session-scoped, like every mock collection). */
const rules: MetricAlertRule[] = [];

/** The mock store is single-user - a stable stand-in owner id. */
const MOCK_USER_ID = "00000000-0000-4000-8000-00000000d07f";

function initialRuleState(): MetricAlertRule["state"] {
  return {
    lastConditionMet: null,
    lastTriggeredAt: null,
    lastEvaluationAt: null,
    lastObservedValue: null,
    lastObservation: "NO_DATA",
    triggerCount: 0,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export const metricAlertHandlers = [
  // GET /alert-rules
  http.get(endpoint(apiPaths.alertRules), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({ rules });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /alert-rules/evaluate - declared BEFORE :ruleId routes
  http.post(endpoint(apiPaths.alertRulesEvaluate), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      // Honest mock semantics: no journal-wide evaluation engine here - the
      // real API evaluates after closed-trade writes and on this endpoint.
      return HttpResponse.json({
        evaluatedRules: 0,
        triggeredEvents: 0,
        skippedNoData: 0,
        failedScopes: 0,
        evaluatedAt: nowIso(),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /alert-rules
  http.post(endpoint(apiPaths.alertRules), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(createMetricAlertRuleInputSchema, await readJson(request));
      const now = nowIso();
      const doc = {
        id: crypto.randomUUID(),
        userId: MOCK_USER_ID,
        name: input.name,
        enabled: input.enabled ?? true,
        cooldownMinutes: input.cooldownMinutes ?? 0,
        accountId: input.kind === "THRESHOLD" ? (input.accountId ?? null) : null,
        strategyId: input.kind === "THRESHOLD" ? (input.strategyId ?? null) : null,
        ...(input.kind === "THRESHOLD"
          ? {
              kind: "THRESHOLD" as const,
              metric: input.metric,
              condition: input.condition,
              threshold: input.threshold,
              period: input.period,
            }
          : {
              kind: "GOAL" as const,
              goalId: input.goalId,
              goalCondition: input.goalCondition,
              thresholdPct: input.thresholdPct ?? null,
            }),
        state: initialRuleState(),
        createdAt: now,
        updatedAt: now,
      } satisfies MetricAlertRule;
      const semanticError = validateMetricAlertRuleSemantics(doc);
      if (semanticError !== null) {
        throw Object.assign(new Error(semanticError), { status: 400 });
      }
      rules.push(doc);
      return HttpResponse.json(doc, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /alert-rules/:ruleId/events - inbox rows referencing the rule
  http.get(endpoint(apiPaths.alertRuleEvents(":ruleId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const ruleId = pathParam(params, "ruleId");
      const rule = rules.find((candidate) => candidate.id === ruleId);
      if (!rule) {
        throw Object.assign(new Error("Alert rule not found"), { status: 404 });
      }
      const { alerts } = mockStore.listAlerts();
      const events = alerts
        .filter(
          (alert) =>
            alert.type === "METRIC_THRESHOLD" &&
            alert.payload !== null &&
            typeof alert.payload === "object" &&
            (alert.payload as Record<string, unknown>).ruleId === ruleId,
        )
        .slice(0, 50);
      return HttpResponse.json({ events });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /alert-rules/:ruleId
  http.patch(endpoint(apiPaths.alertRule(":ruleId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const ruleId = pathParam(params, "ruleId");
      const rule = rules.find((candidate) => candidate.id === ruleId);
      if (!rule) {
        throw Object.assign(new Error("Alert rule not found"), { status: 404 });
      }
      const input = parseBody(updateMetricAlertRuleInputSchema, await readJson(request));
      if (input.name !== undefined) rule.name = input.name;
      if (input.enabled !== undefined) rule.enabled = input.enabled;
      if (input.cooldownMinutes !== undefined) rule.cooldownMinutes = input.cooldownMinutes;
      if (rule.kind === "THRESHOLD") {
        if (input.metric !== undefined) rule.metric = input.metric;
        if (input.condition !== undefined) rule.condition = input.condition;
        if (input.threshold !== undefined) rule.threshold = input.threshold;
        if (input.period !== undefined) rule.period = input.period;
        if (input.accountId !== undefined) rule.accountId = input.accountId ?? null;
        if (input.strategyId !== undefined) rule.strategyId = input.strategyId ?? null;
      } else {
        if (input.goalId !== undefined) rule.goalId = input.goalId;
        if (input.goalCondition !== undefined) rule.goalCondition = input.goalCondition;
        if (input.thresholdPct !== undefined) rule.thresholdPct = input.thresholdPct ?? null;
      }
      rule.updatedAt = nowIso();
      return HttpResponse.json(rule);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /alert-rules/:ruleId
  http.delete(endpoint(apiPaths.alertRule(":ruleId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const ruleId = pathParam(params, "ruleId");
      const index = rules.findIndex((candidate) => candidate.id === ruleId);
      if (index === -1) {
        throw Object.assign(new Error("Alert rule not found"), { status: 404 });
      }
      rules.splice(index, 1);
      return HttpResponse.json({ ok: true });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
