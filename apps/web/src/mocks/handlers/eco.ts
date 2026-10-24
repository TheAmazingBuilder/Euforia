import { http, HttpResponse, passthrough } from "msw";
import { upsertCalendarBlockInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, pathParam, parseBody, readJson, toErrorResponse } from "./utils";

/**
 * Economic calendar - GET /eco-events.
 *
 * Toolbar/eco bridge: this surface now PASSES THROUGH to the Next server
 * route (app/api/eco-events) - the REAL ForexFactory provider answers
 * behind the existing port, with the deterministic fixtures as the
 * honest fallback when the provider is unreachable. MSW stops mocking
 * this ONE route: a browser-side fetch of the real feed is impossible
 * (the provider sends no CORS headers), so the bridge must live
 * server-side. The wire shape is unchanged (canonical EcoEvent + the
 * `source` label).
 */
export const ecoHandlers = [
  http.get(endpoint(apiPaths.ecoEvents), () => passthrough()),

  // ── Calendar module upgrades: trading overlay / day-offs / eco blockers ──

  // GET /calendar-view?from&to - day rows + aggregates (days OFF excluded)
  http.get(endpoint(apiPaths.calendarView), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (from === null || to === null || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        return HttpResponse.json({ message: "Invalid from/to range" }, { status: 422 });
      }
      return HttpResponse.json(mockStore.calendarView(from, to));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /calendar-blocks - marked days
  http.get(endpoint(apiPaths.calendarBlocks), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listCalendarBlocks());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PUT /calendar-blocks - mark a day off / news blocked
  http.put(endpoint(apiPaths.calendarBlocks), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(upsertCalendarBlockInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.upsertCalendarBlock(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /calendar-blocks/:date - unmark a day
  http.delete(endpoint(apiPaths.calendarBlock(":date")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteCalendarBlock(pathParam(params, "date")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /calendar-blocks/import-eco - HIGH-impact days ahead → NEWS blocks
  http.post(endpoint(apiPaths.calendarBlocksImportEco), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.importEcoBlockers());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
