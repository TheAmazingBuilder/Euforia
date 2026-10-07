/**
 * OCR application service (Phase 19) — the orchestration brain.
 *
 * Pipeline (§10): upload → validation → storage → job rows → engine call →
 * strict contract validation → domain validation → persistence → review →
 * confirmation. Request-scoped (no external queue in this build — same
 * pattern as the Accounts sync runs): a recognition completes, fails or is
 * reviewable by the time the HTTP answer is written.
 *
 * Non-negotiables enforced here:
 *   - the engine result is UNTRUSTED: zod-parsed (§54) then re-validated by
 *     the domain (§19) before it is ever persisted;
 *   - idempotency (§32): one recognition per (user, image, profile,
 *     pipeline) — replays return the original row, never a second job;
 *   - bounded retries (§34): only TRANSIENT engine failures retry, non-
 *     transient failures fail fast with a stable category;
 *   - human-in-the-loop (§21): nothing outside CONFIRMATION ever writes
 *     `corrections`; the ONLY path from a confirmed recognition to a Trade
 *     is the Phase 21 bridge (§77), which runs AFTER the confirmation commit
 *     and through Trading Core's canonical creation service;
 *   - every step is owner-scoped (§39) and audited through the shared
 *     SecurityEventService port (§48).
 */
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "../../shared/errors/app-error";
import type {
  OcrAsset,
  OcrClassification,
  OcrCorrectionRecord,
  OcrExtractedField,
  OcrFieldKey,
  OcrRecognition,
  OcrRecognitionPage,
  OcrValidationStatus,
} from "../../shared/contracts";
import { ImageValidationService } from "./image/image-validation.service";
import { SCREENSHOT_STORAGE, type ScreenshotStorage } from "./storage/screenshot-storage.port";
import {
  EngineMalformedResponseError,
  EngineTransientError,
  EngineUnprocessableError,
  OCR_ENGINE,
  OCR_EXTRACTION_PROFILE,
  type EngineResponse,
  type OcrEngine,
} from "./engine/ocr-engine.port";
import {
  applyCorrections,
  applyDomainValidation,
  buildRecognitionTimeline,
  collectCorrectionPatterns,
  computeQualityScore,
  confidenceBand,
  CorrectionError,
  deriveIdempotencyKey,
  deriveRecognitionIssues,
  DUPLICATE_HAMMING_THRESHOLD,
  hammingDistance64,
  validateCorrectionStored,
} from "./ocr.logic";
import { OcrRateLimiterService } from "./ocr-rate-limiter.service";
import {
  OcrRepository,
  decodeOcrCursor,
  type OcrRecognitionRow,
  type OcrResultPayload,
} from "./ocr.repository";
import type { OcrRecropResponse } from "../../shared/contracts";
import { OcrTradeImportService } from "./ocr-trade-import.service";
import { AccountsRepository } from "../accounts/accounts.repository";
import { SecurityEventService } from "../security/security-event.service";

/** Pipeline version recorded on every row (§33 — results stay interpretable). */
export const OCR_PIPELINE_VERSION = "2026.10.04";

export const OCR_ERROR_CODES = {
  RATE_LIMITED_UPLOAD: "OCR_UPLOAD_RATE_LIMITED",
  RATE_LIMITED_CONFIRM: "OCR_CONFIRM_RATE_LIMITED",
  UNAVAILABLE: "OCR_UNAVAILABLE",
  TIMEOUT: "OCR_PROCESSING_TIMEOUT",
  UNSUPPORTED: "OCR_SCREENSHOT_UNSUPPORTED",
  EXTRACTION_FAILED: "OCR_EXTRACTION_FAILED",
  ALREADY_CONFIRMED: "OCR_ALREADY_CONFIRMED",
  NO_REVIEW_PENDING: "OCR_REVIEW_NOT_PENDING",
  INVALID_CURSOR: "INVALID_CURSOR",
  NO_BATCHES: "OCR_NO_TRADE_CANDIDATES",
  BATCHES_MISMATCH: "OCR_BATCHES_MISMATCH",
  RECROP_UNPROCESSABLE: "OCR_RECROP_UNPROCESSABLE",
  RECROP_UNSUPPORTED: "OCR_RECROP_UNSUPPORTED",
  ACCOUNT_NOT_FOUND: "OCR_ACCOUNT_NOT_FOUND",
  // V2 §58 — a flagged recognition needs an explicit user acknowledgment.
  DUPLICATE_SCREENSHOT_UNACKNOWLEDGED: "OCR_DUPLICATE_UNACKNOWLEDGED",
  DUPLICATE_TRADE_UNACKNOWLEDGED: "OCR_TRADE_DUPLICATE_UNACKNOWLEDGED",
} as const;

export interface OcrRecognitionDto {
  recognition: OcrRecognition;
}

interface AssetMeta {
  id: string;
  userId: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  checksumSha256: string;
  storageKey: string;
}

@Injectable()
export class OcrService {
  constructor(
    private readonly repository: OcrRepository,
    private readonly imageValidation: ImageValidationService,
    @Inject(SCREENSHOT_STORAGE) private readonly storage: ScreenshotStorage,
    @Inject(OCR_ENGINE) private readonly engine: OcrEngine,
    private readonly limiter: OcrRateLimiterService,
    private readonly securityEvents: SecurityEventService,
    private readonly tradeImport: OcrTradeImportService,
    private readonly accounts: AccountsRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Upload + recognition (§10 stages 1–11) ────────────────────────────────

  async createRecognition(input: {
    userId: string;
    imageDataUrl: string;
    requestedProfile: "TRADE_SUMMARY";
    requestId: string | null;
    accountId?: string | null;
  }): Promise<OcrRecognitionDto> {
    // ACCOUNTS attachment (engine quality §3.1): the explicit choice is
    // validated for OWNERSHIP before anything persists (§39).
    let accountId: string | null = null;
    if (input.accountId) {
      const account = await this.accounts.findAccountForUser(input.accountId, input.userId);
      if (!account) {
        throw new NotFoundError("Trading account not found.", OCR_ERROR_CODES.ACCOUNT_NOT_FOUND);
      }
      accountId = account.id;
    }
    const check = this.limiter.check("upload", input.userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many screenshot uploads. Please wait before trying again.",
        OCR_ERROR_CODES.RATE_LIMITED_UPLOAD,
        check.retryAfterSeconds,
      );
    }

    // Stage 1 — input validation (§7/§8/§38). Throws ValidationError 400.
    const image = this.imageValidation.validateDataUrl(input.imageDataUrl, {
      maxBytes: this.config.ocr.uploadMaxBytes,
      maxPixels: this.config.ocr.imageMaxPixels,
    });

    // Stage 2 — idempotency (§32): replays return the existing recognition.
    const idempotencyKey = deriveIdempotencyKey(
      input.userId,
      image.checksumSha256,
      OCR_EXTRACTION_PROFILE,
      OCR_PIPELINE_VERSION,
    );
    const existing = await this.repository.findRecognitionByIdempotencyKey(input.userId, idempotencyKey);
    if (existing) {
      return { recognition: toRecognitionDto(existing) };
    }
    this.limiter.hit("upload", input.userId);

    // Stage 3 — storage (§6): the binary goes behind the storage port with a
    // key derived from validated inputs only. The same image (same checksum)
    // shares one stored asset across recognitions (§32).
    const assetRow = await this.ensureAsset(input.userId, image);
    const row = await this.repository
      .createRecognition(assetRow, {
        status: "QUEUED",
        extractionProfile: OCR_EXTRACTION_PROFILE,
        pipelineVersion: OCR_PIPELINE_VERSION,
        idempotencyKey,
        requestId: input.requestId,
        accountId,
      })
      .catch(async (error) => {
        // Lost the (userId, idempotencyKey) race against a concurrent tab
        // (§51) — re-read the winning row; replay policy returns it as-is.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const winner = await this.repository.findRecognitionByIdempotencyKey(input.userId, idempotencyKey);
          if (winner) return winner;
        }
        throw error;
      });

    // Audit (§48) — upload facts only, never the image itself (§36).
    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_UPLOAD",
      actor: input.userId,
      context: `screenshot uploaded (${image.mime}, ${image.width}x${image.height}, ${image.sizeBytes} B)`,
      outcome: "SUCCESS",
    });

    // Stages 4–11 — processing, request-scoped (§24 lifecycle).
    return this.processRow(input.userId, row, assetRow);
  }

  /** Store the binary + metadata row when the image has never been stored. */
  private async ensureAsset(userId: string, image: {
    bytes: Buffer;
    mime: string;
    sizeBytes: number;
    width: number;
    height: number;
    checksumSha256: string;
  }): Promise<AssetMeta> {
    const existing = await this.repository.findAssetByChecksum(userId, image.checksumSha256);
    if (existing) {
      return {
        id: existing.id,
        userId: existing.userId,
        mime: existing.mime,
        sizeBytes: existing.sizeBytes,
        width: existing.width,
        height: existing.height,
        checksumSha256: existing.checksumSha256,
        storageKey: existing.storageKey,
      };
    }
    const storageKey = await this.storage.put({
      userId,
      checksumSha256: image.checksumSha256,
      mime: image.mime,
      bytes: image.bytes,
    });
    const created = await this.repository
      .createAsset(userId, {
        phashHex: null, // the engine computes the fingerprint during processing
        storageKey,
        originalName: `screenshot.${mimeExtension(image.mime)}`,
        mime: image.mime,
        sizeBytes: image.sizeBytes,
        width: image.width,
        height: image.height,
        checksumSha256: image.checksumSha256,
      })
      .catch(async (error) => {
        // Lost the (userId, checksum) race (§51): the winning asset row is
        // the shared one — this file copy becomes an orphan (§31) and is
        // removed best-effort.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const winner = await this.repository.findAssetByChecksum(userId, image.checksumSha256);
          if (winner) {
            void this.storage.delete(storageKey);
            return winner;
          }
        }
        throw error;
      });
    return {
      id: created.id,
      userId: created.userId,
      mime: created.mime,
      sizeBytes: created.sizeBytes,
      width: created.width,
      height: created.height,
      checksumSha256: created.checksumSha256,
      storageKey: created.storageKey,
    };
  }

  /** Engine call with bounded retries on TRANSIENT failures only (§34). */
  private async callEngine(request: Parameters<OcrEngine["recognize"]>[0]): Promise<EngineResponse> {
    const maxRetries = this.config.ocr.engineMaxRetries;
    let attempt = 0;
    for (;;) {
      try {
        return await this.engine.recognize(request);
      } catch (error) {
        const transient = error instanceof EngineTransientError;
        if (transient && attempt < maxRetries) {
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  /** QUEUED → (REVIEW_REQUIRED | FAILED) for one recognition row. */
  private async processRow(userId: string, row: OcrRecognitionRow, asset: AssetMeta): Promise<OcrRecognitionDto> {
    await this.repository.markProcessing(row.id, row.requestId);
    const attemptsUsed = { count: 1 };
    try {
      const bytes = await this.storage.get(asset.storageKey);
      if (bytes === null) {
        // Storage/metadata divergence is an infrastructure fault, not user
        // error — surfaced as an explicit FAILED state (§35), never a fake
        // reviewable result.
        return this.failRow(userId, row, "EXTRACTION_FAILED", "stored screenshot is unreadable", attemptsUsed.count);
      }

      const response = await this.callEngine({
        requestId: row.id,
        contractVersion: "1",
        imageBase64: bytes.toString("base64"),
        metadata: {
          mime: asset.mime,
          sizeBytes: asset.sizeBytes,
          width: asset.width,
          height: asset.height,
          checksumSha256: asset.checksumSha256,
        },
        extractionProfile: OCR_EXTRACTION_PROFILE,
        deadlineMs: this.config.ocr.engineTimeoutMs,
      });
      attemptsUsed.count = 1 + this.config.ocr.engineMaxRetries;

      if (response.processingStatus === "UNPROCESSABLE") {
        const category = response.failure?.category ?? "SCREENSHOT_UNSUPPORTED";
        return this.failRow(userId, row, category, response.failure?.message ?? "the sidecar could not process this screenshot", attemptsUsed.count);
      }

      // Stage 9–10 — map + domain-validate the engine output (§19/§17).
      let fields = applyDomainValidation(response.fields.map(mapEngineField));
      // Multi-trade candidates get the SAME domain treatment (§2.2) —
      // grouped evidence is untrusted machine output until confirmed.
      const candidates = response.tradeCandidates.map((candidate) => ({
        fields: applyDomainValidation(candidate.fields.map(mapEngineField)),
      }));
      // Perceptual fingerprint → asset row (duplicate detection input,
      // engine quality §2.1). Best-effort: a missing hash only disables the
      // advisory duplicate flag, never the pipeline.
      if (response.perceptualHash) {
        await this.repository.setAssetPhash(asset.id, response.perceptualHash);
      }
      // PDF statements report the RENDERED first-page dimensions (§4.3) —
      // the asset row was created with placeholders.
      if (response.processingMetadata.documentWidth && response.processingMetadata.documentHeight) {
        await this.repository.updateAssetDimensions(
          asset.id,
          response.processingMetadata.documentWidth,
          response.processingMetadata.documentHeight,
        );
      }
      // Duplicate detection (engine quality §2.1): compare the fresh
      // fingerprint against the user's recent pool. Advisory — the pipeline
      // result stands; the review UI surfaces the earlier import.
      let duplicateOf: OcrResultPayload["duplicateOf"] = null;
      if (response.perceptualHash) {
        const pool = await this.repository.recentPhashesForUser(userId, {
          limit: 400,
          excludeAssetId: asset.id,
        });
        const match = pool.find(
          (candidate) =>
            hammingDistance64(candidate.phashHex, response.perceptualHash as string) !== null &&
            (hammingDistance64(candidate.phashHex, response.perceptualHash as string) as number) <=
              DUPLICATE_HAMMING_THRESHOLD,
        );
        if (match) {
          const prior = await this.repository.findOldestRecognitionForAsset(match.assetId);
          if (prior && prior.id !== row.id) {
            duplicateOf = {
              recognitionId: prior.id,
              createdAt: prior.createdAt.toISOString(),
              tradeId: prior.tradeId,
            };
          }
        }
      }
      // Corrections memory (engine quality §2.3): attach the user's own
      // recurring corrections as advisory suggestions on matching rawValues.
      const suggestions = await this.repository.findSuggestionsForRawValues(
        userId,
        fields
          .filter((f) => f.rawValue !== null)
          .map((f) => ({ fieldKey: f.field, rawValue: f.rawValue as string })),
      );
      if (suggestions.size > 0) {
        fields = fields.map((field) => {
          const suggestion = suggestions.get(`${field.field}\u0000${field.rawValue ?? ""}`);
          return suggestion ? { ...field, suggestion } : field;
        });
      }
      // Trade duplicate detection (V2 §4) — content match against the
      // user's existing Trades. Advisory: stored on the result, surfaced at
      // review, and an explicit acknowledgment is required to confirm.
      const duplicateDetection = await this.tradeImport
        .detectTradeDuplicate({ userId, fields })
        .catch(() => ({ symbolInCatalog: false, duplicate: null }));
      const possibleTradeDuplicate: OcrResultPayload["possibleTradeDuplicate"] =
        duplicateDetection.duplicate === null
          ? null
          : {
              tradeId: duplicateDetection.duplicate.tradeId,
              matchedOn: [...duplicateDetection.duplicate.matchedOn],
              detectedAt: new Date().toISOString(),
            };
      // Catalog resolution is a processing-time fact (V2 §16) — persisted
      // so the derived UNKNOWN_SYMBOL issue never needs a DB roundtrip.
      const symbolInCatalog: boolean | null = fields.some(
        (f) => f.field === "symbol" && f.normalizedValue !== null,
      )
        ? duplicateDetection.symbolInCatalog
        : null;
      const mergedWarnings = mergeWarnings(
        response.warnings,
        fields.flatMap((f) => f.warnings.filter((w) => w === "TIMEZONE_UNKNOWN")),
      );
      const result: OcrResultPayload = {
        classification: response.classification,
        fields,
        warnings: mergedWarnings,
        engine: {
          name: response.processingMetadata.engine,
          engineVersion: response.processingMetadata.engineVersion,
          pipelineVersion: response.processingMetadata.pipelineVersion,
          contractVersion: response.contractVersion,
        },
        durationMs: response.processingMetadata.durationsMs["total"] ?? null,
        candidates: candidates.length > 0 ? candidates : null,
        duplicateOf,
        passes: response.processingMetadata.passes,
        layoutTemplate: response.processingMetadata.layoutTemplate,
        deskewDeg: response.processingMetadata.deskewDeg,
        possibleTradeDuplicate,
        symbolInCatalog,
      };
      const updated = await this.repository.persistResult(row.id, result);
      if (!updated) {
        // The row moved concurrently (deleted mid-processing, §51) — the
        // current state wins, whatever it is.
        const current = await this.repository.findForUser(row.id, userId);
        if (!current) throw new NotFoundError("Recognition not found.");
        return { recognition: toRecognitionDto(current) };
      }
      return { recognition: toRecognitionDto(updated) };
    } catch (error) {
      // Failure taxonomy (§34/§35): map engine errors to stable categories.
      if (error instanceof EngineUnprocessableError) {
        return this.failRow(userId, row, error.category, error.message, attemptsUsed.count);
      }
      if (error instanceof EngineMalformedResponseError) {
        // Contract violation — deterministic, retry cannot help (§34/§54).
        return this.failRow(userId, row, "EXTRACTION_FAILED", "the engine returned an invalid result payload", attemptsUsed.count);
      }
      if (error instanceof EngineTransientError) {
        const timeout = /timeout|abort/i.test(error.message);
        return this.failRow(
          userId,
          row,
          timeout ? "PROCESSING_TIMEOUT" : "OCR_UNAVAILABLE",
          timeout
            ? "the recognition did not finish in time"
            : "the recognition service is currently unavailable",
          attemptsUsed.count,
        );
      }
      // Unknown failures never leak internals (§36) — a stable category plus
      // a sanitized message, diagnostics in the logs.
      return this.failRow(userId, row, "ENGINE_ERROR", "the recognition pipeline failed unexpectedly", attemptsUsed.count);
    }
  }

  /** Persist the FAILED state + audit event; returns the DTO (never throws). */
  private async failRow(
    userId: string,
    row: OcrRecognitionRow,
    category: OcrRecognition["failure"] extends null ? never : string,
    message: string,
    attempts: number,
  ): Promise<OcrRecognitionDto> {
    const updated = await this.repository.persistFailure(row.id, {
      category,
      message,
      attempt: attempts,
    });
    await this.securityEvents.record({
      userId,
      type: "OCR_PROCESSING_FAILED",
      actor: userId,
      context: `recognition failed (${category})`,
      outcome: "FAILURE",
    });
    if (updated) return { recognition: toRecognitionDto(updated) };
    const current = await this.repository.findForUser(row.id, userId);
    if (!current) throw new NotFoundError("Recognition not found.");
    return { recognition: toRecognitionDto(current) };
  }

  /** Lightweight status projection for the SSE progress stream. */
  async getStatus(userId: string, id: string): Promise<{ id: string; status: string } | null> {
    return this.repository.findStatusForUser(id, userId);
  }

  // ── Read paths (§39 owner-scoped) ─────────────────────────────────────────

  async getRecognition(userId: string, id: string): Promise<OcrRecognitionDto> {
    const row = await this.repository.findForUser(id, userId);
    if (!row) throw new NotFoundError("Recognition not found.");
    return { recognition: toRecognitionDto(row) };
  }

  async listRecognitions(
    userId: string,
    query: { limit: number; cursor?: string; status?: OcrRecognition["status"] },
  ): Promise<OcrRecognitionPage> {
    let cursor: { createdAt: Date; id: string } | null = null;
    if (query.cursor !== undefined) {
      cursor = decodeOcrCursor(query.cursor);
      if (cursor === null) {
        // Same convention as the Phase 16 activity routes: malformed cursor
        // → 400 INVALID_CURSOR.
        throw new ValidationError(
          "The pagination cursor is invalid.",
          [{ path: "cursor", message: "Malformed cursor" }],
          OCR_ERROR_CODES.INVALID_CURSOR,
        );
      }
    }
    const page = await this.repository.listPageForUser(userId, {
      limit: query.limit,
      cursor,
      status: query.status ?? null,
    });
    return {
      items: page.items.map(toRecognitionDto),
      nextCursor: page.nextCursor,
    };
  }

  // ── Human confirmation (§21/§50/§51) ──────────────────────────────────────

  async confirmRecognition(input: {
    userId: string;
    id: string;
    corrections: OcrCorrectionRecord;
    batches?: { corrections: OcrCorrectionRecord; include: boolean }[];
    accountId?: string | null;
    /** V2 §58 — explicit acknowledgments of the advisory duplicate flags. */
    acknowledgeDuplicateScreenshot?: boolean;
    acknowledgeDuplicateTrade?: boolean;
  }): Promise<OcrRecognitionDto> {
    const check = this.limiter.check("confirm", input.userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many confirmation attempts. Please wait before trying again.",
        OCR_ERROR_CODES.RATE_LIMITED_CONFIRM,
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("confirm", input.userId);

    const row = await this.repository.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Recognition not found.");

    // ACCOUNTS attachment at confirmation (engine quality §3.1): validated
    // ownership; `null` explicitly detaches, `undefined` leaves as-is.
    if (input.accountId) {
      const account = await this.accounts.findAccountForUser(input.accountId, input.userId);
      if (!account) {
        throw new NotFoundError("Trading account not found.", OCR_ERROR_CODES.ACCOUNT_NOT_FOUND);
      }
    }

    const machineFieldsPre = (row.result?.fields ?? []) as OcrExtractedField[];
    const candidateDrafts = (row.result?.candidates ?? null) as { fields: OcrExtractedField[] }[] | null;

    // V2 §58 — duplicate warnings are ADVISORY at review time but BLOCKING
    // at confirmation: the user must have seen the flag and acknowledged it
    // explicitly. Never a silent double import, never a silent discard.
    if (row.result?.duplicateOf && input.acknowledgeDuplicateScreenshot !== true) {
      throw new ConflictError(
        "This screenshot was flagged as a near-duplicate of an earlier import. Acknowledge the warning to proceed.",
        OCR_ERROR_CODES.DUPLICATE_SCREENSHOT_UNACKNOWLEDGED,
      );
    }
    if (row.result?.possibleTradeDuplicate && input.acknowledgeDuplicateTrade !== true) {
      throw new ConflictError(
        "This recognition was flagged as a possible duplicate of an existing trade. Acknowledge the warning to proceed.",
        OCR_ERROR_CODES.DUPLICATE_TRADE_UNACKNOWLEDGED,
      );
    }

    // Canonicalize BEFORE the replay comparison: the stored record holds the
    // VALIDATED DECLARATION ("2345,60" → "2345.60", §21), so a retry of the
    // SAME logical payload must replay idempotently even when it arrives in
    // raw user form (two tabs, network retry — §51). Invalid corrections are
    // a 422 here regardless of the row state — the payload is what is broken.
    const machineFields = machineFieldsPre;
    const canonicalCorrections = canonicalizeCorrections(input.corrections);

    // Grouped confirmation (engine quality §2.2): every batch is
    // canonicalized against ITS candidate's machine fields — the same
    // domain rules, per draft. When batches are absent the single-trade
    // path is used verbatim (backward compatible).
    let batchPlan: { index: number; corrections: Record<string, string | null>; include: boolean }[] | null = null;
    if (input.batches !== undefined) {
      if (candidateDrafts === null || candidateDrafts.length === 0) {
        throw new ConflictError(
          "This recognition has no multi-trade drafts to confirm.",
          OCR_ERROR_CODES.NO_BATCHES,
        );
      }
      if (input.batches.length !== candidateDrafts.length) {
        throw new ValidationError(
          "The confirmation must cover every trade draft exactly once.",
          [{ path: "batches", message: `expected ${candidateDrafts.length} batches` }],
          OCR_ERROR_CODES.BATCHES_MISMATCH,
        );
      }
      batchPlan = input.batches.map((batch, index) => ({
        index,
        corrections: canonicalizeCorrections(batch.corrections),
        include: batch.include,
      }));
    }

    if (row.status === "CONFIRMED") {
      // Idempotent replay of the SAME payload (two tabs, §51) is a no-op
      // success; a DIFFERENT payload after confirmation is a conflict —
      // confirmed values are never silently rewritten (§21).
      const samePayload = batchPlan !== null
        ? sameBatches((row.result?.batches ?? null) as OcrResultPayload["batches"] ?? null, batchPlan)
        : sameCorrections(row.corrections, canonicalCorrections);
      if (samePayload) {
        return { recognition: toRecognitionDto(row) };
      }
      throw new ConflictError("This recognition is already confirmed.", OCR_ERROR_CODES.ALREADY_CONFIRMED);
    }
    if (row.status !== "REVIEW_REQUIRED") {
      throw new ConflictError(
        "Only a processed recognition can be confirmed.",
        OCR_ERROR_CODES.NO_REVIEW_PENDING,
      );
    }

    // User corrections become authoritative — validated with the SAME domain
    // rules as machine values (§21). The record stores the user's VALIDATED
    // DECLARATION (separators canonicalized to plain-dot form, declared
    // precision preserved: "2345,60" → "2345.60"), so a confirmation replay
    // is idempotent against the exact confirmed statement; ambiguous input
    // ("1.234", "2 345,60") is a 422 with a stable code, never a 500, never
    // a silent store. The merged FIELDS carry the normalized wire form
    // ("1.0850" → "1.085").
    const { fields: mergedFields, correctionCount } = applyCorrectionsSafe(
      machineFields,
      canonicalCorrections,
    );

    // Per-draft merged fields for the grouped path (validated above).
    const draftMergedFields = batchPlan === null
      ? null
      : batchPlan.map((batch) => {
          const candidateFields = candidateDrafts![batch.index]!.fields;
          try {
            return {
              index: batch.index,
              include: batch.include,
              fields: applyCorrections(candidateFields, batch.corrections).fields,
            };
          } catch (error) {
            if (error instanceof CorrectionError) {
              const detail = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
              throw new BusinessRuleError(
                `Invalid correction value for draft ${batch.index} (${detail}).`,
                "OCR_CORRECTION_INVALID",
              );
            }
            throw error;
          }
        });

    const mergedResult: OcrResultPayload = {
      classification: row.result?.classification ?? null,
      fields: mergedFields,
      warnings: row.result?.warnings ?? [],
      engine: row.result?.engine ?? null,
      durationMs: row.result?.durationMs ?? null,
      candidates: row.result?.candidates ?? null,
      duplicateOf: row.result?.duplicateOf ?? null,
      passes: row.result?.passes,
      layoutTemplate: row.result?.layoutTemplate,
      deskewDeg: row.result?.deskewDeg,
      possibleTradeDuplicate: row.result?.possibleTradeDuplicate ?? null,
      symbolInCatalog: row.result?.symbolInCatalog ?? null,
      ...(batchPlan !== null
        ? { batches: batchPlan.map((batch) => ({ corrections: batch.corrections, include: batch.include })) }
        : {}),
    };

    const updated = await this.repository.confirm(input.id, {
      corrections: batchPlan !== null ? batchPlan[0]!.corrections : canonicalCorrections,
      mergedResult,
    });
    if (!updated) {
      // Concurrent confirmation raced us (§51) — replay the same policy.
      const winner = await this.repository.findForUser(input.id, input.userId);
      const winnerSame = winner?.status === "CONFIRMED" && (
        batchPlan !== null
          ? sameBatches((winner.result?.batches ?? null) as OcrResultPayload["batches"] ?? null, batchPlan)
          : sameCorrections(winner.corrections, canonicalCorrections)
      );
      if (winnerSame) {
        return { recognition: toRecognitionDto(winner!) };
      }
      throw new ConflictError("This recognition is already confirmed.", OCR_ERROR_CODES.ALREADY_CONFIRMED);
    }

    // Account attachment (engine quality §3.1) — after the confirmation
    // commit, before the bridge so the import sees the final target.
    if (input.accountId !== undefined) {
      await this.repository.attachAccount(input.id, input.accountId);
    }

    // Corrections memory (engine quality §2.3): every CHANGED field becomes
    // a recurrence-counted pattern that feeds future suggestions.
    const memoryEntries = batchPlan === null
      ? collectCorrectionPatterns(machineFields, canonicalCorrections)
      : batchPlan.flatMap((batch) =>
          collectCorrectionPatterns(candidateDrafts![batch.index]!.fields, batch.corrections),
        );
    if (memoryEntries.length > 0) {
      await this.repository
        .upsertCorrectionPatterns(input.userId, memoryEntries)
        .catch(() => undefined); // advisory memory — never blocks confirmation
    }

    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_RESULT_CONFIRMED",
      actor: input.userId,
      context: batchPlan !== null
        ? `recognition confirmed as ${batchPlan.filter((b) => b.include).length} grouped trade(s) with ${correctionCount} correction(s)`
        : `recognition confirmed with ${correctionCount} correction(s)`,
      outcome: "SUCCESS",
    });

    // Phase 21 — the sanctioned confirmation → Trading Core bridge (§77).
    // Runs AFTER the confirmation commit: the user's declaration is already
    // authoritative, so an import problem can NEVER fail the confirmation
    // (§126 failure isolation) — it becomes a stable warning on the
    // recognition plus an audit fact. Trades are created through
    // TradesService.createTrade (canonical application service); ids are
    // linked here afterwards (one-way provenance, §77).
    const { tradeId, tradeIds, warnings: importWarnings, suggestedTags } =
      await this.tradeImport.importFromConfirmation({
        userId: input.userId,
        recognitionId: input.id,
        ...(batchPlan !== null
          ? {
              drafts: draftMergedFields!.map((draft) => ({
                index: draft.index,
                include: draft.include,
                mergedFields: draft.fields,
              })),
            }
          : { mergedFields }),
        accountId: input.accountId,
      });

    const finalWarnings = [...mergedResult.warnings, ...importWarnings].slice(0, 16);
    const finalRow =
      tradeId !== null || tradeIds.length > 0 || importWarnings.length > 0 || suggestedTags.length > 0
        ? ((await this.repository.linkTrade(input.id, {
            tradeId,
            tradeIds,
            result: { ...mergedResult, warnings: finalWarnings, suggestedTags },
          })) ?? updated)
        : updated;

    return { recognition: toRecognitionDto(finalRow) };
  }

  // ── Re-OCR by crop (engine quality §2.4) ─────────────────────────────────

  /**
   * Targeted re-OCR over a user-framed region of the stored screenshot.
   * EPHEMERAL guidance for the review UI — nothing is persisted, the
   * stored machine result stays untouched (§21: corrections remain the
   * only authoritative write path).
   */
  async recropRecognition(
    userId: string,
    id: string,
    region: { x: number; y: number; width: number; height: number },
  ): Promise<OcrRecropResponse> {
    const check = this.limiter.check("recrop", userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many region re-scans. Please wait before trying again.",
        "OCR_RECROP_RATE_LIMITED",
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("recrop", userId);

    const row = await this.repository.findForUser(id, userId);
    if (!row) throw new NotFoundError("Recognition not found.");
    if (row.screenshotPurgedAt !== null) {
      throw new NotFoundError("Stored screenshot is missing.");
    }
    if (row.asset.mime === "application/pdf") {
      throw new BusinessRuleError(
        "Region re-scan is available for screenshots, not PDF statements.",
        OCR_ERROR_CODES.RECROP_UNSUPPORTED,
      );
    }
    if (
      region.x + region.width > row.asset.width ||
      region.y + region.height > row.asset.height
    ) {
      throw new ValidationError(
        "The region exceeds the screenshot dimensions.",
        [{ path: "region", message: `must fit within ${row.asset.width}x${row.asset.height}` }],
        "OCR_RECROP_REGION_INVALID",
      );
    }

    const bytes = await this.storage.get(row.asset.storageKey);
    if (bytes === null) {
      throw new NotFoundError("Stored screenshot is missing.");
    }

    const response = await this.callEngine({
      requestId: row.id,
      contractVersion: "1",
      imageBase64: bytes.toString("base64"),
      metadata: {
        mime: row.asset.mime,
        sizeBytes: row.asset.sizeBytes,
        width: row.asset.width,
        height: row.asset.height,
        checksumSha256: row.asset.checksumSha256,
      },
      extractionProfile: OCR_EXTRACTION_PROFILE,
      deadlineMs: this.config.ocr.engineTimeoutMs,
      crop: region,
    });

    if (response.processingStatus === "UNPROCESSABLE") {
      throw new BusinessRuleError(
        "No readable text found in this region.",
        OCR_ERROR_CODES.RECROP_UNPROCESSABLE,
      );
    }
    if (response.processingStatus !== "COMPLETED") {
      throw new BusinessRuleError(
        "The region re-scan could not complete.",
        OCR_ERROR_CODES.UNAVAILABLE,
      );
    }

    const fields = applyDomainValidation(response.fields.map(mapEngineField));
    return { fields, region };
  }

  // ── Deletion (§31) ────────────────────────────────────────────────────────

  async deleteRecognition(userId: string, id: string): Promise<{ deleted: true; id: string }> {
    const deleted = await this.repository.deleteForUser(id, userId);
    if (!deleted) throw new NotFoundError("Recognition not found.");
    if (deleted.storageKey !== null) {
      // AFTER commit (§50): binary removal is best-effort (§31) — a failure
      // leaves an orphan file, never an orphaned metadata row.
      await this.storage.delete(deleted.storageKey);
    }
    await this.securityEvents.record({
      userId,
      type: "OCR_RESULT_DELETED",
      actor: userId,
      context: "recognition deleted",
      outcome: "SUCCESS",
    });
    return { deleted: true, id };
  }

  // ── Image bytes for the review UI (§18/§21) ───────────────────────────────

  async getRecognitionImage(userId: string, id: string): Promise<{ bytes: Buffer; mime: string }> {
    const row = await this.repository.findForUser(id, userId);
    if (!row) throw new NotFoundError("Recognition not found.");
    const bytes = await this.storage.get(row.asset.storageKey);
    if (bytes === null) {
      throw new NotFoundError("Stored screenshot is missing.");
    }
    return { bytes, mime: row.asset.mime };
  }
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

/**
 * Engine field → contract field: banding (§17) and uncertainty statuses
 * (§20). normalizedValue is trusted ONLY after the domain re-validation
 * that runs right after this mapping (applyDomainValidation).
 */
function mapEngineField(field: EngineResponse["fields"][number]): OcrExtractedField {
  const band = confidenceBand(field.confidence);
  let status: OcrValidationStatus;
  if (field.normalizedValue === null) {
    status = field.rawValue === null ? "MISSING" : "AMBIGUOUS";
  } else if (band === "UNKNOWN" || band === "LOW") {
    status = "LOW_CONFIDENCE";
  } else {
    status = "VALID";
  }
  return {
    field: field.field,
    rawValue: field.rawValue,
    normalizedValue: field.normalizedValue === null ? null : field.normalizedValue.slice(0, 256),
    confidence: field.confidence,
    confidenceBand: band,
    validationStatus: status,
    sourceRegion: field.sourceRegion,
    warnings: field.notes.slice(0, 8),
  };
}

/** Up to 16 warnings, de-duplicated, engine + domain signals merged. */
function mergeWarnings(engineWarnings: string[], domainWarnings: string[]): string[] {
  const merged: string[] = [];
  for (const warning of [...engineWarnings, ...domainWarnings]) {
    if (!merged.includes(warning)) merged.push(warning);
    if (merged.length >= 16) break;
  }
  return merged;
}

export function toRecognitionDto(row: OcrRecognitionRow): OcrRecognition {
  const asset: OcrAsset = {
    id: row.asset.id,
    mime: row.asset.mime as OcrAsset["mime"],
    sizeBytes: row.asset.sizeBytes,
    width: row.asset.width,
    height: row.asset.height,
    checksumSha256: row.asset.checksumSha256,
    createdAt: row.asset.createdAt.toISOString(),
    purged: row.screenshotPurgedAt !== null,
  };
  const classification = (row.result?.classification ?? null) as OcrClassification | null;
  const fields = (row.result?.fields ?? []) as OcrExtractedField[];
  const duplicateOf = (row.result?.duplicateOf ?? null) as OcrRecognition["duplicateOf"];
  const possibleTradeDuplicate = (row.result?.possibleTradeDuplicate ??
    null) as OcrRecognition["possibleTradeDuplicate"];
  // V2 §16/§15/§23 — issues, quality and timeline are DERIVED from the
  // stored evidence at read time (pure functions — confirmed rows never
  // mutate, §33, and improved logic explains old rows retroactively).
  const issues = deriveRecognitionIssues({
    fields,
    classification,
    duplicateOf,
    possibleTradeDuplicate,
    symbolInCatalog: row.result?.symbolInCatalog === true,
  });
  const qualityScore = computeQualityScore({ fields, classification, duplicateOf });
  const timeline = buildRecognitionTimeline({
    fields,
    uploadedAt: asset.createdAt,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
  });
  return {
    id: row.id,
    status: row.status as OcrRecognition["status"],
    extractionProfile: row.extractionProfile as OcrRecognition["extractionProfile"],
    classification,
    fields,
    warnings: row.result?.warnings ?? [],
    asset,
    engine: row.result?.engine ?? null,
    durationMs: row.result?.durationMs ?? null,
    failure:
      row.failureCategory !== null
        ? {
            category: row.failureCategory as OcrRecognition["failure"] extends null
              ? never
              : NonNullable<OcrRecognition["failure"]>["category"],
            message: row.failureMessage ?? "",
          }
        : null,
    corrections: row.corrections ?? null,
    /** Canonical Trade from the Phase 21 bridge — null when unlinked. */
    tradeId: row.tradeId,
    /** Every Trade imported from this recognition (grouped confirmation). */
    tradeIds: row.tradeIds,
    /** Multi-trade drafts — null for the mono-trade path. */
    candidates: (row.result?.candidates ?? null) as OcrRecognition["candidates"],
    /** Advisory duplicate flag (engine quality §2.1) — stored in the result. */
    duplicateOf,
    accountId: row.accountId,
    suggestedTags: row.result?.suggestedTags ?? [],
    issues,
    qualityScore,
    timeline,
    possibleTradeDuplicate,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sameBatches(
  a: { corrections: Record<string, string | null>; include: boolean }[] | null,
  b: { corrections: Record<string, string | null>; include: boolean }[],
): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (batch, index) =>
      batch.include === b[index]!.include &&
      sameCorrections(batch.corrections, b[index]!.corrections),
  );
}

function sameCorrections(
  a: Record<string, string | null> | null,
  b: Record<string, string | null>,
): boolean {
  if (a === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

function mimeExtension(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

/**
 * Stored form of the user's corrections (§21): each value is validated
 * through the SAME validators as machine values and kept in its validated
 * declaration form (see validateCorrectionStored); raw input is never
 * stored unvalidated.
 */
export function canonicalizeCorrections(corrections: OcrCorrectionRecord): Record<string, string | null> {
  const canonical: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(corrections)) {
    try {
      canonical[key] = validateCorrectionStored(key as OcrFieldKey, value);
    } catch (error) {
      if (error instanceof CorrectionError) {
        const detail = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new BusinessRuleError(
          `Invalid correction value (${detail}).`,
          "OCR_CORRECTION_INVALID",
        );
      }
      throw error;
    }
  }
  return canonical;
}

/** Domain validation of user corrections — mapped to a 422 business error. */
export function applyCorrectionsSafe(
  machineFields: OcrExtractedField[],
  corrections: OcrCorrectionRecord,
): { fields: OcrExtractedField[]; correctionCount: number } {
  try {
    return applyCorrections(machineFields, corrections);
  } catch (error) {
    if (error instanceof CorrectionError) {
      const detail = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new BusinessRuleError(
        `Invalid correction value (${detail}).`,
        "OCR_CORRECTION_INVALID",
      );
    }
    throw error;
  }
}
