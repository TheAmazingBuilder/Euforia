/**
 * OCR recognition persistence (Phase 19 §24/§30/§32/§49/§50).
 *
 * Owns OcrAsset + OcrRecognition - the recognition aggregate. Discipline:
 *   - narrow row shapes cross into services (no Prisma types leak, §49);
 *   - state transitions are GUARDED single-statement updates
 *     (UPDATE … WHERE status IN (…)) so concurrent actors (§51: two tabs,
 *     delete racing completion) cannot corrupt the lifecycle;
 *   - idempotency rides on the (userId, idempotencyKey) unique constraint -
 *     a lost race is mapped back to the winning row (§32);
 *   - keyset pagination on (createdAt DESC, id DESC) - the Phase 16 house
 *     pattern (§49) - with an opaque base64url cursor;
 *   - deletion of the recognition and its (last-referenced) asset is ONE
 *     transaction (§50); the binary removal happens AFTER commit in the
 *     service (external I/O never inside a DB transaction, §50);
 *   - V2/V3 columns and tables the GENERATED client type predates (the
 *     ocr_v2/ocr_v3 migrations exist; schema.prisma lags them):
 *     requestedPlatform/mode/draft(s)/draftUpdatedAt/importedTradeId(s)/
 *     quality/reprocessedFromJobId/cancelledAt, asset perceptualHash/
 *     documentPageCount/duplicateWarned, and the OcrEvent, OcrCorrection,
 *     OcrRecognitionGroup, OcrCollectionAsset tables - are bridged through
 *     PARAMETERIZED raw SQL at the same narrow-row boundary: uuid/jsonb/
 *     boolean parameters are explicitly cast, jsonb payloads go out via
 *     JSON.stringify(...)::jsonb, and every write keeps the guarded
 *     single-statement transition discipline (§51). Where a UNIQUE race must
 *     surface as the service's P2002 replay (§32/§51), the delegate create
 *     stays the writer and raw SQL only completes the client-blind columns.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type {
  OcrClassification,
  OcrExtractedField,
  OcrFieldKey,
  OcrIssue,
  OcrQualityScore,
  OcrTimelineEntry,
} from "../../shared/contracts";
import type { TradeDraftRecord } from "../../shared/contracts";

/** Stored trade-draft JSONB shape (OcrRecognition.draft/drafts, group
 * fusedDraft) - re-exported so the service and mapper import it from here. */
export type { TradeDraftRecord } from "../../shared/contracts";

// ── Narrow row shapes ────────────────────────────────────────────────────────

export interface OcrAssetRow {
  id: string;
  userId: string;
  storageKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  /** V2 - null for PDF statements (pages carry the rendering). */
  width: number | null;
  height: number | null;
  checksumSha256: string;
  /** 64-bit dHash hex - null for rows created before the engine-quality phase. */
  phashHex: string | null;
  /** V2 - sidecar dHash of the ORIGINAL upload (duplicate verdict input). */
  perceptualHash: string | null;
  /** V2 - PDF statements: rendered page count (null for plain screenshots). */
  documentPageCount: number | null;
  /** V3 §62 - a visually similar upload was already seen for this asset. */
  duplicateWarned: boolean;
  createdAt: Date;
}

/** result JSON payload - the validated machine result (untrusted→checked). */
export interface OcrResultPayload {
  classification: unknown | null;
  fields: unknown[];
  warnings: string[];
  /** V2 - grouped per-trade reads (engine row clustering); pageIndex is
   * 0-based. Absent on the mono path and on older pipeline answers. */
  trades?: { pageIndex: number; fields: unknown[] }[] | null;
  engine: {
    name: string;
    engineVersion: string;
    pipelineVersion: string;
    contractVersion: string;
  } | null;
  durationMs: number | null;
  /** Multi-trade drafts (engine quality §2.2) - absent for the mono path. */
  candidates?: { fields: unknown[] }[] | null;
  /** Advisory duplicate flag (engine quality §2.1). */
  duplicateOf?: {
    recognitionId: string;
    createdAt: string;
    tradeId: string | null;
  } | null;
  /** Playbook tag suggestions (engine quality §3.3) - set at confirmation. */
  suggestedTags?: string[];
  /** Grouped confirmation canonical payloads (engine quality §2.2). */
  batches?: { corrections: Record<string, string | null>; include: boolean }[] | null;
  /** Observability metadata from the engine passes (engine quality §1). */
  passes?: string[];
  layoutTemplate?: string | null;
  deskewDeg?: number | null;
  /** Content-based trade duplicate flag (V2 §4) - advisory, set at processing. */
  possibleTradeDuplicate?: {
    tradeId: string;
    matchedOn: string[];
    detectedAt: string;
  } | null;
  /** Whether the recognized symbol resolved against the instrument catalog
   * (V2 §16 UNKNOWN_SYMBOL input) - null when no symbol was recognized. */
  symbolInCatalog?: boolean | null;
  /** V2 §32 - set when this row was produced by an explicit reprocess. */
  reprocessedFrom?: string | null;
}

export interface OcrRecognitionRow {
  id: string;
  userId: string;
  assetId: string;
  status: string;
  extractionProfile: string;
  pipelineVersion: string;
  idempotencyKey: string;
  result: OcrResultPayload | null;
  failureCategory: string | null;
  failureMessage: string | null;
  attempt: number;
  requestId: string | null;
  processingStartedAt: Date | null;
  processingFinishedAt: Date | null;
  corrections: Record<string, string | null> | null;
  confirmedAt: Date | null;
  /// Phase 21 - canonical Trade created from the confirmed values (§77).
  tradeId: string | null;
  /// Grouped confirmation - every imported Trade id (engine quality §2.2).
  tradeIds: string[];
  /// ACCOUNTS attachment (engine quality §3.1).
  accountId: string | null;
  /// Retention - when the stored binary was purged (engine quality §4.2).
  screenshotPurgedAt: Date | null;
  /// V2 - platform the job was REQUESTED for ("AUTO" when unspecified;
  /// NOT NULL in the table with an 'AUTO' default).
  requestedPlatform: string;
  /// V2 - requested recognition mode (NOT NULL, 'AUTOMATIC' default).
  mode: string;
  /// V2 §72 - stored draft for trade index 1 (V1 scalar mirror).
  draft: TradeDraftRecord | null;
  /// V2 §72 - stored drafts keyed by 1-based trade index.
  drafts: Record<string, TradeDraftRecord> | null;
  draftUpdatedAt: Date | null;
  /// V2 §79 - FIRST imported trade id (the idempotent replay anchor).
  importedTradeId: string | null;
  /// V2 §79 - every imported trade id, in confirmation order.
  importedTradeIds: string[] | null;
  /// V3 §28 - deterministic quality score (persisted, additive evidence).
  quality: unknown;
  /// V3 §45 - the job this row was explicitly reprocessed from.
  reprocessedFromJobId: string | null;
  /// V3 §71 - when the job was cancelled.
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  asset: OcrAssetRow;
}

const recognitionInclude = { asset: true } satisfies Prisma.OcrRecognitionInclude;

function toRecognitionRow(row: Prisma.OcrRecognitionGetPayload<{ include: typeof recognitionInclude }>): OcrRecognitionRow {
  return {
    id: row.id,
    userId: row.userId,
    assetId: row.assetId,
    status: row.status,
    extractionProfile: row.extractionProfile,
    pipelineVersion: row.pipelineVersion,
    idempotencyKey: row.idempotencyKey,
    result: (row.result as OcrResultPayload | null) ?? null,
    failureCategory: row.failureCategory,
    failureMessage: row.failureMessage,
    attempt: row.attempt,
    requestId: row.requestId,
    processingStartedAt: row.processingStartedAt,
    processingFinishedAt: row.processingFinishedAt,
    corrections: (row.corrections as Record<string, string | null> | null) ?? null,
    confirmedAt: row.confirmedAt,
    tradeId: row.tradeId,
    tradeIds: Array.isArray(row.tradeIds) ? (row.tradeIds as string[]) : [],
    accountId: row.accountId,
    screenshotPurgedAt: row.screenshotPurgedAt,
    requestedPlatform: row.requestedPlatform,
    mode: row.mode,
    draft: (row.draft as TradeDraftRecord | null) ?? null,
    drafts: (row.drafts as Record<string, TradeDraftRecord> | null) ?? null,
    draftUpdatedAt: row.draftUpdatedAt,
    importedTradeId: row.importedTradeId,
    importedTradeIds: Array.isArray(row.importedTradeIds) ? (row.importedTradeIds as string[]) : null,
    quality: row.quality ?? null,
    reprocessedFromJobId: row.reprocessedFromJobId,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    asset: {
      id: row.asset.id,
      userId: row.asset.userId,
      storageKey: row.asset.storageKey,
      originalName: row.asset.originalName,
      mime: row.asset.mime,
      sizeBytes: row.asset.sizeBytes,
      width: row.asset.width,
      height: row.asset.height,
      checksumSha256: row.asset.checksumSha256,
      phashHex: row.asset.phashHex,
      perceptualHash: row.asset.perceptualHash,
      documentPageCount: row.asset.documentPageCount,
      duplicateWarned: row.asset.duplicateWarned,
      createdAt: row.asset.createdAt,
    },
  };
}

// ── Keyset cursor (same house pattern as security events, §49) ───────────────

export function encodeOcrCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

/** Returns null for malformed cursors - callers map that to 400. */
export function decodeOcrCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) return null;
    const id = decoded.slice(separator + 1);
    if (!id) return null;
    const createdAt = new Date(decoded.slice(0, separator));
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class OcrRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAssetByChecksum(userId: string, checksumSha256: string): Promise<OcrAssetRow | null> {
    const row = await this.prisma.ocrAsset.findUnique({
      where: { userId_checksumSha256: { userId, checksumSha256 } },
    });
    return row ?? null;
  }

  /** Persist the perceptual fingerprint after processing (best-effort). */
  async setAssetPhash(assetId: string, phashHex: string): Promise<void> {
    await this.prisma.ocrAsset.update({
      where: { id: assetId },
      data: { phashHex },
      select: { id: true },
    });
  }

  /**
   * Recent perceptual hashes for the user (duplicate detection pool,
   * engine quality §2.1). Excludes the given asset (the upload's own row)
   * - the caller computes Hamming distances in JS (no native bitcount).
   */
  async recentPhashesForUser(
    userId: string,
    options: { limit: number; excludeAssetId?: string },
  ): Promise<{ assetId: string; phashHex: string }[]> {
    const rows = await this.prisma.ocrAsset.findMany({
      where: {
        userId,
        phashHex: { not: null },
        ...(options.excludeAssetId ? { id: { not: options.excludeAssetId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options.limit,
      select: { id: true, phashHex: true },
    });
    return rows.flatMap((row) =>
      row.phashHex !== null ? [{ assetId: row.id, phashHex: row.phashHex }] : [],
    );
  }

  /** Oldest recognition carrying a given asset - the duplicate target. */
  async findOldestRecognitionForAsset(assetId: string): Promise<{
    id: string;
    createdAt: Date;
    tradeId: string | null;
    status: string;
  } | null> {
    const row = await this.prisma.ocrRecognition.findFirst({
      where: { assetId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, createdAt: true, tradeId: true, status: true },
    });
    return row ?? null;
  }

  async findRecognitionByIdempotencyKey(userId: string, idempotencyKey: string): Promise<OcrRecognitionRow | null> {
    const row = await this.prisma.ocrRecognition.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: recognitionInclude,
    });
    return row ? toRecognitionRow(row) : null;
  }

  /**
   * Insert the asset row alone. The (userId, checksumSha256) unique
   * constraint is the dedup anchor (§32); a lost race surfaces as P2002 and
   * the service re-reads the winning row (§51).
   */
  async createAsset(userId: string, asset: {
    storageKey: string;
    originalName: string;
    mime: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    checksumSha256: string;
    /** engine-quality fingerprint - computed after processing (best-effort). */
    phashHex?: string | null;
    /** V2 - sidecar dHash of the ORIGINAL upload (duplicate verdict input). */
    perceptualHash: string | null;
  }): Promise<OcrAssetRow> {
    return this.prisma.ocrAsset.create({ data: { userId, ...asset } });
  }

  /**
   * Insert a recognition row for an asset. The (userId, idempotencyKey)
   * unique constraint implements §32; a lost race surfaces as P2002 and the
   * service re-reads the winner.
   */
  async createRecognition(
    asset: { id: string; userId: string },
    recognition: {
      status: string;
      extractionProfile: string;
      pipelineVersion: string;
      idempotencyKey: string;
      requestId: string | null;
      accountId?: string | null;
      /** V2 - requested platform ("AUTO" default) + mode (§68). */
      requestedPlatform: string;
      mode: string;
    },
  ): Promise<OcrRecognitionRow> {
    const created = await this.prisma.ocrRecognition.create({
      data: {
        userId: asset.userId,
        assetId: asset.id,
        status: recognition.status,
        extractionProfile: recognition.extractionProfile,
        pipelineVersion: recognition.pipelineVersion,
        idempotencyKey: recognition.idempotencyKey,
        requestId: recognition.requestId,
        accountId: recognition.accountId,
      },
      include: recognitionInclude,
    });
    return toRecognitionRow(created);
  }

  /** Lightweight status read for the SSE stream (§ engine quality 4.1). */
  async findStatusForUser(id: string, userId: string): Promise<{ id: string; status: string } | null> {
    const row = await this.prisma.ocrRecognition.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    return row ?? null;
  }

  /** Owner-scoped single read - the IDOR boundary (§39). */
  async findForUser(id: string, userId: string): Promise<OcrRecognitionRow | null> {
    const row = await this.prisma.ocrRecognition.findFirst({
      where: { id, userId },
      include: recognitionInclude,
    });
    return row ? toRecognitionRow(row) : null;
  }

  /** How many recognitions exist for this asset (V2 §32 revision counter). */
  async countRecognitionsForAsset(userId: string, assetId: string): Promise<number> {
    return this.prisma.ocrRecognition.count({ where: { userId, assetId } });
  }

  /** Keyset page (createdAt DESC, id DESC), always owner-scoped (§39). */
  async listPageForUser(
    userId: string,
    options: {
      limit: number;
      cursor: { createdAt: Date; id: string } | null;
      status: string | null;
      /** V2 §62 - detected-platform / screenshot-type jsonb path filters. */
      platform?: string | null;
      screenshotType?: string | null;
    },
  ): Promise<{ items: OcrRecognitionRow[]; nextCursor: string | null }> {
    const AND: Prisma.OcrRecognitionWhereInput[] = [];
    if (options.status !== null) AND.push({ status: options.status });
    if (options.platform) {
      AND.push({ result: { path: ["classification", "platform"], equals: options.platform } });
    }
    if (options.screenshotType) {
      AND.push({ result: { path: ["classification", "type"], equals: options.screenshotType } });
    }
    const where: Prisma.OcrRecognitionWhereInput = {
      userId,
      ...(AND.length > 0 ? { AND } : {}),
      ...(options.cursor !== null
        ? {
            OR: [
              { createdAt: { lt: options.cursor.createdAt } },
              { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.ocrRecognition.findMany({
      where,
      include: recognitionInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
    });
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    const last = page.at(-1);
    return {
      items: page.map(toRecognitionRow),
      nextCursor: hasMore && last ? encodeOcrCursor(last.createdAt, last.id) : null,
    };
  }

  /** QUEUED → PROCESSING (guarded). Returns null when the row moved on. */
  async markProcessing(id: string, requestId: string | null): Promise<Date | null> {
    const result = await this.prisma.ocrRecognition.updateMany({
      where: { id, status: { in: ["QUEUED", "PROCESSING"] } },
      data: { status: "PROCESSING", processingStartedAt: new Date(), requestId },
    });
    if (result.count === 0) return null;
    const row = await this.prisma.ocrRecognition.findUnique({ where: { id }, select: { processingStartedAt: true } });
    return row?.processingStartedAt ?? null;
  }

  /** PROCESSING → REVIEW_REQUIRED with the validated result payload. */
  async persistResult(id: string, result: OcrResultPayload): Promise<OcrRecognitionRow | null> {
    const count = await this.prisma.ocrRecognition.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "REVIEW_REQUIRED",
        result: result as unknown as Prisma.InputJsonValue,
        processingFinishedAt: new Date(),
      },
    });
    if (count.count === 0) return null;
    const row = await this.prisma.ocrRecognition.findUnique({ where: { id }, include: recognitionInclude });
    return row ? toRecognitionRow(row) : null;
  }

  /** QUEUED/PROCESSING → FAILED with a stable category (§35). */
  async persistFailure(id: string, failure: { category: string; message: string; attempt: number }): Promise<OcrRecognitionRow | null> {
    await this.prisma.ocrRecognition.updateMany({
      where: { id, status: { in: ["QUEUED", "PROCESSING"] } },
      data: {
        status: "FAILED",
        failureCategory: failure.category,
        failureMessage: failure.message,
        attempt: failure.attempt,
        processingFinishedAt: new Date(),
      },
    });
    const row = await this.prisma.ocrRecognition.findUnique({ where: { id }, include: recognitionInclude });
    return row ? toRecognitionRow(row) : null;
  }

  /**
   * REVIEW_REQUIRED → CONFIRMED inside ONE transaction (§50): the confirmed
   * corrections and the merged field payload land atomically with the state
   * flip. The guard clause makes double-confirmation impossible (§51).
   */
  async confirm(
    id: string,
    data: { corrections: Record<string, string | null>; mergedResult: OcrResultPayload },
  ): Promise<OcrRecognitionRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ocrRecognition.updateMany({
        where: { id, status: "REVIEW_REQUIRED" },
        data: {
          status: "CONFIRMED",
          corrections: data.corrections as unknown as Prisma.InputJsonValue,
          result: data.mergedResult as unknown as Prisma.InputJsonValue,
          confirmedAt: new Date(),
        },
      });
      if (updated.count === 0) return null;
      const row = await tx.ocrRecognition.findUnique({ where: { id }, include: recognitionInclude });
      return row ? toRecognitionRow(row) : null;
    });
  }

  /**
   * Phase 21 - link the canonical Trade produced by the confirmation bridge
   * and append the import warnings to the result payload. Guarded on
   * status=CONFIRMED (the link can only follow the confirmation, §76).
   * Returns the fresh row, or null when a concurrent transition won.
   */
  async linkTrade(
    id: string,
    data: { tradeId: string | null; tradeIds?: string[]; result: OcrResultPayload },
  ): Promise<OcrRecognitionRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ocrRecognition.updateMany({
        where: { id, status: "CONFIRMED" },
        data: {
          ...(data.tradeId !== null ? { tradeId: data.tradeId } : {}),
          ...(data.tradeIds !== undefined ? { tradeIds: data.tradeIds as unknown as Prisma.InputJsonValue } : {}),
          result: data.result as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count === 0) return null;
      const row = await tx.ocrRecognition.findUnique({ where: { id }, include: recognitionInclude });
      return row ? toRecognitionRow(row) : null;
    });
  }

  /**
   * Retention candidates (engine quality §4.2): CONFIRMED rows past the
   * hard window, REVIEW_REQUIRED past the 2× grace window. Never QUEUED/
   * PROCESSING (live pipeline state), never already-purged rows.
   */
  async findPurgeable(
    hardCutoff: Date,
    graceCutoff: Date,
    limit: number,
  ): Promise<{ id: string; storageKey: string | null; sizeBytes: number }[]> {
    const rows = await this.prisma.ocrRecognition.findMany({
      where: {
        screenshotPurgedAt: null,
        OR: [
          { status: "CONFIRMED", createdAt: { lt: hardCutoff } },
          { status: "FAILED", createdAt: { lt: hardCutoff } },
          { status: "REVIEW_REQUIRED", createdAt: { lt: graceCutoff } },
        ],
      },
      select: { id: true, asset: { select: { storageKey: true, sizeBytes: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      storageKey: row.asset.storageKey,
      sizeBytes: row.asset.sizeBytes,
    }));
  }

  /** Stamp the row as purged (guarded: never stamps the same row twice). */
  async markScreenshotPurged(id: string): Promise<boolean> {
    const result = await this.prisma.ocrRecognition.updateMany({
      where: { id, screenshotPurgedAt: null },
      data: { screenshotPurgedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Attach/detach the ACCOUNTS target (engine quality §3.1). Owner-checked upstream. */
  async attachAccount(id: string, accountId: string | null): Promise<void> {
    await this.prisma.ocrRecognition.updateMany({
      where: { id },
      data: { accountId },
    });
  }

  /** PDF statements learn their real pixel size from the engine render (§4.3). */
  async updateAssetDimensions(assetId: string, width: number, height: number): Promise<void> {
    await this.prisma.ocrAsset.update({
      where: { id: assetId },
      data: { width, height },
      select: { id: true },
    });
  }

  /** Corrections memory - upsert the (field, raw → corrected) patterns (§2.3). */
  async upsertCorrectionPatterns(
    userId: string,
    entries: { fieldKey: string; rawValue: string; correctedValue: string }[],
  ): Promise<void> {
    const now = new Date();
    for (const entry of entries) {
      await this.prisma.ocrCorrectionPattern.upsert({
        where: {
          userId_fieldKey_rawValue_correctedValue: {
            userId,
            fieldKey: entry.fieldKey,
            rawValue: entry.rawValue,
            correctedValue: entry.correctedValue,
          },
        },
        create: {
          userId,
          fieldKey: entry.fieldKey,
          rawValue: entry.rawValue,
          correctedValue: entry.correctedValue,
          count: 1,
          lastSeenAt: now,
        },
        update: { count: { increment: 1 }, lastSeenAt: now },
      });
    }
  }

  /**
   * Best suggestion per (fieldKey, rawValue) for the given machine readings -
   * ordered by recurrence; advisory only (§21: never auto-applied).
   */
  async findSuggestionsForRawValues(
    userId: string,
    items: { fieldKey: string; rawValue: string }[],
  ): Promise<Map<string, { value: string; occurrences: number }>> {
    if (items.length === 0) return new Map();
    const rows = await this.prisma.ocrCorrectionPattern.findMany({
      where: {
        userId,
        OR: items.map((item) => ({ fieldKey: item.fieldKey, rawValue: item.rawValue })),
      },
      orderBy: [{ count: "desc" }, { lastSeenAt: "desc" }],
      take: 200,
    });
    const best = new Map<string, { value: string; occurrences: number }>();
    for (const row of rows) {
      const key = `${row.fieldKey}\u0000${row.rawValue}`;
      const current = best.get(key);
      if (!current || row.count > current.occurrences) {
        best.set(key, { value: row.correctedValue, occurrences: row.count });
      }
    }
    return best;
  }

  /**
   * Delete the recognition; when no sibling recognition still references the
   * asset, delete the asset row too. Returns the storage key whose BINARY
   * the service must remove after commit (never inside the transaction, §50).
   * The linked Trade (tradeId) is NEVER touched - one-way provenance (§77).
   */
  async deleteForUser(id: string, userId: string): Promise<{ storageKey: string | null; deleted: boolean } | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ocrRecognition.findFirst({
        where: { id, userId },
        include: { asset: { include: { _count: { select: { recognitions: true } } } } },
      });
      if (!row) return null;
      await tx.ocrRecognition.delete({ where: { id: row.id } });
      const remaining = await tx.ocrRecognition.count({ where: { assetId: row.assetId } });
      if (remaining === 0) {
        await tx.ocrAsset.delete({ where: { id: row.assetId } });
        return { storageKey: row.asset.storageKey, deleted: true };
      }
      return { storageKey: null, deleted: true };
    });
  }

  // ── OcrRecognitionOpsRepository (folded into OcrRepository - the service injects ONE repository) ──

  /** Append one funnel/audit event (V2 analytics backbone). Best-effort by
   * contract: the service never lets event failures break the pipeline. */
  async recordEvent(input: OcrEventInput): Promise<void> {
    await this.prisma.ocrEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        recognitionId: input.recognitionId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Count the user's events per type inside the analytics window. */
  async countEventsByType(userId: string, since: Date): Promise<Array<{ type: string; count: number }>> {
    const grouped = await this.prisma.ocrEvent.groupBy({
      by: ["type"],
      where: { userId, createdAt: { gte: since } },
      _count: { type: true },
    });
    return grouped.map((entry) => ({ type: entry.type, count: entry._count.type }));
  }

  /** Sum one numeric metadata key over one event type (e.g. imported trades). */
  async sumEventMetadata(userId: string, since: Date, type: string, key: string): Promise<number> {
    const events = await this.prisma.ocrEvent.findMany({
      where: { userId, type, createdAt: { gte: since } },
      select: { metadata: true },
    });
    let total = 0;
    for (const event of events) {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      const value = metadata[key];
      if (typeof value === "number" && Number.isFinite(value)) total += value;
    }
    return total;
  }

  /** Per-day activity for the analytics chart (uploads vs confirmed imports). */
  async listPerDayActivity(userId: string, since: Date): Promise<Array<{ date: string; uploads: number; confirmed: number }>> {
    const events = await this.prisma.ocrEvent.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        type: { in: ["recognition_upload_completed", "recognition_import_confirmed"] },
      },
      select: { type: true, createdAt: true },
    });
    const byDay = new Map<string, { uploads: number; confirmed: number }>();
    for (const event of events) {
      const key = event.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? { uploads: 0, confirmed: 0 };
      if (event.type === "recognition_upload_completed") bucket.uploads += 1;
      else bucket.confirmed += 1;
      byDay.set(key, bucket);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, counts]) => ({ date, ...counts }));
  }

  /** Average processing time / overall confidence over completed jobs. */
  async performanceAggregates(userId: string, since: Date): Promise<{ avgProcessingMs: number | null; avgOverallConfidence: number | null }> {
    const rows = await this.prisma.ocrRecognition.findMany({
      where: {
        userId,
        status: { in: ["REVIEW_REQUIRED", "CONFIRMED"] },
        processingFinishedAt: { gte: since },
      },
      select: { processingStartedAt: true, processingFinishedAt: true, quality: true },
    });
    let msTotal = 0;
    let msCount = 0;
    let confTotal = 0;
    let confCount = 0;
    for (const row of rows) {
      if (row.processingStartedAt !== null && row.processingFinishedAt !== null) {
        msTotal += Math.max(0, row.processingFinishedAt.getTime() - row.processingStartedAt.getTime());
        msCount += 1;
      }
      const quality = row.quality as { overall?: unknown } | null;
      const overall = typeof quality?.overall === "number" ? quality.overall : null;
      if (overall !== null) {
        confTotal += overall;
        confCount += 1;
      }
    }
    return {
      avgProcessingMs: msCount > 0 ? Math.round(msTotal / msCount) : null,
      avgOverallConfidence: confCount > 0 ? Math.round(confTotal / confCount) : null,
    };
  }

  // ── OcrCorrectionsRepository (folded into OcrRepository - the service injects ONE repository) ──

  /** Record one observed correction (unique per user+field+raw+corrected -
   * the useCount increments instead of duplicating the row). */
  async recordCorrection(input: CorrectionInput): Promise<void> {
    if (input.rawValue === null) {
      // A nullable unique component cannot ride the compound where - the
      // null-raw case (user added a value the machine never read) is the
      // rare branch and takes the explicit find-then-write path.
      const existing = await this.prisma.ocrCorrection.findFirst({
        where: {
          userId: input.userId,
          field: input.field,
          rawValue: null,
          correctedValue: input.correctedValue,
        },
        select: { id: true },
      });
      if (existing === null) {
        await this.prisma.ocrCorrection.create({
          data: {
            userId: input.userId,
            field: input.field,
            platform: input.platform,
            rawValue: null,
            correctedValue: input.correctedValue,
            lastRecognitionId: input.lastRecognitionId,
          },
        });
      } else {
        await this.prisma.ocrCorrection.update({
          where: { id: existing.id },
          data: { useCount: { increment: 1 }, platform: input.platform, lastRecognitionId: input.lastRecognitionId },
        });
      }
      return;
    }
    await this.prisma.ocrCorrection.upsert({
      where: {
        userId_field_rawValue_correctedValue: {
          userId: input.userId,
          field: input.field,
          rawValue: input.rawValue,
          correctedValue: input.correctedValue,
        },
      },
      create: {
        userId: input.userId,
        field: input.field,
        platform: input.platform,
        rawValue: input.rawValue,
        correctedValue: input.correctedValue,
        lastRecognitionId: input.lastRecognitionId,
      },
      update: {
        useCount: { increment: 1 },
        platform: input.platform,
        lastRecognitionId: input.lastRecognitionId,
      },
    });
  }

  /** The user's correction memory (suggestion ranking input, most-recent-first). */
  async listCorrectionsForUser(userId: string, take: number): Promise<Array<{ field: string; correctedValue: string; useCount: number }>> {
    const rows = await this.prisma.ocrCorrection.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take,
      select: { field: true, correctedValue: true, useCount: true },
    });
    return rows;
  }

  /** Correction totals per field inside the analytics window. */
  async countCorrectionWindow(userId: string, since: Date): Promise<Array<{ field: string; corrected: number }>> {
    const grouped = await this.prisma.ocrCorrection.groupBy({
      by: ["field"],
      where: { userId, updatedAt: { gte: since } },
      _count: { field: true },
      _sum: { useCount: true },
    });
    return grouped.map((entry) => ({
      field: entry.field,
      corrected: entry._sum.useCount ?? entry._count.field,
    }));
  }

  // ── OcrDuplicateRepository (folded into OcrRepository - the service injects ONE repository) ──

  /** Recent perceptual-hash anchors (V2 duplicate pool, closest-match scan). */
  async listRecentHashedAssets(userId: string, take: number): Promise<Array<{ assetId: string; perceptualHash: string }>> {
    const rows = await this.prisma.ocrAsset.findMany({
      where: { userId, perceptualHash: { not: null } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, perceptualHash: true },
    });
    return rows.flatMap((row) =>
      row.perceptualHash !== null ? [{ assetId: row.id, perceptualHash: row.perceptualHash }] : [],
    );
  }

  /** The most recent recognition over one asset (duplicate verdict context). */
  async findLatestRecognitionForAsset(
    assetId: string,
  ): Promise<(OcrRecognitionRow & { asset: OcrAssetRow }) | null> {
    const row = await this.prisma.ocrRecognition.findFirst({
      where: { assetId },
      orderBy: { createdAt: "desc" },
      include: { asset: true },
    });
    return row === null ? null : toRecognitionRow(row);
  }

  /** Every trade imported from recognitions over one asset (§62 replay aid). */
  async listImportedTradeIdsForAsset(userId: string, assetId: string): Promise<string[]> {
    const rows = await this.prisma.ocrRecognition.findMany({
      where: { userId, assetId, importedTradeId: { not: null } },
      select: { importedTradeId: true, importedTradeIds: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.importedTradeId !== null) ids.add(row.importedTradeId);
      const batch = Array.isArray(row.importedTradeIds) ? (row.importedTradeIds as string[]) : [];
      for (const id of batch) ids.add(id);
    }
    return [...ids];
  }

  async findAssetByIdForUser(assetId: string, userId: string): Promise<OcrAssetRow | null> {
    const row = await this.prisma.ocrAsset.findFirst({ where: { id: assetId, userId } });
    return row ?? null;
  }

  /** Backfill the anchor for assets stored before V2 (best-effort). */
  async updateAssetPerceptualHash(assetId: string, perceptualHash: string): Promise<void> {
    await this.prisma.ocrAsset.update({
      where: { id: assetId },
      data: { perceptualHash },
      select: { id: true },
    });
  }

  async updateAssetPageCount(assetId: string, documentPageCount: number): Promise<void> {
    await this.prisma.ocrAsset.update({
      where: { id: assetId },
      data: { documentPageCount },
      select: { id: true },
    });
  }

  /** V3 §62 - the duplicate warning is a persistent ASSET facet. */
  async markAssetDuplicateWarned(assetId: string): Promise<void> {
    await this.prisma.ocrAsset.update({
      where: { id: assetId },
      data: { duplicateWarned: true },
      select: { id: true },
    });
  }

  // ── OcrRecognitionLifecycleRepository (folded into OcrRepository - the service injects ONE repository) ──

  /** Guarded cancel - only a QUEUED/PROCESSING job can be cancelled (§71). */
  async markCancelled(id: string): Promise<OcrRecognitionRow | null> {
    const row = await this.prisma.ocrRecognition.updateMany({
      where: { id, status: { in: ["QUEUED", "PROCESSING"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (row.count === 0) return null;
    const updated = await this.prisma.ocrRecognition.findFirst({ where: { id }, include: { asset: true } });
    return updated === null ? null : toRecognitionRow(updated);
  }

  /** Guarded result rewrite - recrop merges land only on reviewable rows. */
  async updateResult(id: string, result: OcrResultPayload): Promise<OcrRecognitionRow | null> {
    const row = await this.prisma.ocrRecognition.updateMany({
      where: { id, status: { in: ["REVIEW_REQUIRED", "PROCESSING"] } },
      data: { result: result as unknown as Prisma.InputJsonValue },
    });
    if (row.count === 0) return null;
    const updated = await this.prisma.ocrRecognition.findFirst({ where: { id }, include: { asset: true } });
    return updated === null ? null : toRecognitionRow(updated);
  }

  /** Persist the deterministic quality score (additive, never a gate). */
  async updateQuality(id: string, quality: unknown): Promise<void> {
    await this.prisma.ocrRecognition.updateMany({
      where: { id },
      data: { quality: quality as Prisma.InputJsonValue },
    });
  }

  /**
   * V2 §72 - store the validated draft for ONE trade index. The drafts map
   * is the per-trade source of truth; index 1 mirrors into the V1 scalar
   * `draft` column so the single-trade flow keeps its fast read.
   */
  async saveDraftAtIndex(id: string, tradeIndex: number, draft: TradeDraftRecord): Promise<OcrRecognitionRow | null> {
    const existing = await this.prisma.ocrRecognition.findFirst({
      where: { id, status: { in: ["REVIEW_REQUIRED", "PROCESSING"] } },
      select: { drafts: true },
    });
    if (existing === null) return null;
    const drafts = (existing.drafts as Record<string, TradeDraftRecord> | null) ?? {};
    drafts[String(tradeIndex)] = draft;
    const updated = await this.prisma.ocrRecognition.updateMany({
      where: { id, status: { in: ["REVIEW_REQUIRED", "PROCESSING"] } },
      data: {
        drafts: drafts as unknown as Prisma.InputJsonValue,
        draft: tradeIndex === 1 ? (draft as unknown as Prisma.InputJsonValue) : undefined,
        draftUpdatedAt: new Date(),
      },
    });
    if (updated.count === 0) return null;
    const row = await this.prisma.ocrRecognition.findFirst({ where: { id }, include: { asset: true } });
    return row === null ? null : toRecognitionRow(row);
  }

  /**
   * §79 at-most-one-import mutex: guarded flip to CONFIRMED carrying the
   * resolved per-trade corrections. Null = a concurrent confirm won.
   */
  async reserveConfirmation(id: string, corrections: Record<string, string | null>): Promise<OcrRecognitionRow | null> {
    const row = await this.prisma.ocrRecognition.updateMany({
      where: { id, status: { in: ["REVIEW_REQUIRED", "PROCESSING"] } },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        corrections: corrections as unknown as Prisma.InputJsonValue,
      },
    });
    if (row.count === 0) return null;
    const updated = await this.prisma.ocrRecognition.findFirst({ where: { id }, include: { asset: true } });
    return updated === null ? null : toRecognitionRow(updated);
  }

  /** §146 rollback - back to REVIEW_REQUIRED so the user can fix and retry. */
  async rollbackConfirmation(id: string): Promise<void> {
    await this.prisma.ocrRecognition.updateMany({
      where: { id, status: "CONFIRMED", tradeId: null, importedTradeId: null },
      data: { status: "REVIEW_REQUIRED", confirmedAt: null },
    });
  }

  /** §79 - persist every imported trade id after a successful multi-import. */
  async finalizeImportMulti(id: string, tradeIds: string[]): Promise<void> {
    await this.prisma.ocrRecognition.updateMany({
      where: { id, status: "CONFIRMED" },
      data: {
        importedTradeIds: tradeIds as unknown as Prisma.InputJsonValue,
        importedTradeId: tradeIds[0] ?? null,
        tradeId: tradeIds[0] ?? null,
      },
    });
  }

  /** §45 - record the reprocess lineage (the job this row was re-read from). */
  async attachReprocessLineage(newRecognitionId: string, sourceRecognitionId: string): Promise<void> {
    await this.prisma.ocrRecognition.updateMany({
      where: { id: newRecognitionId },
      data: { reprocessedFromJobId: sourceRecognitionId },
    });
  }

  /** V2 §62 - server-side history list (no filters, newest first). */
  async listLatestForUser(userId: string, take: number): Promise<OcrRecognitionRow[]> {
    const rows = await this.prisma.ocrRecognition.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      include: { asset: true },
    });
    return rows.map(toRecognitionRow);
  }

  /** V2 §62 - server-side history filters (status/platform/mime/duplicate/window). */
  async listLatestForUserFiltered(
    userId: string,
    filters: {
      limit: number;
      status: string[] | null;
      platform: string | null;
      mimeType: string | null;
      duplicate: boolean | null;
      from: Date | null;
      to: Date | null;
    },
  ): Promise<OcrRecognitionRow[]> {
    const rows = await this.prisma.ocrRecognition.findMany({
      where: {
        userId,
        ...(filters.status !== null ? { status: { in: filters.status } } : {}),
        ...(filters.platform !== null ? { requestedPlatform: filters.platform } : {}),
        ...(filters.mimeType !== null ? { asset: { mime: filters.mimeType } } : {}),
        ...(filters.duplicate !== null ? { asset: { duplicateWarned: filters.duplicate } } : {}),
        ...(filters.from !== null || filters.to !== null
          ? { createdAt: { ...(filters.from !== null ? { gte: filters.from } : {}), ...(filters.to !== null ? { lte: filters.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      include: { asset: true },
    });
    return rows.map(toRecognitionRow);
  }

  /**
   * §4 retention - delete recognitions older than the cutoff (one
   * transaction), returning the storage keys of assets whose LAST reference
   * disappeared (binary removal happens AFTER commit in the service).
   */
  async deleteExpiredRecognitions(cutoff: Date): Promise<{ storageKeys: string[]; recognitions: number }> {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.ocrRecognition.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true, assetId: true },
        take: 500,
      });
      if (expired.length === 0) return { storageKeys: [], recognitions: 0 };
      const ids = expired.map((row) => row.id);
      await tx.ocrRecognition.deleteMany({ where: { id: { in: ids } } });
      // Assets whose last reference disappeared join the sweep.
      const assetIds = [...new Set(expired.map((row) => row.assetId))];
      const storageKeys: string[] = [];
      for (const assetId of assetIds) {
        const remaining = await tx.ocrRecognition.count({ where: { assetId } });
        if (remaining === 0) {
          const asset = await tx.ocrAsset.findUnique({ where: { id: assetId }, select: { storageKey: true } });
          if (asset !== null) {
            await tx.ocrAsset.delete({ where: { id: assetId } });
            storageKeys.push(asset.storageKey);
          }
        }
      }
      return { storageKeys, recognitions: ids.length };
    });
  }

  /** Instrument catalog prefix search (V2 suggestions, read-only). */
  async findInstrumentsBySymbolPrefix(prefix: string, take: number): Promise<Array<{ symbol: string; name: string; assetClass: string }>> {
    const rows = await this.prisma.instrument.findMany({
      where: { symbol: { startsWith: prefix }, isActive: true },
      orderBy: { symbol: "asc" },
      take,
      select: { symbol: true, name: true, assetClass: true },
    });
    return rows;
  }

  /** §37 - storage footprint of one user's uploads. */
  async assetStorageStats(userId: string): Promise<{ assetsCount: number; totalBytes: number; oldestUploadAt: Date | null }> {
    const [assetsCount, aggregate] = await this.prisma.$transaction([
      this.prisma.ocrAsset.count({ where: { userId } }),
      this.prisma.ocrAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true }, _min: { createdAt: true } }),
    ]);
    return {
      assetsCount,
      totalBytes: aggregate._sum.sizeBytes ?? 0,
      oldestUploadAt: aggregate._min.createdAt ?? null,
    };
  }

  // ── OcrGroupRepository (folded into OcrRepository - the service injects ONE repository) ──

  /** §31 - persist the fused group (the fusion outcome is computed in the
   * service; this is the pure write). */
  async createGroup(input: {
    userId: string;
    status: string;
    memberJobIds: string[];
    evidence: unknown;
    fusionConfidence: number;
    autoConfirmed: boolean;
    fusedDraft: TradeDraftRecord | null;
    fieldOrigins: Record<string, string>;
    conflicts: unknown;
    timeline: unknown;
    quality: unknown;
  }): Promise<OcrGroupRow> {
    const row = await this.prisma.ocrRecognitionGroup.create({
      data: {
        userId: input.userId,
        status: input.status,
        memberJobIds: input.memberJobIds as unknown as Prisma.InputJsonValue,
        evidence: (input.evidence ?? undefined) as Prisma.InputJsonValue | undefined,
        fusionConfidence: input.fusionConfidence,
        autoConfirmed: input.autoConfirmed,
        fusedDraft: (input.fusedDraft ?? undefined) as Prisma.InputJsonValue | undefined,
        fieldOrigins: (input.fieldOrigins ?? undefined) as Prisma.InputJsonValue | undefined,
        conflicts: (input.conflicts ?? undefined) as Prisma.InputJsonValue | undefined,
        timeline: (input.timeline ?? undefined) as Prisma.InputJsonValue | undefined,
        quality: (input.quality ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return toGroupRow(row);
  }

  async findGroupByIdForUser(id: string, userId: string): Promise<OcrGroupRow | null> {
    const row = await this.prisma.ocrRecognitionGroup.findFirst({ where: { id, userId } });
    return row === null ? null : toGroupRow(row);
  }

  async listGroupsForUser(userId: string, take: number): Promise<OcrGroupRow[]> {
    const rows = await this.prisma.ocrRecognitionGroup.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map(toGroupRow);
  }

  /** Guarded fused-draft save - CONFIRMED/DISCARDED groups are frozen. */
  async saveGroupDraft(id: string, draft: TradeDraftRecord): Promise<OcrGroupRow | null> {
    const row = await this.prisma.ocrRecognitionGroup.updateMany({
      where: { id, status: { in: ["PROPOSED", "ACTIVE"] } },
      data: {
        fusedDraft: draft as unknown as Prisma.InputJsonValue,
      },
    });
    if (row.count === 0) return null;
    const updated = await this.prisma.ocrRecognitionGroup.findFirst({ where: { id } });
    return updated === null ? null : toGroupRow(updated);
  }

  /** §51 at-most-one-import mutex for groups (guarded flip to CONFIRMED). */
  async reserveGroupConfirmation(id: string): Promise<OcrGroupRow | null> {
    const row = await this.prisma.ocrRecognitionGroup.updateMany({
      where: { id, status: { in: ["PROPOSED", "ACTIVE"] } },
      data: { status: "CONFIRMED" },
    });
    if (row.count === 0) return null;
    const updated = await this.prisma.ocrRecognitionGroup.findFirst({ where: { id } });
    return updated === null ? null : toGroupRow(updated);
  }

  /** §146 rollback - back to ACTIVE so the fused draft can be fixed. */
  async rollbackGroupConfirmation(id: string): Promise<void> {
    await this.prisma.ocrRecognitionGroup.updateMany({
      where: { id, status: "CONFIRMED", importedTradeId: null },
      data: { status: "ACTIVE" },
    });
  }

  async finalizeGroupImport(id: string, tradeId: string): Promise<void> {
    await this.prisma.ocrRecognitionGroup.updateMany({
      where: { id, status: "CONFIRMED" },
      data: { importedTradeId: tradeId },
    });
  }

  /** Dissolve - every member recognition stays intact (§15). */
  async discardGroup(id: string): Promise<void> {
    await this.prisma.ocrRecognitionGroup.updateMany({
      where: { id, status: { in: ["PROPOSED", "ACTIVE"] } },
      data: { status: "DISCARDED" },
    });
  }

  // ── OcrAssetCollectionRepository (folded into OcrRepository - the service injects ONE repository) ──

  async createCollection(input: { userId: string; name: string; description: string | null }): Promise<string> {
    const row = await this.prisma.ocrCollection.create({
      data: { userId: input.userId, name: input.name, description: input.description },
      select: { id: true },
    });
    return row.id;
  }

  async findCollectionByIdForUser(id: string, userId: string): Promise<OcrCollectionDetailRow | null> {
    const row = await this.prisma.ocrCollection.findFirst({
      where: { id, userId },
      include: { assets: { include: { asset: true }, orderBy: { addedAt: "asc" }, take: COLLECTION_ASSET_LIMIT } },
    });
    return row === null ? null : toCollectionDetailRow(row);
  }

  async listCollectionsForUser(userId: string, take: number): Promise<OcrCollectionDetailRow[]> {
    const rows = await this.prisma.ocrCollection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      include: { assets: { include: { asset: true }, orderBy: { addedAt: "asc" }, take: COLLECTION_ASSET_LIMIT } },
    });
    return rows.map(toCollectionDetailRow);
  }

  /** Idempotent membership (composite PK collectionId+assetId). */
  async addCollectionAsset(collectionId: string, assetId: string): Promise<void> {
    await this.prisma.ocrCollectionAsset.upsert({
      where: { collectionId_assetId: { collectionId, assetId } },
      create: { collectionId, assetId },
      update: {},
    });
  }

  async removeCollectionAsset(collectionId: string, assetId: string): Promise<void> {
    await this.prisma.ocrCollectionAsset.deleteMany({
      where: { collectionId, assetId },
    });
  }

  /** Deleting a collection NEVER touches the referenced assets (§41). */
  async deleteCollection(id: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.ocrCollection.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }
}


// ── V2 - recognition sets (multi-screenshot fusion) ─────────────────────────

export interface OcrSetItemRow {
  setId: string;
  recognitionId: string;
  order: number;
}

export interface OcrSetRow {
  id: string;
  userId: string;
  status: string;
  result: OcrSetFusedPayload | null;
  corrections: Record<string, string | null> | null;
  confirmedAt: Date | null;
  tradeId: string | null;
  tradeIds: string[];
  accountId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OcrSetItemRow[];
}

const setInclude = {
  items: { orderBy: { order: "asc" as const } },
} satisfies Prisma.OcrSetInclude;

function toSetRow(row: Prisma.OcrSetGetPayload<{ include: typeof setInclude }>): OcrSetRow {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    result: (row.result as OcrSetFusedPayload | null) ?? null,
    corrections: (row.corrections as Record<string, string | null> | null) ?? null,
    confirmedAt: row.confirmedAt,
    tradeId: row.tradeId,
    tradeIds: (row.tradeIds as string[] | null) ?? [],
    accountId: row.accountId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      setId: item.setId,
      recognitionId: item.recognitionId,
      order: item.order,
    })),
  };
}

export interface OcrSetFusedPayload {
  fields: OcrExtractedField[];
  conflicts: {
    field: OcrFieldKey;
    values: { value: string; recognitionId: string }[];
  }[];
  issues: OcrIssue[];
  qualityScore: OcrQualityScore | null;
  timeline: OcrTimelineEntry[];
  coherent: boolean;
  /** Reading-order first member's classification (documented in fusion.logic). */
  classification: OcrClassification | null;
  possibleTradeDuplicate?: {
    tradeId: string;
    matchedOn: string[];
    detectedAt: string;
  } | null;
  symbolInCatalog?: boolean | null;
}

@Injectable()
export class OcrSetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSetWithItems(userId: string, recognitionIds: string[]): Promise<OcrSetRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      const set = await tx.ocrSet.create({ data: { userId, status: "REVIEW_REQUIRED" } });
      await tx.ocrSetItem.createMany({
        data: recognitionIds.map((recognitionId, order) => ({
          setId: set.id,
          recognitionId,
          order,
        })),
      });
      return set;
    });
    return this.findForUser(row.id, userId) as Promise<OcrSetRow>;
  }

  async findForUser(id: string, userId: string): Promise<OcrSetRow | null> {
    const row = await this.prisma.ocrSet.findFirst({
      where: { id, userId },
      include: setInclude,
    });
    return row ? toSetRow(row) : null;
  }

  /** Every member recognition row (owner-checked via the set membership). */
  async findMemberRecognitions(setId: string, userId: string): Promise<OcrRecognitionRow[]> {
    const rows = await this.prisma.ocrRecognition.findMany({
      where: { userId, setItem: { setId } },
      include: recognitionInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toRecognitionRow);
  }

  /** Keyset page for the set list (V2 §62 - sets in the history surface). */
  async listSetsPageForUser(
    userId: string,
    input: { limit: number; cursor: { createdAt: Date; id: string } | null },
  ): Promise<{ items: OcrSetRow[]; nextCursor: string | null }> {
    const rows = await this.prisma.ocrSet.findMany({
      where: {
        userId,
        ...(input.cursor
          ? { createdAt: { lt: input.cursor.createdAt } }
          : {}),
      },
      include: setInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toSetRow),
      nextCursor: hasMore && last ? encodeOcrCursor(last.createdAt, last.id) : null,
    };
  }

  async updateSetResult(id: string, result: OcrSetFusedPayload): Promise<void> {
    await this.prisma.ocrSet.update({
      where: { id },
      data: { result: result as unknown as Prisma.InputJsonValue },
    });
  }

  /**
   * Guarded confirmation transition (§51 discipline) - only REVIEW_REQUIRED
   * rows confirm, in one transaction with the trade links.
   */
  async confirmSet(
    id: string,
    data: {
      corrections: Record<string, string | null>;
      result: OcrSetFusedPayload;
      tradeId: string | null;
      tradeIds: string[];
      accountId?: string | null;
    },
  ): Promise<OcrSetRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ocrSet.updateMany({
        where: { id, status: "REVIEW_REQUIRED" },
        data: {
          status: "CONFIRMED",
          corrections: data.corrections,
          result: data.result as unknown as Prisma.InputJsonValue,
          confirmedAt: new Date(),
          tradeId: data.tradeId,
          tradeIds: data.tradeIds,
          ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        },
      });
      if (updated.count === 0) return null;
      const row = await tx.ocrSet.findUnique({ where: { id }, include: setInclude });
      return row ? toSetRow(row) : null;
    });
  }

  /** Attach the ACCOUNTS target at confirm time (engine quality §3.1). */
  async attachSetAccount(id: string, accountId: string | null): Promise<void> {
    await this.prisma.ocrSet.update({ where: { id }, data: { accountId } });
  }

  /** Set rows survive member recognitions: only the set + its items go. */
  async deleteSetForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.ocrSet.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }
}

// ── V2 §28 - screenshot collections ─────────────────────────────────────────

export interface OcrCollectionItemRow {
  recognitionId: string;
  addedAt: Date;
}

export interface OcrCollectionRow {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  items: OcrCollectionItemRow[];
}

const collectionInclude = {
  items: { orderBy: { addedAt: "desc" as const } },
} satisfies Prisma.OcrCollectionInclude;

function toCollectionRow(
  row: Prisma.OcrCollectionGetPayload<{ include: typeof collectionInclude }>,
): OcrCollectionRow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      recognitionId: item.recognitionId,
      addedAt: item.addedAt,
    })),
  };
}

@Injectable()
export class OcrCollectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name: string): Promise<OcrCollectionRow> {
    const row = await this.prisma.ocrCollection.create({ data: { userId, name }, include: collectionInclude });
    return toCollectionRow(row);
  }

  async findByName(userId: string, name: string): Promise<OcrCollectionRow | null> {
    const row = await this.prisma.ocrCollection.findFirst({ where: { userId, name }, include: collectionInclude });
    return row ? toCollectionRow(row) : null;
  }

  async findForUser(id: string, userId: string): Promise<OcrCollectionRow | null> {
    const row = await this.prisma.ocrCollection.findFirst({ where: { id, userId }, include: collectionInclude });
    return row ? toCollectionRow(row) : null;
  }

  async listForUser(userId: string): Promise<OcrCollectionRow[]> {
    const rows = await this.prisma.ocrCollection.findMany({
      where: { userId },
      include: collectionInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100,
    });
    return rows.map(toCollectionRow);
  }

  /** Duplicate membership is an idempotent no-op (unique constraint ride). */
  async addItem(collectionId: string, recognitionId: string): Promise<void> {
    await this.prisma.ocrCollectionItem
      .create({ data: { collectionId, recognitionId } })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
        throw error;
      });
  }

  async removeItem(collectionId: string, recognitionId: string): Promise<boolean> {
    const deleted = await this.prisma.ocrCollectionItem.deleteMany({
      where: { collectionId, recognitionId },
    });
    return deleted.count > 0;
  }

  /** The set + membership rows go; recognitions and binaries stay (§28). */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.ocrCollection.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RECONCILIATION - the V2/V3 recognition surfaces (jobs history filters,
// drafts per trade index, confirmation mutex + rollback, groups, asset
// collections, corrections memory, event ledger, retention) against the
// OcrRecognitionGroup / OcrCorrection / OcrEvent / OcrCollectionAsset tables.
// Same discipline as above: narrow rows, ownership in every WHERE, guarded
// single-statement transitions, $transaction for multi-write.
// ════════════════════════════════════════════════════════════════════════════

/** Narrow group row (OcrRecognitionGroup) - JSON payloads typed pragmatically. */
export interface OcrGroupRow {
  id: string;
  userId: string;
  status: string;
  memberJobIds: string[];
  evidence: unknown;
  fusionConfidence: number;
  autoConfirmed: boolean;
  fusedDraft: TradeDraftRecord | null;
  fieldOrigins: Record<string, string> | null;
  conflicts: unknown;
  timeline: unknown;
  quality: unknown;
  importedTradeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toGroupRow(row: Prisma.OcrRecognitionGroupGetPayload<null>): OcrGroupRow {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    memberJobIds: Array.isArray(row.memberJobIds) ? (row.memberJobIds as string[]) : [],
    evidence: row.evidence ?? null,
    fusionConfidence: row.fusionConfidence,
    autoConfirmed: row.autoConfirmed,
    fusedDraft: (row.fusedDraft as TradeDraftRecord | null) ?? null,
    fieldOrigins: (row.fieldOrigins as Record<string, string> | null) ?? null,
    conflicts: row.conflicts ?? null,
    timeline: row.timeline ?? null,
    quality: row.quality ?? null,
    importedTradeId: row.importedTradeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** V3 collection row - the collection + its member assets (bounded reads). */
export interface OcrCollectionDetailRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  assetsCount: number;
  createdAt: Date;
  updatedAt: Date;
  assets: OcrAssetRow[];
}

const COLLECTION_ASSET_LIMIT = 200;

function toCollectionDetailRow(
  row: Prisma.OcrCollectionGetPayload<{ include: { assets: { include: { asset: true } } } }>,
): OcrCollectionDetailRow {
  const links = Array.isArray(row.assets) ? row.assets : [];
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    assetsCount: links.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assets: links.map((link) => ({
      id: link.asset.id,
      userId: link.asset.userId,
      storageKey: link.asset.storageKey,
      originalName: link.asset.originalName,
      mime: link.asset.mime,
      sizeBytes: link.asset.sizeBytes,
      width: link.asset.width,
      height: link.asset.height,
      checksumSha256: link.asset.checksumSha256,
      phashHex: link.asset.phashHex,
      perceptualHash: link.asset.perceptualHash,
      documentPageCount: link.asset.documentPageCount,
      duplicateWarned: link.asset.duplicateWarned,
      createdAt: link.asset.createdAt,
    })),
  };
}

// ── Corrections memory (V2 §21/§27) ──────────────────────────────────────────

type CorrectionInput = {
  userId: string;
  field: string;
  platform: string;
  rawValue: string | null;
  correctedValue: string;
  lastRecognitionId: string | null;
};

// ── Event ledger (V2 analytics) ──────────────────────────────────────────────

type OcrEventInput = {
  userId: string;
  type: string;
  recognitionId?: string | null;
  metadata?: Record<string, unknown>;
};






