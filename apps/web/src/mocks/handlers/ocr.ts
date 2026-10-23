import { http, HttpResponse } from "msw";
import type { ZodType } from "zod";

import type {
  OcrAnalyticsResponse,
  OcrCreateInput,
  OcrRecropResponse,
  OcrRecognition,
  OcrRecognitionPage,
  OcrRecognitionResponse,
  OcrStorageResponse,
  OcrCollection,
  OcrFieldKey,
  OcrSet,
} from "@cosmoz/shared";
import {
  ocrCollectionAddItemInputSchema,
  ocrCollectionCreateInputSchema,
  ocrConfirmInputSchema,
  ocrCreateInputSchema,
  ocrRecropInputSchema,
  ocrSetConfirmInputSchema,
  ocrSetCreateInputSchema,
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
/**
 * V2 fields (issues / qualityScore / timeline / possibleTradeDuplicate /
 * reprocessedFrom) are DERIVED at read time by publicBody — the same
 * read-time-derivation discipline as the NestJS DTO (confirmed rows never
 * mutate, V2 §33). The stored shape keeps only the evidence.
 */
type StoredRecognition = Omit<
  OcrRecognition,
  "issues" | "qualityScore" | "timeline" | "possibleTradeDuplicate" | "reprocessedFrom"
> & {
  imageDataUrl: string | null;
  /** Simulated trade-duplicate flag (V2 §4) for the seeded demo. */
  storedTradeDuplicate?: NonNullable<OcrRecognition["possibleTradeDuplicate"]> | null;
};
/** Corrections-memory ledger (engine quality §2.3) — per-user patterns. */
const patternStore = new Map<string, Map<string, { value: string; occurrences: number }>>();
const store = new Map<string, StoredRecognition>();

/** V2 sets (§18) + collections (§28) — mock-side state. */
type MockSet = {
  id: string;
  status: "REVIEW_REQUIRED" | "CONFIRMED" | "FAILED";
  members: { order: number; recognitionId: string }[];
  result: {
    fields: OcrRecognition["fields"];
    conflicts: NonNullable<OcrSet["fused"]>["conflicts"];
    issues: OcrRecognition["issues"];
    qualityScore: OcrRecognition["qualityScore"];
    timeline: OcrRecognition["timeline"];
    coherent: boolean;
    storedTradeDuplicate?: NonNullable<OcrRecognition["possibleTradeDuplicate"]> | null;
  } | null;
  corrections: OcrRecognition["corrections"];
  tradeId: string | null;
  tradeIds: string[];
  accountId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type MockCollection = OcrCollection;

const setStore = new Map<string, MockSet>();
const collectionStore = new Map<string, MockCollection>();

/** The mock-side single-image pipeline (same discipline as the POST route). */
async function createMockRecognition(
  dataUrl: string,
  checksum: string,
  profile: OcrRecognition["extractionProfile"] = "TRADE_SUMMARY",
): Promise<StoredRecognition> {
  const { fields, warnings, candidates } = simulateExtraction(checksum, profile);
  const createdAt = new Date().toISOString();
  const item: StoredRecognition = {
    id: crypto.randomUUID(),
    status: "REVIEW_REQUIRED",
    extractionProfile: profile,
    classification: profile === "ACCOUNT_POSITION"
      ? ACCOUNT_TEMPLATE.classification
      : profile === "CHART_ANALYSIS"
        ? CHART_TEMPLATE.classification
        : TEMPLATE_TRADES[0]!.classification,
    fields,
    warnings,
    asset: {
      id: crypto.randomUUID(), mime: "image/png",
      sizeBytes: Math.round((dataUrl.split(";base64,")[1] ?? "").length * 0.75),
      width: 1280, height: 720, checksumSha256: checksum, createdAt, purged: false,
    },
    engine: { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" },
    durationMs: OCR_TOTAL_PROCESSING_MS - 120,
    failure: null,
    corrections: null,
    tradeId: null,
    tradeIds: [],
    candidates: candidates && candidates.length > 0 ? candidates : null,
    duplicateOf: null,
    accountId: null,
    suggestedTags: [],
    confirmedAt: null,
    createdAt,
    updatedAt: createdAt,
    imageDataUrl: dataUrl,
  };
  store.set(item.id, item);
  return item;
}

/**
 * Mock fusion (V2 §18): per-field agreement/conflict over the members'
 * machine fields — same semantics as the Nest fusion engine, simplified.
 */
function fuseMockMembers(members: StoredRecognition[]): MockSet["result"] {
  const keys: string[] = [];
  for (const member of members) {
    for (const field of member.fields) {
      if (!keys.includes(field.field)) keys.push(field.field);
    }
  }
  const fields: OcrRecognition["fields"] = [];
  const conflicts: NonNullable<OcrSet["fused"]>["conflicts"] = [];
  for (const key of keys) {
    const readings = members
      .map((member) => member.fields.find((f) => f.field === key))
      .filter((f): f is OcrRecognition["fields"][number] => Boolean(f) && f!.normalizedValue !== null);
    if (readings.length === 0) {
      const missing = members
        .map((member) => member.fields.find((f) => f.field === key))
        .find((f) => f !== undefined);
      if (missing) fields.push(missing);
      continue;
    }
    const values = new Set(readings.map((f) => f.normalizedValue));
    const strongest = [...readings].sort((a, b) => b.confidence - a.confidence)[0]!;
    if (values.size === 1 && readings.length > 1) {
      fields.push({
        ...strongest,
        confidence: Math.min(0.99, Math.round((strongest.confidence + 0.03 * (readings.length - 1)) * 1000) / 1000),
        warnings: [...strongest.warnings, "MULTI_SOURCE_AGREEMENT"].slice(0, 8),
      });
    } else if (values.size > 1) {
      fields.push({
        ...strongest,
        validationStatus: "AMBIGUOUS",
        warnings: [...strongest.warnings, "CONFLICTING_VALUES"].slice(0, 8),
      });
      conflicts.push({
        field: key as OcrFieldKey,
        values: readings.slice(0, 6).map((f) => ({
          value: f.normalizedValue as string,
          recognitionId: members.find((m) => m.fields.some((x) => x.field === key && x.normalizedValue === f.normalizedValue))!.id,
        })),
      });
    } else {
      fields.push({ ...strongest, warnings: [...strongest.warnings, "SINGLE_SOURCE"].slice(0, 8) });
    }
  }
  const symbolField = fields.find((f) => f.field === "symbol" && f.normalizedValue !== null);
  const directionField = fields.find((f) => f.field === "direction" && f.normalizedValue !== null);
  const coherent =
    Boolean(symbolField) &&
    (directionField?.normalizedValue === "BUY" || directionField?.normalizedValue === "SELL") &&
    !conflicts.some((c) => c.field === "symbol" || c.field === "direction");

  // Quality + issues via the same read-time derivation used for recognitions.
  const pseudo: Omit<OcrRecognition, "issues" | "qualityScore" | "timeline" | "possibleTradeDuplicate" | "reprocessedFrom"> = {
    id: "fusion", status: "REVIEW_REQUIRED", extractionProfile: "TRADE_SUMMARY",
    classification: members[0]?.classification ?? null,
    fields, warnings: [], asset: members[0]!.asset, engine: null, durationMs: null,
    failure: null, corrections: null, tradeId: null, tradeIds: [], candidates: null,
    duplicateOf: null, accountId: null, suggestedTags: [], confirmedAt: null,
    createdAt: members[0]!.createdAt, updatedAt: members[0]!.updatedAt,
  };
  const derived = deriveV2(pseudo);
  const timeline: OcrRecognition["timeline"] = [
    ...derived.timeline.filter((entry) => entry.kind === "OPEN_TIME" || entry.kind === "CLOSE_TIME"),
  ];
  for (const member of members) {
    timeline.push({ kind: "UPLOADED", at: member.createdAt, raw: null });
  }

  return {
    fields,
    conflicts,
    issues: derived.issues,
    qualityScore: derived.qualityScore,
    timeline: timeline.sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 16),
    coherent,
  };
}

function setBody(set: MockSet): OcrSet {
  const members = set.members
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((member) => {
      const recognition = store.get(member.recognitionId);
      if (!recognition) throw new Error("set member missing");
      return { order: member.order, recognitionId: member.recognitionId, recognition: publicBody(recognition) };
    });
  return {
    id: set.id,
    status: set.status,
    members,
    fused: set.result
      ? {
          fields: set.result.fields,
          conflicts: set.result.conflicts,
          issues: set.result.issues,
          qualityScore: set.result.qualityScore,
          timeline: set.result.timeline,
          coherent: set.result.coherent,
        }
      : null,
    corrections: set.corrections,
    tradeId: set.tradeId,
    tradeIds: set.tradeIds,
    accountId: set.accountId,
    confirmedAt: set.confirmedAt,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  };
}

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
    classification: { type: "MT5_TRADE", confidence: 0.94, platform: "MT5", alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.04 }, { type: "UNKNOWN", confidence: 0.02 }] },
    values: {
      symbol: "XAUUSD", direction: "BUY", volume: "0.10",
      entryPrice: "2645.32", exitPrice: "2659.98", stopLoss: "2638.50", takeProfit: "2660.00",
      profit: "+146.80", openTime: "2026-10-04T09:31:22Z", closeTime: "2026-10-04T11:47:09Z",
    },
  },
  {
    label: "EURUSD BUY",
    classification: { type: "MT5_TRADE", confidence: 0.86, platform: "MT5", alternatives: [{ type: "UNKNOWN", confidence: 0.14 }] },
    values: {
      symbol: "EURUSD", direction: "BUY", volume: "0.50",
      entryPrice: "1.08452", exitPrice: "1.08390", stopLoss: "1.08590", takeProfit: "1.08210",
      profit: "-56.20", openTime: "2026-10-03T08:12:40Z", closeTime: "2026-10-03T10:02:15Z",
    },
  },
  {
    label: "NAS100 SELL",
    classification: { type: "MT5_TRADE", confidence: 0.88, platform: "MT5", alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.09 }, { type: "UNKNOWN", confidence: 0.03 }] },
    values: {
      symbol: "NAS100", direction: "SELL", volume: "1.00",
      entryPrice: "24120.5", exitPrice: "23995.25", stopLoss: "24188.0", takeProfit: "23980.0",
      profit: "+212.75", openTime: "2026-10-02T15:30:05Z", closeTime: "2026-10-02T17:05:48Z",
    },
  },
  {
    label: "BTCUSD BUY",
    classification: { type: "MT5_TRADE", confidence: 0.79, platform: "MT5", alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.17 }, { type: "UNKNOWN", confidence: 0.04 }] },
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

// ── Account & Chart mock templates (Recognition V1.1) ───────────────────────

/** ACCOUNT_POSITION — one coherent account snapshot + ONE open position. */
const ACCOUNT_TEMPLATE: {
  label: string;
  classification: OcrRecognition["classification"];
  values: Record<string, string>;
} = {
  label: "MT5 account snapshot",
  classification: { type: "ACCOUNT_SUMMARY", confidence: 0.93, platform: "MT5", alternatives: [{ type: "OPEN_POSITION", confidence: 0.05 }, { type: "UNKNOWN", confidence: 0.02 }] },
  values: {
    accountLogin: "5102083990",
    accountServer: "MetaQuotes-Demo",
    accountCurrency: "USD",
    accountLeverage: "1:500",
    accountBalance: "10420.50",
    accountEquity: "10653.40",
    accountMargin: "421.10",
    accountFreeMargin: "10232.30",
    accountMarginLevel: "2529.60",
  },
};

/** The one open-position candidate of the ACCOUNT template (trade vocabulary). */
const ACCOUNT_POSITION_CANDIDATE: NonNullable<OcrRecognition["candidates"]> = [
  {
    fields: [
      { field: "symbol", rawValue: "XAUUSD", normalizedValue: "XAUUSD", confidence: 0.94, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "direction", rawValue: "buy", normalizedValue: "BUY", confidence: 0.92, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "volume", rawValue: "0.50", normalizedValue: "0.50", confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "entryPrice", rawValue: "2645.60", normalizedValue: "2645.60", confidence: 0.89, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "stopLoss", rawValue: "2630.00", normalizedValue: "2630.00", confidence: 0.87, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      { field: "takeProfit", rawValue: "2680.00", normalizedValue: "2680.00", confidence: 0.86, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
    ],
  },
];

/** CHART_ANALYSIS — one coherent chart reading (legend + indicators). */
const CHART_TEMPLATE: {
  label: string;
  classification: OcrRecognition["classification"];
  values: Record<string, string>;
} = {
  label: "TradingView chart reading",
  classification: { type: "CHART", confidence: 0.9, platform: "TRADINGVIEW", alternatives: [{ type: "TRADINGVIEW_CHART", confidence: 0.06 }, { type: "UNKNOWN", confidence: 0.04 }] },
  values: {
    symbol: "XAUUSD",
    chartTimeframe: "M15",
    chartOpen: "2345.6",
    chartHigh: "2350.1",
    chartLow: "2340.2",
    chartClose: "2348.9",
    chartPrice: "2348.9",
    chartChangePct: "+0.42",
    chartRsi: "62.35",
    chartMacd: "-0.15",
    chartAtr: "3.42",
    chartMa: "2330.15",
  },
};

/** Field keys the mock may mark missing per profile (never the required floor). */
const ACCOUNT_OPTIONAL_FIELDS = new Set(["accountLogin", "accountServer", "accountMargin", "accountFreeMargin", "accountMarginLevel"]);
const CHART_OPTIONAL_FIELDS = new Set(["chartChangePct", "chartMacd", "chartAtr", "chartMa", "chartRsi"]);

/** Simple profile field builder: deterministic rolls over the template. */
function simulateProfileFields(
  checksum: string,
  template: { label: string; values: Record<string, string> },
  optionalFields: Set<string>,
): { fields: SimulatedField[]; warnings: string[] } {
  const seed = Number.parseInt(checksum.slice(0, 8), 16) || 1;
  const random = seededRandom(seed);
  const fields: SimulatedField[] = Object.entries(template.values).map(([field, rawValue], index) => {
    const roll = random();
    const confidence = Math.round((0.62 + random() * 0.37) * 100) / 100;
    const confidenceBand: SimulatedField["confidenceBand"] =
      confidence >= 0.85 ? "HIGH" : confidence >= 0.7 ? "MEDIUM" : confidence >= 0.6 ? "LOW" : "UNKNOWN";
    const region = mockRegion(index);
    if (roll > 0.94 && optionalFields.has(field)) {
      return {
        field: field as SimulatedField["field"], rawValue: null, normalizedValue: null,
        confidence: 0, confidenceBand: "UNKNOWN", validationStatus: "MISSING", sourceRegion: null,
        warnings: ["Not found in the recognized text - enter it manually if it applies."],
      };
    }
    if (roll > 0.88 && optionalFields.has(field)) {
      return {
        field: field as SimulatedField["field"], rawValue, normalizedValue: rawValue,
        confidence, confidenceBand, validationStatus: "LOW_CONFIDENCE", sourceRegion: region,
        warnings: ["Recognition confidence is low for this value."],
      };
    }
    return {
      field: field as SimulatedField["field"], rawValue, normalizedValue: rawValue,
      confidence, confidenceBand, validationStatus: "VALID", sourceRegion: region, warnings: [],
    };
  });
  const missing = fields.filter((f) => f.validationStatus === "MISSING").map((f) => f.field);
  const warnings: string[] = [];
  if (missing.length >= 3) warnings.push("The screenshot appears incomplete - several fields could not be read.");
  return { fields, warnings };
}

function simulateAccount(checksum: string): { fields: SimulatedField[]; warnings: string[]; candidates: NonNullable<OcrRecognition["candidates"]> } {
  const { fields, warnings } = simulateProfileFields(checksum, ACCOUNT_TEMPLATE, ACCOUNT_OPTIONAL_FIELDS);
  return { fields, warnings, candidates: ACCOUNT_POSITION_CANDIDATE };
}

function simulateChart(checksum: string): { fields: SimulatedField[]; warnings: string[] } {
  return simulateProfileFields(checksum, CHART_TEMPLATE, CHART_OPTIONAL_FIELDS);
}

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

/**
 * Deterministic plausible word boxes (V2 §10/§55): every READ field keeps a
 * source region so the review UI can overlay it on the screenshot. The
 * coordinates sit inside the 1280x720 placeholder raster, two-column grid.
 */
function mockRegion(index: number): { x: number; y: number; width: number; height: number } {
  return {
    x: 60 + (index % 2) * 620,
    y: 96 + Math.floor(index / 2) * 62,
    width: 170 + ((index * 37) % 120),
    height: 24,
  };
}

function simulateExtraction(
  checksum: string,
  profile: OcrRecognition["extractionProfile"] = "TRADE_SUMMARY",
): { fields: SimulatedField[]; warnings: string[]; candidates?: NonNullable<OcrRecognition["candidates"]> } {
  if (profile === "ACCOUNT_POSITION") return simulateAccount(checksum);
  if (profile === "CHART_ANALYSIS") return simulateChart(checksum);
  const seed = Number.parseInt(checksum.slice(0, 8), 16) || 1;
  const random = seededRandom(seed);
  const template = TEMPLATE_TRADES[Math.floor(random() * TEMPLATE_TRADES.length)];

  const fields: SimulatedField[] = FIELD_KEYS.map((field, index) => {
    const rawValue = template.values[field] ?? "";
    // Per-field rolls: 6% missing (optional only), 10% ambiguous, else read
    // with a plausible confidence distribution.
    const roll = random();
    const confidence = Math.round((0.58 + random() * 0.41) * 100) / 100;
    const confidenceBand: SimulatedField["confidenceBand"] =
      confidence >= 0.85 ? "HIGH" : confidence >= 0.7 ? "MEDIUM" : confidence >= 0.6 ? "LOW" : "UNKNOWN";

    const region = mockRegion(index);
    if (!rawValue) {
      return {
        field, rawValue: null, normalizedValue: null, confidence: 0, confidenceBand: "UNKNOWN",
        validationStatus: "MISSING", sourceRegion: null,
        warnings: OPTIONAL_FIELDS.has(field)
          ? ["Not found in the recognized text - enter it manually if it applies."]
          : ["No matching token found in the recognized text."],
      };
    }
    if (roll > 0.94 && OPTIONAL_FIELDS.has(field)) {
      return {
        field, rawValue: null, normalizedValue: null, confidence: 0, confidenceBand: "UNKNOWN",
        validationStatus: "MISSING", sourceRegion: null,
        warnings: ["Not found in the recognized text - enter it manually if it applies."],
      };
    }
    const normalizedValue = normalizeMockValue(field, rawValue);
    if (roll > 0.86) {
      return {
        field, rawValue, normalizedValue, confidence, confidenceBand,
        validationStatus: "AMBIGUOUS", sourceRegion: region,
        warnings: ["Multiple interpretations possible - review before confirming."],
      };
    }
    if (confidence < 0.7) {
      return {
        field, rawValue, normalizedValue, confidence, confidenceBand,
        validationStatus: "LOW_CONFIDENCE", sourceRegion: region,
        warnings: ["Recognition confidence is low for this value."],
      };
    }
    return { field, rawValue, normalizedValue, confidence, confidenceBand, validationStatus: "VALID", sourceRegion: region, warnings: [] };
  });

  const missing = fields.filter((f) => f.validationStatus === "MISSING").map((f) => f.field);
  const warnings: string[] = [];
  if (missing.includes("exitPrice")) warnings.push("Exit price was not detected - the trade may still be open.");
  if (missing.includes("closeTime")) warnings.push("Close time was not detected.");
  if (missing.length >= 3) warnings.push("The screenshot appears incomplete - several fields could not be read.");

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
  /** Seed carries grouped multi-trade drafts (engine quality §2.2). */
  multi?: boolean;
  /** V2 §4 — seeded content-based trade duplicate flag for the review demo. */
  tradeDuplicate?: boolean;
  /** Account & Chart V1.1 — non-trade seeds. */
  profile?: OcrRecognition["extractionProfile"];
};

const SEED_SPECS: SeedSpec[] = [
  { label: "XAUUSD BUY 0.10 - MT5 summary", file: "xauusd_mt5_0931.png", status: "CONFIRMED", ageMinutes: 4 * 60, confirmed: true },
  { label: "EURUSD BUY 0.50 - MT5 summary", file: "eurusd_mt5_0812.png", status: "REVIEW_REQUIRED", ageMinutes: 35, tradeDuplicate: true },
  { label: "BTCUSD BUY 0.25 - partial screenshot", file: "btcusd_mt5_1102.png", status: "REVIEW_REQUIRED", ageMinutes: 3 * 60 },
  { label: "NAS100 SELL 1.00 - MT5 summary", file: "nas100_mt5_1530.png", status: "CONFIRMED", ageMinutes: 26 * 60, confirmed: true },
  { label: "US30 SELL 0.40 - unreadable crop", file: "us30_crop_2210.png", status: "FAILED", ageMinutes: 27 * 60 },
  { label: "History panel - 2 trades (grouped draft)", file: "history_multi_1030.png", status: "REVIEW_REQUIRED", ageMinutes: 90, multi: true },
  { label: "MT5 account snapshot - 1 open position", file: "account_snapshot_1410.png", status: "REVIEW_REQUIRED", ageMinutes: 55, profile: "ACCOUNT_POSITION" },
  { label: "TradingView chart - XAUUSD M15", file: "chart_xauusd_m15.png", status: "CONFIRMED", ageMinutes: 5 * 60, confirmed: true, profile: "CHART_ANALYSIS" },
];

function buildSeed(spec: SeedSpec, index: number): StoredRecognition {
  const createdAt = new Date(Date.now() - spec.ageMinutes * 60_000).toISOString();
  const checksum = fakeChecksum(spec.label + index);
  const profile = spec.profile ?? "TRADE_SUMMARY";
  const simulated = simulateExtraction(checksum, profile);
  const fields = simulated.fields;
  const warnings = simulated.warnings;
  const base: StoredRecognition = {
    id: crypto.randomUUID(),
    status: spec.status,
    extractionProfile: profile,
    classification:
      spec.status === "FAILED"
        ? null
        : profile === "ACCOUNT_POSITION"
          ? ACCOUNT_TEMPLATE.classification
          : profile === "CHART_ANALYSIS"
            ? CHART_TEMPLATE.classification
            : TEMPLATE_TRADES[index % TEMPLATE_TRADES.length].classification,
    fields,
    warnings,
    asset: {
      id: crypto.randomUUID(), mime: "image/png", sizeBytes: 184_320 + index * 4096,
      width: 1280, height: 720, checksumSha256: checksum, createdAt,
      purged: false,
    },
    engine: spec.status === "FAILED"
      ? { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" }
      : { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" },
    durationMs: spec.status === "FAILED" ? 1_820 + index * 137 : 3_400 + index * 173,
    failure: spec.status === "FAILED"
      ? { category: "EXTRACTION_FAILED", message: "We couldn't recognize enough information from this screenshot." }
      : null,
    corrections: null,
    // The mocked backend never creates journal trades — no linked trade id.
    tradeId: null,
    tradeIds: [],
    candidates: profile === "ACCOUNT_POSITION" ? ACCOUNT_POSITION_CANDIDATE : null,
    duplicateOf: null,
    accountId: null,
    suggestedTags: [],
    confirmedAt: null,
    createdAt,
    updatedAt: createdAt,
    imageDataUrl: placeholderDataUrl(),
  };
  if (spec.tradeDuplicate) {
    // A deterministic pseudo-trade the review banner can point at (the mock
    // never touches the real journal — the trade id is demo-only).
    base.storedTradeDuplicate = {
      tradeId: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      matchedOn: ["SYMBOL", "DIRECTION", "ENTRY_PRICE"],
      detectedAt: createdAt,
    };
  }
  if (spec.multi) {
    // Grouped-confirmation demo: two coherent drafts from one history panel.
    const draft = (symbol: string, direction: "BUY" | "SELL", entry: string, profit: string): OcrRecognition["candidates"] extends null ? never : { fields: OcrRecognition["fields"] } => ({
      fields: [
        { field: "symbol", rawValue: symbol, normalizedValue: symbol, confidence: 0.93, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
        { field: "direction", rawValue: direction.toLowerCase(), normalizedValue: direction, confidence: 0.92, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
        { field: "volume", rawValue: "0.20", normalizedValue: "0.20", confidence: 0.88, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
        { field: "entryPrice", rawValue: entry, normalizedValue: entry, confidence: 0.9, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
        { field: "profit", rawValue: profit, normalizedValue: profit, confidence: 0.86, confidenceBand: "HIGH", validationStatus: "VALID", sourceRegion: null, warnings: [] },
      ],
    });
    base.candidates = [
      draft("GBPUSD", "BUY", "1.26340", "+89.10"),
      draft("USDJPY", "SELL", "149.850", "+54.20"),
    ];
  }
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
  const { fields, warnings, candidates } = simulateExtraction(item.asset.checksumSha256, item.extractionProfile);
  // Corrections memory (engine quality §2.3): the mock suggests the stored
  // corrected value for any rawValue the ledger has seen for this user.
  const patterns = patternStore.get("demo-user");
  if (patterns) {
    item.fields = fields.map((field) => {
      if (field.rawValue === null) return field;
      const suggestion = patterns.get(`${field.field}\u0000${field.rawValue}`);
      return suggestion ? { ...field, suggestion } : field;
    });
  } else {
    item.fields = fields;
  }
  if (candidates && candidates.length > 0) item.candidates = candidates;
  item.warnings = warnings;
  item.status = "REVIEW_REQUIRED";
  item.durationMs = OCR_TOTAL_PROCESSING_MS - 320;
  item.updatedAt = new Date().toISOString();
}

/** The import-critical floor per profile (mirrors the Nest derivation input). */
const REQUIRED_FIELDS = new Set(["symbol", "direction", "volume", "entryPrice"]);
const REQUIRED_FIELDS_ACCOUNT = new Set(["accountCurrency", "accountBalance", "accountEquity"]);
const REQUIRED_FIELDS_CHART = new Set(["chartTimeframe", "chartClose"]);

function requiredFor(profile: OcrRecognition["extractionProfile"]): Set<string> {
  if (profile === "ACCOUNT_POSITION") return REQUIRED_FIELDS_ACCOUNT;
  if (profile === "CHART_ANALYSIS") return REQUIRED_FIELDS_CHART;
  return REQUIRED_FIELDS;
}

/**
 * Read-time derivation of the V2 decision layer (§15/§16/§23/§32/§4) —
 * a simplified mirror of the NestJS pure functions so the mock answers the
 * EXACT contract the real backend answers.
 */
function deriveV2(
  body: Omit<
    OcrRecognition,
    "issues" | "qualityScore" | "timeline" | "possibleTradeDuplicate" | "reprocessedFrom"
  > & {
    storedTradeDuplicate?: NonNullable<OcrRecognition["possibleTradeDuplicate"]> | null;
  },
): Pick<OcrRecognition, "issues" | "qualityScore" | "timeline" | "possibleTradeDuplicate" | "reprocessedFrom"> {
  const issues: OcrRecognition["issues"] = [];
  for (const field of body.fields) {
    if (field.validationStatus === "MISSING" && requiredFor(body.extractionProfile).has(field.field)) {
      issues.push({ code: "MISSING_REQUIRED_FIELD", field: field.field, detail: null });
      continue;
    }
    if (field.validationStatus !== "MISSING" && field.confidence < 0.7) {
      issues.push({ code: "LOW_OCR_CONFIDENCE", field: field.field, detail: null });
    }
    if (field.validationStatus === "INVALID") {
      issues.push({
        code: field.field === "openTime" || field.field === "closeTime" ? "INVALID_TIMESTAMP" : "INVALID_PRICE_RELATIONSHIP",
        field: field.field,
        detail: null,
      });
    }
    if (field.validationStatus === "AMBIGUOUS") {
      issues.push({
        code: field.field === "direction" ? "AMBIGUOUS_DIRECTION" : "AMBIGUOUS_NUMBER",
        field: field.field,
        detail: null,
      });
    }
  }
  if (body.classification === null || body.classification.type === "UNKNOWN") {
    issues.push({ code: "UNSUPPORTED_SCREENSHOT", field: null, detail: null });
  }
  if (body.classification !== null && body.classification.platform === "UNKNOWN") {
    issues.push({ code: "UNKNOWN_PLATFORM", field: null, detail: null });
  }
  if (body.duplicateOf) {
    issues.push({ code: "POSSIBLE_DUPLICATE", field: null, detail: body.duplicateOf.recognitionId });
  }
  const possibleTradeDuplicate = body.storedTradeDuplicate ?? null;
  if (possibleTradeDuplicate) {
    issues.push({ code: "POSSIBLE_TRADE_DUPLICATE", field: null, detail: possibleTradeDuplicate.tradeId });
  }

  // Quality score (V2 §15 — documented weights, deterministic).
  const readable = body.fields.filter((f) => f.validationStatus !== "MISSING");
  let qualityScore: OcrRecognition["qualityScore"] = null;
  if (readable.length > 0) {
    const fieldConfidence = readable.reduce((t, f) => t + f.confidence, 0) / readable.length;
    const required = [...requiredFor(body.extractionProfile)];
    const completeness = required.filter((key) =>
      body.fields.some((f) => f.field === key && f.normalizedValue !== null),
    ).length / required.length;
    const invalidCount = body.fields.filter((f) => f.validationStatus === "INVALID").length;
    const validation = Math.max(0, 1 - invalidCount * 0.2);
    let consistency = 1;
    if (body.duplicateOf) consistency -= 0.3;
    if (body.classification === null || body.classification.type === "UNKNOWN") consistency -= 0.3;
    consistency = Math.max(0, consistency);
    const round3 = (v: number) => Math.round(v * 1000) / 1000;
    qualityScore = {
      score: round3(0.4 * fieldConfidence + 0.25 * completeness + 0.2 * validation + 0.15 * consistency),
      components: {
        fieldConfidence: round3(fieldConfidence),
        completeness: round3(completeness),
        validation: round3(validation),
        consistency: round3(consistency),
      },
    };
  }

  // Timeline (V2 §23 — only real evidence, wall-clock preserved).
  const byKey = new Map(body.fields.map((f) => [f.field, f]));
  const timeline: OcrRecognition["timeline"] = [];
  if (byKey.get("openTime")?.normalizedValue) {
    timeline.push({ kind: "OPEN_TIME", at: byKey.get("openTime")!.normalizedValue!, raw: byKey.get("openTime")!.rawValue });
  }
  if (byKey.get("closeTime")?.normalizedValue) {
    timeline.push({ kind: "CLOSE_TIME", at: byKey.get("closeTime")!.normalizedValue!, raw: byKey.get("closeTime")!.rawValue });
  }
  timeline.push({ kind: "UPLOADED", at: body.createdAt, raw: null });
  if (body.confirmedAt) timeline.push({ kind: "CONFIRMED", at: body.confirmedAt, raw: null });

  return {
    issues: issues.slice(0, 32),
    qualityScore,
    timeline: timeline.slice(0, 16),
    possibleTradeDuplicate,
    reprocessedFrom: null,
  };
}

/** Count non-null classification values into the distribution shape (V2 §30). */
function deriveDistribution<T extends string>(values: Array<T | null>): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function publicBody(item: StoredRecognition): OcrRecognition {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring strips the bytes
  const { imageDataUrl: _omit, storedTradeDuplicate: _dup, ...body } = item;
  return { ...body, ...deriveV2(item) };
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
      const isPdf = mime === "application/pdf";
      const { width, height } = isPdf ? { width: 2530, height: 925 } : imageDimensions(bytes, mime);
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
          asset: { id: crypto.randomUUID(), mime: mime as "image/png" | "image/jpeg" | "image/webp" | "application/pdf", sizeBytes: bytes.length, width, height, checksumSha256, createdAt: now, purged: false },
          engine: { name: "mock-recognition", engineVersion: "2.0.0", pipelineVersion: "2.0.0", contractVersion: "1" },
          durationMs: 460,
          failure: { category: "EXTRACTION_FAILED", message: "We couldn't recognize enough information from this screenshot." },
          corrections: null,
          tradeId: null,
          tradeIds: [],
          candidates: null,
          duplicateOf: null,
          accountId: input.accountId ?? null,
          suggestedTags: [],
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
        asset: { id: crypto.randomUUID(), mime: mime as "image/png" | "image/jpeg" | "image/webp" | "application/pdf", sizeBytes: bytes.length, width, height, checksumSha256, createdAt: now, purged: false },
        engine: null,
        durationMs: null,
        failure: null,
        corrections: null,
        tradeId: null,
        tradeIds: [],
        candidates: null,
        duplicateOf: null,
        accountId: input.accountId ?? null,
        suggestedTags: [],
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
        imageDataUrl: input.imageDataUrl,
      };
      // Duplicate detection (engine quality §2.1): a session upload whose
      // checksum shares the first 10 hex chars with an earlier asset flags
      // the earlier recognition (mock-grade perceptual match).
      for (const item of store.values()) {
        if (item.asset.checksumSha256.slice(0, 10) === checksumSha256.slice(0, 10)) {
          recognition.duplicateOf = { recognitionId: item.id, createdAt: item.createdAt, tradeId: item.tradeId };
          break;
        }
      }
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
      const input = parseBody(
        ocrConfirmInputSchema,
        await readJson(request),
      );
      // V2 §58 — the duplicate warnings are blocking at confirmation: the
      // user must acknowledge them explicitly ([Import Anyway] is a decision).
      if (found.duplicateOf && input.acknowledgeDuplicateScreenshot !== true) {
        return HttpResponse.json(
          { error: "A near-duplicate of this screenshot was already imported.", code: "OCR_DUPLICATE_UNACKNOWLEDGED" },
          { status: 409 },
        );
      }
      if (found.storedTradeDuplicate && input.acknowledgeDuplicateTrade !== true) {
        return HttpResponse.json(
          { error: "This recognition was flagged as a possible duplicate of an existing trade.", code: "OCR_TRADE_DUPLICATE_UNACKNOWLEDGED" },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      found.corrections = input.corrections;
      found.status = "CONFIRMED";
      found.confirmedAt = now;
      found.updatedAt = now;
      if (input.accountId !== undefined) found.accountId = input.accountId;

      // Corrections memory ledger (engine quality §2.3).
      const patterns = patternStore.get("demo-user") ?? new Map<string, { value: string; occurrences: number }>();
      const machineByKey = new Map<string, OcrRecognition["fields"][number]>(found.fields.map((field) => [field.field as string, field]));
      const entries = Object.entries(input.corrections);
      for (const [key, value] of entries) {
        if (value === null || value === "") continue;
        const machine = machineByKey.get(key);
        if (!machine || machine.rawValue === null || machine.rawValue === value) continue;
        const patternKey = `${key}\u0000${machine.rawValue}`;
        const existing = patterns.get(patternKey);
        patterns.set(patternKey, { value, occurrences: (existing?.occurrences ?? 0) + 1 });
      }
      patternStore.set("demo-user", patterns);

      // Grouped confirmation: canonical batches land in the stored aggregate
      // (the mock never creates journal trades — § house rule).
      // Non-trade profiles (Account & Chart V1.1): the confirmed values are
      // NOT trade facts — an explicit skip warning mirrors the Nest bridge.
      if (found.extractionProfile !== "TRADE_SUMMARY") {
        found.warnings = [...found.warnings, "TRADE_IMPORT_SKIPPED_PROFILE"].slice(0, 16);
      } else if (input.batches) {
        found.suggestedTags = ["Import", "Session London"];
        found.tradeIds = input.batches.filter((batch) => batch.include).map(() => "mock");
      } else if (Object.keys(input.corrections).length > 0) {
        found.suggestedTags = ["Import"];
      }
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

  // Re-OCR by crop (engine quality §2.4) — returns the overlapping fields
  // of the stored result shifted by the region origin (mock-grade guidance).
  http.post(endpoint(apiPaths.ocrRecognitionRecrop(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, "id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      const input = parseBody(
        ocrRecropInputSchema,
        await readJson(request),
      );
      const inRegion = found.fields.filter(
        (field) =>
          field.sourceRegion !== null &&
          field.sourceRegion.x >= input.region.x &&
          field.sourceRegion.x + field.sourceRegion.width <= input.region.x + input.region.width &&
          field.sourceRegion.y >= input.region.y &&
          field.sourceRegion.y + field.sourceRegion.height <= input.region.y + input.region.height,
      );
      const fields = (inRegion.length > 0 ? inRegion : found.fields).map((field) => ({
        ...field,
        sourceRegion: field.sourceRegion === null
          ? null
          : {
              x: Math.max(0, field.sourceRegion.x),
              y: Math.max(0, field.sourceRegion.y),
              width: field.sourceRegion.width,
              height: field.sourceRegion.height,
            },
      }));
      return HttpResponse.json({ fields, region: input.region } satisfies OcrRecropResponse);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // OCR quality analytics (engine quality §3.2) — derived from the store.
  http.get(endpoint(apiPaths.ocrAnalytics), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      ensureSeeds();
      const url = new URL(request.url);
      const windowDays = Math.min(Math.max(Number(url.searchParams.get("days") ?? "30"), 1), 365);
      const all = Array.from(store.values()).map((item) => {
        settleProcessing(item);
        return item;
      });
      const uploads = all.length;
      const failed = all.filter((item) => item.status === "FAILED").length;
      const confirmed = all.filter((item) => item.status === "CONFIRMED").length;
      const reviewRequired = all.filter((item) => item.status === "REVIEW_REQUIRED").length;
      const confidences = all
        .flatMap((item) => item.fields.filter((field) => field.validationStatus !== "MISSING").map((field) => field.confidence));
      const avgConfidence = confidences.length > 0
        ? Math.round((confidences.reduce((total, value) => total + value, 0) / confidences.length) * 100) / 100
        : null;
      const durations = all.map((item) => item.durationMs).filter((value): value is number => value !== null);
      const body: OcrAnalyticsResponse = {
        windowDays,
        funnel: {
          uploads,
          completed: uploads - failed,
          reviewRequired,
          confirmed,
          importedTrades: confirmed,
        },
        correctionsByField: [
          { field: "volume", corrections: 2, confirmations: confirmed },
          { field: "openTime", corrections: 1, confirmations: confirmed },
        ],
        avgConfidence,
        duplicatesBlocked: 0,
        avgDurationMs: durations.length > 0
          ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
          : null,
        // V2 §30 — correction rate + distributions (derived from the store).
        correctionRate:
          confirmed > 0
            ? Math.round(
                ((all.filter(
                  (item) =>
                    item.status === "CONFIRMED" &&
                    item.corrections !== null &&
                    Object.keys(item.corrections).length > 0,
                ).length /
                  confirmed) *
                  1000) /
                  1000,
              )
            : null,
        platformDistribution: deriveDistribution(
          all.map((item) => item.classification?.platform ?? null),
        ).map(({ key, count }) => ({ platform: key, count })),
        typeDistribution: deriveDistribution(
          all.map((item) => item.classification?.type ?? null),
        ).map(({ key, count }) => ({ type: key, count })),
      };
      return HttpResponse.json(body);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // Storage + retention indicator (engine quality §4.2).
  http.get(endpoint(apiPaths.ocrStorage), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      ensureSeeds();
      const all = Array.from(store.values());
      const body: OcrStorageResponse = {
        usedBytes: all.reduce((total, item) => total + item.asset.sizeBytes, 0),
        assetCount: all.length,
        retainedAssetCount: all.filter((item) => !item.asset.purged).length,
        purgedAssetCount: all.filter((item) => item.asset.purged).length,
        retentionDays: 30,
        oldestRetainedAssetAt:
          all.filter((item) => !item.asset.purged).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt ?? null,
      };
      return HttpResponse.json(body);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── V2 §32/§39 — reprocess: a FRESH recognition from the same asset ──────
  http.post(endpoint(apiPaths.ocrRecognitionReprocess(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, "id");
      const found = store.get(id);
      if (!found) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      if (found.asset.purged) {
        return HttpResponse.json(
          { error: "The stored screenshot was purged.", code: "OCR_ASSET_PURGED" },
          { status: 409 },
        );
      }
      const fresh: StoredRecognition = {
        ...structuredClone(found),
        id: crypto.randomUUID(),
        status: "PROCESSING",
        corrections: null,
        confirmedAt: null,
        tradeId: null,
        tradeIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.set(fresh.id, fresh);
      return HttpResponse.json({ recognition: { ...publicBody(fresh), reprocessedFrom: found.id } });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── V2 §1/§2/§18 — multi-screenshot recognition sets ──────────────────────
  http.post(endpoint(apiPaths.ocrSets), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      const input = parseBody(ocrSetCreateInputSchema, await readJson(request));
      const members: StoredRecognition[] = [];
      for (const dataUrl of input.imageDataUrls) {
        const payloadBytes = Uint8Array.from(atob(dataUrl.split(";base64,")[1] ?? ""), (char) => char.charCodeAt(0));
        const checksum = await sha256Hex(payloadBytes);
        const existing = [...store.values()].find((item) => item.asset.checksumSha256 === checksum);
        if (existing) {
          if (members.some((m) => m.id === existing.id)) {
            return HttpResponse.json(
              { error: "The same screenshot appears more than once in this set.", code: "OCR_SET_DUPLICATE_IMAGE" },
              { status: 400 },
            );
          }
          members.push(existing);
          continue;
        }
        const created = await createMockRecognition(dataUrl, checksum);
        members.push(created);
      }
      if (members.length < 2) {
        return HttpResponse.json({ error: "A set needs at least two screenshots." }, { status: 400 });
      }
      const now = new Date().toISOString();
      const fusion = fuseMockMembers(members);
      const set: MockSet = {
        id: crypto.randomUUID(),
        status: "REVIEW_REQUIRED",
        members: members.map((member, order) => ({ order, recognitionId: member.id })),
        result: fusion,
        corrections: null,
        tradeId: null,
        tradeIds: [],
        accountId: input.accountId ?? null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      setStore.set(set.id, set);
      return HttpResponse.json({ set: setBody(set) }, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrSets), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      const sets = [...setStore.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((set) => setBody(set));
      return HttpResponse.json({ items: sets, nextCursor: null });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrSet(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const set = setStore.get(pathParam(params, "id"));
      if (!set) return HttpResponse.json({ error: "Recognition set not found." }, { status: 404 });
      return HttpResponse.json({ set: setBody(set) });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.ocrSetConfirm(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const set = setStore.get(pathParam(params, "id"));
      if (!set) return HttpResponse.json({ error: "Recognition set not found." }, { status: 404 });
      if (set.status === "CONFIRMED") {
        return HttpResponse.json({ error: "This recognition set is already confirmed." }, { status: 409 });
      }
      const input = parseBody(ocrSetConfirmInputSchema, await readJson(request));
      const membersDuplicate = set.members.some((member) => store.get(member.recognitionId)?.duplicateOf);
      if (membersDuplicate && input.acknowledgeDuplicateScreenshot !== true) {
        return HttpResponse.json(
          { error: "A screenshot in this set was flagged as a near-duplicate.", code: "OCR_DUPLICATE_UNACKNOWLEDGED" },
          { status: 409 },
        );
      }
      if (set.result?.storedTradeDuplicate && input.acknowledgeDuplicateTrade !== true) {
        return HttpResponse.json(
          { error: "This set was flagged as a possible duplicate of an existing trade.", code: "OCR_TRADE_DUPLICATE_UNACKNOWLEDGED" },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      set.status = "CONFIRMED";
      set.corrections = input.corrections;
      set.confirmedAt = now;
      set.updatedAt = now;
      if (input.accountId !== undefined) set.accountId = input.accountId;
      set.tradeIds = ["mock-set-import"];
      set.tradeId = "mock-set-import";
      return HttpResponse.json({ set: setBody(set) });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.ocrSet(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, "id");
      if (!setStore.has(id)) {
        return HttpResponse.json({ error: "Recognition set not found." }, { status: 404 });
      }
      setStore.delete(id); // members survive (V2 §15)
      return HttpResponse.json({ deleted: true as const, id });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── V2 §28 — screenshot collections ──────────────────────────────────────
  http.post(endpoint(apiPaths.ocrCollections), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      const input = parseBody(ocrCollectionCreateInputSchema, await readJson(request));
      const name = input.name.trim();
      if ([...collectionStore.values()].some((c) => c.name === name)) {
        return HttpResponse.json(
          { error: "A collection with this name already exists.", code: "OCR_COLLECTION_NAME_TAKEN" },
          { status: 409 },
        );
      }
      const collection: MockCollection = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        items: [],
      };
      collectionStore.set(collection.id, collection);
      return HttpResponse.json({ collection }, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrCollections), async ({ request }) => {
    try {
      requireAuth(request);
      await latency();
      const collections = [...collectionStore.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return HttpResponse.json({ collections });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.ocrCollection(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const collection = collectionStore.get(pathParam(params, "id"));
      if (!collection) return HttpResponse.json({ error: "Collection not found." }, { status: 404 });
      return HttpResponse.json({ collection });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.ocrCollectionItems(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const collection = collectionStore.get(pathParam(params, "id"));
      if (!collection) return HttpResponse.json({ error: "Collection not found." }, { status: 404 });
      const input = parseBody(ocrCollectionAddItemInputSchema, await readJson(request));
      if (!store.has(input.recognitionId)) {
        return HttpResponse.json({ error: "Recognition not found." }, { status: 404 });
      }
      if (!collection.items.some((item) => item.recognitionId === input.recognitionId)) {
        collection.items.unshift({ recognitionId: input.recognitionId, addedAt: new Date().toISOString() });
      }
      return HttpResponse.json({ collection }, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.ocrCollectionItem(":id", ":recognitionId")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const collection = collectionStore.get(pathParam(params, "id"));
      if (!collection) return HttpResponse.json({ error: "Collection not found." }, { status: 404 });
      const recognitionId = pathParam(params, "recognitionId");
      collection.items = collection.items.filter((item) => item.recognitionId !== recognitionId);
      return HttpResponse.json({ collection });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.ocrCollection(":id")), async ({ request, params }) => {
    try {
      requireAuth(request);
      await latency();
      const id = pathParam(params, "id");
      if (!collectionStore.has(id)) {
        return HttpResponse.json({ error: "Collection not found." }, { status: 404 });
      }
      collectionStore.delete(id); // recognitions stay (§28)
      return HttpResponse.json({ deleted: true as const, id });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
