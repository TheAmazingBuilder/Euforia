import { http, HttpResponse } from "msw";
import type { ZodType } from "zod";

import type {
  OcrCreateInput,
  OcrRecognition,
  OcrRecognitionPage,
  OcrRecognitionResponse,
} from "@cosmoz/shared";
import {
  ocrConfirmInputSchema,
  ocrCreateInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * OCR & screenshot recognition handlers — the mocked mirror of the NestJS
 * OcrController (Phase 19 contract). The mock is a DETERMINISTIC SIMULATION
 * of the engine pipeline: it never runs real OCR, it produces a plausible,
 * contract-valid extraction seeded from the image checksum, with mixed
 * confidence bands and validation statuses so the review workflow is
 * exercised end to end (upload → review → confirm / delete).
 *
 * House rules honored here: every route is auth-guarded, unknown fields are
 * stripped by the shared schemas, financial values travel as decimal
 * strings, and the mock NEVER creates a Trade (recognition + confirmation
 * only — Trading Core owns the canonical journal).
 */

/** Session-scoped store — recognition id → persisted aggregate + upload. */
const store = new Map<string, OcrRecognition & { imageDataUrl: string }>();

// ── Deterministic helpers (seeded from the image checksum) ──────────────────

function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return digest.then((buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
}

/** Minimal PNG IHDR / JPEG SOF dimension probe — real headers, no libs. */
function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } {
  try {
    if (mime === "image/png" && bytes.length > 24 && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mime === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) break;
        const marker = bytes[offset + 1];
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
        }
        offset += 2 + length;
      }
    }
  } catch {
    // fall through to the deterministic default
  }
  return { width: 1280, height: 720 };
}

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const FIELD_KEYS = [
  "symbol", "direction", "volume", "entryPrice", "exitPrice",
  "stopLoss", "takeProfit", "profit", "openTime", "closeTime",
] as const;

const RAW_TEMPLATES: Record<string, string[]> = {
  symbol: ["EURUSD", "XAUUSDm", "BTCUSD", "US30.cash"],
  direction: ["buy", "sell", "BUY 0.50", "sell limit"],
  volume: ["0.50 lots", "1.00", "0.25 lot"],
  entryPrice: ["1.08452", "2 412.30", "64 210.5"],
  exitPrice: ["1.08390", "2 408.75", "64 511.0"],
  stopLoss: ["1.08590", "2 419.80", "63 940.0"],
  takeProfit: ["1.08210", "2 395.40", "64 900.0"],
  profit: ["+128.40 USD", "-56.20", "212.75"],
  openTime: ["2026-10-04 09:31:22", "10/03 14:05:10"],
  closeTime: ["2026-10-04 11:47:09", "10/03 16:22:44"],
};

/**
 * Deterministic pseudo-extraction: the checksum seeds which fields read
 * cleanly (VALID/HIGH) and which stay ambiguous — mirroring the honest
 * uncertainty contract (missing values preserved, never silently guessed).
 */
function simulateExtraction(checksum: string): OcrRecognition["fields"] {
  const seed = Number.parseInt(checksum.slice(0, 8), 16) || 1;
  const random = seededRandom(seed);
  return FIELD_KEYS.map((field) => {
    const roll = random();
    const rawValue = RAW_TEMPLATES[field][Math.floor(random() * RAW_TEMPLATES[field].length)];
    const normalizedValue = normalizeMockValue(field, rawValue);
    const confidence = Math.round((0.55 + random() * 0.44) * 100) / 100;
    const confidenceBand = confidence >= 0.85 ? "HIGH" : confidence >= 0.7 ? "MEDIUM" : confidence >= 0.6 ? "LOW" : "UNKNOWN";
    let validationStatus: OcrRecognition["fields"][number]["validationStatus"] = "VALID";
    let warnings: string[] = [];
    if (roll > 0.9) {
      validationStatus = "MISSING";
      warnings = ["No matching token found in the recognized text."];
      return { field, rawValue: null, normalizedValue: null, confidence, confidenceBand, validationStatus, sourceRegion: null, warnings };
    }
    if (roll > 0.8) {
      validationStatus = "AMBIGUOUS";
      warnings = ["Multiple interpretations possible — review before confirming."];
    } else if (confidence < 0.7) {
      validationStatus = "LOW_CONFIDENCE";
      warnings = ["Recognition confidence is low for this value."];
    }
    return { field, rawValue, normalizedValue, confidence, confidenceBand, validationStatus, sourceRegion: null, warnings };
  });
}

function normalizeMockValue(field: string, raw: string): string {
  switch (field) {
    case "direction":
      return raw.toLowerCase().startsWith("buy") ? "BUY" : "SELL";
    case "symbol":
      return raw.replace(/m$/, "").toUpperCase();
    case "volume":
      return raw.replace(/[^0-9.]/g, "") || raw;
    case "profit":
      return raw.replace(/\s?USD$/, "");
    case "openTime":
    case "closeTime":
      return raw.includes(":") ? raw.replace(" ", "T") + ":00Z" : raw;
    default:
      return raw.replace(/\s/g, "");
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

export const ocrHandlers = [
  http.post(endpoint(apiPaths.ocrRecognitions), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      const input = parseBody<OcrCreateInput>(
        ocrCreateInputSchema as unknown as ZodType<OcrCreateInput>,
        await readJson(request),
      );

      const [meta, base64] = input.imageDataUrl.split(";base64,");
      const mime = meta.replace("data:", "");
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      if (bytes.length === 0) {
        return HttpResponse.json({ error: "The uploaded image is empty." }, { status: 400 });
      }
      const checksumSha256 = await sha256Hex(bytes);
      const { width, height } = imageDimensions(bytes, mime);
      const now = new Date().toISOString();

      const recognition: OcrRecognition & { imageDataUrl: string } = {
        id: crypto.randomUUID(),
        status: "REVIEW_REQUIRED",
        extractionProfile: input.requestedProfile ?? "TRADE_SUMMARY",
        classification: {
          type: "MT5_TRADE",
          confidence: 0.82,
          alternatives: [
            { type: "TRADINGVIEW_CHART", confidence: 0.11 },
            { type: "UNKNOWN", confidence: 0.07 },
          ],
        },
        fields: simulateExtraction(checksumSha256),
        warnings: [],
        asset: { id: crypto.randomUUID(), mime: mime as "image/png" | "image/jpeg" | "image/webp", sizeBytes: bytes.length, width, height, checksumSha256, createdAt: now },
        engine: { name: "mock-tesseract", engineVersion: "1.0.0", pipelineVersion: "1.0.0", contractVersion: "1" },
        durationMs: 140 + (checksumSha256.charCodeAt(0) % 90),
        failure: null,
        corrections: null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
        imageDataUrl: input.imageDataUrl,
      };
      store.set(recognition.id, recognition);
      const { imageDataUrl: _omit, ...body } = recognition;
      return HttpResponse.json({ recognition: body } satisfies OcrRecognitionResponse, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrRecognitions), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

      const all = Array.from(store.values())
        .filter((item) => !status || item.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const items = all.slice(cursor, cursor + limit).map(({ imageDataUrl: _omit, ...body }) => body);
      const nextCursor = cursor + limit < all.length ? String(cursor + limit) : null;
      return HttpResponse.json({ items, nextCursor } satisfies OcrRecognitionPage);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrRecognition(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, ":id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      const { imageDataUrl: _omit, ...body } = found;
      return HttpResponse.json({ recognition: body } satisfies OcrRecognitionResponse);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrRecognitionImage(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      const id = pathParam(params, ":id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      const base64 = found.imageDataUrl.split(";base64,")[1] ?? "";
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const copy = new ArrayBuffer(bytes.length);
      new Uint8Array(copy).set(bytes);
      return new HttpResponse(copy, {
        headers: {
          "content-type": found.asset.mime,
          "cache-control": "private, no-store",
        },
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.ocrRecognitionConfirm(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, ":id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      if (found.status === "CONFIRMED") {
        return HttpResponse.json({ error: "This recognition is already confirmed." }, { status: 409 });
      }
      const input = parseBody<{ corrections: Record<string, string | null> }>(
        ocrConfirmInputSchema,
        await readJson(request),
      );
      const now = new Date().toISOString();
      found.corrections = input.corrections;
      found.status = "CONFIRMED";
      found.confirmedAt = now;
      found.updatedAt = now;
      const { imageDataUrl: _omit, ...body } = found;
      return HttpResponse.json({ recognition: body } satisfies OcrRecognitionResponse);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.ocrRecognition(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, ":id");
      if (!store.has(id)) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      store.delete(id);
      return HttpResponse.json({ deleted: true as const, id });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
