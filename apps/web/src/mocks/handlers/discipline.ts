import { http, HttpResponse } from "msw";
import {
  acknowledgeViolationInputSchema,
  createRuleInputSchema,
  updateRuleInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/** Discipline domain — banner aggregate, alerts inbox, rules engine + log. */
export const disciplineHandlers = [
  // GET /rules/status?accountId= — today's aggregate; refetched after each mutation
  http.get(endpoint(apiPaths.rulesStatus), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("accountId");
      return HttpResponse.json(mockStore.rulesStatus(accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Phase 8 — rules CRUD ────────────────────────────────────────────────

  // GET /rules — the discipline screen's rule cards
  http.get(endpoint(apiPaths.rules), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listRules());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /rules — create a rule
  http.post(endpoint(apiPaths.rules), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createRuleInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createRule(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /rules/:id — params / severity / active toggle
  http.patch(endpoint(apiPaths.rule(":ruleId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateRuleInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateRule(pathParam(params, "ruleId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /rules/:id
  http.delete(endpoint(apiPaths.rule(":ruleId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteRule(pathParam(params, "ruleId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Phase 8 — violation log + acknowledge ───────────────────────────────

  // GET /violations — joined log, newest first, with the month aggregate
  http.get(endpoint(apiPaths.violations), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listViolations());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /violations/:id/acknowledge — row action
  http.patch(endpoint(apiPaths.violationAcknowledge(":violationId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(acknowledgeViolationInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.acknowledgeViolation(pathParam(params, "violationId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /discipline/score — Euforia Discipline Score + month components
  http.get(endpoint(apiPaths.disciplineScore), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.disciplineScore());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /discipline/emotion-matrix — emotion → outcome heatmap rows
  http.get(endpoint(apiPaths.disciplineEmotionMatrix), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.disciplineEmotionMatrix());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /mistakes/ledger — per-mistake frequency + R cost this month
  http.get(endpoint(apiPaths.mistakesLedger), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.mistakesLedger());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /alerts — inbox + unread count for the bell badge
  http.get(endpoint(apiPaths.alerts), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.listAlerts());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /alerts/:id/read — mark an alert as read (inbox row action)
  http.patch(endpoint(apiPaths.alertRead(":alertId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.markAlertRead(pathParam(params, "alertId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
