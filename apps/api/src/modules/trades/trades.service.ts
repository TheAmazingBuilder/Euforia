/**
 * Trading Core application service (Phase 4).
 *
 * Journal lifecycle + reconstruction trigger + the decision gate, behind
 * the shared wire contracts. Ownership is enforced in EVERY use case: the
 * userId always comes from the auth principal, never from the client (§23),
 * accounts are loaded through the owner-scoped AccountsRepository lookup
 * (§24) and foreign ids are simply not found (IDOR → 404).
 *
 * The decision gate (trade-entry-ux.md §12–§13) is a HARD product contract:
 * closing a trade responds WITHOUT any P&L field — results are computed and
 * STORED at close time (§15/§46, server-side only) but only the decision
 * endpoint reveals them, and a grade can never be re-submitted.
 *
 * Out of scope by mandate (§59/§60/§68): no analytics, no coaching logic —
 * the reveal payload carries deterministic neutral aggregates (no ghost
 * stats) until those domains exist. B3 mistake detection and B6 fills the
 * mistake rows at the gate; discipline RULE evaluation is triggered via the
 * `trade.closed` domain event (Discipline subscribes — no module cycle).
 */
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { DomainEventsService } from "../../infrastructure/events/domain-events.module";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/app-error";
import {
  TRADE_ERROR_CODES,
  type addScreenshotInputSchema,
  type bulkTradesInputSchema,
  type closeTradeInputSchema,
  type createSavedTradeViewInputSchema,
  type createTagInputSchema,
  type createTradeInputSchema,
  type importTradesInputSchema,
  type instrumentSchema,
  type notesUpdateInputSchema,
  type planUpdateInputSchema,
  type psychologyUpdateInputSchema,
  type reviewUpdateInputSchema,
  type tradeDecisionInputSchema,
  type tradeSchema,
  type updateTradeInputSchema,
  type DetectedMistakeSummary,
  type ReviewMistake,
  type Tag,
} from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { IdentityRepository } from "../identity/identity.repository";
import { TradesRepository } from "./trades.repository";
import { TradeReconstructionService } from "./trade-reconstruction.service";
import {
  TradeScreenshotStorage,
  InvalidScreenshotError,
} from "./trade-screenshots.storage";
import {
  computeRiskForTrade,
  computeTradeResults,
  resolvePositionSize,
  tradingDateOf,
  weightedAveragePrice,
  wire,
} from "./trade-calculations";
import {
  toSavedViewView,
  toScreenshotView,
  toTradeEventView,
  toTradeView,
} from "./mappers";
import { computeSessionSeries } from "./session-series";
import { findSystemMistake, STARTER_TAGS, systemMistakeIdByKey } from "./trade-catalogs";
import type { TagRowData } from "./trades.repository";

/** The hard close contract: no P&L in this response (trade-entry-ux §12). */
export interface AwaitingDecisionResponse {
  id: string;
  awaitingDecision: true;
}

type CreateTradeInput = z.infer<typeof createTradeInputSchema>;
type CloseTradeInput = z.infer<typeof closeTradeInputSchema>;
type DecisionInput = z.infer<typeof tradeDecisionInputSchema>;
type ReviewUpdateInput = z.infer<typeof reviewUpdateInputSchema>;
type PlanUpdateInput = z.infer<typeof planUpdateInputSchema>;
type PsychologyUpdateInput = z.infer<typeof psychologyUpdateInputSchema>;
type NotesUpdateInput = z.infer<typeof notesUpdateInputSchema>;
type UpdateTradeInput = z.infer<typeof updateTradeInputSchema>;
type ImportTradesInput = z.infer<typeof importTradesInputSchema>;
type BulkTradesInput = z.infer<typeof bulkTradesInputSchema>;
type CreateSavedViewInput = z.infer<typeof createSavedTradeViewInputSchema>;
type AddScreenshotInput = z.infer<typeof addScreenshotInputSchema>;
type Trade = z.infer<typeof tradeSchema>;

const TRADING_ERROR = TRADE_ERROR_CODES;

/** Revenge detection window (B3): a closed loss 15 min before an entry. */
const REVENGE_WINDOW_MINUTES = 15;

@Injectable()
export class TradesService {
  constructor(
    private readonly repository: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly identity: IdentityRepository,
    private readonly reconstruction: TradeReconstructionService,
    private readonly screenshotStorage: TradeScreenshotStorage,
    private readonly events: DomainEventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── shared internals ───────────────────────────────────────────────────────

  /** Load the authenticated user (timezone anchor for trading dates). */
  private async loadUser(userId: string): Promise<{ id: string; timezone: string }> {
    const user = await this.identity.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    return { id: user.id, timezone: user.timezone };
  }

  private async loadOwnedTrade(userId: string, tradeId: string): Promise<NonNullable<Awaited<ReturnType<TradesRepository["findTradeForUser"]>>>> {
    const trade = await this.repository.findTradeForUser(tradeId, userId);
    if (trade === null) {
      throw new NotFoundError("Trade not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return trade;
  }

  /** Contract size of an instrument — the sizing/valuation unit (Domaine 2). */
  private async loadContractSize(instrumentId: string): Promise<string> {
    const instrument = await this.repository.findInstrument(instrumentId);
    if (instrument === null) {
      throw new BusinessRuleError("Unknown instrument", TRADING_ERROR.UNKNOWN_INSTRUMENT);
    }
    return instrument.contractSize.toFixed();
  }

  /** Authoritative balance anchor: latest synced snapshot, else the journal
   * starting balance (Accounts remains the source of truth, §24/§46). */
  private async balanceAnchorOf(accountId: string, startingBalance: string): Promise<string> {
    const snapshot = await this.accounts.latestSnapshot(accountId);
    return snapshot?.balance?.toFixed() ?? startingBalance;
  }

  // ── instruments ─────────────────────────────────────────────────────────────

  async listInstruments(): Promise<{ instruments: z.infer<typeof instrumentSchema>[] }> {
    const rows = await this.repository.listActiveInstruments();
    return {
      instruments: rows.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        name: row.name,
        assetClass: row.assetClass as z.infer<typeof instrumentSchema>["assetClass"],
        quoteCurrency: row.quoteCurrency as z.infer<typeof instrumentSchema>["quoteCurrency"],
        pipSize: row.pipSize.toFixed(),
        digits: row.digits,
        contractSize: row.contractSize.toFixed(),
        isActive: row.isActive,
      })),
    };
  }

  // ── list + reconstruction trigger ───────────────────────────────────────────

  async listTrades(
    userId: string,
    query: { status?: string; graded?: boolean; accountId?: string },
  ): Promise<{ trades: (Trade & { tagIds: string[] })[]; total: number }> {
    const user = await this.loadUser(userId);
    const accounts = await this.accounts.listAccountsByUser(userId);
    const ownedIds = accounts.map((account) => account.id);

    let targetAccountIds = ownedIds;
    if (query.accountId !== undefined) {
      if (!ownedIds.includes(query.accountId)) {
        // A foreign account is not a reachable filter value (IDOR → 404).
        throw new NotFoundError("Account not found", TRADING_ERROR.ACCOUNT_NOT_FOUND);
      }
      targetAccountIds = [query.accountId];
    }

    // §26/§28: reconcile the journal with the latest synchronized external
    // activity before serving the list (lazy full re-reconciliation —
    // idempotent by external position; no writes when nothing changed).
    await this.reconstruction.reconstructAccounts({
      userId,
      userTimezone: user.timezone,
      accountIds: targetAccountIds,
    });

    const rows = await this.repository.listTrades(userId, {
      status: query.status,
      graded: query.graded,
      accountId: query.accountId,
    });
    // Tag chip projection (B3): one join query for the whole page.
    const tagJoins = await this.repository.listTagJoinsForTrades(
      userId,
      rows.map((row) => row.id),
    );
    const tagsByTrade = new Map<string, string[]>();
    for (const join of tagJoins) {
      const tagId = join.data["tagId"];
      if (typeof tagId !== "string") continue;
      const list = tagsByTrade.get(join.tradeId) ?? [];
      list.push(tagId);
      tagsByTrade.set(join.tradeId, list);
    }
    return {
      trades: rows.map((row) => ({
        ...toTradeView(row),
        tagIds: tagsByTrade.get(row.id) ?? [],
      })),
      total: rows.length,
    };
  }

  // ── create / close (Act 1) ─────────────────────────────────────────────────

  async createTrade(
    userId: string,
    input: CreateTradeInput,
  ): Promise<Trade | AwaitingDecisionResponse> {
    const user = await this.loadUser(userId);
    const account = await this.accounts.findAccountForUser(input.accountId, userId);
    if (account === null) {
      throw new NotFoundError("Account not found", TRADING_ERROR.ACCOUNT_NOT_FOUND);
    }
    // The journal backfills the denormalized symbol/currency columns from
    // their sources of truth: the instrument catalog and the account.
    const instrument = await this.repository.findInstrument(input.instrumentId);
    if (instrument === null) {
      throw new BusinessRuleError("Unknown instrument", TRADING_ERROR.UNKNOWN_INSTRUMENT);
    }
    const contractSize = instrument.contractSize.toFixed();

    if (input.externalRef !== undefined) {
      const existing = await this.repository.findLiveTradeByExternalRef(
        account.id,
        input.externalRef,
      );
      if (existing !== null) {
        throw new ConflictError(
          "A trade with this external reference already exists",
          TRADING_ERROR.DUPLICATE_EXTERNAL_TRADE,
        );
      }
    }

    const balance = await this.balanceAnchorOf(account.id, account.startingBalance.toFixed());
    const size = resolvePositionSize({
      size: input.size,
      entryPrice: input.entryPrice,
      initialStop: input.initialStop ?? null,
      contractSize,
      balance,
    });

    const strategyId = input.strategyId ?? (input.outOfPlaybook === true ? null : undefined);
    const entryAt = input.entryAt ?? new Date().toISOString();
    const closed = input.variant === "closed";

    const results = closed
      ? computeTradeResults(
          {
            direction: input.direction,
            entryPrice: input.entryPrice,
            exitPrice: input.exitPrice,
            quantity: size.quantity,
            initialStop: input.initialStop ?? null,
            fees: input.fees ?? "0",
            swap: input.swap ?? "0",
            riskAmount: size.riskAmount,
            mfePrice: null,
            maePrice: null,
          },
          contractSize,
        )
      : null;

    const row = await this.repository.createTradeWithLegs({
      trade: {
        userId,
        accountId: account.id,
        instrumentId: input.instrumentId,
        symbol: instrument.symbol,
        currency: account.currency,
        strategyId: strategyId ?? null,
        setupId: input.setupId ?? null,
        strategyVersion: input.strategyId !== undefined ? 1 : null,
        status: closed ? "CLOSED" : "OPEN",
        direction: input.direction,
        // Provenance (§82): MANUAL capture by default; IMPORT when the
        // values were ingested programmatically (OCR confirmation bridge).
        source: input.source ?? "MANUAL",
        entryPrice: input.entryPrice,
        entryAt: new Date(entryAt),
        quantity: size.quantity,
        initialStop: input.initialStop ?? null,
        initialTP: input.initialTP ?? null,
        plannedRR: input.plannedRR ?? null,
        riskAmount: size.riskAmount,
        finalStop: null,
        exitPrice: closed ? input.exitPrice : null,
        exitAt: closed ? new Date(input.exitAt) : null,
        exitReason: closed ? input.exitReason : null,
        fees: input.fees ?? "0",
        swap: input.swap ?? "0",
        pnlGross: results?.pnlGross ?? null,
        pnlNet: results?.pnlNet ?? null,
        rMultiple: results?.rMultiple ?? null,
        mfePrice: null,
        maePrice: null,
        mfeR: null,
        maeR: null,
        emotionBefore: input.emotionBefore ?? null,
        confidence: input.confidence ?? null,
        // The capture rationale lands in the journal notes (shared contract).
        notes: input.reason ?? null,
        tradingDate: tradingDateOf(entryAt, user.timezone),
        externalRef: input.externalRef ?? null,
        importBatchId: null,
        externalPositionId: null,
      },
      exits: [],
    });

    if (!closed) {
      return toTradeView(row);
    }
    // HARD CONTRACT: closing responds WITHOUT any P&L field (§12/§13).
    return { id: row.id, awaitingDecision: true };
  }

  // ── OCR confirmation bridge (Phase 21 §77 — the ONLY sanctioned path) ───────

  /**
   * Deterministic dedup handle for one recognition draft — mirrors the OCR
   * context's convention: `ocr:<recognitionId>` for the single path and
   * `ocr:<recognitionId>:<tradeIndex>` per grouped draft (§79 reuse of the
   * external-ref mechanism).
   */
  private recognitionExternalRef(recognitionId: string, tradeIndex?: number): string {
    return tradeIndex === undefined ? `ocr:${recognitionId}` : `ocr:${recognitionId}:${tradeIndex}`;
  }

  /**
   * Resolve the canonical Trade already created from one recognition draft —
   * the batch-retry idempotency anchor: a trade created before a partial
   * failure is SKIPPED (its id is resolved, never imported twice, §79).
   */
  async findRecognitionImportTradeId(
    userId: string,
    recognitionId: string,
    tradeIndex?: number,
    accountId?: string,
  ): Promise<string | null> {
    const externalRef = this.recognitionExternalRef(recognitionId, tradeIndex);
    if (accountId !== undefined) {
      const found = await this.repository.findLiveTradeByExternalRef(accountId, externalRef);
      return found?.id ?? null;
    }
    const found = await this.repository.findLiveTradeByExternalRefForUser(userId, externalRef);
    return found?.id ?? null;
  }

  /**
   * Create the canonical Trade from a USER-CONFIRMED recognition draft
   * (§77): the values were validated by the OCR review flow; THIS service
   * still owns the account check, the sizing math, the P&L recomputation
   * and the external-ref dedup — there is no OCR-specific trade write path.
   * Create-or-link semantics: a lost race against a concurrent confirm links
   * the winning trade instead of conflicting (§51 house policy).
   */
  async importTradeFromRecognition(
    userId: string,
    input: {
      recognitionId: string;
      tradeIndex?: number;
      accountId?: string;
      symbol: string;
      direction: string | null;
      entryPrice: string;
      exitPrice?: string | null;
      volume?: string | null;
      stopLoss?: string | null;
      takeProfit?: string | null;
      entryAt: string;
      exitAt?: string | null;
      profitLoss?: string | null;
    },
  ): Promise<{ tradeId: string }> {
    void input.profitLoss; // recomputed server-side (§15) — the draft's own P&L is advisory only

    // Human-in-the-loop gate: a trade without a side cannot exist (§6).
    // Positive check — a bare `!==` pair cannot narrow the wide `string`.
    const direction: "BUY" | "SELL" | null =
      input.direction === "BUY" || input.direction === "SELL" ? input.direction : null;
    if (direction === null) {
      throw new BusinessRuleError(
        "The confirmed trade draft has no usable direction.",
        TRADE_ERROR_CODES.INVALID_TRADE_DATA,
      );
    }

    // Symbol resolves against the instrument catalog ONLY (§50 — no alias
    // tables; an unknown symbol is an honest refusal, never an invention).
    const instrument = await this.repository.findInstrumentBySymbol(input.symbol);
    if (instrument === null || !instrument.isActive) {
      throw new BusinessRuleError(
        `symbol ${input.symbol} is not in the instrument catalog`,
        TRADE_ERROR_CODES.UNKNOWN_INSTRUMENT,
      );
    }

    // Account — the explicit choice first, else the owner's persisted
    // default (engine quality §3.1 semantics, same as the OCR import flow).
    // findDefaultAccountIdForUser answers null when no account exists —
    // normalized to undefined so the single guard below covers both shapes.
    let accountId = input.accountId;
    if (accountId === undefined) {
      accountId = (await this.accounts.findDefaultAccountIdForUser(userId)) ?? undefined;
    } else {
      const chosen = await this.accounts.findAccountForUser(accountId, userId);
      if (chosen === null) {
        throw new NotFoundError("Account not found", TRADE_ERROR_CODES.ACCOUNT_NOT_FOUND);
      }
    }
    if (accountId === undefined) {
      throw new BusinessRuleError(
        "no trading account is available for this import",
        TRADE_ERROR_CODES.ACCOUNT_NOT_FOUND,
      );
    }

    const externalRef = this.recognitionExternalRef(input.recognitionId, input.tradeIndex);
    const closed = input.exitPrice !== null && input.exitPrice !== undefined && input.exitPrice !== "" &&
      input.exitAt !== null && input.exitAt !== undefined && input.exitAt !== "";
    // Quantity floor: the capture surface's quantity mode needs a positive
    // decimal — a draft without a readable volume imports one unit (the
    // review UI flags volume as a primary field before confirm).
    const volume =
      input.volume !== null && input.volume !== undefined && input.volume.trim() !== ""
        ? input.volume
        : "1";

    const base = {
      accountId,
      instrumentId: instrument.id,
      direction,
      entryPrice: input.entryPrice,
      entryAt: input.entryAt,
      size: { mode: "quantity" as const, quantity: volume },
      ...(input.stopLoss !== null && input.stopLoss !== undefined ? { initialStop: input.stopLoss } : {}),
      ...(input.takeProfit !== null && input.takeProfit !== undefined ? { initialTP: input.takeProfit } : {}),
      // Provenance (§82) + traceability: the recognition id rides in the notes.
      reason: `Imported from screenshot recognition (${input.recognitionId.replace(/^ocr:/, "recognition ")})`,
      externalRef,
      source: "IMPORT" as const,
      // An OCR import has no playbook context by definition.
      outOfPlaybook: true as const,
    };

    try {
      const created = await this.createTrade(
        userId,
        closed
          ? {
              variant: "closed",
              ...base,
              // exitPrice/exitAt are validated non-empty by `closed` above.
              exitPrice: input.exitPrice as string,
              exitAt: input.exitAt as string,
              exitReason: "MANUAL" as const,
            }
          : { variant: "open", ...base },
      );
      return { tradeId: created.id };
    } catch (error) {
      // A concurrent confirmation could have won the creation race — link
      // instead of conflicting (§51 house policy).
      if (error instanceof ConflictError) {
        const winner =
          (await this.repository.findLiveTradeByExternalRef(accountId, externalRef)) ??
          (await this.repository.findLiveTradeByExternalRefForUser(userId, externalRef));
        if (winner !== null) return { tradeId: winner.id };
      }
      throw error;
    }
  }

  async closeTrade(
    userId: string,
    tradeId: string,
    input: CloseTradeInput,
  ): Promise<AwaitingDecisionResponse> {
    await this.loadUser(userId);
    const trade = await this.loadOwnedTrade(userId, tradeId);
    if (trade.status !== "OPEN") {
      throw new ConflictError("Trade is not open", TRADING_ERROR.INVALID_TRADE_STATE);
    }
    const contractSize = await this.loadContractSize(trade.instrumentId);

    let exitPrice: string;
    let exitAt: string;
    let exitReason: string;
    let quantity: string = trade.quantity.toFixed();
    const exits: Array<{ price: string; quantity: string; exitedAt: Date; reason: string; note: string | null }> = [];

    if (input.mode === "single") {
      exitPrice = input.exitPrice;
      exitAt = input.exitAt;
      exitReason = input.exitReason;
    } else {
      // Partial-exit legs stay preserved (§18); the journal header carries
      // the aggregated exit (weighted price, last leg timestamp, total qty).
      // §16 — the aggregation is DECIMAL through the one canonical
      // weightedAveragePrice; float accumulation here would silently round
      // FX prices (e.g. 1.08505 → "1.09") and corrupt the stored results.
      const aggregated = weightedAveragePrice(
        input.exits.map((leg) => ({
          price: new Prisma.Decimal(leg.price),
          volume: new Prisma.Decimal(leg.quantity),
        })),
      );
      const totalQuantity = input.exits.reduce(
        (sum, leg) => sum.plus(new Prisma.Decimal(leg.quantity)),
        new Prisma.Decimal(0),
      );
      for (const leg of input.exits) {
        exits.push({
          price: leg.price,
          quantity: leg.quantity,
          exitedAt: new Date(leg.exitedAt),
          reason: leg.reason,
          note: leg.note ?? null,
        });
      }
      // Schema guarantees ≥ 1 leg with a positive quantity — the zero-total
      // branch is unreachable defense (keeps the header coherent regardless).
      exitPrice = totalQuantity.isZero()
        ? trade.entryPrice.toFixed()
        : wire(aggregated, 8);
      exitAt = input.exits[input.exits.length - 1]?.exitedAt ?? new Date().toISOString();
      exitReason = input.exits[0]?.reason ?? "MANUAL";
      quantity = wire(totalQuantity, 8);
    }

    const fees = input.fees ?? trade.fees.toFixed();
    const swap = input.swap ?? trade.swap.toFixed();
    const riskAmount = trade.riskAmount?.toFixed() ?? null;
    const results = computeTradeResults(
      {
        direction: trade.direction as "BUY" | "SELL",
        entryPrice: trade.entryPrice.toFixed(),
        exitPrice,
        quantity,
        initialStop: trade.initialStop?.toFixed() ?? null,
        fees,
        swap,
        riskAmount,
        mfePrice: input.mfePrice ?? null,
        maePrice: input.maePrice ?? null,
      },
      contractSize,
    );

    await this.repository.updateTradeFields(trade.id, {
      status: "CLOSED",
      quantity,
      exitPrice,
      exitAt: new Date(exitAt),
      exitReason,
      fees,
      swap,
      riskAmount,
      finalStop: trade.finalStop?.toFixed() ?? trade.initialStop?.toFixed() ?? null,
      mfePrice: input.mfePrice ?? null,
      maePrice: input.maePrice ?? null,
      pnlGross: results.pnlGross,
      pnlNet: results.pnlNet,
      rMultiple: results.rMultiple,
      mfeR: results.mfeR,
      maeR: results.maeR,
    });
    if (exits.length > 0) {
      await this.repository.replaceExits(trade.id, exits);
    }
    // Domain fact (B4): Discipline subscribes to evaluate its rules against
    // the freshly closed trade — without a Trades→Discipline module cycle.
    this.events.publish("trade.closed", { userId, tradeId: trade.id, accountId: trade.accountId });
    return { id: trade.id, awaitingDecision: true };
  }

  // ── decision gate (Act 2) ──────────────────────────────────────────────────

  async decide(
    userId: string,
    tradeId: string,
    input: DecisionInput,
  ): Promise<{
    tradeId: string;
    pnlNet: string;
    rMultiple: string;
    durationSeconds: number;
    coachingKey: string;
    detectedMistakes: DetectedMistakeSummary[];
    triggeredAlerts: never[];
    savedSetupsToday: number;
    savedRToday: null;
  }> {
    await this.loadUser(userId);
    const trade = await this.loadOwnedTrade(userId, tradeId);
    if (trade.status !== "CLOSED") {
      throw new ConflictError("Trade is not closed", TRADING_ERROR.INVALID_TRADE_STATE);
    }
    if (trade.decisionGrade !== null) {
      throw new ConflictError("Decision already submitted", TRADING_ERROR.DECISION_ALREADY_SUBMITTED);
    }

    await this.repository.updateTradeFields(trade.id, {
      decisionGrade: input.grade,
      followedPlan: input.followedPlan,
      decisionAt: new Date(),
    });

    // B3 — mistake detection runs HERE, at the decision gate: this is the
    // reveal moment, so auto-detections surface exactly when the user can
    // confirm/contest them (the mock seeds equivalent rows at fixture time).
    // Detection is idempotent per trade: rows exist only after the first
    // decide() because the route 409s on re-submission.
    await this.detectMistakes(trade);
    const detectedRows = await this.repository.listSubRows(trade.userId, trade.id, "MISTAKE");
    const detectedMistakes: DetectedMistakeSummary[] = detectedRows.map((row) =>
      this.toDetectedSummary(row),
    );

    // Deterministic reveal: the verdict comes from the stored results; the
    // alert aggregate stays neutral until the Alerts domain exists (B4).
    const rMultiple = Number(trade.rMultiple?.toFixed() ?? "0");
    const win = rMultiple >= 0;
    const bucket = input.grade === "A" || input.grade === "B" ? "ab" : "df";
    const durationSeconds = Math.max(
      0,
      Math.round(
        (Date.parse((trade.exitAt ?? trade.entryAt).toISOString()) -
          Date.parse(trade.entryAt.toISOString())) / 1000,
      ),
    );
    return {
      tradeId: trade.id,
      pnlNet: trade.pnlNet?.toFixed() ?? "0",
      rMultiple: trade.rMultiple?.toFixed() ?? "0",
      durationSeconds,
      coachingKey: `${win ? "win" : "loss"}_${bucket}`,
      detectedMistakes,
      triggeredAlerts: [],
      savedSetupsToday: 0,
      savedRToday: null,
    };
  }

  // ── review (Act 3) ─────────────────────────────────────────────────────────

  async getReview(userId: string, tradeId: string): Promise<{
    trade: Trade;
    detectedMistakes: ReviewMistake[];
    tagIds: string[];
  }> {
    await this.loadOwnedTrade(userId, tradeId);
    const [trade, mistakeRows, tagRows] = await Promise.all([
      this.tradeViewOf(userId, tradeId),
      this.repository.listSubRows(userId, tradeId, "MISTAKE"),
      this.repository.listSubRows(userId, tradeId, "TAG"),
    ]);
    const detectedMistakes: ReviewMistake[] = mistakeRows.map((row) => {
      const summary = this.toDetectedSummary(row);
      return {
        ...summary,
        id: row.id,
        note: typeof row.data["note"] === "string" ? row.data["note"] : null,
      };
    });
    const tagIds = tagRows
      .map((row) => row.data["tagId"])
      .filter((value): value is string => typeof value === "string");
    return { trade, detectedMistakes, tagIds };
  }

  async updateReview(
    userId: string,
    tradeId: string,
    input: ReviewUpdateInput,
  ): Promise<{ trade: Trade }> {
    const trade = await this.loadOwnedTrade(userId, tradeId);
    const contractSize = await this.loadContractSize(trade.instrumentId);

    const mfePrice = input.mfePrice ?? trade.mfePrice?.toFixed() ?? null;
    const maePrice = input.maePrice ?? trade.maePrice?.toFixed() ?? null;
    // MFE/MAE are user-observed PRICES — their R conversions (and any other
    // result) are recomputed server-side (§13/§46). tagIds replace the full
    // join set (B3 — mock parity: no per-id existence validation).
    if (input.tagIds !== undefined) {
      await this.repository.replaceTagJoins(userId, trade.id, input.tagIds);
    }
    const results = trade.status === "CLOSED"
      ? computeTradeResults(
          {
            direction: trade.direction as "BUY" | "SELL",
            entryPrice: trade.entryPrice.toFixed(),
            exitPrice: trade.exitPrice?.toFixed() ?? null,
            quantity: trade.quantity.toFixed(),
            initialStop: trade.initialStop?.toFixed() ?? null,
            fees: trade.fees.toFixed(),
            swap: trade.swap.toFixed(),
            riskAmount: trade.riskAmount?.toFixed() ?? null,
            mfePrice,
            maePrice,
          },
          contractSize,
        )
      : null;

    await this.repository.updateTradeFields(trade.id, {
      mfePrice,
      maePrice,
      ...(input.lesson !== undefined ? { lessons: input.lesson } : {}),
      ...(results !== null
        ? {
            pnlGross: results.pnlGross,
            pnlNet: results.pnlNet,
            rMultiple: results.rMultiple,
            mfeR: results.mfeR,
            maeR: results.maeR,
          }
        : {}),
    });
    return { trade: await this.tradeViewOf(userId, tradeId) };
  }

  // ── open-trade mutations ───────────────────────────────────────────────────

  async updatePlan(
    userId: string,
    tradeId: string,
    input: PlanUpdateInput,
  ): Promise<{ trade: Trade; event: ReturnType<typeof toTradeEventView> }> {
    const trade = await this.loadOwnedTrade(userId, tradeId);
    if (trade.status !== "OPEN") {
      throw new ConflictError("Only open trades can be re-planned", TRADING_ERROR.INVALID_TRADE_STATE);
    }
    if (trade.source === "EXTERNAL_SYNC") {
      // §30: broker-derived fields are authoritative — a synchronized plan
      // is reconciled from the provider, never edited from the journal.
      throw new BusinessRuleError(
        "Broker-derived plan fields cannot be modified",
        TRADING_ERROR.INVALID_TRADE_DATA,
      );
    }

    let event: ReturnType<typeof toTradeEventView> | null = null;
    if (input.stop !== undefined) {
      const row = await this.repository.appendEvent({
        tradeId: trade.id,
        type: "SL_MODIFIED",
        payload: {
          from: trade.finalStop?.toFixed() ?? trade.initialStop?.toFixed() ?? null,
          to: input.stop,
        },
        source: "USER",
      });
      await this.repository.updateTradeFields(trade.id, { finalStop: input.stop });
      event = toTradeEventView(row);
    }
    if (input.tp !== undefined) {
      const row = await this.repository.appendEvent({
        tradeId: trade.id,
        type: "TP_MODIFIED",
        payload: { from: trade.initialTP?.toFixed() ?? null, to: input.tp },
        source: "USER",
      });
      await this.repository.updateTradeFields(trade.id, { initialTP: input.tp });
      event = toTradeEventView(row);
    }
    if (event === null) {
      throw new BusinessRuleError("Provide at least one of stop / tp", TRADING_ERROR.INVALID_TRADE_DATA);
    }
    return { trade: await this.tradeViewOf(userId, tradeId), event };
  }

  async updatePsychology(
    userId: string,
    tradeId: string,
    input: PsychologyUpdateInput,
  ): Promise<Trade> {
    await this.loadOwnedTrade(userId, tradeId);
    await this.repository.updateTradeFields(tradeId, {
      ...(input.emotionBefore !== undefined ? { emotionBefore: input.emotionBefore } : {}),
      ...(input.emotionAfter !== undefined ? { emotionAfter: input.emotionAfter } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    });
    return this.tradeViewOf(userId, tradeId);
  }

  async updateNotes(
    userId: string,
    tradeId: string,
    input: NotesUpdateInput,
  ): Promise<{ trade: Trade }> {
    await this.loadOwnedTrade(userId, tradeId);
    await this.repository.updateTradeFields(tradeId, { notes: input.notes });
    return { trade: await this.tradeViewOf(userId, tradeId) };
  }

  async updateTrade(
    userId: string,
    tradeId: string,
    input: UpdateTradeInput,
  ): Promise<{ trade: Trade }> {
    const user = await this.loadUser(userId);
    const trade = await this.loadOwnedTrade(userId, tradeId);
    const contractSize = await this.loadContractSize(input.instrumentId ?? trade.instrumentId);

    // §30 provenance: synchronized execution data stays broker-authoritative.
    if (trade.source === "EXTERNAL_SYNC") {
      const brokerFields: Array<keyof typeof input> = [
        "instrumentId", "direction", "entryPrice", "entryAt", "quantity",
        "initialStop", "initialTP", "exitPrice", "exitAt", "exitReason", "fees", "swap",
      ];
      if (brokerFields.some((field) => input[field] !== undefined)) {
        throw new BusinessRuleError(
          "Broker-derived execution data cannot be edited",
          TRADING_ERROR.INVALID_TRADE_DATA,
        );
      }
    }

    const touchesExit = input.exitPrice !== undefined || input.exitAt !== undefined || input.exitReason !== undefined;
    if (touchesExit && trade.status !== "CLOSED") {
      throw new ConflictError("Trade is not closed — close it first", TRADING_ERROR.INVALID_TRADE_STATE);
    }

    const entryPrice = input.entryPrice ?? trade.entryPrice.toFixed();
    const entryAt = input.entryAt ?? trade.entryAt.toISOString();
    const quantity = input.quantity ?? trade.quantity.toFixed();
    const initialStop = input.initialStop !== undefined ? input.initialStop : trade.initialStop?.toFixed() ?? null;
    if (touchesExit) {
      const effectiveExitAt = input.exitAt ?? trade.exitAt?.toISOString();
      if (effectiveExitAt !== undefined && effectiveExitAt < entryAt) {
        throw new BusinessRuleError("exitAt must be after entryAt", TRADING_ERROR.INVALID_TRADE_DATA);
      }
    }

    // Risk follows the edited stop/quantity (server-side recompute).
    const riskAmount = initialStop !== null
      ? computeRiskForTrade({
          entryPrice,
          initialStop,
          quantity,
          contractSize,
        })
      : null;

    let results = {
      pnlGross: trade.pnlGross?.toFixed() ?? null,
      pnlNet: trade.pnlNet?.toFixed() ?? null,
      rMultiple: trade.rMultiple?.toFixed() ?? null,
      mfeR: trade.mfeR?.toFixed() ?? null,
      maeR: trade.maeR?.toFixed() ?? null,
    };
    if (trade.status === "CLOSED") {
      results = computeTradeResults(
        {
          direction: (input.direction ?? trade.direction) as "BUY" | "SELL",
          entryPrice,
          exitPrice: input.exitPrice ?? trade.exitPrice?.toFixed() ?? null,
          quantity,
          initialStop,
          fees: input.fees ?? trade.fees.toFixed(),
          swap: input.swap ?? trade.swap.toFixed(),
          riskAmount,
          mfePrice: trade.mfePrice?.toFixed() ?? null,
          maePrice: trade.maePrice?.toFixed() ?? null,
        },
        contractSize,
      );
    }

    await this.repository.updateTradeFields(trade.id, {
      ...(input.instrumentId !== undefined ? { instrumentId: input.instrumentId } : {}),
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.entryPrice !== undefined ? { entryPrice } : {}),
      ...(input.entryAt !== undefined ? { entryAt: new Date(entryAt) } : {}),
      ...(input.quantity !== undefined ? { quantity } : {}),
      ...(input.initialStop !== undefined ? { initialStop } : {}),
      ...(input.initialTP !== undefined ? { initialTP: input.initialTP } : {}),
      ...(input.strategyId !== undefined ? { strategyId: input.strategyId } : {}),
      ...(input.fees !== undefined ? { fees: input.fees } : {}),
      ...(input.swap !== undefined ? { swap: input.swap } : {}),
      ...(input.exitPrice !== undefined ? { exitPrice: input.exitPrice } : {}),
      ...(input.exitAt !== undefined ? { exitAt: new Date(input.exitAt) } : {}),
      ...(input.exitReason !== undefined ? { exitReason: input.exitReason } : {}),
      riskAmount,
      tradingDate: tradingDateOf(entryAt, user.timezone),
      ...results,
    });
    return { trade: await this.tradeViewOf(userId, tradeId) };
  }

  async deleteTrade(userId: string, tradeId: string): Promise<{ id: string; deleted: true }> {
    await this.loadOwnedTrade(userId, tradeId);
    await this.repository.softDeleteTrade(tradeId);
    return { id: tradeId, deleted: true };
  }

  // ── bulk operations ────────────────────────────────────────────────────────

  async bulkTrades(
    userId: string,
    input: BulkTradesInput,
  ): Promise<{ op: string; affected: number; skipped: number }> {
    if (input.op === "TAG") {
      // The Tags domain (trade↔tag joins) is a later phase — an honest 422
      // instead of a silent no-op (§31 scope note in the phase report).
      throw new BusinessRuleError(
        "Tag operations require the Tags domain (future phase)",
        TRADING_ERROR.INVALID_TRADE_DATA,
      );
    }
    const ids = [...new Set(input.tradeIds)];

    if (input.op === "DELETE") {
      const affected = await this.repository.bulkSoftDelete(userId, ids);
      return { op: input.op, affected, skipped: ids.length - affected };
    }
    const affected = await this.repository.bulkGrade(userId, ids, input.grade);
    // OPEN trades exist but are skipped by the gate — reported honestly.
    return { op: input.op, affected, skipped: ids.length - affected };
  }

  // ── CSV import (rows normalized client-side) ───────────────────────────────

  async importTrades(
    userId: string,
    input: ImportTradesInput,
  ): Promise<{ imported: number; skippedDuplicates: number; unknownSymbols: string[]; tradeIds: string[] }> {
    const user = await this.loadUser(userId);
    // The import contract has no account field — trades land on the
    // PERSISTED default account (backend convention), never a client hint.
    // §24/ADR-0003 — the default account is resolved through the owner's
    // narrow read contract, never by touching prisma.tradingAccount here.
    const defaultAccountId = await this.accounts.findDefaultAccountIdForUser(userId);
    if (defaultAccountId === null) {
      throw new BusinessRuleError("No trading account found", TRADING_ERROR.ACCOUNT_NOT_FOUND);
    }
    // The journal backfills the currency column from the receiving account.
    const defaultAccount = await this.accounts.findAccountForUser(defaultAccountId, userId);
    if (defaultAccount === null) {
      throw new BusinessRuleError("No trading account found", TRADING_ERROR.ACCOUNT_NOT_FOUND);
    }
    const catalog = await this.repository.listActiveInstruments();
    const byUpperSymbol = new Map(catalog.map((instrument) => [instrument.symbol.toUpperCase(), instrument]));

    const unknownSymbols = new Set<string>();
    const tradeIds: string[] = [];
    let skippedDuplicates = 0;

    for (const row of input.rows) {
      const instrument = byUpperSymbol.get(row.symbol.toUpperCase());
      if (instrument === undefined) {
        unknownSymbols.add(row.symbol);
        continue;
      }
      // Broker ref → idempotent re-imports (same file twice = zero duplicates).
      const externalRef = `${input.broker}:${row.symbol.toUpperCase()}:${row.side}:${row.entryAt}:${row.entryPrice}`;
      if (
        (await this.repository.findLiveTradeByExternalRef(defaultAccountId, externalRef)) !== null
      ) {
        skippedDuplicates += 1;
        continue;
      }

      const isClosed = row.exitAt !== undefined && row.exitPrice !== undefined;
      const quantity = row.quantity ?? "1";
      const fees = row.fees ?? "0";
      const results = isClosed
        ? computeTradeResults(
            {
              direction: row.side as "BUY" | "SELL",
              entryPrice: row.entryPrice,
              exitPrice: row.exitPrice ?? null,
              quantity,
              initialStop: null,
              fees,
              swap: "0",
              riskAmount: null,
              mfePrice: null,
              maePrice: null,
            },
            instrument.contractSize.toFixed(),
          )
        : null;

      const created = await this.repository.createTradeWithLegs({
        trade: {
          userId,
          accountId: defaultAccountId,
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          currency: defaultAccount.currency,
          strategyId: input.strategyId ?? null,
          setupId: null,
          strategyVersion: input.strategyId !== undefined && input.strategyId !== null ? 1 : null,
          status: isClosed ? "CLOSED" : "OPEN",
          direction: row.side,
          source: "IMPORT",
          entryPrice: row.entryPrice,
          entryAt: new Date(row.entryAt),
          quantity,
          initialStop: null,
          initialTP: null,
          plannedRR: null,
          riskAmount: null,
          finalStop: null,
          exitPrice: isClosed ? row.exitPrice ?? null : null,
          exitAt: isClosed ? new Date(row.exitAt as string) : null,
          exitReason: isClosed ? "MANUAL" : null,
          fees,
          swap: "0",
          pnlGross: results?.pnlGross ?? null,
          pnlNet: results?.pnlNet ?? null,
          rMultiple: results?.rMultiple ?? null,
          mfePrice: null,
          maePrice: null,
          mfeR: null,
          maeR: null,
          emotionBefore: null,
          confidence: null,
          notes: row.notes ?? `Imported from ${input.broker}`,
          tradingDate: tradingDateOf(row.entryAt, user.timezone),
          externalRef,
          importBatchId: crypto.randomUUID(),
          externalPositionId: null,
        },
        exits: [],
      });
      tradeIds.push(created.id);
    }

    return {
      imported: tradeIds.length,
      skippedDuplicates,
      unknownSymbols: [...unknownSymbols],
      tradeIds,
    };
  }

  // ── saved views ─────────────────────────────────────────────────────────────

  async listViews(userId: string): Promise<{ views: ReturnType<typeof toSavedViewView>[] }> {
    const rows = await this.repository.listViews(userId);
    return { views: rows.map(toSavedViewView) };
  }

  async createView(
    userId: string,
    input: CreateSavedViewInput,
  ): Promise<{ view: ReturnType<typeof toSavedViewView> }> {
    const name = input.name.trim();
    if (name === "") {
      throw new BusinessRuleError("View name is required", TRADING_ERROR.INVALID_TRADE_DATA);
    }
    const existing = await this.repository.findViewByName(userId, name);
    if (existing !== null) {
      throw new ConflictError("A view with this name already exists", TRADING_ERROR.SAVING_VIEW_CONFLICT);
    }
    const scope = input.scope ?? "TRADES";
    const row = await this.repository.insertView({
      userId,
      name,
      scope,
      filters: input.filters,
      analyticsFilters:
        scope === "ANALYTICS" && input.analyticsFilters !== undefined
          ? (input.analyticsFilters as unknown as Prisma.InputJsonValue)
          : null,
      columns: input.columns,
      sortKey: input.sortKey,
      sortDir: input.sortDir,
    });
    return { view: toSavedViewView(row) };
  }

  async deleteView(userId: string, viewId: string): Promise<{ id: string; deleted: true }> {
    const view = await this.repository.findViewForUser(viewId, userId);
    if (view === null) {
      throw new NotFoundError("View not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteView(viewId);
    return { id: viewId, deleted: true };
  }

  // ── screenshots ────────────────────────────────────────────────────────────

  async listScreenshots(userId: string, tradeId: string) {
    await this.loadOwnedTrade(userId, tradeId);
    const rows = await this.repository.listScreenshots(tradeId);
    const screenshots = await Promise.all(
      rows.map(async (row) =>
        toScreenshotView(row, {
          dataUrlOf: (key) => this.screenshotStorage.dataUrlOf(key),
        }),
      ),
    );
    return { screenshots };
  }

  async addScreenshot(
    userId: string,
    tradeId: string,
    input: AddScreenshotInput,
  ) {
    const trade = await this.loadOwnedTrade(userId, tradeId);
    let stored;
    try {
      stored = await this.screenshotStorage.store({
        tradeId: trade.id,
        dataUrl: input.dataUrl,
        maxBytes: this.config.trades.screenshotMaxBytes,
      });
    } catch (error) {
      if (error instanceof InvalidScreenshotError) {
        throw new BusinessRuleError(error.message, TRADING_ERROR.INVALID_SCREENSHOT);
      }
      throw error;
    }
    const row = await this.repository.insertScreenshot({
      tradeId: trade.id,
      kind: input.kind,
      storageKey: stored.storageKey,
      checksumSha256: stored.checksumSha256,
      mime: stored.mime,
      sizeBytes: stored.sizeBytes,
      caption: input.caption ?? null,
      annotations: null,
    });
    const dataUrl = await this.screenshotStorage.dataUrlOf(stored.storageKey);
    return toScreenshotView(row, { dataUrlOf: () => dataUrl });
  }

  async deleteScreenshot(
    userId: string,
    tradeId: string,
    screenshotId: string,
  ): Promise<{ id: string; deleted: true }> {
    const trade = await this.loadOwnedTrade(userId, tradeId);
    const screenshot = await this.repository.findScreenshotForUser(screenshotId, trade.id);
    if (screenshot === null) {
      throw new NotFoundError("Screenshot not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteScreenshot(screenshot.id);
    await this.screenshotStorage.remove(screenshot.storageKey);
    return { id: screenshotId, deleted: true };
  }

  // ── private ────────────────────────────────────────────────────────────────

  /** Fresh trade projection (service-level, ownership already checked). */
  private async tradeViewOf(userId: string, tradeId: string): Promise<Trade> {
    const fresh = await this.loadOwnedTrade(userId, tradeId);
    return toTradeView(fresh);
  }

  // ── B3 — tags, mistakes, session series ─────────────────────────────────────

  /** GET /tags — lazily seeds the starter set on the user's first read. */
  async listTags(userId: string): Promise<{ tags: Tag[] }> {
    let rows = await this.repository.listTagRows(userId);
    if (rows.length === 0) {
      const starters: TagRowData[] = STARTER_TAGS.map((def) => ({
        name: def.name,
        category: def.category,
        color: null,
        parentId: null,
      }));
      await this.repository.insertTagRows(userId, starters);
      rows = await this.repository.listTagRows(userId);
    }
    return {
      tags: rows.map((row) => this.toTagView(row)),
    };
  }

  /** POST /tags — inline tag creation (Act 3 reflect, capture details). */
  async createTag(userId: string, input: z.infer<typeof createTagInputSchema>): Promise<Tag> {
    const name = input.name.trim();
    if (name === "") {
      throw new BusinessRuleError("Tag name is required", TRADING_ERROR.INVALID_TRADE_DATA);
    }
    const category = input.category ?? "CUSTOM";
    const existing = await this.repository.listTagRows(userId);
    const duplicate = existing.some(
      (row) =>
        row.data.name.toLowerCase() === name.toLowerCase() && row.data.category === category,
    );
    if (duplicate) {
      throw new ConflictError("Tag already exists", TRADING_ERROR.DUPLICATE_EXTERNAL_TRADE);
    }
    const row = await this.repository.insertTagRow(userId, {
      name,
      category,
      color: null,
      parentId: null,
    });
    return this.toTagView(row);
  }

  /** PATCH /trades/:id/mistakes/:mistakeId — confirm/contest a detection. */
  async resolveMistake(
    userId: string,
    tradeId: string,
    mistakeRowId: string,
    confirmed: boolean,
  ): Promise<ReviewMistake> {
    await this.loadOwnedTrade(userId, tradeId);
    const row = await this.repository.findSubRowForUser(userId, tradeId, mistakeRowId, "MISTAKE");
    if (row === null) {
      throw new NotFoundError("Trade mistake not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const data = { ...row.data, userConfirmed: confirmed, note: row.data["note"] ?? null };
    await this.repository.updateSubRowData(row.id, data);
    const summary = this.toDetectedSummary({ ...row, data });
    return { ...summary, id: row.id, note: data.note as string | null };
  }

  /** GET /trades/:id/session-series — deterministic projection (see session-series.ts). */
  async getTradeSessionSeries(
    userId: string,
    tradeId: string,
  ): Promise<ReturnType<typeof computeSessionSeries>> {
    const trade = await this.loadOwnedTrade(userId, tradeId);
    const instrument = await this.repository.findInstrument(trade.instrumentId);
    return computeSessionSeries(
      {
        id: trade.id,
        direction: trade.direction,
        entryPrice: trade.entryPrice.toFixed(),
        exitPrice: trade.exitPrice?.toFixed() ?? null,
        entryAt: trade.entryAt,
        exitAt: trade.exitAt,
        mfePrice: trade.mfePrice?.toFixed() ?? null,
        maePrice: trade.maePrice?.toFixed() ?? null,
        initialStop: trade.initialStop?.toFixed() ?? null,
        initialTP: trade.initialTP?.toFixed() ?? null,
      },
      instrument
        ? { symbol: instrument.symbol, digits: instrument.digits, pipSize: instrument.pipSize.toFixed() }
        : null,
    );
  }

  /**
   * Auto-detection at the decision gate (B3). Mirrors the mock's seeded
   * rules that are computable from journal data alone:
   *   - no_stop_loss   — the trade carries no planned stop;
   *   - revenge_trade  — a closed LOSS exited within 15 min before entry.
   * The remaining catalog entries (moved_stop, oversized, out_of_hours,
   * cut_winner_early) need plan/context data the journal does not record —
   * they stay USER-detectable via the discipline module (B4), never faked.
   */
  private async detectMistakes(trade: {
    id: string;
    userId: string;
    initialStop: unknown;
    entryAt: Date;
  }): Promise<void> {
    const existing = await this.repository.listSubRows(trade.userId, trade.id, "MISTAKE");
    if (existing.length > 0) return; // detection runs once per trade

    const detections: Array<{ mistakeId: string; detectedBy: "AUTO" }> = [];
    if (trade.initialStop === null || trade.initialStop === undefined) {
      const id = systemMistakeIdByKey("no_stop_loss");
      if (id !== null) detections.push({ mistakeId: id, detectedBy: "AUTO" });
    }
    const recentLoss = await this.repository.findRecentClosedLoss(
      trade.userId,
      trade.entryAt,
      REVENGE_WINDOW_MINUTES,
    );
    if (recentLoss !== null) {
      const id = systemMistakeIdByKey("revenge_trade");
      if (id !== null) detections.push({ mistakeId: id, detectedBy: "AUTO" });
    }
    for (const detection of detections) {
      await this.repository.insertSubRow(trade.userId, trade.id, "MISTAKE", {
        ...detection,
        userConfirmed: null,
        note: null,
        createdAt: new Date().toISOString(),
      });
    }
  }

  /** TradeSubRow (MISTAKE) → reveal projection with catalog enrichment. */
  private toDetectedSummary(row: {
    id: string;
    data: Record<string, unknown>;
  }): DetectedMistakeSummary {
    const mistakeId = typeof row.data["mistakeId"] === "string" ? row.data["mistakeId"] : "";
    const catalog = findSystemMistake(mistakeId);
    const detectedBy = row.data["detectedBy"] === "MANUAL" ? "MANUAL" : "AUTO";
    const confirmed = row.data["userConfirmed"];
    return {
      mistakeId,
      key: catalog?.key ?? "unknown",
      label: catalog?.label ?? "Unknown mistake",
      category: catalog?.category ?? "BEHAVIOR",
      detectedBy,
      userConfirmed: typeof confirmed === "boolean" ? confirmed : null,
    };
  }

  /** TagRow → shared Tag contract (the row id IS the tag id). */
  private toTagView(row: { id: string; userId: string; data: TagRowData }): Tag {
    return {
      id: row.id,
      userId: row.userId,
      name: row.data.name,
      category: (row.data.category as Tag["category"]) ?? "CUSTOM",
      color: row.data.color,
      parentId: row.data.parentId,
    };
  }
}
