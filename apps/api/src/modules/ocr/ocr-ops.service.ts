/**
 * OCR ops read models (engine quality §3.2 + §4.2): the OCR-quality
 * analytics aggregate and the storage/retention indicator.
 *
 * Aggregation discipline:
 *   - every query is owner-scoped (§39) and windowed by `days`;
 *   - the funnel counts RECOGNITION STATES (uploads → completed →
 *     review-required → confirmed) plus the exact number of imported
 *     trades, read from Trading Core's externalRef (`ocr:%`) - the trade
 *     table is the source of truth for what actually landed;
 *   - corrections by field come from the corrections-memory ledger (§2.3):
 *     it records what the user CHANGED, which is exactly the signal the
 *     OCR-quality card wants;
 *   - confidence/duration averages read the JSON payloads with jsonb SQL -
 *     no second write path, no denormalized counters to keep in sync.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import type { OcrAnalyticsResponse, OcrStorageResponse } from "../../shared/contracts";

@Injectable()
export class OcrOpsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async getAnalytics(userId: string, windowDays: number): Promise<OcrAnalyticsResponse> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const statusGroups = await this.prisma.ocrRecognition.groupBy({
      by: ["status"],
      where: { userId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const countOf = (status: string): number =>
      statusGroups.find((group) => group.status === status)?._count._all ?? 0;

    const uploads = statusGroups.reduce((total, group) => total + group._count._all, 0);
    const confirmed = countOf("CONFIRMED");
    const reviewRequired = countOf("REVIEW_REQUIRED");
    const failed = countOf("FAILED");
    const completed = uploads - failed;

    // Imported trades - read from Trading Core (source of truth), owner-
    // scoped through the account relation, windowed by trade creation.
    const importedRows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count
         FROM "Trade" t
         JOIN "TradingAccount" a ON t."accountId" = a.id
        WHERE a."userId" = $1::uuid
          AND t."externalRef" LIKE 'ocr:%'
          AND t."createdAt" >= $2`,
      userId,
      since,
    );
    const importedTrades = Number(importedRows[0]?.count ?? 0);

    // Corrections by field - from the memory ledger (what the user fixed).
    const patternGroups = await this.prisma.ocrCorrectionPattern.groupBy({
      by: ["fieldKey"],
      where: { userId, lastSeenAt: { gte: since } },
      _sum: { count: true },
    });
    const correctionsByField = patternGroups
      .map((group) => ({
        field: group.fieldKey as OcrAnalyticsResponse["correctionsByField"][number]["field"],
        corrections: group._sum.count ?? 0,
        confirmations: confirmed,
      }))
      .sort((a, b) => b.corrections - a.corrections)
      .slice(0, 16);

    // Field-level average confidence across the window's payloads (jsonb).
    const confidenceRows = await this.prisma.$queryRawUnsafe<{ avg: number | null }[]>(
      `SELECT AVG((f->>'confidence')::float8) AS avg
         FROM "OcrRecognition" r
        CROSS JOIN LATERAL jsonb_array_elements(r."result"->'fields') f
        WHERE r."userId" = $1::uuid
          AND r."createdAt" >= $2
          AND jsonb_typeof(r."result"->'fields') = 'array'`,
      userId,
      since,
    );
    const avgConfidenceRaw = confidenceRows[0]?.avg;
    const avgConfidence = avgConfidenceRaw === null || avgConfidenceRaw === undefined ? null : Number(avgConfidenceRaw);

    // Duration lives in the result payload (jsonb) - averaged in SQL.
    const durationRows = await this.prisma.$queryRawUnsafe<{ avg: number | null }[]>(
      `SELECT AVG((r."result"->>'durationMs')::float8) AS avg
         FROM "OcrRecognition" r
        WHERE r."userId" = $1::uuid
          AND r."createdAt" >= $2
          AND r."result"->>'durationMs' IS NOT NULL`,
      userId,
      since,
    );

    const duplicateRows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count
         FROM "OcrRecognition" r
        WHERE r."userId" = $1::uuid
          AND r."createdAt" >= $2
          AND r."result"->'duplicateOf' IS NOT NULL`,
      userId,
      since,
    );

    // V2 §30 - correction rate: the share of confirmed recognitions whose
    // user declaration carried at least one correction. Null when nothing
    // was confirmed (no basis to compute a rate, never a fabricated 0).
    const correctedRows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count
         FROM "OcrRecognition" r
        WHERE r."userId" = $1::uuid
          AND r."createdAt" >= $2
          AND r."status" = 'CONFIRMED'
          AND r."corrections" IS NOT NULL
          AND NOT (r."corrections" <@ '{}'::jsonb)`,
      userId,
      since,
    );
    const correctedCount = Number(correctedRows[0]?.count ?? 0);
    const correctionRate = confirmed > 0 ? Math.round((correctedCount / confirmed) * 1000) / 1000 : null;

    // V2 §30 - platform + screenshot-type distributions (detected values
    // only; legacy rows without the classification field are not invented).
    const platformRows = await this.prisma.$queryRawUnsafe<{ platform: string; count: bigint }[]>(
      `SELECT r."result"->'classification'->>'platform' AS platform, COUNT(*) AS count
         FROM "OcrRecognition" r
        WHERE r."userId" = $1::uuid
          AND r."createdAt" >= $2
          AND r."result"->'classification'->>'platform' IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 8`,
      userId,
      since,
    );
    const typeRows = await this.prisma.$queryRawUnsafe<{ type: string; count: bigint }[]>(
      `SELECT r."result"->'classification'->>'type' AS type, COUNT(*) AS count
         FROM "OcrRecognition" r
        WHERE r."userId" = $1::uuid
          AND r."createdAt" >= $2
          AND r."result"->'classification'->>'type' IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10`,
      userId,
      since,
    );

    return {
      windowDays,
      funnel: {
        uploads,
        completed,
        reviewRequired,
        confirmed,
        importedTrades,
      },
      correctionsByField,
      avgConfidence,
      duplicatesBlocked: Number(duplicateRows[0]?.count ?? 0),
      avgDurationMs: durationRows[0]?.avg === null || durationRows[0]?.avg === undefined
        ? null
        : Math.round(Number(durationRows[0]!.avg)),
      correctionRate,
      platformDistribution: platformRows.map((row) => ({
        platform: row.platform as OcrAnalyticsResponse["platformDistribution"][number]["platform"],
        count: Number(row.count),
      })),
      typeDistribution: typeRows.map((row) => ({
        type: row.type as OcrAnalyticsResponse["typeDistribution"][number]["type"],
        count: Number(row.count),
      })),
    };
  }

  async getStorage(userId: string): Promise<OcrStorageResponse> {
    const retentionDays = this.config.ocr.retentionDays;

    const total = await this.prisma.ocrAsset.count({ where: { userId } });
    // Retained = assets with at least one recognition whose screenshot was
    // never purged. Aggregated from the recognition side (owner-scoped).
    const retainedGroups = await this.prisma.ocrRecognition.groupBy({
      by: ["assetId"],
      where: { userId, screenshotPurgedAt: null },
      _count: { _all: true },
    });
    const retainedAssetIds = retainedGroups.map((group) => group.assetId);
    const retainedAssetCount = retainedAssetIds.length;

    const sizeAggregate = await this.prisma.ocrAsset.aggregate({
      where: { userId, id: { in: retainedAssetIds } },
      _sum: { sizeBytes: true },
    });
    const oldestRetained = await this.prisma.ocrAsset.findFirst({
      where: { userId, id: { in: retainedAssetIds } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    return {
      usedBytes: sizeAggregate._sum.sizeBytes ?? 0,
      assetCount: total,
      retainedAssetCount,
      purgedAssetCount: Math.max(total - retainedAssetCount, 0),
      retentionDays,
      oldestRetainedAssetAt: oldestRetained?.createdAt.toISOString() ?? null,
    };
  }
}
