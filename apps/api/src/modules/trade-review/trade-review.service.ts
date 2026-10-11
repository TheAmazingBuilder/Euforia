/**
 * Trade Review application service (Phase 6) — use-case orchestration over
 * the review aggregate and read models.
 *
 * Every operation enforces the ownership chain (§8/§36): authenticated
 * principal → trade ownership (via Trading Core's public repository) →
 * review ownership (userId in every query). The userId ALWAYS comes from the
 * JWT guard — never from the client (§24).
 *
 * Boundaries (§47/§49/§50/§51/§78):
 *   - Trading Core stays the source of truth for execution/financial data —
 *     this service READS trades and NEVER writes them (immutability §11/§31).
 *   - The Trade Planning context is read via its public repository; the plan
 *     is never modified (§25).
 *   - No analytics aggregation beyond the review workspace's own stats; no
 *     behavioral diagnosis; no goals engine (documented deferral).
 *
 * Concurrency (§44): every state-dependent write is a conditional update;
 * lost races surface as 409 TRADE_REVIEW_CONCURRENT_MODIFICATION.
 */
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/app-error";
import {
  TRADE_REVIEW_ERROR_CODES,
  type DeleteReviewResponse,
  type LessonsResponse,
  type PatchReviewInput,
  type ReviewDetailResponse,
  type ReviewRow,
  type ReviewPlanSnapshot,
  type ReviewsQuery,
  type ReviewsResponse,
  type TradeReviewOverviewResponse,
  type UpsertReviewInput,
} from "../../shared/contracts";
import { IdentityRepository } from "../identity/identity.repository";
import { tradingDateKey } from "../trading/trade-aggregation.service";
import { TradingRepository } from "../trading/trading.repository";
import { TradePlanRepository } from "../trade-planning/trade-plan.repository";
import { INSTRUMENT_SPECIFICATION_PROVIDER } from "../trade-planning/trade-planning.tokens";
import type { InstrumentSpecificationProvider } from "../trade-planning/domain/ports";
import { TradeReviewRepository } from "./trade-review.repository";
import type { ReviewedJoinRow } from "./trade-review.repository";
import {
  toComparison,
  toPlanSummary,
  toReviewRowFromPending,
  toReviewRowFromReview,
  toReviewPayload,
  toReviewTradeSummary,
} from "./trade-review.mappers";
import { comparePlanAgainstTrade } from "./domain/plan-vs-actual";
import { freezePlanSnapshot, parsePlanSnapshot } from "./domain/plan-snapshot";
import { upsertAcceptsState } from "./domain/review-lifecycle";
import {
  computeReviewStreak,
  computeWeeklyGradeTrend,
  type GradeDayPoint,
} from "./domain/review-streak";

/** Page ceiling for the unpaginated lessons library (product contract). */
const LESSONS_FETCH_CAP = 2000;

/** Workspace list default page size (§72 — paginated, contract-compatible). */
const DEFAULT_PAGE_SIZE = 200;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const isoDateTimeWire = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Product merge rule (§71): omitted optional fields keep their stored value
 * on edits; explicit null ALSO keeps (mock parity — the product never clears
 * through the save path). `fresh` marks a reactivation: a fresh completion
 * resets anything the payload does not provide to null, never to the
 * archived row's stale values.
 */
function mergeOptional<T>(
  input: T | null | undefined,
  existing: T | null,
  fresh = false,
): T | null | undefined {
  if (fresh) return input === undefined ? null : input;
  if (input === undefined) return undefined;
  if (input === null) return existing;
  return input;
}

/** Plan linkage decision for a save operation. */
type PlanLinkage =
  | { kind: "keep" }
  | { kind: "detach" }
  | { kind: "link"; planId: string; snapshot: ReviewPlanSnapshot };

@Injectable()
export class TradeReviewService {
  constructor(
    private readonly reviews: TradeReviewRepository,
    private readonly tradingRepository: TradingRepository,
    private readonly planRepository: TradePlanRepository,
    private readonly identityRepository: IdentityRepository,
    @Inject(INSTRUMENT_SPECIFICATION_PROVIDER)
    private readonly specs: InstrumentSpecificationProvider,
    @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  // ── Upsert (PUT /reviews/:tradeId) ────────────────────────────────────────

  /**
   * Create-or-update the trade's review (the product's upsert flow). The URL
   * tradeId is authoritative (frontend contract); a body tradeId, when sent,
   * is ignored — never trusted (§24).
   */
  async upsertReview(userId: string, tradeId: string, input: UpsertReviewInput): Promise<ReviewRow> {
    const trade = await this.tradingRepository.findTradeForUser(tradeId, userId);
    if (trade === null) {
      throw new NotFoundError(
        "Trade does not exist (or is not yours).",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_TRADE_NOT_FOUND,
      );
    }
    if (trade.status !== "CLOSED") {
      throw new BusinessRuleError(
        "Only closed trades can be reviewed.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_TRADE_NOT_REVIEWABLE,
      );
    }

    const now = new Date();
    const linkage = await this.resolvePlanLinkage(userId, input.originTradePlanId, trade.symbol, now);

    const existing = await this.reviews.findReviewByTradeId(tradeId, userId);
    if (existing === null) {
      try {
        const row = await this.reviews.insertReview({
          userId,
          tradeId,
          executionGrade: input.executionGrade,
          followedPlan: input.followedPlan,
          playbookMatch: input.playbookMatch,
          checklistResults: input.checklistResults ?? null,
          entryQuality: input.entryQuality ?? null,
          exitQuality: input.exitQuality ?? null,
          riskManagement: input.riskManagement ?? null,
          lessons: input.lessons,
          improvementNote: input.improvementNote ?? null,
          originTradePlanId: linkage.kind === "link" ? linkage.planId : null,
          planSnapshot: linkage.kind === "link" ? linkage.snapshot : null,
          reviewedAt: now,
        });
        this.logger?.info(
          { event: "trade_review.created", userId, tradeId, reviewId: row.id },
          "trade_review.created",
        );
        return this.requireJoinRow(await this.reviews.findReviewedJoinByTradeId(tradeId, userId));
      } catch (error) {
        // Concurrent create raced us (unique tradeId) — fall through to the
        // update path so the request still lands as a proper upsert (§44).
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
      }
    }

    const current = await this.reviews.findReviewByTradeId(tradeId, userId);
    if (current === null || !upsertAcceptsState(current.status as "COMPLETED" | "ARCHIVED")) {
      throw new ConflictError(
        "The review state changed concurrently. Retry.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_CONCURRENT_MODIFICATION,
      );
    }

    // Reactivation (ARCHIVED → COMPLETED) is a FRESH completion: the streak
    // and trend clocks advance to now; plain edits keep the original clock.
    const reactivating = current.status === "ARCHIVED";
    const row = await this.reviews.updateReview(tradeId, userId, current.status, {
      executionGrade: input.executionGrade,
      followedPlan: input.followedPlan,
      playbookMatch: input.playbookMatch,
      checklistResults: mergeOptional(input.checklistResults, current.checklistResults as object | null, reactivating),
      entryQuality: mergeOptional(input.entryQuality, current.entryQuality, reactivating),
      exitQuality: mergeOptional(input.exitQuality, current.exitQuality, reactivating),
      riskManagement: mergeOptional(input.riskManagement, current.riskManagement, reactivating),
      lessons: input.lessons,
      improvementNote: mergeOptional(input.improvementNote, current.improvementNote, reactivating),
      ...(linkage.kind === "keep"
        ? {}
        : linkage.kind === "detach"
          ? { originTradePlanId: null, planSnapshot: null }
          : { originTradePlanId: linkage.planId, planSnapshot: linkage.snapshot }),
      ...(reactivating ? { reviewedAt: now, status: "COMPLETED", archivedAt: null } : {}),
    });
    if (row === null) {
      throw new ConflictError(
        "The review state changed concurrently. Retry.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_CONCURRENT_MODIFICATION,
      );
    }
    this.logger?.info(
      {
        event: reactivating ? "trade_review.created" : "trade_review.updated",
        userId,
        tradeId,
        reviewId: row.id,
      },
      reactivating ? "trade_review.created" : "trade_review.updated",
    );
    return this.requireJoinRow(await this.reviews.findReviewedJoinByTradeId(tradeId, userId));
  }

  // ── Partial update (PATCH /reviews/:tradeId) ─────────────────────────────

  /** Edit an ACTIVE review (merge semantics). Archived rows are invisible. */
  async patchReview(userId: string, tradeId: string, input: PatchReviewInput): Promise<ReviewRow> {
    const current = await this.reviews.findActiveReviewByTradeId(tradeId, userId);
    if (current === null) {
      // Covers both "no review" and "archived" — an honest 404 (§32: no
      // silent resurrection of archived reviews through the edit path).
      throw new NotFoundError(
        "Review does not exist.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_NOT_FOUND,
      );
    }

    // Linking a plan on PATCH re-validates against the trade's symbol — the
    // trade must still exist and belong to the caller.
    let linkage: PlanLinkage = { kind: "keep" };
    if (input.originTradePlanId !== undefined) {
      const trade = await this.tradingRepository.findTradeForUser(tradeId, userId);
      if (trade === null) {
        throw new NotFoundError(
          "Trade does not exist (or is not yours).",
          TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_TRADE_NOT_FOUND,
        );
      }
      linkage = await this.resolvePlanLinkage(userId, input.originTradePlanId, trade.symbol, new Date());
    }

    const row = await this.reviews.updateReview(tradeId, userId, "COMPLETED", {
      executionGrade: input.executionGrade,
      followedPlan: input.followedPlan,
      playbookMatch: input.playbookMatch,
      checklistResults: mergeOptional(input.checklistResults, current.checklistResults as object | null),
      entryQuality: mergeOptional(input.entryQuality, current.entryQuality),
      exitQuality: mergeOptional(input.exitQuality, current.exitQuality),
      riskManagement: mergeOptional(input.riskManagement, current.riskManagement),
      lessons: input.lessons,
      improvementNote: mergeOptional(input.improvementNote, current.improvementNote),
      ...(linkage.kind === "keep"
        ? {}
        : linkage.kind === "detach"
          ? { originTradePlanId: null, planSnapshot: null }
          : { originTradePlanId: linkage.planId, planSnapshot: linkage.snapshot }),
    });
    if (row === null) {
      throw new ConflictError(
        "The review state changed concurrently. Retry.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_CONCURRENT_MODIFICATION,
      );
    }
    this.logger?.info(
      { event: "trade_review.updated", userId, tradeId, reviewId: row.id },
      "trade_review.updated",
    );
    return this.requireJoinRow(await this.reviews.findReviewedJoinByTradeId(tradeId, userId));
  }

  // ── Archive (DELETE /reviews/:tradeId) ───────────────────────────────────

  /** Undo a review: the trade returns to PENDING; the row is kept (audit). */
  async archiveReview(userId: string, tradeId: string): Promise<DeleteReviewResponse> {
    const archived = await this.reviews.archiveReview(tradeId, userId, new Date());
    if (!archived) {
      throw new NotFoundError(
        "Review does not exist.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_NOT_FOUND,
      );
    }
    this.logger?.info({ event: "trade_review.archived", userId, tradeId }, "trade_review.archived");
    return { ok: true };
  }

  // ── Detail (GET /reviews/:tradeId) ───────────────────────────────────────

  /** Review detail: payload + authoritative trade summary + plan + comparison (§70). */
  async getReviewDetail(userId: string, tradeId: string): Promise<ReviewDetailResponse> {
    const review = await this.reviews.findActiveReviewByTradeId(tradeId, userId);
    if (review === null) {
      throw new NotFoundError(
        "Review does not exist.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_NOT_FOUND,
      );
    }
    const trade = await this.tradingRepository.findTradeForUser(tradeId, userId);
    if (trade === null) {
      throw new NotFoundError(
        "Trade does not exist (or is not yours).",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_TRADE_NOT_FOUND,
      );
    }

    const plan =
      review.originTradePlanId === null
        ? null
        : await this.planRepository.findPlanForUser(review.originTradePlanId, userId);
    const snapshot = parsePlanSnapshot(review.planSnapshot);

    const comparison = await this.buildComparison(trade, plan, snapshot);
    this.logger?.debug(
      { event: "trade_review.comparison_generated", userId, tradeId, reviewId: review.id },
      "trade_review.comparison_generated",
    );

    return {
      review: toReviewPayload(review),
      tradeSummary: toReviewTradeSummary(trade),
      planSummary:
        review.originTradePlanId !== null && snapshot !== null
          ? toPlanSummary(review.originTradePlanId, snapshot, plan?.status ?? null)
          : null,
      comparison: toComparison(comparison),
    };
  }

  // ── Workspace list (GET /reviews) ────────────────────────────────────────

  /**
   * REVIEWED ⊕ PENDING rows, newest trading day first, reviewed rows first
   * on ties (product ordering). Pagination merges the top-N of both sides —
   * no full-history scan beyond the requested window (§72).
   */
  async listReviews(userId: string, query: ReviewsQuery): Promise<ReviewsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const fetchCount = page * limit;

    const [reviewed, pending, reviewedTotal, pendingTotal] = await Promise.all([
      this.reviews.listReviewedRows(userId, fetchCount),
      this.reviews.listPendingTradeRows(userId, fetchCount),
      this.reviews.countReviewedRows(userId),
      this.reviews.countPendingTradeRows(userId),
    ]);

    const reviewedRows = reviewed.map(toReviewRowFromReview);
    const pendingRows = pending.map(toReviewRowFromPending);

    const keyOf = (isoDateKey: string): number => Date.parse(`${isoDateKey}T00:00:00.000Z`);

    // Two-pointer merge of two desc-sorted lists; ties favor REVIEWED rows.
    const merged: Array<{ row: ReviewRow; key: number }> = [];
    let i = 0;
    let j = 0;
    while (i < reviewedRows.length && j < pendingRows.length) {
      const a = keyOf(reviewedRows[i]!.tradingDate);
      const b = keyOf(pendingRows[j]!.tradingDate);
      if (a >= b) {
        merged.push({ row: reviewedRows[i]!, key: a });
        i += 1;
      } else {
        merged.push({ row: pendingRows[j]!, key: b });
        j += 1;
      }
    }
    for (; i < reviewedRows.length; i += 1) {
      merged.push({ row: reviewedRows[i]!, key: keyOf(reviewedRows[i]!.tradingDate) });
    }
    for (; j < pendingRows.length; j += 1) {
      merged.push({ row: pendingRows[j]!, key: keyOf(pendingRows[j]!.tradingDate) });
    }

    const start = (page - 1) * limit;
    const rows = merged.slice(start, start + limit).map((entry) => entry.row);
    const total = reviewedTotal + pendingTotal;

    return {
      reviews: rows,
      meta: {
        generatedAt: isoDateTimeWire(new Date()),
        total,
        page,
        limit,
        hasMore: page * limit < total,
      },
    };
  }

  // ── Lessons library (GET /reviews/lessons) ───────────────────────────────

  /** Union of REVIEW lessons and TRADE_NOTE lessons (JOURNAL source: later phase). */
  async getLessons(userId: string): Promise<LessonsResponse> {
    const [reviewed, pendingNotes] = await Promise.all([
      this.reviews.listReviewedRows(userId, LESSONS_FETCH_CAP),
      this.reviews.listPendingNoteRows(userId, LESSONS_FETCH_CAP),
    ]);

    const entries: LessonsResponse["lessons"] = [];
    for (const join of reviewed) {
      entries.push({
        id: join.review.id,
        source: "REVIEW",
        tradeId: join.review.tradeId,
        date: dateKeyOf(join.trade.tradingDate),
        text: join.review.lessons,
        symbol: join.trade.symbol,
        executionGrade: join.review
          .executionGrade as LessonsResponse["lessons"][number]["executionGrade"],
        rMultiple: join.trade.rMultiple === null ? null : Number(join.trade.rMultiple),
        strategyName: null,
      });
    }
    for (const note of pendingNotes) {
      if (note.notes === null || note.notes.trim() === "") continue;
      entries.push({
        id: `note-${note.id}`,
        source: "TRADE_NOTE",
        tradeId: note.id,
        date: dateKeyOf(note.tradingDate),
        text: note.notes,
        symbol: note.symbol,
        executionGrade: null,
        rMultiple: note.rMultiple === null ? null : Number(note.rMultiple),
        strategyName: null,
      });
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return { lessons: entries };
  }

  // ── Overview aggregate (GET /reviews/overview) ───────────────────────────

  /**
   * The workspace aggregate. Review-side stats are computed over the review
   * context's own records + closed-trade counts (§47 boundary respected —
   * cross-trade PERFORMANCE analytics stay in the future Analytics phase,
   * and the goals engine is an honest zero until its own phase).
   */
  async getOverview(userId: string): Promise<TradeReviewOverviewResponse> {
    const user = await this.identityRepository.findUserById(userId);
    const timezone = user?.timezone;

    const now = new Date();
    const todayKey = tradingDateKey(now, timezone);

    const [closedCount, summaries, pendingPreview, lessons] = await Promise.all([
      this.reviews.countClosedTrades(userId),
      this.reviews.listActiveReviewSummaries(userId),
      this.reviews.listPendingTradeRows(userId, 5),
      this.getLessons(userId),
    ]);

    const reviewedCount = summaries.length;

    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const summary of summaries) {
      if (summary.executionGrade in distribution) {
        distribution[summary.executionGrade as keyof typeof distribution] += 1;
      }
    }

    const meanQuality = (pick: (s: (typeof summaries)[number]) => number | null): number | null => {
      const values = summaries.map(pick).filter((v): v is number => v !== null);
      return values.length > 0 ? round1(values.reduce((acc, v) => acc + v, 0) / values.length) : null;
    };

    const reviewDayKeys = new Set(
      summaries.map((summary) => tradingDateKey(summary.reviewedAt, timezone)),
    );
    const streak = computeReviewStreak({ todayKey, reviewDayKeys });

    const gradePoints: GradeDayPoint[] = summaries.map((summary) => ({
      dayKey: tradingDateKey(summary.reviewedAt, timezone),
      grade: summary.executionGrade,
    }));
    const weeklyGradeTrend = computeWeeklyGradeTrend(gradePoints, todayKey);

    const lastImprovementNote =
      summaries.find(
        (summary) => summary.improvementNote !== null && summary.improvementNote.trim() !== "",
      )?.improvementNote ?? null;

    const followedCount = summaries.filter((summary) => summary.followedPlan).length;
    const offPlaybookCount = summaries.filter(
      (summary) => summary.playbookMatch === "OFF_PLAYBOOK",
    ).length;

    return {
      stats: {
        closedTrades: closedCount,
        reviewedTrades: reviewedCount,
        pendingReviews: Math.max(0, closedCount - reviewedCount),
        reviewRatePct: closedCount > 0 ? round1((reviewedCount / closedCount) * 100) : 0,
        gradeDistribution: distribution,
        avgEntryQuality: meanQuality((summary) => summary.entryQuality),
        avgExitQuality: meanQuality((summary) => summary.exitQuality),
        avgRiskManagement: meanQuality((summary) => summary.riskManagement),
        lessonsCaptured: lessons.lessons.length,
        reviewStreakDays: streak.effectiveDays,
        followedPlanPct: reviewedCount > 0 ? round1((followedCount / reviewedCount) * 100) : null,
        offPlaybookCount,
      },
      // Goals engine: deferred to its own phase (cross-trade aggregation is
      // the Analytics boundary, §47). Honest zeros — no fabricated progress.
      goalsSummary: {
        total: 0,
        achieved: 0,
        onTrack: 0,
        atRisk: 0,
        behind: 0,
        avgProgressPct: null,
      },
      weeklyGradeTrend,
      recentLessons: lessons.lessons.slice(0, 6),
      pendingQueuePreview: pendingPreview.map(toReviewRowFromPending),
      streak,
      lastImprovementNote,
      meta: { generatedAt: isoDateTimeWire(now) },
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Resolve the client's plan-linkage intent (§25): keep / detach / link.
   * Linking validates plan OWNERSHIP (IDOR → 404) and symbol consistency
   * (a plan written for another instrument can never be the origin — 422),
   * then FREEZES the snapshot at save time (§26).
   */
  private async resolvePlanLinkage(
    userId: string,
    originTradePlanId: string | null | undefined,
    tradeSymbol: string,
    now: Date,
  ): Promise<PlanLinkage> {
    if (originTradePlanId === undefined) return { kind: "keep" };
    if (originTradePlanId === null) return { kind: "detach" };

    const plan = await this.planRepository.findPlanForUser(originTradePlanId, userId);
    if (plan === null) {
      throw new NotFoundError(
        "Trade plan does not exist (or is not yours).",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_PLAN_NOT_FOUND,
      );
    }
    if (plan.symbol !== tradeSymbol) {
      throw new BusinessRuleError(
        "The linked plan was written for a different symbol.",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_PLAN_MISMATCH,
      );
    }
    const snapshot = freezePlanSnapshot(
      {
        id: plan.id,
        status: plan.status,
        direction: plan.direction as "BUY" | "SELL",
        symbol: plan.symbol,
        currency: plan.currency,
        entryPrice: plan.entryPrice.toFixed(),
        stopLoss: plan.stopLoss === null ? null : plan.stopLoss.toFixed(),
        takeProfit: plan.takeProfit === null ? null : plan.takeProfit.toFixed(),
        sizeMode: plan.sizeMode,
        sizeValue: plan.sizeValue.toFixed(),
        riskAmount: plan.riskAmount === null ? null : plan.riskAmount.toFixed(),
        riskPercent: plan.riskPercent === null ? null : plan.riskPercent.toFixed(),
        positionSize: plan.positionSize === null ? null : plan.positionSize.toFixed(),
        rrRatio: plan.rrRatio === null ? null : plan.rrRatio.toFixed(),
      },
      now,
    );
    return { kind: "link", planId: plan.id, snapshot };
  }

  /** Pure comparison assembly from snapshot/live/none plan sources (§54). */
  private async buildComparison(
    trade: {
      symbol: string;
      direction: string;
      entryPrice: Prisma.Decimal;
      initialStop: Prisma.Decimal | null;
      initialTP: Prisma.Decimal | null;
      riskAmount: Prisma.Decimal | null;
      quantity: Prisma.Decimal;
      rMultiple: Prisma.Decimal | null;
    },
    livePlan: Awaited<ReturnType<TradePlanRepository["findPlanForUser"]>>,
    snapshot: ReturnType<typeof parsePlanSnapshot>,
  ) {
    const symbol = snapshot !== null ? snapshot.symbol : livePlan !== null ? livePlan.symbol : trade.symbol;
    const spec = await this.specs.findSpecification(symbol);
    const pipSize = spec === null ? null : spec.pipSize.toFixed();

    const tradeInput = {
      direction: trade.direction as "BUY" | "SELL",
      entryPrice: trade.entryPrice.toFixed(),
      initialStop: trade.initialStop === null ? null : trade.initialStop.toFixed(),
      initialTP: trade.initialTP === null ? null : trade.initialTP.toFixed(),
      riskAmount: trade.riskAmount === null ? null : trade.riskAmount.toFixed(),
      quantity: trade.quantity.toFixed(),
      rMultiple: trade.rMultiple === null ? null : trade.rMultiple.toFixed(),
    };

    if (snapshot !== null) {
      return comparePlanAgainstTrade(
        {
          direction: snapshot.direction,
          entryPrice: snapshot.entryPrice,
          stopLoss: snapshot.stopLoss,
          takeProfit: snapshot.takeProfit,
          riskAmount: snapshot.riskAmount,
          positionSize: snapshot.positionSize,
          rrRatio: snapshot.rrRatio,
        },
        tradeInput,
        { pipSize },
        "SNAPSHOT",
      );
    }
    if (livePlan !== null) {
      // Defensive legacy path: a linked plan whose snapshot JSON is missing.
      return comparePlanAgainstTrade(
        {
          direction: livePlan.direction as "BUY" | "SELL",
          entryPrice: livePlan.entryPrice.toFixed(),
          stopLoss: livePlan.stopLoss === null ? null : livePlan.stopLoss.toFixed(),
          takeProfit: livePlan.takeProfit === null ? null : livePlan.takeProfit.toFixed(),
          riskAmount: livePlan.riskAmount === null ? null : livePlan.riskAmount.toFixed(),
          positionSize: livePlan.positionSize === null ? null : livePlan.positionSize.toFixed(),
          rrRatio: livePlan.rrRatio === null ? null : livePlan.rrRatio.toFixed(),
        },
        tradeInput,
        { pipSize },
        "LIVE",
      );
    }
    return comparePlanAgainstTrade(null, tradeInput, { pipSize }, "NONE");
  }

  /** The workspace join row must exist right after a successful write. */
  private requireJoinRow(join: ReviewedJoinRow | null): ReviewRow {
    if (join === null) {
      // Only possible if the trade was soft-deleted mid-request.
      throw new NotFoundError(
        "Trade does not exist (or is not yours).",
        TRADE_REVIEW_ERROR_CODES.TRADE_REVIEW_TRADE_NOT_FOUND,
      );
    }
    return toReviewRowFromReview(join);
  }
}

function dateKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
