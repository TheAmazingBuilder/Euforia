/**
 * Session Live application service (B9) — trading-session lifecycle,
 * saved analyses and key levels. READ-ONLY relative to any broker: every
 * endpoint mutates application-owned documentation entities ONLY. There is
 * deliberately NO order/execution path (§2/§50 negative capability).
 *
 * End-summary (§43): only metrics supported by real data — journal trades
 * in the session window, discipline violations, the deterministic eco
 * calendar, logbook notes and saved analyses. Everything unavailable
 * stays null/0-honest.
 */
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import {
  type createKeyLevelInputSchema,
  type createSavedAnalysisInputSchema,
  type endSessionInputSchema,
  type startSessionInputSchema,
  type updateKeyLevelInputSchema,
  type updateSessionInputSchema,
  type EndSessionResponse,
  type KeyLevel,
  type KeyLevelsResponse,
  type SavedAnalysesResponse,
  type SavedAnalysis,
  type SavedAnalysisResponse,
  type SessionLiveStateResponse,
  type SessionSummary,
  type TradingSession,
  type TradingSessionResponse,
} from "../../shared/contracts";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { DisciplineRepository } from "../discipline/discipline.repository";
import { SessionRepository } from "../session/session.repository";
import { TradesRepository } from "../trades/trades.repository";
import { generateEcoEvents } from "../calendar/eco-calendar";
import { SessionLiveRepository, type SessionLiveRow } from "./session-live.repository";

const TRADING_ERROR = TRADE_ERROR_CODES;

// NOTE: EVENT_KINDS is reserved for the B9→B5/B6 bridges (note/level push
// events) — the values mirror the mock's SessionLiveEventKind union.

type StartSessionInput = z.infer<typeof startSessionInputSchema>;
type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;
type EndSessionInput = z.infer<typeof endSessionInputSchema>;
type CreateSavedAnalysisInput = z.infer<typeof createSavedAnalysisInputSchema>;
type CreateKeyLevelInput = z.infer<typeof createKeyLevelInputSchema>;
type UpdateKeyLevelInput = z.infer<typeof updateKeyLevelInputSchema>;

type SessionLiveEvent = TradingSession["events"][number];


@Injectable()
export class SessionLiveService {
  constructor(
    private readonly repository: SessionLiveRepository,
    private readonly trades: TradesRepository,
    private readonly discipline: DisciplineRepository,
    private readonly sessionNotes: SessionRepository,
  ) {}

  private nowIso(): string {
    return new Date().toISOString();
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private pushEvent(session: TradingSession, kind: SessionLiveEvent["kind"], label: string, detail: string | null): void {
    const event: SessionLiveEvent = {
      id: crypto.randomUUID(),
      at: this.nowIso(),
      kind,
      label,
      detail,
      source: null,
    };
    session.events.push(event);
    session.updatedAt = event.at;
  }

  private async activeSession(userId: string): Promise<TradingSession | null> {
    const rows = await this.repository.listByKind(userId, "SESSION");
    const active = rows.find((row) => (row.data as unknown as TradingSession).status === "ACTIVE");
    return active ? (active.data as unknown as TradingSession) : null;
  }

  // ── sessions ──────────────────────────────────────────────────────────────

  /** GET /session-live/sessions — active session + history (newest first). */
  async state(userId: string): Promise<SessionLiveStateResponse> {
    const rows = await this.repository.listByKind(userId, "SESSION");
    const sessions = rows.map((row) => row.data as unknown as TradingSession);
    const active = sessions.find((session) => session.status === "ACTIVE") ?? null;
    const history = sessions
      .filter((session) => session.status !== "ACTIVE")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { active, history };
  }

  /** POST /session-live/sessions — one active session at a time (409). */
  async startSession(userId: string, input: StartSessionInput): Promise<TradingSessionResponse> {
    const existing = await this.activeSession(userId);
    if (existing !== null) {
      throw new ConflictError(
        "A session is already active. End it before starting a new one.",
        TRADING_ERROR.INVALID_TRADE_STATE,
      );
    }
    const now = this.nowIso();
    const session: TradingSession = {
      id: crypto.randomUUID(),
      status: "ACTIVE",
      startedAt: now,
      endedAt: null,
      primarySymbol: input.primarySymbol ?? "—",
      primaryTimeframe: input.primaryTimeframe ?? "5m",
      tradingWindow: input.tradingWindow ?? "OTHER",
      strategyId: input.strategyId ?? null,
      setupId: input.setupId ?? null,
      marketBias: input.marketBias ?? "NEUTRAL",
      sessionObjective: input.sessionObjective ?? null,
      notes: input.notes ?? null,
      riskPerTradePct: input.riskPerTradePct ?? null,
      dailyRiskLimitPct: input.dailyRiskLimitPct ?? null,
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    this.pushEvent(
      session,
      "SESSION_STARTED",
      `Session started — ${session.primarySymbol} ${session.primaryTimeframe}`,
      session.sessionObjective,
    );
    await this.repository.insert(userId, "SESSION", session.id, session as unknown as never);
    return { session };
  }

  private async loadActiveSession(userId: string, sessionId: string): Promise<SessionLiveRow> {
    const row = await this.repository.findForUser(userId, "SESSION", sessionId);
    if (row === null) {
      throw new NotFoundError("Session not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const session = row.data as unknown as TradingSession;
    if (session.status !== "ACTIVE") {
      throw new ConflictError("Only the active session can be updated", TRADING_ERROR.INVALID_TRADE_STATE);
    }
    return row;
  }

  /** PATCH /session-live/sessions/:id — bias / objective / notes while active. */
  async updateSession(userId: string, sessionId: string, input: UpdateSessionInput): Promise<TradingSessionResponse> {
    const row = await this.loadActiveSession(userId, sessionId);
    const session = row.data as unknown as TradingSession;
    const biasChanged = input.marketBias !== undefined && input.marketBias !== session.marketBias;
    if (input.marketBias !== undefined) session.marketBias = input.marketBias;
    if (input.sessionObjective !== undefined) session.sessionObjective = input.sessionObjective;
    if (input.notes !== undefined) session.notes = input.notes;
    session.updatedAt = this.nowIso();
    if (biasChanged) {
      this.pushEvent(session, "BIAS_CHANGED", `Bias set to ${session.marketBias}`, null);
    }
    await this.repository.updateData(row.id, session as unknown as never);
    return { session };
  }

  /**
   * POST /session-live/sessions/:id/end — §43 summary: only metrics with
   * real data behind them (journal, discipline, eco, notes, analyses).
   */
  async endSession(userId: string, sessionId: string, input: EndSessionInput): Promise<EndSessionResponse> {
    const row = await this.loadActiveSession(userId, sessionId);
    const session = row.data as unknown as TradingSession;
    const endedAt = this.nowIso();
    session.endedAt = endedAt;
    session.status = "COMPLETED";
    if (input.notes !== undefined && input.notes !== null && input.notes.trim() !== "") {
      session.notes = input.notes;
    }
    session.updatedAt = endedAt;
    this.pushEvent(session, "SESSION_ENDED", "Session ended", null);

    // §43 — metrics supported by real data only.
    const [all, violations, noteRows, analysisRows] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.discipline.listByKind(userId, "VIOLATION"),
      this.sessionNotes.listNoteRows(userId),
      this.repository.listByKind(userId, "ANALYSIS"),
    ]);
    const inWindow = (at: string): boolean => at >= session.startedAt && at <= endedAt;
    const windowTrades = all.filter((trade) => inWindow(trade.entryAt.toISOString()));
    const closedWindow = windowTrades.filter(
      (trade) => trade.status === "CLOSED" && trade.exitAt !== null && inWindow(trade.exitAt.toISOString()),
    );
    const pnls = closedWindow
      .map((trade) => trade.pnlNet?.toNumber() ?? Number.NaN)
      .filter((value) => Number.isFinite(value));
    const rValues = closedWindow
      .map((trade) => (trade.rMultiple !== null ? trade.rMultiple.toNumber() : Number.NaN))
      .filter((value) => Number.isFinite(value));
    const markets = [
      ...new Set(await Promise.all(windowTrades.map((trade) => this.symbolOf(trade.instrumentId)))),
    ];
    if (markets.length === 0 && session.primarySymbol !== "—") markets.push(session.primarySymbol);
    const violationCount = violations.filter((violation) =>
      inWindow(String((violation.data as { occurredAt?: string })["occurredAt"] ?? "")),
    ).length;
    const ecoCount = generateEcoEvents(new Date()).filter((event) => inWindow(event.scheduledAt)).length;
    const notesCount = noteRows.filter((note) => inWindow(note.data.at)).length;
    const analysesCount = analysisRows.filter(
      (analysis) => (analysis.data as { sessionId?: string | null })["sessionId"] === session.id,
    ).length;

    const summary: SessionSummary = {
      durationMinutes: Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(session.startedAt)) / 60_000)),
      markets,
      tradeCount: windowTrades.length,
      netPnl: pnls.length > 0 ? this.round2(pnls.reduce((sum, value) => sum + value, 0)) : null,
      avgR: rValues.length > 0 ? this.round2(rValues.reduce((sum, value) => sum + value, 0) / rValues.length) : null,
      violationsCount: violationCount,
      ecoEventsCount: ecoCount,
      notesCount,
      analysesCount,
    };
    await this.repository.updateData(row.id, session as unknown as never);
    return { session, summary };
  }

  private async symbolOf(instrumentId: string): Promise<string> {
    const instrument = await this.trades.findInstrument(instrumentId);
    return instrument?.symbol ?? "?";
  }

  /** POST /session-live/sessions/:id/cancel */
  async cancelSession(userId: string, sessionId: string): Promise<TradingSessionResponse> {
    const row = await this.loadActiveSession(userId, sessionId);
    const session = row.data as unknown as TradingSession;
    session.endedAt = this.nowIso();
    session.status = "CANCELLED";
    session.updatedAt = session.endedAt;
    await this.repository.updateData(row.id, session as unknown as never);
    return { session };
  }

  // ── saved analyses ────────────────────────────────────────────────────────

  async listSavedAnalyses(userId: string): Promise<SavedAnalysesResponse> {
    const rows = await this.repository.listByKind(userId, "ANALYSIS");
    return {
      analyses: rows
        .map((row) => row.data as unknown as SavedAnalysis)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  async createSavedAnalysis(userId: string, input: CreateSavedAnalysisInput): Promise<SavedAnalysisResponse> {
    const now = this.nowIso();
    const analysis: SavedAnalysis = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId ?? null,
      symbol: input.symbol,
      timeframe: input.timeframe,
      createdAt: now,
      priceAtSave: input.priceAtSave ?? null,
      bias: input.bias,
      bullishScenario: input.bullishScenario ?? null,
      bearishScenario: input.bearishScenario ?? null,
      strategyId: input.strategyId ?? null,
      setupId: input.setupId ?? null,
      notes: input.notes ?? null,
      indicators: input.indicators ?? [],
      drawings: input.drawings ?? [],
      levels: input.levels ?? [],
    };
    await this.repository.insert(userId, "ANALYSIS", analysis.id, analysis as unknown as never);
    const session = await this.activeSession(userId);
    if (session !== null && input.sessionId === session.id) {
      this.pushEvent(
        session,
        "ANALYSIS_SAVED",
        `Analysis saved — ${analysis.symbol} ${analysis.timeframe}`,
        `Bias ${analysis.bias}`,
      );
      await this.repository.updateData(session.id, session as unknown as never);
    }
    return { analysis };
  }

  async deleteSavedAnalysis(userId: string, analysisId: string): Promise<{ ok: true }> {
    const row = await this.repository.findForUser(userId, "ANALYSIS", analysisId);
    if (row === null) {
      throw new NotFoundError("Analysis not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }

  // ── key levels ────────────────────────────────────────────────────────────

  async listKeyLevels(userId: string, symbol: string | null): Promise<KeyLevelsResponse> {
    const rows = await this.repository.listByKind(userId, "LEVEL");
    const levels = rows
      .map((row) => row.data as unknown as KeyLevel)
      .filter((level) => symbol === null || level.symbol === symbol)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { levels };
  }

  async createKeyLevel(userId: string, input: CreateKeyLevelInput): Promise<{ level: KeyLevel }> {
    const level: KeyLevel = {
      id: crypto.randomUUID(),
      symbol: input.symbol,
      kind: input.kind,
      price: input.price,
      note: input.note ?? null,
      createdAt: this.nowIso(),
    };
    await this.repository.insert(userId, "LEVEL", level.id, level as unknown as never);
    const session = await this.activeSession(userId);
    if (session !== null) {
      this.pushEvent(session, "LEVEL_ADDED", `Level ${level.kind} ${level.price} (${level.symbol})`, level.note);
      await this.repository.updateData(session.id, session as unknown as never);
    }
    return { level };
  }

  async updateKeyLevel(userId: string, levelId: string, input: UpdateKeyLevelInput): Promise<{ level: KeyLevel }> {
    const row = await this.repository.findForUser(userId, "LEVEL", levelId);
    if (row === null) {
      throw new NotFoundError("Level not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const level = row.data as unknown as KeyLevel;
    if (input.kind !== undefined) level.kind = input.kind;
    if (input.price !== undefined) level.price = input.price;
    if (input.note !== undefined) level.note = input.note;
    await this.repository.updateData(row.id, level as unknown as never);
    return { level };
  }

  async deleteKeyLevel(userId: string, levelId: string): Promise<{ ok: true }> {
    const row = await this.repository.findForUser(userId, "LEVEL", levelId);
    if (row === null) {
      throw new NotFoundError("Level not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteRow(row.id);
    return { ok: true };
  }
}
