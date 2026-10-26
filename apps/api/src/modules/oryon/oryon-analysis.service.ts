/**
 * Oryon analyses application service (Phase 10 → serveur).
 *
 * The zod contract (shared oryonChartAnalysisSchema) is the single truth:
 * create payloads are parsed through createOryonChartAnalysisInputSchema at
 * the controller boundary and stored verbatim (analysis/drawings/snapshot
 * JSONB). The optional trade link is validated against the canonical journal:
 * ownership first (foreign id → 404), symbol equality second (a mismatch is a
 * 422 - the client must confirm explicitly, never a silent normalization).
 *
 * The canonical trade is NEVER created, copied or mutated here.
 */
import { Injectable } from "@nestjs/common";
import {
  oryonAnalysisMutatedResponseSchema,
  oryonAnalysesListResponseSchema,
  type OryonAnalysisMutatedResponse,
  type OryonAnalysesListResponse,
  type OryonChartAnalysis,
  ORYON_ANALYSIS_ERROR_CODES,
} from "../../shared/contracts";
import { NotFoundError, BusinessRuleError } from "../../shared/errors/app-error";
import { OryonAnalysisRepository, type OryonAnalysisRow } from "./oryon-analysis.repository";
import { TradesService } from "../trades/trades.service";

type CreatePayload = OryonChartAnalysis & { tradeId: string | null };

function toWire(row: OryonAnalysisRow): OryonChartAnalysis {
  // The wire contract (shared with the localStorage store) carries unix-ms
  // integer timestamps - the DB rows convert here, at the boundary.
  return oryonAnalysisMutatedResponseSchema.shape.analysis.parse({
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    interval: row.interval,
    chartType: row.chartType,
    title: row.title,
    notes: row.notes,
    tradeId: row.tradeId,
    snapshot: row.snapshot ?? null,
    analysis: row.analysis,
    drawings: row.drawings,
    referenceTimeSec: row.referenceTimeSec === null ? null : Number(row.referenceTimeSec),
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });
}

@Injectable()
export class OryonAnalysisService {
  constructor(
    private readonly repository: OryonAnalysisRepository,
    private readonly trades: TradesService,
  ) {}

  async create(userId: string, input: CreatePayload): Promise<OryonAnalysisMutatedResponse> {
    const tradeId = await this.resolveTradeLink(userId, input.tradeId, input.symbol);
    const row = await this.repository.create(userId, {
      symbol: input.symbol,
      interval: input.interval,
      chartType: input.chartType,
      title: input.title,
      notes: input.notes ?? null,
      tradeId,
      snapshot: input.snapshot,
      analysis: input.analysis,
      drawings: input.drawings,
      referenceTimeSec: input.referenceTimeSec === null || input.referenceTimeSec === undefined ? null : BigInt(input.referenceTimeSec),
    });
    return { analysis: toWire(row) };
  }

  async get(userId: string, id: string): Promise<OryonAnalysisMutatedResponse> {
    const row = await this.requireRow(userId, id);
    return { analysis: toWire(row) };
  }

  async list(userId: string): Promise<OryonAnalysesListResponse> {
    const rows = await this.repository.listForUser(userId);
    return oryonAnalysesListResponseSchema.parse({
      analyses: rows.map((row) => toWire(row)),
    });
  }

  async patch(userId: string, id: string, patch: {
    title?: string;
    notes?: string | null;
    tradeId?: string | null;
  }): Promise<OryonAnalysisMutatedResponse> {
    const row = await this.requireRow(userId, id);
    let tradeId = row.tradeId;
    if (patch.tradeId !== undefined) {
      tradeId = await this.resolveTradeLink(userId, patch.tradeId, row.symbol);
    }
    const updated = await this.repository.patchMetadata(id, userId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.tradeId !== undefined ? { tradeId } : {}),
    });
    if (updated === null) {
      throw new NotFoundError("Analysis not found.", ORYON_ANALYSIS_ERROR_CODES.ORYON_ANALYSIS_NOT_FOUND);
    }
    return { analysis: toWire(updated) };
  }

  async delete(userId: string, id: string): Promise<{ ok: true }> {
    const deleted = await this.repository.deleteForUser(id, userId);
    if (!deleted) {
      throw new NotFoundError("Analysis not found.", ORYON_ANALYSIS_ERROR_CODES.ORYON_ANALYSIS_NOT_FOUND);
    }
    return { ok: true };
  }

  private async requireRow(userId: string, id: string): Promise<OryonAnalysisRow> {
    const row = await this.repository.findByIdForUser(id, userId);
    if (row === null) {
      throw new NotFoundError("Analysis not found.", ORYON_ANALYSIS_ERROR_CODES.ORYON_ANALYSIS_NOT_FOUND);
    }
    return row;
  }

  /**
   * Canonical-trade link resolution: null → clear; a foreign or unknown id →
   * honest 404; a symbol mismatch → 422 (the client confirms explicitly with
   * the mismatch dialog - the wire PATCH carries no "force" flag by design:
   * the UI confirm happens BEFORE the call, mirroring the Phase-10 store).
   */
  private async resolveTradeLink(
    userId: string,
    tradeId: string | null | undefined,
    symbol: string,
  ): Promise<string | null> {
    if (tradeId === null || tradeId === undefined) return null;
    const trade = await this.trades.getTradeRowForUser(tradeId, userId);
    if (trade === null) {
      throw new NotFoundError(
        "Linked trade does not exist (or is not yours).",
        ORYON_ANALYSIS_ERROR_CODES.ORYON_ANALYSIS_TRADE_NOT_FOUND,
      );
    }
    if (trade.symbol !== symbol) {
      throw new BusinessRuleError(
        `Instrument mismatch: the analysis is on ${symbol}, the trade on ${trade.symbol}. Confirm the mismatch in the UI before linking.`,
        ORYON_ANALYSIS_ERROR_CODES.ORYON_ANALYSIS_SYMBOL_MISMATCH,
      );
    }
    return trade.id;
  }
}
