import {
  PLAN_ERROR_CODES,
  analysisPlanDetailResponseSchema,
  analysisPlanMutatedResponseSchema,
  analysisPlansResponseSchema,
  planIsEditable,
  planTransitionAllowed,
  type AnalysisPlan,
  type AnalysisPlanDetailResponse,
  type AnalysisPlanMutatedResponse,
  type AnalysisPlansResponse,
  type CompletePlanInput,
  type CreateAnalysisPlanInput,
  type LinkPlanTradeInput,
  type ListPlansQuery,
  type PlanStatus,
  type UpdateAnalysisPlanInput,
} from "@cosmoz/shared";

import { mockStore, MockError } from "@/mocks/store";

/**
 * Trade Plan mock engine (Phase 11) - mirrors apps/api PlanService semantics
 * 1:1 so the UI exercises the same rules in mocked mode:
 *
 *   - lifecycle transitions ONLY through the shared PLAN_TRANSITIONS table;
 *   - activation requires documented invalidation criteria;
 *   - plans are editable in DRAFT/ACTIVE only;
 *   - invalidation requires a reason; completion carries the review;
 *   - canonical-trade linkage validates symbol (mismatch = explicit confirm);
 *   - the plan-vs-actual comparison reads trade facts read-only and emits
 *     honest nulls - nothing is ever fabricated;
 *   - clientRequestId idempotency collapses retries.
 *
 * Storage is in-memory and reseeds on full page load - the SAME documented
 * limitation as every other mock domain (screenshots, reviews). The Nest API
 * (apps/api, :4000) is the durable implementation.
 */

/** Millisecond-stripped ISO - byte-parity with the Nest wire format. */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function notFound(message: string, code: string): MockError {
  return new MockError(404, `${message} (${code})`);
}

function rule(message: string, code: string): MockError {
  return new MockError(422, `${message} (${code})`);
}

interface PlanRecord {
  /** The wire plan (what the API would return). */
  wire: AnalysisPlan;
  /** Server-side idempotency key - stored, never exposed on the wire
   *  (byte-parity with the Nest toWire projection). */
  clientRequestId: string | null;
}

/** Module-level store - reseeds with the rest of the mock domain. */
const plans = new Map<string, PlanRecord>();

function sorted(): PlanRecord[] {
  return [...plans.values()].sort(
    (a, b) =>
      b.wire.updatedAt.localeCompare(a.wire.updatedAt) || b.wire.id.localeCompare(a.wire.id),
  );
}

function requireRow(userId: string, id: string): PlanRecord {
  const record = plans.get(id);
  // Ownership-safe 404: a foreign plan is indistinguishable from a missing one.
  if (record === undefined || record.wire.userId !== userId) {
    throw notFound("Plan not found.", PLAN_ERROR_CODES.PLAN_NOT_FOUND);
  }
  return record;
}

function assertTransition(from: PlanStatus, to: PlanStatus): void {
  if (!planTransitionAllowed(from, to)) {
    throw rule(
      `Invalid lifecycle transition: ${from} → ${to}.`,
      PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
    );
  }
}

/** The mock trade facts port - mirrors TradesService.getTradeRowForUser.
 *  Symbol is resolved through the instrument catalog (the mock Trade row is
 *  instrument-keyed, exactly like the canonical journal row). */
function findTrade(
  userId: string,
  tradeId: string,
): (ReturnType<typeof mockStore.listTrades>["trades"][number] & { symbol: string }) | null {
  void userId; // the REAL API scopes by principal.userId; see comment below
  const { trades } = mockStore.listTrades({});
  const trade = trades.find((t) => t.id === tradeId) ?? null;
  // Single-user mock: the fixture trades carry a RANDOM seeded userId that
  // cannot equal the auth engine's fixed demo id, so a real ownership
  // comparison is unsatisfiable here (every other mock domain relies on
  // requireAuth only). The Nest API enforces ownership for real (e2e IDOR
  // battery) - the mock mirrors the 404 for MISSING trades only.
  if (trade === null) return null;
  const symbol =
    mockStore.listInstruments().find((instrument) => instrument.id === trade.instrumentId)
      ?.symbol ?? "?";
  return { ...trade, symbol };
}

function buildComparison(
  userId: string,
  plan: AnalysisPlan,
): AnalysisPlanDetailResponse["comparison"] {
  const comparisonTrade = plan.tradeId === null ? null : findTrade(userId, plan.tradeId);

  if (comparisonTrade === null) {
    return {
      trade: null,
      direction: { planned: null, actual: null, match: null },
      entry: { planned: plan.plannedEntry, actual: null, available: false },
      stop: { planned: plan.plannedStop, actual: null, available: false },
      target: { planned: plan.plannedTargets?.[0] ?? null, actual: null, available: false },
      timing: { planCreatedAt: plan.createdAt, tradeEntryAt: null },
    };
  }

  const actualEntry =
    comparisonTrade.entryPrice === null ? null : String(comparisonTrade.entryPrice);
  const actualStop =
    comparisonTrade.initialStop === null ? null : String(comparisonTrade.initialStop);
  const actualTarget =
    comparisonTrade.initialTP === null ? null : String(comparisonTrade.initialTP);
  const plannedTarget = plan.plannedTargets?.[0] ?? null;

  return {
    trade: {
      tradeId: comparisonTrade.id,
      status: comparisonTrade.status,
      direction: comparisonTrade.direction,
      entryPrice: actualEntry,
      exitPrice: comparisonTrade.exitPrice === null ? null : String(comparisonTrade.exitPrice),
      initialStop: actualStop,
      initialTP: actualTarget,
      pnlNet: comparisonTrade.pnlNet === null ? null : String(comparisonTrade.pnlNet),
      rMultiple: comparisonTrade.rMultiple === null ? null : String(comparisonTrade.rMultiple),
      entryAt: comparisonTrade.entryAt,
      exitAt: comparisonTrade.exitAt,
    },
    direction: {
      // Plans carry scenarios, not a single direction field - honest null.
      planned: null,
      actual: comparisonTrade.direction,
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
      tradeEntryAt: comparisonTrade.entryAt,
    },
  };
}

export const planEngine = {
  list(userId: string, query: ListPlansQuery): AnalysisPlansResponse {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    let rows = sorted()
      .map((record) => record.wire)
      .filter((row) => row.userId === userId);
    if (query.status !== undefined) rows = rows.filter((row) => row.status === query.status);
    if (query.symbol !== undefined) rows = rows.filter((row) => row.symbol === query.symbol);
    if (query.tradeId !== undefined) rows = rows.filter((row) => row.tradeId === query.tradeId);
    const total = rows.length;
    const start = (page - 1) * limit;
    return analysisPlansResponseSchema.parse({
      plans: rows.slice(start, start + limit),
      meta: { total, page, limit, hasMore: page * limit < total },
    });
  },

  create(
    userId: string,
    input: CreateAnalysisPlanInput,
  ): AnalysisPlanMutatedResponse {
    // Idempotent create: a retried clientRequestId is a conflict, never a twin.
    if (
      input.clientRequestId !== undefined &&
      [...plans.values()].some(
        (record) =>
          record.wire.userId === userId && record.clientRequestId === input.clientRequestId,
      )
    ) {
      throw rule(
        "A plan with this clientRequestId already exists.",
        PLAN_ERROR_CODES.PLAN_TRADE_ALREADY_LINKED,
      );
    }

    // NOTE: no tradeId in the create contract - a plan starts unlinked (§4.2).
    // The analysis reference validates against the SERVER's analyses; the web
    // keeps analyses browser-local, so the UI never sends one (documented).
    const now = isoNow();
    const candidate: AnalysisPlan = {
      id: crypto.randomUUID(),
      userId,
      status: input.activate === true ? "ACTIVE" : "DRAFT",
      symbol: input.symbol,
      timeframe: input.timeframe ?? null,
      title: input.title,
      thesis: input.thesis,
      tradeId: null,
      analysisId: null,
      invalidationCriteria: input.invalidationCriteria ?? null,
      invalidatedAt: null,
      invalidationReason: null,
      reviewNotes: null,
      processTags: null,
      reviewedAt: null,
      completedAt: null,
      plannedEntry: input.plannedEntry ?? null,
      plannedStop: input.plannedStop ?? null,
      plannedTargets: input.plannedTargets ?? null,
      referenceTimeSec: input.referenceTimeSec ?? null,
      scenarios: input.scenarios ?? [],
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    const wire = analysisPlanMutatedResponseSchema.shape.plan.parse(candidate);
    const record: PlanRecord = { wire, clientRequestId: input.clientRequestId ?? null };
    plans.set(wire.id, record);
    return { plan: wire };
  },

  getDetail(userId: string, planId: string): AnalysisPlanDetailResponse {
    const record = requireRow(userId, planId);
    return analysisPlanDetailResponseSchema.parse({
      plan: record.wire,
      comparison: buildComparison(userId, record.wire),
    });
  },

  patch(
    userId: string,
    planId: string,
    input: UpdateAnalysisPlanInput,
  ): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    // The repository enforces editability; mirror its rejection exactly.
    if (!planIsEditable(record.wire.status)) {
      throw rule(
        "This plan is no longer editable (only DRAFT/ACTIVE plans change).",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    const next: AnalysisPlan = { ...record.wire };
    if (input.title !== undefined) next.title = input.title;
    if (input.timeframe !== undefined) next.timeframe = input.timeframe;
    if (input.thesis !== undefined) next.thesis = input.thesis;
    if (input.symbol !== undefined) next.symbol = input.symbol;
    if (input.invalidationCriteria !== undefined)
      next.invalidationCriteria = input.invalidationCriteria;
    if (input.plannedEntry !== undefined) next.plannedEntry = input.plannedEntry;
    if (input.plannedStop !== undefined) next.plannedStop = input.plannedStop;
    if (input.plannedTargets !== undefined) next.plannedTargets = input.plannedTargets ?? null;
    if (input.referenceTimeSec !== undefined) next.referenceTimeSec = input.referenceTimeSec;
    if (input.scenarios !== undefined) next.scenarios = input.scenarios;
    // analysisId validation is intentionally absent: the mock registry holds no
    // server analyses, so any reference would 404 - the UI sends none.
    next.updatedAt = isoNow();
    record.wire = analysisPlanMutatedResponseSchema.shape.plan.parse(next);
    return { plan: record.wire };
  },

  activate(userId: string, planId: string): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    assertTransition(record.wire.status, "ACTIVE");
    // Activation gate (§5.4): a plan claiming readiness must say what would
    // falsify it - no criteria, no activation.
    if (
      record.wire.invalidationCriteria === null ||
      record.wire.invalidationCriteria.trim() === ""
    ) {
      throw rule(
        "A plan cannot be activated without documented invalidation criteria.",
        PLAN_ERROR_CODES.PLAN_ACTIVATION_INCOMPLETE,
      );
    }
    return { plan: this.transition(userId, planId, ["DRAFT"], "ACTIVE") };
  },

  invalidate(
    userId: string,
    planId: string,
    input: { reason: string },
  ): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    assertTransition(record.wire.status, "INVALIDATED");
    return {
      plan: this.transition(userId, planId, ["ACTIVE"], "INVALIDATED", {
        invalidatedAt: isoNow(),
        invalidationReason: input.reason,
      }),
    };
  },

  complete(
    userId: string,
    planId: string,
    input: CompletePlanInput,
  ): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    assertTransition(record.wire.status, "COMPLETED");
    const now = isoNow();
    return {
      plan: this.transition(userId, planId, ["ACTIVE"], "COMPLETED", {
        reviewedAt: now,
        completedAt: now,
        reviewNotes: input.reviewNotes ?? null,
        processTags: input.processTags ?? null,
      }),
    };
  },

  archive(userId: string, planId: string): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    assertTransition(record.wire.status, "ARCHIVED");
    return {
      plan: this.transition(
        userId,
        planId,
        ["DRAFT", "ACTIVE", "INVALIDATED", "COMPLETED"],
        "ARCHIVED",
      ),
    };
  },

  linkTrade(
    userId: string,
    planId: string,
    input: LinkPlanTradeInput,
  ): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    if (record.wire.tradeId !== null && record.wire.tradeId !== input.tradeId) {
      throw rule(
        "This plan is already linked to another trade - detach it first.",
        PLAN_ERROR_CODES.PLAN_TRADE_ALREADY_LINKED,
      );
    }
    const trade = findTrade(userId, input.tradeId);
    if (trade === null) {
      throw notFound(
        "Linked trade does not exist (or is not yours).",
        PLAN_ERROR_CODES.PLAN_TRADE_NOT_FOUND,
      );
    }
    if (trade.symbol !== record.wire.symbol && input.confirmSymbolMismatch !== true) {
      throw rule(
        `Instrument mismatch: the plan is on ${record.wire.symbol}, the trade on ${trade.symbol}. Confirm the mismatch explicitly.`,
        PLAN_ERROR_CODES.PLAN_TRADE_SYMBOL_MISMATCH,
      );
    }
    return {
      plan: this.transition(userId, planId, [record.wire.status], record.wire.status, {
        tradeId: trade.id,
      }),
    };
  },

  detachTrade(userId: string, planId: string): AnalysisPlanMutatedResponse {
    const record = requireRow(userId, planId);
    return {
      plan: this.transition(userId, planId, [record.wire.status], record.wire.status, {
        tradeId: null,
      }),
    };
  },

  delete(userId: string, planId: string): { ok: true } {
    requireRow(userId, planId);
    plans.delete(planId);
    return { ok: true };
  },

  // ──────────────────── internals ─────────────────────────────────────────

  /** In-place transition/field write with a from-status guard (concurrency
   *  mirror of the repository's conditional UPDATE ... WHERE status IN). */
  transition(
    userId: string,
    planId: string,
    fromStatuses: PlanStatus[],
    toStatus: PlanStatus,
    extra?: Partial<AnalysisPlan>,
  ): AnalysisPlan {
    const record = requireRow(userId, planId);
    if (!fromStatuses.includes(record.wire.status)) {
      throw rule(
        "The plan state changed concurrently. Retry.",
        PLAN_ERROR_CODES.PLAN_TRANSITION_INVALID,
      );
    }
    const next: AnalysisPlan = {
      ...record.wire,
      ...extra,
      status: toStatus,
      updatedAt: isoNow(),
    };
    record.wire = analysisPlanMutatedResponseSchema.shape.plan.parse(next);
    return record.wire;
  },
};

/** Test/debug seam - the mock store exposes reset hooks for full reloads. */
export function resetPlanEngine(): void {
  plans.clear();
}
