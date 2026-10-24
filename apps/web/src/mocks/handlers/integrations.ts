import { http, HttpResponse } from "msw";
import type {
  IntegrationConnectInput,
  WebhookSimulateInput,
} from "@cosmoz/shared";
import {
  integrationConnectInputSchema,
  webhookSimulateInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { integrationEngine } from "@/mocks/integration-engine";
import { endpoint, latency, parseBody, pathParam, toErrorResponse } from "./utils";

/**
 * Integration Hub endpoints (MASTER PROMPT §5–§27). Every action validates
 * its input against the shared Zod contract and maps engine results to HTTP
 * statuses - the engine itself stays transport-free.
 */

export const integrationHandlers = [
  /** GET /integrations/overview - the hub's single aggregate. */
  http.get(endpoint(apiPaths.integrationsOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(integrationEngine.overview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /integrations/providers/:id/connect { vaultRef } (§25, §18). */
  http.post(endpoint(apiPaths.integrationConnect(":providerId")), async ({ params, request }) => {
    await latency();
    try {
      const providerId = pathParam(params, "providerId");
      const input = parseBody<IntegrationConnectInput>(
        integrationConnectInputSchema,
        await request.json().catch(() => null),
      );
      const result = integrationEngine.connect(providerId, input);
      if (!result.ok) {
        return HttpResponse.json({ error: result.message, code: result.code }, { status: result.status });
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /integrations/providers/:id/disconnect (§26 - history preserved). */
  http.post(endpoint(apiPaths.integrationDisconnect(":providerId")), async ({ params }) => {
    await latency();
    try {
      const providerId = pathParam(params, "providerId");
      const result = integrationEngine.disconnect(providerId);
      if (!result.ok) {
        return HttpResponse.json({ error: result.message, code: result.code }, { status: result.status });
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /integrations/providers/:id/test (§27 - safe, never trades). */
  http.post(endpoint(apiPaths.integrationTest(":providerId")), async ({ params }) => {
    await latency();
    try {
      const providerId = pathParam(params, "providerId");
      const result = integrationEngine.test(providerId);
      if (!result.ok) {
        return HttpResponse.json({ error: result.message, code: result.code }, { status: result.status });
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /integrations/providers/:id/sync (§13/§16/§17). */
  http.post(endpoint(apiPaths.integrationSync(":providerId")), async ({ params }) => {
    await latency();
    try {
      const providerId = pathParam(params, "providerId");
      const result = integrationEngine.sync(providerId, Date.now());
      if (!result.ok) {
        const response = HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
        if (result.retryAfterMs !== undefined) {
          response.headers.set("Retry-After", Math.ceil(result.retryAfterMs / 1000).toString());
        }
        return response;
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /integrations/webhooks/:endpointId/simulate - §12 pipeline test. */
  http.post(endpoint(apiPaths.integrationWebhookSimulate(":endpointId")), async ({ params, request }) => {
    try {
      const endpointId = pathParam(params, "endpointId");
      const raw = await request.json().catch(() => null);
      if (raw === null) {
        return HttpResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
      }
      const input: WebhookSimulateInput = webhookSimulateInputSchema.parse(raw);
      const result = await integrationEngine.simulateWebhook(endpointId, input, Date.now());
      if (!result.ok) {
        return HttpResponse.json({ error: result.message, code: result.code }, { status: result.status });
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
