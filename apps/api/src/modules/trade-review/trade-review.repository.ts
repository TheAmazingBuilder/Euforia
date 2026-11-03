/**
 * Trade Review repository (Phase 6) - the ONLY Prisma touchpoint of the
 * context (Phase 0 §I discipline: one repository, narrow rows, ownership in
 * every query).
 *
 * Read models owned here: the workspace rows are a JOIN projection of
 * TradeReview ⊕ Trade (the product's ReviewRow) - a review-owned read model,
 * NOT an ownership transfer: Trading Core remains the exclusive writer of
 * Trade/TradeExecution rows (§11/§66 red lines). Every query carries the
 * userId from the principal (IDOR → honest 404/empty, §24/§36) and filters
 * soft-deleted trades out of the workspace.
 *
 * Writes use CONDITIONAL updates (updateMany with the expected status in the
 * where clause) as the optimistic lifecycle guard (§44): zero rows updated =
 * lost a race → 409 upstream. The 1:1 unique constraint on tradeId backs the
 * create/create race; the service maps the P2002 to the update path.
 */
import { Injectable } from "@nestjs/common";
import { Prisma, ExecutionGrade, PlaybookMatch, TradeReviewStatus } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface TradeReviewRow {
  id: string;
  userId: string;
  tradeId: string;
  status: string;
  executionGrade: string;
  followedPlan: boolean;
  playbookMatch: string;
  checklistResults: Prisma.JsonValue | null;
  entryQuality: number | null;
  exitQuality: number | null;
  riskManagement: number | null;
  lessons: string;
  improvementNote: string | null;
  originTradePlanId: string | null;
  planSnapshot: Prisma.JsonValue | null;
  reviewedAt: Date;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Trade facts joined into workspace rows (read-only projection). */
export interface ReviewTradeFactRow {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  currency: string;
  tradingDate: Date;
  rMultiple: Prisma.Decimal | null;
  pnlNet: Prisma.Decimal | null;
  notes: string | null;
}

export interface ReviewedJoinRow {
  review: TradeReviewRow;
  trade: ReviewTradeFactRow;
}

/** A closed trade awaiting review (the workspace PENDING row source). */
export type PendingTradeRow = ReviewTradeFactRow;

export interface UpsertReviewData {
  userId: string;
  tradeId: string;
  executionGrade: string;
  followedPlan: boolean;
  playbookMatch: string;
  checklistResults: Prisma.JsonValue | null;
  entryQuality: number | null;
  exitQuality: number | null;
  riskManagement: number | null;
  lessons: string;
  improvementNote: string | null;
  originTradePlanId: string | null;
  planSnapshot: Prisma.JsonValue | null;
  reviewedAt: Date;
}

export interface PatchReviewData {
  executionGrade?: string;
  followedPlan?: boolean;
  playbookMatch?: string;
  checklistResults?: Prisma.JsonValue | null;
  entryQuality?: number | null;
  exitQuality?: number | null;
  riskManagement?: number | null;
  lessons?: string;
  improvementNote?: string | null;
  originTradePlanId?: string | null;
  planSnapshot?: Prisma.JsonValue | null;
  reviewedAt?: Date;
  /** Lifecycle target (reactivation: ARCHIVED → COMPLETED). */
  status?: string;
  archivedAt?: Date | null;
}

/** Narrow review select - never a SELECT * (§41 hygiene). */
const reviewSelect = {
  id: true,
  userId: true,
  tradeId: true,
  status: true,
  executionGrade: true,
  followedPlan: true,
  playbookMatch: true,
  checklistResults: true,
  entryQuality: true,
  exitQuality: true,
  riskManagement: true,
  lessons: true,
  improvementNote: true,
  originTradePlanId: true,
  planSnapshot: true,
  reviewedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TradeReviewSelect;

const tradeFactSelect = {
  id: true,
  symbol: true,
  direction: true,
  status: true,
  currency: true,
  tradingDate: true,
  rMultiple: true,
  pnlNet: true,
  notes: true,
} satisfies Prisma.TradeSelect;

@Injectable()
export class TradeReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Any-state review for the trade (upsert needs ARCHIVED rows too). */
  async findReviewByTradeId(tradeId: string, userId: string): Promise<TradeReviewRow | null> {
    const row = await this.prisma.tradeReview.findFirst({
      where: { tradeId, userId },
      select: reviewSelect,
    });
    return (row as TradeReviewRow | null) ?? null;
  }

  /** Active (COMPLETED) review - the workspace-visible artifact. */
  async findActiveReviewByTradeId(tradeId: string, userId: string): Promise<TradeReviewRow | null> {
    const row = await this.prisma.tradeReview.findFirst({
      where: { tradeId, userId, status: "COMPLETED" },
      select: reviewSelect,
    });
    return (row as TradeReviewRow | null) ?? null;
  }

  /** The single workspace join row (review ⊕ trade) for one trade. */
  async findReviewedJoinByTradeId(tradeId: string, userId: string): Promise<ReviewedJoinRow | null> {
    const row = await this.prisma.tradeReview.findFirst({
      where: { tradeId, userId, status: "COMPLETED", trade: { is: { deletedAt: null } } },
      select: { ...reviewSelect, trade: { select: tradeFactSelect } },
    });
    if (row === null) return null;
    return {
      review: row as unknown as TradeReviewRow,
      trade: row.trade as unknown as ReviewTradeFactRow,
    };
  }

  /**
   * Insert a COMPLETED review. The unique constraint on tradeId backs the
   * concurrent-create race: the service catches P2002 and falls back to the
   * conditional update path (race-safe upsert, §44).
   */
  async insertReview(data: UpsertReviewData): Promise<TradeReviewRow> {
    const row = await this.prisma.tradeReview.create({
      data: {
        userId: data.userId,
        tradeId: data.tradeId,
        status: "COMPLETED",
        executionGrade: data.executionGrade as ExecutionGrade,
        followedPlan: data.followedPlan,
        playbookMatch: data.playbookMatch as PlaybookMatch,
        checklistResults: data.checklistResults === null ? Prisma.DbNull : data.checklistResults,
        entryQuality: data.entryQuality,
        exitQuality: data.exitQuality,
        riskManagement: data.riskManagement,
        lessons: data.lessons,
        improvementNote: data.improvementNote,
        originTradePlanId: data.originTradePlanId,
        planSnapshot: data.planSnapshot === null ? Prisma.DbNull : data.planSnapshot,
        reviewedAt: data.reviewedAt,
      },
      select: reviewSelect,
    });
    return row as TradeReviewRow;
  }

  /**
   * Conditional update of an ACTIVE review. `expectedStatus` is the
   * optimistic guard: zero rows = the row changed state under us (§44).
   * Returns the updated row or null when the guard fired / row is gone.
   */
  async updateReview(
    tradeId: string,
    userId: string,
    expectedStatus: string,
    data: PatchReviewData,
  ): Promise<TradeReviewRow | null> {
    const updated = await this.prisma.tradeReview.updateMany({
      where: { tradeId, userId, status: expectedStatus as TradeReviewStatus },
      data: {
        ...(data.executionGrade !== undefined
          ? { executionGrade: data.executionGrade as ExecutionGrade }
          : {}),
        ...(data.followedPlan !== undefined ? { followedPlan: data.followedPlan } : {}),
        ...(data.playbookMatch !== undefined
          ? { playbookMatch: data.playbookMatch as PlaybookMatch }
          : {}),
        ...(data.checklistResults !== undefined
          ? { checklistResults: data.checklistResults === null ? Prisma.DbNull : data.checklistResults }
          : {}),
        ...(data.entryQuality !== undefined ? { entryQuality: data.entryQuality } : {}),
        ...(data.exitQuality !== undefined ? { exitQuality: data.exitQuality } : {}),
        ...(data.riskManagement !== undefined ? { riskManagement: data.riskManagement } : {}),
        ...(data.lessons !== undefined ? { lessons: data.lessons } : {}),
        ...(data.improvementNote !== undefined ? { improvementNote: data.improvementNote } : {}),
        ...(data.originTradePlanId !== undefined ? { originTradePlanId: data.originTradePlanId } : {}),
        ...(data.planSnapshot !== undefined
          ? { planSnapshot: data.planSnapshot === null ? Prisma.DbNull : data.planSnapshot }
          : {}),
        ...(data.reviewedAt !== undefined ? { reviewedAt: data.reviewedAt } : {}),
        ...(data.status !== undefined ? { status: data.status as TradeReviewStatus } : {}),
        ...(data.archivedAt !== undefined ? { archivedAt: data.archivedAt } : {}),
      },
    });
    if (updated.count === 0) return null;
    const row = await this.prisma.tradeReview.findFirst({
      where: { tradeId, userId },
      select: reviewSelect,
    });
    return (row as TradeReviewRow | null) ?? null;
  }

  /** Conditional COMPLETED → ARCHIVED (soft-undo; journal history kept). */
  async archiveReview(tradeId: string, userId: string, archivedAt: Date): Promise<boolean> {
    const updated = await this.prisma.tradeReview.updateMany({
      where: { tradeId, userId, status: "COMPLETED" },
      data: { status: "ARCHIVED", archivedAt },
    });
    return updated.count > 0;
  }

  // ── Workspace read models (review ⊕ trade projection) ────────────────────

  /** Active reviews joined with their trade, newest trading day first. */
  async listReviewedRows(userId: string, fetchCount: number): Promise<ReviewedJoinRow[]> {
    const rows = await this.prisma.tradeReview.findMany({
      where: { userId, status: "COMPLETED", trade: { is: { deletedAt: null } } },
      select: { ...reviewSelect, trade: { select: tradeFactSelect } },
      orderBy: { trade: { tradingDate: "desc" } },
      take: fetchCount,
    });
    return rows.map((row) => ({
      review: row as unknown as TradeReviewRow,
      trade: row.trade as unknown as ReviewTradeFactRow,
    }));
  }

  async countReviewedRows(userId: string): Promise<number> {
    return this.prisma.tradeReview.count({
      where: { userId, status: "COMPLETED", trade: { deletedAt: null } },
    });
  }

  /**
   * Closed trades awaiting review: CLOSED, not soft-deleted, without an
   * ACTIVE review (an ARCHIVED review puts the trade back into the queue).
   */
  private pendingWhere(userId: string) {
    return {
      userId,
      status: "CLOSED",
      deletedAt: null,
      OR: [
        { review: { is: null } },
        { review: { status: { not: "COMPLETED" } } },
      ],
    } satisfies Prisma.TradeWhereInput;
  }

  async listPendingTradeRows(userId: string, fetchCount: number): Promise<PendingTradeRow[]> {
    const rows = await this.prisma.trade.findMany({
      where: this.pendingWhere(userId),
      select: tradeFactSelect,
      orderBy: { tradingDate: "desc" },
      take: fetchCount,
    });
    return rows as unknown as PendingTradeRow[];
  }

  async countPendingTradeRows(userId: string): Promise<number> {
    return this.prisma.trade.count({ where: this.pendingWhere(userId) });
  }

  /**
   * Overview scan: narrow active-review summaries (the review history is
   * naturally bounded - one per reviewed trade) + the closed-trade count.
   */
  async listActiveReviewSummaries(
    userId: string,
  ): Promise<
    Array<{
      tradeId: string;
      /** Nullable like the columns - partial reviews exist; consumers guard. */
      executionGrade: ExecutionGrade | null;
      followedPlan: boolean | null;
      playbookMatch: PlaybookMatch | null;
      entryQuality: number | null;
      exitQuality: number | null;
      riskManagement: number | null;
      improvementNote: string | null;
      reviewedAt: Date;
      /** Phase 8 (additive): the origin-plan reference Analytics chains through. */
      originTradePlanId: string | null;
      /** Phase 8 (additive): the FROZEN plan values (canonical planned RR). */
      planSnapshot: unknown;
    }>
  > {
    return this.prisma.tradeReview.findMany({
      where: { userId, status: "COMPLETED" },
      select: {
        tradeId: true,
        executionGrade: true,
        followedPlan: true,
        playbookMatch: true,
        entryQuality: true,
        exitQuality: true,
        riskManagement: true,
        improvementNote: true,
        reviewedAt: true,
        originTradePlanId: true,
        planSnapshot: true,
      },
      orderBy: { reviewedAt: "desc" },
    });
  }

  async countClosedTrades(userId: string): Promise<number> {
    return this.prisma.trade.count({
      where: { userId, status: "CLOSED", deletedAt: null },
    });
  }

  /** TRADE_NOTE lesson sources: pending closed trades with non-empty notes. */
  async listPendingNoteRows(
    userId: string,
    fetchCount: number,
  ): Promise<
    Array<{
      id: string;
      symbol: string;
      tradingDate: Date;
      notes: string | null;
      rMultiple: Prisma.Decimal | null;
    }>
  > {
    const rows = await this.prisma.trade.findMany({
      where: {
        userId,
        status: "CLOSED",
        deletedAt: null,
        notes: { not: null },
        OR: [
          { review: { is: null } },
          { review: { status: { not: "COMPLETED" } } },
        ],
      },
      select: { id: true, symbol: true, tradingDate: true, notes: true, rMultiple: true },
      orderBy: { tradingDate: "desc" },
      take: fetchCount,
    });
    return rows;
  }
}
