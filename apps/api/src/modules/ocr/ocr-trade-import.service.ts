/**
 * OCR → Trading Core bridge (Phase 21 + grouped confirmation, §72/§76/§77/§141).
 *
 * Architectural position (§27/§29):
 *   - THIS service orchestrates; it does NOT persist trades. Every Trade is
 *     created through `TradesService.createTrade` — the canonical Trading
 *     Core application service that owns the account check, the sizing math,
 *     the P&L recomputation and the external-ref dedup. There is no
 *     OCR-specific Trade creation logic here and no Prisma trade write.
 *   - The account resolves, in order: the user's EXPLICIT choice (engine
 *     quality §3.1 — validated for ownership by the caller) then the owner's
 *     PERSISTED default account — never a screenshot account number (§81).
 *   - The symbol resolves against the instrument catalog ONLY (§50): no
 *     invented alias tables — an unknown symbol is an honest skip.
 *   - FAILURE ISOLATION (§126): an import problem NEVER fails the
 *     confirmation. Per-draft isolation extends this to grouped
 *     confirmations: one skipped draft never blocks its siblings.
 *
 * Idempotency: the external ref is `ocr:<recognitionId>` for the single
 * path and `ocr:<recognitionId>:<batchIndex>` per grouped draft —
 * deterministic, so a race that reaches creation twice hits Trading Core's
 * duplicate conflict and resolves to linking the existing trade (never a
 * second one).
 */
import { Injectable, Logger } from "@nestjs/common";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import type { OcrExtractedField, OcrFieldKey, OcrTradeDuplicateEvidence } from "../../shared/contracts";
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
import { suggestedTagsForImport, TRADE_DUPLICATE_TIME_WINDOW_MS, tradeDuplicateEvidence } from "./ocr.logic";

export interface ConfirmationDraft {
  /** Position of the draft among the recognition's candidates. */
  index: number;
  /** false → the user unchecked this draft; it is never imported. */
  include: boolean;
  /** The draft's merged fields (candidate fields + user corrections). */
  mergedFields: OcrExtractedField[];
}

export interface TradeImportOutcome {
  /** The primary canonical Trade id (first import) — null when none. */
  tradeId: string | null;
  /** Every imported Trade id (grouped confirmation) in draft order. */
  tradeIds: string[];
  /** Skip/failure tokens to append to the recognition warnings. */
  warnings: string[];
  /** Deterministic playbook tag hints derived from the confirmed values. */
  suggestedTags: string[];
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

  /** Deterministic dedup handle — one recognition draft can ever import one trade. */
  externalRefOf(recognitionId: string, batchIndex?: number): string {
    return batchIndex === undefined ? `ocr:${recognitionId}` : `ocr:${recognitionId}:${batchIndex}`;
  }

  /**
   * Content-based trade duplicate detection (V2 spec §4 — "different
   * screenshots representing the same trade"). ADVISORY: the caller stores
   * the flag on the recognition; the review UI surfaces it and confirmation
   * requires an explicit acknowledgment (V2 §58). Same owner only (§ IDOR).
   *
   * Prerequisites: symbol resolves in the catalog + direction matches.
   * Evidence: entry price equal OR entry time within ±48h (wall-clock vs
   * instant tolerance — never a timezone assertion, §16).
   *
   * Returns null when nothing matched or there is not enough evidence.
   * Also returns whether the symbol exists in the catalog (feeds the
   * UNKNOWN_SYMBOL issue derivation without a second query).
   */
  async detectTradeDuplicate(input: {
    userId: string;
    fields: readonly OcrExtractedField[];
  }): Promise<{
    symbolInCatalog: boolean;
    duplicate: { tradeId: string; matchedOn: OcrTradeDuplicateEvidence[] } | null;
  }> {
    const byKey = new Map(input.fields.map((f) => [f.field, f]));
    const textOf = (key: OcrFieldKey): string | null => byKey.get(key)?.normalizedValue ?? null;
    const symbol = textOf("symbol");
    const direction = textOf("direction");
    const entryPrice = textOf("entryPrice");
    const openTime = textOf("openTime");

    if (symbol === null || (direction !== "BUY" && direction !== "SELL")) {
      return { symbolInCatalog: false, duplicate: null };
    }
    const instrument = await this.tradesRepository.findInstrumentBySymbol(symbol);
    if (instrument === null || !instrument.isActive) {
      return { symbolInCatalog: false, duplicate: null };
    }

    // Wall-clock window — widened to ±48h BEFORE the query so the wall
    // clock vs instant comparison stays a pure-logic concern (§16: the
    // persisted candidate window is coarse, the evidence check is exact).
    const window = openTime !== null && !Number.isNaN(Date.parse(`${openTime}Z`))
      ? {
          from: new Date(Date.parse(`${openTime}Z`) - TRADE_DUPLICATE_TIME_WINDOW_MS),
          to: new Date(Date.parse(`${openTime}Z`) + TRADE_DUPLICATE_TIME_WINDOW_MS),
        }
      : null;

    const candidates = await this.tradesRepository.findTradeDuplicateCandidates({
      userId: input.userId,
      instrumentId: instrument.id,
      direction,
      entryPrice,
      entryAtFrom: window?.from ?? null,
      entryAtTo: window?.to ?? null,
    });

    for (const candidate of candidates) {
      const evidence = tradeDuplicateEvidence(
        { symbol, direction, entryPrice, openTime },
        {
          entryPrice: candidate.entryPrice === null ? null : candidate.entryPrice.toFixed(),
          entryAt: candidate.entryAt.toISOString(),
        },
      );
      if (evidence.length > 0) {
        // The matchedOn list is SELF-DESCRIBING for the review UI: the
        // prerequisites (symbol + direction) plus every further agreement.
        return {
          symbolInCatalog: true,
          duplicate: { tradeId: candidate.id, matchedOn: ["SYMBOL", "DIRECTION", ...evidence] },
        };
      }
    }
    return { symbolInCatalog: true, duplicate: null };
  }

  async importFromConfirmation(input: {
    userId: string;
    recognitionId: string;
    /** Single-trade path — the confirmed primary fields. */
    mergedFields?: OcrExtractedField[];
    /** Grouped-confirmation path — one entry per candidate draft. */
    drafts?: ConfirmationDraft[];
    /** The user's explicit ACCOUNTS choice (ownership validated upstream). */
    accountId?: string | null;
    /**
     * V2 multi-screenshot — the dedup ref scope for a FUSED set confirm.
     * When provided the externalRef becomes `ocr:<scopeLabel>` instead of
     * `ocr:<recognitionId>` (audit context keeps the scope label too).
     */
    scopeLabel?: string;
  }): Promise<TradeImportOutcome> {
    const drafts: ConfirmationDraft[] =
      input.drafts ??
      (input.mergedFields ? [{ index: 0, include: true, mergedFields: input.mergedFields }] : []);
    if (drafts.length === 0) {
      return { tradeId: null, tradeIds: [], warnings: [], suggestedTags: [] };
    }

    // 1. Account — explicit choice first (engine quality §3.1), then the
    // persisted default (importTrades convention). An explicit but
    // unresolvable account is an honest per-confirmation skip.
    let accountId: string | null = null;
    if (input.accountId) {
      const chosen = await this.accounts.findAccountForUser(input.accountId, input.userId);
      accountId = chosen?.id ?? null;
      if (accountId === null) {
        return {
          ...await this.skip(input.userId, input.recognitionId, TRADE_IMPORT_SKIPPED_NO_ACCOUNT, "chosen account not found for the owner"),
          tradeIds: [],
          suggestedTags: [],
        };
      }
    } else {
      accountId = await this.accounts.findDefaultAccountIdForUser(input.userId);
    }
    if (accountId === null) {
      return {
        ...await this.skip(input.userId, input.recognitionId, TRADE_IMPORT_SKIPPED_NO_ACCOUNT, "no trading account for the owner"),
        tradeIds: [],
        suggestedTags: [],
      };
    }

    // 2. Per-draft import with FULL isolation (§126): one skipped draft
    // never blocks its siblings; every skip is its own audit fact.
    const tradeIds: string[] = [];
    const warnings: string[] = [];
    let primaryFields = drafts[0]!.mergedFields;
    let instrumentAssetClass: string | null = null;

    for (const draft of drafts) {
      if (!draft.include) continue;
      const outcome = await this.importDraft({
        userId: input.userId,
        recognitionId: input.recognitionId,
        draftIndex: input.drafts ? draft.index : undefined,
        mergedFields: draft.mergedFields,
        accountId,
        scopeLabel: input.scopeLabel,
      });
      if (outcome.tradeId) {
        if (tradeIds.length === 0) {
          primaryFields = draft.mergedFields;
          instrumentAssetClass = outcome.instrumentAssetClass;
        }
        tradeIds.push(outcome.tradeId);
      }
      warnings.push(...outcome.warnings);
    }

    // 3. Playbook tag suggestions (engine quality §3.3) — deterministic,
    // derived from the FIRST imported (or attempted) draft's values.
    const resolved = resolveTradeImportValues(primaryFields);
    const suggestedTags = resolved.eligible
      ? suggestedTagsForImport({
          symbol: resolved.values.symbol,
          openTime: resolved.values.openTime ?? null,
          instrumentAssetClass,
        })
      : [];

    return { tradeId: tradeIds[0] ?? null, tradeIds, warnings, suggestedTags };
  }

  /** One draft → one canonical Trade attempt (create-or-link semantics). */
  private async importDraft(input: {
    userId: string;
    recognitionId: string;
    draftIndex: number | undefined;
    mergedFields: OcrExtractedField[];
    accountId: string;
    /** V2 — set-scope external ref (`ocr:set:<id>`); undefined for single. */
    scopeLabel?: string;
  }): Promise<{ tradeId: string | null; warnings: string[]; instrumentAssetClass: string | null }> {
    // Eligibility — the confirmed fields must resolve into a complete
    // trade fact set (§76 "validate fields"). Incomplete stays a CONFIRMED
    // recognition without a trade (honest, never fabricated — §44).
    const resolved = resolveTradeImportValues(input.mergedFields);
    if (!resolved.eligible) {
      const outcome = await this.skip(input.userId, input.recognitionId, resolved.reason, "confirmed values are not a complete trade", "SUCCESS", input.draftIndex);
      return { ...outcome, instrumentAssetClass: null };
    }

    // Instrument — catalog lookup only (§50: no invented mapping).
    const instrument = await this.tradesRepository.findInstrumentBySymbol(resolved.values.symbol);
    if (instrument === null || !instrument.isActive) {
      const outcome = await this.skip(
        input.userId,
        input.recognitionId,
        TRADE_IMPORT_SKIPPED_UNKNOWN_SYMBOL,
        `symbol ${resolved.values.symbol} is not in the instrument catalog`,
        "SUCCESS",
        input.draftIndex,
      );
      return { ...outcome, instrumentAssetClass: null };
    }

    // V2 — the dedup ref: set scope (`ocr:set:<id>`) when the confirmation
    // comes from a fused set, else the per-recognition/per-draft ref (§79 —
    // reuse the existing external-ref mechanism either way).
    const externalRef = input.scopeLabel !== undefined
      ? `ocr:${input.scopeLabel}`
      : this.externalRefOf(input.recognitionId, input.draftIndex);
    // Duplicate check — a live trade with this ref means the import already
    // happened.
    const existing = await this.tradesRepository.findLiveTradeByExternalRef(input.accountId, externalRef);
    if (existing !== null) {
      return { tradeId: existing.id, warnings: [], instrumentAssetClass: instrument.assetClass };
    }

    // Create through Trading Core (§77 — the canonical application
    // service; no OCR-side persistence, P&L recomputed server-side).
    const tradeInput = buildOcrTradeInput({
      values: resolved.values,
      accountId: input.accountId,
      instrumentId: instrument.id,
      externalRef,
    });
    try {
      const created = await this.trades.createTrade(input.userId, tradeInput);
      await this.securityEvents.record({
        userId: input.userId,
        type: "OCR_TRADE_IMPORTED",
        actor: input.userId,
        context: `trade ${created.id} imported from recognition ${input.recognitionId}${input.draftIndex !== undefined ? ` draft ${input.draftIndex}` : ""}`,
        outcome: "SUCCESS",
      });
      return { tradeId: created.id, warnings: [], instrumentAssetClass: instrument.assetClass };
    } catch (error) {
      // A concurrent confirmation could have won the creation race — link
      // instead of conflicting (§51 house policy).
      if (error instanceof ConflictError) {
        const winner = await this.tradesRepository.findLiveTradeByExternalRef(input.accountId, externalRef);
        if (winner !== null) {
          return { tradeId: winner.id, warnings: [], instrumentAssetClass: instrument.assetClass };
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
        const outcome = await this.skip(
          input.userId,
          input.recognitionId,
          TRADE_IMPORT_SKIPPED_REJECTED,
          `trading core refused the import: ${error.code ?? "DOMAIN_RULE"}`,
          "FAILURE",
          input.draftIndex,
        );
        return { ...outcome, instrumentAssetClass: null };
      }
      // Unexpected — still isolated (§126): log server-side, answer honestly.
      this.logger.error(
        `trade import failed for recognition ${input.recognitionId}: ${error instanceof Error ? error.name : "unknown"}`,
      );
      const outcome = await this.skip(input.userId, input.recognitionId, TRADE_IMPORT_FAILED, "unexpected import failure", "FAILURE", input.draftIndex);
      return { ...outcome, instrumentAssetClass: null };
    }
  }

  /** A skip is a FACT, not an exception: warning + audit, never a throw. */
  private async skip(
    userId: string,
    _recognitionId: string,
    warning: string,
    context: string,
    outcome: "SUCCESS" | "FAILURE" = "SUCCESS",
    draftIndex?: number,
  ): Promise<{ tradeId: null; warnings: string[] }> {
    const token = draftIndex !== undefined ? `${warning}:DRAFT_${draftIndex}` : warning;
    await this.securityEvents.record({
      userId,
      type: "OCR_TRADE_IMPORT_SKIPPED",
      actor: userId,
      context: `${warning}${draftIndex !== undefined ? ` (draft ${draftIndex})` : ""}: ${context}`,
      outcome,
    });
    return { tradeId: null, warnings: [token] };
  }
}
