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
 * OcrController (Phase 19 contract), rebuilt for PROMPT 3.
 *
 * What changed vs the V0 mock:
 * - Recognition is now ASYNCHRONOUS: POST returns PROCESSING and the job
 *   advances through a deterministic time-based pipeline on subsequent GETs
 *   (UPLOADING → … → NORMALIZATION → REVIEW_REQUIRED). The UI polls; no
 *   setTimeout lives in React — real progress events can replace this later
 *   without touching the views (spec §15).
 * - The store is seeded with realistic history (spec §60): coherent trades
 *   (XAUUSD BUY, EURUSD BUY, NAS100 SELL, BTCUSD BUY) across all statuses —
 *   CONFIRMED, REVIEW_REQUIRED, FAILED — so History, stats and details are
 *   populated on first visit.
 * - A deterministic FAILURE path exists for QA: images whose smallest side
 *   is under 200px cannot carry a readable MT5 summary and fail with
 *   EXTRACTION_FAILED.
 *
 * House rules honored: every route is auth-guarded, unknown fields are
 * stripped by the shared schemas, financial values travel as decimal
 * strings, and the mock NEVER creates a Trade (recognition + confirmation
 * only — Trading Core owns the canonical journal).
 */

/** Session-scoped store — recognition id → persisted aggregate (+ upload bytes for session uploads). */
type StoredRecognition = OcrRecognition & { imageDataUrl: string | null };
const store = new Map<string, StoredRecognition>();

/** Simulated pipeline wall-clock: POST → REVIEW_REQUIRED after this long. */
export const OCR_TOTAL_PROCESSING_MS = 4_500;

// ── Seeded-history placeholder raster ───────────────────────────────────────
// Seeded history items have no real upload bytes; the image endpoint serves
// this compact 320x180 navy chart placeholder so thumbnails render honestly
// (the UI never invents screenshot content it does not have).

const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0CAIAAABqhmJGAAADJUlEQVR42u3dMU4qQRzAYTFUJiYWFtgQK0rDJWhovQuH8C60Nl7CcBITE2Ks7FchLjM7O/+d7yt9vnm4j58zs+Iwu394vAJiunYJQMCAgAEBg4ABAQMCBgQMAgYEDAgYBAwIGBAwIGAQMCBgQMCAgEHAgIABAUOD5t9fR1cBzMCAgIH0gG9u7wb9h41vfOObgcEMDAgYKGy2WK5cBQhqfvz8OLXJPvVHuTbxxjf+cOOv97v355fJXx9LaLAHBgQMCBgEDAgYEDAgYBAwLVjvdy5C/eYuAVP9jtP5SMoLs8zAgIABS2gsQc3AnHPYblwEBAwIGAQMCBjIw13obH7ftep85On1zVXCDAwIeHITPgIGQu2Bz7xHi7efyTt+9s9P/AJHf/zRr38Nz0/nQpcbv9fn/2f8lC+whscf/frX8Py0hAZ7YEDAQL898MV/87DdeGVCSV4oghkYBAxEX0JTWGeFbAuDGRgEHJNzjxEwIGBAwE1xB4urpu5CO/cYMzAgYEDAIGAYgZ/DZ9HjJpbfhgEzMFhBCBgQMAgYGEfOc6GdG+z69Pr86OdaF378fwec8Vxo5wa7Pr3Gj36udeHHbwkN9sCAgAEBg4ABAQOFOReaQqKfiFLn4zcDgxkY75yAPTAgYBAwIGBbYmgxYIeegRkYBAxUqcfPgf2cE8zAgIABAUMre2BI0fllnfV+5w2ZzcDQ9gycci700OfiRj83OJFzoWP9/47y/Ek6F3roc3Hzjp93CVfhuc1Dj+9c6HHHtwfGHnVyS+h6Hkr0I1egvMtvYnkZFgQOGLCEBnv4SQTsJgq+QVhCgz0wIGBAwFD7lljAtPUEdYdSwCBgMwwIGBAwIGAQMCBgGEEjNykFDAIGBAwIGFoxWyxXrgIElXQudArjG9/4ltBgDwwIGBAwIGAQMCBgQMCAgEHAgIABAYOAAQEDAgYEDAIGBAwIGBAwCBgQMHAJ50JDYM6FNr7xA49vCQ32wICAAQGDgAEBAwIGBAwCBgQMCBgEDAgYEDAgYBAwIGBAwICAQcCAgAEBQ4ucCw2BzQc9/BawhAYEDAIGBAxk8AOLVHWOvK62DQAAAABJRU5ErkJggg==";

function placeholderDataUrl(): string {
  return `data:image/png;base64,${PLACEHOLDER_PNG_BASE64}`;
}

// ── Deterministic extraction (seeded from the image checksum) ───────────────

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

/**
 * Coherent fictional template trades (spec §60): every field belongs to the
 * SAME position, so the review screen reads like a real MT5 summary. The
 * checksum picks the template; per-field rolls decide what the engine could
 * and could not read (spec §19 — honest uncertainty, nothing guessed).
 */
type TemplateTrade = {
  label: string;
  classification: OcrRecognition["classification"];
  values: Record<string, string>;
};

const TEMPLATE_TRADES: TemplateTrade[] = [
  {
    label: "XAUUSD BUY",
    classification: { type: "MT5_TRADE", confidence: 0.94, alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.04 }, { type: "UNKNOWN", confidence: 0.02 }] },
    values: {
      symbol: "XAUUSD", direction: "BUY", volume: "0.10",
      entryPrice: "2645.32", exitPrice: "2659.98", stopLoss: "2638.50", takeProfit: "2660.00",
      profit: "+146.80", openTime: "2026-10-04T09:31:22Z", closeTime: "2026-10-04T11:47:09Z",
    },
  },
  {
    label: "EURUSD BUY",
    classification: { type: "MT5_TRADE", confidence: 0.86, alternatives: [{ type: "UNKNOWN", confidence: 0.14 }] },
    values: {
      symbol: "EURUSD", direction: "BUY", volume: "0.50",
      entryPrice: "1.08452", exitPrice: "1.08390", stopLoss: "1.08590", takeProfit: "1.08210",
      profit: "-56.20", openTime: "2026-10-03T08:12:40Z", closeTime: "2026-10-03T10:02:15Z",
    },
  },
  {
    label: "NAS100 SELL",
    classification: { type: "MT5_TRADE", confidence: 0.88, alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.09 }, { type: "UNKNOWN", confidence: 0.03 }] },
    values: {
      symbol: "NAS100", direction: "SELL", volume: "1.00",
      entryPrice: "24120.5", exitPrice: "23995.25", stopLoss: "24188.0", takeProfit: "23980.0",
      profit: "+212.75", openTime: "2026-10-02T15:30:05Z", closeTime: "2026-10-02T17:05:48Z",
    },
  },
  {
    label: "BTCUSD BUY",
    classification: { type: "MT5_TRADE", confidence: 0.79, alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.17 }, { type: "UNKNOWN", confidence: 0.04 }] },
    values: {
      symbol: "BTCUSD", direction: "BUY", volume: "0.25",
      entryPrice: "64210.5", exitPrice: "", stopLoss: "63940.0", takeProfit: "66900.0",
      profit: "", openTime: "2026-10-01T11:02:11Z", closeTime: "",
    },
  },
];

const FIELD_KEYS = [
  "symbol", "direction", "volume", "entryPrice", "exitPrice",
  "stopLoss", "takeProfit", "profit", "openTime", "closeTime",
] as const;

/** Fields the engine may legitimately not find in a partial screenshot. */
const OPTIONAL_FIELDS = new Set(["exitPrice", "profit", "closeTime", "openTime"]);

function normalizeMockValue(field: string, raw: string): string {
  switch (field) {
    case "direction":
      return raw.toLowerCase().startsWith("buy") ? "BUY" : "SELL";
    case "symbol":
      return raw.replace(/m$/, "").toUpperCase();
    case "profit":
      return raw;
    default:
      return raw.replace(/\s/g, "");
  }
}

type SimulatedField = OcrRecognition["fields"][number];

function simulateExtraction(checksum: string): { fields: SimulatedField[]; warnings: string[] } {
  const seed = Number.parseInt(checksum.slice(0, 8), 16) || 1;
  const random = seededRandom(seed);
  const template = TEMPLATE_TRADES[Math.floor(random() * TEMPLATE_TRADES.length)];

  const fields: SimulatedField[] = FIELD_KEYS.map((field) => {
    const rawValue = template.values[field] ?? "";
    // Per-field rolls: 6% missing (optional only), 10% ambiguous, else read
    // with a plausible confidence distribution.
    const roll = random();
    const confidence = Math.round((0.58 + random() * 0.41) * 100) / 100;
    const confidenceBand: SimulatedField["confidenceBand"] =
      confidence >= 0.85 ? "HIGH" : confidence >= 0.7 ? "MEDIUM" : confidence >= 0.6 ? "LOW" : "UNKNOWN";

    if (!rawValue) {
      return {
        field, rawValue: null, normalizedValue: null, confidence: 0, confidenceBand: "UNKNOWN",
        validationStatus: "MISSING", sourceRegion: null,
        warnings: OPTIONAL_FIELDS.has(field)
          ? ["Not found in the recognized text — enter it manually if it applies."]
          : ["No matching token found in the recognized text."],
      };
    }
    if (roll > 0.94 && OPTIONAL_FIELDS.has(field)) {
      return {
        field, rawValue: null, normalizedValue: null, confidence: 0, confidenceBand: "UNKNOWN",
        validationStatus: "MISSING", sourceRegion: null,
        warnings: ["Not found in the recognized text — enter it manually if it applies."],
      };
    }
    const normalizedValue = normalizeMockValue(field, rawValue);
    if (roll > 0.86) {
      return {
        field, rawValue, normalizedValue, confidence, confidenceBand,
        validationStatus: "AMBIGUOUS", sourceRegion: null,
        warnings: ["Multiple interpretations possible — review before confirming."],
      };
    }
    if (confidence < 0.7) {
      return {
        field, rawValue, normalizedValue, confidence, confidenceBand,
        validationStatus: "LOW_CONFIDENCE", sourceRegion: null,
        warnings: ["Recognition confidence is low for this value."],
      };
    }
    return { field, rawValue, normalizedValue, confidence, confidenceBand, validationStatus: "VALID", sourceRegion: null, warnings: [] };
  });

  const missing = fields.filter((f) => f.validationStatus === "MISSING").map((f) => f.field);
  const warnings: string[] = [];
  if (missing.includes("exitPrice")) warnings.push("Exit price was not detected — the trade may still be open.");
  if (missing.includes("closeTime")) warnings.push("Close time was not detected.");
  if (missing.length >= 3) warnings.push("The screenshot appears incomplete — several fields could not be read.");

  return { fields, warnings };
}

// ── Seeded history (spec §60 — realistic, all statuses) ─────────────────────

function fakeChecksum(label: string): string {
  let hash = 0x811c9dc5;
  for (const char of label) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 64; i += 1) {
    hash = Math.imul(hash ^ (i + 1), 0x01000193) >>> 0;
    hex += hash.toString(16).padStart(8, "0").slice(0, 2);
  }
  return hex;
}

type SeedSpec = {
  label: string;
  file: string;
  status: OcrRecognition["status"];
  ageMinutes: number;
  confirmed?: boolean;
};

const SEED_SPECS: SeedSpec[] = [
  { label: "XAUUSD BUY 0.10 — MT5 summary", file: "xauusd_mt5_0931.png", status: "CONFIRMED", ageMinutes: 4 * 60, confirmed: true },
  { label: "EURUSD BUY 0.50 — MT5 summary", file: "eurusd_mt5_0812.png", status: "REVIEW_REQUIRED", ageMinutes: 35 },
  { label: "BTCUSD BUY 0.25 — partial screenshot", file: "btcusd_mt5_1102.png", status: "REVIEW_REQUIRED", ageMinutes: 3 * 60 },
  { label: "NAS100 SELL 1.00 — MT5 summary", file: "nas100_mt5_1530.png", status: "CONFIRMED", ageMinutes: 26 * 60, confirmed: true },
  { label: "US30 SELL 0.40 — unreadable crop", file: "us30_crop_2210.png", status: "FAILED", ageMinutes: 27 * 60 },
];

function buildSeed(spec: SeedSpec, index: number): StoredRecognition {
  const createdAt = new Date(Date.now() - spec.ageMinutes * 60_000).toISOString();
  const checksum = fakeChecksum(spec.label + index);
  const { fields, warnings } = simulateExtraction(checksum);
  const base: StoredRecognition = {
    id: crypto.randomUUID(),
    status: spec.status,
    extractionProfile: "TRADE_SUMMARY",
    classification: spec.status === "FAILED" ? null : TEMPLATE_TRADES[index % TEMPLATE_TRADES.length].classification,
    fields,
    warnings,
    asset: {
      id: crypto.randomUUID(), mime: "image/png", sizeBytes: 184_320 + index * 4096,
      width: 1280, height: 720, checksumSha256: checksum, createdAt,
    },
    engine: spec.status === "FAILED"
      ? { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" }
      : { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" },
    durationMs: spec.status === "FAILED" ? 1_820 + index * 137 : 3_400 + index * 173,
    failure: spec.status === "FAILED"
      ? { category: "EXTRACTION_FAILED", message: "We couldn't recognize enough information from this screenshot." }
      : null,
    corrections: null,
    confirmedAt: null,
    createdAt,
    updatedAt: createdAt,
    imageDataUrl: placeholderDataUrl(),
  };
  if (spec.confirmed) {
    const corrected: Record<string, string | null> = {};
    for (const field of base.fields) {
      if (field.normalizedValue !== null) corrected[field.field] = field.normalizedValue;
    }
    base.corrections = corrected;
    base.status = "CONFIRMED";
    base.confirmedAt = new Date(Date.now() - (spec.ageMinutes * 60_000 - 120_000)).toISOString();
    base.updatedAt = base.confirmedAt;
    // Confirmed seeds read cleanly — stamp every field valid so the history
    // view shows a coherent, fully-reviewed outcome.
    base.fields = base.fields.map((field) => ({
      ...field,
      validationStatus: field.validationStatus === "MISSING" ? "MISSING" : "VALID",
      warnings: field.validationStatus === "MISSING" ? field.warnings : [],
    }));
  }
  return base;
}

function ensureSeeds(): void {
  if (store.size === 0) {
    SEED_SPECS.forEach((spec, index) => store.set(`seed-${index + 1}`, buildSeed(spec, index)));
  }
}

/** Time-based pipeline: a PROCESSING job finishing its run settles on GET. */
function settleProcessing(item: StoredRecognition): void {
  if (item.status !== "PROCESSING") return;
  const elapsed = Date.now() - new Date(item.createdAt).getTime();
  if (elapsed < OCR_TOTAL_PROCESSING_MS) return;
  const { fields, warnings } = simulateExtraction(item.asset.checksumSha256);
  item.fields = fields;
  item.warnings = warnings;
  item.status = "REVIEW_REQUIRED";
  item.durationMs = OCR_TOTAL_PROCESSING_MS - 320;
  item.updatedAt = new Date().toISOString();
}

function publicBody(item: StoredRecognition): OcrRecognition {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring strips the bytes
  const { imageDataUrl: _omit, ...body } = item;
  return body;
}

// ── Handlers ────────────────────────────────────────────────────────────────

export const ocrHandlers = [
  http.post(endpoint(apiPaths.ocrRecognitions), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      ensureSeeds();
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

      // Deterministic QA failure: a screenshot whose smallest side is under
      // 200px cannot carry a readable MT5 summary line.
      if (Math.min(width, height) < 200) {
        const failed: StoredRecognition = {
          id: crypto.randomUUID(),
          status: "FAILED",
          extractionProfile: input.requestedProfile ?? "TRADE_SUMMARY",
          classification: null,
          fields: [],
          warnings: [],
          asset: { id: crypto.randomUUID(), mime: mime as "image/png" | "image/jpeg" | "image/webp", sizeBytes: bytes.length, width, height, checksumSha256, createdAt: now },
          engine: { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" },
          durationMs: 460,
          failure: { category: "EXTRACTION_FAILED", message: "We couldn't recognize enough information from this screenshot." },
          corrections: null,
          confirmedAt: null,
          createdAt: now,
          updatedAt: now,
          imageDataUrl: input.imageDataUrl,
        };
        store.set(failed.id, failed);
        return HttpResponse.json({ recognition: publicBody(failed) } satisfies OcrRecognitionResponse, { status: 201 });
      }

      const recognition: StoredRecognition = {
        id: crypto.randomUUID(),
        status: "PROCESSING",
        extractionProfile: input.requestedProfile ?? "TRADE_SUMMARY",
        classification: null,
        fields: [],
        warnings: [],
        asset: { id: crypto.randomUUID(), mime: mime as "image/png" | "image/jpeg" | "image/webp", sizeBytes: bytes.length, width, height, checksumSha256, createdAt: now },
        engine: null,
        durationMs: null,
        failure: null,
        corrections: null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
        imageDataUrl: input.imageDataUrl,
      };
      store.set(recognition.id, recognition);
      return HttpResponse.json({ recognition: publicBody(recognition) } satisfies OcrRecognitionResponse, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrRecognitions), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      ensureSeeds();
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

      const all = Array.from(store.values())
        .map((item) => {
          settleProcessing(item);
          return item;
        })
        .filter((item) => !status || item.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const items = all.slice(cursor, cursor + limit).map(publicBody);
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
      ensureSeeds();
      const id = pathParam(params, "id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      settleProcessing(found);
      return HttpResponse.json({ recognition: publicBody(found) } satisfies OcrRecognitionResponse);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrRecognitionImage(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      ensureSeeds();
      const id = pathParam(params, "id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      const dataUrl = found.imageDataUrl ?? placeholderDataUrl();
      const base64 = dataUrl.split(";base64,")[1] ?? "";
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
      const id = pathParam(params, "id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      if (found.status === "CONFIRMED") {
        return HttpResponse.json({ error: "This recognition is already confirmed." }, { status: 409 });
      }
      if (found.status !== "REVIEW_REQUIRED") {
        return HttpResponse.json({ error: "This recognition is still processing." }, { status: 409 });
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
      return HttpResponse.json({ recognition: publicBody(found) } satisfies OcrRecognitionResponse);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.ocrRecognition(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, "id");
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
