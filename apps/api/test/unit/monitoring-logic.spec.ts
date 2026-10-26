/**
 * Unit - Monitoring domain logic (Phase 17 §47): threshold merging,
 * API telemetry aggregation, status derivation, alert evaluation with
 * episode dedupe, incident grouping. Pure functions - no Nest, no DB.
 */
import { describe, expect, it } from "vitest";
import type { ApiCallRecord } from "../../src/infrastructure/telemetry/api-telemetry";
import {
  applyConditionToEpisode,
  computeApiMonitoring,
  defaultThresholds,
  deriveApiStatus,
  evaluateAlertRules,
  groupIncidents,
  mapBrokerStatus,
  mergeThresholdPatch,
  percentile,
  toJobRunStatus,
} from "../../src/modules/monitoring/monitoring.logic";
import type { SystemEvent } from "../../src/shared/contracts";

function call(overrides: Partial<ApiCallRecord> = {}): ApiCallRecord {
  return {
    routeKey: "GET /api/v1/trades",
    statusCode: 200,
    durationMs: 10,
    at: new Date("2026-10-04T12:00:00Z"),
    userId: "user-1",
    ...overrides,
  };
}

describe("percentile (nearest-rank)", () => {
  it("returns 0 for an empty set and the nearest-rank value otherwise", () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(percentile([42], 95)).toBe(42);
  });
});

describe("thresholds", () => {
  it("merges a patch without touching untouched rules", () => {
    const current = defaultThresholds();
    const merged = mergeThresholdPatch(current, {
      rules: [{ id: "API_LATENCY", thresholdValue: 800 }],
    });
    const latency = merged.rules.find((rule) => rule.id === "API_LATENCY")!;
    expect(latency.thresholdValue).toBe(800);
    // The label travels with the knob (mock parity, §C.2).
    expect(latency.thresholdLabel).toContain("800");
    const untouched = merged.rules.find((rule) => rule.id === "API_DEGRADED")!;
    expect(untouched.thresholdValue).toBe(10);
    expect(merged.freshness).toEqual(current.freshness);
  });

  it("toggles rules and merges freshness knobs, persisting semantics intact", () => {
    const merged = mergeThresholdPatch(defaultThresholds(), {
      freshness: { liveMaxMs: 5_000 },
      rules: [{ id: "SYNC_FAILURES", enabled: false, thresholdValue: null }],
    });
    expect(merged.freshness.liveMaxMs).toBe(5_000);
    expect(merged.freshness.delayedMaxMs).toBe(10_000);
    const sync = merged.rules.find((rule) => rule.id === "SYNC_FAILURES")!;
    expect(sync.enabled).toBe(false);
    expect(sync.thresholdValue).toBeNull();
  });
});

describe("computeApiMonitoring", () => {
  it("aggregates counts, error rate, histogram, slowest and buckets", () => {
    const now = new Date("2026-10-04T12:29:30Z");
    const calls = [
      call({ routeKey: "GET /a", durationMs: 100, at: new Date("2026-10-04T12:29:00Z") }),
      call({ routeKey: "GET /a", durationMs: 300, statusCode: 500, at: new Date("2026-10-04T12:29:10Z") }),
      call({ routeKey: "POST /b", durationMs: 20, at: new Date("2026-10-04T12:28:00Z") }),
      call({ routeKey: "GET /c", durationMs: 5, statusCode: 429, at: new Date("2026-10-04T12:00:00Z") }),
    ];
    const api = computeApiMonitoring(calls, now);
    expect(api.totalRequests).toBe(4);
    expect(api.totalErrors).toBe(2);
    expect(api.errorRatePct).toBe(50);
    expect(api.rateLimitedTotal).toBe(1);
    expect(api.statusCodes).toEqual([
      { code: 200, count: 2 },
      { code: 429, count: 1 },
      { code: 500, count: 1 },
    ]);
    const endpointA = api.endpoints.find((endpoint) => endpoint.key === "GET /a")!;
    expect(endpointA.count).toBe(2);
    expect(endpointA.errorCount).toBe(1);
    expect(endpointA.p95Ms).toBe(300);
    expect(api.slowest[0]!.key).toBe("GET /a");
    expect(api.buckets).toHaveLength(30);
    const lastBucket = api.buckets[api.buckets.length - 1]!;
    expect(lastBucket.count).toBeGreaterThanOrEqual(2);
  });

  it("reports an honest zero-state", () => {
    const api = computeApiMonitoring([], new Date("2026-10-04T12:00:00Z"));
    expect(api.totalRequests).toBe(0);
    expect(api.errorRatePct).toBe(0);
    expect(api.endpoints).toEqual([]);
    expect(api.buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe("deriveApiStatus", () => {
  it("is UNKNOWN with no data, DEGRADED past the error-rate line, OPERATIONAL otherwise", () => {
    const empty = computeApiMonitoring([], new Date());
    expect(deriveApiStatus(empty).status).toBe("UNKNOWN");

    const many = Array.from({ length: 10 }, (_, index) =>
      call({ statusCode: index < 2 ? 500 : 200 }),
    );
    const degraded = computeApiMonitoring(many, new Date());
    expect(deriveApiStatus(degraded).status).toBe("DEGRADED");

    const healthy = computeApiMonitoring([call()], new Date());
    expect(deriveApiStatus(healthy).status).toBe("OPERATIONAL");
  });
});

describe("mapBrokerStatus (Accounts facts → Monitoring status)", () => {
  it("maps auth-class failures to AUTH_FAILED and others to DEGRADED", () => {
    expect(mapBrokerStatus({ status: "CONNECTED", lastError: null, lastFailedRunErrorCode: null })).toBe("CONNECTED");
    expect(mapBrokerStatus({ status: "CONNECTING", lastError: null, lastFailedRunErrorCode: null })).toBe("CONNECTING");
    expect(mapBrokerStatus({ status: "DISCONNECTED", lastError: null, lastFailedRunErrorCode: null })).toBe("DISCONNECTED");
    expect(
      mapBrokerStatus({ status: "ERROR", lastError: "bad key", lastFailedRunErrorCode: "INVALID_CREDENTIALS" }),
    ).toBe("AUTH_FAILED");
    expect(
      mapBrokerStatus({ status: "ERROR", lastError: "timeout", lastFailedRunErrorCode: "CONNECTION_TIMEOUT" }),
    ).toBe("DEGRADED");
    expect(mapBrokerStatus({ status: "SOMETHING_NEW", lastError: null, lastFailedRunErrorCode: null })).toBe("DISCONNECTED");
  });
});

describe("toJobRunStatus (Accounts sync-run status → job ledger status)", () => {
  it("maps the statuses the repository actually writes (RUNNING/COMPLETED/FAILED)", () => {
    // Regression: the board filtered on "SUCCESS" - a status the accounts
    // repository never writes - so successCount/latency were permanently
    // zero/null (Phase 00 defect). The mapping must recognize the REAL
    // written values: RUNNING | COMPLETED | FAILED.
    expect(toJobRunStatus("RUNNING")).toBe("RUNNING");
    expect(toJobRunStatus("COMPLETED")).toBe("SUCCESS");
    expect(toJobRunStatus("FAILED")).toBe("FAILED");
  });

  it("never mistakes an unknown or partial status for a healthy one", () => {
    // PARTIAL (reserved, Phase 03) carries failures - conservative FAILED.
    // Unknown future values land on FAILED, never on SUCCESS.
    expect(toJobRunStatus("PARTIAL")).toBe("FAILED");
    expect(toJobRunStatus("SOMETHING_NEW")).toBe("FAILED");
    expect(toJobRunStatus("SUCCESS")).toBe("FAILED");
  });
});

describe("evaluateAlertRules", () => {
  it("gates API rules on the 10-request minimum and honors the knobs", () => {
    const thresholds = defaultThresholds();
    const fewRequests = computeApiMonitoring(
      Array.from({ length: 9 }, () => call({ statusCode: 500 })),
      new Date(),
    );
    expect(
      evaluateAlertRules({ api: fewRequests, degradedBrokers: [], syncFailures: 0, jobFailures: 0, notificationFailures: 0 }, thresholds),
    ).toEqual([]);

    const manyFailing = computeApiMonitoring(
      Array.from({ length: 10 }, () => call({ statusCode: 500 })),
      new Date(),
    );
    const raised = evaluateAlertRules(
      { api: manyFailing, degradedBrokers: [], syncFailures: 0, jobFailures: 0, notificationFailures: 0 },
      thresholds,
    );
    expect(raised.map((condition) => condition.ruleId)).toContain("API_DEGRADED");

    // Custom knob: raising the latency threshold to an unreachable value
    // must suppress the latency alert (knob honored, not hardcoded).
    const tuned = mergeThresholdPatch(thresholds, { rules: [{ id: "API_LATENCY", thresholdValue: 60_000 }] });
    const slow = computeApiMonitoring(
      Array.from({ length: 10 }, () => call({ durationMs: 2_000 })),
      new Date(),
    );
    expect(
      evaluateAlertRules({ api: slow, degradedBrokers: [], syncFailures: 0, jobFailures: 0, notificationFailures: 0 }, tuned).some(
        (condition) => condition.ruleId === "API_LATENCY",
      ),
    ).toBe(false);
  });

  it("raises broker (CRITICAL), job (knob), sync and notification rules; disabled rules stay silent", () => {
    const thresholds = defaultThresholds();
    const emptyApi = computeApiMonitoring([], new Date());
    const raised = evaluateAlertRules(
      { api: emptyApi, degradedBrokers: ["MT5 (DEGRADED)"], syncFailures: 1, jobFailures: 2, notificationFailures: 1 },
      thresholds,
    );
    const byRule = new Map(raised.map((condition) => [condition.ruleId, condition]));
    expect(byRule.get("BROKER_DISCONNECTED")!.severity).toBe("CRITICAL");
    expect(byRule.get("JOB_FAILURES")).toBeDefined();
    expect(byRule.get("SYNC_FAILURES")).toBeDefined();
    expect(byRule.get("NOTIFICATION_FAILURES")).toBeDefined();
    // MARKET_DATA_STALE / QUEUE_BACKLOG have no server-side signal in this
    // build - never fabricated (§16/§57).
    expect(byRule.has("MARKET_DATA_STALE")).toBe(false);
    expect(byRule.has("QUEUE_BACKLOG")).toBe(false);

    const disabled = mergeThresholdPatch(thresholds, { rules: [{ id: "BROKER_DISCONNECTED", enabled: false }] });
    expect(
      evaluateAlertRules({ api: emptyApi, degradedBrokers: ["MT5 (DEGRADED)"], syncFailures: 0, jobFailures: 0, notificationFailures: 0 }, disabled),
    ).toEqual([]);
  });
});

describe("applyConditionToEpisode (§39 dedupe)", () => {
  it("raises once, counts occurrences, then resolves when the condition clears", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    const condition = { ruleId: "API_LATENCY" as const, severity: "WARNING" as const, message: "slow" };

    const first = applyConditionToEpisode(undefined, condition, now);
    expect(first.raised).toBe(true);
    expect(first.episode.alert.occurrences).toBe(1);

    const second = applyConditionToEpisode(first.episode, condition, new Date("2026-10-04T12:01:00Z"));
    expect(second.raised).toBe(false);
    expect(second.episode.alert.occurrences).toBe(2);

    const resolved = applyConditionToEpisode(second.episode, undefined, new Date("2026-10-04T12:02:00Z"));
    expect(resolved.resolved).toBe(true);
    expect(resolved.episode.alert.resolvedAt).not.toBeNull();

    const reRaised = applyConditionToEpisode(resolved.episode, condition, new Date("2026-10-04T12:03:00Z"));
    expect(reRaised.raised).toBe(true);
    expect(reRaised.episode.alert.resolvedAt).toBeNull();
  });
});

describe("groupIncidents", () => {
  it("groups by correlationKey, resolves on SERVICE_RECOVERED and never invents a root cause", () => {
    const events: SystemEvent[] = [
      { id: "e1", at: "2026-10-04T12:00:00Z", source: "monitoring", type: "SERVICE_DEGRADED", level: "WARNING", message: "p95 high", correlationKey: "alert:API_LATENCY" },
      { id: "e2", at: "2026-10-04T12:01:00Z", source: "monitoring", type: "SERVICE_DEGRADED", level: "WARNING", message: "p95 high", correlationKey: "alert:API_LATENCY" },
      { id: "e3", at: "2026-10-04T12:02:00Z", source: "monitoring", type: "SERVICE_RECOVERED", level: "INFO", message: "cleared", correlationKey: "alert:API_LATENCY" },
      { id: "e4", at: "2026-10-04T12:03:00Z", source: "accounts", type: "SYNC_FAILURE", level: "WARNING", message: "sync failed", correlationKey: "sync:r1" },
    ];
    const incidents = groupIncidents(events);
    expect(incidents).toHaveLength(2);
    const resolved = incidents.find((incident) => incident.service === "monitoring")!;
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.durationMs).toBe(120_000);
    expect(resolved.rootCause).toBeNull();
    const open = incidents.find((incident) => incident.service === "accounts")!;
    expect(open.status).toBe("OPEN");
    expect(open.durationMs).toBeNull();
  });
});
