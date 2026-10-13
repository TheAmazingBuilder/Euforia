import {
  computeReplayResult,
  computeRiskAmount,
  createReplayDecisionInputSchema,
  createReplayNoteInputSchema,
  createReplaySessionInputSchema,
  pnlForExit,
  toDecimalString,
  type Account,
  type AdvanceReplayInput,
  type CloseReplayTradeInput,
  type CreateReplayDecisionInput,
  type CreateReplayNoteInput,
  type CreateReplaySessionInput,
  type CreateReplayTradeInput,
  type Instrument,
  type ReplayDecision,
  type ReplayDetailResponse,
  type ReplayNote,
  type ReplayOverviewResponse,
  type ReplaySession,
  type ReplaySessionsResponse,
  type ReplaySessionResponse,
  type ReplayTrade,
  type Setup,
  type Strategy,
  type UpdateReplaySessionInput,
} from "@cosmoz/shared";

import { MockError } from "@/mocks/store";

/**
 * Replay mock state (browser singleton) — mirrors the NestJS ReplayService
 * rule for rule (REPLAY MASTER PROMPT): ownership-scoped lookups (foreign
 * ids → 404), context-reference validation (§35), replay-clock clamping
 * into the historical window, authoritative simulated-trade math via the
 * shared risk helpers, and §30-honest result computation. NO execution
 * path exists — this module cannot reach a broker.
 */

export interface ReplayStoreDeps {
  userId: string;
  instruments: Instrument[];
  strategies: Strategy[];
  setups: Setup[];
  accounts: Account[];
  nowIso: () => string;
}

/** Four hours of 15-minute buckets ending at `endMs` — seed window helper. */
function windowEnding(endMs: number, spanMs: number): { fromMs: number; toMs: number } {
  return { fromMs: endMs - spanMs, toMs: endMs };
}

function uuid(): string {
  return crypto.randomUUID();
}

export function createReplayStore(deps: ReplayStoreDeps) {
  const { userId, instruments, strategies, setups, accounts, nowIso } = deps;

  const sessions: ReplaySession[] = [];
  const trades: ReplayTrade[] = [];
  const decisions: ReplayDecision[] = [];
  const notes: ReplayNote[] = [];

  // ── Seed — three sessions in distinct lifecycle states ──────────────────────
  // Historical windows sit in the recent past so the market service can
  // serve them (SIM materialized walks or Binance history alike).

  const nowMs = Date.now();
  const hourMs = 3_600_000;
  const yesterdayEnd = Math.floor((nowMs - 24 * hourMs) / (15 * 60_000)) * (15 * 60_000);
  const strategy = strategies[0] ?? null;
  const setup = strategy ? setups.find((item) => item.strategyId === strategy.id) ?? null : null;

  function seedSession(params: {
    symbol: string;
    interval: ReplaySession["config"]["interval"];
    status: ReplaySession["status"];
    fromMs: number;
    toMs: number;
    startAtMs: number;
    currentMs: number;
    playbackState: ReplaySession["playbackState"];
    withStrategy: boolean;
    ageDays: number;
  }): ReplaySession {
    const createdAt = new Date(nowMs - params.ageDays * 24 * hourMs).toISOString();
    return {
      id: uuid(),
      status: params.status,
      config: {
        symbol: params.symbol,
        interval: params.interval,
        fromMs: params.fromMs,
        toMs: params.toMs,
        startAtMs: params.startAtMs,
        strategyId: params.withStrategy && strategy ? strategy.id : null,
        setupId: params.withStrategy && setup ? setup.id : null,
        tradingAccountId: accounts[0]?.id ?? null,
        startingBalance: "10000",
        riskPerTradePct: 1,
      },
      currentMs: params.currentMs,
      playbackState: params.playbackState,
      lastPlayedAt: params.status === "DRAFT" ? null : new Date(nowMs - params.ageDays * 24 * hourMs + hourMs).toISOString(),
      counts: { trades: 0, decisions: 0, notes: 0 },
      result: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  const completedWindow = windowEnding(yesterdayEnd, 4 * hourMs);
  const completed = seedSession({
    symbol: "EURUSD",
    interval: "15m",
    status: "COMPLETED",
    ...completedWindow,
    startAtMs: completedWindow.fromMs + 30 * 60_000,
    currentMs: completedWindow.toMs,
    playbackState: "COMPLETED",
    withStrategy: true,
    ageDays: 3,
  });
  completed.result = computeReplayResult([], { decisions: 0, notes: 0, durationMs: 0 });
  sessions.push(completed);

  const progressWindow = windowEnding(nowMs - 3 * hourMs, 3 * hourMs);
  sessions.push(
    seedSession({
      symbol: "XAUUSD",
      interval: "5m",
      status: "IN_PROGRESS",
      ...progressWindow,
      startAtMs: progressWindow.fromMs + 15 * 60_000,
      currentMs: progressWindow.fromMs + 90 * 60_000,
      playbackState: "PAUSED",
      withStrategy: false,
      ageDays: 1,
    }),
  );

  const draftWindow = windowEnding(nowMs - 2 * hourMs, 2 * hourMs);
  sessions.push(
    seedSession({
      symbol: "BTCUSDT",
      interval: "15m",
      status: "DRAFT",
      ...draftWindow,
      startAtMs: draftWindow.fromMs,
      currentMs: draftWindow.fromMs,
      playbackState: "READY",
      withStrategy: false,
      ageDays: 0,
    }),
  );

  // Seeded simulated trades on the COMPLETED session — realistic result data.
  const eurusd = instruments.find((instrument) => instrument.symbol === "EURUSD") ?? instruments[0];
  if (eurusd) {
    const contractSize = eurusd.contractSize;
    const entry = completedWindow.fromMs + 60 * 60_000;
    const settled: Array<{ direction: "BUY" | "SELL"; entry: number; exit: number; stop: number; target: number; at: number }> = [
      { direction: "BUY", entry: 1.0862, exit: 1.0892, stop: 1.0847, target: 1.0907, at: entry },
      { direction: "SELL", entry: 1.0881, exit: 1.0901, stop: 1.0866, target: 1.0841, at: entry + 45 * 60_000 },
      { direction: "BUY", entry: 1.087, exit: 1.0895, stop: 1.0855, target: 1.0901, at: entry + 105 * 60_000 },
    ];
    for (const leg of settled) {
      const riskAmount = computeRiskAmount(String(leg.entry), String(leg.stop), "0.5", contractSize);
      const pnl = pnlForExit({
        entry: String(leg.entry),
        exit: String(leg.exit),
        direction: leg.direction,
        quantity: "0.5",
        contractSize,
      });
      trades.push({
        id: uuid(),
        sessionId: completed.id,
        symbol: "EURUSD",
        direction: leg.direction,
        entryPrice: toDecimalString(leg.entry),
        stopLoss: toDecimalString(leg.stop),
        takeProfit: toDecimalString(leg.target),
        quantity: "0.5",
        riskAmount,
        note: null,
        openedAtMs: leg.at,
        closedAtMs: leg.at + 30 * 60_000,
        exitPrice: toDecimalString(leg.exit),
        pnl,
        rMultiple:
          riskAmount !== null && pnl !== null && Number(riskAmount) !== 0
            ? toDecimalString(Number(pnl) / Number(riskAmount))
            : null,
      });
    }
    completed.counts.trades = 3;
    completed.result = computeReplayResult(
      trades.map((trade) => ({ pnl: trade.pnl, rMultiple: trade.rMultiple, riskAmount: trade.riskAmount, closedAtMs: trade.closedAtMs })),
      {
        decisions: 4,
        notes: 2,
        durationMs: completedWindow.toMs - completed.config.startAtMs,
      },
    );
    decisions.push(
      { id: uuid(), sessionId: completed.id, kind: "ENTER", atMs: entry, note: "Breakout retest confirmed.", strategyId: completed.config.strategyId, setupId: completed.config.setupId },
      { id: uuid(), sessionId: completed.id, kind: "WAIT", atMs: entry + 20 * 60_000, note: "Spread widened — standing aside.", strategyId: null, setupId: null },
      { id: uuid(), sessionId: completed.id, kind: "MOVE_STOP", atMs: entry + 50 * 60_000, note: "Stop to breakeven.", strategyId: null, setupId: null },
      { id: uuid(), sessionId: completed.id, kind: "EXIT", atMs: entry + 110 * 60_000, note: "Target reached, trailing exit.", strategyId: null, setupId: null },
    );
    completed.counts.decisions = 4;
    notes.push(
      { id: uuid(), sessionId: completed.id, atMs: entry + 5 * 60_000, body: "Price rejected the previous high; watching for confirmation on the retest." },
      { id: uuid(), sessionId: completed.id, atMs: entry + 100 * 60_000, body: "Clean trend day — stayed patient and let the runner work." },
    );
    completed.counts.notes = 2;
  }

  // One open simulation on the IN_PROGRESS session.
  const inProgress = sessions[1]!;
  const xauusd = instruments.find((instrument) => instrument.symbol === "XAUUSD");
  if (xauusd) {
    const openEntry = progressWindow.fromMs + 45 * 60_000;
    trades.push({
      id: uuid(),
      sessionId: inProgress.id,
      symbol: "XAUUSD",
      direction: "BUY",
      entryPrice: toDecimalString(2381.4),
      stopLoss: toDecimalString(2377.2),
      takeProfit: toDecimalString(2391.2),
      quantity: "0.2",
      riskAmount: computeRiskAmount("2381.4", "2377.2", "0.2", xauusd.contractSize),
      note: "London sweep long.",
      openedAtMs: openEntry,
      closedAtMs: null,
      exitPrice: null,
      pnl: null,
      rMultiple: null,
    });
    inProgress.counts.trades = 1;
    decisions.push({
      id: uuid(),
      sessionId: inProgress.id,
      kind: "ENTER",
      atMs: openEntry - 5 * 60_000,
      note: null,
      strategyId: null,
      setupId: null,
    });
    inProgress.counts.decisions = 1;
    notes.push({
      id: uuid(),
      sessionId: inProgress.id,
      atMs: openEntry + 10 * 60_000,
      body: "Holding above the VWAP band — thesis intact while the low holds.",
    });
    inProgress.counts.notes = 1;
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  function failNotFound(): never {
    throw new MockError(404, "Replay session not found");
  }

  function sessionForUser(sessionId: string): ReplaySession {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) failNotFound();
    return session;
  }

  function assertWritable(session: ReplaySession): void {
    if (session.status === "ARCHIVED") {
      throw new MockError(409, "This replay is archived — records can no longer change.");
    }
  }

  function clampToWindow(session: ReplaySession, ms: number): number {
    return Math.min(Math.max(ms, session.config.fromMs), session.config.toMs - 1);
  }

  function instrumentFor(symbol: string): Instrument | null {
    return instruments.find((item) => item.symbol === symbol) ?? null;
  }

  /** §35 — attached context must belong to the same user (mock mirror). */
  function assertContextOwnership(refs: {
    strategyId?: string | null;
    setupId?: string | null;
    tradingAccountId?: string | null;
  }): void {
    if (refs.strategyId && !strategies.some((item) => item.id === refs.strategyId)) {
      throw new MockError(404, "Strategy not found for this account");
    }
    if (refs.setupId && !setups.some((item) => item.id === refs.setupId)) {
      throw new MockError(404, "Setup not found for this account");
    }
    // Journal account ids are the trading-runtime ids (the connectivity
    // engine seeds one runtime view per journal account) — checking the
    // fixture list here avoids a store⇄engine circular import.
    if (refs.tradingAccountId && !accounts.some((item) => item.id === refs.tradingAccountId)) {
      throw new MockError(404, "Trading account not found for this account");
    }
  }

  function recomputeResult(session: ReplaySession): void {
    const own = trades.filter((trade) => trade.sessionId === session.id);
    const ownDecisions = decisions.filter((decision) => decision.sessionId === session.id);
    const ownNotes = notes.filter((note) => note.sessionId === session.id);
    session.counts = {
      trades: own.length,
      decisions: ownDecisions.length,
      notes: ownNotes.length,
    };
    session.result =
      session.status === "COMPLETED"
        ? computeReplayResult(
            own.map((trade) => ({ pnl: trade.pnl, rMultiple: trade.rMultiple, riskAmount: trade.riskAmount, closedAtMs: trade.closedAtMs })),
            {
              decisions: ownDecisions.length,
              notes: ownNotes.length,
              durationMs: Math.max(session.currentMs - session.config.startAtMs, 0),
            },
          )
        : session.result;
    session.updatedAt = nowIso();
  }

  function sorted<T>(items: T[], key: (item: T) => number): T[] {
    return [...items].sort((a, b) => key(a) - key(b));
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  function replayOverview(): ReplayOverviewResponse {
    const completedSessions = sessions.filter((session) => session.status === "COMPLETED");
    const winRates = completedSessions
      .map((session) => session.result?.winRatePct)
      .filter((value): value is number => value !== null);
    let best: ReplaySession | null = null;
    for (const session of completedSessions) {
      const pnl = session.result?.netPnl;
      if (pnl === null || pnl === undefined) continue;
      if (best === null || pnl > (best.result?.netPnl ?? -Infinity)) best = session;
    }
    return {
      total: sessions.filter((session) => session.status !== "ARCHIVED").length,
      completed: completedSessions.length,
      inProgress: sessions.filter((session) => session.status === "IN_PROGRESS").length,
      simulatedTrades: sessions.reduce((sum, session) => sum + session.counts.trades, 0),
      avgWinRatePct:
        winRates.length > 0 ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : null,
      bestSessionId: best?.id ?? null,
      bestSessionNetPnl: best?.result?.netPnl ?? null,
    };
  }

  function replaySessions(): ReplaySessionsResponse {
    return { sessions: [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  }

  function replayCreateSession(input: CreateReplaySessionInput): ReplaySessionResponse {
    createReplaySessionInputSchema.parse(input);
    assertContextOwnership(input);
    const now = nowIso();
    const startAtMs = input.startAtMs ?? input.fromMs;
    const session: ReplaySession = {
      id: uuid(),
      status: "DRAFT",
      config: {
        symbol: input.symbol,
        interval: input.interval,
        fromMs: input.fromMs,
        toMs: input.toMs,
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
    sessions.push(session);
    return { session };
  }

  function replayDetail(sessionId: string): ReplayDetailResponse {
    const session = sessionForUser(sessionId);
    return {
      session,
      trades: sorted(
        trades.filter((trade) => trade.sessionId === sessionId),
        (trade) => trade.openedAtMs,
      ),
      decisions: sorted(
        decisions.filter((decision) => decision.sessionId === sessionId),
        (decision) => decision.atMs,
      ),
      notes: sorted(
        notes.filter((note) => note.sessionId === sessionId),
        (note) => note.atMs,
      ),
    };
  }

  function replayUpdateSession(sessionId: string, input: UpdateReplaySessionInput): ReplaySessionResponse {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    assertContextOwnership(input);
    if (input.strategyId !== undefined) session.config.strategyId = input.strategyId;
    if (input.setupId !== undefined) session.config.setupId = input.setupId;
    session.updatedAt = nowIso();
    return { session };
  }

  function replayAdvance(sessionId: string, input: AdvanceReplayInput): ReplaySessionResponse {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    if (session.status === "COMPLETED") {
      throw new MockError(409, "This replay is already completed.");
    }
    session.status = "IN_PROGRESS";
    session.currentMs = Math.min(Math.max(input.currentMs, session.config.startAtMs), session.config.toMs);
    session.playbackState = input.playbackState;
    session.lastPlayedAt = nowIso();
    session.updatedAt = nowIso();
    return { session };
  }

  function replayComplete(sessionId: string): ReplaySessionResponse {
    const session = sessionForUser(sessionId);
    if (session.status === "COMPLETED") return { session };
    if (session.status === "ARCHIVED") {
      throw new MockError(409, "Archived replays cannot be completed.");
    }
    session.status = "COMPLETED";
    session.playbackState = "COMPLETED";
    session.currentMs = session.config.toMs;
    recomputeResult(session);
    return { session };
  }

  function replayArchive(sessionId: string): ReplaySessionResponse {
    const session = sessionForUser(sessionId);
    session.status = "ARCHIVED";
    session.updatedAt = nowIso();
    return { session };
  }

  function replayDeleteSession(sessionId: string): { ok: true } {
    const session = sessionForUser(sessionId);
    sessions.splice(sessions.indexOf(session), 1);
    for (let index = trades.length - 1; index >= 0; index -= 1) {
      if (trades[index]!.sessionId === sessionId) trades.splice(index, 1);
    }
    for (let index = decisions.length - 1; index >= 0; index -= 1) {
      if (decisions[index]!.sessionId === sessionId) decisions.splice(index, 1);
    }
    for (let index = notes.length - 1; index >= 0; index -= 1) {
      if (notes[index]!.sessionId === sessionId) notes.splice(index, 1);
    }
    return { ok: true };
  }

  // ── Simulated trades ────────────────────────────────────────────────────────

  function replayCreateTrade(sessionId: string, input: CreateReplayTradeInput): { trade: ReplayTrade } {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const instrument = instrumentFor(session.config.symbol);
    const contractSize = instrument?.contractSize ?? "1";
    const riskAmount =
      input.stopLoss != null
        ? computeRiskAmount(input.entryPrice, input.stopLoss, input.quantity, contractSize)
        : null;
    const trade: ReplayTrade = {
      id: uuid(),
      sessionId,
      symbol: session.config.symbol,
      direction: input.direction,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      quantity: input.quantity,
      riskAmount,
      note: input.note ?? null,
      openedAtMs: clampToWindow(session, input.openedAtMs ?? session.currentMs),
      closedAtMs: null,
      exitPrice: null,
      pnl: null,
      rMultiple: null,
    };
    trades.push(trade);
    session.counts.trades += 1;
    session.updatedAt = nowIso();
    return { trade };
  }

  function replayCloseTrade(sessionId: string, tradeId: string, input: CloseReplayTradeInput): { trade: ReplayTrade } {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const trade = trades.find((item) => item.id === tradeId && item.sessionId === sessionId);
    if (!trade) throw new MockError(404, "Replay trade not found");
    if (trade.closedAtMs !== null) {
      throw new MockError(409, "This simulated trade is already closed.");
    }
    const instrument = instrumentFor(session.config.symbol);
    const pnl = pnlForExit({
      entry: trade.entryPrice,
      exit: input.exitPrice,
      direction: trade.direction,
      quantity: trade.quantity,
      contractSize: instrument?.contractSize ?? "1",
    });
    if (pnl === null) throw new MockError(422, "Exit price is not valid for this simulated trade.");
    trade.closedAtMs = clampToWindow(session, input.closedAtMs ?? session.currentMs);
    trade.exitPrice = input.exitPrice;
    trade.pnl = pnl;
    trade.rMultiple =
      trade.riskAmount !== null && Number(trade.riskAmount) !== 0
        ? toDecimalString(Number(pnl) / Number(trade.riskAmount))
        : null;
    if (input.note !== undefined && input.note !== null) trade.note = input.note;
    session.updatedAt = nowIso();
    if (session.status === "COMPLETED") recomputeResult(session);
    return { trade };
  }

  function replayDeleteTrade(sessionId: string, tradeId: string): { ok: true } {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const index = trades.findIndex((item) => item.id === tradeId && item.sessionId === sessionId);
    if (index === -1) throw new MockError(404, "Replay trade not found");
    trades.splice(index, 1);
    session.counts.trades = Math.max(0, session.counts.trades - 1);
    if (session.status === "COMPLETED") recomputeResult(session);
    return { ok: true };
  }

  // ── Decisions & notes ───────────────────────────────────────────────────────

  function replayCreateDecision(sessionId: string, input: CreateReplayDecisionInput): { decision: ReplayDecision } {
    createReplayDecisionInputSchema.parse(input);
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const decision: ReplayDecision = {
      id: uuid(),
      sessionId,
      kind: input.kind,
      atMs: clampToWindow(session, input.atMs ?? session.currentMs),
      note: input.note ?? null,
      strategyId: input.strategyId ?? session.config.strategyId,
      setupId: input.setupId ?? session.config.setupId,
    };
    decisions.push(decision);
    session.counts.decisions += 1;
    session.updatedAt = nowIso();
    return { decision };
  }

  function replayDeleteDecision(sessionId: string, decisionId: string): { ok: true } {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const index = decisions.findIndex((item) => item.id === decisionId && item.sessionId === sessionId);
    if (index === -1) throw new MockError(404, "Replay decision not found");
    decisions.splice(index, 1);
    session.counts.decisions = Math.max(0, session.counts.decisions - 1);
    if (session.status === "COMPLETED") recomputeResult(session);
    return { ok: true };
  }

  function replayCreateNote(sessionId: string, input: CreateReplayNoteInput): { note: ReplayNote } {
    createReplayNoteInputSchema.parse(input);
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const note: ReplayNote = {
      id: uuid(),
      sessionId,
      atMs: clampToWindow(session, input.atMs ?? session.currentMs),
      body: input.body,
    };
    notes.push(note);
    session.counts.notes += 1;
    session.updatedAt = nowIso();
    return { note };
  }

  function replayDeleteNote(sessionId: string, noteId: string): { ok: true } {
    const session = sessionForUser(sessionId);
    assertWritable(session);
    const index = notes.findIndex((item) => item.id === noteId && item.sessionId === sessionId);
    if (index === -1) throw new MockError(404, "Replay note not found");
    notes.splice(index, 1);
    session.counts.notes = Math.max(0, session.counts.notes - 1);
    if (session.status === "COMPLETED") recomputeResult(session);
    return { ok: true };
  }

  void userId; // the mock is single-user; the real service scopes every lookup

  return {
    replayOverview,
    replaySessions,
    replayCreateSession,
    replayDetail,
    replayUpdateSession,
    replayAdvance,
    replayComplete,
    replayArchive,
    replayDeleteSession,
    replayCreateTrade,
    replayCloseTrade,
    replayDeleteTrade,
    replayCreateDecision,
    replayDeleteDecision,
    replayCreateNote,
    replayDeleteNote,
  };
}

export type ReplayMockStore = ReturnType<typeof createReplayStore>;
