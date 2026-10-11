/**
 * Trading Core application service (Phase 4) — journal trade use cases.
 *
 * Ownership is ALWAYS derived from the authenticated principal (§23/§24):
 * the userId comes from the JWT guard, never from the client, and every
 * account/trade lookup is ownership-scoped (foreign ids are honest 404s —
 * the established IDOR convention).
 *
 * Source-aware editability (§30): broker-derived execution data on
 * EXTERNAL_SYNC trades is authoritative and read-only through the API;
 * journal metadata is editable. Manual trades are fully editable (they are
 * user-provided data) and their results are recomputed server-side on every
 * edit — client-supplied P&L is never accepted (§46).
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import { DOMAIN_EVENT_BUS, type DomainEventBus } from "../../shared/events/domain-event-bus";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/app-error";
import { TRADING_CORE_ERROR_CODES } from "../../shared/contracts";
import type {
  CloseManualTradeInput,
  CreateManualTradeInput,
  JournalImportTradesInput,
  JournalTradesQuery,
  UpdateJournalTradeInput,
} from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { IdentityRepository } from "../identity/identity.repository";
import {
  aggregateExecutions,
  tradingDateKey,
} from "./trade-aggregation.service";
import {
  buildReconstructionPlan,
} from "./trade-reconstruction.service";
import type { TradeWithExecutions } from "./trading.repository";
import { TradingRepository } from "./trading.repository";
import { toTradeDetail, toTradeSummary } from "./trading.mappers";

const ZERO = new Prisma.Decimal(0);

function dec(value: string | null | undefined): Prisma.Decimal | null {
  return value === undefined || value === null ? null : new Prisma.Decimal(value);
}

/** Content-based stable reference for an imported row (idempotency, §27). */
export function importRowReference(input: {
  broker: string;
  symbol: string;
  side: string;
  entryAt: string;
  entryPrice: string;
  quantity?: string;
  exitAt?: string;
  exitPrice?: string;
  fees?: string;
}): string {
  const canonical = [
    input.broker,
    input.symbol,
    input.side,
    input.entryAt,
    input.entryPrice,
    input.quantity ?? "",
    input.exitAt ?? "",
    input.exitPrice ?? "",
    input.fees ?? "",
  ].join("|");
  return `imp-${createHash("sha256").update(canonical).digest("hex").slice(0, 40)}`;
}

@Injectable()
export class TradingService {
  constructor(
    private readonly repository: TradingRepository,
    private readonly accountsRepository: AccountsRepository,
    private readonly identityRepository: IdentityRepository,
    @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
    /**
     * Phase 10: optional by design — the bus is a leaf capability; when
     * absent (never in the wired AppModule), the core journals silently.
     */
    @Optional() @Inject(DOMAIN_EVENT_BUS) private readonly events?: DomainEventBus,
  ) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async list(userId: string, query: JournalTradesQuery) {
    const { rows, total } = await this.repository.listTrades({
      userId,
      accountId: query.accountId,
      status: query.status,
      symbol: query.symbol,
      direction: query.direction,
      source: query.source,
      openedFrom: query.openedFrom === undefined ? undefined : new Date(query.openedFrom),
      openedTo: query.openedTo === undefined ? undefined : new Date(query.openedTo),
      closedFrom: query.closedFrom === undefined ? undefined : new Date(query.closedFrom),
      closedTo: query.closedTo === undefined ? undefined : new Date(query.closedTo),
      sort: query.sort,
      order: query.order,
      page: query.page,
      limit: query.limit,
    });
    return {
      trades: rows.map(toTradeSummary),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async get(userId: string, tradeId: string) {
    const trade = await this.mustGetTrade(userId, tradeId);
    return { trade: toTradeDetail(trade) };
  }

  // ── Manual trades (§29 — honest provenance) ───────────────────────────────

  async createManual(
    userId: string,
    input: CreateManualTradeInput,
  ): Promise<{ trade: ReturnType<typeof toTradeDetail> }> {
    const account = await this.mustGetAccount(userId, input.accountId);
    const user = await this.loadUser(userId);

    const entryAt = input.entryAt !== undefined ? new Date(input.entryAt) : new Date();
    const executions: Array<{
      role: "ENTRY" | "EXIT";
      side: "BUY" | "SELL";
      volume: Prisma.Decimal;
      price: Prisma.Decimal | null;
      profit: Prisma.Decimal | null;
      commission: Prisma.Decimal | null;
      swap: Prisma.Decimal | null;
      executedAt: Date;
      reason: string | null;
      note: string | null;
      externalDealId: string | null;
    }> = [
      {
        role: "ENTRY",
        side: input.direction,
        volume: new Prisma.Decimal(input.quantity),
        price: new Prisma.Decimal(input.entryPrice),
        profit: null,
        commission: null,
        swap: null,
        executedAt: entryAt,
        reason: null,
        note: null,
        externalDealId: null,
      },
    ];
    if (input.variant === "closed") {
      executions.push({
        role: "EXIT" as const,
        side: opposite(input.direction),
        volume: new Prisma.Decimal(input.quantity),
        price: new Prisma.Decimal(input.exitPrice),
        profit: null,
        // Manual fees input (positive cost) → canonical signed commission.
        commission: input.fees === undefined ? null : new Prisma.Decimal(input.fees).neg(),
        swap: input.swap === undefined ? null : new Prisma.Decimal(input.swap),
        executedAt: new Date(input.exitAt),
        reason: input.exitReason,
        note: null,
        externalDealId: null,
      });
    }

    const aggregates = aggregateExecutions(executions, { riskAmount: dec(input.riskAmount ?? null) });
    if (aggregates.entryPrice === null) {
      throw new BusinessRuleError(
        "The trade entry has no price to journal.",
        TRADING_CORE_ERROR_CODES.INVALID_EXECUTION,
      );
    }

    const row = await this.repository.createTradeWithExecutions({
      userId,
      accountId: account.id,
      currency: account.currency,
      symbol: input.symbol,
      direction: input.direction,
      source: "MANUAL",
      initialStop: dec(input.initialStop ?? null),
      initialTP: dec(input.initialTP ?? null),
      riskAmount: dec(input.riskAmount ?? null),
      notes: input.notes ?? null,
      tradingDate: new Date(`${tradingDateKey(entryAt, user?.timezone)}T00:00:00.000Z`),
      externalPositionId: null,
      status: aggregates.status,
      quantity: aggregates.quantity,
      closedQuantity: aggregates.closedQuantity,
      entryPrice: aggregates.entryPrice,
      exitPrice: aggregates.exitPrice,
      entryAt: aggregates.entryAt ?? entryAt,
      exitAt: aggregates.exitAt,
      exitReason: input.variant === "closed" ? input.exitReason : null,
      fees: aggregates.fees,
      swap: aggregates.swap,
      pnlGross: aggregates.pnlGross,
      pnlNet: aggregates.pnlNet,
      rMultiple: aggregates.rMultiple,
      executions,
    });
    this.logger?.info({ userId, accountId: account.id, tradeId: row.id }, "manual trade created");
    // Phase 10 §17: canonical domain event — Session Live subscribes to
    // surface "trade detected" inside an active session (source "Journal").
    // Fire-and-forget: a consumer failure never affects the capture path.
    this.events?.emit("trade.created", {
      userId,
      tradeId: row.id,
      symbol: input.symbol,
      direction: input.direction,
      quantity: aggregates.quantity.toFixed(),
      entryPrice: aggregates.entryPrice.toFixed(),
      at: (aggregates.entryAt ?? entryAt).toISOString(),
    });
    return { trade: toTradeDetail(await this.repository.findTradeForUser(row.id, userId) as TradeWithExecutions) };
  }

  /** Close a MANUAL open trade (single or partial legs). Sync trades close by reconciliation only (§10/§30). */
  async closeManual(
    userId: string,
    tradeId: string,
    input: CloseManualTradeInput,
  ): Promise<{ trade: ReturnType<typeof toTradeDetail> }> {
    const trade = await this.mustGetTrade(userId, tradeId);
    if (trade.source !== "MANUAL") {
      throw new BusinessRuleError(
        "Broker-synchronized trades are closed by reconciliation, not by hand.",
        TRADING_CORE_ERROR_CODES.EXTERNAL_TRADE_IMMUTABLE,
      );
    }
    if (trade.status !== "OPEN") {
      throw new BusinessRuleError(
        "Only open trades can be closed.",
        TRADING_CORE_ERROR_CODES.INVALID_TRADE_STATE,
      );
    }

    const remaining = trade.quantity.minus(trade.closedQuantity);
    const exits: Array<{
      role: "EXIT";
      side: "BUY" | "SELL";
      volume: Prisma.Decimal;
      price: Prisma.Decimal | null;
      profit: Prisma.Decimal | null;
      commission: Prisma.Decimal | null;
      swap: Prisma.Decimal | null;
      executedAt: Date;
      reason: string | null;
      note: string | null;
      externalDealId: null;
    }> = input.mode === "single"
      ? [
          {
            role: "EXIT",
            side: opposite(trade.direction as "BUY" | "SELL"),
            volume: remaining,
            price: new Prisma.Decimal(input.exitPrice),
            profit: null,
            commission: input.fees === undefined ? null : new Prisma.Decimal(input.fees).neg(),
            swap: input.swap === undefined ? null : new Prisma.Decimal(input.swap),
            executedAt: new Date(input.exitAt),
            reason: input.exitReason,
            note: input.note ?? null,
            externalDealId: null,
          },
        ]
      : input.exits.map((leg) => ({
          role: "EXIT" as const,
          side: opposite(trade.direction as "BUY" | "SELL"),
          volume: new Prisma.Decimal(leg.quantity),
          price: new Prisma.Decimal(leg.price),
          profit: null,
          commission: null,
          swap: null,
          executedAt: new Date(leg.exitedAt),
          reason: leg.reason,
          note: leg.note ?? null,
          externalDealId: null,
        }));

    const legsVolume = exits.reduce((sum, leg) => sum.plus(leg.volume), ZERO);
    if (legsVolume.greaterThan(remaining)) {
      throw new BusinessRuleError(
        "Exit volume exceeds the remaining open quantity.",
        TRADING_CORE_ERROR_CODES.INVALID_EXECUTION,
      );
    }
    if (legsVolume.lte(0)) {
      throw new BusinessRuleError(
        "Exit volume must be positive.",
        TRADING_CORE_ERROR_CODES.INVALID_EXECUTION,
      );
    }

    const aggregates = aggregateExecutions(
      [
        ...trade.executions.map((execution) => ({
          role: execution.role as "ENTRY" | "EXIT",
          volume: execution.volume,
          price: execution.price,
          profit: execution.profit,
          commission: execution.commission,
          swap: execution.swap,
          executedAt: execution.executedAt,
        })),
        ...exits,
      ],
      { riskAmount: trade.riskAmount },
    );
    const lastExit = [...exits].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime()).at(-1);

    await this.repository.closeTrade({
      tradeId: trade.id,
      accountId: trade.accountId,
      exits,
      aggregates: {
        status: aggregates.status,
        closedQuantity: aggregates.closedQuantity,
        exitPrice: aggregates.exitPrice,
        exitAt: aggregates.exitAt,
        exitReason: lastExit?.reason ?? trade.exitReason,
        fees: aggregates.fees,
        swap: aggregates.swap,
        pnlGross: aggregates.pnlGross,
        pnlNet: aggregates.pnlNet,
        rMultiple: aggregates.rMultiple,
      },
    });
    this.logger?.info({ userId, tradeId: trade.id }, "manual trade closed");
    return { trade: toTradeDetail(await this.repository.findTradeForUser(trade.id, userId) as TradeWithExecutions) };
  }

  // ── Journal metadata + manual corrections (§30) ───────────────────────────

  async update(userId: string, tradeId: string, input: UpdateJournalTradeInput) {
    const trade = await this.mustGetTrade(userId, tradeId);

    const executionFieldTouched =
      input.direction !== undefined ||
      input.entryPrice !== undefined ||
      input.entryAt !== undefined ||
      input.quantity !== undefined ||
      input.exitPrice !== undefined ||
      input.exitAt !== undefined ||
      input.exitReason !== undefined ||
      input.fees !== undefined ||
      input.swap !== undefined;
    if (executionFieldTouched && trade.source !== "MANUAL") {
      throw new BusinessRuleError(
        "Broker-derived execution data cannot be edited.",
        TRADING_CORE_ERROR_CODES.EXTERNAL_TRADE_IMMUTABLE,
      );
    }

    const executionPatches: Array<{ id: string; data: Record<string, unknown> }> = [];
    const executions = trade.executions.map((execution) => ({
      role: execution.role as "ENTRY" | "EXIT",
      side: execution.side as "BUY" | "SELL",
      volume: execution.volume,
      price: execution.price,
      profit: execution.profit,
      commission: execution.commission,
      swap: execution.swap,
      executedAt: execution.executedAt,
    }));

    const entryExecution = trade.executions.find((e) => e.role === "ENTRY");
    const exitExecutions = trade.executions.filter((e) => e.role === "EXIT");

    if (executionFieldTouched) {
      if (entryExecution) {
        const patch: Record<string, unknown> = {};
        if (input.entryPrice !== undefined) patch.price = new Prisma.Decimal(input.entryPrice);
        if (input.entryAt !== undefined) patch.executedAt = new Date(input.entryAt);
        if (input.quantity !== undefined) patch.volume = new Prisma.Decimal(input.quantity);
        if (input.direction !== undefined) patch.side = input.direction;
        if (Object.keys(patch).length > 0) executionPatches.push({ id: entryExecution.id, data: patch });
        if (input.entryPrice !== undefined) executions[entryIndex(executions, "ENTRY")]!.price = new Prisma.Decimal(input.entryPrice);
        if (input.entryAt !== undefined) executions[entryIndex(executions, "ENTRY")]!.executedAt = new Date(input.entryAt);
        if (input.quantity !== undefined) executions[entryIndex(executions, "ENTRY")]!.volume = new Prisma.Decimal(input.quantity);
        if (input.direction !== undefined) executions[entryIndex(executions, "ENTRY")]!.side = input.direction;
      }
      // Exit-field edits apply to the SINGLE exit execution only — partial
      // exit legs are immutable journal history (honest limitation).
      if ((input.exitPrice !== undefined || input.exitAt !== undefined || input.exitReason !== undefined || input.fees !== undefined || input.swap !== undefined)) {
        if (exitExecutions.length !== 1) {
          throw new BusinessRuleError(
            "Only single-exit trades can have their exit corrected.",
            TRADING_CORE_ERROR_CODES.INVALID_TRADE_STATE,
          );
        }
        const exitExecution = exitExecutions[0] as (typeof exitExecutions)[number];
        const patch: Record<string, unknown> = {};
        if (input.exitPrice !== undefined) patch.price = new Prisma.Decimal(input.exitPrice);
        if (input.exitAt !== undefined) patch.executedAt = new Date(input.exitAt);
        if (input.exitReason !== undefined) patch.reason = input.exitReason;
        if (input.fees !== undefined) patch.commission = new Prisma.Decimal(input.fees).neg();
        if (input.swap !== undefined) patch.swap = new Prisma.Decimal(input.swap);
        executionPatches.push({ id: exitExecution.id, data: patch });
        const execIndex = executions.findIndex((e) => e.role === "EXIT");
        if (input.exitPrice !== undefined && execIndex >= 0) executions[execIndex]!.price = new Prisma.Decimal(input.exitPrice);
        if (input.exitAt !== undefined && execIndex >= 0) executions[execIndex]!.executedAt = new Date(input.exitAt);
        if (input.fees !== undefined && execIndex >= 0) executions[execIndex]!.commission = new Prisma.Decimal(input.fees).neg();
        if (input.swap !== undefined && execIndex >= 0) executions[execIndex]!.swap = new Prisma.Decimal(input.swap);
      }
    }

    const aggregates = aggregateExecutions(executions, {
      riskAmount: input.riskAmount !== undefined ? dec(input.riskAmount) : trade.riskAmount,
    });

    const user = executionFieldTouched || input.notes !== undefined ? await this.loadUser(userId) : null;
    const entryAtFinal = aggregates.entryAt ?? trade.entryAt;
    const tradePatch: Record<string, unknown> = {};
    if (aggregates.status !== trade.status) tradePatch.status = aggregates.status;
    tradePatch.direction = input.direction ?? trade.direction;
    tradePatch.quantity = aggregates.quantity;
    tradePatch.closedQuantity = aggregates.closedQuantity;
    tradePatch.entryPrice = aggregates.entryPrice ?? trade.entryPrice;
    tradePatch.exitPrice = aggregates.exitPrice;
    tradePatch.entryAt = entryAtFinal;
    tradePatch.exitAt = aggregates.exitAt;
    tradePatch.exitReason =
      input.exitReason !== undefined
        ? input.exitReason
        : aggregates.exitAt !== null
          ? (trade.exitReason ?? null)
          : null;
    tradePatch.fees = aggregates.fees;
    tradePatch.swap = aggregates.swap;
    tradePatch.pnlGross = aggregates.pnlGross;
    tradePatch.pnlNet = aggregates.pnlNet;
    tradePatch.rMultiple = aggregates.rMultiple;
    if (input.initialStop !== undefined) tradePatch.initialStop = dec(input.initialStop);
    if (input.initialTP !== undefined) tradePatch.initialTP = dec(input.initialTP);
    if (input.riskAmount !== undefined) tradePatch.riskAmount = dec(input.riskAmount);
    if (input.notes !== undefined) tradePatch.notes = input.notes;
    if (input.entryAt !== undefined) {
      tradePatch.tradingDate = new Date(`${tradingDateKey(entryAtFinal, user?.timezone)}T00:00:00.000Z`);
    }

    await this.repository.updateTrade(trade.id, tradePatch, executionPatches);
    return { trade: toTradeDetail(await this.repository.findTradeForUser(trade.id, userId) as TradeWithExecutions) };
  }

  /** Soft delete (§57) — journal history is archived, never destroyed. */
  async delete(userId: string, tradeId: string) {
    const trade = await this.mustGetTrade(userId, tradeId);
    const deletedAt = new Date();
    await this.repository.softDeleteTrade(trade.id, deletedAt);
    return { id: trade.id, deletedAt: deletedAt.toISOString().replace(/\.\d{3}Z$/, "Z") };
  }

  // ── External synchronization consumer (§26–§28) ───────────────────────────

  /**
   * Reconcile one account's synchronized external activity into journal
   * trades. Consumes ONLY the Accounts context's public contract (persisted
   * normalized deals/positions) — never provider adapters (§26).
   */
  async reconcileAccount(userId: string, accountId: string, requestId: string | null) {
    const account = await this.mustGetAccount(userId, accountId);
    const user = await this.loadUser(userId);

    const [deals, positions, existingTrades] = await Promise.all([
      this.accountsRepository.listDeals(account.id),
      this.accountsRepository.listPositions(account.id),
      this.repository.listTradesByAccount(account.id),
    ]);

    const plan = buildReconstructionPlan({ deals, positions, existingTrades });

    // ── Enrich the plan with authoritative aggregates ──
    const timezone = user?.timezone;
    const tradesToCreate = [];
    let skippedUnpriced = 0;
    for (const planned of plan.tradesToCreate) {
      const aggregates = aggregateExecutions(planned.executions, { riskAmount: null });
      if (aggregates.entryPrice === null || aggregates.entryAt === null) {
        // Pathological provider data: no priced entry at all — journal the
        // deals is impossible without inventing a price. Skip honestly (§20).
        skippedUnpriced += 1;
        continue;
      }
      tradesToCreate.push({
        userId,
        externalPositionId: planned.externalPositionId,
        direction: planned.direction,
        symbol: planned.symbol,
        currency: account.currency,
        initialStop: planned.initialStop,
        initialTP: planned.initialTP,
        entryPrice: aggregates.entryPrice,
        entryAt: aggregates.entryAt,
        status: aggregates.status,
        quantity: aggregates.quantity,
        closedQuantity: aggregates.closedQuantity,
        exitPrice: aggregates.exitPrice,
        exitAt: aggregates.exitAt,
        fees: aggregates.fees,
        swap: aggregates.swap,
        pnlGross: aggregates.pnlGross,
        pnlNet: aggregates.pnlNet,
        tradingDate: new Date(`${tradingDateKey(aggregates.entryAt, timezone)}T00:00:00.000Z`),
        executions: planned.executions.map((execution) => ({
          role: execution.role,
          side: execution.side,
          volume: execution.volume,
          price: execution.price,
          profit: execution.profit,
          commission: execution.commission,
          swap: execution.swap,
          executedAt: execution.executedAt,
          reason: null,
          note: null,
          externalDealId: execution.externalDealId,
        })),
      });
    }

    interface EnrichedAttachment {
      trade: TradeWithExecutions;
      newExecutions: Array<{
        role: "ENTRY" | "EXIT";
        side: "BUY" | "SELL";
        volume: Prisma.Decimal;
        price: Prisma.Decimal | null;
        profit: Prisma.Decimal | null;
        commission: Prisma.Decimal | null;
        swap: Prisma.Decimal | null;
        executedAt: Date;
        externalDealId: string | null;
      }>;
      aggregates: {
        status: "OPEN" | "CLOSED";
        quantity: Prisma.Decimal;
        closedQuantity: Prisma.Decimal;
        entryPrice: Prisma.Decimal;
        exitPrice: Prisma.Decimal | null;
        entryAt: Date;
        exitAt: Date | null;
        exitReason: null;
        fees: Prisma.Decimal;
        swap: Prisma.Decimal;
        pnlGross: Prisma.Decimal | null;
        pnlNet: Prisma.Decimal | null;
      };
      wasOpen: boolean;
    }
    const attachments: EnrichedAttachment[] = [];
    for (const attachment of plan.attachments) {
      const targetTrade = existingTrades.find((t) => t.id === attachment.tradeId);
      if (!targetTrade) continue;
      const combined = [
        ...targetTrade.executions.map((execution) => ({
          role: execution.role as "ENTRY" | "EXIT",
          side: execution.side as "BUY" | "SELL",
          volume: execution.volume,
          price: execution.price,
          profit: execution.profit,
          commission: execution.commission,
          swap: execution.swap,
          executedAt: execution.executedAt,
        })),
        ...attachment.executions.map((execution) => ({
          role: execution.role,
          side: execution.side,
          volume: execution.volume,
          price: execution.price,
          profit: execution.profit,
          commission: execution.commission,
          swap: execution.swap,
          executedAt: execution.executedAt,
        })),
      ];
      const aggregates = aggregateExecutions(combined, { riskAmount: targetTrade.riskAmount });
      if (aggregates.entryPrice === null || aggregates.entryAt === null) continue;
      attachments.push({
        trade: targetTrade,
        newExecutions: attachment.executions.map((execution) => ({
          role: execution.role,
          side: execution.side,
          volume: execution.volume,
          price: execution.price,
          profit: execution.profit,
          commission: execution.commission,
          swap: execution.swap,
          executedAt: execution.executedAt,
          externalDealId: execution.externalDealId,
        })),
        aggregates: {
          status: aggregates.status,
          quantity: aggregates.quantity,
          closedQuantity: aggregates.closedQuantity,
          entryPrice: aggregates.entryPrice,
          exitPrice: aggregates.exitPrice,
          entryAt: aggregates.entryAt,
          exitAt: aggregates.exitAt,
          exitReason: null,
          fees: aggregates.fees,
          swap: aggregates.swap,
          pnlGross: aggregates.pnlGross,
          pnlNet: aggregates.pnlNet,
        },
        wasOpen: targetTrade.status === "OPEN",
      });
    }

    // Re-aggregation of corrected trades (§28 provider corrections).
    const reaggregatedTrades = [];
    const attachedTradeIds = new Set(plan.attachments.map((a) => a.tradeId));
    for (const tradeId of plan.tradeIdsToReaggregate) {
      if (attachedTradeIds.has(tradeId)) continue; // attachment path recomputes already
      const trade = existingTrades.find((t) => t.id === tradeId);
      if (!trade) continue;
      const updatedExecutions = trade.executions.map((execution) => {
        const correction = plan.executionUpdates.find((u) => u.executionId === execution.id);
        return correction === undefined
          ? {
              role: execution.role as "ENTRY" | "EXIT",
              side: execution.side as "BUY" | "SELL",
              volume: execution.volume,
              price: execution.price,
              profit: execution.profit,
              commission: execution.commission,
              swap: execution.swap,
              executedAt: execution.executedAt,
            }
          : {
              role: execution.role as "ENTRY" | "EXIT",
              side: correction.side,
              volume: correction.volume,
              price: correction.price,
              profit: correction.profit,
              commission: correction.commission,
              swap: correction.swap,
              executedAt: correction.executedAt,
            };
      });
      const aggregates = aggregateExecutions(updatedExecutions, { riskAmount: trade.riskAmount });
      if (aggregates.entryPrice === null || aggregates.entryAt === null) continue;
      reaggregatedTrades.push({
        tradeId,
        aggregates: {
          status: aggregates.status,
          quantity: aggregates.quantity,
          closedQuantity: aggregates.closedQuantity,
          entryPrice: aggregates.entryPrice,
          exitPrice: aggregates.exitPrice,
          entryAt: aggregates.entryAt,
          exitAt: aggregates.exitAt,
          fees: aggregates.fees,
          swap: aggregates.swap,
          pnlGross: aggregates.pnlGross,
          pnlNet: aggregates.pnlNet,
        },
      });
    }

    try {
      await this.repository.applyReconciliation(account.id, {
        tradesToCreate,
        attachments: attachments.map(({ trade, newExecutions, aggregates }) => ({
          trade,
          newExecutions,
          aggregates,
        })),
        executionUpdates: plan.executionUpdates,
        reaggregatedTrades,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(
          "This external activity is already being journaled.",
          TRADING_CORE_ERROR_CODES.DUPLICATE_EXTERNAL_ACTIVITY,
        );
      }
      throw error;
    }

    const tradesClosed = attachments.filter(
      (a) => a.wasOpen && a.aggregates.status === "CLOSED",
    ).length;
    this.logger?.info(
      {
        userId,
        accountId: account.id,
        requestId,
        provider: account.providerId,
        dealsConsidered: plan.dealsConsidered,
        dealsAlreadyJournaled: plan.dealsAlreadyJournaled,
        dealsSkippedDeletedTrade: plan.dealsSkippedDeletedTrade,
        tradesCreated: tradesToCreate.length,
        tradesUpdated: attachments.length + plan.executionUpdates.length,
        executionsCreated:
          tradesToCreate.reduce((sum, t) => sum + t.executions.length, 0) +
          attachments.reduce((sum, a) => sum + a.newExecutions.length, 0),
        executionsUpdated: plan.executionUpdates.length,
        skippedUnpriced,
      },
      "journal reconciliation completed",
    );

    return {
      accountId: account.id,
      dealsConsidered: plan.dealsConsidered,
      executionsCreated:
        tradesToCreate.reduce((sum, t) => sum + t.executions.length, 0) +
        attachments.reduce((sum, a) => sum + a.newExecutions.length, 0),
      executionsUpdated: plan.executionUpdates.length,
      tradesCreated: tradesToCreate.length,
      tradesUpdated: attachments.length + plan.executionUpdates.length,
      tradesClosed,
      reconciledAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
  }

  // ── Bulk import (§2/§8 — source=IMPORT, content-based idempotency) ───────

  async importTrades(userId: string, input: JournalImportTradesInput) {
    const account = await this.mustGetAccount(userId, input.accountId);
    const user = await this.loadUser(userId);

    let imported = 0;
    let skippedDuplicates = 0;
    const tradeIds: string[] = [];

    for (const row of input.rows) {
      const hasExitAt = row.exitAt !== undefined;
      const hasExitPrice = row.exitPrice !== undefined;
      if (hasExitAt !== hasExitPrice) {
        throw new BusinessRuleError(
          "Import rows must provide exit price and time together.",
          TRADING_CORE_ERROR_CODES.INVALID_EXECUTION,
        );
      }
      const quantity = row.quantity ?? "1";
      const entryAt = new Date(row.entryAt);
      const externalRef = importRowReference({
        broker: input.broker,
        symbol: row.symbol,
        side: row.side,
        entryAt: row.entryAt,
        entryPrice: row.entryPrice,
        quantity,
        exitAt: row.exitAt,
        exitPrice: row.exitPrice,
        fees: row.fees,
      });
      const executions: Array<{
        role: "ENTRY" | "EXIT";
        side: "BUY" | "SELL";
        volume: Prisma.Decimal;
        price: Prisma.Decimal | null;
        profit: Prisma.Decimal | null;
        commission: Prisma.Decimal | null;
        swap: Prisma.Decimal | null;
        executedAt: Date;
        reason: string | null;
        note: string | null;
        externalDealId: string | null;
      }> = [
        {
          role: "ENTRY",
          side: row.side,
          volume: new Prisma.Decimal(quantity),
          price: new Prisma.Decimal(row.entryPrice),
          profit: null,
          commission: null,
          swap: null,
          executedAt: entryAt,
          reason: null,
          note: null,
          externalDealId: externalRef,
        },
      ];
      if (hasExitAt && hasExitPrice) {
        executions.push({
          role: "EXIT" as const,
          side: opposite(row.side),
          volume: new Prisma.Decimal(quantity),
          price: new Prisma.Decimal(row.exitPrice as string),
          profit: null,
          commission: row.fees === undefined ? null : new Prisma.Decimal(row.fees).neg(),
          swap: null,
          executedAt: new Date(row.exitAt as string),
          reason: null,
          note: null,
          externalDealId: null,
        });
      }
      const aggregates = aggregateExecutions(executions, { riskAmount: null });
      if (aggregates.entryPrice === null || aggregates.entryAt === null) {
        throw new BusinessRuleError(
          "An import row has no entry price.",
          TRADING_CORE_ERROR_CODES.INVALID_EXECUTION,
        );
      }
      try {
        const created = await this.repository.createTradeWithExecutions({
          userId,
          accountId: account.id,
          currency: account.currency,
          symbol: row.symbol,
          direction: row.side,
          source: "IMPORT",
          initialStop: null,
          initialTP: null,
          riskAmount: null,
          notes: row.notes ?? null,
          tradingDate: new Date(`${tradingDateKey(entryAt, user?.timezone)}T00:00:00.000Z`),
          externalPositionId: null,
          status: aggregates.status,
          quantity: aggregates.quantity,
          closedQuantity: aggregates.closedQuantity,
          entryPrice: aggregates.entryPrice,
          exitPrice: aggregates.exitPrice,
          entryAt: aggregates.entryAt,
          exitAt: aggregates.exitAt,
          exitReason: null,
          fees: aggregates.fees,
          swap: aggregates.swap,
          // Broker-file P&L is informational — results are always recomputed.
          pnlGross: aggregates.pnlGross,
          pnlNet: aggregates.pnlNet,
          rMultiple: null,
          executions,
        });
        imported += 1;
        tradeIds.push(created.id);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          skippedDuplicates += 1;
          continue;
        }
        throw error;
      }
    }

    this.logger?.info(
      { userId, accountId: account.id, imported, skippedDuplicates },
      "journal import completed",
    );
    return { imported, skippedDuplicates, tradeIds };
  }

  // ── ownership-scoped lookups (IDOR → honest 404) ──────────────────────────

  private async mustGetTrade(userId: string, tradeId: string): Promise<TradeWithExecutions> {
    const trade = await this.repository.findTradeForUser(tradeId, userId);
    if (!trade) {
      throw new NotFoundError("Trade not found.", TRADING_CORE_ERROR_CODES.TRADE_NOT_FOUND);
    }
    return trade;
  }

  private async mustGetAccount(userId: string, accountId: string) {
    const account = await this.accountsRepository.findAccountForUser(accountId, userId);
    if (!account) {
      throw new NotFoundError("Trading account not found.", TRADING_CORE_ERROR_CODES.ACCOUNT_NOT_FOUND);
    }
    return account;
  }

  private async loadUser(userId: string) {
    const user = await this.identityRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    return user;
  }
}

function opposite(direction: "BUY" | "SELL"): "BUY" | "SELL" {
  return direction === "BUY" ? "SELL" : "BUY";
}

function entryIndex(executions: Array<{ role: "ENTRY" | "EXIT" }>, role: "ENTRY"): number {
  return executions.findIndex((e) => e.role === role);
}
