/**
 * Trade Planning application service (Phase 5) — trade plan use cases.
 *
 * Ownership is ALWAYS derived from the authenticated principal (§28/§44):
 * the userId comes from the JWT guard, never from the client, and every
 * plan/account lookup is ownership-scoped (foreign ids are honest 404s —
 * the established IDOR convention).
 *
 * Plan ≠ Trade (§6): nothing here touches the canonical Trade model, places
 * orders, or mutates a plan after validation (§38). Risk values are computed
 * by the authoritative domain engine and persisted DISTINCT from user input
 * (§39); clients may preview but the server's numbers win (§57).
 *
 * Idempotency (§40): create dedupes on (userId, clientRequestId); commit /
 * validate / cancel / abandon are status-guarded no-ops when retried after
 * success. Concurrency (§41): every transition is a conditional write — a
 * stale read surfaces as 409, never as a blind success.
 */
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/app-error";
import { TRADE_PLANNING_ERROR_CODES, type TradePlanDetail, type TradePlanValidationIssue } from "../../shared/contracts";
import type {
  CommitTradePlanInput,
  CreateTradePlanInput,
  ListTradePlansQuery,
  UpdateTradePlanInput,
  ValidateTradePlanResponse,
} from "../../shared/contracts";
import { AccountsRepository, type TradingAccountRow } from "../accounts/accounts.repository";
import {
  computePlannedRisk,
  type PlanSizeMode,
  type RiskComputation,
} from "./domain/risk-engine";
import { runValidationBattery } from "./domain/trade-plan-validator";
import type {
  FxRateProvider,
  InstrumentSpecificationProvider,
  RiskLimitProvider,
} from "./domain/ports";
import {
  isAbandonable,
  isCancellable,
  isEditable,
  isRecalculable,
} from "./domain/trade-plan-lifecycle";
import { toTradePlanDetail, toTradePlanSummary } from "./trade-plan.mappers";
import type { TradePlanRiskColumns, TradePlanRow } from "./trade-plan.repository";
import { TradePlanRepository } from "./trade-plan.repository";
import {
  FX_RATE_PROVIDER,
  INSTRUMENT_SPECIFICATION_PROVIDER,
  RISK_LIMIT_PROVIDER,
} from "./trade-planning.tokens";

// ── Normalized helpers (Decimal domain space) ─────────────────────────────

function dec(value: string | null | undefined): Decimal | null {
  return value === undefined || value === null ? null : new Decimal(value);
}

function decimalOrNull(value: Decimal | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value.toFixed());
}

function riskColumns(computation: RiskComputation, balance: Decimal | null): TradePlanRiskColumns {
  return {
    balanceSnapshot: decimalOrNull(balance),
    riskPercent: decimalOrNull(computation.riskPercent),
    riskAmount: decimalOrNull(computation.riskAmount),
    stopDistance: decimalOrNull(computation.stopDistance),
    stopPips: decimalOrNull(computation.stopPips),
    positionSize: decimalOrNull(computation.positionSize),
    potentialProfit: decimalOrNull(computation.potentialProfit),
    potentialLoss: decimalOrNull(computation.potentialLoss),
    rrRatio: decimalOrNull(computation.rrRatio),
  };
}

/** Structural gate (§11/§12) — map blocking engine issues to HTTP errors. */
function rejectStructural(issues: readonly TradePlanValidationIssue[], sizeMode: PlanSizeMode): void {
  const blocking = issues.find(
    (candidate) =>
      candidate.severity === "ERROR" &&
      !(candidate.code === "STOP_LOSS_MISSING" && sizeMode === "quantity"),
  );
  if (blocking === undefined) return;
  if (blocking.code === "INSTRUMENT_SPECIFICATION_MISSING") {
    throw new BusinessRuleError(
      blocking.message,
      TRADE_PLANNING_ERROR_CODES.INSTRUMENT_SPECIFICATION_UNAVAILABLE,
    );
  }
  if (blocking.code === "CURRENCY_CONVERSION_UNAVAILABLE") {
    throw new BusinessRuleError(
      blocking.message,
      TRADE_PLANNING_ERROR_CODES.CURRENCY_CONVERSION_UNAVAILABLE,
    );
  }
  throw new BusinessRuleError(
    blocking.message,
    TRADE_PLANNING_ERROR_CODES.INVALID_TRADE_PLAN_CONFIGURATION,
  );
}

function checklistCompleteOf(checklist: unknown): boolean | null {
  if (checklist === null || checklist === undefined) return null;
  const snapshot = checklist as { items?: Array<{ required: boolean; checked: boolean }> };
  if (!Array.isArray(snapshot.items) || snapshot.items.length === 0) return null;
  return snapshot.items.every((item) => (item.required ? item.checked : true));
}

// ── The service ──────────────────────────────────────────────────────────────

@Injectable()
export class TradePlanningService {
  constructor(
    private readonly repository: TradePlanRepository,
    private readonly accountsRepository: AccountsRepository,
    @Inject(INSTRUMENT_SPECIFICATION_PROVIDER)
    private readonly specsProvider: InstrumentSpecificationProvider,
    @Inject(FX_RATE_PROVIDER) private readonly fxRateProvider: FxRateProvider,
    @Inject(RISK_LIMIT_PROVIDER) private readonly riskLimitProvider: RiskLimitProvider,
    @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async list(userId: string, query: ListTradePlansQuery) {
    const { rows, total } = await this.repository.listPlans({
      userId,
      status: query.status,
      accountId: query.accountId,
      symbol: query.symbol,
      direction: query.direction,
      strategyId: query.strategyId,
      plannedFrom: query.plannedFrom === undefined ? undefined : new Date(query.plannedFrom),
      plannedTo: query.plannedTo === undefined ? undefined : new Date(query.plannedTo),
      sort: query.sort,
      order: query.order,
      page: query.page,
      limit: query.limit,
    });
    return {
      tradePlans: rows.map(toTradePlanSummary),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async get(userId: string, planId: string): Promise<{ tradePlan: TradePlanDetail }> {
    const plan = await this.mustGetPlan(userId, planId);
    return { tradePlan: toTradePlanDetail(plan) };
  }

  // ── Create (§37) ───────────────────────────────────────────────────────────

  async create(
    userId: string,
    input: CreateTradePlanInput,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    // §40 — a retried create returns the plan the first request already made.
    if (input.clientRequestId !== undefined) {
      const existing = await this.repository.findByClientRequest(userId, input.clientRequestId);
      if (existing !== null) {
        return { tradePlan: toTradePlanDetail(existing) };
      }
    }

    const account = await this.mustGetAccount(userId, input.accountId);
    const configuration = await this.buildConfiguration(account, {
      symbol: input.symbol,
      direction: input.direction,
      entryType: input.entryType,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      sizeMode: input.size.mode as PlanSizeMode,
      sizeValue:
        input.size.mode === "quantity"
          ? input.size.quantity
          : input.size.mode === "risk_percent"
            ? input.size.riskPercent
            : input.size.riskAmount,
      timeframe: input.timeframe ?? null,
      strategyId: input.strategyId ?? null,
      rationale: input.rationale ?? null,
      checklist: input.checklist ?? null,
      plannedAt: input.plannedAt ?? null,
    });

    const status = input.commitNow === true ? "PLANNED" : "DRAFT";
    const plannedAt = input.commitNow === true ? new Date(input.plannedAt ?? new Date().toISOString()) : null;

    try {
      const row = await this.repository.insertPlan({
        userId,
        accountId: account.id,
        status,
        direction: configuration.direction,
        entryType: configuration.entryType,
        symbol: configuration.symbol,
        currency: account.currency,
        timeframe: configuration.timeframe,
        strategyId: configuration.strategyId,
        entryPrice: new Prisma.Decimal(configuration.entryPrice.toFixed()),
        stopLoss: decimalOrNull(configuration.stopLoss),
        takeProfit: decimalOrNull(configuration.takeProfit),
        sizeMode: configuration.sizeMode,
        sizeValue: new Prisma.Decimal(configuration.sizeValue.toFixed()),
        risk: riskColumns(configuration.computation, configuration.balance),
        rationale: configuration.rationale,
        checklist: configuration.checklist,
        checklistComplete: configuration.checklistComplete,
        clientRequestId: input.clientRequestId ?? null,
        plannedAt,
      });
      this.logger?.info(
        { userId, accountId: account.id, planId: row.id, status },
        "trade_plan.created",
      );
      return { tradePlan: toTradePlanDetail(row) };
    } catch (error) {
      // Concurrent retry lost the (userId, clientRequestId) race — the winner
      // is the response (§40).
      if (
        input.clientRequestId !== undefined &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.repository.findByClientRequest(userId, input.clientRequestId);
        if (existing !== null) return { tradePlan: toTradePlanDetail(existing) };
      }
      throw error;
    }
  }

  // ── Update (§38 — DRAFT/PLANNED only) ──────────────────────────────────────

  async update(
    userId: string,
    planId: string,
    input: UpdateTradePlanInput,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const plan = await this.mustGetPlan(userId, planId);
    if (!isEditable(plan.status as TradePlanDetail["status"])) {
      throw new BusinessRuleError(
        "Only draft or planned plans can be edited; validated plans preserve their snapshot.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_INVALID_STATE,
      );
    }
    const account = await this.mustGetAccount(userId, plan.accountId);

    const configuration = await this.buildConfiguration(account, {
      symbol: input.symbol ?? plan.symbol,
      direction: input.direction ?? (plan.direction as "BUY" | "SELL"),
      entryType: input.entryType ?? plan.entryType,
      entryPrice: input.entryPrice ?? plan.entryPrice.toFixed(),
      stopLoss: input.stopLoss !== undefined ? input.stopLoss : decimalToString(plan.stopLoss),
      takeProfit: input.takeProfit !== undefined ? input.takeProfit : decimalToString(plan.takeProfit),
      sizeMode:
        (input.size?.mode as PlanSizeMode | undefined) ?? (plan.sizeMode as PlanSizeMode),
      sizeValue:
        input.size !== undefined
          ? input.size.mode === "quantity"
            ? input.size.quantity
            : input.size.mode === "risk_percent"
              ? input.size.riskPercent
              : input.size.riskAmount
          : plan.sizeValue.toFixed(),
      timeframe: input.timeframe !== undefined ? input.timeframe : plan.timeframe,
      strategyId: input.strategyId !== undefined ? input.strategyId : plan.strategyId,
      rationale: input.rationale !== undefined ? input.rationale : plan.rationale,
      checklist: input.checklist !== undefined ? input.checklist : plan.checklist,
      plannedAt: input.plannedAt !== undefined ? input.plannedAt : isoOrNull(plan.plannedAt),
    });

    const updated = await this.repository.updatePlanConfiguration(
      plan.id,
      userId,
      ["DRAFT", "PLANNED"],
      {
        symbol: configuration.symbol,
        direction: configuration.direction,
        entryType: configuration.entryType,
        entryPrice: new Prisma.Decimal(configuration.entryPrice.toFixed()),
        stopLoss: decimalOrNull(configuration.stopLoss),
        takeProfit: decimalOrNull(configuration.takeProfit),
        sizeMode: configuration.sizeMode,
        sizeValue: new Prisma.Decimal(configuration.sizeValue.toFixed()),
        risk: riskColumns(configuration.computation, configuration.balance),
        timeframe: configuration.timeframe,
        strategyId: configuration.strategyId,
        rationale: configuration.rationale,
        plannedAt: configuration.plannedAt,
        checklist: input.checklist !== undefined ? input.checklist : undefined,
        checklistComplete:
          input.checklist !== undefined ? checklistCompleteOf(input.checklist) : undefined,
      },
    );
    if (!updated) {
      throw new ConflictError(
        "The plan was modified concurrently. Reload and retry.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_CONCURRENT_MODIFICATION,
      );
    }
    this.logger?.info({ userId, accountId: account.id, planId: plan.id }, "trade_plan.updated");
    return { tradePlan: toTradePlanDetail(await this.mustGetPlan(userId, plan.id)) };
  }

  // ── Lifecycle (§7) ─────────────────────────────────────────────────────────

  /** DRAFT → PLANNED (§7). Idempotent on an already-committed plan (§40). */
  async commit(
    userId: string,
    planId: string,
    input: CommitTradePlanInput,
  ): Promise<{ tradePlan: TradePlanDetail }> {
    const plan = await this.mustGetPlan(userId, planId);
    if (plan.status === "PLANNED") {
      return { tradePlan: toTradePlanDetail(plan) };
    }
    if (plan.status !== "DRAFT") {
      throw new BusinessRuleError(
        "Only draft plans can be committed.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_INVALID_STATE,
      );
    }
    const plannedAt = input.plannedAt !== undefined ? new Date(input.plannedAt) : new Date();
    const transitioned = await this.repository.transitionStatus(plan.id, userId, ["DRAFT"], "PLANNED", {
      plannedAt,
    });
    if (!transitioned) {
      throw await this.concurrentOrCurrent(userId, plan.id);
    }
    this.logger?.info({ userId, planId: plan.id }, "trade_plan.committed");
    return { tradePlan: toTradePlanDetail(await this.mustGetPlan(userId, plan.id)) };
  }

  /**
   * Pre-trade validation battery (§21). PLANNED → VALIDATED on a clean pass;
   * a failing battery keeps the plan PLANNED with the findings persisted.
   * Re-validating a VALIDATED plan is an idempotent echo of the recorded
   * result (§40) — it never rewrites the planning snapshot (§38).
   */
  async validate(userId: string, planId: string): Promise<ValidateTradePlanResponse> {
    const plan = await this.mustGetPlan(userId, planId);
    if (plan.status === "VALIDATED") {
      const recorded = plan.lastValidation as
        | { evaluatedAt: string; passed: boolean; issues: TradePlanValidationIssue[] }
        | null;
      if (recorded !== null) {
        return {
          planId: plan.id,
          status: "VALIDATED",
          passed: recorded.passed,
          issues: recorded.issues,
          evaluatedAt: recorded.evaluatedAt,
        };
      }
    }
    if (plan.status !== "PLANNED") {
      throw new BusinessRuleError(
        plan.status === "DRAFT"
          ? "Commit the plan before validating it."
          : "The plan is no longer in a validatable state.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_INVALID_STATE,
      );
    }

    const account = await this.mustGetAccount(userId, plan.accountId);
    const environment = await this.resolveEnvironment(plan.symbol, account);
    const battery = runValidationBattery({
      direction: plan.direction as "BUY" | "SELL",
      entryPrice: new Decimal(plan.entryPrice.toFixed()),
      stopLoss: plan.stopLoss === null ? null : new Decimal(plan.stopLoss.toFixed()),
      takeProfit: plan.takeProfit === null ? null : new Decimal(plan.takeProfit.toFixed()),
      sizeMode: plan.sizeMode as PlanSizeMode,
      sizeValue: new Decimal(plan.sizeValue.toFixed()),
      balance: environment.balance,
      specs: environment.specs,
      fxRate: environment.fxRate,
      checklist: (plan.checklist as never) ?? null,
      limits: await this.riskLimitProvider.limitsFor(userId, plan.accountId),
    });

    const evaluatedAt = new Date();
    const snapshot = {
      evaluatedAt: evaluatedAt.toISOString(),
      passed: battery.passed,
      issues: battery.issues,
    };

    if (battery.passed) {
      const transitioned = await this.repository.transitionStatus(
        plan.id,
        userId,
        ["PLANNED"],
        "VALIDATED",
        { validatedAt: evaluatedAt, lastValidation: snapshot, risk: riskColumns(battery.risk, environment.balance) },
      );
      if (!transitioned) {
        throw await this.concurrentOrCurrent(userId, plan.id);
      }
      this.logger?.info(
        { userId, planId: plan.id, accountId: plan.accountId },
        "trade_plan.validated",
      );
      return { planId: plan.id, status: "VALIDATED", passed: true, issues: battery.issues, evaluatedAt: snapshot.evaluatedAt };
    }

    const recorded = await this.repository.recordValidationFailure(
      plan.id,
      userId,
      ["PLANNED"],
      snapshot,
      riskColumns(battery.risk, environment.balance),
    );
    if (!recorded) {
      throw await this.concurrentOrCurrent(userId, plan.id);
    }
    this.logger?.info(
      { userId, planId: plan.id, accountId: plan.accountId, issueCount: battery.issues.length },
      "trade_plan.validation_failed",
    );
    return { planId: plan.id, status: "PLANNED", passed: false, issues: battery.issues, evaluatedAt: snapshot.evaluatedAt };
  }

  /** PLANNED/VALIDATED → CANCELLED. Idempotent on an already-cancelled plan. */
  async cancel(userId: string, planId: string): Promise<{ tradePlan: TradePlanDetail }> {
    const plan = await this.mustGetPlan(userId, planId);
    if (plan.status === "CANCELLED") {
      return { tradePlan: toTradePlanDetail(plan) };
    }
    if (!isCancellable(plan.status as TradePlanDetail["status"])) {
      throw new BusinessRuleError(
        plan.status === "DRAFT"
          ? "Draft plans are abandoned, not cancelled."
          : "The plan can no longer be cancelled.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_INVALID_STATE,
      );
    }
    const transitioned = await this.repository.transitionStatus(
      plan.id,
      userId,
      ["PLANNED", "VALIDATED"],
      "CANCELLED",
      { cancelledAt: new Date() },
    );
    if (!transitioned) {
      throw await this.concurrentOrCurrent(userId, plan.id);
    }
    this.logger?.info({ userId, planId: plan.id }, "trade_plan.cancelled");
    return { tradePlan: toTradePlanDetail(await this.mustGetPlan(userId, plan.id)) };
  }

  /** DRAFT/PLANNED → ABANDONED. Idempotent on an already-abandoned plan. */
  async abandon(userId: string, planId: string): Promise<{ tradePlan: TradePlanDetail }> {
    const plan = await this.mustGetPlan(userId, planId);
    if (plan.status === "ABANDONED") {
      return { tradePlan: toTradePlanDetail(plan) };
    }
    if (!isAbandonable(plan.status as TradePlanDetail["status"])) {
      throw new BusinessRuleError(
        "The plan can no longer be abandoned.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_INVALID_STATE,
      );
    }
    const transitioned = await this.repository.transitionStatus(
      plan.id,
      userId,
      ["DRAFT", "PLANNED"],
      "ABANDONED",
      { abandonedAt: new Date() },
    );
    if (!transitioned) {
      throw await this.concurrentOrCurrent(userId, plan.id);
    }
    this.logger?.info({ userId, planId: plan.id }, "trade_plan.abandoned");
    return { tradePlan: toTradePlanDetail(await this.mustGetPlan(userId, plan.id)) };
  }

  // ── Recalculation (§39) ────────────────────────────────────────────────────

  /**
   * Re-run the risk engine over the UNCHANGED configuration against fresh
   * environment inputs (balance, specs, fx) and persist the derived columns.
   * Allowed in DRAFT/PLANNED only — validated plans keep their snapshot.
   */
  async recalculate(userId: string, planId: string): Promise<{ tradePlan: TradePlanDetail }> {
    const plan = await this.mustGetPlan(userId, planId);
    if (!isRecalculable(plan.status as TradePlanDetail["status"])) {
      throw new BusinessRuleError(
        "Only draft or planned plans can be recalculated.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_INVALID_STATE,
      );
    }
    const account = await this.mustGetAccount(userId, plan.accountId);
    const configuration = await this.buildConfiguration(account, {
      symbol: plan.symbol,
      direction: plan.direction as "BUY" | "SELL",
      entryType: plan.entryType,
      entryPrice: plan.entryPrice.toFixed(),
      stopLoss: decimalToString(plan.stopLoss),
      takeProfit: decimalToString(plan.takeProfit),
      sizeMode: plan.sizeMode as PlanSizeMode,
      sizeValue: plan.sizeValue.toFixed(),
      timeframe: plan.timeframe,
      strategyId: plan.strategyId,
      rationale: plan.rationale,
      checklist: plan.checklist,
      plannedAt: isoOrNull(plan.plannedAt),
    });
    rejectStructural(configuration.computation.issues, configuration.sizeMode);

    const updated = await this.repository.updatePlanConfiguration(
      plan.id,
      userId,
      ["DRAFT", "PLANNED"],
      { risk: riskColumns(configuration.computation, configuration.balance) },
    );
    if (!updated) {
      throw new ConflictError(
        "The plan was modified concurrently. Reload and retry.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_CONCURRENT_MODIFICATION,
      );
    }
    this.logger?.info({ userId, planId: plan.id }, "trade_plan.risk_calculated");
    return { tradePlan: toTradePlanDetail(await this.mustGetPlan(userId, plan.id)) };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async mustGetPlan(userId: string, planId: string): Promise<TradePlanRow> {
    const row = await this.repository.findPlanForUser(planId, userId);
    if (row === null) {
      throw new NotFoundError(
        "The requested trade plan does not exist.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_NOT_FOUND,
      );
    }
    return row;
  }

  private async mustGetAccount(userId: string, accountId: string): Promise<TradingAccountRow> {
    const account = await this.accountsRepository.findAccountForUser(accountId, userId);
    if (account === null) {
      throw new NotFoundError(
        "The requested trading account does not exist.",
        TRADE_PLANNING_ERROR_CODES.ACCOUNT_NOT_FOUND,
      );
    }
    return account;
  }

  /** Transition lost a race — either the winner already did it (echo) or 409. */
  private async concurrentOrCurrent(userId: string, planId: string): Promise<never> {
    const current = await this.repository.findPlanForUser(planId, userId);
    if (
      current !== null &&
      (current.status === "PLANNED" ||
        current.status === "VALIDATED" ||
        current.status === "CANCELLED" ||
        current.status === "ABANDONED")
    ) {
      // Another request completed the same transition — treat as won (§40).
      // The caller re-reads; throw a conflict only for a DIFFERENT outcome.
      throw new ConflictError(
        "The plan was transitioned concurrently.",
        TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_CONCURRENT_MODIFICATION,
      );
    }
    throw new ConflictError(
      "The plan was modified concurrently. Reload and retry.",
      TRADE_PLANNING_ERROR_CODES.TRADE_PLAN_CONCURRENT_MODIFICATION,
    );
  }

  private async resolveEnvironment(symbol: string, account: TradingAccountRow) {
    const specs = await this.specsProvider.findSpecification(symbol);
    const fxRate =
      specs === null ? null : await this.fxRateProvider.rate(specs.quoteCurrency, account.currency);
    const rawBalance =
      (await this.accountsRepository.latestSnapshot(account.id))?.balance ??
      account.startingBalance;
    const balance = rawBalance !== null && rawBalance.greaterThan(0) ? new Decimal(rawBalance.toFixed()) : null;
    return { specs, fxRate, balance };
  }

  private async buildConfiguration(
    account: TradingAccountRow,
    raw: {
      symbol: string;
      direction: "BUY" | "SELL";
      entryType: string;
      entryPrice: string;
      stopLoss: string | null;
      takeProfit: string | null;
      sizeMode: PlanSizeMode;
      sizeValue: string;
      timeframe: string | null;
      strategyId: string | null;
      rationale: string | null;
      checklist: unknown;
      plannedAt: string | null;
    },
  ): Promise<{
    symbol: string;
    direction: "BUY" | "SELL";
    entryType: string;
    entryPrice: Decimal;
    stopLoss: Decimal | null;
    takeProfit: Decimal | null;
    sizeMode: PlanSizeMode;
    sizeValue: Decimal;
    timeframe: string | null;
    strategyId: string | null;
    rationale: string | null;
    checklist: unknown;
    checklistComplete: boolean | null;
    plannedAt: Date | null;
    /** Environment balance the computation was anchored to (snapshot value). */
    balance: Decimal | null;
    computation: RiskComputation;
  }> {
    const environment = await this.resolveEnvironment(raw.symbol, account);
    const entryPrice = new Decimal(raw.entryPrice);
    const stopLoss = dec(raw.stopLoss);
    const takeProfit = dec(raw.takeProfit);
    const sizeValue = new Decimal(raw.sizeValue);

    const computation = computePlannedRisk({
      direction: raw.direction,
      entryPrice,
      stopLoss,
      takeProfit,
      sizeMode: raw.sizeMode,
      sizeValue,
      balance: environment.balance,
      specs: environment.specs,
      fxRate: environment.fxRate,
    });
    rejectStructural(computation.issues, raw.sizeMode);

    return {
      symbol: raw.symbol,
      direction: raw.direction,
      entryType: raw.entryType,
      entryPrice,
      stopLoss,
      takeProfit,
      sizeMode: raw.sizeMode,
      sizeValue,
      timeframe: raw.timeframe,
      strategyId: raw.strategyId,
      rationale: raw.rationale,
      checklist: raw.checklist,
      checklistComplete: checklistCompleteOf(raw.checklist),
      plannedAt: raw.plannedAt === null ? null : new Date(raw.plannedAt),
      balance: environment.balance,
      computation,
    };
  }
}

function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed();
}

function isoOrNull(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}
