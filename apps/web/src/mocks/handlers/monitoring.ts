import { http, HttpResponse } from "msw";

import type {
  MonitoringJobRunResponse,
  MonitoringOverviewResponse,
  MonitoringThresholdsUpdateInput,
} from "@cosmoz/shared";
import { monitoringThresholdsUpdateInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { monitoringEngine } from "@/mocks/monitoring-engine";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Module upgrade — monitoring alerts reach the USER's inbox, not just the
 * board: a newly raised rule pushes a SYSTEM alert into the store (deduped
 * while unread). Wired once at handler-module init.
 */
monitoringEngine.onAlertRaised = (alert) => mockStore.pushMonitoringAlert(alert);

/**
 * Monitoring endpoints (MASTER PROMPT §3, §14). The overview is a single
 * aggregate of OBSERVED state; thresholds are configurable via PATCH; manual
 * job runs only succeed for jobs with real work in this build (honest 409
 * otherwise — no synthetic runs are fabricated).
 */

export const monitoringHandlers = [
  http.get(endpoint(apiPaths.monitoringOverview), async () => {
    try {
      await latency();
      const body: MonitoringOverviewResponse = monitoringEngine.overview(Date.now());
      return HttpResponse.json(body);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.patch(endpoint(apiPaths.monitoringThresholds), async ({ request }) => {
    try {
      await latency();
      const body = parseBody<MonitoringThresholdsUpdateInput>(
        monitoringThresholdsUpdateInputSchema,
        await readJson(request),
      );
      const thresholds = monitoringEngine.updateThresholds(body);
      return HttpResponse.json({ thresholds });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.monitoringJobRun(":jobId")), async ({ params }) => {
    try {
      await latency();
      const jobId = pathParam(params, "jobId");
      const result = monitoringEngine.runJob(jobId);
      const job = monitoringEngine
        .overview(Date.now())
        .jobs.find((candidate) => candidate.id === jobId);
      const body: MonitoringJobRunResponse = {
        accepted: result.accepted,
        run: job?.lastRun ?? null,
        message: result.message,
      };
      return HttpResponse.json(body, { status: result.accepted ? 200 : 409 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
