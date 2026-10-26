/**
 * Replay application service - the historical replay domain (REPLAY MASTER
 * PROMPT). Simulation ONLY: every endpoint mutates replay-owned records;
 * no route, service or adapter here can reach a broker (§37 - there is no
 * execution path by construction).
 *
 * Security model (§34/§35):
 *  - every lookup goes through ReplayRepository.findForUser(userId, …) -
 *    foreign ids are simply not found (IDOR → 404);
 *  - strategyId / setupId / tradingAccountId references are validated
 *    against the OWNER's playbook rows / trading accounts before attach;
 *  - replay-clock writes (openedAtMs/closedAtMs/atMs/advance) are clamped
 *    into the session's historical window server-side.
 *
 * Result metrics (§30) are computed with the shared deterministic engine -
 * only from data the trader actually recorded; absent data stays null.
 */
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import {
  computeReplayResult,
  computeRiskAmount,
  createReplayDecisionInputSchema,
  createReplayNoteInputSchema,
  createReplaySessionInputSchema,
  createReplayTradeInputSchema,
  closeReplayTradeInputSchema,
  pnlForExit,
  toDecimalString,
  advanceReplayInputSchema,
  updateReplaySessionInputSchema,
  type ReplayDecision,
  type ReplayNote,
  type ReplaySession,
  type ReplayTrade,
  type ReplayDetailResponse,
  type ReplayOverviewResponse,
  type ReplaySessionsResponse,
} from "../../shared/contracts";
import { BusinessRuleError, NotFoundError } from "../../shared/errors/app-error";
import { AccountsRepository } from "../accounts/accounts.repository";
import { PlaybookRepository } from "../playbook/playbook.repository";
import { REPLAY_KINDS, ReplayRepository } from "./replay.repository";

type CreateSessionInput = z.infer<typeof createReplaySessionInputSchema>;
type UpdateSessionInput = z.infer<typeof updateReplaySessionInputSchema>;
type AdvanceInput = z.infer<typeof advanceReplayInputSchema>;
type CreateTradeInput = z.infer<typeof createReplayTradeInputSchema>;
type CloseTradeInput = z.infer<typeof closeReplayTradeInputSchema>;
type CreateDecisionInput = z.infer<typeof createReplayDecisionInputSchema>;
type CreateNoteInput = z.infer<typeof createReplayNoteInputSchema>;

const WINDOW_MARGIN_MS = 1;

@Injectable()
export class ReplayService {
  constructor(
    private readonly repository: ReplayRepository,
    private readonly playbook: PlaybookRepository,
    private readonly accounts: AccountsRepository,
  ) {}

  private nowIso(): string {
    return new Date().toISOString();
  }

  /** Ownership-scoped session lookup - foreign ids are NOT found (§35). */
  private async sessionForUser(userId: string, sessionId: string): Promise<ReplaySession> {
    const row = await this.repository.findForUser(userId, REPLAY_KINDS.SESSION, sessionId);
    if (!row) throw new NotFoundError("Replay session not found");
    return row.data as unknown as ReplaySession;
  }

  private async childForUser<T extends { id: string }>(
    userId: string,
    sessionId: string,
    kind: string,
    childId: string,
  ): Promise<{ session: ReplaySession; child: T }> {
    const session = await this.sessionForUser(userId, sessionId);
    const row = await this.repository.findForUser(userId, kind, childId);
    if (!row) throw new NotFoundError("Replay record not found");
    return { session, child: row.data as unknown as T };
  }

  /** Simulated records are immutable once the replay is archived. */
  private assertWritable(session: ReplaySession): void {
    if (session.status === "ARCHIVED") {
      throw new BusinessRuleError("This replay is archived - records can no longer change.");
    }
  }

  /** Clamp a replay-clock instant into the session's historical window. */
  private clampToWindow(session: ReplaySession, ms: number): number {
    return Math.min(Math.max(ms, session.config.fromMs), session.config.toMs - WINDOW_MARGIN_MS);
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  /** POST /replay/sessions - create a DRAFT replay (§14 inputs). */
  async createSession(userId: string, input: CreateSessionInput): Promise<{ session: ReplaySession }> {
    await this.assertContextOwnership(userId, input);

    const now = this.nowIso();
    const fromMs = input.fromMs;
    const toMs = input.toMs;
    const startAtMs = input.startAtMs ?? fromMs;
    const session: ReplaySession = {
      id: crypto.randomUUID(),
      status: "DRAFT",
      config: {
        symbol: input.symbol,
        interval: input.interval,
        fromMs,
        toMs,
        startAtMs,
        strategyId: input.strategyId ?? null,
        setupId: input.setupId ?? null,
        tradingAccountId: input.tradingAccountId ?? null,
        startingBalance: input.startingBalance ?? null,
        riskPerTradePct: input.riskPerTradePct ?? null,
      },
      currentMs: startAtMs,
      playbackState: "READY",
      lastPlayedAt: null,
      counts: { trades: 0, decisions: 0, notes: 0 },
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insert(userId, REPLAY_KINDS.SESSION, session.id, session as unknown as never);
    return { session };
  }

  /** GET /replay/sessions - newest first (list cards carry counts only). */
  async listSessions(userId: string): Promise<ReplaySessionsResponse> {
    const rows = await this.repository.listByKindDesc(userId, REPLAY_KINDS.SESSION);
    return { sessions: rows.map((row) => row.data as unknown as ReplaySession) };
  }

  /** GET /replay/overview - landing metrics from the user's real data (§13). */
  async overview(userId: string): Promise<ReplayOverviewResponse> {
    const rows = await this.repository.listByKindDesc(userId, REPLAY_KINDS.SESSION);
    const sessions = rows.map((row) => row.data as unknown as ReplaySession);
    const completed = sessions.filter((session) => session.status === "COMPLETED");

    const winRates = completed
      .map((session) => session.result?.winRatePct)
      .filter((value): value is number => value !== null);
    const avgWinRatePct =
      winRates.length > 0 ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : null;

    let best: ReplaySession | null = null;
    for (const session of completed) {
      if (session.result?.netPnl === null || session.result?.netPnl === undefined) continue;
      if (best === null || (session.result.netPnl ?? 0) > (best.result?.netPnl ?? 0)) best = session;
    }

    return {
      total: sessions.filter((session) => session.status !== "ARCHIVED").length,
      completed: completed.length,
      inProgress: sessions.filter((session) => session.status === "IN_PROGRESS").length,
      simulatedTrades: sessions.reduce((sum, session) => sum + session.counts.trades, 0),
      avgWinRatePct,
      bestSessionId: best?.id ?? null,
      bestSessionNetPnl: best?.result?.netPnl ?? null,
    };
  }

  /** GET /replay/sessions/:id - session + children (workspace payload). */
  async detail(userId: string, sessionId: string): Promise<ReplayDetailResponse> {
    const session = await this.sessionForUser(userId, sessionId);
    const [trades, decisions, notes] = await Promise.all([
      this.repository.listByKind(userId, REPLAY_KINDS.TRADE),
      this.repository.listByKind(userId, REPLAY_KINDS.DECISION),
      this.repository.listByKind(userId, REPLAY_KINDS.NOTE),
    ]);
    return {
      session,
      trades: trades
        .map((row) => row.data as unknown as ReplayTrade)
        .filter((trade) => trade.sessionId === sessionId)
        .sort((a, b) => a.openedAtMs - b.openedAtMs),
      decisions: decisions
        .map((row) => row.data as unknown as ReplayDecision)
        .filter((decision) => decision.sessionId === sessionId)
        .sort((a, b) => a.atMs - b.atMs),
      notes: notes
        .map((row) => row.data as unknown as ReplayNote)
        .filter((note) => note.sessionId === sessionId)
        .sort((a, b) => a.atMs - b.atMs),
    };
  }

  /** PATCH /replay/sessions/:id - attach/detach playbook context. */
  async updateSession(userId: string, sessionId: string, input: UpdateSessionInput): Promise<{ session: ReplaySession }> {
    const session = await this.sessionForUser(userId, sessionId);
    this.assertWritable(session);
    await this.assertContextOwnership(userId, {
      strategyId: input.strategyId ?? undefined,
      setupId: input.setupId ?? undefined,
    });

    const next: ReplaySession = {
      ...session,
      config: {
        ...session.config,
        strategyId: input.strategyId !== undefined ? input.strategyId : session.config.strategyId,
        setupId: input.setupId !== undefined ? input.setupId : session.config.setupId,
      },
      updatedAt: this.nowIso(),
    };
    await this.repository.updateData(sessionId, next as unknown as never);
    return { session: next };
  }

  /** POST /replay/sessions/:id/advance - resume checkpoint (§51, coarse). */
  async advance(userId: string, sessionId: string, input: AdvanceInput): Promise<{ session: ReplaySession }> {
    const session = await this.sessionForUser(userId, sessionId);
    this.assertWritable(session);
    if (session.status === "COMPLETED") {
      throw new BusinessRuleError("This replay is already completed.");
    }
    const clamped = Math.min(Math.max(input.currentMs, session.config.startAtMs), session.config.toMs);
    const next: ReplaySession = {
      ...session,
      status: "IN_PROGRESS",
      currentMs: clamped,
      playbackState: input.playbackState,
      lastPlayedAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    await this.repository.updateData(sessionId, next as unknown as never);
    return { session: next };
  }

  /** POST /replay/sessions/:id/complete - freeze the result (§30). */
  async complete(userId: string, sessionId: string): Promise<{ session: ReplaySession }> {
    const session = await this.sessionForUser(userId, sessionId);
    if (session.status === "COMPLETED") return { session };
    if (session.status === "ARCHIVED") {
      throw new BusinessRuleError("Archived replays cannot be completed.");
    }
    const { trades, decisions, notes } = await this.detail(userId, sessionId);
    const result = computeReplayResult(
      trades.map((trade) => ({
        pnl: trade.pnl,
        rMultiple: trade.rMultiple,
        riskAmount: trade.riskAmount,
        closedAtMs: trade.closedAtMs,
      })),
      {
        decisions: decisions.length,
        notes: notes.length,
        durationMs: Math.max(session.currentMs - session.config.startAtMs, 0),
      },
    );
    const now = this.nowIso();
    const next: ReplaySession = {
      ...session,
      status: "COMPLETED",
      playbackState: "COMPLETED",
      currentMs: session.config.toMs,
      result,
      updatedAt: now,
    };
    await this.repository.updateData(sessionId, next as unknown as never);
    return { session: next };
  }

  /** POST /replay/sessions/:id/archive (§32). */
  async archive(userId: string, sessionId: string): Promise<{ session: ReplaySession }> {
    const session = await this.sessionForUser(userId, sessionId);
    const next: ReplaySession = { ...session, status: "ARCHIVED", updatedAt: this.nowIso() };
    await this.repository.updateData(sessionId, next as unknown as never);
    return { session: next };
  }

  /** DELETE /replay/sessions/:id - cascade deletes the child rows. */
  async deleteSession(userId: string, sessionId: string): Promise<{ ok: true }> {
    const session = await this.sessionForUser(userId, sessionId);
    const [trades, decisions, notes] = await Promise.all([
      this.repository.listByKind(userId, REPLAY_KINDS.TRADE),
      this.repository.listByKind(userId, REPLAY_KINDS.DECISION),
      this.repository.listByKind(userId, REPLAY_KINDS.NOTE),
    ]);
    const orphans = [
      ...trades.filter((row) => (row.data as unknown as ReplayTrade).sessionId === sessionId),
      ...decisions.filter((row) => (row.data as unknown as ReplayDecision).sessionId === sessionId),
      ...notes.filter((row) => (row.data as unknown as ReplayNote).sessionId === sessionId),
    ];
    for (const row of orphans) {
      await this.repository.deleteRow(row.id);
    }
    await this.repository.deleteRow(session.id);
    return { ok: true };
  }

  // ── Simulated trades (§23/§24) ──────────────────────────────────────────────

  /** POST /replay/sessions/:id/trades - open a simulated position. */
  async createTrade(userId: string, sessionId: string, input: CreateTradeInput): Promise<{ trade: ReplayTrade }> {
    const session = await this.sessionForUser(userId, sessionId);
    this.assertWritable(session);

    const specs = await this.repository.findInstrumentSpecs(session.config.symbol);
    const contractSize = specs?.contractSize ?? "1";
    const openedAtMs = this.clampToWindow(session, input.openedAtMs ?? session.currentMs);
    const now = this.nowIso();

    const riskAmount =
      input.stopLoss !== null && input.stopLoss !== undefined
        ? computeRiskAmount(input.entryPrice, input.stopLoss, input.quantity, contractSize)
        : null;

    const trade: ReplayTrade = {
      id: crypto.randomUUID(),
      sessionId,
      symbol: session.config.symbol,
      direction: input.direction,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      quantity: input.quantity,
      riskAmount,
      note: input.note ?? null,
      openedAtMs,
      closedAtMs: null,
      exitPrice: null,
      pnl: null,
      rMultiple: null,
    };
    await this.repository.insert(userId, REPLAY_KINDS.TRADE, trade.id, trade as unknown as never);
    await this.bumpCounts(sessionId, session, "trades", 1, now);
    return { trade };
  }

  /** POST /replay/sessions/:id/trades/:tradeId/close - settle a simulation. */
  async closeTrade(userId: string, sessionId: string, tradeId: string, input: CloseTradeInput): Promise<{ trade: ReplayTrade }> {
    const { session, child } = await this.childForUser<ReplayTrade>(userId, sessionId, REPLAY_KINDS.TRADE, tradeId);
    this.assertWritable(session);
    if (child.closedAtMs !== null) {
      throw new BusinessRuleError("This simulated trade is already closed.");
    }
    const specs = await this.repository.findInstrumentSpecs(session.config.symbol);
    const contractSize = specs?.contractSize ?? "1";
    const closedAtMs = this.clampToWindow(session, input.closedAtMs ?? session.currentMs);
    const pnl = pnlForExit({
      entry: child.entryPrice,
      exit: input.exitPrice,
      direction: child.direction,
      quantity: child.quantity,
      contractSize,
    });
    if (pnl === null) {
      throw new BusinessRuleError("Exit price is not valid for this simulated trade.");
    }
    const riskAmount = child.riskAmount;
    const rMultiple =
      riskAmount !== null && Number(riskAmount) !== 0
        ? toDecimalString(Number(pnl) / Number(riskAmount))
        : null;

    const next: ReplayTrade = {
      ...child,
      closedAtMs,
      exitPrice: input.exitPrice,
      pnl,
      rMultiple,
      note: input.note !== undefined && input.note !== null ? input.note : child.note,
    };
    await this.repository.updateData(tradeId, next as unknown as never);
    return { trade: next };
  }

  /** DELETE /replay/sessions/:id/trades/:tradeId - retract a mistake. */
  async deleteTrade(userId: string, sessionId: string, tradeId: string): Promise<{ ok: true }> {
    const { session, child } = await this.childForUser<ReplayTrade>(userId, sessionId, REPLAY_KINDS.TRADE, tradeId);
    this.assertWritable(session);
    await this.repository.deleteRow(child.id);
    await this.bumpCounts(sessionId, session, "trades", -1, this.nowIso());
    return { ok: true };
  }

  // ── Decisions (§25) ─────────────────────────────────────────────────────────

  async createDecision(userId: string, sessionId: string, input: CreateDecisionInput): Promise<{ decision: ReplayDecision }> {
    const session = await this.sessionForUser(userId, sessionId);
    this.assertWritable(session);
    const now = this.nowIso();
    const decision: ReplayDecision = {
      id: crypto.randomUUID(),
      sessionId,
      kind: input.kind,
      atMs: this.clampToWindow(session, input.atMs ?? session.currentMs),
      note: input.note ?? null,
      strategyId: input.strategyId ?? session.config.strategyId,
      setupId: input.setupId ?? session.config.setupId,
    };
    await this.repository.insert(userId, REPLAY_KINDS.DECISION, decision.id, decision as unknown as never);
    await this.bumpCounts(sessionId, session, "decisions", 1, now);
    return { decision };
  }

  async deleteDecision(userId: string, sessionId: string, decisionId: string): Promise<{ ok: true }> {
    const { session, child } = await this.childForUser<ReplayDecision>(userId, sessionId, REPLAY_KINDS.DECISION, decisionId);
    this.assertWritable(session);
    await this.repository.deleteRow(child.id);
    await this.bumpCounts(sessionId, session, "decisions", -1, this.nowIso());
    return { ok: true };
  }

  // ── Notes (§28) ─────────────────────────────────────────────────────────────

  async createNote(userId: string, sessionId: string, input: CreateNoteInput): Promise<{ note: ReplayNote }> {
    const session = await this.sessionForUser(userId, sessionId);
    this.assertWritable(session);
    const now = this.nowIso();
    const note: ReplayNote = {
      id: crypto.randomUUID(),
      sessionId,
      atMs: this.clampToWindow(session, input.atMs ?? session.currentMs),
      body: input.body,
    };
    await this.repository.insert(userId, REPLAY_KINDS.NOTE, note.id, note as unknown as never);
    await this.bumpCounts(sessionId, session, "notes", 1, now);
    return { note };
  }

  async deleteNote(userId: string, sessionId: string, noteId: string): Promise<{ ok: true }> {
    const { session, child } = await this.childForUser<ReplayNote>(userId, sessionId, REPLAY_KINDS.NOTE, noteId);
    this.assertWritable(session);
    await this.repository.deleteRow(child.id);
    await this.bumpCounts(sessionId, session, "notes", -1, this.nowIso());
    return { ok: true };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** §35 - attached context must belong to the SAME user. */
  private async assertContextOwnership(
    userId: string,
    refs: { strategyId?: string | null; setupId?: string | null; tradingAccountId?: string | null },
  ): Promise<void> {
    if (refs.strategyId) {
      const strategy = await this.playbook.findForUser(userId, "STRATEGY", refs.strategyId);
      if (!strategy) throw new NotFoundError("Strategy not found for this account");
    }
    if (refs.setupId) {
      const setup = await this.playbook.findForUser(userId, "SETUP", refs.setupId);
      if (!setup) throw new NotFoundError("Setup not found for this account");
      const setupStrategyId = (setup.data as unknown as { strategyId?: string }).strategyId;
      if (refs.strategyId && setupStrategyId && setupStrategyId !== refs.strategyId) {
        throw new BusinessRuleError("The setup does not belong to the selected strategy.");
      }
    }
    if (refs.tradingAccountId) {
      const account = await this.accounts.findAccountForUser(refs.tradingAccountId, userId);
      if (!account) throw new NotFoundError("Trading account not found for this account");
    }
  }

  /** Denormalized list counters - kept consistent with child writes. */
  private async bumpCounts(
    sessionId: string,
    session: ReplaySession,
    key: keyof ReplaySession["counts"],
    delta: number,
    now: string,
  ): Promise<void> {
    const next: ReplaySession = {
      ...session,
      counts: { ...session.counts, [key]: Math.max(0, session.counts[key] + delta) },
      updatedAt: now,
    };
    await this.repository.updateData(sessionId, next as unknown as never);
  }
}
