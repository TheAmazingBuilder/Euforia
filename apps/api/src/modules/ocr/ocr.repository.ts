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
import type {
  OcrClassification,
  OcrExtractedField,
  OcrFieldKey,
  OcrIssue,
  OcrQualityScore,
  OcrTimelineEntry,
} from "../../shared/contracts";

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
  /** 64-bit dHash hex — null for rows created before the engine-quality phase. */
  phashHex: string | null;
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
  /** Multi-trade drafts (engine quality §2.2) — absent for the mono path. */
  candidates?: { fields: unknown[] }[] | null;
  /** Advisory duplicate flag (engine quality §2.1). */
  duplicateOf?: {
    recognitionId: string;
    createdAt: string;
    tradeId: string | null;
  } | null;
  /** Playbook tag suggestions (engine quality §3.3) — set at confirmation. */
  suggestedTags?: string[];
  /** Grouped confirmation canonical payloads (engine quality §2.2). */
  batches?: { corrections: Record<string, string | null>; include: boolean }[] | null;
  /** Observability metadata from the engine passes (engine quality §1). */
  passes?: string[];
  layoutTemplate?: string | null;
  deskewDeg?: number | null;
  /** Content-based trade duplicate flag (V2 §4) — advisory, set at processing. */
  possibleTradeDuplicate?: {
    tradeId: string;
    matchedOn: string[];
    detectedAt: string;
  } | null;
  /** Whether the recognized symbol resolved against the instrument catalog
   * (V2 §16 UNKNOWN_SYMBOL input) — null when no symbol was recognized. */
  symbolInCatalog?: boolean | null;
  /** V2 §32 — set when this row was produced by an explicit reprocess. */
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
  /// Phase 21 — canonical Trade created from the confirmed values (§77).
  tradeId: string | null;
  /// Grouped confirmation — every imported Trade id (engine quality §2.2).
  tradeIds: string[];
  /// ACCOUNTS attachment (engine quality §3.1).
  accountId: string | null;
  /// Retention — when the stored binary was purged (engine quality §4.2).
  screenshotPurgedAt: Date | null;
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
   * — the caller computes Hamming distances in JS (no native bitcount).
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

  /** Oldest recognition carrying a given asset — the duplicate target. */
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
    width: number;
    height: number;
    checksumSha256: string;
    phashHex: string | null;
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
      accountId: string | null;
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

  /** Owner-scoped single read — the IDOR boundary (§39). */
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
      /** V2 §62 — detected-platform / screenshot-type jsonb path filters. */
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
   * Phase 21 — link the canonical Trade produced by the confirmation bridge
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

  /** Corrections memory — upsert the (field, raw → corrected) patterns (§2.3). */
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
   * Best suggestion per (fieldKey, rawValue) for the given machine readings —
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

// ── V2 — recognition sets (multi-screenshot fusion) ─────────────────────────

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

  /** Keyset page for the set list (V2 §62 — sets in the history surface). */
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
   * Guarded confirmation transition (§51 discipline) — only REVIEW_REQUIRED
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

// ── V2 §28 — screenshot collections ─────────────────────────────────────────

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
