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
  ocrSourceRegionSchema,
  ocrFailureCategorySchema,
} from "../../../shared/contracts";

export const OCR_CONTRACT_VERSION = "1";

export const OCR_EXTRACTION_PROFILE = "TRADE_SUMMARY" as const;

/** What NestJS sends to the sidecar (§26 request). Built server-side only. */
export interface EngineRecognizeRequest {
  requestId: string;
  contractVersion: string;
  /** base64 of the DECODED image bytes (already size-checked at the boundary). */
  imageBase64: string;
  metadata: {
    mime: string;
    sizeBytes: number;
    width: number;
    height: number;
    checksumSha256: string;
  };
  /** Fixed enum — never free user text (§26). */
  extractionProfile: typeof OCR_EXTRACTION_PROFILE;
  /** Soft processing budget in milliseconds — the sidecar honors it best-effort. */
  deadlineMs: number;
}

// ── Response schemas (strict parsing of untrusted output, §54) ──────────────

const engineCandidateSchema = z.object({
  type: ocrScreenshotTypeSchema,
  confidence: z.number().min(0).max(1),
});

export const engineResponseSchema = z.object({
  requestId: z.string().min(1).max(128),
  contractVersion: z.string().min(1).max(8),
  processingStatus: z.enum(["COMPLETED", "UNPROCESSABLE", "FAILED"]),
  classification: z
    .object({
      type: ocrScreenshotTypeSchema,
      confidence: z.number().min(0).max(1),
      alternatives: z.array(engineCandidateSchema).max(4),
    })
    .nullable(),
  fields: z
    .array(
      z.object({
        field: ocrFieldKeySchema,
        rawValue: z.string().max(512).nullable(),
        normalizedValue: z.string().max(512).nullable(),
        confidence: z.number().min(0).max(1),
        sourceRegion: ocrSourceRegionSchema.nullable(),
        notes: z.array(z.string().max(256)).max(8),
      }),
    )
    .max(64),
  warnings: z.array(z.string().max(256)).max(16),
  processingMetadata: z.object({
    engine: z.string().min(1).max(64),
    engineVersion: z.string().min(1).max(32),
    pipelineVersion: z.string().min(1).max(32),
    durationsMs: z.record(z.string(), z.number().int().nonnegative()),
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

// ── Port + typed engine errors (§34 retry semantics) ────────────────────────

export interface OcrEngine {
  readonly info: EngineEngineInfo;
  recognize(request: EngineRecognizeRequest): Promise<EngineResponse>;
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
