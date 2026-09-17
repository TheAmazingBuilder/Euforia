import {
  computeRiskAmount,
  pnlForExit,
  toDecimalString,
  toTradingDateKey,
  type Account,
  type Alert,
  type AlertsResponse,
  type CloseTradeInput,
  type CreateSkippedTradeInput,
  type CreateTradeInput,
  type CreateTradeResponse,
  type DailyStat,
  type Instrument,
  type PlanUpdateInput,
  type PlanUpdateResponse,
  type PsychologyUpdateInput,
  type RevealPayload,
  type ReviewResponse,
  type Rule,
  type RulesStatusResponse,
  type SettleSkippedTradeInput,
  type SkippedTrade,
  type SkippedTradesResponse,
  type StatsOverviewResponse,
  type Strategy,
  type Trade,
  type TradeDecisionInput,
  type TradesListResponse,
  type TradeMistake,
  type TradeEvent,
} from "@cosmoz/shared";

import { buildFixtureData, USER_TZ, type FixtureData } from "./fixtures";

/**
 * In-memory mock backend. Initialized from the seeded fixtures; every
 * mutation updates the store so the UI reflects changes without a server.
 * Lives in browser memory for the page session — a full reload reseeds it.
 */

export class MockError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MockError";
    this.status = status;
  }
}

const round2 = (value: number): number => Number(value.toFixed(2));

export function createMockStore() {
  const data: FixtureData = buildFixtureData();
  /** Trade ids whose P&L is computed but still withheld (gate not passed). */
  const awaitingDecision = new Set<string>();
  /** Alerts generated while handling a given trade's mutations (V1 response channel). */
  const alertsByTrade = new Map<string, Alert[]>();
  const user = data.user;
  const mainAccount = data.accounts.find((a) => a.isDefault) ?? data.accounts[0]!;

  const instrumentById = new Map<string, Instrument>(data.instruments.map((i) => [i.id, i]));
  const mistakeById = new Map(data.mistakes.map((m) => [m.id, m]));

  const nowIso = (): string => new Date().toISOString();
  const todayKey = (): string => toTradingDateKey(nowIso(), USER_TZ);

  const closedTrades = (): Trade[] => data.trades.filter((t) => t.status === "CLOSED");
  const currentBalance = (): number =>
    Number(mainAccount.startingBalance) + closedTrades().reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);

  // ── Lists ────────────────────────────────────────────────────────────────

  function listTrades(query: { status?: string; graded?: string; accountId?: string }): TradesListResponse {
    let trades = [...data.trades];
    if (query.status) trades = trades.filter((t) => t.status === query.status);
    if (query.graded === "true") {
      trades = trades.filter((t) => t.decisionGrade !== null);
    } else if (query.graded === "false") {
      // The "to grade" queue: closed trades without a decision grade.
      trades = trades.filter((t) => t.status === "CLOSED" && t.decisionGrade === null);
    }
    if (query.accountId) trades = trades.filter((t) => t.accountId === query.accountId);
    trades.sort((a, b) => (b.exitAt ?? b.entryAt).localeCompare(a.exitAt ?? a.entryAt));
    return { trades, total: trades.length };
  }

  const listAccounts = (): Account[] => data.accounts;
  const listInstruments = (): Instrument[] => data.instruments;
  const listStrategies = (): Strategy[] => data.strategies;
  const listSkippedTrades = (): SkippedTradesResponse => ({
    skippedTrades: [...data.skippedTrades].sort((a, b) => b.seenAt.localeCompare(a.seenAt)),
  });

  function listAlerts(): AlertsResponse {
    const alerts = [...data.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unreadCount = alerts.filter((a) => a.readAt === null && a.dismissedAt === null).length;
    return { alerts, unreadCount };
  }

  // ── Trade creation & closing ─────────────────────────────────────────────

  function resolveSize(
    input: CreateTradeInput,
    entryPrice: number,
    initialStop: string | null,
  ): { quantity: string; riskAmount: string | null } {
    const contractSize = Number(instrumentById.get(input.instrumentId)?.contractSize ?? "1");
    const stopDistance = initialStop !== null ? Math.abs(entryPrice - Number(initialStop)) : null;
    const balance = currentBalance();

    if (input.size.mode === "quantity") {
      const quantity = input.size.quantity;
      const riskAmount = initialStop !== null
        ? (computeRiskAmount(String(entryPrice), initialStop, quantity, String(contractSize)) ?? null)
        : null;
      return { quantity, riskAmount };
    }
    const budget = input.size.mode === "risk_percent"
      ? (balance * Number(input.size.riskPercent)) / 100
      : Number(input.size.riskAmount);
    if (stopDistance !== null && stopDistance > 0) {
      const quantity = Math.max(0.01, Math.floor((budget / (stopDistance * contractSize)) * 100) / 100);
      return {
        quantity: toDecimalString(round2(quantity)),
        riskAmount: toDecimalString(round2(quantity * stopDistance * contractSize)),
      };
    }
    // Risk-based sizing without a stop: cannot size — minimal unit fallback.
    return { quantity: "0.01", riskAmount: toDecimalString(round2(budget)) };
  }

  function applyResults(trade: Trade): void {
    const instrument = instrumentById.get(trade.instrumentId);
    const contractSize = Number(instrument?.contractSize ?? "1");
    const entry = Number(trade.entryPrice);
    const gross = pnlForExit({
      entry: trade.entryPrice,
      exit: trade.exitPrice,
      direction: trade.direction,
      quantity: trade.quantity,
      contractSize: String(contractSize),
      fees: trade.fees,
      swap: trade.swap,
    });
    trade.pnlGross = gross === null ? null : toDecimalString(round2(Number(gross) + Number(trade.fees) + Number(trade.swap)));
    trade.pnlNet = gross === null ? null : toDecimalString(round2(Number(gross)));
    const risk = Number(trade.riskAmount ?? "0");
    trade.rMultiple = trade.pnlNet !== null && risk > 0
      ? toDecimalString(round2(Number(trade.pnlNet) / risk))
      : null;
    // MFE/MAE prices → R conversions.
    const stopDistance = trade.initialStop !== null ? Math.abs(entry - Number(trade.initialStop)) : null;
    const toR = (price: string | null): string | null =>
      price !== null && stopDistance !== null && stopDistance > 0
        ? toDecimalString(round2(Math.abs(Number(price) - entry) / stopDistance))
        : null;
    trade.mfeR = toR(trade.mfePrice);
    trade.maeR = toR(trade.maePrice);
  }

  function evaluateDiscipline(trade: Trade): void {
    const generated: Alert[] = [];
    const date = trade.tradingDate;
    const dayTrades = data.trades.filter((t) => t.tradingDate === date && t.status !== "CANCELLED");
    const dayLosses = dayTrades.filter((t) => t.status === "CLOSED" && (Number(t.pnlNet) ?? 0) < 0).length;
    const balance = currentBalance();

    for (const rule of data.rules) {
      if (!rule.isActive) continue;
      const params = rule.params as { limit?: number };
      const limit = typeof params.limit === "number" ? params.limit : null;
      if (limit === null) continue;

      let breached = false;
      let current = 0;
      if (rule.type === "MAX_TRADES_PER_DAY") {
        current = dayTrades.length;
        breached = current >= limit;
      } else if (rule.type === "MAX_LOSSES_PER_DAY") {
        current = dayLosses;
        breached = current >= limit;
      } else if (rule.type === "MAX_RISK_PCT_PER_TRADE") {
        const risk = Number(trade.riskAmount ?? "0");
        current = round2((risk / balance) * 100);
        breached = current > limit;
      }
      if (!breached) continue;

      const alreadyAlerted = data.alerts.some(
        (a) => a.tradeId === trade.id && (a.payload as { ruleId?: string } | null)?.ruleId === rule.id,
      );
      if (alreadyAlerted) continue;

      const alert: Alert = {
        id: crypto.randomUUID(),
        userId: trade.userId,
        type: "RULE_VIOLATION",
        severity: rule.severity,
        title: `${rule.type.replaceAll("_", " ").toLowerCase()} limit reached`,
        message: `Rule ${rule.type} (limit ${limit}) triggered at ${current}.`,
        payload: { ruleId: rule.id, limit, current },
        tradeId: trade.id,
        readAt: null,
        dismissedAt: null,
        createdAt: nowIso(),
      };
      data.alerts.push(alert);
      generated.push(alert);
    }
    if (generated.length > 0) {
      alertsByTrade.set(trade.id, [...(alertsByTrade.get(trade.id) ?? []), ...generated]);
    }
  }

  function refreshDailyStat(date: string): DailyStat {
    const dayTrades = data.trades.filter((t) => t.tradingDate === date && t.status === "CLOSED");
    const dayGhosts = data.skippedTrades.filter((g) => toTradingDateKey(g.seenAt, USER_TZ) === date);
    const dayMistakes = data.tradeMistakes.filter((m) => dayTrades.some((t) => t.id === m.tradeId)).length;
    const dayViolations = data.alerts.filter(
      (a) => a.tradeId !== null && dayTrades.some((t) => t.id === a.tradeId) && a.type === "RULE_VIOLATION",
    ).length;
    const savedR = dayGhosts
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_LOST")
      .reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR ?? "0")), 0);
    const hesitatedR = dayGhosts
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_WON")
      .reduce((sum, g) => sum + Number(g.hypotheticalR ?? "0"), 0);
    const graded = dayTrades.filter((t) => t.decisionGrade !== null);
    const followedPct = graded.length > 0
      ? graded.filter((t) => t.followedPlan === true).length / graded.length
      : null;
    const disciplineScore = followedPct === null
      ? null
      : round2(
          Math.max(0, Math.min(100,
            100 * (0.55 * followedPct
              + 0.25 * (1 - Math.min(1, dayMistakes / Math.max(1, dayTrades.length)))
              + 0.2 * (1 - Math.min(1, dayViolations / Math.max(1, dayTrades.length))))),
          ),
        );

    const existing = data.dailyStats.find((s) => s.date === date);
    const stat: DailyStat = {
      id: existing?.id ?? crypto.randomUUID(),
      userId: user.id,
      date,
      tradesCount: dayTrades.length,
      winsCount: dayTrades.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length,
      lossesCount: dayTrades.filter((t) => (Number(t.pnlNet) ?? 0) < 0).length,
      pnlNet: toDecimalString(round2(dayTrades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0))),
      rEarned: toDecimalString(round2(dayTrades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0))),
      disciplineScore: disciplineScore === null ? (existing?.disciplineScore ?? null) : toDecimalString(disciplineScore),
      mistakesCount: dayMistakes,
      violationsCount: dayViolations,
      ghostTradesCount: dayGhosts.length,
      savedR: savedR > 0 ? toDecimalString(round2(savedR)) : null,
      hesitatedR: hesitatedR > 0 ? toDecimalString(round2(hesitatedR)) : null,
      sleepHours: existing?.sleepHours ?? null,
      moodPre: existing?.moodPre ?? null,
    };
    if (existing) {
      Object.assign(existing, stat);
      return existing;
    }
    data.dailyStats.push(stat);
    return stat;
  }

  function createTrade(input: CreateTradeInput): CreateTradeResponse {
    const entryAt = input.entryAt ?? nowIso();
    const entryPrice = Number(input.entryPrice);
    const initialStop = input.initialStop ?? null;
    const { quantity, riskAmount } = resolveSize(input, entryPrice, initialStop);

    const trade: Trade = {
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
      status: input.variant === "open" ? "OPEN" : "CLOSED",
      direction: input.direction,
      entryPrice: input.entryPrice,
      entryAt,
      quantity,
      initialStop,
      initialTP: input.initialTP ?? null,
      plannedRR: input.plannedRR ?? null,
      riskAmount,
      finalStop: null,
      exitPrice: null,
      exitAt: null,
      exitReason: null,
      fees: input.fees ?? "0",
      swap: input.swap ?? "0",
      pnlGross: null,
      pnlNet: null,
      rMultiple: null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      emotionBefore: input.emotionBefore ?? null,
      emotionAfter: null,
      confidence: input.confidence ?? null,
      decisionGrade: null,
      followedPlan: null,
      checklistSnap: null,
      notes: input.reason ?? null,
      lessons: null,
      tradingDate: toTradingDateKey(entryAt, USER_TZ),
      externalRef: input.externalRef ?? null,
      importBatchId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    };

    if (input.variant === "closed") {
      trade.exitPrice = input.exitPrice;
      trade.exitAt = input.exitAt;
      trade.exitReason = input.exitReason;
      applyResults(trade);
    }
    data.trades.push(trade);
    evaluateDiscipline(trade);
    refreshDailyStat(trade.tradingDate);

    if (input.variant === "open") return trade;
    // HARD CONTRACT (trade-entry-ux.md §13): no P&L fields in this response.
    awaitingDecision.add(trade.id);
    return { id: trade.id, awaitingDecision: true };
  }

  function closeTrade(tradeId: string, input: CloseTradeInput): CreateTradeResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "OPEN") throw new MockError(409, "Trade is not open");

    if (input.mode === "single") {
      trade.exitPrice = input.exitPrice;
      trade.exitAt = input.exitAt;
      trade.exitReason = input.exitReason;
      if (input.fees !== undefined) trade.fees = input.fees;
      if (input.swap !== undefined) trade.swap = input.swap;
      trade.mfePrice = input.mfePrice ?? null;
      trade.maePrice = input.maePrice ?? null;
    } else {
      const totalQty = input.exits.reduce((sum, leg) => sum + Number(leg.quantity), 0);
      const weighted = input.exits.reduce((sum, leg) => sum + Number(leg.price) * Number(leg.quantity), 0);
      trade.exitPrice = totalQty > 0 ? toDecimalString(round2(weighted / totalQty)) : trade.entryPrice;
      trade.exitAt = input.exits[input.exits.length - 1]?.exitedAt ?? nowIso();
      trade.exitReason = input.exits[0]?.reason ?? "MANUAL";
      trade.quantity = toDecimalString(round2(totalQty));
      if (input.fees !== undefined) trade.fees = input.fees;
      if (input.swap !== undefined) trade.swap = input.swap;
      trade.mfePrice = input.mfePrice ?? null;
      trade.maePrice = input.maePrice ?? null;
    }
    trade.status = "CLOSED";
    trade.updatedAt = nowIso();
    applyResults(trade);
    evaluateDiscipline(trade);
    refreshDailyStat(trade.tradingDate);

    awaitingDecision.add(trade.id);
    return { id: trade.id, awaitingDecision: true };
  }

  // ── Decision gate & reveal ───────────────────────────────────────────────

  function decide(tradeId: string, input: TradeDecisionInput): RevealPayload {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "CLOSED") throw new MockError(409, "Trade is not closed");
    if (!awaitingDecision.has(tradeId)) throw new MockError(409, "Decision already submitted or not awaited");

    trade.decisionGrade = input.grade;
    trade.followedPlan = input.followedPlan;
    trade.updatedAt = nowIso();
    awaitingDecision.delete(tradeId);
    refreshDailyStat(trade.tradingDate);

    const win = (Number(trade.rMultiple) ?? 0) >= 0;
    const bucket = input.grade === "A" || input.grade === "B" ? "ab" : "df";
    const savedRToday = data.skippedTrades
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_LOST" && toTradingDateKey(g.seenAt, USER_TZ) === todayKey())
      .reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR ?? "0")), 0);

    return {
      tradeId: trade.id,
      pnlNet: trade.pnlNet ?? "0",
      rMultiple: trade.rMultiple ?? "0",
      durationSeconds: Math.max(0, Math.round((Date.parse(trade.exitAt ?? trade.entryAt) - Date.parse(trade.entryAt)) / 1000)),
      coachingKey: `${win ? "win" : "loss"}_${bucket}`,
      detectedMistakes: data.tradeMistakes
        .filter((m) => m.tradeId === trade.id)
        .map((m) => {
          const catalog = mistakeById.get(m.mistakeId);
          return {
            mistakeId: m.mistakeId,
            key: catalog?.key ?? "unknown",
            label: catalog?.label ?? "Unknown mistake",
            category: catalog?.category ?? "BEHAVIOR",
            detectedBy: m.detectedBy,
            userConfirmed: m.userConfirmed,
          };
        }),
      triggeredAlerts: (alertsByTrade.get(trade.id) ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
      })),
      savedRToday: toDecimalString(round2(savedRToday)),
    };
  }

  function getReview(tradeId: string): ReviewResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    const detectedMistakes = data.tradeMistakes
      .filter((m) => m.tradeId === tradeId)
      .map((m) => {
        const catalog = mistakeById.get(m.mistakeId);
        return {
          id: m.id,
          mistakeId: m.mistakeId,
          key: catalog?.key ?? "unknown",
          label: catalog?.label ?? "Unknown mistake",
          category: catalog?.category ?? "BEHAVIOR",
          detectedBy: m.detectedBy,
          userConfirmed: m.userConfirmed,
          note: m.note,
        };
      });
    return { trade, detectedMistakes };
  }

  function resolveMistake(tradeId: string, tradeMistakeId: string, confirmed: boolean) {
    const row: TradeMistake | undefined = data.tradeMistakes.find(
      (m) => m.id === tradeMistakeId && m.tradeId === tradeId,
    );
    if (!row) throw new MockError(404, "Trade mistake not found");
    row.userConfirmed = confirmed;
    row.note = row.note ?? null;
    const catalog = mistakeById.get(row.mistakeId);
    return {
      id: row.id,
      mistakeId: row.mistakeId,
      key: catalog?.key ?? "unknown",
      label: catalog?.label ?? "Unknown mistake",
      category: catalog?.category ?? "BEHAVIOR",
      detectedBy: row.detectedBy,
      userConfirmed: row.userConfirmed,
      note: row.note,
    };
  }

  // ── Open-trade mutations ─────────────────────────────────────────────────

  function updatePlan(tradeId: string, input: PlanUpdateInput): PlanUpdateResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "OPEN") throw new MockError(409, "Only open trades can be re-planned");

    let event: TradeEvent | null = null;
    if (input.stop !== undefined) {
      event = {
        id: crypto.randomUUID(),
        tradeId,
        type: "SL_MODIFIED",
        payload: { from: trade.finalStop ?? trade.initialStop, to: input.stop },
        source: "USER",
        createdAt: nowIso(),
      };
      data.tradeEvents.push(event);
      trade.finalStop = input.stop;
    }
    if (input.tp !== undefined) {
      const tpEvent: TradeEvent = {
        id: crypto.randomUUID(),
        tradeId,
        type: "TP_MODIFIED",
        payload: { from: trade.initialTP, to: input.tp },
        source: "USER",
        createdAt: nowIso(),
      };
      data.tradeEvents.push(tpEvent);
      trade.initialTP = input.tp;
      event = event ?? tpEvent;
    }
    trade.updatedAt = nowIso();
    return { trade, event: event! };
  }

  function updatePsychology(tradeId: string, input: PsychologyUpdateInput): Trade {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (input.emotionBefore !== undefined) trade.emotionBefore = input.emotionBefore;
    if (input.emotionAfter !== undefined) trade.emotionAfter = input.emotionAfter;
    if (input.confidence !== undefined) trade.confidence = input.confidence;
    trade.updatedAt = nowIso();
    return trade;
  }

  // ── Ghost trades ─────────────────────────────────────────────────────────

  function createSkippedTrade(input: CreateSkippedTradeInput): SkippedTrade {
    const seenAt = input.seenAt ?? nowIso();
    const ghost: SkippedTrade = {
      id: crypto.randomUUID(),
      userId: user.id,
      instrumentId: input.instrumentId,
      strategyId: input.strategyId ?? null,
      direction: input.direction ?? null,
      seenAt,
      reason: input.reason,
      outcomeGuess: null,
      hypotheticalR: null,
      notes: input.notes ?? null,
      createdAt: nowIso(),
    };
    data.skippedTrades.push(ghost);
    refreshDailyStat(toTradingDateKey(seenAt, USER_TZ));
    return ghost;
  }

  function settleSkippedTrade(skippedId: string, input: SettleSkippedTradeInput): SkippedTrade {
    const ghost = data.skippedTrades.find((g) => g.id === skippedId);
    if (!ghost) throw new MockError(404, "Skipped trade not found");
    ghost.outcomeGuess = input.outcomeGuess;
    ghost.hypotheticalR = input.hypotheticalR ?? null;
    refreshDailyStat(toTradingDateKey(ghost.seenAt, USER_TZ));
    return ghost;
  }

  // ── Discipline banner & analytics ────────────────────────────────────────

  function rulesStatus(accountId: string | null): RulesStatusResponse {
    const today = todayKey();
    const balance = currentBalance();
    const dayTrades = data.trades.filter(
      (t) => t.tradingDate === today && t.status !== "CANCELLED" && (accountId === null || t.accountId === accountId),
    );
    const dayClosed = dayTrades.filter((t) => t.status === "CLOSED");
    const tradesToday = dayTrades.length;
    const lossesToday = dayClosed.filter((t) => (Number(t.pnlNet) ?? 0) < 0).length;
    const riskCommitted = dayTrades.reduce((sum, t) => sum + Number(t.riskAmount ?? "0"), 0);
    const riskBudgetSpentPct = balance > 0 ? round2((riskCommitted / balance) * 100) : 0;

    const limits = data.rules
      .filter((r) => r.isActive)
      .map((r) => {
        const params = r.params as { limit?: number };
        const limit = typeof params.limit === "number" ? params.limit : 0;
        let current = 0;
        if (r.type === "MAX_TRADES_PER_DAY") current = tradesToday;
        else if (r.type === "MAX_LOSSES_PER_DAY") current = lossesToday;
        else if (r.type === "MAX_RISK_PCT_PER_TRADE") {
          current = round2(
            Math.max(0, ...dayTrades.map((t) => (Number(t.riskAmount ?? "0") / balance) * 100)),
          );
        }
        return { ruleId: r.id, type: r.type, severity: r.severity, limit: toDecimalString(limit), current: toDecimalString(round2(current)) };
      });

    return {
      date: today,
      accountId,
      tradesToday,
      lossesToday,
      riskBudgetSpentPct: toDecimalString(riskBudgetSpentPct),
      limits,
    };
  }

  function statsOverview(): StatsOverviewResponse {
    const closed = [...closedTrades()].sort(
      (a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt),
    );
    const netPnl = closed.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
    const wins = closed.filter((t) => (Number(t.pnlNet) ?? 0) > 0);
    const grossProfit = wins.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
    const grossLoss = Math.abs(closed.filter((t) => (Number(t.pnlNet) ?? 0) < 0).reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0));
    const winRate = closed.length > 0 ? wins.length / closed.length : 0;
    const expectancy = closed.length > 0
      ? closed.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / closed.length
      : 0;
    const scored = data.dailyStats.filter((s) => s.disciplineScore !== null);
    const disciplineScore = scored.length > 0
      ? round2(scored.reduce((sum, s) => sum + Number(s.disciplineScore), 0) / scored.length)
      : null;

    const byDay = new Map<string, { pnl: number; count: number }>();
    for (const trade of closed) {
      const entry = byDay.get(trade.tradingDate) ?? { pnl: 0, count: 0 };
      entry.pnl += Number(trade.pnlNet) ?? 0;
      entry.count += 1;
      byDay.set(trade.tradingDate, entry);
    }
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    let equity = Number(mainAccount.startingBalance);
    const equityCurve: StatsOverviewResponse["equityCurve"] = [];
    const dailyPnl: StatsOverviewResponse["dailyPnl"] = [];
    for (const [date, entry] of days) {
      equity += entry.pnl;
      equityCurve.push({ date, equity: toDecimalString(round2(equity)) });
      dailyPnl.push({ date, pnlNet: toDecimalString(round2(entry.pnl)), tradesCount: entry.count });
    }

    return {
      currency: mainAccount.currency,
      netPnl: toDecimalString(round2(netPnl)),
      winRate: toDecimalString(round2(winRate)),
      profitFactor: grossLoss > 0 ? toDecimalString(round2(grossProfit / grossLoss)) : null,
      expectancy: toDecimalString(round2(expectancy)),
      disciplineScore: disciplineScore === null ? null : toDecimalString(disciplineScore),
      equityCurve,
      dailyPnl,
    };
  }

  return {
    get data() { return data; },
    listTrades,
    listAccounts,
    listInstruments,
    listStrategies,
    listAlerts,
    listSkippedTrades,
    createTrade,
    closeTrade,
    decide,
    getReview,
    resolveMistake,
    updatePlan,
    updatePsychology,
    createSkippedTrade,
    settleSkippedTrade,
    rulesStatus,
    statsOverview,
  };
}

export type MockStore = ReturnType<typeof createMockStore>;

/** Browser-session singleton — handlers and fixtures share one store. */
export const mockStore: MockStore = createMockStore();
