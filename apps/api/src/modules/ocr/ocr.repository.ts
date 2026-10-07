/**
 * OCR recognition persistence (Phase 19 §24/§30/§32/§49/§50).
 *
 * Owns OcrAsset + OcrRecognition — the recognition aggregate. Discipline:
 *   - narrow row shapes cross into services (no Prisma types leak, §49);
 *   - state transitions are GUARDED single-statement updates
 *     (UPDATE … WHERE status IN (…)) so concurrent actors (§51: two tabs,
 *     delete racing completion) cannot corrupt the lifecycle;
 *   - idempotency rides on the (userId, idempotencyKey) unique constraint —
 *     a lost race is mapped back to the winning row (§32);
 *   - keyset pagination on (createdAt DESC, id DESC) — the Phase 16 house
 *     pattern (§49) — with an opaque base64url cursor;
 *   - deletion of the recognition and its (last-referenced) asset is ONE
 *     transaction (§50); the binary removal happens AFTER commit in the
 *     service (external I/O never inside a DB transaction, §50).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// ── Narrow row shapes ────────────────────────────────────────────────────────

export interface OcrAssetRow {
  id: string;
  userId: string;
  storageKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  checksumSha256: string;
  createdAt: Date;
}

/** result JSON payload — the validated machine result (untrusted→checked). */
export interface OcrResultPayload {
  classification: unknown | null;
  fields: unknown[];
  warnings: string[];
  engine: {
    name: string;
    engineVersion: string;
    pipelineVersion: string;
    contractVersion: string;
  } | null;
  durationMs: number | null;
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
  /// Phase 21 — canonical Trade created from the confirmed values (§77).
  tradeId: string | null;
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
      createdAt: row.asset.createdAt,
    },
  };
}

// ── Keyset cursor (same house pattern as security events, §49) ───────────────

export function encodeOcrCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

/** Returns null for malformed cursors — callers map that to 400. */
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
    width: number;
    height: number;
    checksumSha256: string;
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
      },
      include: recognitionInclude,
    });
    return toRecognitionRow(created);
  }

  /** Owner-scoped single read — the IDOR boundary (§39). */
  async findForUser(id: string, userId: string): Promise<OcrRecognitionRow | null> {
    const row = await this.prisma.ocrRecognition.findFirst({
      where: { id, userId },
      include: recognitionInclude,
    });
    return row ? toRecognitionRow(row) : null;
  }

  /** Keyset page (createdAt DESC, id DESC), always owner-scoped (§39). */
  async listPageForUser(
    userId: string,
    options: { limit: number; cursor: { createdAt: Date; id: string } | null; status: string | null },
  ): Promise<{ items: OcrRecognitionRow[]; nextCursor: string | null }> {
    const where: Prisma.OcrRecognitionWhereInput = {
      userId,
      ...(options.status !== null ? { status: options.status } : {}),
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
   * Phase 21 — link the canonical Trade produced by the confirmation bridge
   * and append the import warnings to the result payload. Guarded on
   * status=CONFIRMED (the link can only follow the confirmation, §76).
   * Returns the fresh row, or null when a concurrent transition won.
   */
  async linkTrade(
    id: string,
    data: { tradeId: string | null; result: OcrResultPayload },
  ): Promise<OcrRecognitionRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ocrRecognition.updateMany({
        where: { id, status: "CONFIRMED" },
        data: {
          ...(data.tradeId !== null ? { tradeId: data.tradeId } : {}),
          result: data.result as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count === 0) return null;
      const row = await tx.ocrRecognition.findUnique({ where: { id }, include: recognitionInclude });
      return row ? toRecognitionRow(row) : null;
    });
  }

  /**
   * Delete the recognition; when no sibling recognition still references the
   * asset, delete the asset row too. Returns the storage key whose BINARY
   * the service must remove after commit (never inside the transaction, §50).
   * The linked Trade (tradeId) is NEVER touched — one-way provenance (§77).
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
}
