import { http, HttpResponse } from "msw";
import {
  createChecklistInputSchema,
  createPlaybookRuleInputSchema,
  createSetupInputSchema,
  createStrategyInputSchema,
  instantiateTemplateInputSchema,
  updateChecklistInputSchema,
  updatePlaybookRuleInputSchema,
  updateSetupInputSchema,
  updateStrategyInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Professional Playbook domain - strategy CRUD (with server-side versioning),
 * setups, checklist templates, operating rules, duplicate, template library
 * and the ONE aggregate overview endpoint for the module.
 */
export const playbookHandlers = [
  // GET /playbook/overview - counts, recency, performance summary, health.
  http.get(endpoint(apiPaths.playbookOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.playbookOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /strategies/stats - per-strategy aggregates + decay banner target.
  // Registered before GET /strategies for clarity; paths match exactly anyway.
  http.get(endpoint(apiPaths.strategyStats), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.strategyStats());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /playbook/templates - starting-point library (never performance claims).
  http.get(endpoint(apiPaths.playbookTemplates), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listPlaybookTemplates());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /playbook/templates/instantiate - DRAFT strategy from a template.
  http.post(endpoint(apiPaths.playbookTemplateInstantiate), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(instantiateTemplateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.instantiatePlaybookTemplate(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /strategies/:id/duplicate - fresh DRAFT copy (quick action §5).
  http.post(endpoint(apiPaths.strategyDuplicate(":strategyId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(
        mockStore.duplicateStrategy(pathParam(params, "strategyId")),
        { status: 201 },
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /strategies - create a playbook entry
  http.post(endpoint(apiPaths.strategies), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createStrategyInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createStrategy(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /strategies/:id - edit a playbook entry (server bumps the version)
  http.patch(endpoint(apiPaths.strategy(":strategyId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateStrategyInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updateStrategy(pathParam(params, "strategyId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /strategies/:id - 409 while trades are attached (pause instead)
  http.delete(endpoint(apiPaths.strategy(":strategyId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteStrategy(pathParam(params, "strategyId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Setups (§9) ────────────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.setups), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listSetups());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /setups/insights - light 90d backtest + market heuristics per setup.
  // Registered BEFORE /setups/:id-style paths; /setups/insights is exact anyway.
  http.get(endpoint(apiPaths.setupInsights), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.setupInsights());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /strategies/:id/versions - history for the visual diff.
  http.get(endpoint(apiPaths.strategyVersions(":strategyId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listStrategyVersions(pathParam(params, "strategyId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.post(endpoint(apiPaths.setups), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createSetupInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createSetup(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.patch(endpoint(apiPaths.setup(":setupId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateSetupInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateSetup(pathParam(params, "setupId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.delete(endpoint(apiPaths.setup(":setupId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteSetup(pathParam(params, "setupId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Checklist templates (§16) ──────────────────────────────────────────────
  http.get(endpoint(apiPaths.checklists), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listChecklists());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.post(endpoint(apiPaths.checklists), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createChecklistInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createChecklist(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.patch(endpoint(apiPaths.checklist(":checklistId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateChecklistInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updateChecklist(pathParam(params, "checklistId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.delete(endpoint(apiPaths.checklist(":checklistId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteChecklist(pathParam(params, "checklistId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Operating rules (§24) - distinct from the discipline Rules Engine ─────
  http.get(endpoint(apiPaths.playbookRules), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listPlaybookRules());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.post(endpoint(apiPaths.playbookRules), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createPlaybookRuleInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createPlaybookRule(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.patch(endpoint(apiPaths.playbookRule(":ruleId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updatePlaybookRuleInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updatePlaybookRule(pathParam(params, "ruleId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
  http.delete(endpoint(apiPaths.playbookRule(":ruleId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deletePlaybookRule(pathParam(params, "ruleId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
