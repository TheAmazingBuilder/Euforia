/**
 * NestJS ↔ FastAPI OCR engine contract (Phase 19 §26/§27/§54).
 *
 * The sidecar is an UNTRUSTED processing component: its responses are parsed
 * with strict Zod schemas here (unknown fields stripped, wrong types
 * rejected) BEFORE any domain logic sees them (§54: "FastAPI output must
 * pass strict NestJS validation").
 *
 * Versioned (§33): contractVersion "1" — the engine echoes the request id
 * and version so stale/mismatched answers are detectable.
 */
import { z } from "zod";
import {
  ocrFieldKeySchema,
  ocrScreenshotTypeSchema,
  ocrPlatformSchema,
  ocrSourceRegionSchema,
  ocrFailureCategorySchema,
} from "../../../shared/contracts";

export const OCR_CONTRACT_VERSION = "1";

/**
 * The V1 fixed extraction profile (recognition V1 backend — every job on
 * this surface extracts a trade summary; the profile enum stays for the
 * sidecar's routing vocabulary).
 */
export const OCR_EXTRACTION_PROFILE: EngineExtractionProfile = "TRADE_SUMMARY";

/**
 * Extraction profiles (Recognition V1.1 — Account & Chart expansion).
 * The requested profile flows from the controller into the engine request;
 * the sidecar routes its extraction vocabulary accordingly and the Nest
 * side re-validates the output against the SAME profile (defense in depth).
 */
export const OCR_EXTRACTION_PROFILES = ["TRADE_SUMMARY", "ACCOUNT_POSITION", "CHART_ANALYSIS"] as const;
export type EngineExtractionProfile = (typeof OCR_EXTRACTION_PROFILES)[number];

/** What NestJS sends to the sidecar (§26 request). Built server-side only. */
export interface EngineRecognizeRequest {
  requestId: string;
  contractVersion: string;
  /** base64 of the DECODED image bytes (already size-checked at the boundary). */
  imageBase64: string;
  metadata: {
    mime: string;
    sizeBytes: number;
    /** V2 — null for PDF statements (the sidecar renders pages instead). */
    width: number | null;
    height: number | null;
    checksumSha256: string;
  };
  /** Fixed enum — never free user text (§26). */
  extractionProfile: EngineExtractionProfile;
  /** Soft processing budget in milliseconds — the sidecar honors it best-effort. */
  deadlineMs: number;
  /** Re-OCR by crop (engine quality §2.4) — validated against the asset dims. */
  crop?: { x: number; y: number; width: number; height: number };
  /** V2 §24 — PIXEL-rect re-read of a user-selected zone (recrop). */
  cropRegion?: { x: number; y: number; width: number; height: number };
}

// ── Response schemas (strict parsing of untrusted output, §54) ──────────────

const engineCandidateSchema = z.object({
  type: ocrScreenshotTypeSchema,
  confidence: z.number().min(0).max(1),
});

/** One engine-extracted field — the shared shape for flat fields and trades. */
const engineFieldSchema = z.object({
  field: ocrFieldKeySchema,
  rawValue: z.string().max(512).nullable(),
  normalizedValue: z.string().max(512).nullable(),
  confidence: z.number().min(0).max(1),
  sourceRegion: ocrSourceRegionSchema.nullable(),
  notes: z.array(z.string().max(256)).max(8),
});

/** V2 — one grouped trade read by the engine's row clustering (§2.2). */
export const engineTradeSchema = z.object({
  /** 0-based screenshot page the trade was read from (documents merge pages). */
  pageIndex: z.number().int().nonnegative(),
  fields: z.array(engineFieldSchema).max(64),
});
export type EngineTrade = z.infer<typeof engineTradeSchema>;

export const engineResponseSchema = z.object({
  requestId: z.string().min(1).max(128),
  contractVersion: z.string().min(1).max(8),
  processingStatus: z.enum(["COMPLETED", "UNPROCESSABLE", "FAILED"]),
  classification: z
    .object({
      type: ocrScreenshotTypeSchema,
      confidence: z.number().min(0).max(1),
      alternatives: z.array(engineCandidateSchema).max(4),
      /** V2 §18 — detected platform (default keeps older sidecars parsing). */
      platform: ocrPlatformSchema.default("UNKNOWN"),
    })
    .nullable(),
  fields: z.array(engineFieldSchema).max(64),
  /** V2 — grouped trades, when the engine supplied them (row clustering). */
  trades: z.array(engineTradeSchema).max(20).optional(),
  /** Multi-trade drafts from account-history screenshots (engine quality §2.2). */
  tradeCandidates: z
    .array(
      z.object({
        fields: z.array(engineFieldSchema),
      }),
    )
    .max(20)
    .default([]),
  /** 64-bit dHash fingerprint — duplicate detection input (engine quality §2.1). */
  perceptualHash: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .nullable()
    .default(null),
  warnings: z.array(z.string().max(256)).max(16),
  processingMetadata: z.object({
    engine: z.string().min(1).max(64),
    engineVersion: z.string().min(1).max(32),
    pipelineVersion: z.string().min(1).max(32),
    durationsMs: z.record(z.string(), z.number().int().nonnegative()),
    passes: z.array(z.string().max(64)).max(8).default([]),
    layoutTemplate: z.string().max(64).nullable().default(null),
    deskewDeg: z.number().min(-45).max(45).nullable().default(null),
    documentPages: z.number().int().min(1).max(1000).nullable().default(null),
    documentWidth: z.number().int().min(1).nullable().default(null),
    documentHeight: z.number().int().min(1).nullable().default(null),
  }),
  failure: z
    .object({
      category: ocrFailureCategorySchema,
      message: z.string().max(256),
    })
    .nullable(),
});
export type EngineResponse = z.infer<typeof engineResponseSchema>;

export type EngineEngineInfo = {
  name: string;
  engineVersion: string;
  pipelineVersion: string;
  contractVersion: string;
};

// ── Document pipeline (V2 — PDF statements) ─────────────────────────────────

/** One rendered page of a document recognition (per-page extraction). */
export interface EngineDocumentPage {
  /** 0-based render order. */
  pageIndex: number;
  classification: EngineResponse["classification"];
  fields: EngineResponse["fields"];
  /** Trades read from THIS page (pageIndex provenance preserved by callers). */
  trades: EngineTrade[];
  warnings: string[];
}

/** What NestJS sends for a PDF statement (built server-side only). */
export interface EngineDocumentRecognizeRequest {
  requestId: string;
  contractVersion: string;
  /** base64 of the DECODED document bytes (already size-checked at the boundary). */
  documentBase64: string;
  metadata: {
    mime: string;
    sizeBytes: number;
    checksumSha256: string;
  };
  extractionProfile: EngineExtractionProfile;
  deadlineMs: number;
}

/** Per-page merge happens on the Nest side; the sidecar answers page-wise. */
export interface EngineDocumentRecognizeResponse {
  requestId: string;
  contractVersion: string;
  processingStatus: EngineResponse["processingStatus"];
  pages: EngineDocumentPage[];
  perceptualHash: string | null;
  processingMetadata: EngineResponse["processingMetadata"];
  failure: EngineResponse["failure"];
}

// ── Port + typed engine errors (§34 retry semantics) ────────────────────────

export interface OcrEngine {
  readonly info: EngineEngineInfo;
  /**
   * Document (PDF statement) capability flag (V2 document pipeline). Engines
   * that cannot recognize documents stay `false`/omit the member — the
   * pipeline then fails the job honestly (SCREENSHOT_UNSUPPORTED), never a
   * fabricated partial read.
   */
  readonly supportsDocuments?: boolean;
  recognize(request: EngineRecognizeRequest): Promise<EngineResponse>;
  /** Present only when {@link OcrEngine.supportsDocuments} is true. */
  recognizeDocument?(request: EngineDocumentRecognizeRequest): Promise<EngineDocumentRecognizeResponse>;
}

export const OCR_ENGINE = Symbol("OCR_ENGINE");

/**
 * TRANSIENT engine failures (§34 retryable): connection refused, 5xx,
 * timeout, worker interruption. NON-transient: the sidecar refused the
 * image (4xx) or produced a structurally invalid payload — retrying cannot
 * change the outcome.
 */
export class EngineTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineTransientError";
  }
}

/** The sidecar rejected the request as unprocessable (4xx, no retry, §34). */
export class EngineUnprocessableError extends Error {
  constructor(
    readonly category:
      | "SCREENSHOT_UNSUPPORTED"
      | "RESOURCE_LIMIT"
      | "PROCESSING_TIMEOUT",
    message: string,
  ) {
    super(message);
    this.name = "EngineUnprocessableError";
  }
}

/** Structurally invalid payload — a contract violation, never retried (§34). */
export class EngineMalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineMalformedResponseError";
  }
}
