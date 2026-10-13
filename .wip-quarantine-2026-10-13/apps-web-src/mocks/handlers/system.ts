import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import {
  feedReportSchema,
  updateAlertRuleSchema,
  updateFreshnessSchema,
  type AlertRuleKind,
  type ApiWindow,
} from "@cosmoz/shared";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/** System domain — health of the cockpit itself (Monitoring page). */
export const systemHandlers = [
  // GET /system/health — legacy services/latency/incident snapshot
  http.get(endpoint(apiPaths.systemHealth), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.getSystemHealth());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /system/monitoring — the observability snapshot (§3–§17). Async:
  // the store probes the real market service before answering.
  http.get(endpoint(apiPaths.monitoringSnapshot), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const window = (url.searchParams.get("window") ?? "1h") as ApiWindow;
      return HttpResponse.json(await mockStore.getMonitoringSnapshot(window));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /system/monitoring/alert-rules/:kind — configurable alerting (§14)
  http.patch(endpoint(apiPaths.monitoringAlertRule(":kind")), async ({ params, request }) => {
    await latency();
    try {
      const kind = pathParam(params, "kind") as AlertRuleKind;
      const input = parseBody(updateAlertRuleSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateAlertRule(kind, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /system/monitoring/alerts/:id/ack — acknowledge an alert (§14)
  http.post(endpoint(apiPaths.monitoringAlertAck(":alertId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.ackMonitoringAlert(pathParam(params, "alertId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /system/monitoring/freshness — configurable thresholds (§17)
  http.patch(endpoint(apiPaths.monitoringFreshness), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(updateFreshnessSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateFreshness(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /system/monitoring/feed-report — the live session reports feed state
  http.post(endpoint(apiPaths.monitoringFeedReport), async ({ request }) => {
    try {
      const input = parseBody(feedReportSchema, await readJson(request));
      return HttpResponse.json(mockStore.reportClientFeed(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /system/integrations — lightweight demo catalog (toggle screen)
  http.get(endpoint(apiPaths.systemIntegrations), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listSystemIntegrations());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /system/integrations/:id/toggle — flip one connection (simulated)
  http.post(endpoint(apiPaths.systemIntegrationToggle(":integrationId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.toggleSystemIntegration(pathParam(params, "integrationId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
