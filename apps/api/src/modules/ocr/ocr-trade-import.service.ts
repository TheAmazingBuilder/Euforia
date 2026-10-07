/**
 * OCR → Trading Core bridge (Phase 21) — the ONLY sanctioned path from a
 * confirmed recognition to a canonical Trade (§72/§76/§77/§141).
 *
 * Architectural position (§27/§29):
 *   - THIS service orchestrates; it does NOT persist trades. Every Trade is
 *     created through `TradesService.createTrade` — the canonical Trading
 *     Core application service that owns the account check, the sizing math,
 *     the P&L recomputation and the external-ref dedup. There is no
 *     OCR-specific Trade creation logic here and no Prisma trade write.
 *   - The account is resolved through the SAME house convention as the CSV
 *     import: the owner's PERSISTED default account — never a client hint,
 *     never a screenshot account number (§81).
 *   - The symbol resolves against the instrument catalog ONLY (§50): no
 *     invented alias tables — an unknown symbol is an honest skip.
 *   - FAILURE ISOLATION (§126): an import problem NEVER fails the
 *     confirmation. The user's corrections are already authoritative when
 *     this service runs; every skip/failure becomes a stable warning on the
 *     recognition plus an append-only audit fact (§83).
 *
 * Idempotency: the external ref is `ocr:<recognitionId>` — deterministic,
 * so a race that reaches creation twice hits Trading Core's duplicate
 * conflict and resolves to linking the existing trade (never a second one).
 */
import { Injectable, Logger } from "@nestjs/common";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import type { OcrExtractedField } from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { TradesRepository } from "../trades/trades.repository";
import { TradesService } from "../trades/trades.service";
import { SecurityEventService } from "../security/security-event.service";
import {
  buildOcrTradeInput,
  resolveTradeImportValues,
  TRADE_IMPORT_FAILED,
  TRADE_IMPORT_SKIPPED_NO_ACCOUNT,
  TRADE_IMPORT_SKIPPED_REJECTED,
  TRADE_IMPORT_SKIPPED_UNKNOWN_SYMBOL,
} from "./trade-import.logic";

export interface TradeImportOutcome {
  /** The canonical Trade id when one exists (created or already present). */
  tradeId: string | null;
  /** Skip/failure tokens to append to the recognition warnings. */
  warnings: string[];
}

@Injectable()
export class OcrTradeImportService {
  private readonly logger = new Logger(OcrTradeImportService.name);

  constructor(
    private readonly trades: TradesService,
    private readonly tradesRepository: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly securityEvents: SecurityEventService,
  ) {}

  /** Deterministic dedup handle — one recognition can ever import one trade. */
  externalRefOf(recognitionId: string): string {
    return `ocr:${recognitionId}`;
  }

  async importFromConfirmation(input: {
    userId: string;
    recognitionId: string;
    mergedFields: OcrExtractedField[];
  }): Promise<TradeImportOutcome> {
    // 1. Eligibility — the confirmed fields must resolve into a complete
    // trade fact set (§76 "validate fields"). Incomplete stays a CONFIRMED
    // recognition without a trade (honest, never fabricated — §44).
    const resolved = resolveTradeImportValues(input.mergedFields);
    if (!resolved.eligible) {
      return this.skip(input, resolved.reason, "confirmed values are not a complete trade");
    }

    // 2. Account — the owner's persisted default (importTrades convention).
    const accountId = await this.accounts.findDefaultAccountIdForUser(input.userId);
    if (accountId === null) {
      return this.skip(input, TRADE_IMPORT_SKIPPED_NO_ACCOUNT, "no trading account for the owner");
    }

    // 3. Instrument — catalog lookup only (§50: no invented mapping).
    const instrument = await this.tradesRepository.findInstrumentBySymbol(resolved.values.symbol);
    if (instrument === null || !instrument.isActive) {
      return this.skip(
        input,
        TRADE_IMPORT_SKIPPED_UNKNOWN_SYMBOL,
        `symbol ${resolved.values.symbol} is not in the instrument catalog`,
      );
    }

    const externalRef = this.externalRefOf(input.recognitionId);

    // 4. Duplicate check (§79 — reuse the existing external-ref mechanism):
    // a live trade with this ref means the import already happened.
    const existing = await this.tradesRepository.findLiveTradeByExternalRef(accountId, externalRef);
    if (existing !== null) {
      return { tradeId: existing.id, warnings: [] };
    }

    // 5. Create through Trading Core (§77 — the canonical application
    // service; no OCR-side persistence, P&L recomputed server-side).
    const tradeInput = buildOcrTradeInput({
      values: resolved.values,
      accountId,
      instrumentId: instrument.id,
      externalRef,
    });
    try {
      const created = await this.trades.createTrade(input.userId, tradeInput);
      await this.securityEvents.record({
        userId: input.userId,
        type: "OCR_TRADE_IMPORTED",
        actor: input.userId,
        context: `trade ${created.id} imported from recognition ${input.recognitionId}`,
        outcome: "SUCCESS",
      });
      return { tradeId: created.id, warnings: [] };
    } catch (error) {
      // A concurrent confirmation could have won the creation race — link
      // instead of conflicting (§51 house policy).
      if (error instanceof ConflictError) {
        const winner = await this.tradesRepository.findLiveTradeByExternalRef(accountId, externalRef);
        if (winner !== null) {
          return { tradeId: winner.id, warnings: [] };
        }
      }
      const known =
        error instanceof BusinessRuleError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof ConflictError;
      if (known) {
        // Stable domain refusal (account state, instrument specs, sizing…)
        // — sanitized code only, never the raw message (§36).
        return this.skip(
          input,
          TRADE_IMPORT_SKIPPED_REJECTED,
          `trading core refused the import: ${error.code ?? "DOMAIN_RULE"}`,
          "FAILURE",
        );
      }
      // Unexpected — still isolated (§126): log server-side, answer honestly.
      this.logger.error(
        `trade import failed for recognition ${input.recognitionId}: ${error instanceof Error ? error.name : "unknown"}`,
      );
      return this.skip(input, TRADE_IMPORT_FAILED, "unexpected import failure", "FAILURE");
    }
  }

  /** A skip is a FACT, not an exception: warning + audit, never a throw. */
  private async skip(
    input: { userId: string; recognitionId: string },
    warning: string,
    context: string,
    outcome: "SUCCESS" | "FAILURE" = "SUCCESS",
  ): Promise<TradeImportOutcome> {
    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_TRADE_IMPORT_SKIPPED",
      actor: input.userId,
      context: `${warning}: ${context}`,
      outcome,
    });
    return { tradeId: null, warnings: [warning] };
  }
}
