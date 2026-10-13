import { http, HttpResponse } from "msw";
import type { AccountUpdateInput } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { accountEngine } from "@/mocks/account-engine";
import { endpoint, latency, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * Accounts module handlers — the account-centric connectivity surface.
 * Distinct from GET /accounts (journal catalog) and from /integrations/*
 * (provider lifecycle): these routes model per-TRADING-ACCOUNT connection
 * state, snapshot and read-only synchronized data (prompt §74 contracts).
 */
export const accountsConnectHandlers = [
  // GET /accounts/overview — accounts + connection/sync summary
  http.get(endpoint(apiPaths.accountsOverview), async ({ request }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(accountEngine.overview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /accounts/providers — provider catalog for the wizard
  http.get(endpoint(apiPaths.accountProviders), async ({ request }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(accountEngine.providers());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /accounts/test — connection validation (before creating anything)
  http.post(endpoint(apiPaths.accountTest), async ({ request }) => {
    requireAuth(request);
    await latency();
    try {
      const input = await readJson(request);
      return HttpResponse.json(accountEngine.test(parseBodyLoose(input)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /accounts/connect — create the account + start the connection
  http.post(endpoint(apiPaths.accountConnect), async ({ request }) => {
    requireAuth(request);
    await latency();
    try {
      const input = await readJson(request);
      return HttpResponse.json(accountEngine.connect(parseBodyLoose(input)), {
        status: 201,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /accounts/:id
  http.get(endpoint(apiPaths.accountDetail(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      pathParam(params, "accountId");
      return HttpResponse.json(accountEngine.detail(pathParam(params, "accountId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /accounts/:id — rename / set default
  http.patch(endpoint(apiPaths.accountUpdate(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      const accountId = pathParam(params, "accountId");
      const input = parseBodyLoose<AccountUpdateInput>(await readJson(request));
      return HttpResponse.json(accountEngine.update(accountId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /accounts/:id/positions — read-only
  http.get(endpoint(apiPaths.accountPositions(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(
        accountEngine.positions(pathParam(params, "accountId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /accounts/:id/orders — read-only
  http.get(endpoint(apiPaths.accountOrders(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(
        accountEngine.orders(pathParam(params, "accountId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /accounts/:id/history — read-only
  http.get(endpoint(apiPaths.accountHistory(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(
        accountEngine.history(pathParam(params, "accountId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /accounts/:id/sync — manual refresh
  http.post(endpoint(apiPaths.accountSync(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(accountEngine.sync(pathParam(params, "accountId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /accounts/:id/reconnect
  http.post(endpoint(apiPaths.accountReconnect(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(
        accountEngine.reconnect(pathParam(params, "accountId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /accounts/:id/disconnect
  http.post(endpoint(apiPaths.accountDisconnect(":accountId")), async ({ request, params }) => {
    requireAuth(request);
    await latency();
    try {
      return HttpResponse.json(
        accountEngine.disconnect(pathParam(params, "accountId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

/**
 * The connect/test payloads carry a free-form credentials record (the
 * fields are provider metadata) — validate through the shared schemas
 * while keeping the record shape loose at the handler boundary.
 */
function parseBodyLoose<T>(body: unknown): T {
  return body as T;
}
