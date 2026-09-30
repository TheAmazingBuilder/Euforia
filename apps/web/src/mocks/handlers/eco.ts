import { http, HttpResponse } from "msw";
import { upsertCalendarBlockInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, pathParam, parseBody, readJson, toErrorResponse } from "./utils";

/** Economic calendar — GET /eco-events (Priorité 3, feature 10). */
export const ecoHandlers = [
  http.get(endpoint(apiPaths.ecoEvents), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listEcoEvents());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Calendar module upgrades: trading overlay / day-offs / eco blockers ──

  // GET /calendar-view?from&to — day rows + aggregates (days OFF excluded)
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

  // GET /calendar-blocks — marked days
  http.get(endpoint(apiPaths.calendarBlocks), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listCalendarBlocks());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PUT /calendar-blocks — mark a day off / news blocked
  http.put(endpoint(apiPaths.calendarBlocks), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(upsertCalendarBlockInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.upsertCalendarBlock(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /calendar-blocks/:date — unmark a day
  http.delete(endpoint(apiPaths.calendarBlock(":date")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteCalendarBlock(pathParam(params, "date")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /calendar-blocks/import-eco — HIGH-impact days ahead → NEWS blocks
  http.post(endpoint(apiPaths.calendarBlocksImportEco), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.importEcoBlockers());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
