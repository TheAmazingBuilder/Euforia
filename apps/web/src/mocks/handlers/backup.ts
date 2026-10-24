import { http, HttpResponse } from "msw";
import { backupPayloadSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, readJson, toErrorResponse } from "./utils";

/** Backup export/import - features 12 (Priorité 3). */
export const backupHandlers = [
  // GET /export/backup - full authored-data snapshot
  http.get(endpoint(apiPaths.exportBackup), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.exportBackup());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /import/backup - validate + merge a backup payload
  http.post(endpoint(apiPaths.importBackup), async ({ request }) => {
    await latency();
    try {
      const body = parseBody(backupPayloadSchema, await readJson(request));
      return HttpResponse.json(mockStore.importBackup(body));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
