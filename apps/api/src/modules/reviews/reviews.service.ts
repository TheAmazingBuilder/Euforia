/**
 * Trade Review workspace + Goals service - the structured post-trade review
 * workflow and the computed goal-progress engine. Ported from the mock
 * store: the reviews list merges REVIEWED rows + PENDING closed trades, the
 * upsert keeps the trade's own lessons/followedPlan in sync, the lessons
 * library unions review lessons with trade-note lessons, and the goal
 * progress engine paces each metric against its calendar period with
 * direction-aware status (AT_RISK / ON_TRACK / BEHIND / ACHIEVED).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { toDecimalString } from "../../shared/contracts";
import type {
  CreateGoalInput,
  GoalWithProgress,
  GoalsResponse,
  LessonEntry,
  LessonsResponse,
  ReviewRow,
  ReviewsResponse,
  TradeReviewOverviewResponse,
  UpdateGoalInput,
  UpsertReviewInput,
} from "../../shared/contracts";
import type { Goal, GoalMetric, GoalPeriod, GoalStatus } from "../../shared/contracts";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/app-error";
import { dayDiff, num, round1, round2, shiftDayKeyBy } from "../stats/stats.helpers";

const METRIC_SHAPE: Record<GoalMetric, { direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"; unit: "PERCENT" | "R" | "MONEY" | "COUNT" | "SCORE" }> = {
  WIN_RATE: { direction: "HIGHER_IS_BETTER", unit: "PERCENT" },
  R_EARNED: { direction: "HIGHER_IS_BETTER", unit: "R" },
  AVG_R: { direction: "HIGHER_IS_BETTER", unit: "R" },
  PROFIT_TARGET: { direction: "HIGHER_IS_BETTER", unit: "MONEY" },
  DISCIPLINE_SCORE: { direction: "HIGHER_IS_BETTER", unit: "SCORE" },
  FOLLOWED_PLAN_PCT: { direction: "HIGHER_IS_BETTER", unit: "PERCENT" },
  MAX_TRADES_PER_DAY: { direction: "LOWER_IS_BETTER", unit: "COUNT" },
  MAX_DAILY_LOSS_R: { direction: "HIGHER_IS_BETTER", unit: "R" },
};

interface ResolvedPeriod {
  from: string;
  to: string;
  daysElapsed: number;
  daysTotal: number;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reviews list ───────────────────────────────────────────────────────────

  async list(userId: string): Promise<ReviewsResponse> {
    const [trades, reviewRows, strategyRows, mainAccount] = await Promise.all([
      this.prisma.trade.findMany({ where: { userId, deletedAt: null }, include: { instrument: true } }),
      this.prisma.reviewEntry.findMany({ where: { userId } }),
      this.prisma.strategy.findMany({ where: { userId } }),
      this.prisma.tradingAccount.findFirst({ where: { userId, isDefault: true } }),
    ]);
    const tradeById = new Map(trades.map((t) => [t.id, t]));
    const strategyName = (id: string | null): string | null =>
      id === null ? null : strategyRows.find((s) => s.id === id)?.name ?? null;
    const reviewed = new Set(reviewRows.map((r) => r.tradeId));
    const currency = (mainAccount?.currency ?? "USD") as ReviewsResponse["reviews"][number]["currency"];

    const rows: ReviewRow[] = [];
    for (const review of reviewRows) {
      const trade = review.tradeId === null ? undefined : tradeById.get(review.tradeId);
      if (!trade) continue;
      rows.push(this.reviewedRow(review as { id: string; tradeId: string; payload: Prisma.JsonValue; createdAt: Date; updatedAt: Date }, trade, strategyName, currency));
    }
    for (const trade of trades) {
      if (trade.status !== "CLOSED" || reviewed.has(trade.id)) continue;
      rows.push(this.pendingRow(trade, strategyName, currency));
    }
    rows.sort((a, b) => b.tradingDate.localeCompare(a.tradingDate));
    return { reviews: rows, meta: { generatedAt: new Date().toISOString() } };
  }

  private reviewedRow(
    review: { id: string; tradeId: string; payload: Prisma.JsonValue; createdAt: Date; updatedAt: Date },
    trade: ReviewTradeRow,
    strategyName: (id: string | null) => string | null,
    currency: ReviewRow["currency"],
  ): ReviewRow {
    const p = review.payload as ReviewPayload;
    return {
      tradeId: review.tradeId,
      symbol: trade.instrument.symbol,
      direction: trade.direction as ReviewRow["direction"],
      tradingDate: trade.tradingDate.toISOString().slice(0, 10),
      reviewStatus: "REVIEWED",
      decisionGrade: trade.decisionGrade as ReviewRow["decisionGrade"],
      executionGrade: p.executionGrade ?? null,
      playbookMatch: p.playbookMatch ?? null,
      followedPlan: p.followedPlan ?? null,
      entryQuality: p.entryQuality ?? null,
      exitQuality: p.exitQuality ?? null,
      riskManagement: p.riskManagement ?? null,
      rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
      pnlNet: trade.pnlNet === null ? null : Number(trade.pnlNet),
      currency,
      strategyName: strategyName(trade.strategyId),
      setupName: null,
      lesson: p.lessons ?? null,
      improvementNote: p.improvementNote ?? null,
      checklistResults: p.checklistResults ?? null,
      reviewedAt: (p.reviewedAt ?? review.createdAt.toISOString()),
    };
  }

  private pendingRow(trade: ReviewTradeRow, strategyName: (id: string | null) => string | null, currency: ReviewRow["currency"]): ReviewRow {
    const checklistSnap = trade.checklistSnap;
    return {
      tradeId: trade.id,
      symbol: trade.instrument.symbol,
      direction: trade.direction as ReviewRow["direction"],
      tradingDate: trade.tradingDate.toISOString().slice(0, 10),
      reviewStatus: "PENDING",
      decisionGrade: trade.decisionGrade as ReviewRow["decisionGrade"],
      executionGrade: null,
      playbookMatch: null,
      followedPlan: trade.followedPlan,
      entryQuality: null,
      exitQuality: null,
      riskManagement: null,
      rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
      pnlNet: trade.pnlNet === null ? null : Number(trade.pnlNet),
      currency,
      strategyName: strategyName(trade.strategyId),
      setupName: null,
      lesson: trade.lessons,
      improvementNote: null,
      checklistResults:
        checklistSnap && typeof checklistSnap === "object" && !Array.isArray(checklistSnap)
          ? Object.entries(checklistSnap as Record<string, boolean>).map(([label, passed]) => ({
              label,
              passed: Boolean(passed),
            }))
          : null,
      reviewedAt: null,
    };
  }

  // ── Upsert / delete ────────────────────────────────────────────────────────

  async upsert(userId: string, input: UpsertReviewInput): Promise<ReviewRow> {
    const trade = await this.prisma.trade.findFirst({ where: { id: input.tradeId, userId, deletedAt: null }, include: { instrument: true } });
    if (trade === null) throw new NotFoundError("Trade not found", "TRADE_NOT_FOUND");
    if (trade.status !== "CLOSED") {
      throw new BusinessRuleError("Only closed trades can be reviewed", "REVIEW_TRADE_NOT_CLOSED");
    }
    const now = new Date().toISOString();
    const existing = await this.prisma.reviewEntry.findFirst({ where: { userId, tradeId: trade.id } });
    if (existing !== null) {
      const p = existing.payload as ReviewPayload;
      const payload = {
        ...p,
        executionGrade: input.executionGrade,
        followedPlan: input.followedPlan,
        playbookMatch: input.playbookMatch,
        checklistResults: input.checklistResults ?? p.checklistResults ?? null,
        entryQuality: input.entryQuality ?? p.entryQuality ?? null,
        exitQuality: input.exitQuality ?? p.exitQuality ?? null,
        riskManagement: input.riskManagement ?? p.riskManagement ?? null,
        lessons: input.lessons,
        improvementNote: input.improvementNote ?? p.improvementNote ?? null,
        reviewedAt: p.reviewedAt ?? now,
      } as Prisma.InputJsonValue;
      await this.prisma.reviewEntry.update({ where: { id: existing.id }, data: { payload } });
    } else {
      await this.prisma.reviewEntry.create({
        data: {
          id: randomUUID(),
          userId,
          tradeId: trade.id,
          payload: {
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
          } as Prisma.InputJsonValue,
        },
      });
    }
    // Keep the trade's own written trace in sync (Analytics coherence).
    await this.prisma.trade.update({
      where: { id: trade.id },
      data: { lessons: input.lessons, followedPlan: input.followedPlan },
    });
    const response = await this.list(userId);
    return response.reviews.find((row) => row.tradeId === trade.id && row.reviewStatus === "REVIEWED")!;
  }

  async remove(userId: string, tradeId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.reviewEntry.findFirst({ where: { userId, tradeId } });
    if (existing === null) throw new NotFoundError("Review not found", "REVIEW_NOT_FOUND");
    await this.prisma.reviewEntry.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // ── Lessons library ────────────────────────────────────────────────────────

  async lessons(userId: string): Promise<LessonsResponse> {
    const [trades, reviewRows, strategyRows] = await Promise.all([
      this.prisma.trade.findMany({ where: { userId, deletedAt: null }, include: { instrument: true } }),
      this.prisma.reviewEntry.findMany({ where: { userId } }),
      this.prisma.strategy.findMany({ where: { userId } }),
    ]);
    const tradeById = new Map(trades.map((t) => [t.id, t]));
    const strategyName = (id: string | null): string | null =>
      id === null ? null : strategyRows.find((s) => s.id === id)?.name ?? null;
    const reviewed = new Set(reviewRows.map((r) => r.tradeId));
    const entries: LessonEntry[] = [];
    for (const review of reviewRows) {
      const trade = review.tradeId === null ? undefined : tradeById.get(review.tradeId);
      if (!trade) continue;
      const p = review.payload as ReviewPayload;
      entries.push({
        id: review.id,
        source: "REVIEW",
        tradeId: review.tradeId,
        date: trade.tradingDate.toISOString().slice(0, 10),
        text: p.lessons ?? "-",
        symbol: trade.instrument.symbol,
        executionGrade: p.executionGrade ?? null,
        rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
        strategyName: strategyName(trade.strategyId),
      });
    }
    for (const trade of trades) {
      if (trade.status !== "CLOSED" || trade.lessons === null || reviewed.has(trade.id)) continue;
      entries.push({
        id: `note-${trade.id}`,
        source: "TRADE_NOTE",
        tradeId: trade.id,
        date: trade.tradingDate.toISOString().slice(0, 10),
        text: trade.lessons,
        symbol: trade.instrument.symbol,
        executionGrade: trade.decisionGrade as LessonEntry["executionGrade"],
        rMultiple: trade.rMultiple === null ? null : Number(trade.rMultiple),
        strategyName: strategyName(trade.strategyId),
      });
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return { lessons: entries };
  }

  // ── Overview ───────────────────────────────────────────────────────────────

  async overview(userId: string): Promise<TradeReviewOverviewResponse> {
    const [listResponse, lessonsResponse, goals] = await Promise.all([
      this.list(userId),
      this.lessons(userId),
      this.prisma.goal.findMany({ where: { userId } }),
    ]);
    const rows = listResponse.reviews;
    const reviewed = rows.filter((r) => r.reviewStatus === "REVIEWED");
    const pendingRows = rows.filter((row) => row.reviewStatus === "PENDING");

    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const review of reviewed) {
      if (review.executionGrade !== null) distribution[review.executionGrade] += 1;
    }
    const meanQuality = (pick: (r: ReviewRow) => number | null): number | null => {
      const values = reviewed.map(pick).filter((v): v is number => v !== null);
      return values.length > 0 ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null;
    };

    const today = new Date().toISOString().slice(0, 10);
    const reviewDays = new Set(reviewed.filter((r) => r.reviewedAt !== null).map((r) => r.reviewedAt!.slice(0, 10)));
    const mondayOf = (dayKey: string): string => {
      const offset = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
      return shiftDayKeyBy(dayKey, -offset);
    };
    let streakStart = today;
    if (!reviewDays.has(streakStart)) streakStart = shiftDayKeyBy(today, -1);
    let currentDays = 0;
    let frozenDays = 0;
    const frozenWeeks = new Set<string>();
    if (reviewDays.has(streakStart)) {
      let cursor = streakStart;
      for (;;) {
        if (reviewDays.has(cursor)) {
          currentDays += 1;
          cursor = shiftDayKeyBy(cursor, -1);
          continue;
        }
        const previousDay = shiftDayKeyBy(cursor, -1);
        if (reviewDays.has(previousDay)) {
          const weekKey = mondayOf(cursor);
          if (!frozenWeeks.has(weekKey)) {
            frozenWeeks.add(weekKey);
            frozenDays += 1;
            cursor = previousDay;
            continue;
          }
        }
        break;
      }
    }
    const sortedReviewDays = [...reviewDays].sort();
    let longestStreak = 0;
    let run = 0;
    let previousDay2: string | null = null;
    for (const day of sortedReviewDays) {
      run = previousDay2 !== null && shiftDayKeyBy(previousDay2, 1) === day ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      previousDay2 = day;
    }
    const reviewStreak = {
      currentDays,
      frozenDays,
      effectiveDays: currentDays + frozenDays,
      freezesUsedThisWeek: frozenWeeks.has(mondayOf(today)) ? (1 as const) : (0 as const),
      gracePerWeek: 1 as const,
      longestStreak,
    };

    const gradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const weeklyGradeTrend: TradeReviewOverviewResponse["weeklyGradeTrend"] = [];
    const currentMondayOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const currentWeekStart = shiftDayKeyBy(today, -currentMondayOffset);
    for (let weekOffset = 7; weekOffset >= 0; weekOffset -= 1) {
      const weekStart = shiftDayKeyBy(currentWeekStart, -weekOffset * 7);
      const weekEnd = shiftDayKeyBy(weekStart, 6);
      const weekReviews = reviewed.filter((r) => {
        const day = r.reviewedAt === null ? "" : r.reviewedAt.slice(0, 10);
        return day >= weekStart && day <= weekEnd && r.executionGrade !== null;
      });
      if (weekReviews.length === 0) continue;
      weeklyGradeTrend.push({
        weekStart,
        avgPoints: round2(weekReviews.reduce((sum, r) => sum + gradePoints[r.executionGrade!]!, 0) / weekReviews.length),
        reviews: weekReviews.length,
      });
    }

    const progressRows = await Promise.all(goals.filter((g) => g.active).map((g) => this.goalProgress(g)));
    const progressValues = progressRows.map((row) => row.progress.progressPct).filter((v): v is number => v !== null);
    const goalsSummary = {
      total: progressRows.length,
      achieved: progressRows.filter((row) => row.progress.status === "ACHIEVED").length,
      onTrack: progressRows.filter((row) => row.progress.status === "ON_TRACK").length,
      atRisk: progressRows.filter((row) => row.progress.status === "AT_RISK").length,
      behind: progressRows.filter((row) => row.progress.status === "BEHIND").length,
      avgProgressPct: progressValues.length > 0 ? round1(progressValues.reduce((s, v) => s + v, 0) / progressValues.length) : null,
    };

    const followedKnown = reviewed.filter((r) => typeof r.followedPlan === "boolean");
    const followedCount = followedKnown.filter((r) => r.followedPlan === true).length;
    const reviewedCount = reviewed.length;
    const closedCount = rows.filter((r) => r.reviewStatus === "REVIEWED" || true).length;

    return {
      stats: {
        closedTrades: closedCount,
        reviewedTrades: reviewedCount,
        pendingReviews: pendingRows.length,
        reviewRatePct: closedCount > 0 ? round1((reviewedCount / closedCount) * 100) : 0,
        gradeDistribution: distribution,
        avgEntryQuality: meanQuality((r) => r.entryQuality),
        avgExitQuality: meanQuality((r) => r.exitQuality),
        avgRiskManagement: meanQuality((r) => r.riskManagement),
        lessonsCaptured: lessonsResponse.lessons.length,
        reviewStreakDays: reviewStreak.effectiveDays,
        followedPlanPct: followedKnown.length > 0 ? round1((followedCount / followedKnown.length) * 100) : null,
        offPlaybookCount: reviewed.filter((r) => r.playbookMatch === "OFF_PLAYBOOK").length,
      },
      goalsSummary,
      weeklyGradeTrend,
      recentLessons: lessonsResponse.lessons.slice(0, 6),
      pendingQueuePreview: pendingRows.slice(0, 5),
      streak: reviewStreak,
      lastImprovementNote:
        reviewed
          .filter((r) => r.improvementNote !== null && r.improvementNote.trim() !== "")
          .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))[0]?.improvementNote ?? null,
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  // ── Goals CRUD + progress engine ───────────────────────────────────────────

  async listGoals(userId: string): Promise<GoalsResponse> {
    const goals = await this.prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return { goals: await Promise.all(goals.map((g) => this.goalProgress(g))) };
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<GoalWithProgress> {
    const now = new Date().toISOString();
    const created = await this.prisma.goal.create({
      data: goalRow(userId, { id: randomUUID(), userId, title: input.title, metric: input.metric, target: input.target, period: input.period, color: input.color, active: input.active ?? true, createdAt: now, updatedAt: now }),
    });
    return this.goalProgress(created);
  }

  async updateGoal(userId: string, goalId: string, input: UpdateGoalInput): Promise<GoalWithProgress> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (goal === null) throw new NotFoundError("Goal not found", "GOAL_NOT_FOUND");
    const merged: Goal = {
      id: goal.id,
      userId,
      title: input.title ?? goal.title,
      metric: (input.metric ?? goal.metric) as Goal["metric"],
      target: input.target ?? Number(goal.target),
      period: (input.period ?? goal.period) as Goal["period"],
      color: (input.color ?? goal.color) as Goal["color"],
      active: input.active ?? goal.active,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = await this.prisma.goal.update({ where: { id: goalId }, data: goalRow(userId, merged) });
    return this.goalProgress(updated);
  }

  async deleteGoal(userId: string, goalId: string): Promise<{ ok: true }> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (goal === null) throw new NotFoundError("Goal not found", "GOAL_NOT_FOUND");
    await this.prisma.goal.delete({ where: { id: goalId } });
    return { ok: true };
  }

  private async goalProgress(goal: {
    id: string;
    userId: string;
    title: string;
    metric: string;
    target: Prisma.Decimal;
    period: string;
    color: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<GoalWithProgress> {
    const metric = goal.metric as GoalMetric;
    const shape = METRIC_SHAPE[metric];
    const period = goal.period as GoalPeriod;
    const today = new Date().toISOString().slice(0, 10);
    const window = resolvePeriodFor(period, today);
    const daysTotal = dayDiff(window.from, window.to) + 1;
    const daysElapsed = Math.min(daysTotal, Math.max(0, dayDiff(window.from, today) + 1));
    const resolved: ResolvedPeriod = { from: window.from, to: window.to, daysElapsed, daysTotal };

    const [trades, stats] = await Promise.all([
      this.prisma.trade.findMany({ where: { userId: goal.userId, deletedAt: null, status: "CLOSED" } }),
      this.prisma.dailyStat.findMany({ where: { userId: goal.userId, disciplineScore: { not: null } } }),
    ]);
    const current = computeMetricActual(metric, resolved.from, resolved.to, trades, stats);
    const prevWindow = resolvePeriodFor(periodOf(resolved), shiftDayKeyBy(resolved.from, -1));
    const previous = computeMetricActual(metric, prevWindow.from, prevWindow.to, trades, stats).actual;

    const target = Number(goal.target);
    const timePct = Math.min(1, Math.max(0, resolved.daysElapsed) / resolved.daysTotal);
    let progressPct: number | null = null;
    let status: GoalStatus = "PENDING";
    const actual = current.actual;

    if (actual !== null) {
      if (shape.direction === "LOWER_IS_BETTER") {
        if (actual <= target) {
          progressPct = 100;
          status = "ON_TRACK";
        } else {
          progressPct = Math.max(0, Math.min(100, round1((target / actual) * 100)));
          status = "BEHIND";
        }
      } else if (target < 0) {
        if (actual >= target) {
          progressPct = 100;
          status = "ON_TRACK";
        } else {
          const depth = Math.abs(((target - actual) / Math.abs(target)) * 100);
          progressPct = Math.max(0, Math.min(100, round1(100 - depth)));
          status = "BEHIND";
        }
      } else {
        progressPct = Math.max(0, Math.min(100, round1((actual / target) * 100)));
        if (actual >= target) {
          status = "ACHIEVED";
        } else {
          const expected = timePct * 100;
          const ratio = expected > 0 ? progressPct / expected : progressPct > 0 ? 2 : 0;
          if (progressPct === 0 && timePct <= 0.15) status = "ON_TRACK";
          else if (ratio >= 0.9) status = "ON_TRACK";
          else if (ratio >= 0.55) status = "AT_RISK";
          else status = "BEHIND";
        }
      }
    }

    const fmt = (value: number): string => {
      if (shape.unit === "PERCENT") return `${round1(value)}%`;
      if (shape.unit === "R") return `${round2(value)}R`;
      if (shape.unit === "MONEY") return `$${Math.round(value).toLocaleString("en-US")}`;
      if (shape.unit === "COUNT") return `${Math.round(value)}`;
      return `${round1(value)}`;
    };
    const targetWord = shape.direction === "LOWER_IS_BETTER" ? "max" : metric === "MAX_DAILY_LOSS_R" ? "floor" : "target";
    const detail = actual === null
      ? `No data yet this ${period.toLowerCase()} - the sample is empty`
      : `${fmt(actual)} vs ${fmt(target)} ${targetWord}`;

    return {
      goal: {
        id: goal.id,
        userId: goal.userId,
        title: goal.title,
        metric,
        target,
        period,
        color: (goal.color ?? "BLUE") as GoalWithProgress["goal"]["color"],
        active: goal.active,
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
      },
      progress: {
        goalId: goal.id,
        metric,
        direction: shape.direction,
        unit: shape.unit,
        currency: shape.unit === "MONEY" ? "USD" : null,
        actual,
        previous,
        progressPct,
        status,
        periodStart: resolved.from,
        periodEnd: resolved.to,
        daysElapsed: Math.min(resolved.daysElapsed, resolved.daysTotal),
        daysTotal: resolved.daysTotal,
        sampleSize: current.sampleSize,
        detail,
      },
    };
  }
}

// ── Period/metric helpers (pure) ─────────────────────────────────────────────

function resolvePeriodFor(period: GoalPeriod, refDay: string): { from: string; to: string } {
  const [y, m] = refDay.split("-").map(Number) as [number, number];
  const utc = (year: number, month: number, day: number): string =>
    new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (period === "WEEK") {
    const weekday = new Date(`${refDay}T00:00:00Z`).getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    const from = shiftDayKeyBy(refDay, -mondayOffset);
    return { from, to: shiftDayKeyBy(from, 6) };
  }
  if (period === "MONTH") {
    return { from: utc(y, m, 1), to: utc(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()) };
  }
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  const qEndMonth = qStart + 2;
  return { from: utc(y, qStart, 1), to: utc(y, qEndMonth, new Date(Date.UTC(y, qEndMonth, 0)).getUTCDate()) };
}

function periodOf(period: ResolvedPeriod): GoalPeriod {
  return period.daysTotal <= 7 ? "WEEK" : period.daysTotal <= 31 ? "MONTH" : "QUARTER";
}

interface MetricTrade {
  tradingDate: Date;
  status: string;
  rMultiple: Prisma.Decimal | null;
  pnlNet: Prisma.Decimal | null;
  followedPlan: boolean | null;
}

function computeMetricActual(
  metric: GoalMetric,
  from: string,
  to: string,
  trades: MetricTrade[],
  stats: { date: Date; disciplineScore: Prisma.Decimal | null }[],
): { actual: number | null; sampleSize: number } {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const inRange = closed.filter((t) => {
    const key = t.tradingDate.toISOString().slice(0, 10);
    return key >= from && key <= to;
  });
  const statRows = stats
    .map((s) => ({ date: s.date.toISOString().slice(0, 10), score: s.disciplineScore === null ? null : Number(s.disciplineScore) }))
    .filter((s) => s.date >= from && s.date <= to && s.score !== null);

  const sumR = inRange.reduce((sum, t) => sum + num(t.rMultiple ? t.rMultiple.toString() : null), 0);
  const perDayR = new Map<string, number>();
  for (const trade of inRange) {
    const key = trade.tradingDate.toISOString().slice(0, 10);
    perDayR.set(key, (perDayR.get(key) ?? 0) + num(trade.rMultiple ? trade.rMultiple.toString() : null));
  }

  switch (metric) {
    case "WIN_RATE": {
      const wins = inRange.filter((t) => num(t.pnlNet ? t.pnlNet.toString() : null) > 0).length;
      return { actual: inRange.length > 0 ? round1((wins / inRange.length) * 100) : null, sampleSize: inRange.length };
    }
    case "R_EARNED":
      return { actual: inRange.length > 0 ? round2(sumR) : null, sampleSize: inRange.length };
    case "AVG_R":
      return { actual: inRange.length > 0 ? round2(sumR / inRange.length) : null, sampleSize: inRange.length };
    case "PROFIT_TARGET": {
      const net = inRange.reduce((sum, t) => sum + num(t.pnlNet ? t.pnlNet.toString() : null), 0);
      return { actual: inRange.length > 0 ? round2(net) : null, sampleSize: inRange.length };
    }
    case "DISCIPLINE_SCORE":
      return {
        actual: statRows.length > 0 ? round1(statRows.reduce((sum, s) => sum + (s.score ?? 0), 0) / statRows.length) : null,
        sampleSize: statRows.length,
      };
    case "FOLLOWED_PLAN_PCT": {
      const known = inRange.filter((t) => t.followedPlan !== null);
      const followed = known.filter((t) => t.followedPlan === true).length;
      return { actual: known.length > 0 ? round1((followed / known.length) * 100) : null, sampleSize: known.length };
    }
    case "MAX_TRADES_PER_DAY": {
      const perDay = new Map<string, number>();
      for (const trade of inRange) {
        const key = trade.tradingDate.toISOString().slice(0, 10);
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }
      const worst = Math.max(0, ...perDay.values());
      return { actual: inRange.length > 0 ? worst : null, sampleSize: inRange.length };
    }
    case "MAX_DAILY_LOSS_R": {
      const values = [...perDayR.values()];
      const worst = values.length > 0 ? Math.min(0, ...values) : 0;
      return { actual: inRange.length > 0 ? round2(worst) : null, sampleSize: inRange.length };
    }
  }
}

function goalRow(
  userId: string,
  goal: Goal,
): Prisma.GoalUncheckedCreateInput {
  return {
    id: goal.id,
    userId,
    title: goal.title,
    metric: goal.metric,
    target: new Prisma.Decimal(goal.target),
    period: goal.period,
    color: goal.color,
    active: goal.active,
    payload: {},
    createdAt: new Date(goal.createdAt),
    updatedAt: new Date(goal.updatedAt),
  };
}

interface ReviewPayload {
  executionGrade?: ReviewRow["executionGrade"];
  followedPlan?: boolean;
  playbookMatch?: ReviewRow["playbookMatch"];
  checklistResults?: ReviewRow["checklistResults"];
  entryQuality?: number | null;
  exitQuality?: number | null;
  riskManagement?: number | null;
  lessons?: string;
  improvementNote?: string | null;
  reviewedAt?: string | null;
}

interface ReviewTradeRow {
  id: string;
  strategyId: string | null;
  direction: string;
  status: string;
  tradingDate: Date;
  decisionGrade: string | null;
  followedPlan: boolean | null;
  checklistSnap: Prisma.JsonValue | null;
  lessons: string | null;
  rMultiple: Prisma.Decimal | null;
  pnlNet: Prisma.Decimal | null;
  instrument: { symbol: string };
}

export { toDecimalString };
