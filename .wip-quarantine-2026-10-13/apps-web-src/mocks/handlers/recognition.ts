import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import {
  createRecognitionJobInputSchema,
  updateTradeDraftInputSchema,
  uploadScreenshotInputSchema,
  type RecognitionJobListQuery,
} from "@/lib/recognition/contract";
import { ocrRecognitionEngine, OcrMockError } from "@/mocks/ocr-engine";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * Recognition handlers — the mock adapter boundary (§41). Every private
 * route is auth-guarded; static routes are registered before :id routes so
 * "uploads"/"jobs" never shadow a dynamic id. The handler maps engine
 * errors to { error, code } responses (§45-style) and never leaks engine
 * internals to the client.
 *
 * NOTE ON BYTES: the live wire carries the screenshot bytes inside a
 * data-URL envelope (OCR backend V1). The V1 mock remains METADATA-ONLY —
 * it derives name/mime/size from the envelope and never decodes the image.
 */

/** Single-tenant mock: the authenticated demo user owns every job. */
const MOCK_OWNER_ID = "usr_demo";

/** Declared MIME from the data-URL envelope (never decoded by the mock). */
function declaredMime(dataUrl: unknown): string {
  const match = /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/.exec(
    typeof dataUrl === "string" ? dataUrl : "",
  );
  return match?.[1] ?? "image/png";
}

/** PDF page count — simulated in the mocked build from the payload size. */
function simulatedPageCount(dataUrl: unknown): number | undefined {
  const isPdf = typeof dataUrl === "string" && dataUrl.startsWith("data:application/pdf;");
  if (!isPdf) return undefined;
  const size = derivedSizeBytes(dataUrl);
  return Math.min(20, Math.max(1, Math.ceil(size / 120_000)));
}

/** Upper bound of the decoded size — derived without touching the bytes. */
function derivedSizeBytes(dataUrl: unknown): number {
  const base64 = typeof dataUrl === "string" ? dataUrl.split(";base64,")[1] ?? "" : "";
  return Math.max(1, Math.floor((base64.length * 3) / 4));
}

function withEngineError(error: unknown): Response {
  if (!(error instanceof OcrMockError)) {
    // Surface the real fault in the browser console — the generic 500 body
    // alone makes browser-flow debugging blind (V2 diagnosis aid).
    console.error("[ocr-mock] unexpected engine error", error);
  }
  if (error instanceof OcrMockError) {
    return HttpResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return toErrorResponse(error);
}

export const recognitionHandlers = [
  // ── Upload ────────────────────────────────────────────────────────────────
  http.post(endpoint(apiPaths.recognitionUpload), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const body = (await readJson(request)) as { fileDataUrl?: unknown; name?: unknown };
      if (typeof body?.name !== "string" || body.name.length === 0 || body.name.length > 255) {
        return HttpResponse.json(
          { error: "The screenshot name is required (1–255 characters).", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      if (
        typeof body?.fileDataUrl !== "string" ||
        !(body.fileDataUrl.startsWith("data:image/") || body.fileDataUrl.startsWith("data:application/pdf;"))
      ) {
        return HttpResponse.json(
          { error: "The payload must be a base64 data URL of an image or a PDF statement.", code: "INVALID_IMAGE" },
          { status: 400 },
        );
      }
      const input = parseBody(uploadScreenshotInputSchema, {
        name: body.name,
        sizeBytes: derivedSizeBytes(body.fileDataUrl),
        mimeType: declaredMime(body.fileDataUrl),
        width: null,
        height: null,
        documentPageCount: simulatedPageCount(body.fileDataUrl),
      });
      return HttpResponse.json(ocrRecognitionEngine.uploadScreenshot(input, Date.now()));
    } catch (error) {
      return withEngineError(error);
    }
  }),

  // ── Jobs collection ───────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.recognitionJobs), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      // V3 history filters (spec §62) — declared facets only; unknown keys
      // are ignored, absent facets fall back to the unfiltered list.
      const url = new URL(request.url);
      const params = url.searchParams;
      const query: RecognitionJobListQuery = {
        status: (params.get("status") ?? undefined) as RecognitionJobListQuery["status"],
        platform: (params.get("platform") ?? undefined) as RecognitionJobListQuery["platform"],
        mimeType: (params.get("mimeType") ?? undefined) as RecognitionJobListQuery["mimeType"],
        corrected: (params.get("corrected") ?? undefined) as RecognitionJobListQuery["corrected"],
        duplicate: (params.get("duplicate") ?? undefined) as RecognitionJobListQuery["duplicate"],
        minConfidence: params.get("minConfidence") !== null ? Number(params.get("minConfidence")) : undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
      };
      return HttpResponse.json({
        jobs: ocrRecognitionEngine.listJobs(query, Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionJobs), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(createRecognitionJobInputSchema, await readJson(request));
      return HttpResponse.json({
        job: ocrRecognitionEngine.createJob(input, MOCK_OWNER_ID, Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  // ── Per-job routes ────────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.recognitionJob(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        job: ocrRecognitionEngine.getJob(pathParam(params, "jobId"), Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.delete(endpoint(apiPaths.recognitionJob(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      ocrRecognitionEngine.deleteJob(pathParam(params, "jobId"));
      return HttpResponse.json({ ok: true });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionJobResult(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        result: ocrRecognitionEngine.getResult(pathParam(params, "jobId"), Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionJobDraft(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        draft: ocrRecognitionEngine.getDraft(pathParam(params, "jobId")),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.put(endpoint(apiPaths.recognitionJobDraft(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(updateTradeDraftInputSchema, await readJson(request));
      return HttpResponse.json({
        draft: ocrRecognitionEngine.updateDraft(pathParam(params, "jobId"), input, Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionJobConfirm(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const body = ((await readJson(request).catch(() => ({}))) ?? {}) as {
        tradeIndexes?: unknown;
        accountId?: unknown;
      };
      const input = {
        ...(Array.isArray(body.tradeIndexes) ? { tradeIndexes: body.tradeIndexes as number[] } : {}),
        ...(typeof body.accountId === "string" ? { accountId: body.accountId } : {}),
      };
      return HttpResponse.json(
        ocrRecognitionEngine.confirmImport(pathParam(params, "jobId"), Date.now(), input),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionJobCancel(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        job: ocrRecognitionEngine.cancelJob(pathParam(params, "jobId"), Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionJobRetry(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        job: ocrRecognitionEngine.retryJob(pathParam(params, "jobId"), Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  // ── V2 — multi-trade drafts, crop re-OCR, quality & storage ───────────────

  http.get(endpoint(apiPaths.recognitionJobDrafts(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        drafts: ocrRecognitionEngine.getDrafts(pathParam(params, "jobId")),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.put(endpoint("/recognition/jobs/:jobId/drafts/:tradeIndex"), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const tradeIndex = Number(pathParam(params, "tradeIndex"));
      if (!Number.isInteger(tradeIndex) || tradeIndex < 1 || tradeIndex > 20) {
        return HttpResponse.json(
          { error: "The trade index must be an integer between 1 and 20.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      const input = parseBody(updateTradeDraftInputSchema, await readJson(request));
      return HttpResponse.json({
        draft: ocrRecognitionEngine.updateDraft(pathParam(params, "jobId"), input, Date.now(), tradeIndex),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionJobRecrop(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const body = (await readJson(request)) as { region?: unknown; tradeIndex?: unknown };
      const region = body?.region as { x: number; y: number; width: number; height: number } | undefined;
      if (
        region === undefined ||
        typeof region.x !== "number" ||
        typeof region.y !== "number" ||
        typeof region.width !== "number" ||
        typeof region.height !== "number"
      ) {
        return HttpResponse.json(
          { error: "A normalized crop region is required.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      const tradeIndex = typeof body.tradeIndex === "number" ? body.tradeIndex : 1;
      return HttpResponse.json({
        result: ocrRecognitionEngine.recrop(pathParam(params, "jobId"), region, tradeIndex, Date.now()),
      });
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionSuggestions), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const url = new URL(request.url);
      const symbol = url.searchParams.get("symbol");
      return HttpResponse.json(ocrRecognitionEngine.getSuggestions(symbol));
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionAnalytics), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const url = new URL(request.url);
      const days = Number(url.searchParams.get("days") ?? "30");
      return HttpResponse.json(ocrRecognitionEngine.getAnalytics(Number.isFinite(days) ? days : 30));
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionStorage), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(ocrRecognitionEngine.getStorage());
    } catch (error) {
      return withEngineError(error);
    }
  }),

  // ── V3 — reprocess, fusion groups, collections ────────────────────────────

  http.post(endpoint(apiPaths.recognitionJobReprocess(":jobId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(
        ocrRecognitionEngine.reprocessJob(pathParam(params, "jobId"), Date.now()),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionGroups), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(ocrRecognitionEngine.listGroups());
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionGroups), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const body = (await readJson(request)) as { jobIds?: unknown };
      return HttpResponse.json(
        ocrRecognitionEngine.createGroup({ jobIds: body?.jobIds }, MOCK_OWNER_ID, Date.now()),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionGroup(":groupId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(ocrRecognitionEngine.getGroup(pathParam(params, "groupId")));
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.delete(endpoint(apiPaths.recognitionGroup(":groupId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(ocrRecognitionEngine.discardGroup(pathParam(params, "groupId")));
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.put(endpoint(apiPaths.recognitionGroupDraft(":groupId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(updateTradeDraftInputSchema, await readJson(request));
      return HttpResponse.json(
        ocrRecognitionEngine.updateGroupDraft(pathParam(params, "groupId"), input, Date.now()),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionGroupConfirm(":groupId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const body = ((await readJson(request).catch(() => ({}))) ?? {}) as { accountId?: unknown };
      const input = typeof body.accountId === "string" ? { accountId: body.accountId } : {};
      return HttpResponse.json(
        ocrRecognitionEngine.confirmGroup(pathParam(params, "groupId"), Date.now(), input),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionCollections), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(ocrRecognitionEngine.listCollections());
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionCollections), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const body = await readJson(request);
      return HttpResponse.json(ocrRecognitionEngine.createCollection(body, Date.now()));
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.get(endpoint(apiPaths.recognitionCollection(":collectionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(
        ocrRecognitionEngine.getCollection(pathParam(params, "collectionId")),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.delete(endpoint(apiPaths.recognitionCollection(":collectionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(
        ocrRecognitionEngine.deleteCollection(pathParam(params, "collectionId")),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.post(endpoint(apiPaths.recognitionCollectionAssets(":collectionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const body = (await readJson(request)) as { assetId?: unknown };
      if (typeof body?.assetId !== "string") {
        return HttpResponse.json(
          { error: "An assetId is required.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      return HttpResponse.json(
        ocrRecognitionEngine.addCollectionAsset(pathParam(params, "collectionId"), body.assetId),
      );
    } catch (error) {
      return withEngineError(error);
    }
  }),

  http.delete(
    endpoint(apiPaths.recognitionCollectionAsset(":collectionId", ":assetId")),
    async ({ request, params }) => {
      await latency();
      try {
        requireAuth(request);
        return HttpResponse.json(
          ocrRecognitionEngine.removeCollectionAsset(
            pathParam(params, "collectionId"),
            pathParam(params, "assetId"),
          ),
        );
      } catch (error) {
        return withEngineError(error);
      }
    },
  ),
];
