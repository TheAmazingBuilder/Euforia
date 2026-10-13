import { http, HttpResponse } from "msw";
import {
  createAccountInputSchema,
  createBrokerConnectionInputSchema,
  updateAccountInputSchema,
  updateBrokerConnectionInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Multi-portfolio domain — the desk overview, account CRUD, broker
 * connections (connect / sync / auto-import) and the import batch feed.
 */
export const portfolioHandlers = [
  // GET /portfolios/overview — whole desk (may trigger stale auto-imports first)
  http.get(endpoint(apiPaths.portfoliosOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.portfolioOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /accounts — create a journal account
  http.post(endpoint(apiPaths.accounts), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createAccountInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createAccount(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /accounts/:id
  http.patch(endpoint(apiPaths.account(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateAccountInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updateAccount(pathParam(params, "accountId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /accounts/:id — guarded (default flag, remaining trades)
  http.delete(endpoint(apiPaths.account(":accountId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteAccount(pathParam(params, "accountId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /broker-connections — feed list for the desk
  http.get(endpoint(apiPaths.brokerConnections), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listBrokerConnections());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /broker-connections — connect a feed (first sync runs immediately)
  http.post(endpoint(apiPaths.brokerConnections), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createBrokerConnectionInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createBrokerConnection(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /broker-connections/:id — auto-import toggle / label
  http.patch(endpoint(apiPaths.brokerConnection(":connectionId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateBrokerConnectionInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updateBrokerConnection(pathParam(params, "connectionId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /broker-connections/:id
  http.delete(endpoint(apiPaths.brokerConnection(":connectionId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(
        mockStore.deleteBrokerConnection(pathParam(params, "connectionId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /broker-connections/:id/sync — pull the feed now
  http.post(endpoint(apiPaths.brokerConnectionSync(":connectionId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(
        mockStore.syncBrokerConnection(pathParam(params, "connectionId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /import-batches — recent import feed
  http.get(endpoint(apiPaths.importBatches), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listImportBatches());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
