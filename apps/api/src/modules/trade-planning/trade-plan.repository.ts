/**
 * Trade Planning data access (infrastructure) - Phase 5.
 *
 * The ONLY place in the trade-planning context that touches Prisma. All
 * methods return narrow row projections - no Prisma type crosses into
 * services or controllers (Phase 1 §10 boundary).
 *
 * Concurrency (§41): lifecycle transitions use conditional updates
 * (`updateMany` with the expected status set) - a stale read produces a
 * zero-count write that the service translates into a 409, instead of
 * blindly succeeding. This is the plan-sized analogue of Phase 4's
 * account-row serialization: one atomic guarded write per transition.
 *
 * Idempotency (§40): `@@unique([userId, clientRequestId])` backs create
 * dedupe; NULLs are distinct in Postgres, so plans without a key are
 * unaffected.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { TradePlanStatus } from "../../shared/contracts";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export interface TradePlanRow {
  id: string;
  userId: string;
  accountId: string;
  status: string;
  direction: string;
  entryType: string;
  symbol: string;
  currency: string;
  timeframe: string | null;
  strategyId: string | null;
  entryPrice: Prisma.Decimal;
  stopLoss: Prisma.Decimal | null;
  takeProfit: Prisma.Decimal | null;
  sizeMode: string;
  sizeValue: Prisma.Decimal;
  balanceSnapshot: Prisma.Decimal | null;
  riskPercent: Prisma.Decimal | null;
  riskAmount: Prisma.Decimal | null;
  stopDistance: Prisma.Decimal | null;
  stopPips: Prisma.Decimal | null;
  positionSize: Prisma.Decimal | null;
  potentialProfit: Prisma.Decimal | null;
  potentialLoss: Prisma.Decimal | null;
  rrRatio: Prisma.Decimal | null;
  rationale: string | null;
  checklist: unknown;
  checklistComplete: boolean | null;
  lastValidation: unknown;
  validatedAt: Date | null;
  cancelledAt: Date | null;
  abandonedAt: Date | null;
  clientRequestId: string | null;
  plannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PLAN_COLUMNS = {
  id: true,
  userId: true,
  accountId: true,
  status: true,
  direction: true,
  entryType: true,
  symbol: true,
  currency: true,
  timeframe: true,
  strategyId: true,
  entryPrice: true,
  stopLoss: true,
  takeProfit: true,
  sizeMode: true,
  sizeValue: true,
  balanceSnapshot: true,
  riskPercent: true,
  riskAmount: true,
  stopDistance: true,
  stopPips: true,
  positionSize: true,
  potentialProfit: true,
  potentialLoss: true,
  rrRatio: true,
  rationale: true,
  checklist: true,
  checklistComplete: true,
  lastValidation: true,
  validatedAt: true,
  cancelledAt: true,
  abandonedAt: true,
  clientRequestId: true,
  plannedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface TradePlanListFilters {
  userId: string;
  status?: string;
  accountId?: string;
  symbol?: string;
  direction?: string;
  strategyId?: string;
  plannedFrom?: Date;
  plannedTo?: Date;
  sort: "createdAt" | "plannedAt" | "updatedAt";
  order: "asc" | "desc";
  page: number;
  limit: number;
}

/** Column set the service may persist on write, as engine output. */
export interface TradePlanRiskColumns {
  balanceSnapshot: Prisma.Decimal | null;
  riskPercent: Prisma.Decimal | null;
  riskAmount: Prisma.Decimal | null;
  stopDistance: Prisma.Decimal | null;
  stopPips: Prisma.Decimal | null;
  positionSize: Prisma.Decimal | null;
  potentialProfit: Prisma.Decimal | null;
  potentialLoss: Prisma.Decimal | null;
  rrRatio: Prisma.Decimal | null;
}

@Injectable()
export class TradePlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  /**
   * Ownership check is part of the lookup - foreign ids are simply not found
   * (IDOR → honest 404, the established convention).
   */
  async findPlanForUser(planId: string, userId: string): Promise<TradePlanRow | null> {
    const row = await this.prisma.tradePlan.findFirst({
      where: { id: planId, userId },
      select: PLAN_COLUMNS,
    });
    return (row as TradePlanRow) ?? null;
  }

  /** §40 - create dedupe: the plan an earlier retried request already made. */
  async findByClientRequest(
    userId: string,
    clientRequestId: string,
  ): Promise<TradePlanRow | null> {
    const row = await this.prisma.tradePlan.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId } },
      select: PLAN_COLUMNS,
    });
    return (row as TradePlanRow) ?? null;
  }

  async listPlans(
    filters: TradePlanListFilters,
  ): Promise<{ rows: TradePlanRow[]; total: number }> {
    const where: Prisma.TradePlanWhereInput = {
      userId: filters.userId,
      status: filters.status as Prisma.EnumTradePlanStatusFilter["equals"],
      accountId: filters.accountId,
      symbol: filters.symbol,
      direction: filters.direction as Prisma.EnumDirectionFilter["equals"],
      strategyId: filters.strategyId,
      plannedAt: dateRange(filters.plannedFrom, filters.plannedTo),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tradePlan.findMany({
        where,
        select: PLAN_COLUMNS,
        orderBy: { [filters.sort]: filters.order },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.tradePlan.count({ where }),
    ]);
    return { rows: rows as TradePlanRow[], total };
  }

  /**
   * Analytics attribution rows (Phase 8 - additive public contract): the
   * strategy reference + the canonical planned RR the risk engine computed,
   * per plan, for the whole user. Analytics CONSUMES these canonical values
   * (it never re-derives RR - Phase 8 §29) when comparing planned vs
   * realized through the review's origin-plan linkage.
   */
  async listPlanAttributionRows(
    userId: string,
  ): Promise<Array<{ id: string; strategyId: string | null; rrRatio: Prisma.Decimal | null }>> {
    return this.prisma.tradePlan.findMany({
      where: { userId },
      select: { id: true, strategyId: true, rrRatio: true },
    });
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  async insertPlan(data: {
    userId: string;
    accountId: string;
    status: "DRAFT" | "PLANNED";
    direction: "BUY" | "SELL";
    entryType: string;
    symbol: string;
    currency: string;
    timeframe: string | null;
    strategyId: string | null;
    entryPrice: Prisma.Decimal;
    stopLoss: Prisma.Decimal | null;
    takeProfit: Prisma.Decimal | null;
    sizeMode: string;
    sizeValue: Prisma.Decimal;
    risk: TradePlanRiskColumns;
    rationale: string | null;
    checklist: unknown;
    checklistComplete: boolean | null;
    clientRequestId: string | null;
    plannedAt: Date | null;
  }): Promise<TradePlanRow> {
    const row = await this.prisma.tradePlan.create({
      data: {
        userId: data.userId,
        accountId: data.accountId,
        status: data.status,
        direction: data.direction,
        entryType: data.entryType,
        symbol: data.symbol,
        currency: data.currency,
        timeframe: data.timeframe,
        strategyId: data.strategyId,
        entryPrice: data.entryPrice,
        stopLoss: data.stopLoss,
        takeProfit: data.takeProfit,
        sizeMode: data.sizeMode,
        sizeValue: data.sizeValue,
        ...data.risk,
        rationale: data.rationale,
        checklist: data.checklist === undefined ? Prisma.JsonNull : (data.checklist as Prisma.InputJsonValue),
        checklistComplete: data.checklistComplete,
        clientRequestId: data.clientRequestId,
        plannedAt: data.plannedAt,
      },
      select: PLAN_COLUMNS,
    });
    return row as TradePlanRow;
  }

  /**
   * Guarded configuration edit (§38/§41): the write only lands while the plan
   * is still in one of the expected statuses. A zero count = the status moved
   * under us → the service maps that to 409.
   */
  async updatePlanConfiguration(
    planId: string,
    userId: string,
    expectedStatuses: readonly string[],
    data: {
      symbol?: string;
      direction?: "BUY" | "SELL";
      entryType?: string;
      entryPrice?: Prisma.Decimal;
      stopLoss?: Prisma.Decimal | null;
      takeProfit?: Prisma.Decimal | null;
      sizeMode?: string;
      sizeValue?: Prisma.Decimal;
      risk?: TradePlanRiskColumns;
      timeframe?: string | null;
      strategyId?: string | null;
      rationale?: string | null;
      plannedAt?: Date | null;
      checklist?: unknown | undefined;
      checklistComplete?: boolean | null;
    },
  ): Promise<boolean> {
    const result = await this.prisma.tradePlan.updateMany({
      where: {
        id: planId,
        userId,
        status: { in: expectedStatuses as TradePlanStatus[] },
      },
      data: {
        ...(data.symbol !== undefined ? { symbol: data.symbol } : {}),
        ...(data.direction !== undefined ? { direction: data.direction } : {}),
        ...(data.entryType !== undefined ? { entryType: data.entryType } : {}),
        ...(data.entryPrice !== undefined ? { entryPrice: data.entryPrice } : {}),
        ...(data.stopLoss !== undefined ? { stopLoss: data.stopLoss } : {}),
        ...(data.takeProfit !== undefined ? { takeProfit: data.takeProfit } : {}),
        ...(data.sizeMode !== undefined ? { sizeMode: data.sizeMode } : {}),
        ...(data.sizeValue !== undefined ? { sizeValue: data.sizeValue } : {}),
        ...(data.risk !== undefined ? { ...data.risk } : {}),
        ...(data.timeframe !== undefined ? { timeframe: data.timeframe } : {}),
        ...(data.strategyId !== undefined ? { strategyId: data.strategyId } : {}),
        ...(data.rationale !== undefined ? { rationale: data.rationale } : {}),
        ...(data.plannedAt !== undefined ? { plannedAt: data.plannedAt } : {}),
        ...(data.checklist !== undefined
          ? {
              checklist:
                data.checklist === null
                  ? Prisma.JsonNull
                  : (data.checklist as Prisma.InputJsonValue),
            }
          : {}),
        ...(data.checklistComplete !== undefined
          ? { checklistComplete: data.checklistComplete }
          : {}),
      },
    });
    return result.count === 1;
  }

  /**
   * Guarded lifecycle transition (§41). `extra` carries the status stamps
   * (validatedAt / cancelledAt / abandonedAt / plannedAt) and any payload
   * that must land atomically with the transition (e.g. the validation
   * snapshot + refreshed risk).
   */
  async transitionStatus(
    planId: string,
    userId: string,
    from: readonly string[],
    to: string,
    extra: {
      plannedAt?: Date;
      validatedAt?: Date;
      cancelledAt?: Date;
      abandonedAt?: Date;
      lastValidation?: unknown;
      risk?: TradePlanRiskColumns;
    } = {},
  ): Promise<boolean> {
    const result = await this.prisma.tradePlan.updateMany({
      where: {
        id: planId,
        userId,
        status: { in: from as TradePlanStatus[] },
      },
      data: {
        status: to as TradePlanStatus,
        ...(extra.plannedAt !== undefined ? { plannedAt: extra.plannedAt } : {}),
        ...(extra.validatedAt !== undefined ? { validatedAt: extra.validatedAt } : {}),
        ...(extra.cancelledAt !== undefined ? { cancelledAt: extra.cancelledAt } : {}),
        ...(extra.abandonedAt !== undefined ? { abandonedAt: extra.abandonedAt } : {}),
        ...(extra.lastValidation !== undefined
          ? { lastValidation: extra.lastValidation as Prisma.InputJsonValue }
          : {}),
        ...(extra.risk !== undefined ? { ...extra.risk } : {}),
      },
    });
    return result.count === 1;
  }

  /** Persist a failed battery attempt without mutating status (§21). */
  async recordValidationFailure(
    planId: string,
    userId: string,
    expectedStatuses: readonly string[],
    lastValidation: unknown,
    risk: TradePlanRiskColumns,
  ): Promise<boolean> {
    const result = await this.prisma.tradePlan.updateMany({
      where: {
        id: planId,
        userId,
        status: { in: expectedStatuses as TradePlanStatus[] },
      },
      data: {
        lastValidation: lastValidation as Prisma.InputJsonValue,
        ...risk,
      },
    });
    return result.count === 1;
  }

  /**
   * Phase 7 (additive): number of plans referencing a Playbook strategy.
   * Exercised by the Playbook context through this repository's PUBLIC
   * contract - deletion guards read references here, ownership stays
   * query-local (cross-context reference counting, no ownership transfer).
   */
  async countStrategyReferences(userId: string, strategyId: string): Promise<number> {
    return this.prisma.tradePlan.count({
      where: { userId, strategyId },
    });
  }
}

function dateRange(from?: Date, to?: Date): Prisma.DateTimeNullableFilter | undefined {
  if (from === undefined && to === undefined) return undefined;
  return { gte: from, lte: to };
}
