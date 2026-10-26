/**
 * Goals application service (B8) - targets the trader sets; progress is
 * COMPUTED server-side from real trading behavior over a resolved calendar
 * period, never self-entered. 1:1 port of the mock engine's metric math
 * (direction/unit derived server-side; pacing vs elapsed time honest).
 */
import { Injectable } from "@nestjs/common";
import { toTradingDateKey } from "../../shared/contracts";
import type { z } from "zod";
import {
  type createGoalInputSchema,
  type updateGoalInputSchema,
  type Goal,
  type GoalMetric,
  type GoalPeriod,
  type GoalWithProgress,
  type GoalsResponse,
} from "../../shared/contracts";
import { NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { IdentityRepository } from "../identity/identity.repository";
import { AccountsRepository } from "../accounts/accounts.repository";
import { DisciplineService } from "../discipline/discipline.service";
import { TradesRepository } from "../trades/trades.repository";
import { dateKeyOf } from "../trades/trade-calculations";
import { ReviewRepository } from "./review.repository";
import { METRIC_SHAPE, previousWindow, resolvePeriod, type ResolvedPeriod } from "./review-domain";

const TRADING_ERROR = TRADE_ERROR_CODES;

type CreateGoalInput = z.infer<typeof createGoalInputSchema>;
type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>;

@Injectable()
export class GoalService {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly trades: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly identity: IdentityRepository,
    private readonly discipline: DisciplineService,
  ) {}

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  async todayKey(userId: string): Promise<string> {
    const user = await this.identity.findUserById(userId);
    if (user === null) {
      throw new NotFoundError("User not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return toTradingDateKey(new Date().toISOString(), user.timezone);
  }

  async currencyOf(userId: string): Promise<string> {
    const accounts = await this.accounts.listAccountsByUser(userId);
    return accounts[0]?.currency ?? "USD";
  }

  /** The metric's value over a window (mock's computeMetricActual). */
  async computeMetricActual(
    userId: string,
    metric: GoalMetric,
    from: string,
    to: string,
  ): Promise<{ actual: number | null; sampleSize: number }> {
    const all = await this.trades.listTrades(userId, {});
    const trades = all.filter((t) => {
      const key = dateKeyOf(t.tradingDate);
      return t.status === "CLOSED" && key >= from && key <= to;
    });
    const sumR = trades.reduce((sum, t) => sum + (t.rMultiple?.toNumber() ?? 0), 0);
    const perDayR = new Map<string, number>();
    for (const trade of trades) {
      const key = dateKeyOf(trade.tradingDate);
      perDayR.set(key, (perDayR.get(key) ?? 0) + (trade.rMultiple?.toNumber() ?? 0));
    }

    switch (metric) {
      case "WIN_RATE": {
        const wins = trades.filter((t) => (t.pnlNet?.toNumber() ?? 0) > 0).length;
        return {
          actual: trades.length > 0 ? this.round1((wins / trades.length) * 100) : null,
          sampleSize: trades.length,
        };
      }
      case "R_EARNED":
        return { actual: trades.length > 0 ? this.round2(sumR) : null, sampleSize: trades.length };
      case "AVG_R":
        return {
          actual: trades.length > 0 ? this.round2(sumR / trades.length) : null,
          sampleSize: trades.length,
        };
      case "PROFIT_TARGET": {
        const net = trades.reduce((sum, t) => sum + (t.pnlNet?.toNumber() ?? 0), 0);
        return { actual: trades.length > 0 ? this.round2(net) : null, sampleSize: trades.length };
      }
      case "DISCIPLINE_SCORE": {
        const scores = await this.discipline.dailyScores(userId, { from, to });
        const values = [...scores.values()].filter((v): v is number => v !== null);
        return {
          actual:
            values.length > 0
              ? this.round1(values.reduce((sum, v) => sum + v, 0) / values.length)
              : null,
          sampleSize: values.length,
        };
      }
      case "FOLLOWED_PLAN_PCT": {
        const known = trades.filter((t) => t.followedPlan !== null);
        const followed = known.filter((t) => t.followedPlan === true).length;
        return {
          actual: known.length > 0 ? this.round1((followed / known.length) * 100) : null,
          sampleSize: known.length,
        };
      }
      case "MAX_TRADES_PER_DAY": {
        const perDay = new Map<string, number>();
        for (const trade of trades) {
          const key = dateKeyOf(trade.tradingDate);
          perDay.set(key, (perDay.get(key) ?? 0) + 1);
        }
        return {
          actual: trades.length > 0 ? Math.max(0, ...perDay.values()) : null,
          sampleSize: trades.length,
        };
      }
      case "MAX_DAILY_LOSS_R": {
        const worst = Math.min(0, ...perDayR.values());
        return { actual: trades.length > 0 ? this.round2(worst) : null, sampleSize: trades.length };
      }
    }
  }

  /** Goal + computed progress row (mock's goalProgressFor). */
  async goalProgressFor(
    userId: string,
    goal: Goal,
    currency: string,
    today: string,
  ): Promise<GoalWithProgress> {
    const shape = METRIC_SHAPE[goal.metric];
    const period: ResolvedPeriod = resolvePeriod(goal.period as GoalPeriod, today);
    const current = await this.computeMetricActual(userId, goal.metric, period.from, period.to);
    const prevWindow = previousWindow(period);
    const previous = (
      await this.computeMetricActual(userId, goal.metric, prevWindow.from, prevWindow.to)
    ).actual;

    const timePct = Math.min(1, Math.max(0, period.daysElapsed) / period.daysTotal);
    let progressPct: number | null = null;
    let status: GoalWithProgress["progress"]["status"] = "PENDING";

    if (current.actual !== null) {
      const actual = current.actual;
      if (shape.direction === "LOWER_IS_BETTER") {
        // A limit to respect - maintained, not "achieved early".
        if (actual <= goal.target) {
          progressPct = 100;
          status = "ON_TRACK";
        } else {
          progressPct = Math.max(0, Math.min(100, this.round1((goal.target / actual) * 100)));
          status = "BEHIND";
        }
      } else if (goal.target < 0) {
        // A floor to respect ("worst day no worse than −2R").
        if (actual >= goal.target) {
          progressPct = 100;
          status = "ON_TRACK";
        } else {
          const depth = Math.abs(((goal.target - actual) / Math.abs(goal.target)) * 100);
          progressPct = Math.max(0, Math.min(100, this.round1(100 - depth)));
          status = "BEHIND";
        }
      } else {
        // A growth target - pace it against elapsed time.
        progressPct = Math.max(0, Math.min(100, this.round1((actual / goal.target) * 100)));
        if (actual >= goal.target) {
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
      if (shape.unit === "PERCENT") return `${this.round1(value)}%`;
      if (shape.unit === "R") return `${this.round2(value)}R`;
      if (shape.unit === "MONEY") return `$${Math.round(value).toLocaleString("en-US")}`;
      if (shape.unit === "COUNT") return `${Math.round(value)}`;
      return `${this.round1(value)}`;
    };
    const targetWord =
      shape.direction === "LOWER_IS_BETTER"
        ? "max"
        : goal.metric === "MAX_DAILY_LOSS_R"
          ? "floor"
          : "target";
    const detail =
      current.actual === null
        ? `No data yet this ${goal.period.toLowerCase()} - the sample is empty`
        : `${fmt(current.actual)} vs ${fmt(goal.target)} ${targetWord}`;

    return {
      goal,
      progress: {
        goalId: goal.id,
        metric: goal.metric,
        direction: shape.direction,
        unit: shape.unit,
        currency:
          shape.unit === "MONEY"
            ? ((currency as GoalWithProgress["progress"]["currency"]) ?? "USD")
            : null,
        actual: current.actual,
        previous,
        progressPct,
        status,
        periodStart: period.from,
        periodEnd: period.to,
        daysElapsed: Math.min(period.daysElapsed, period.daysTotal),
        daysTotal: period.daysTotal,
        sampleSize: current.sampleSize,
        detail,
      },
    };
  }

  async listGoals(userId: string): Promise<GoalsResponse> {
    const [today, currency] = await Promise.all([this.todayKey(userId), this.currencyOf(userId)]);
    const rows = await this.repository.listByKind(userId, "GOAL");
    const goals: GoalWithProgress[] = [];
    for (const row of rows) {
      goals.push(await this.goalProgressFor(userId, row.data as unknown as Goal, currency, today));
    }
    return { goals };
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<GoalWithProgress> {
    const [today, currency] = await Promise.all([this.todayKey(userId), this.currencyOf(userId)]);
    const now = new Date().toISOString();
    const goal: Goal = {
      id: crypto.randomUUID(),
      userId,
      title: input.title,
      metric: input.metric,
      target: input.target,
      period: input.period,
      color: input.color,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insertGoal(userId, goal.id, goal as unknown as never);
    return this.goalProgressFor(userId, goal, currency, today);
  }

  async updateGoal(userId: string, goalId: string, input: UpdateGoalInput): Promise<GoalWithProgress> {
    const row = await this.repository.findForUser(userId, "GOAL", goalId);
    if (row === null) {
      throw new NotFoundError("Goal not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const goal = row.data as unknown as Goal;
    if (input.title !== undefined) goal.title = input.title;
    if (input.metric !== undefined) goal.metric = input.metric;
    if (input.target !== undefined) goal.target = input.target;
    if (input.period !== undefined) goal.period = input.period;
    if (input.color !== undefined) goal.color = input.color;
    if (input.active !== undefined) goal.active = input.active;
    goal.updatedAt = new Date().toISOString();
    await this.repository.updateData(row.id, goal as unknown as never);
    const [today, currency] = await Promise.all([this.todayKey(userId), this.currencyOf(userId)]);
    return this.goalProgressFor(userId, goal, currency, today);
  }

  async deleteGoal(userId: string, goalId: string): Promise<{ ok: true }> {
    const row = await this.repository.findForUser(userId, "GOAL", goalId);
    if (row === null) {
      throw new NotFoundError("Goal not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }
}
