/**
 * Trade Review application service (B8) — the post-trade workflow: one
 * review per trade (upsert), grade execution against the playbook, score
 * quality, capture THE lesson. Distinct from the pre-reveal decisionGrade
 * frozen on Trade. Also owns the read model rows (reviewed + pending),
 * the lessons library and the module overview aggregate.
 */
import { Injectable } from "@nestjs/common";
import { toTradingDateKey } from "../../shared/contracts";
import type { z } from "zod";
import {
  type upsertReviewInputSchema,
  type LessonsResponse,
  type ReviewsResponse,
  type ReviewRow as ReviewRowView,
  type TradeReview,
  type TradeReviewOverviewResponse,
} from "../../shared/contracts";
import { BusinessRuleError, NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { IdentityRepository } from "../identity/identity.repository";
import { AccountsRepository } from "../accounts/accounts.repository";
import { TradesRepository, type TradeRow } from "../trades/trades.repository";
import { dateKeyOf } from "../trades/trade-calculations";
import { ReviewRepository } from "./review.repository";
import { GoalService } from "./goal.service";
import { computeStreak, shiftDayKey } from "./review-domain";

const TRADING_ERROR = TRADE_ERROR_CODES;

type UpsertReviewInput = z.infer<typeof upsertReviewInputSchema>;

@Injectable()
export class ReviewService {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly trades: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly identity: IdentityRepository,
    private readonly goalService: GoalService,
  ) {}

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async timezoneOf(userId: string): Promise<string> {
    const user = await this.identity.findUserById(userId);
    if (user === null) {
      throw new NotFoundError("User not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return user.timezone;
  }

  private async currencyOf(userId: string): Promise<string> {
    const accounts = await this.accounts.listAccountsByUser(userId);
    return accounts[0]?.currency ?? "USD";
  }

  /** Read-model row for a REVIEWED trade. */
  private reviewedRowFor(
    review: TradeReview,
    trade: TradeRow,
    symbol: string | null,
    currency: string,
  ): ReviewRowView {
    return {
      tradeId: review.tradeId,
      symbol: symbol ?? "—",
      direction: trade.direction as ReviewRowView["direction"],
      tradingDate: dateKeyOf(trade.tradingDate),
      reviewStatus: "REVIEWED",
      decisionGrade: (trade.decisionGrade ?? null) as ReviewRowView["decisionGrade"],
      executionGrade: review.executionGrade,
      playbookMatch: review.playbookMatch,
      followedPlan: review.followedPlan,
      entryQuality: review.entryQuality,
      exitQuality: review.exitQuality,
      riskManagement: review.riskManagement,
      rMultiple: trade.rMultiple === null ? null : trade.rMultiple.toNumber(),
      pnlNet: trade.pnlNet === null ? null : trade.pnlNet.toNumber(),
      currency: currency as ReviewRowView["currency"],
      strategyName: null, // strategies belong to the playbook context (B10)
      setupName: null, // setups belong to the playbook context (B10)
      lesson: review.lessons,
      improvementNote: review.improvementNote,
      checklistResults: review.checklistResults,
      reviewedAt: review.reviewedAt,
    };
  }

  /** Read-model row for a PENDING (closed, unreviewed) trade. */
  private pendingRowFor(trade: TradeRow, symbol: string | null, currency: string): ReviewRowView {
    const snap = trade.checklistSnap;
    return {
      tradeId: trade.id,
      symbol: symbol ?? "—",
      direction: trade.direction as ReviewRowView["direction"],
      tradingDate: dateKeyOf(trade.tradingDate),
      reviewStatus: "PENDING",
      decisionGrade: (trade.decisionGrade ?? null) as ReviewRowView["decisionGrade"],
      executionGrade: null,
      playbookMatch: null,
      followedPlan: trade.followedPlan,
      entryQuality: null,
      exitQuality: null,
      riskManagement: null,
      rMultiple: trade.rMultiple === null ? null : trade.rMultiple.toNumber(),
      pnlNet: trade.pnlNet === null ? null : trade.pnlNet.toNumber(),
      currency: currency as ReviewRowView["currency"],
      strategyName: null,
      setupName: null,
      lesson: trade.lessons,
      improvementNote: null,
      // The frozen checklist (if any) seeds the review's pass/fail list.
      checklistResults:
        snap && typeof snap === "object" && !Array.isArray(snap)
          ? Object.entries(snap as Record<string, boolean>).map(([label, passed]) => ({
              label,
              passed: Boolean(passed),
            }))
          : null,
      reviewedAt: null,
    };
  }

  /** GET /reviews — every review row (pending + reviewed), newest day first. */
  async listReviews(userId: string): Promise<ReviewsResponse> {
    const currency = await this.currencyOf(userId);
    const [rows, trades] = await Promise.all([
      this.repository.listReviewsForUser(userId),
      this.trades.listTrades(userId, {}),
    ]);
    const tradeById = new Map(trades.map((t) => [t.id, t]));
    const reviewedTradeIds = new Set(rows.map((r) => r.tradeId));

    const symbols = await this.symbolsFor(trades);
    const readModel: ReviewRowView[] = [];
    for (const row of rows) {
      const review = row.data as unknown as TradeReview;
      const trade = tradeById.get(review.tradeId);
      if (trade === undefined) continue;
      readModel.push(this.reviewedRowFor(review, trade, symbols.get(review.tradeId) ?? null, currency));
    }
    for (const trade of trades) {
      if (trade.status !== "CLOSED" || reviewedTradeIds.has(trade.id)) continue;
      readModel.push(this.pendingRowFor(trade, symbols.get(trade.id) ?? null, currency));
    }
    readModel.sort((a, b) => b.tradingDate.localeCompare(a.tradingDate));
    // Legacy goals-keeping read model — the endpoint returns the FULL list
    // (no pagination), so the meta reports the served window honestly.
    return {
      reviews: readModel,
      meta: {
        total: readModel.length,
        page: 1,
        limit: readModel.length,
        hasMore: false,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private async symbolsFor(trades: TradeRow[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const instrumentIds = [...new Set(trades.map((t) => t.instrumentId))];
    for (const instrumentId of instrumentIds) {
      const instrument = await this.trades.findInstrument(instrumentId);
      if (instrument !== null) {
        map.set(instrumentId, instrument.symbol);
      }
    }
    // Project back to trade ids.
    const result = new Map<string, string>();
    for (const trade of trades) {
      const symbol = map.get(trade.instrumentId);
      if (symbol !== undefined) result.set(trade.id, symbol);
    }
    return result;
  }

  /** PUT /reviews/:tradeId — upsert the post-trade review. */
  async upsertReview(
    userId: string,
    tradeId: string,
    input: UpsertReviewInput,
  ): Promise<ReviewRowView> {
    const trade = await this.trades.findTradeForUser(tradeId, userId);
    if (trade === null) {
      throw new NotFoundError("Trade not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    if (trade.status !== "CLOSED") {
      throw new BusinessRuleError("Only closed trades can be reviewed", TRADING_ERROR.INVALID_TRADE_STATE);
    }

    const now = new Date().toISOString();
    const existing = await this.repository.findReviewByTrade(userId, tradeId);
    let review: TradeReview;
    if (existing !== null) {
      const current = existing.data as unknown as TradeReview;
      review = {
        ...current,
        executionGrade: input.executionGrade,
        followedPlan: input.followedPlan,
        playbookMatch: input.playbookMatch,
        checklistResults: input.checklistResults ?? current.checklistResults,
        entryQuality: input.entryQuality ?? current.entryQuality,
        exitQuality: input.exitQuality ?? current.exitQuality,
        riskManagement: input.riskManagement ?? current.riskManagement,
        lessons: input.lessons,
        improvementNote: input.improvementNote ?? current.improvementNote,
        updatedAt: now,
      };
      await this.repository.updateData(existing.id, review as unknown as never);
    } else {
      review = {
        id: crypto.randomUUID(),
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
        reviewedAt: now,
        updatedAt: now,
      };
      await this.repository.insertReview(userId, tradeId, review as unknown as never);
    }

    // Keep the trade's own written trace in sync so Analytics stays coherent.
    await this.trades.updateTradeFields(trade.id, {
      lessons: input.lessons,
      followedPlan: input.followedPlan,
    });

    const instrument = await this.trades.findInstrument(trade.instrumentId);
    const currency = await this.currencyOf(userId);
    return this.reviewedRowFor(review, trade, instrument?.symbol ?? null, currency);
  }

  /** DELETE /reviews/:tradeId — undo a review (trade returns to pending). */
  async deleteReview(userId: string, tradeId: string): Promise<{ ok: true }> {
    const existing = await this.repository.findReviewByTrade(userId, tradeId);
    if (existing === null) {
      throw new NotFoundError("Review not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRow(existing.id);
    return { ok: true };
  }

  /** GET /reviews/lessons — the lessons library (union of all sources). */
  async listLessons(userId: string): Promise<LessonsResponse> {
    const [rows, trades] = await Promise.all([
      this.repository.listReviewsForUser(userId),
      this.trades.listTrades(userId, {}),
    ]);
    const tradeById = new Map(trades.map((t) => [t.id, t]));
    const symbols = await this.symbolsFor(trades);
    const reviewedTradeIds = new Set(rows.map((r) => r.tradeId));

    const entries: LessonsResponse["lessons"] = [];
    for (const row of rows) {
      const review = row.data as unknown as TradeReview;
      const trade = tradeById.get(review.tradeId);
      if (trade === undefined) continue;
      entries.push({
        id: review.id,
        source: "REVIEW",
        tradeId: review.tradeId,
        date: dateKeyOf(trade.tradingDate),
        text: review.lessons,
        symbol: symbols.get(review.tradeId) ?? null,
        executionGrade: review.executionGrade,
        rMultiple: trade.rMultiple === null ? null : trade.rMultiple.toNumber(),
        strategyName: null,
      });
    }
    for (const trade of trades) {
      if (trade.status !== "CLOSED" || trade.lessons === null || reviewedTradeIds.has(trade.id)) {
        continue;
      }
      entries.push({
        id: trade.id,
        source: "TRADE_NOTE",
        tradeId: trade.id,
        date: dateKeyOf(trade.tradingDate),
        text: trade.lessons,
        symbol: symbols.get(trade.id) ?? null,
        executionGrade: (trade.decisionGrade ?? null) as TradeReview["executionGrade"],
        rMultiple: trade.rMultiple === null ? null : trade.rMultiple.toNumber(),
        strategyName: null,
      });
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return { lessons: entries };
  }

  /** GET /reviews/overview — the module's aggregate (one shot). */
  async overview(userId: string): Promise<TradeReviewOverviewResponse> {
    const tz = await this.timezoneOf(userId);
    const currency = await this.currencyOf(userId);
    const today = toTradingDateKey(new Date().toISOString(), tz);

    const [rows, trades] = await Promise.all([
      this.repository.listReviewsForUser(userId),
      this.trades.listTrades(userId, {}),
    ]);
    const reviews = rows.map((r) => r.data as unknown as TradeReview);
    const closed = trades.filter((t) => t.status === "CLOSED");
    const reviewedCount = reviews.length;
    const pending = closed.length - reviewedCount;

    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const review of reviews) distribution[review.executionGrade] += 1;

    const meanQuality = (pick: (r: TradeReview) => number | null): number | null => {
      const values = reviews.map(pick).filter((v): v is number => v !== null);
      return values.length > 0 ? this.round1(values.reduce((s, v) => s + v, 0) / values.length) : null;
    };

    const reviewDays = new Set(
      reviews.map((r) => toTradingDateKey(r.reviewedAt, tz)),
    );
    const streak = computeStreak(reviewDays, today);

    // Recurring-lesson template source — the most recent next-time note.
    const lastImprovementNote =
      [...reviews]
        .filter((r) => r.improvementNote !== null && r.improvementNote.trim() !== "")
        .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0]?.improvementNote ?? null;

    const gradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const currentMondayOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const currentWeekStart = shiftDayKey(today, -currentMondayOffset);
    const weeklyGradeTrend: TradeReviewOverviewResponse["weeklyGradeTrend"] = [];
    for (let weekOffset = 7; weekOffset >= 0; weekOffset -= 1) {
      const weekStart = shiftDayKey(currentWeekStart, -weekOffset * 7);
      const weekEnd = shiftDayKey(weekStart, 6);
      const weekReviews = reviews.filter((r) => {
        const day = toTradingDateKey(r.reviewedAt, tz);
        return day >= weekStart && day <= weekEnd;
      });
      if (weekReviews.length === 0) continue;
      weeklyGradeTrend.push({
        weekStart,
        avgPoints: this.round2(
          weekReviews.reduce((sum, r) => sum + gradePoints[r.executionGrade]!, 0) /
            weekReviews.length,
        ),
        reviews: weekReviews.length,
      });
    }

    const lessons = await this.listLessons(userId);
    const reviewList = await this.listReviews(userId);
    const pendingRows = reviewList.reviews
      .filter((row) => row.reviewStatus === "PENDING")
      .slice(0, 5);

    // Goals summary — computed with the same engine as GET /goals.
    const goalRows = await this.repository.listByKind(userId, "GOAL");
    const progressRows = [];
    for (const row of goalRows) {
      progressRows.push(
        await this.goalService.goalProgressFor(
          userId,
          row.data as unknown as Parameters<GoalService["goalProgressFor"]>[1],
          currency,
          today,
        ),
      );
    }
    const activeProgress = progressRows.filter((row) => row.goal.active);
    const progressValues = activeProgress
      .map((row) => row.progress.progressPct)
      .filter((v): v is number => v !== null);
    const goalsSummary = {
      total: activeProgress.length,
      achieved: activeProgress.filter((row) => row.progress.status === "ACHIEVED").length,
      onTrack: activeProgress.filter((row) => row.progress.status === "ON_TRACK").length,
      atRisk: activeProgress.filter((row) => row.progress.status === "AT_RISK").length,
      behind: activeProgress.filter((row) => row.progress.status === "BEHIND").length,
      avgProgressPct:
        progressValues.length > 0
          ? this.round1(progressValues.reduce((s, v) => s + v, 0) / progressValues.length)
          : null,
    };

    const followedKnown = reviews.filter((r) => typeof r.followedPlan === "boolean");
    const followedCount = followedKnown.filter((r) => r.followedPlan === true).length;

    return {
      stats: {
        closedTrades: closed.length,
        reviewedTrades: reviewedCount,
        pendingReviews: Math.max(0, pending),
        reviewRatePct: closed.length > 0 ? this.round1((reviewedCount / closed.length) * 100) : 0,
        gradeDistribution: distribution,
        avgEntryQuality: meanQuality((r) => r.entryQuality),
        avgExitQuality: meanQuality((r) => r.exitQuality),
        avgRiskManagement: meanQuality((r) => r.riskManagement),
        lessonsCaptured: lessons.lessons.length,
        reviewStreakDays: streak.effectiveDays,
        followedPlanPct:
          followedKnown.length > 0 ? this.round1((followedCount / followedKnown.length) * 100) : null,
        offPlaybookCount: reviews.filter((r) => r.playbookMatch === "OFF_PLAYBOOK").length,
      },
      goalsSummary,
      weeklyGradeTrend,
      recentLessons: lessons.lessons.slice(0, 6),
      pendingQueuePreview: pendingRows,
      streak,
      lastImprovementNote,
      meta: { generatedAt: new Date().toISOString() },
    } as TradeReviewOverviewResponse;
  }
}
