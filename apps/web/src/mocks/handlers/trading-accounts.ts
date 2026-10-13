import { http, HttpResponse } from "msw";
import {
  tradingAccountConnectInputSchema,
  tradingAccountUpdateInputSchema,
  tradingReconnectInputSchema,
  uuidSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { tradingAccountsEngine } from "@/mocks/trading-accounts-engine";
import { MockError } from "@/mocks/store";
import { authEngine } from "@/mocks/auth-engine";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Authenticated principal — mirrors the Nest @CurrentUser() decorator: the
 * userId always comes from the verified token, never from the client payload.
 */
function requireUserId(request: Request): string {
  const session = authEngine.authenticate(request.headers.get("authorization"));
  if (!session) throw new MockError(401, "Authentication required");
  return session.user.id;
}

/**
 * Trading-accounts MSW handlers (Phase 02) — route-for-route parity with the
 * registered Nest TradingAccountsController. The auth boundary mirrors the
 * global JWT guard: the verified token provides the principal before any
 * store access. Error envelopes carry the stable TRADING_ERROR_CODES `code`
 * so the UI branches identically over MSW and the live bridge.
 *
 * Mock honesty: the only provider this engine serves is the MOCK descriptor
 * (isMock: true). No handler can ever produce a non-mock provider, a live
 * connection claim, or an execution action (none of those routes exist —
 * mirroring the backend's execution red line).
 */
export const tradingAccountsHandlers = [
  http.get(endpoint(apiPaths.tradingAccountProviders), async ({ request }) => {
    await latency();
    try {
      requireUserId(request);
      return HttpResponse.json(tradingAccountsEngine.listProviders());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.tradingAccountConnect), async ({ request }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const body = parseBody(tradingAccountConnectInputSchema, await readJson(request));
      return HttpResponse.json(tradingAccountsEngine.connect(userId, body), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.tradingAccounts), async ({ request }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      return HttpResponse.json(tradingAccountsEngine.list(userId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.patch(endpoint(apiPaths.tradingAccount(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      const body = parseBody(tradingAccountUpdateInputSchema, await readJson(request));
      return HttpResponse.json(tradingAccountsEngine.rename(userId, accountId, body));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.tradingAccount(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.disconnect(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.tradingAccount(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.details(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.tradingAccountPositions(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.positions(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.tradingAccountOrders(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.orders(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.tradingAccountDeals(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.deals(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.tradingAccountTest(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.test(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.tradingAccountReconnect(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      const body = parseBody(tradingReconnectInputSchema, await readJson(request));
      return HttpResponse.json(tradingAccountsEngine.reconnect(userId, accountId, body));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.tradingAccountSync(":accountId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const accountId = uuidSchema.parse(pathParam(params, "accountId"));
      return HttpResponse.json(tradingAccountsEngine.synchronize(userId, accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
