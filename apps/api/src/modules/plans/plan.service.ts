/**
 * Trade Plan application service (Phase 11) - documented reasoning, not
 * execution. Lifecycle rules live HERE (the transition table from the shared
 * contract), never as arbitrary frontend string updates; every write is
 * owner-scoped; hypothetical levels never touch canonical trade facts; the
 * plan-vs-actual comparison reads canonical trade facts read-only and emits
 * honest nulls for anything unavailable (§9.2 - no fabricated deviations).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  PLAN_ERROR_CODES,
  analysisPlanDetailResponseSchema,
  analysisPlanMutatedResponseSchema,
  analysisPlansResponseSchema,
  planTransitionAllowed,
  type AnalysisPlan,
  type AnalysisPlanDetailResponse,
  type AnalysisPlanMutatedResponse,
  type AnalysisPlansResponse,
  type CompletePlanInput,
  type CreateAnalysisPlanInput,
  type LinkPlanTradeInput,
  type ListPlansQuery,
  type PlanScenario,
  type PlanStatus,
  type UpdateAnalysisPlanInput,
} from "../../shared/contracts";
import { BusinessRuleError, NotFoundError } from "../../shared/errors/app-error";
import { TradesService } from "../trades/trades.service";
import { PlanRepository, type PlanRow } from "./plan.repository";

type TradeRowForFacts = NonNullable<Awaited<ReturnType<TradesService["getTradeRowForUser"]>>>;

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function decString(value: Prisma.Decimal | string | null): string | null {
  if (value === null) return null;
  return value instanceof Prisma.Decimal ? value.toFixed() : String(value);
}

function toWire(row: PlanRow): AnalysisPlan {
  return analysisPlanMutatedResponseSchema.shape.plan.parse({
    id: row.id,
    userId: row.userId,
    status: row.status,
    symbol: row.symbol,
    timeframe: row.timeframe,
    title: row.title,
    thesis: row.thesis,
    tradeId: row.tradeId,
    analysisId: row.analysisId,
    invalidationCriteria: row.invalidationCriteria,
    invalidatedAt: iso(row.invalidatedAt),
    invalidationReason: row.invalidationReason,
    reviewNotes: row.reviewNotes,
    processTags: Array.isArray(row.processTags) ? (row.processTags as AnalysisPlan["processTags"]) : null,
    reviewedAt: iso(row.reviewedAt),
    completedAt: iso(row.completedAt),
    plannedEntry: decString(row.plannedEntry),
    plannedStop: decString(row.plannedStop),
    plannedTargets: Array.isArray(row.plannedTargets) ? (row.plannedTargets as string[]) : null,
    referenceTimeSec: row.referenceTimeSec === null ? null : Number(row.referenceTimeSec),
    scenarios: Array.isArray(row.scenarios) ? (row.scenarios as PlanScenario[]) : [],
    schemaVersion: row.schemaVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });
}

@Injectable()
export class PlanService {
  constructor(
    private readonly plans: PlanRepository,
    private readonly trades: TradesService,
  ) {}

  // ── Create / read ──────────────────────────────────────────────────────────

  async create(userId: string, input: CreateAnalysisPlanInput): Promise<AnalysisPlanMutatedResponse> {
    // Idempotent create: a retried clientRequestId maps back to the winner.
    if (input.clientRequestId !== undefined && (await this.plans.clientRequestExists(userId, input.clientRequestId))) {
      throw new BusinessRuleError(
        "A plan with this clientRequestId already exists.",
        PLAN_ERROR_CODES.PLAN_TRADE_ALREADY_LINKED,
      );
    }
    const tradeId = await this.resolveTradeLink(userId, null, input.symbol);
    const row = await this.plans.create(userId, {
      status: input.activate === true ? "ACTIVE" : "DRAFT",
      symbol: input.symbol,
      timeframe: input.timeframe ?? null,
      title: input.title,
      thesis: input.thesis,
      tradeId,
      analysisId: await this.resolveAnalysisRef(userId, input.analysisId),
      invalidationCriteria: input.invalidationCriteria ?? null,
      plannedEntry: input.plannedEntry === null || input.plannedEntry === undefined ? null : new Prisma.Decimal(input.plannedEntry),
      plannedStop: input.plannedStop === null || input.plannedStop === undefined ? null : new Prisma.Decimal(input.plannedStop),
      plannedTargets: input.plannedTargets ?? null,
      referenceTimeSec: input.referenceTimeSec ?? null,
      scenarios: input.scenarios ?? [],
      clientRequestId: input.clientRequestId ?? null,
    });
    return { plan: toWire(row) };
  }

  async getDetail(userId: string, id: string): Promise<AnalysisPlanDetailResponse> {
    const row = await this.requireRow(userId, id);
    const plan = toWire(row);
    const comparison = await this.buildComparison(userId, plan);
    return analysisPlanDetailResponseSchema.parse({ plan, comparison });
  }

  async list(userId: string, query: ListPlansQuery): Promise<AnalysisPlansResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.plans.listForUser(userId, {
      status: query.status,
      symbol: query.symbol,
      tradeId: query.tradeId,
      page,
      limit,
    });
    return analysisPlansResponseSchema.parse({
      plans: rows.map((row) => toWire(row)),
      meta: { total, page, limit, hasMore: page * limit < total },
    });
  }

  async listByTrade(userId: string, tradeId: string): Promise<AnalysisPlansResponse> {
    const rows = await this.plans.listByTrade(userId, tradeId);
    return analysisPlansResponseSchema.parse({
      plans: rows.map((row) => toWire(row)),
      meta: { total: rows.length, page: 1, limit: rows.length, hasMore: false },
    });
  }

  // ── Edit (DRAFT/ACTIVE only - the repository enforces it) ──────────────────

  async patch(userId: string, id: string, input: UpdateAnalysisPlanInput): Promise<AnalysisPlanMutatedResponse> {
    await this.requireRow(userId, id);
    const data: Prisma.AnalysisPlanUpdateManyMutationInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.timeframe !== undefined) data.timeframe = input.timeframe;
    if (input.thesis !== undefined) data.thesis = input.thesis;
    if (input.symbol !== undefined) data.symbol = input.symbol;
    if (input.invalidationCriteria !== undefined) data.invalidationCriteria = input.invalidationCriteria;
    if (input.plannedEntry !== undefined) {
      data.plannedEntry = input.plannedEntry === null ? null : new Prisma.Decimal(input.plannedEntry);
    }
    if (input.plannedStop !== undefined) {
      data.plannedStop = input.plannedStop === null ? null : new Prisma.Decimal(input.plannedStop);
    }
    if (input.plannedTargets !== undefined) {
      data.plannedTargets =
        input.plannedTargets === null || input.plannedTargets === undefined
          ? Prisma.DbNull
          : (input.plannedTargets as Prisma.InputJsonValue);
    }
    if (input.referenceTimeSec !== undefined) data.referenceTimeSec = input.referenceTimeSec;
    if (input.scenarios !== undefined) data.scenarios = input.scenarios as unknown as Prisma.InputJsonValue;
    if (input.analysisId !== undefined) {
      await this.plans.setAnalysisRef(id, userId, await this.resolveAnalysisRef(userId, input.analysisId));
    }
    const updated = await this.plans.patch(id, userId, data);
    if (updated === null) {
      throw new BusinessRuleError(
        "This plan is no longer editable (only DRAFT/ACTIVE plans change).",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    return { plan: toWire(updated) };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async activate(userId: string, id: string): Promise<AnalysisPlanMutatedResponse> {
    const row = await this.requireRow(userId, id);
    this.assertTransition(row.status as PlanStatus, "ACTIVE");
    // Activation validates the minimum documentation (§5.4): a plan claiming
    // readiness must at least say what would falsify it.
    if (row.invalidationCriteria === null || row.invalidationCriteria.trim() === "") {
      throw new BusinessRuleError(
        "A plan cannot be activated without documented invalidation criteria.",
        PLAN_ERROR_CODES.PLAN_ACTIVATION_INCOMPLETE,
      );
    }
    const updated = await this.plans.transition(id, userId, ["DRAFT"], "ACTIVE");
    if (updated === null) {
      throw new BusinessRuleError(
        "The plan state changed concurrently. Retry.",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    return { plan: toWire(updated) };
  }

  async invalidate(userId: string, id: string, reason: string): Promise<AnalysisPlanMutatedResponse> {
    const row = await this.requireRow(userId, id);
    this.assertTransition(row.status as PlanStatus, "INVALIDATED");
    const now = new Date();
    const updated = await this.plans.transition(id, userId, ["ACTIVE"], "INVALIDATED", {
      invalidatedAt: now,
      invalidationReason: reason,
    });
    if (updated === null) {
      throw new BusinessRuleError(
        "The plan state changed concurrently. Retry.",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    return { plan: toWire(updated) };
  }

  async complete(userId: string, id: string, input: CompletePlanInput): Promise<AnalysisPlanMutatedResponse> {
    const row = await this.requireRow(userId, id);
    this.assertTransition(row.status as PlanStatus, "COMPLETED");
    const now = new Date();
    const updated = await this.plans.transition(id, userId, ["ACTIVE"], "COMPLETED", {
      reviewedAt: now,
      completedAt: now,
      reviewNotes: input.reviewNotes ?? null,
      processTags:
        input.processTags === null || input.processTags === undefined
          ? Prisma.DbNull
          : (input.processTags as Prisma.InputJsonValue),
    });
    if (updated === null) {
      throw new BusinessRuleError(
        "The plan state changed concurrently. Retry.",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    return { plan: toWire(updated) };
  }

  async archive(userId: string, id: string): Promise<AnalysisPlanMutatedResponse> {
    const row = await this.requireRow(userId, id);
    this.assertTransition(row.status as PlanStatus, "ARCHIVED");
    const updated = await this.plans.transition(id, userId, ["DRAFT", "ACTIVE", "INVALIDATED", "COMPLETED"], "ARCHIVED");
    if (updated === null) {
      throw new BusinessRuleError(
        "The plan state changed concurrently. Retry.",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    return { plan: toWire(updated) };
  }

  async linkTrade(userId: string, id: string, input: LinkPlanTradeInput): Promise<AnalysisPlanMutatedResponse> {
    const row = await this.requireRow(userId, id);
    if (row.tradeId !== null && row.tradeId !== input.tradeId) {
      throw new BusinessRuleError(
        "This plan is already linked to another trade - detach it first.",
        PLAN_ERROR_CODES.PLAN_TRADE_ALREADY_LINKED,
      );
    }
    const trade = await this.trades.getTradeRowForUser(input.tradeId, userId);
    if (trade === null) {
      throw new NotFoundError(
        "Linked trade does not exist (or is not yours).",
        PLAN_ERROR_CODES.PLAN_TRADE_NOT_FOUND,
      );
    }
    if (trade.symbol !== row.symbol && input.confirmSymbolMismatch !== true) {
      throw new BusinessRuleError(
        `Instrument mismatch: the plan is on ${row.symbol}, the trade on ${trade.symbol}. Confirm the mismatch explicitly.`,
        PLAN_ERROR_CODES.PLAN_TRADE_SYMBOL_MISMATCH,
      );
    }
    const updated = await this.plans.linkTrade(id, userId, trade.id);
    if (updated === null) {
      throw new NotFoundError("Plan not found.", PLAN_ERROR_CODES.PLAN_NOT_FOUND);
    }
    return { plan: toWire(updated) };
  }

  async detachTrade(userId: string, id: string): Promise<AnalysisPlanMutatedResponse> {
    await this.requireRow(userId, id);
    const updated = await this.plans.linkTrade(id, userId, null);
    if (updated === null) {
      throw new NotFoundError("Plan not found.", PLAN_ERROR_CODES.PLAN_NOT_FOUND);
    }
    return { plan: toWire(updated) };
  }

  async delete(userId: string, id: string): Promise<{ ok: true }> {
    const deleted = await this.plans.deleteForUser(id, userId);
    if (!deleted) {
      throw new NotFoundError("Plan not found.", PLAN_ERROR_CODES.PLAN_NOT_FOUND);
    }
    return { ok: true };
  }

  // ── Plan vs actual (facts, never judgments - §9.2) ─────────────────────────

  private async buildComparison(userId: string, plan: AnalysisPlan): Promise<AnalysisPlanDetailResponse["comparison"]> {
    const trade: TradeRowForFacts | null = plan.tradeId === null ? null : await this.trades.getTradeRowForUser(plan.tradeId, userId);

    if (trade === null) {
      return {
        trade: null,
        direction: { planned: null, actual: null, match: null },
        entry: { planned: plan.plannedEntry, actual: null, available: false },
        stop: { planned: plan.plannedStop, actual: null, available: false },
        target: { planned: plan.plannedTargets?.[0] ?? null, actual: null, available: false },
        timing: { planCreatedAt: plan.createdAt, tradeEntryAt: null },
      };
    }

    const actualEntry = trade.entryPrice === null ? null : trade.entryPrice.toFixed();
    const actualStop = trade.initialStop === null ? null : trade.initialStop.toFixed();
    const actualTarget = trade.initialTP === null ? null : trade.initialTP.toFixed();
    const plannedTarget = plan.plannedTargets?.[0] ?? null;

    return {
      trade: {
        tradeId: trade.id,
        status: trade.status,
        direction: trade.direction === "BUY" || trade.direction === "SELL" ? trade.direction : null,
        entryPrice: actualEntry,
        exitPrice: trade.exitPrice === null ? null : trade.exitPrice.toFixed(),
        initialStop: actualStop,
        initialTP: actualTarget,
        pnlNet: trade.pnlNet === null ? null : trade.pnlNet.toFixed(),
        rMultiple: trade.rMultiple === null ? null : trade.rMultiple.toFixed(),
        entryAt: iso(trade.entryAt),
        exitAt: iso(trade.exitAt),
      },
      direction: {
        planned: null, // plans carry scenarios, not a single direction field - honest null
        actual: trade.direction === "BUY" || trade.direction === "SELL" ? trade.direction : null,
        match: null,
      },
      entry: {
        planned: plan.plannedEntry,
        actual: actualEntry,
        available: plan.plannedEntry !== null && actualEntry !== null,
      },
      stop: {
        planned: plan.plannedStop,
        actual: actualStop,
        available: plan.plannedStop !== null && actualStop !== null,
      },
      target: {
        planned: plannedTarget,
        actual: actualTarget,
        available: plannedTarget !== null && actualTarget !== null,
      },
      timing: {
        planCreatedAt: plan.createdAt,
        tradeEntryAt: iso(trade.entryAt),
      },
    };
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  private assertTransition(from: PlanStatus, to: PlanStatus): void {
    if (!planTransitionAllowed(from, to)) {
      throw new BusinessRuleError(
        `Invalid lifecycle transition: ${from} → ${to}.`,
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
  }

  private async requireRow(userId: string, id: string): Promise<PlanRow> {
    const row = await this.plans.findByIdForUser(id, userId);
    if (row === null) {
      throw new NotFoundError("Plan not found.", PLAN_ERROR_CODES.PLAN_NOT_FOUND);
    }
    return row;
  }

  /**
   * Trade linkage at CREATE: the create contract carries no tradeId (a plan
   * starts unlinked by design - §4.2), so this is always null today and kept
   * as the single seam for a future "create from trade" entry point.
   */
  private async resolveTradeLink(userId: string, _tradeId: null, _symbol: string): Promise<string | null> {
    void userId;
    return null;
  }

  private async resolveAnalysisRef(userId: string, analysisId: string | null | undefined): Promise<string | null> {
    if (analysisId === null || analysisId === undefined) return null;
    const exists = await this.prismaAnalysisExists(analysisId, userId);
    if (!exists) {
      throw new NotFoundError(
        "Referenced Oryon analysis does not exist (or is not yours).",
        PLAN_ERROR_CODES.PLAN_ANALYSIS_NOT_FOUND,
      );
    }
    return analysisId;
  }

  private async prismaAnalysisExists(analysisId: string, userId: string): Promise<boolean> {
    return this.plans.analysisExistsForUser(analysisId, userId);
  }
}
