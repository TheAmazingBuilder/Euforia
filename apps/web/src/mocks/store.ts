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
  type CreateTagInput,
  type CreateTradeInput,
  type CreateTradeResponse,
  type DailyStat,
  type Instrument,
  type NotesUpdateInput,
  type PlanUpdateInput,
  type PlanUpdateResponse,
  type PsychologyUpdateInput,
  type RevealPayload,
  type ReviewResponse,
  type ReviewUpdateInput,
  type ReviewUpdateResponse,
  type RulesStatusResponse,
  type SessionTimelineResponse,
  type SettleSkippedTradeInput,
  type SkippedTrade,
  type SkippedTradesResponse,
  type StatsOverviewResponse,
  type Strategy,
  type Tag,
  type TagsResponse,
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
  /** Alerts generated while handling a given trade's mutations (V1 response channel). */
  const alertsByTrade = new Map<string, Alert[]>();
  /** Trade ↔ tag join rows (tradeId → tagIds), Act 3 review. */
  const tradeTags = new Map<string, Set<string>>();
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
  const listTags = (): TagsResponse => ({ tags: [...data.tags] });

  /** POST /tags — inline tag creation (Act 3 reflect, capture details). */
  function createTag(input: CreateTagInput): Tag {
    const name = input.name.trim();
    if (name === "") throw new MockError(422, "Tag name is required");
    const category = input.category ?? "CUSTOM";
    const exists = data.tags.some(
      (tag) => tag.userId === user.id && tag.name.toLowerCase() === name.toLowerCase() && tag.category === category,
    );
    if (exists) throw new MockError(409, "Tag already exists");
    const tag: Tag = {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      category,
      color: null,
      parentId: null,
    };
    data.tags.push(tag);
    return tag;
  }
  const listSkippedTrades = (): SkippedTradesResponse => ({
    skippedTrades: [...data.skippedTrades].sort((a, b) => b.seenAt.localeCompare(a.seenAt)),
  });

  function listAlerts(): AlertsResponse {
    const alerts = [...data.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unreadCount = alerts.filter((a) => a.readAt === null && a.dismissedAt === null).length;
    return { alerts, unreadCount };
  }

  function markAlertRead(alertId: string): Alert {
    const alert = data.alerts.find((a) => a.id === alertId);
    if (!alert) throw new MockError(404, "Alert not found");
    if (alert.readAt === null) alert.readAt = nowIso();
    return alert;
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

    return { id: trade.id, awaitingDecision: true };
  }

  // ── Decision gate & reveal ───────────────────────────────────────────────

  function decide(tradeId: string, input: TradeDecisionInput): RevealPayload {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    if (trade.status !== "CLOSED") throw new MockError(409, "Trade is not closed");
    // Gradeable = closed and not yet graded (same definition as the "to grade"
    // queue). Derived from state, NOT from the in-session awaitingDecision set,
    // so "grade later from the queue" survives reloads (§5 graceful degradation).
    if (trade.decisionGrade !== null) {
      throw new MockError(409, "Decision already submitted");
    }

    trade.decisionGrade = input.grade;
    trade.followedPlan = input.followedPlan;
    trade.updatedAt = nowIso();
    refreshDailyStat(trade.tradingDate);

    const win = (Number(trade.rMultiple) ?? 0) >= 0;
    const bucket = input.grade === "A" || input.grade === "B" ? "ab" : "df";
    const avoidedToday = data.skippedTrades.filter(
      (g) =>
        g.outcomeGuess === "WOULD_HAVE_LOST" &&
        toTradingDateKey(g.seenAt, USER_TZ) === todayKey(),
    );
    const savedRToday = avoidedToday.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR ?? "0")), 0);

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
      savedSetupsToday: avoidedToday.length,
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
    const tagIds = [...(tradeTags.get(tradeId) ?? [])];
    return { trade, detectedMistakes, tagIds };
  }

  // ── Act 3 review persistence (PATCH /trades/:id/review) ──────────────────

  function updateReview(tradeId: string, input: ReviewUpdateInput): ReviewUpdateResponse {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");

    if (input.mfePrice !== undefined) trade.mfePrice = input.mfePrice;
    if (input.maePrice !== undefined) trade.maePrice = input.maePrice;
    if (input.lesson !== undefined) trade.lessons = input.lesson;
    if (input.tagIds !== undefined) {
      tradeTags.set(tradeId, new Set(input.tagIds));
    }
    // MFE/MAE price → R conversions are recomputed SERVER-side (§13).
    if (input.mfePrice !== undefined || input.maePrice !== undefined) {
      applyResults(trade);
    }
    trade.updatedAt = nowIso();
    return { trade };
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
    const byDayTrades = new Map<string, Trade[]>();
    for (const trade of closed) {
      const entry = byDay.get(trade.tradingDate) ?? { pnl: 0, count: 0 };
      entry.pnl += Number(trade.pnlNet) ?? 0;
      entry.count += 1;
      byDay.set(trade.tradingDate, entry);
      const list = byDayTrades.get(trade.tradingDate) ?? [];
      list.push(trade);
      byDayTrades.set(trade.tradingDate, list);
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

    // ── Peak & max drawdown (server-computed display chips) ──────────────────
    let runningPeak = Number(mainAccount.startingBalance);
    let maxDdPct = 0;
    for (const point of equityCurve) {
      const eq = Number(point.equity);
      if (eq > runningPeak) runningPeak = eq;
      if (runningPeak > 0) {
        const ddPct = ((eq - runningPeak) / runningPeak) * 100;
        if (ddPct < maxDdPct) maxDdPct = ddPct;
      }
    }
    const equityPeak = Math.max(runningPeak, Number(mainAccount.startingBalance));

    // ── Deltas vs the previous comparable period (last 14 trading days vs the
    // 14 before that) — all aggregates stay server-side, decimal strings out ─
    const shiftDateKey = (offsetDays: number): string => {
      const shifted = new Date();
      shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
      return toTradingDateKey(shifted.toISOString(), USER_TZ);
    };
    const currentStart = shiftDateKey(-13);
    const prevStart = shiftDateKey(-27);

    const aggregate = (trades: Trade[]) => {
      const count = trades.length;
      const winCount = trades.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
      const gp = trades
        .filter((t) => (Number(t.pnlNet) ?? 0) > 0)
        .reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
      const gl = Math.abs(
        trades
          .filter((t) => (Number(t.pnlNet) ?? 0) < 0)
          .reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0),
      );
      return {
        netPnl: trades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0),
        winRate: count > 0 ? (winCount / count) * 100 : null,
        profitFactor: gl > 0 ? gp / gl : null,
        expectancy: count > 0 ? trades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / count : null,
        hasData: count > 0,
      };
    };
    const cur = aggregate(closed.filter((t) => t.tradingDate >= currentStart));
    const prev = aggregate(
      closed.filter((t) => t.tradingDate >= prevStart && t.tradingDate < currentStart),
    );
    const avgDiscipline = (from: string, to: string): number | null => {
      const rows = data.dailyStats.filter(
        (s) => s.date >= from && s.date <= to && s.disciplineScore !== null,
      );
      if (rows.length === 0) return null;
      return rows.reduce((sum, s) => sum + Number(s.disciplineScore), 0) / rows.length;
    };
    const curDisc = avgDiscipline(currentStart, shiftDateKey(0));
    const prevDisc = avgDiscipline(prevStart, currentStart);

    const rawDelta = (current: number | null, previous: number | null): StatsOverviewResponse["deltas"]["winRate"] => {
      if (current === null || previous === null) return { value: null, direction: "FLAT" };
      const diff = round2(current - previous);
      return {
        value: toDecimalString(diff),
        direction: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT",
      };
    };
    const netPnlDelta: StatsOverviewResponse["deltas"]["netPnl"] =
      !cur.hasData || !prev.hasData || prev.netPnl === 0
        ? { value: null, direction: cur.netPnl > prev.netPnl && cur.hasData ? "UP" : "FLAT" }
        : rawDelta(cur.netPnl, prev.netPnl);

    // ── Per-KPI sparklines over the last 14 active days (rolling aggregates) ─
    const sparklines: StatsOverviewResponse["sparklines"] = {
      netPnl: [],
      winRate: [],
      profitFactor: [],
      expectancy: [],
      disciplineScore: [],
    };
    let cumPnl = 0;
    let cumWins = 0;
    let cumCount = 0;
    let cumR = 0;
    let cumGp = 0;
    let cumGl = 0;
    let cumDiscSum = 0;
    let cumDiscDays = 0;
    let lastPf: number | null = null;
    let lastDisc: number | null = null;
    for (const [date, entry] of days.slice(-14)) {
      const dayList = byDayTrades.get(date) ?? [];
      cumPnl += entry.pnl;
      cumCount += dayList.length;
      cumWins += dayList.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
      cumR += dayList.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0);
      cumGp += dayList
        .filter((t) => (Number(t.pnlNet) ?? 0) > 0)
        .reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0);
      cumGl += Math.abs(
        dayList
          .filter((t) => (Number(t.pnlNet) ?? 0) < 0)
          .reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0),
      );
      const disc = data.dailyStats.find((s) => s.date === date)?.disciplineScore ?? null;
      if (disc !== null) {
        cumDiscSum += Number(disc);
        cumDiscDays += 1;
        lastDisc = cumDiscSum / cumDiscDays;
      }
      if (cumGl > 0) lastPf = cumGp / cumGl;
      sparklines.netPnl.push(toDecimalString(round2(cumPnl)));
      sparklines.winRate.push(toDecimalString(round2(cumCount > 0 ? (cumWins / cumCount) * 100 : 0)));
      sparklines.profitFactor.push(toDecimalString(round2(lastPf ?? 0)));
      sparklines.expectancy.push(toDecimalString(round2(cumCount > 0 ? cumR / cumCount : 0)));
      sparklines.disciplineScore.push(toDecimalString(round2(lastDisc ?? 0)));
    }

    // ── Discipline Saved — settled would-have-lost ghost trades ─────────────
    const savedGhosts = data.skippedTrades.filter(
      (g) => g.outcomeGuess === "WOULD_HAVE_LOST" && g.hypotheticalR !== null,
    );
    const rSaved = savedGhosts.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR)), 0);

    // ── Hesitation Cost — settled would-have-won ghost trades (mirror) ──────
    const hesitantGhosts = data.skippedTrades.filter(
      (g) => g.outcomeGuess === "WOULD_HAVE_WON" && g.hypotheticalR !== null,
    );
    const rCost = hesitantGhosts.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR)), 0);

    // ── Ghost trend — fear vs discipline skip counts, last 30 days ─────────
    const trendDays = 30;
    const ghostTrend: StatsOverviewResponse["ghostTrend"] = [];
    for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
      const date = shiftDateKey(-offset);
      const dayGhosts = data.skippedTrades.filter(
        (g) => toTradingDateKey(g.seenAt, USER_TZ) === date,
      );
      ghostTrend.push({
        date,
        fear: dayGhosts.filter((g) => g.reason === "FEAR").length,
        discipline: dayGhosts.filter((g) => g.reason === "DISCIPLINE").length,
      });
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
      equityPeak: toDecimalString(round2(equityPeak)),
      maxDrawdownPct: toDecimalString(round2(maxDdPct)),
      deltas: {
        netPnl: netPnlDelta,
        winRate: rawDelta(cur.winRate, prev.winRate),
        profitFactor: rawDelta(cur.profitFactor, prev.profitFactor),
        expectancy: rawDelta(cur.expectancy, prev.expectancy),
        disciplineScore: rawDelta(curDisc, prevDisc),
      },
      sparklines,
      disciplineSaved: {
        rSaved: toDecimalString(round2(rSaved)),
        settledCount: savedGhosts.length,
      },
      hesitationCost: {
        rCost: toDecimalString(round2(rCost)),
        settledCount: hesitantGhosts.length,
      },
      ghostTrend,
    };
  }

  // ── Session Live (trade-entry-ux.md §9) ──────────────────────────────────

  /**
   * GET /session/timeline — today's events (entries, exits, SL/TP
   * modifications, alerts) + logged emotions, all assembled SERVER-SIDE for
   * the server's trading date. The client never derives "today".
   */
  function sessionTimeline(): SessionTimelineResponse {
    const today = todayKey();
    const symbolOf = (tradeId: string): string => {
      const trade = data.trades.find((t) => t.id === tradeId);
      return trade ? (instrumentById.get(trade.instrumentId)?.symbol ?? "?") : "?";
    };

    const events: SessionTimelineResponse["events"] = [];

    for (const trade of data.trades) {
      if (trade.tradingDate !== today) continue;
      const symbol = instrumentById.get(trade.instrumentId)?.symbol ?? "?";
      events.push({
        id: `entry-${trade.id}`,
        at: trade.entryAt,
        kind: "ENTRY",
        label: `${symbol} · ${trade.direction} opened`,
        detail: `${trade.quantity} @ ${trade.entryPrice}`,
        severity: null,
      });
      if (trade.status === "CLOSED" && trade.exitAt !== null) {
        events.push({
          id: `exit-${trade.id}`,
          at: trade.exitAt,
          kind: "EXIT",
          label: `${symbol} · ${trade.direction} closed`,
          detail: trade.exitReason !== null ? `Exit ${trade.exitReason}` : null,
          severity: null,
        });
      }
    }

    for (const event of data.tradeEvents) {
      if (toTradingDateKey(event.createdAt, USER_TZ) !== today) continue;
      if (event.type !== "SL_MODIFIED" && event.type !== "TP_MODIFIED") continue;
      const payload = event.payload as { from?: string; to?: string } | null;
      const from = typeof payload?.from === "string" ? payload.from : "?";
      const to = typeof payload?.to === "string" ? payload.to : "?";
      events.push({
        id: event.id,
        at: event.createdAt,
        kind: event.type,
        label: `${symbolOf(event.tradeId)} · ${event.type === "SL_MODIFIED" ? "stop" : "target"} modified`,
        detail: `${from} → ${to}`,
        severity: null,
      });
    }

    for (const alert of data.alerts) {
      if (toTradingDateKey(alert.createdAt, USER_TZ) !== today) continue;
      events.push({
        id: `alert-${alert.id}`,
        at: alert.createdAt,
        kind: "ALERT",
        label: alert.title,
        detail: alert.message,
        severity: alert.severity,
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    const moods: SessionTimelineResponse["moods"] = [];
    for (const trade of data.trades) {
      // Entry emotion: belongs to the trade's own trading day.
      if (trade.tradingDate === today && trade.emotionBefore !== null) {
        moods.push({
          at: trade.entryAt,
          emotion: trade.emotionBefore,
          phase: "BEFORE",
          tradeId: trade.id,
        });
      }
      // Exit / in-trade emotion: the TAP's day is what matters — an in-trade
      // quick-log on a trade opened yesterday is still today's event.
      if (trade.emotionAfter !== null) {
        const at = trade.status === "OPEN" ? trade.updatedAt : (trade.exitAt ?? trade.updatedAt);
        if (trade.status === "OPEN" ? toTradingDateKey(at, USER_TZ) === today : trade.tradingDate === today) {
          moods.push({ at, emotion: trade.emotionAfter, phase: "AFTER", tradeId: trade.id });
        }
      }
    }
    moods.sort((a, b) => a.at.localeCompare(b.at));

    return { date: today, events, moods };
  }

  /** PATCH /trades/:id/notes — session note icon quick-save. */
  function updateNotes(tradeId: string, input: NotesUpdateInput): Trade {
    const trade = data.trades.find((t) => t.id === tradeId);
    if (!trade) throw new MockError(404, "Trade not found");
    trade.notes = input.notes;
    trade.updatedAt = nowIso();
    return trade;
  }

  return {
    get data() { return data; },
    listTrades,
    listAccounts,
    listInstruments,
    listStrategies,
    listTags,
    listAlerts,
    markAlertRead,
    listSkippedTrades,
    createTrade,
    closeTrade,
    decide,
    getReview,
    updateReview,
    createTag,
    resolveMistake,
    updatePlan,
    updatePsychology,
    createSkippedTrade,
    settleSkippedTrade,
    rulesStatus,
    statsOverview,
    sessionTimeline,
    updateNotes,
  };
}

export type MockStore = ReturnType<typeof createMockStore>;

/** Browser-session singleton — handlers and fixtures share one store. */
export const mockStore: MockStore = createMockStore();
