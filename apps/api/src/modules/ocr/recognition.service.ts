/**
 * Recognition application service (OCR backend V1) — the orchestration brain
 * for the frontend-derived /recognition surface.
 *
 * Pipeline (§10): upload → validation → storage → job rows → engine call →
 * strict contract validation → domain validation → persistence → review →
 * draft → confirmation → Trading Core. Request-scoped (no external queue in
 * this build — the Accounts sync-run house pattern): a job completes, fails
 * or becomes reviewable by the time the HTTP answer is written.
 *
 * Reuse over reinvention (§132): image validation, the storage port, the
 * engine port (FastAPI sidecar / deterministic dev engine / explicit
 * unavailable), rate limiting and the audit ledger are the Phase-19
 * components — nothing here duplicates them. The canonical Trade is created
 * ONLY through TradesService.importTradeFromRecognition (§77/§78).
 *
 * Non-negotiables enforced here:
 *   - the engine result is UNTRUSTED: zod-parsed (§54) then re-validated by
 *     the domain before persistence;
 *   - idempotency (§32/§68): a concurrent double job-POST for the same
 *     screenshot loses the (userId, idempotencyKey) unique race and is
 *     mapped back to the winning job — no accidental duplicate processing;
 *   - bounded retries (§69): only TRANSIENT engine failures retry, inside
 *     the engine-call loop — invalid images and deterministic parser errors
 *     never retry;
 *   - cancellation (§71): guarded repository transitions make a CANCELLED
 *     job unable to accept a late engine result, a draft, or an import;
 *   - human-in-the-loop (§6/§75): ONLY the explicit confirm endpoint
 *     creates a Trade, and only from the validated stored draft;
 *   - every step is owner-scoped (§34/§35) and audited (§83) through the
 *     shared SecurityEventService port — never the screenshot bytes, never
 *     secrets (§84).
 */
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from "../../shared/errors/app-error";
import type {
  OcrExtractedField,
  OcrValidationStatus,
  RecognitionCollection,
  RecognitionCollectionDetail,
  RecognitionGroup,
  RecognitionGroupMember,
  RecognitionGroupSummary,
  RecognitionHistoryItem,
  RecognitionJob,
  RecognitionJobListQuery,
  RecognitionResult,
  RecognitionScreenshot,
  TradeDraft,
} from "../../shared/contracts";
import { validateDraftCoherence } from "../../shared/contracts";
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
  applyDomainValidation,
  confidenceBand,
  correctionDiff,
  deriveJobIdempotencyKey,
  findPerceptualMatch,
  mergeRecropFields,
  rankSuggestions,
  CORRECTION_TRACKED_KEYS,
  type RecropMergeableField,
} from "./ocr.logic";
import { fuseMembers, type FusionMemberInput } from "./fusion.logic";
import { computeQuality } from "./quality.logic";
import { OcrRateLimiterService } from "./ocr-rate-limiter.service";
import {
  OcrRepository,
  type OcrAssetRow,
  type OcrGroupRow,
  type OcrRecognitionRow,
  type OcrResultPayload,
  type TradeDraftRecord,
} from "./ocr.repository";
import {
  toHistoryItem,
  mapWireStage,
  mapWireStatus,
  toRecognitionJobDto,
  toRecognitionResult,
  classificationToDetectedPlatform,
} from "./recognition.mapper";
import { TradesService } from "../trades/trades.service";
import { SecurityEventService } from "../security/security-event.service";

/** Pipeline version recorded on every row (§95 — results stay interpretable). */
export const OCR_PIPELINE_VERSION = "2026.10.05";

/** V2 — event types (stable tokens, shared recognitionAnalyticsEventTypeSchema). */
export const OCR_EVENT_TYPES = {
  uploadStarted: "recognition_upload_started",
  uploadCompleted: "recognition_upload_completed",
  duplicateWarned: "recognition_duplicate_warned",
  duplicateProcessed: "recognition_duplicate_processed",
  recognitionStarted: "recognition_started",
  recognitionCompleted: "recognition_completed",
  recognitionFailed: "recognition_failed",
  recognitionCancelled: "recognition_cancelled",
  reviewStarted: "recognition_review_started",
  fieldCorrected: "recognition_field_corrected",
  recropped: "recognition_recropped",
  importConfirmed: "recognition_import_confirmed",
  importCancelled: "recognition_import_cancelled",
  // ── V3 (spec §53 + groups/collections/reprocess) ────────────────
  groupCreated: "recognition_group_created",
  groupConfirmed: "recognition_group_confirmed",
  groupDiscarded: "recognition_group_discarded",
  reprocessed: "recognition_reprocessed",
  collectionCreated: "recognition_collection_created",
  collectionDeleted: "recognition_collection_deleted",
  collectionAssetAdded: "recognition_collection_asset_added",
  collectionAssetRemoved: "recognition_collection_asset_removed",
} as const;

/** V2 — duplicate-candidate pool size (recent uploads examined per upload). */
const DUPLICATE_CANDIDATE_POOL = 200;

export const RECOGNITION_ERROR_CODES = {
  RATE_LIMITED_UPLOAD: "RECOGNITION_UPLOAD_RATE_LIMITED",
  RATE_LIMITED_CONFIRM: "RECOGNITION_CONFIRM_RATE_LIMITED",
  NOT_FOUND: "RECOGNITION_NOT_FOUND",
  ALREADY_CONFIRMED: "RECOGNITION_ALREADY_CONFIRMED",
  NOT_REVIEWABLE: "RECOGNITION_NOT_REVIEWABLE",
  DRAFT_REQUIRED: "RECOGNITION_DRAFT_REQUIRED",
  DRAFT_INVALID: "RECOGNITION_DRAFT_INVALID",
  NOT_CANCELLABLE: "RECOGNITION_NOT_CANCELLABLE",
  NOT_RETRYABLE: "RECOGNITION_NOT_RETRYABLE",
  IMPORT_CONFLICT: "RECOGNITION_IMPORT_CONFLICT",
  // ── V3 ─────────────────────────────────────────────────────────
  GROUP_NOT_FOUND: "RECOGNITION_GROUP_NOT_FOUND",
  GROUP_INVALID: "RECOGNITION_GROUP_INVALID",
  GROUP_NOT_FUSABLE: "RECOGNITION_GROUP_NOT_FUSABLE",
  GROUP_ALREADY_CONFIRMED: "RECOGNITION_GROUP_ALREADY_CONFIRMED",
  COLLECTION_NOT_FOUND: "RECOGNITION_COLLECTION_NOT_FOUND",
  ASSET_NOT_FOUND: "RECOGNITION_ASSET_NOT_FOUND",
  NOT_REPROCESSABLE: "RECOGNITION_NOT_REPROCESSABLE",
} as const;

/** Upper bound for the history wire (the client renders the latest activity). */
const HISTORY_LIMIT = 100;

@Injectable()
export class RecognitionService {
  constructor(
    private readonly repository: OcrRepository,
    private readonly imageValidation: ImageValidationService,
    @Inject(SCREENSHOT_STORAGE) private readonly storage: ScreenshotStorage,
    @Inject(OCR_ENGINE) private readonly engine: OcrEngine,
    private readonly limiter: OcrRateLimiterService,
    private readonly securityEvents: SecurityEventService,
    private readonly trades: TradesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Upload (§36/§37/§38 — bytes validated server-side, always) ────────────

  async uploadScreenshot(input: {
    userId: string;
    fileDataUrl: string;
    name: string;
    requestId: string | null;
  }): Promise<{
    screenshot: RecognitionScreenshot;
    duplicate?: {
      perceptualHash: string;
      hammingDistance: number;
      matchedAssetId: string;
      matchedUploadName: string;
      matchedUploadAt: string;
      latestJobId: string | null;
      importedTradeIds: string[];
    } | null;
  }> {
    await this.repository.recordEvent({ userId: input.userId, type: OCR_EVENT_TYPES.uploadStarted });

    const check = this.limiter.check("upload", input.userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many screenshot uploads. Please wait before trying again.",
        RECOGNITION_ERROR_CODES.RATE_LIMITED_UPLOAD,
        check.retryAfterSeconds,
      );
    }

    // Independent boundary validation (§38): magic bytes beat the declared
    // type, size and pixel ceilings are enforced before any decode. V2 —
    // the PDF statement branch shares the discipline with its own budget.
    const isPdfEnvelope = input.fileDataUrl.startsWith("data:application/pdf;");
    const image = isPdfEnvelope
      ? this.imageValidation.validateDocumentDataUrl(input.fileDataUrl, {
          maxBytes: this.config.ocr.pdfMaxBytes,
        })
      : this.imageValidation.validateDataUrl(input.fileDataUrl, {
          maxBytes: this.config.ocr.uploadMaxBytes,
          maxPixels: this.config.ocr.imageMaxPixels,
        });
    this.limiter.hit("upload", input.userId);

    // Same bytes = same stored asset (dedup by checksum, §32) — the display
    // name of the FIRST upload persists; filenames never touch paths (§85).
    const perceptualHash = await this.computePerceptualHash(image);
    const asset = await this.ensureAsset(input.userId, image, input.name, perceptualHash);

    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_UPLOAD",
      actor: input.userId,
      context: `${isPdfEnvelope ? "document" : "screenshot"} uploaded (${image.mime}, ${image.sizeBytes} B)`,
      outcome: "SUCCESS",
    });
    await this.repository.recordEvent({
      userId: input.userId,
      type: OCR_EVENT_TYPES.uploadCompleted,
      metadata: { bytes: image.sizeBytes, mime: image.mime },
    });

    // V2 — perceptual duplicate verdict (a WARNING, never a block): when a
    // visually similar upload already exists the client can jump to the
    // previous import or continue anyway. Unavailable hash → no verdict.
    let duplicate: {
      perceptualHash: string;
      hammingDistance: number;
      matchedAssetId: string;
      matchedUploadName: string;
      matchedUploadAt: string;
      latestJobId: string | null;
      importedTradeIds: string[];
    } | null = null;
    if (perceptualHash !== null) {
      const candidates = await this.repository.listRecentHashedAssets(input.userId, DUPLICATE_CANDIDATE_POOL);
      const match = findPerceptualMatch(
        perceptualHash,
        candidates.filter((candidate) => candidate.assetId !== asset.id),
      );
      if (match !== null) {
        const latestJob = await this.repository.findLatestRecognitionForAsset(match.assetId);
        const importedTradeIds = await this.repository.listImportedTradeIdsForAsset(input.userId, match.assetId);
        duplicate = {
          perceptualHash: match.perceptualHash,
          hammingDistance: match.hammingDistance,
          matchedAssetId: match.assetId,
          matchedUploadName: latestJob?.asset.originalName ?? "(previous upload)",
          matchedUploadAt: (latestJob?.asset.createdAt ?? new Date()).toISOString(),
          latestJobId: latestJob?.id ?? null,
          importedTradeIds,
        };
        await this.repository.recordEvent({
          userId: input.userId,
          type: OCR_EVENT_TYPES.duplicateWarned,
          recognitionId: latestJob?.id ?? null,
          metadata: { hammingDistance: match.hammingDistance },
        });
        // V3 — the duplicate warning is a persistent ASSET facet (spec §62
        // `duplicate` history filter): recorded once, surfaced on every job.
        await this.repository.markAssetDuplicateWarned(asset.id);
      }
    }

    return {
      screenshot: {
        id: asset.id,
        name: asset.originalName,
        sizeBytes: asset.sizeBytes,
        mimeType: asset.mime as RecognitionScreenshot["mimeType"],
        width: asset.width,
        height: asset.height,
        uploadedAt: asset.createdAt.toISOString(),
      },
      ...(duplicate !== null ? { duplicate } : {}),
    };
  }

  /**
   * V2 — perceptual anchor via the sidecar's dHash (single source of truth
   * for the algorithm). BEST-EFFORT: an unavailable sidecar only means no
   * duplicate verdict — the upload itself is never blocked by it.
   */
  private async computePerceptualHash(image: { bytes: Buffer; mime: string }): Promise<string | null> {
    try {
      const { serviceUrl, serviceToken } = this.config.ocr;
      if (!serviceUrl || !serviceToken) return null;
      const response = await fetch(`${serviceUrl.replace(/\/+$/, "")}/v1/phash`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-token": serviceToken },
        body: JSON.stringify({ fileBase64: image.bytes.toString("base64"), mime: image.mime }),
        signal: AbortSignal.timeout(Math.min(5_000, this.config.ocr.engineTimeoutMs)),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { perceptualHash?: unknown };
      const hash = typeof body.perceptualHash === "string" ? body.perceptualHash : null;
      return hash !== null && /^[0-9a-f]{16}$/.test(hash) ? hash : null;
    } catch {
      return null;
    }
  }

  /** Store the binary + metadata row when the media has never been stored. */
  private async ensureAsset(
    userId: string,
    image: {
      bytes: Buffer;
      mime: string;
      sizeBytes: number;
      width: number | null;
      height: number | null;
      checksumSha256: string;
    },
    displayName: string,
    perceptualHash: string | null = null,
  ) {
    const existing = await this.repository.findAssetByChecksum(userId, image.checksumSha256);
    if (existing) {
      // Backfill the anchor for assets stored before V2 / without sidecar.
      if (existing.perceptualHash === null && perceptualHash !== null) {
        await this.repository.updateAssetPerceptualHash(existing.id, perceptualHash).catch(() => undefined);
      }
      return existing;
    }
    const storageKey = await this.storage.put({
      userId,
      checksumSha256: image.checksumSha256,
      mime: image.mime,
      bytes: image.bytes,
    });
    const created = await this.repository
      .createAsset(userId, {
        storageKey,
        originalName: sanitizeDisplayName(displayName, image.mime),
        mime: image.mime,
        sizeBytes: image.sizeBytes,
        width: image.width,
        height: image.height,
        checksumSha256: image.checksumSha256,
        perceptualHash,
      })
      .catch(async (error) => {
        // Lost the (userId, checksum) race (§51): the winning asset row is
        // the shared one — this file copy becomes an orphan and is removed
        // best-effort.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const winner = await this.repository.findAssetByChecksum(userId, image.checksumSha256);
          if (winner) {
            void this.storage.delete(storageKey);
            return winner;
          }
        }
        throw error;
      });
    return created;
  }

  // ── Job creation + request-scoped processing (§66/§67) ────────────────────

  async createJob(input: {
    userId: string;
    screenshotId: string;
    platform: string;
    mode: string;
    requestId: string | null;
  }): Promise<{ job: RecognitionJob }> {
    const check = this.limiter.check("upload", input.userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many recognition jobs. Please wait before trying again.",
        RECOGNITION_ERROR_CODES.RATE_LIMITED_UPLOAD,
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("upload", input.userId);

    // Ownership boundary (§34): the screenshot must belong to the caller.
    const asset = await this.repository.findAssetByIdForUser(input.screenshotId, input.userId);
    if (asset === null) {
      throw new NotFoundError("Screenshot not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }

    // §68 idempotency — the FIRST job of an image owns the base key
    // (jobIndex 0): a concurrent OR sequential duplicate POST derives the
    // same key and is mapped back to the winning job — accidental duplicate
    // processing is impossible. Explicit retries use the count-based key
    // (see retryJob) which is deliberately fresh.
    const baseKey = deriveJobIdempotencyKey({
      userId: input.userId,
      checksumSha256: asset.checksumSha256,
      profile: OCR_EXTRACTION_PROFILE,
      pipelineVersion: OCR_PIPELINE_VERSION,
      mode: input.mode,
      jobIndex: 0,
    });
    const existing = await this.repository.findRecognitionByIdempotencyKey(input.userId, baseKey);
    if (existing) {
      // Replay: an in-flight or finished job is returned as-is — the client
      // cannot accidentally process the same screenshot twice (§68/§32).
      return { job: toRecognitionJobDto(existing) };
    }
    const jobCount = await this.repository.countRecognitionsForAsset(input.userId, asset.id);
    const idempotencyKey = jobCount === 0
      ? baseKey
      : deriveJobIdempotencyKey({
          userId: input.userId,
          checksumSha256: asset.checksumSha256,
          profile: OCR_EXTRACTION_PROFILE,
          pipelineVersion: OCR_PIPELINE_VERSION,
          mode: input.mode,
          jobIndex: jobCount,
        });

    const row = await this.repository
      .createRecognition(asset, {
        status: "QUEUED",
        extractionProfile: OCR_EXTRACTION_PROFILE,
        pipelineVersion: OCR_PIPELINE_VERSION,
        idempotencyKey,
        requestId: input.requestId,
        requestedPlatform: input.platform,
        mode: input.mode,
      })
      .catch(async (error) => {
        // Lost the (userId, idempotencyKey) race (§51) — re-read the winner.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const winner = await this.repository.findRecognitionByIdempotencyKey(input.userId, idempotencyKey);
          if (winner) return winner;
        }
        throw error;
      });

    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_JOB_CREATED",
      actor: input.userId,
      context: `recognition job created (${input.platform}, ${input.mode})`,
      outcome: "SUCCESS",
    });
    await this.repository.recordEvent({
      userId: input.userId,
      type: OCR_EVENT_TYPES.recognitionStarted,
      recognitionId: row.id,
      metadata: { platform: input.platform, mode: input.mode },
    });

    if (asset.mime === "application/pdf") {
      await this.processDocumentRow(input.userId, row, asset);
    } else {
      await this.processRow(input.userId, row, asset);
    }
    const processed = await this.repository.findForUser(row.id, input.userId);
    if (processed === null) {
      throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return { job: toRecognitionJobDto(processed) };
  }

  /** Engine call with bounded retries on TRANSIENT failures only (§69). */
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

  /** QUEUED → (REVIEW_REQUIRED | FAILED) for one job row. */
  private async processRow(userId: string, row: OcrRecognitionRow, asset: {
    id: string;
    storageKey: string;
    mime: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    checksumSha256: string;
  }): Promise<void> {
    await this.repository.markProcessing(row.id, row.requestId);
    const attemptsUsed = { count: 1 };
    try {
      const bytes = await this.storage.get(asset.storageKey);
      if (bytes === null) {
        // Storage/metadata divergence is an infrastructure fault — an
        // explicit FAILED state (§35), never a fake reviewable result.
        await this.failRow(userId, row, "EXTRACTION_FAILED", "stored screenshot is unreadable", attemptsUsed.count);
        return;
      }

      const response = await this.callEngine({
        requestId: row.id,
        contractVersion: "1",
        imageBase64: bytes.toString("base64"),
        metadata: {
          mime: asset.mime,
          sizeBytes: asset.sizeBytes,
          // Image jobs only — documents take the dedicated pipeline above.
          width: asset.width as number,
          height: asset.height as number,
          checksumSha256: asset.checksumSha256,
        },
        extractionProfile: OCR_EXTRACTION_PROFILE,
        deadlineMs: this.config.ocr.engineTimeoutMs,
      });
      attemptsUsed.count = 1 + this.config.ocr.engineMaxRetries;

      if (response.processingStatus === "UNPROCESSABLE") {
        const category = response.failure?.category ?? "SCREENSHOT_UNSUPPORTED";
        await this.failRow(
          userId,
          row,
          category,
          response.failure?.message ?? "the recognition service could not process this screenshot",
          attemptsUsed.count,
        );
        return;
      }

      await this.persistEngineResult(userId, row, response);
    } catch (error) {
      if (error instanceof EngineUnprocessableError) {
        await this.failRow(userId, row, error.category, error.message, attemptsUsed.count);
        return;
      }
      if (error instanceof EngineMalformedResponseError) {
        await this.failRow(userId, row, "EXTRACTION_FAILED", "the engine returned an invalid result payload", attemptsUsed.count);
        return;
      }
      if (error instanceof EngineTransientError) {
        const timeout = /timeout|abort/i.test(error.message);
        await this.failRow(
          userId,
          row,
          timeout ? "PROCESSING_TIMEOUT" : "OCR_UNAVAILABLE",
          timeout ? "the recognition did not finish in time" : "the recognition service is currently unavailable",
          attemptsUsed.count,
        );
        return;
      }
      // Unknown failures never leak internals (§91) — stable category,
      // diagnostics in the logs only.
      await this.failRow(userId, row, "ENGINE_ERROR", "the recognition pipeline failed unexpectedly", attemptsUsed.count);
    }
  }

  /** Persist the FAILED state + audit event (never throws). */
  private async failRow(
    userId: string,
    row: OcrRecognitionRow,
    category: string,
    message: string,
    attempts: number,
  ): Promise<void> {
    await this.repository.persistFailure(row.id, { category, message, attempt: attempts });
    await this.securityEvents.record({
      userId,
      type: "OCR_PROCESSING_FAILED",
      actor: userId,
      context: `recognition failed (${category})`,
      outcome: "FAILURE",
    });
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.recognitionFailed,
      recognitionId: row.id,
      metadata: { category },
    });
  }

  /**
   * Engine output → contract fields → domain re-validation (§54/§19), then
   * the guarded persist. Shared by the image pipeline AND the crop re-read
   * (with the payload pre-built by the caller).
   */
  private async persistEngineResult(
    userId: string,
    row: OcrRecognitionRow,
    response: EngineResponse,
  ): Promise<void> {
    const fields = applyDomainValidation(response.fields.map(mapEngineField));
    // V2 — grouped trades, when the engine supplied them (row clustering).
    const trades = response.trades?.map((trade) => ({
      pageIndex: trade.pageIndex,
      fields: applyDomainValidation(trade.fields.map(mapEngineField)),
    }));
    const result: OcrResultPayload = {
      classification: response.classification,
      fields,
      ...(trades !== undefined && trades.length > 0 ? { trades } : {}),
      ...(response.perceptualHash ? { perceptualHash: response.perceptualHash } : {}),
      warnings: mergeWarnings(
        response.warnings,
        fields.flatMap((f) => f.warnings.filter((w) => w === "TIMEZONE_UNKNOWN")),
      ),
      engine: {
        name: response.processingMetadata.engine,
        engineVersion: response.processingMetadata.engineVersion,
        pipelineVersion: response.processingMetadata.pipelineVersion,
        contractVersion: response.contractVersion,
      },
      durationMs: response.processingMetadata.durationsMs["total"] ?? null,
    };
    // Guarded persist: a CANCELLED row (status no longer PROCESSING)
    // silently rejects the late result — §71 is enforced by the transition
    // guard, not by timing luck.
    const persisted = await this.repository.persistResult(row.id, result);
    if (persisted !== null) {
      // V3 — deterministic quality score (spec §28) computed from the SAME
      // wire surface the review screen renders; persisted for the history
      // facets. Best-effort: a scoring failure never fails the recognition.
      try {
        const wireResult = toRecognitionResult(persisted);
        if (wireResult !== null) {
          const quality = computeQuality({
            trades: wireResult.trades,
            overallConfidence: wireResult.overallConfidence,
          });
          await this.repository.updateQuality(row.id, quality);
        }
      } catch {
        // Quality is additive evidence — never a pipeline failure.
      }
      await this.repository.recordEvent({
        userId,
        type: OCR_EVENT_TYPES.recognitionCompleted,
        recognitionId: row.id,
        metadata: {
          trades: trades?.length ?? 1,
          durationMs: result.durationMs,
        },
      });
    }
  }

  /**
   * V2 — PDF statement pipeline: the sidecar renders every page and runs
   * the full extraction per page; the response pages merge into ONE result
   * payload whose trades carry their pageIndex (multi-trade flow then owns
   * the review). An engine without document support fails the job honestly
   * (SCREENSHOT_UNSUPPORTED), never a fabricated partial read.
   */
  private async processDocumentRow(
    userId: string,
    row: OcrRecognitionRow,
    asset: {
      id: string;
      storageKey: string;
      mime: string;
      sizeBytes: number;
      width: number | null;
      height: number | null;
      checksumSha256: string;
    },
  ): Promise<void> {
    await this.repository.markProcessing(row.id, row.requestId);
    const attemptsUsed = { count: 1 };
    try {
      if (!this.engine.supportsDocuments || this.engine.recognizeDocument === undefined) {
        await this.failRow(
          userId,
          row,
          "SCREENSHOT_UNSUPPORTED",
          "document recognition is not available with the configured engine",
          attemptsUsed.count,
        );
        return;
      }
      const bytes = await this.storage.get(asset.storageKey);
      if (bytes === null) {
        await this.failRow(userId, row, "EXTRACTION_FAILED", "stored document is unreadable", attemptsUsed.count);
        return;
      }

      const response = await this.engine.recognizeDocument({
        requestId: row.id,
        contractVersion: "1",
        documentBase64: bytes.toString("base64"),
        metadata: {
          mime: asset.mime,
          sizeBytes: asset.sizeBytes,
          checksumSha256: asset.checksumSha256,
        },
        extractionProfile: OCR_EXTRACTION_PROFILE,
        deadlineMs: Math.max(this.config.ocr.engineTimeoutMs, 60_000),
      });
      attemptsUsed.count = 1 + this.config.ocr.engineMaxRetries;

      if (response.processingStatus !== "COMPLETED") {
        const category = response.failure?.category ?? "SCREENSHOT_UNSUPPORTED";
        await this.failRow(
          userId,
          row,
          category,
          response.failure?.message ?? "the recognition service could not process this document",
          attemptsUsed.count,
        );
        return;
      }

      // Merge every page's trades into one payload (continuous trade order,
      // page provenance preserved); the flat fields mirror trade #1.
      const mergedTrades = response.pages.flatMap((page) =>
        page.trades.map((trade) => ({
          pageIndex: page.pageIndex,
          fields: trade.fields,
        })),
      );
      const primaryFields = mergedTrades[0]?.fields ?? [];
      const classification = response.pages.find((page) => page.classification !== null)?.classification ?? null;
      const engineResponse: EngineResponse = {
        requestId: response.requestId,
        contractVersion: response.contractVersion,
        processingStatus: response.processingStatus,
        tradeCandidates: [],
        classification,
        fields: primaryFields,
        trades: mergedTrades,
        perceptualHash: response.perceptualHash ?? null,
        warnings: response.pages.flatMap((page) => page.warnings).slice(0, 16),
        processingMetadata: response.processingMetadata,
        failure: null,
      };
      const pageCount = response.pages.length;
      if (pageCount > 0) {
        await this.repository.updateAssetPageCount(asset.id, pageCount);
      }
      await this.persistEngineResult(userId, row, engineResponse);
    } catch (error) {
      if (error instanceof EngineUnprocessableError) {
        await this.failRow(userId, row, error.category, error.message, attemptsUsed.count);
        return;
      }
      if (error instanceof EngineMalformedResponseError) {
        await this.failRow(userId, row, "EXTRACTION_FAILED", "the engine returned an invalid document payload", attemptsUsed.count);
        return;
      }
      if (error instanceof EngineTransientError) {
        const timeout = /timeout|abort/i.test(error.message);
        await this.failRow(
          userId,
          row,
          timeout ? "PROCESSING_TIMEOUT" : "OCR_UNAVAILABLE",
          timeout ? "the document recognition did not finish in time" : "the recognition service is currently unavailable",
          attemptsUsed.count,
        );
        return;
      }
      await this.failRow(userId, row, "ENGINE_ERROR", "the document pipeline failed unexpectedly", attemptsUsed.count);
    }
  }

  // ── Read paths (§34/§35 — owner-scoped on every operation) ────────────────

  private async requireRow(userId: string, id: string): Promise<OcrRecognitionRow> {
    const row = await this.repository.findForUser(id, userId);
    if (row === null) {
      throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return row;
  }

  async listJobs(
    userId: string,
    query?: RecognitionJobListQuery,
  ): Promise<{ jobs: RecognitionHistoryItem[] }> {
    // V3 history filters (spec §62). DB-level facets narrow the page;
    // corrected/confidence facets are evaluated over the loaded page (the
    // wire history is bounded to 100 rows by design — honest and cheap).
    if (
      query === undefined ||
      (query.status === undefined &&
        query.platform === undefined &&
        query.mimeType === undefined &&
        query.corrected === undefined &&
        query.duplicate === undefined &&
        query.minConfidence === undefined &&
        query.from === undefined &&
        query.to === undefined)
    ) {
      const rows = await this.repository.listLatestForUser(userId, HISTORY_LIMIT);
      return { jobs: rows.map(toHistoryItem) };
    }
    const wireStatusToRow: Record<string, string[]> = {
      PENDING: ["QUEUED"],
      PROCESSING: ["PROCESSING"],
      COMPLETED: ["REVIEW_REQUIRED", "CONFIRMED"],
      FAILED: ["FAILED"],
      CANCELLED: ["CANCELLED"],
    };
    const from = query.from !== undefined ? new Date(`${query.from}T00:00:00.000Z`) : null;
    const to = query.to !== undefined ? new Date(`${query.to}T23:59:59.999Z`) : null;
    const rows = await this.repository.listLatestForUserFiltered(userId, {
      limit: HISTORY_LIMIT,
      status: query.status !== undefined ? (wireStatusToRow[query.status] ?? null) : null,
      platform: query.platform ?? null,
      mimeType: query.mimeType ?? null,
      duplicate: query.duplicate !== undefined ? query.duplicate === "true" : null,
      from: from !== null && !Number.isNaN(from.getTime()) ? from : null,
      to: to !== null && !Number.isNaN(to.getTime()) ? to : null,
    });
    let items = rows.map(toHistoryItem);
    if (query.corrected !== undefined) {
      const want = query.corrected === "true";
      items = items.filter((item) => ((item.correctedCount ?? 0) > 0) === want);
    }
    if (query.minConfidence !== undefined) {
      items = items.filter(
        (item) => item.overallConfidence !== null && item.overallConfidence >= query.minConfidence!,
      );
    }
    return { jobs: items };
  }

  async getJob(userId: string, id: string): Promise<{ job: RecognitionJob }> {
    const row = await this.requireRow(userId, id);
    return { job: toRecognitionJobDto(row) };
  }

  async getResult(userId: string, id: string): Promise<{ result: RecognitionResult }> {
    const row = await this.requireRow(userId, id);
    const result = toRecognitionResult(row);
    if (result === null) {
      throw new NotFoundError("No recognition result is available for this job.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return { result };
  }

  async getDraft(userId: string, id: string): Promise<{ draft: TradeDraft } | null> {
    const row = await this.requireRow(userId, id);
    if (row.draft === null) return null;
    return {
      draft: {
        ...row.draft,
        platform: row.draft.platform as TradeDraft["platform"],
        jobId: row.id,
        updatedAt: (row.draftUpdatedAt ?? row.updatedAt).toISOString(),
      },
    };
  }

  /** V2 — every draft slot of the job (one per detected trade). */
  async getDrafts(userId: string, id: string): Promise<{ drafts: Array<{ tradeIndex: number; draft: (TradeDraft & { tradeIndex: number }) | null }> }> {
    const row = await this.requireRow(userId, id);
    const result = toRecognitionResult(row);
    const detected = result?.trades.length ?? 0;
    const slots: Array<{ tradeIndex: number; draft: (TradeDraft & { tradeIndex: number }) | null }> = [];
    for (let tradeIndex = 1; tradeIndex <= Math.max(detected, 1); tradeIndex += 1) {
      const stored = row.drafts !== null ? row.drafts[String(tradeIndex)] ?? null : tradeIndex === 1 ? row.draft : null;
      slots.push({
        tradeIndex,
        draft:
          stored === null
            ? null
            : {
                ...stored,
                platform: stored.platform as TradeDraft["platform"],
                jobId: row.id,
                updatedAt: (row.draftUpdatedAt ?? row.updatedAt).toISOString(),
                tradeIndex,
              },
      });
    }
    return { drafts: slots };
  }

  async getScreenshotBytes(userId: string, id: string): Promise<{ bytes: Buffer; mime: string }> {
    const row = await this.requireRow(userId, id);
    const bytes = await this.storage.get(row.asset.storageKey);
    if (bytes === null) {
      throw new NotFoundError("Stored screenshot is missing.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return { bytes, mime: row.asset.mime };
  }

  // ── Draft (§72/§74 — re-validated server-side, never trusted) ─────────────

  async saveDraft(userId: string, id: string, draftInput: TradeDraftRecord): Promise<{ draft: TradeDraft }> {
    const saved = await this.saveDraftAtIndex(userId, id, draftInput, 1);
    return { draft: saved.draft };
  }

  /**
   * V2 — validated draft per trade index. Beyond the V1 validations, the
   * save feeds the CORRECTIONS MEMORY: every tracked field where the user's
   * value differs from the machine read becomes a correction observation
   * (the draft itself stays the only authoritative declaration — the memory
   * only powers future suggestions, §21).
   */
  async saveDraftAtIndex(
    userId: string,
    id: string,
    draftInput: TradeDraftRecord,
    tradeIndex: number,
  ): Promise<{ draft: TradeDraft & { tradeIndex: number } }> {
    const row = await this.requireRow(userId, id);
    if (row.status !== "REVIEW_REQUIRED" && row.status !== "CONFIRMED") {
      throw new ConflictError(
        "A draft can only be saved for a processed recognition.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }

    // Server-side coherence re-validation (§56): violations are REJECTED,
    // never silently corrected. A 422 business rule — the shape was fine,
    // the VALUES are incoherent.
    const issues = validateDraftCoherence(draftInput);
    if (issues.length > 0) {
      throw new BusinessRuleError(
        `Invalid trade draft: ${issues.map((issue) => `${issue.field} — ${issue.message}`).join("; ")}`,
        RECOGNITION_ERROR_CODES.DRAFT_INVALID,
      );
    }

    const updated = await this.repository.saveDraftAtIndex(row.id, tradeIndex, draftInput);
    if (updated === null) {
      throw new ConflictError(
        "This recognition no longer accepts drafts.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }

    // First draft save of this job → review started (funnel event).
    const hadAnyDraft = updated.draft !== null || (updated.drafts !== null && Object.keys(updated.drafts).length > 0);
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.reviewStarted,
      recognitionId: row.id,
      metadata: { tradeIndex },
    });
    void hadAnyDraft;

    // Corrections memory — machine read vs the user's declaration.
    const result = toRecognitionResult(updated);
    const tradeFields = result?.trades.find((trade) => trade.index === tradeIndex)?.fields ?? null;
    if (tradeFields !== null) {
      const observations = correctionDiff(tradeFields, draftInput as unknown as Record<string, string | null>);
      const detectedPlatform = result?.detectedPlatform ?? "OTHER";
      for (const observation of observations) {
        if (observation.correctedValue === null) continue;
        await this.repository.recordCorrection({
          userId,
          field: observation.field,
          platform: detectedPlatform,
          rawValue: observation.rawValue,
          correctedValue: observation.correctedValue,
          lastRecognitionId: row.id,
        });
      }
      const firstObservation = observations[0];
      if (firstObservation !== undefined) {
        await this.repository.recordEvent({
          userId,
          type: OCR_EVENT_TYPES.fieldCorrected,
          recognitionId: row.id,
          metadata: { field: firstObservation.field, count: observations.length, tradeIndex },
        });
      }
    }

    await this.securityEvents.record({
      userId,
      type: "TRADE_DRAFT_SAVED",
      actor: userId,
      context: `trade draft saved for recognition ${row.id} (trade ${tradeIndex})`,
      outcome: "SUCCESS",
    });

    return {
      draft: {
        ...draftInput,
        platform: draftInput.platform as TradeDraft["platform"],
        jobId: row.id,
        updatedAt: (updated.draftUpdatedAt ?? updated.updatedAt).toISOString(),
        tradeIndex,
      },
    };
  }

  // ── Confirmation → Trading Core (§6/§75–§79/§102, V2 batch) ────────────────

  /**
   * V2 confirm — imports EVERY trade with a saved draft by default (V1
   * behavior = the single draft), or the explicitly requested tradeIndexes
   * subset, optionally attached to a specific account. Human-in-the-loop
   * invariants are unchanged: no draft ⇒ no import; the canonical Trades
   * are created ONLY by Trading Core; the guarded flip remains the
   * at-most-one-confirmation mutex (§79) and per-trade external refs make
   * replays idempotent.
   */
  async confirmImport(
    userId: string,
    id: string,
    input: { tradeIndexes?: number[]; accountId?: string } = {},
  ): Promise<{
    tradeId: string;
    trades?: Array<{ tradeId: string; tradeIndex: number }>;
    accountId?: string;
    job: RecognitionJob;
  }> {
    const check = this.limiter.check("confirm", userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many confirmation attempts. Please wait before trying again.",
        RECOGNITION_ERROR_CODES.RATE_LIMITED_CONFIRM,
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("confirm", userId);

    const row = await this.requireRow(userId, id);

    // Idempotent replay (§51): the same confirmed recognition returns the
    // SAME trade ids — never a second import (§79).
    if (row.status === "CONFIRMED") {
      const tradeIds = row.importedTradeIds ?? (row.importedTradeId !== null ? [row.importedTradeId] : []);
      if (tradeIds.length > 0) {
        return {
          tradeId: (row.importedTradeId ?? tradeIds[0]) as string,
          trades: tradeIds.map((tradeId, index) => ({ tradeId, tradeIndex: index + 1 })),
          job: toRecognitionJobDto(row),
        };
      }
      throw new ConflictError(
        "This recognition is already confirmed.",
        RECOGNITION_ERROR_CODES.ALREADY_CONFIRMED,
      );
    }
    if (row.status !== "REVIEW_REQUIRED") {
      throw new ConflictError(
        "Only a processed recognition can be imported.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }

    // The batch: drafts stored per index (V2) falling back to the scalar
    // draft for index 1 (V1 rows). Defaults to EVERY drafted trade.
    const draftedIndexes = new Set<number>([
      ...(row.drafts !== null ? Object.keys(row.drafts).map((key) => Number(key)) : []),
      ...(row.draft !== null ? [1] : []),
    ]);
    const requestedIndexes =
      input.tradeIndexes !== undefined && input.tradeIndexes.length > 0
        ? [...new Set(input.tradeIndexes)]
        : [...draftedIndexes];
    if (input.tradeIndexes !== undefined && requestedIndexes.length === 0) {
      throw new BusinessRuleError(
        "No trade indexes were requested.",
        RECOGNITION_ERROR_CODES.DRAFT_REQUIRED,
      );
    }

    // Human-in-the-loop gate (§6/§76): every requested trade needs a saved,
    // coherent draft. The confirmation endpoint never invents values.
    const batch: Array<{ tradeIndex: number; draft: TradeDraftRecord }> = [];
    const missing: number[] = [];
    for (const tradeIndex of requestedIndexes.sort((a, b) => a - b)) {
      const draft =
        row.drafts !== null
          ? row.drafts[String(tradeIndex)] ?? null
          : tradeIndex === 1
            ? row.draft
            : null;
      if (draft === null) {
        missing.push(tradeIndex);
        continue;
      }
      const coherenceIssues = validateDraftCoherence(draft);
      if (coherenceIssues.length > 0) {
        throw new BusinessRuleError(
          `Invalid trade draft (trade ${tradeIndex}): ${coherenceIssues
            .map((issue) => `${issue.field} — ${issue.message}`)
            .join("; ")}`,
          RECOGNITION_ERROR_CODES.DRAFT_INVALID,
        );
      }
      batch.push({ tradeIndex, draft });
    }
    if (missing.length > 0) {
      throw new ConflictError(
        `Review and save a draft for trade ${missing.join(", ")} before importing.`,
        RECOGNITION_ERROR_CODES.DRAFT_REQUIRED,
      );
    }
    if (batch.length === 0) {
      throw new ConflictError(
        "Review the recognized trade and save the draft before importing.",
        RECOGNITION_ERROR_CODES.DRAFT_REQUIRED,
      );
    }

    // Reserve the confirmation (guarded flip = at-most-one-import mutex,
    // §79): a racing second confirm cannot create a second Trade.
    const firstBatchEntry = batch[0];
    if (firstBatchEntry === undefined) {
      throw new ConflictError(
        "Review the recognized trade and save the draft before importing.",
        RECOGNITION_ERROR_CODES.DRAFT_REQUIRED,
      );
    }
    const reserved = await this.repository.reserveConfirmation(
      row.id,
      draftToCorrections(firstBatchEntry.draft),
    );
    if (reserved === null) {
      // A concurrent confirm won the race — replay its state honestly.
      const winner = await this.repository.findForUser(row.id, userId);
      if (winner?.status === "CONFIRMED") {
        const tradeIds = winner.importedTradeIds ?? (winner.importedTradeId !== null ? [winner.importedTradeId] : []);
        if (tradeIds.length > 0) {
          return {
            tradeId: (winner.importedTradeId ?? tradeIds[0]) as string,
            trades: tradeIds.map((tradeId, index) => ({ tradeId, tradeIndex: index + 1 })),
            job: toRecognitionJobDto(winner),
          };
        }
      }
      throw new ConflictError(
        "This recognition is already confirmed.",
        RECOGNITION_ERROR_CODES.ALREADY_CONFIRMED,
      );
    }

    try {
      // The canonical Trades are created by Trading Core (§77) — never by
      // the OCR context (§78). Unknown symbol / missing account surface as
      // Trading Core business errors mapped below.
      const created: Array<{ tradeId: string; tradeIndex: number }> = [];
      for (const { tradeIndex, draft } of batch) {
        // Batch-retry idempotency: a trade created before a partial failure
        // is SKIPPED (its id is resolved, never imported twice, §79).
        const alreadyImported = await this.trades.findRecognitionImportTradeId(
          userId,
          row.id,
          tradeIndex,
          input.accountId,
        );
        if (alreadyImported !== null) {
          created.push({ tradeId: alreadyImported, tradeIndex });
          continue;
        }
        const { tradeId } = await this.trades.importTradeFromRecognition(userId, {
          recognitionId: row.id,
          tradeIndex,
          accountId: input.accountId,
          symbol: requireValue(draft.symbol),
          direction: draft.direction,
          entryPrice: requireValue(draft.entryPrice),
          exitPrice: draft.exitPrice,
          volume: draft.volume,
          stopLoss: draft.stopLoss,
          takeProfit: draft.takeProfit,
          entryAt: draft.openTime ?? new Date().toISOString(),
          exitAt: draft.closeTime,
          profitLoss: draft.profitLoss,
        });
        created.push({ tradeId, tradeIndex });
      }

      const tradeIds = created.map((entry) => entry.tradeId);
      await this.repository.finalizeImportMulti(row.id, tradeIds);
      const finalRow = await this.repository.findForUser(row.id, userId);
      if (finalRow === null) {
        throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
      }

      await this.securityEvents.record({
        userId,
        type: "OCR_RESULT_CONFIRMED",
        actor: userId,
        context: `recognition confirmed by the user (${created.length} trade${created.length === 1 ? "" : "s"})`,
        outcome: "SUCCESS",
      });
      for (const entry of created) {
        await this.securityEvents.record({
          userId,
          type: "TRADE_IMPORTED",
          actor: userId,
          context: `trade ${entry.tradeId} imported from recognition ${row.id} (trade ${entry.tradeIndex})`,
          outcome: "SUCCESS",
        });
      }
      await this.repository.recordEvent({
        userId,
        type: OCR_EVENT_TYPES.importConfirmed,
        recognitionId: row.id,
        metadata: {
          trades: created.length,
          ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
        },
      });

      const firstTrade = created[0];
      if (firstTrade === undefined) {
        throw new ConflictError(
          "This recognition is already confirmed.",
          RECOGNITION_ERROR_CODES.ALREADY_CONFIRMED,
        );
      }
      return {
        tradeId: firstTrade.tradeId,
        trades: created,
        ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
        job: toRecognitionJobDto(finalRow),
      };
    } catch (error) {
      // §146 rollback — the recognition returns to REVIEW_REQUIRED so the
      // user can fix the draft (or the account situation) and retry; a
      // confirmed-without-trade state is never left behind silently.
      // Trades already created before the failure stay in the journal;
      // their external refs make a retry skip them (idempotent per trade).
      await this.repository.rollbackConfirmation(row.id);
      if (error instanceof BusinessRuleError || error instanceof ConflictError) {
        throw new BusinessRuleError(error.message, RECOGNITION_ERROR_CODES.IMPORT_CONFLICT);
      }
      throw error;
    }
  }

  // ── Cancel / retry / delete (§71/§69/§31) ─────────────────────────────────

  async cancelJob(userId: string, id: string): Promise<{ job: RecognitionJob }> {
    const row = await this.requireRow(userId, id);
    if (row.status === "CANCELLED") {
      return { job: toRecognitionJobDto(row) }; // idempotent replay
    }
    if (row.status !== "QUEUED" && row.status !== "PROCESSING") {
      throw new ConflictError(
        "This recognition has already finished and cannot be cancelled.",
        RECOGNITION_ERROR_CODES.NOT_CANCELLABLE,
      );
    }
    const updated = await this.repository.markCancelled(row.id);
    await this.securityEvents.record({
      userId,
      type: "OCR_JOB_CANCELLED",
      actor: userId,
      context: `recognition job cancelled (${row.status} at cancellation)`,
      outcome: "SUCCESS",
    });
    return { job: toRecognitionJobDto(updated ?? row) };
  }

  async retryJob(userId: string, id: string, requestId: string | null): Promise<{ job: RecognitionJob }> {
    const row = await this.requireRow(userId, id);
    if (row.status !== "FAILED") {
      throw new ConflictError(
        "Only a failed recognition can be retried.",
        RECOGNITION_ERROR_CODES.NOT_RETRYABLE,
      );
    }
    // A retry is a NEW job from the same screenshot (the frontend contract):
    // a fresh job index defeats the idempotency key deliberately (§68 covers
    // ACCIDENTAL duplicates; an explicit retry is intentional).
    const jobIndex = await this.repository.countRecognitionsForAsset(userId, row.assetId);
    const retryKey = deriveJobIdempotencyKey({
      userId,
      checksumSha256: row.asset.checksumSha256,
      profile: OCR_EXTRACTION_PROFILE,
      pipelineVersion: OCR_PIPELINE_VERSION,
      mode: row.mode,
      jobIndex,
    });
    const created = await this.repository.createRecognition(row.asset, {
      status: "QUEUED",
      extractionProfile: OCR_EXTRACTION_PROFILE,
      pipelineVersion: OCR_PIPELINE_VERSION,
      idempotencyKey: retryKey,
      requestId,
      requestedPlatform: row.requestedPlatform,
      mode: row.mode,
    });
    await this.securityEvents.record({
      userId,
      type: "OCR_JOB_CREATED",
      actor: userId,
      context: `recognition job retried (attempt after ${row.failureCategory ?? "failure"})`,
      outcome: "SUCCESS",
    });
    await this.processRow(userId, created, row.asset);
    const processed = await this.repository.findForUser(created.id, userId);
    if (processed === null) {
      throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return { job: toRecognitionJobDto(processed) };
  }

  async deleteJob(userId: string, id: string): Promise<{ ok: true }> {
    const deleted = await this.repository.deleteForUser(id, userId);
    if (deleted === null) {
      throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    if (deleted.storageKey !== null) {
      // AFTER commit (§50): binary removal is best-effort — a failure leaves
      // an orphan file, never an orphaned metadata row.
      await this.storage.delete(deleted.storageKey);
    }
    await this.securityEvents.record({
      userId,
      type: "OCR_RESULT_DELETED",
      actor: userId,
      context: "recognition deleted",
      outcome: "SUCCESS",
    });
    return { ok: true };
  }

  // ── V2 — crop re-recognition (zone re-read) ────────────────────────────────

  /**
   * Re-runs the engine over ONE user-selected zone of the ORIGINAL upload
   * (normalized 0..1 region → pixel rect) and merges the fresh read into
   * the stored machine result. The draft is NEVER touched: the zone read
   * updates the machine data; the user's declaration stays authoritative
   * until they re-save. Confirmed recognitions are frozen history (409).
   */
  async recrop(
    userId: string,
    id: string,
    input: { region: { x: number; y: number; width: number; height: number }; tradeIndex?: number },
  ): Promise<{ result: RecognitionResult }> {
    const row = await this.requireRow(userId, id);
    if (row.status !== "REVIEW_REQUIRED") {
      throw new ConflictError(
        "Only a reviewable recognition can be re-read.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }
    if (row.result === null) {
      throw new ConflictError(
        "This recognition has no result to refine.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }
    const bytes = await this.storage.get(row.asset.storageKey);
    if (bytes === null) {
      throw new NotFoundError("Stored screenshot is missing.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    const width = row.asset.width;
    const height = row.asset.height;
    if (width === null || height === null || width <= 0 || height <= 0) {
      throw new BusinessRuleError(
        "Crop re-recognition is only available for screenshots, not documents.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }
    const tradeIndex = input.tradeIndex ?? 1;

    const response = await this.callEngine({
      requestId: row.id,
      contractVersion: "1",
      imageBase64: bytes.toString("base64"),
      metadata: {
        mime: row.asset.mime,
        sizeBytes: row.asset.sizeBytes,
        width,
        height,
        checksumSha256: row.asset.checksumSha256,
      },
      extractionProfile: OCR_EXTRACTION_PROFILE,
      deadlineMs: this.config.ocr.engineTimeoutMs,
      cropRegion: {
        x: Math.round(input.region.x * width),
        y: Math.round(input.region.y * height),
        width: Math.max(8, Math.round(input.region.width * width)),
        height: Math.max(8, Math.round(input.region.height * height)),
      },
    });
    if (response.processingStatus !== "COMPLETED") {
      throw new BusinessRuleError(
        response.failure?.message ?? "the selected zone could not be read",
        RECOGNITION_ERROR_CODES.DRAFT_INVALID,
      );
    }

    // Merge the zone read into the TARGET trade's fields (engine wins for
    // the zone — it read zoomed pixels; everything else is preserved).
    const zoneFields = applyDomainValidation(response.fields.map(mapEngineField));
    const existingTrades =
      row.result.trades !== undefined && row.result.trades !== null && row.result.trades.length > 0
        ? row.result.trades
        : [{ pageIndex: 0, fields: row.result.fields }];
    const fallbackTrade = existingTrades[0];
    if (fallbackTrade === undefined) {
      throw new ConflictError(
        "This recognition has no result to refine.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }
    const targetTrade = existingTrades[tradeIndex - 1] ?? fallbackTrade;
    const mergedTrade = mergeRecropFields(
      targetTrade.fields as unknown as RecropMergeableField[],
      zoneFields as unknown as RecropMergeableField[],
    );
    const mergedTradesList = existingTrades.map((trade, index) =>
      index === tradeIndex - 1 ? { ...trade, fields: mergedTrade.fields } : trade,
    );
    const mergedPrimary = mergedTradesList[0];
    if (mergedPrimary === undefined) {
      throw new ConflictError(
        "This recognition has no result to refine.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }
    const result: OcrResultPayload = {
      ...row.result,
      fields: mergedPrimary.fields as unknown[],
      trades: mergedTradesList,
    };
    const updated = await this.repository.updateResult(row.id, result);
    if (updated === null) {
      throw new ConflictError(
        "This recognition no longer accepts re-reads.",
        RECOGNITION_ERROR_CODES.NOT_REVIEWABLE,
      );
    }
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.recropped,
      recognitionId: row.id,
      metadata: {
        tradeIndex,
        replaced: mergedTrade.replacedKeys.length,
        added: mergedTrade.addedKeys.length,
      },
    });
    const wire = toRecognitionResult(updated);
    if (wire === null) {
      throw new NotFoundError("No recognition result is available for this job.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return { result: wire };
  }

  // ── V2 — suggestions (corrections memory + instrument catalog) ─────────────

  async getSuggestions(
    userId: string,
    input: { symbol?: string | null },
  ): Promise<{
    suggestions: Array<{ field: string; values: Array<{ value: string; count: number; source: string }> }>;
    symbolCandidates: Array<{ symbol: string; name: string; assetClass: string }>;
  }> {
    const memoryRows = await this.repository.listCorrectionsForUser(userId, 100);
    const suggestions = rankSuggestions(memoryRows);
    const symbolCandidates =
      input.symbol !== undefined && input.symbol !== null && input.symbol.trim().length >= 2
        ? await this.repository.findInstrumentsBySymbolPrefix(input.symbol.trim().toUpperCase(), 6)
        : [];
    return { suggestions, symbolCandidates };
  }

  // ── V2 — quality analytics (event-driven, owner-scoped) ────────────────────

  async getAnalytics(userId: string, windowDays: number): Promise<{
    windowDays: number;
    funnel: Record<string, number>;
    duplicates: { warnings: number; processed: number };
    corrections: {
      confirmedFields: number;
      correctedFields: number;
      byField: Array<{ field: string; corrected: number; total: number; rate: number }>;
    };
    performance: { avgProcessingMs: number | null; avgOverallConfidence: number | null };
    perDay: Array<{ date: string; uploads: number; confirmed: number }>;
  }> {
    const days = Math.min(Math.max(windowDays, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.repository.countEventsByType(userId, since);
    const byType = new Map(events.map((event) => [event.type, event.count]));

    const completed = byType.get("recognition_completed") ?? 0;
    const confirmed = byType.get("recognition_import_confirmed") ?? 0;
    const confirmedTrades = await this.repository.sumEventMetadata(userId, since, "recognition_import_confirmed", "trades");

    const correctionTotals = await this.repository.countCorrectionWindow(userId, since);
    const correctedFields = correctionTotals.reduce((sum, entry) => sum + entry.corrected, 0);
    // The denominator: every confirmed trade declares the tracked fields.
    const confirmedFields = confirmedTrades * CORRECTION_TRACKED_KEYS.length;
    const byField = correctionTotals.map((entry) => ({
      field: entry.field,
      corrected: entry.corrected,
      total: confirmedFields,
      rate: confirmedFields > 0 ? Math.min(1, entry.corrected / confirmedFields) : 0,
    }));

    const perDay = await this.repository.listPerDayActivity(userId, since);
    const performance = await this.repository.performanceAggregates(userId, since);

    return {
      windowDays: days,
      funnel: {
        uploads: byType.get("recognition_upload_completed") ?? 0,
        jobs: byType.get("recognition_started") ?? 0,
        completed,
        failed: byType.get("recognition_failed") ?? 0,
        cancelled: byType.get("recognition_cancelled") ?? 0,
        reviewStarted: byType.get("recognition_review_started") ?? 0,
        confirmed,
        confirmedTrades,
      },
      duplicates: {
        warnings: byType.get("recognition_duplicate_warned") ?? 0,
        processed: byType.get("recognition_duplicate_processed") ?? 0,
      },
      corrections: {
        confirmedFields,
        correctedFields,
        byField,
      },
      performance,
      perDay,
    };
  }

  // ── V2 — storage & retention ───────────────────────────────────────────────

  async getStorage(userId: string): Promise<{
    assetsCount: number;
    totalBytes: number;
    oldestUploadAt: string | null;
    retentionDays: number;
    nextSweepAt: string | null;
  }> {
    const stats = await this.repository.assetStorageStats(userId);
    const retentionDays = this.config.ocr.retentionDays;
    return {
      assetsCount: stats.assetsCount,
      totalBytes: stats.totalBytes,
      oldestUploadAt: stats.oldestUploadAt ? stats.oldestUploadAt.toISOString() : null,
      retentionDays,
      nextSweepAt:
        retentionDays > 0
          ? new Date(this.lastSweepAt.getTime() + this.config.ocr.retentionSweepMs).toISOString()
          : null,
    };
  }

  /** Lazy retention sweep — throttled by the configured cadence. */
  private lastSweepAt: Date = new Date();

  async sweepExpired(force = false): Promise<{ swept: number; storageKeys: string[] }> {
    const retentionDays = this.config.ocr.retentionDays;
    if (retentionDays <= 0) return { swept: 0, storageKeys: [] };
    const now = Date.now();
    if (!force && now - this.lastSweepAt.getTime() < this.config.ocr.retentionSweepMs) {
      return { swept: 0, storageKeys: [] };
    }
    this.lastSweepAt = new Date();
    const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
    const { storageKeys, recognitions } = await this.repository.deleteExpiredRecognitions(cutoff);
    for (const storageKey of storageKeys) {
      void this.storage.delete(storageKey);
    }
    if (recognitions > 0) {
      await this.securityEvents.record({
        userId: "system",
        type: "OCR_RETENTION_SWEEP",
        actor: "system",
        context: `retention sweep removed ${recognitions} recognition(s) older than ${retentionDays}d`,
        outcome: "SUCCESS",
      });
    }
    return { swept: recognitions, storageKeys };
  }

  /** V2 — SSE progress snapshot (the seam for async processing later). */
  async getProgress(
    userId: string,
    id: string,
  ): Promise<{ jobId: string; status: string; stage: string; progress: number; at: string; terminal: boolean }> {
    const row = await this.requireRow(userId, id);
    const wireStatus = mapWireStatus(row.status);
    const terminal = wireStatus === "COMPLETED" || wireStatus === "FAILED" || wireStatus === "CANCELLED";
    return {
      jobId: row.id,
      status: wireStatus,
      stage: mapWireStage(row.status),
      progress: terminal ? 100 : 40,
      at: new Date().toISOString(),
      terminal,
    };
  }

  // ── V3 — reprocessing (spec §45) ───────────────────────────────────────────

  /**
   * Reprocess: run a NEW recognition over the SAME asset with the CURRENT
   * pipeline. The source recognition is NEVER mutated (spec §33/§45) — a
   * confirmed trade stays untouched; the fresh job joins the review flow
   * exactly like any other. Deliberately NOT idempotent on the source id
   * (each call = a new attempt, §51 only forbids duplicate TRADES, which
   * the external-ref confirm path still guarantees).
   */
  async reprocess(userId: string, id: string, requestId: string | null): Promise<{
    job: RecognitionJob;
    reprocessedFromJobId: string;
  }> {
    const check = this.limiter.check("upload", userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many recognition jobs. Please wait before trying again.",
        RECOGNITION_ERROR_CODES.RATE_LIMITED_UPLOAD,
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("upload", userId);

    const source = await this.requireRow(userId, id);
    if (
      source.status !== "REVIEW_REQUIRED" &&
      source.status !== "CONFIRMED" &&
      source.status !== "FAILED"
    ) {
      throw new ConflictError(
        "Only a finished recognition can be reprocessed.",
        RECOGNITION_ERROR_CODES.NOT_REPROCESSABLE,
      );
    }
    const asset = await this.repository.findAssetByIdForUser(source.assetId, userId);
    if (asset === null) {
      throw new NotFoundError("Screenshot not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }

    // A fresh idempotency key derived from the SOURCE job (never colliding
    // with the base key, §32) — the new row is a new review opportunity.
    const jobCount = await this.repository.countRecognitionsForAsset(userId, asset.id);
    const idempotencyKey = deriveJobIdempotencyKey({
      userId,
      checksumSha256: asset.checksumSha256,
      profile: OCR_EXTRACTION_PROFILE,
      pipelineVersion: OCR_PIPELINE_VERSION,
      mode: source.mode,
      jobIndex: jobCount,
    });
    const row = await this.repository
      .createRecognition(asset, {
        status: "QUEUED",
        extractionProfile: OCR_EXTRACTION_PROFILE,
        pipelineVersion: OCR_PIPELINE_VERSION,
        idempotencyKey,
        requestId,
        requestedPlatform: source.requestedPlatform,
        mode: source.mode,
      })
      .catch(async (error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const winner = await this.repository.findRecognitionByIdempotencyKey(userId, idempotencyKey);
          if (winner) return winner;
        }
        throw error;
      });
    await this.repository.attachReprocessLineage(row.id, source.id);
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.reprocessed,
      recognitionId: source.id,
      metadata: { newJobId: row.id },
    });
    await this.securityEvents.record({
      userId,
      type: "OCR_JOB_CREATED",
      actor: userId,
      context: `recognition ${source.id} reprocessed as ${row.id}`,
      outcome: "SUCCESS",
    });

    if (asset.mime === "application/pdf") {
      await this.processDocumentRow(userId, row, asset);
    } else {
      await this.processRow(userId, row, asset);
    }
    const processed = await this.repository.findForUser(row.id, userId);
    if (processed === null) {
      throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
    }
    return { job: toRecognitionJobDto(processed), reprocessedFromJobId: source.id };
  }

  // ── V3 — multi-screenshot fusion groups (spec §14/§15/§31/§36) ────────────

  /** Wire shape of a group; members are resolved owner-scoped (§34). */
  private async toGroupDto(group: OcrGroupRow): Promise<RecognitionGroup> {
    const memberRows: OcrRecognitionRow[] = [];
    for (const jobId of group.memberJobIds) {
      const row = await this.repository.findForUser(jobId, group.userId);
      if (row !== null) memberRows.push(row);
    }
    const members: RecognitionGroupMember[] = memberRows.map((row) => {
      const result = toRecognitionResult(row);
      const classification = (row.result?.classification ?? null) as { type?: string } | null;
      return {
        jobId: row.id,
        status: mapWireStatus(row.status),
        screenshotName: row.asset.originalName,
        detectedPlatform: row.result !== null ? classificationToDetectedPlatform(classification as never) : null,
        screenshotType: classification?.type ?? null,
        trade: result?.trades[0] ?? null,
        overallConfidence: result?.overallConfidence ?? null,
        uploadedAt: row.asset.createdAt.toISOString(),
      };
    });
    return {
      id: group.id,
      ownerId: group.userId,
      status: group.status as RecognitionGroup["status"],
      members,
      evidence: (group.evidence ?? []) as RecognitionGroup["evidence"],
      fusionConfidence: group.fusionConfidence,
      autoConfirmed: group.autoConfirmed,
      fusedDraft:
        group.fusedDraft !== null
          ? {
              ...group.fusedDraft,
              platform: group.fusedDraft.platform as TradeDraft["platform"],
              jobId: group.id,
              updatedAt: group.updatedAt.toISOString(),
            }
          : null,
      ...(group.fieldOrigins !== null ? { fieldOrigins: group.fieldOrigins } : {}),
      conflicts: (group.conflicts ?? []) as RecognitionGroup["conflicts"],
      timeline: (group.timeline ?? []) as RecognitionGroup["timeline"],
      quality: group.quality as unknown as RecognitionGroup["quality"],
      importedTradeId: group.importedTradeId,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  private memberInputOf(row: OcrRecognitionRow): FusionMemberInput | null {
    const result = toRecognitionResult(row);
    const trade = result?.trades[0] ?? null;
    const classification = (row.result?.classification ?? null) as { type?: string } | null;
    return {
      jobId: row.id,
      screenshotName: row.asset.originalName,
      status: row.status,
      trade,
      detectedPlatform: result?.detectedPlatform ?? null,
      screenshotType: classification?.type ?? null,
      uploadedAt: row.asset.createdAt.toISOString(),
    };
  }

  /** Create a group from 2..8 owned reviewable jobs (spec §14/§15). */
  async createGroup(
    userId: string,
    input: { jobIds: string[] },
  ): Promise<{ group: RecognitionGroup }> {
    const jobIds = [...new Set(input.jobIds)];
    if (jobIds.length < 2 || jobIds.length > 8) {
      throw new BusinessRuleError(
        "A group combines between 2 and 8 screenshots.",
        RECOGNITION_ERROR_CODES.GROUP_INVALID,
      );
    }
    const members: FusionMemberInput[] = [];
    for (const jobId of jobIds) {
      const row = await this.repository.findForUser(jobId, userId);
      if (row === null) {
        throw new NotFoundError("Recognition not found.", RECOGNITION_ERROR_CODES.NOT_FOUND);
      }
      if (row.status !== "REVIEW_REQUIRED" && row.status !== "CONFIRMED") {
        throw new BusinessRuleError(
          "Every screenshot must finish recognition before grouping.",
          RECOGNITION_ERROR_CODES.GROUP_NOT_FUSABLE,
        );
      }
      const member = this.memberInputOf(row);
      if (member === null || member.trade === null) {
        throw new BusinessRuleError(
          "One of the screenshots has no recognized trade to fuse.",
          RECOGNITION_ERROR_CODES.GROUP_NOT_FUSABLE,
        );
      }
      members.push(member);
    }

    // Deterministic fusion (spec §31): strongest evidence wins, conflicts
    // preserved, timeline built from recognized timestamps only.
    const outcome = fuseMembers(members);

    // Group quality: the lead member's quality with the fusion consistency.
    const leadRow = await this.repository.findForUser(jobIds[0] as string, userId);
    let groupQuality: { overall: number; components: Record<string, number | null> } | null = null;
    if (leadRow !== null) {
      const leadResult = toRecognitionResult(leadRow);
      if (leadResult !== null) {
        groupQuality = computeQuality({
          trades: leadResult.trades,
          overallConfidence: leadResult.overallConfidence,
          consistency: outcome.consistency,
        });
      }
    }

    // A fused draft without symbol or direction cannot become a trade —
    // still creatable for review, but never auto-confirmed (§103).
    const fusable =
      outcome.fusedDraft.symbol !== null &&
      outcome.fusedDraft.direction !== null &&
      (outcome.fusedDraft.direction === "BUY" || outcome.fusedDraft.direction === "SELL");
    const autoConfirmed = outcome.autoConfirmed && fusable;

    const created = await this.repository.createGroup({
      userId,
      status: autoConfirmed ? "ACTIVE" : "PROPOSED",
      memberJobIds: jobIds,
      evidence: outcome.evidence,
      fusionConfidence: outcome.fusionConfidence,
      autoConfirmed,
      fusedDraft: fusable ? (outcome.fusedDraft as unknown as TradeDraftRecord) : null,
      fieldOrigins: outcome.fieldOrigins,
      conflicts: outcome.conflicts,
      timeline: outcome.timeline,
      quality: groupQuality,
    });
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.groupCreated,
      metadata: { members: jobIds.length, fusionConfidence: outcome.fusionConfidence, autoConfirmed },
    });
    await this.securityEvents.record({
      userId,
      type: "OCR_GROUP_CREATED",
      actor: userId,
      context: `fusion group created (${jobIds.length} screenshots, confidence ${outcome.fusionConfidence})`,
      outcome: "SUCCESS",
    });
    return { group: await this.toGroupDto(created) };
  }

  async listGroups(userId: string): Promise<{ groups: RecognitionGroupSummary[] }> {
    const rows = await this.repository.listGroupsForUser(userId, 50);
    const groups: RecognitionGroupSummary[] = [];
    for (const row of rows) {
      const leadJobId = row.memberJobIds[0];
      const lead = leadJobId !== undefined ? await this.repository.findForUser(leadJobId, userId) : null;
      groups.push({
        id: row.id,
        status: row.status as RecognitionGroupSummary["status"],
        memberCount: row.memberJobIds.length,
        leadScreenshotName: lead?.asset.originalName ?? "(removed screenshot)",
        fusionConfidence: row.fusionConfidence,
        importedTradeId: row.importedTradeId,
        createdAt: row.createdAt.toISOString(),
      });
    }
    return { groups };
  }

  private async requireGroup(userId: string, id: string): Promise<OcrGroupRow> {
    const group = await this.repository.findGroupByIdForUser(id, userId);
    if (group === null) {
      throw new NotFoundError("Recognition group not found.", RECOGNITION_ERROR_CODES.GROUP_NOT_FOUND);
    }
    return group;
  }

  async getGroup(userId: string, id: string): Promise<{ group: RecognitionGroup }> {
    const group = await this.requireGroup(userId, id);
    return { group: await this.toGroupDto(group) };
  }

  /** Edit the fused draft — SAME validated rules as a job draft (§74). */
  async updateGroupDraft(
    userId: string,
    id: string,
    draft: TradeDraftRecord,
  ): Promise<{ draft: TradeDraft }> {
    const group = await this.requireGroup(userId, id);
    if (group.status !== "PROPOSED" && group.status !== "ACTIVE") {
      throw new ConflictError(
        "This group is finished and its draft can no longer change.",
        RECOGNITION_ERROR_CODES.GROUP_ALREADY_CONFIRMED,
      );
    }
    const coherenceIssues = validateDraftCoherence(draft);
    if (coherenceIssues.length > 0) {
      throw new BusinessRuleError(
        `Invalid fused draft: ${coherenceIssues
          .map((issue) => `${issue.field} — ${issue.message}`)
          .join("; ")}`,
        RECOGNITION_ERROR_CODES.DRAFT_INVALID,
      );
    }
    const saved = await this.repository.saveGroupDraft(group.id, draft);
    if (saved === null) {
      throw new ConflictError(
        "This group is finished and its draft can no longer change.",
        RECOGNITION_ERROR_CODES.GROUP_ALREADY_CONFIRMED,
      );
    }
    return {
      draft: {
        ...draft,
        platform: draft.platform as TradeDraft["platform"],
        jobId: saved.id,
        updatedAt: saved.updatedAt.toISOString(),
      },
    };
  }

  /**
   * THE group human-in-the-loop gate (spec §20/§60): converts the fused
   * draft into exactly ONE canonical trade through the SAME Trading Core
   * bridge (externalRef `OCR:group:<id>` — idempotent replay, §51/§33).
   */
  async confirmGroup(
    userId: string,
    id: string,
    input: { accountId?: string } = {},
  ): Promise<{ tradeId: string; group: RecognitionGroup }> {
    const check = this.limiter.check("confirm", userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many confirmation attempts. Please wait before trying again.",
        RECOGNITION_ERROR_CODES.RATE_LIMITED_CONFIRM,
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("confirm", userId);

    const group = await this.requireGroup(userId, id);

    // Idempotent replay (§51): a confirmed group returns the SAME trade.
    if (group.status === "CONFIRMED") {
      if (group.importedTradeId !== null) {
        return { tradeId: group.importedTradeId, group: await this.toGroupDto(group) };
      }
      throw new ConflictError(
        "This group is already confirmed.",
        RECOGNITION_ERROR_CODES.GROUP_ALREADY_CONFIRMED,
      );
    }
    if (group.status !== "PROPOSED" && group.status !== "ACTIVE") {
      throw new ConflictError(
        "This group was discarded and can no longer be confirmed.",
        RECOGNITION_ERROR_CODES.GROUP_NOT_FUSABLE,
      );
    }
    if (group.fusedDraft === null) {
      throw new BusinessRuleError(
        "The fused draft is incomplete — review the grouped screenshots first.",
        RECOGNITION_ERROR_CODES.DRAFT_REQUIRED,
      );
    }
    const draft = group.fusedDraft;
    const coherenceIssues = validateDraftCoherence(draft);
    if (coherenceIssues.length > 0) {
      throw new BusinessRuleError(
        `Invalid fused draft: ${coherenceIssues
          .map((issue) => `${issue.field} — ${issue.message}`)
          .join("; ")}`,
        RECOGNITION_ERROR_CODES.DRAFT_INVALID,
      );
    }

    // At-most-one-import mutex (§51) — mirrors the job confirm flow.
    const reserved = await this.repository.reserveGroupConfirmation(group.id);
    if (reserved === null) {
      const winner = await this.repository.findGroupByIdForUser(group.id, userId);
      if (winner?.status === "CONFIRMED" && winner.importedTradeId !== null) {
        return { tradeId: winner.importedTradeId, group: await this.toGroupDto(winner) };
      }
      throw new ConflictError(
        "This group is already confirmed.",
        RECOGNITION_ERROR_CODES.GROUP_ALREADY_CONFIRMED,
      );
    }

    try {
      const alreadyImported = await this.trades.findRecognitionImportTradeId(
        userId,
        `group:${group.id}`,
        undefined,
        input.accountId,
      );
      let tradeId: string;
      if (alreadyImported !== null) {
        tradeId = alreadyImported;
      } else {
        const created = await this.trades.importTradeFromRecognition(userId, {
          recognitionId: `group:${group.id}`,
          accountId: input.accountId,
          symbol: requireValue(draft.symbol),
          direction: draft.direction,
          entryPrice: requireValue(draft.entryPrice),
          exitPrice: draft.exitPrice,
          volume: draft.volume,
          stopLoss: draft.stopLoss,
          takeProfit: draft.takeProfit,
          entryAt: draft.openTime ?? new Date().toISOString(),
          exitAt: draft.closeTime,
          profitLoss: draft.profitLoss,
        });
        tradeId = created.tradeId;
      }
      await this.repository.finalizeGroupImport(group.id, tradeId);
      const finalGroup = await this.repository.findGroupByIdForUser(group.id, userId);
      if (finalGroup === null) {
        throw new NotFoundError("Recognition group not found.", RECOGNITION_ERROR_CODES.GROUP_NOT_FOUND);
      }

      await this.securityEvents.record({
        userId,
        type: "OCR_RESULT_CONFIRMED",
        actor: userId,
        context: `fusion group ${group.id} confirmed (${group.memberJobIds.length} screenshots)`,
        outcome: "SUCCESS",
      });
      await this.securityEvents.record({
        userId,
        type: "TRADE_IMPORTED",
        actor: userId,
        context: `trade ${tradeId} imported from fusion group ${group.id}`,
        outcome: "SUCCESS",
      });
      await this.repository.recordEvent({
        userId,
        type: OCR_EVENT_TYPES.groupConfirmed,
        recognitionId: null,
        metadata: { groupId: group.id, tradeId, members: group.memberJobIds.length },
      });

      return { tradeId, group: await this.toGroupDto(finalGroup) };
    } catch (error) {
      // §146 rollback — the group returns to ACTIVE so the user can fix the
      // fused draft and retry; a confirmed-without-trade state never sticks.
      await this.repository.rollbackGroupConfirmation(group.id);
      if (error instanceof BusinessRuleError || error instanceof ConflictError) {
        throw new BusinessRuleError(error.message, RECOGNITION_ERROR_CODES.IMPORT_CONFLICT);
      }
      throw error;
    }
  }

  /** Dissolve a group — every member recognition stays intact (§15). */
  async discardGroup(userId: string, id: string): Promise<{ ok: true }> {
    const group = await this.requireGroup(userId, id);
    if (group.status !== "CONFIRMED") {
      await this.repository.discardGroup(group.id);
      await this.repository.recordEvent({
        userId,
        type: OCR_EVENT_TYPES.groupDiscarded,
        metadata: { groupId: group.id },
      });
    }
    return { ok: true };
  }

  // ── V3 — screenshot collections (spec §41) ────────────────────────────────

  private toCollectionDto(row: {
    id: string;
    name: string;
    description: string | null;
    assetsCount?: number;
    createdAt: Date;
    updatedAt: Date;
    assets?: OcrAssetRow[];
  }): RecognitionCollection | RecognitionCollectionDetail {
    const base: RecognitionCollection = {
      id: row.id,
      name: row.name,
      description: row.description,
      assetsCount: row.assetsCount ?? row.assets?.length ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.assets === undefined) return base;
    return {
      ...base,
      assets: row.assets.map((asset) => ({
        id: asset.id,
        name: asset.originalName,
        sizeBytes: asset.sizeBytes,
        mimeType: asset.mime as RecognitionScreenshot["mimeType"],
        width: asset.width,
        height: asset.height,
        uploadedAt: asset.createdAt.toISOString(),
      })),
    };
  }

  async listCollections(userId: string): Promise<{ collections: RecognitionCollection[] }> {
    const rows = await this.repository.listCollectionsForUser(userId, 50);
    return { collections: rows.map((row) => this.toCollectionDto(row) as RecognitionCollection) };
  }

  async createCollection(
    userId: string,
    input: { name: string; description?: string | null },
  ): Promise<{ collection: RecognitionCollectionDetail }> {
    const collectionId = await this.repository.createCollection({
      userId,
      name: input.name.trim().slice(0, 64),
      description: input.description !== undefined && input.description !== null ? input.description.slice(0, 280) : null,
    });
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.collectionCreated,
      metadata: { collectionId },
    });
    const detail = await this.repository.findCollectionByIdForUser(collectionId, userId);
    if (detail === null) {
      throw new NotFoundError("Collection not found.", RECOGNITION_ERROR_CODES.COLLECTION_NOT_FOUND);
    }
    return { collection: this.toCollectionDto(detail) as RecognitionCollectionDetail };
  }

  private async requireCollectionDetail(userId: string, id: string) {
    const detail = await this.repository.findCollectionByIdForUser(id, userId);
    if (detail === null) {
      throw new NotFoundError("Collection not found.", RECOGNITION_ERROR_CODES.COLLECTION_NOT_FOUND);
    }
    return detail;
  }

  async getCollection(userId: string, id: string): Promise<{ collection: RecognitionCollectionDetail }> {
    const detail = await this.requireCollectionDetail(userId, id);
    return { collection: this.toCollectionDto(detail) as RecognitionCollectionDetail };
  }

  /** Deleting a collection NEVER touches the referenced assets (§41). */
  async deleteCollection(userId: string, id: string): Promise<{ ok: true }> {
    const deleted = await this.repository.deleteCollection(id, userId);
    if (!deleted) {
      throw new NotFoundError("Collection not found.", RECOGNITION_ERROR_CODES.COLLECTION_NOT_FOUND);
    }
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.collectionDeleted,
      metadata: { collectionId: id },
    });
    return { ok: true };
  }

  async addCollectionAsset(
    userId: string,
    collectionId: string,
    assetId: string,
  ): Promise<{ collection: RecognitionCollectionDetail }> {
    // Ownership boundary (§34): the collection AND the asset must be the
    // caller's — a forged asset id can never join a collection (IDOR).
    const detail = await this.requireCollectionDetail(userId, collectionId);
    const asset = await this.repository.findAssetByIdForUser(assetId, userId);
    if (asset === null) {
      throw new NotFoundError("Screenshot not found.", RECOGNITION_ERROR_CODES.ASSET_NOT_FOUND);
    }
    await this.repository.addCollectionAsset(detail.id, asset.id);
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.collectionAssetAdded,
      metadata: { collectionId: detail.id, assetId: asset.id },
    });
    const updated = await this.requireCollectionDetail(userId, detail.id);
    return { collection: this.toCollectionDto(updated) as RecognitionCollectionDetail };
  }

  async removeCollectionAsset(
    userId: string,
    collectionId: string,
    assetId: string,
  ): Promise<{ collection: RecognitionCollectionDetail }> {
    const detail = await this.requireCollectionDetail(userId, collectionId);
    await this.repository.removeCollectionAsset(detail.id, assetId);
    await this.repository.recordEvent({
      userId,
      type: OCR_EVENT_TYPES.collectionAssetRemoved,
      metadata: { collectionId: detail.id, assetId },
    });
    const updated = await this.requireCollectionDetail(userId, detail.id);
    return { collection: this.toCollectionDto(updated) as RecognitionCollectionDetail };
  }
}

/** The confirmed declaration as a field record (audit trail + post-confirmation
 * replay overlay). Draft values only — the machine never writes here. */
function draftToCorrections(draft: TradeDraftRecord): Record<string, string | null> {
  return {
    symbol: draft.symbol,
    direction: draft.direction,
    entryPrice: draft.entryPrice,
    exitPrice: draft.exitPrice,
    volume: draft.volume,
    stopLoss: draft.stopLoss,
    takeProfit: draft.takeProfit,
    profitLoss: draft.profitLoss,
    openTime: draft.openTime,
    closeTime: draft.closeTime,
  };
}

function requireValue(value: string | null): string {
  if (value === null || value.trim() === "") {
    throw new BusinessRuleError(
      "The trade draft is missing the entry price.",
      RECOGNITION_ERROR_CODES.DRAFT_INVALID,
    );
  }
  return value;
}

/** Display names are metadata only — bounded and path-neutral (§85): the
 * value never reaches a filesystem path and cannot smuggle separators. */
function sanitizeDisplayName(name: string, mime: string): string {
  const cleaned = name
    .replace(/[\r\n\t\0]/g, "")
    .replace(/[^A-Za-z0-9._ ()-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[. ]+/, "")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `screenshot.${mimeExtension(mime)}`;
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

// ── Engine field → contract field (§54/§17/§20) ─────────────────────────────

/**
 * Raw engine field → validated-shape contract field: banding + uncertainty
 * statuses. normalizedValue is trusted ONLY after the domain re-validation
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
