/**
 * Ghost Trades application service (B6) - capture + settlement, mock parity:
 * the SAME validations and response shapes as the MSW engine
 * (`mocks/handlers/ghosts.ts` + store). Unknown instrument ids are honestly
 * rejected (422 UNKNOWN_INSTRUMENT) - a ghost anchored on nothing would
 * poison the discipline aggregates that consume these rows.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import {
  type createSkippedTradeInputSchema,
  type settleSkippedTradeInputSchema,
  type SkippedTrade,
  type SkippedTradesResponse,
} from "../../shared/contracts";
import { BusinessRuleError, NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { TradesRepository } from "../trades/trades.repository";
import { GhostsRepository, type SkippedTradeData } from "./ghosts.repository";

const TRADING_ERROR = TRADE_ERROR_CODES;

type CreateSkippedTradeInput = z.infer<typeof createSkippedTradeInputSchema>;
type SettleSkippedTradeInput = z.infer<typeof settleSkippedTradeInputSchema>;

@Injectable()
export class GhostsService {
  constructor(
    private readonly ghosts: GhostsRepository,
    private readonly trades: TradesRepository,
  ) {}

  /** GET /skipped-trades - the regret feed, most recent observation first. */
  async listSkippedTrades(userId: string): Promise<SkippedTradesResponse> {
    const rows = await this.ghosts.listRows(userId);
    const skippedTrades = rows
      .map((row) => this.ghosts.toView(row))
      .sort((a, b) => b.seenAt.localeCompare(a.seenAt));
    return { skippedTrades };
  }

  /** POST /skipped-trades - the 10-second ghost capture. */
  async createSkippedTrade(userId: string, input: CreateSkippedTradeInput): Promise<SkippedTrade> {
    const instrument = await this.trades.findInstrument(input.instrumentId);
    if (instrument === null || !instrument.isActive) {
      throw new BusinessRuleError("Instrument not found", TRADING_ERROR.UNKNOWN_INSTRUMENT);
    }

    const seenAt = input.seenAt ?? new Date().toISOString();
    const now = new Date().toISOString();
    const data: SkippedTradeData = {
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
      direction: input.direction ?? null,
      seenAt,
      reason: input.reason,
      outcomeGuess: null,
      hypotheticalR: null,
      notes: input.notes ?? null,
      createdAt: now,
    };
    const row = await this.ghosts.insertRow(userId, data as unknown as Prisma.InputJsonValue);
    return this.ghosts.toView(row);
  }

  /**
   * PATCH /skipped-trades/:id/settle - would have won / lost / unknown (+R).
   * Mock parity: a re-settle OVERWRITES the guess (the user may correct a
   * misclick); discipline aggregates always read the latest state.
   */
  async settleSkippedTrade(
    userId: string,
    skippedId: string,
    input: SettleSkippedTradeInput,
  ): Promise<SkippedTrade> {
    const row = await this.ghosts.findRowForUser(skippedId, userId);
    if (row === null) {
      throw new NotFoundError("Skipped trade not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const data: SkippedTradeData = {
      ...row.data,
      outcomeGuess: input.outcomeGuess,
      hypotheticalR: input.hypotheticalR ?? null,
    };
    await this.ghosts.updateRowData(row.id, data as unknown as Prisma.InputJsonValue);
    return this.ghosts.toView({ ...row, data });
  }
}
