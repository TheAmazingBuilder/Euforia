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
  /** Re-OCR by crop (engine quality §2.4) — validated against the asset dims. */
  crop?: { x: number; y: number; width: number; height: number };
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
      /** V2 §18 — detected platform (default keeps older sidecars parsing). */
      platform: ocrPlatformSchema.default("UNKNOWN"),
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
  /** Multi-trade drafts from account-history screenshots (engine quality §2.2). */
  tradeCandidates: z
    .array(
      z.object({
        fields: z.array(
          z.object({
            field: ocrFieldKeySchema,
            rawValue: z.string().max(512).nullable(),
            normalizedValue: z.string().max(512).nullable(),
            confidence: z.number().min(0).max(1),
            sourceRegion: ocrSourceRegionSchema.nullable(),
            notes: z.array(z.string().max(256)).max(8),
          }),
        ),
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
