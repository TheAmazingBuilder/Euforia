import { http, HttpResponse } from "msw";
import {
  csvImportCommitRequestSchema,
  csvImportPreviewRequestSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, readJson, toErrorResponse } from "./utils";

/** Broker CSV import — Phase 10 two-step flow (preview never writes). */
export const csvHandlers = [
  // POST /import/csv/preview — parse + validate the raw file
  http.post(endpoint(apiPaths.csvPreview), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(csvImportPreviewRequestSchema, await readJson(request));
      return HttpResponse.json(mockStore.previewCsv(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /import/csv/commit — import the OK rows of a previewed batch
  http.post(endpoint(apiPaths.csvCommit), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(csvImportCommitRequestSchema, await readJson(request));
      return HttpResponse.json(mockStore.commitCsvImport(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
