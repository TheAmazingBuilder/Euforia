
// ── Coach weekly report (GET /coach/weekly-report) ───────────────────────────

function coachWeeklyReport(): CoachWeeklyReportResponse {
  const todayKey = toTradingDateKey(new Date().toISOString(), USER_TZ);
  const weekStart = mondayOf(todayKey);
  const startMs = Date.parse(`${weekStart}T00:00:00Z`);
  const weekEnd = iso(startMs + 6 * DAY_MS).slice(0, 10);
  const inWeek = closedTrades().filter((t) => {
    const ts = Date.parse(`${t.tradingDate}T00:00:00Z`);
    return ts >= startMs && ts < startMs + 7 * DAY_MS;
  });
  const netPnl = inWeek.reduce((s, t) => s + num(t.pnlNet), 0);
  const netR = inWeek.reduce((s, t) => s + num(t.rMultiple), 0);

  const decision = (trade: Trade, reason: string): CoachDecision => ({
    tradeId: trade.id,
    symbol: symbolOf(trade),
    date: trade.tradingDate,
    r: trade.rMultiple ?? "0",
    grade: trade.decisionGrade,
    reason,
  });
  const bestSorted = [...inWeek].sort((a, b) => num(b.rMultiple) - num(a.rMultiple));
  const worstSorted = [...inWeek].sort((a, b) => num(a.rMultiple) - num(b.rMultiple));

  const thisWeekStats = data.dailyStats.filter((s) => {
    const ts = Date.parse(`${s.date}T00:00:00Z`);
    return ts >= startMs && ts < startMs + 7 * DAY_MS;
  });
  const prevStartMs = startMs - 7 * DAY_MS;
  const prevWeekStats = data.dailyStats.filter((s) => {
    const ts = Date.parse(`${s.date}T00:00:00Z`);
    return ts >= prevStartMs && ts < prevStartMs + 7 * DAY_MS;
  });
  const avgDiscipline = (rows: DailyStat[]): number | null => {
    const scored = rows.filter((s) => s.disciplineScore !== null);
    return scored.length > 0 ? scored.reduce((sum, s) => sum + num(s.disciplineScore), 0) / scored.length : null;
  };
  const discipline = avgDiscipline(thisWeekStats);
  const disciplinePrev = avgDiscipline(prevWeekStats);

  const violationsThisWeek = data.ruleViolations.filter((v) => {
    const ts = Date.parse(`${toTradingDateKey(v.createdAt, USER_TZ)}T00:00:00Z`);
    return ts >= startMs && ts < startMs + 7 * DAY_MS;
  }).length;
  const journalDays = journalEntries.filter((entry) => {
    const ts = Date.parse(`${entry.date}T00:00:00Z`);
    return ts >= startMs && ts < startMs + 7 * DAY_MS;
  }).length;

  const followedPlan = inWeek.filter((t) => t.followedPlan === true).length;
  const adherencePct = inWeek.length > 0 ? (followedPlan / inWeek.length) * 100 : null;

  const cleanDays = data.dailyStats.filter((s) => s.violationsCount === 0 && s.tradesCount > 0).length;
  const streaks: DisciplineStreak[] = [
    { key: "clean_days", label: "Clean days", current: Math.min(cleanDays, 7), best: Math.max(cleanDays, 12), n: data.dailyStats.filter((s) => s.tradesCount > 0).length },
    { key: "journaling", label: "Journaling", current: journalDays, best: Math.max(journalDays, 14), n: data.dailyStats.filter((s) => s.tradesCount > 0).length },
    { key: "grading", label: "Same-day grading", current: inWeek.filter((t) => t.decisionGrade !== null).length, best: 21, n: inWeek.length },
    { key: "checklist", label: "Checklist run", current: followedPlan, best: 18, n: inWeek.length },
  ];

  const focus =
    violationsThisWeek > 0
      ? { title: "Stop the rule breaks", message: `You triggered ${violationsThisWeek} violation${violationsThisWeek === 1 ? "" : "s"} this week. Cap the day after the first one.`, metricLabel: "Violations", metricValue: String(violationsThisWeek) }
      : worstSorted.length > 0 && num(worstSorted[0]!.rMultiple) < -1
        ? { title: "Shrink the worst loss", message: `The ${symbolOf(worstSorted[0]!)} trade cost ${worstSorted[0]!.rMultiple}R. Halve the size when the setup is B-grade.`, metricLabel: "Worst R", metricValue: worstSorted[0]!.rMultiple }
        : { title: "Protect the streak", message: "The process is intact — keep grading every trade the same evening.", metricLabel: "Clean days", metricValue: String(Math.min(cleanDays, 7)) };

  return {
    weekStart,
    weekEnd,
    closedCount: inWeek.length,
    netR: toDecimalString(round2(netR)),
    netPnl: toDecimalString(round2(netPnl)),
    currency: mainAccount.currency,
    bestDecisions: bestSorted.slice(0, 3).map((t) => decision(t, "Played the plan — entry, size and exit matched the playbook.")),
    worstDecisions: worstSorted.slice(0, 3).map((t) => decision(t, num(t.rMultiple) < 0 ? "Plan drift: the exit deviated from the written scenario." : "Outcome fine, process gradeable — keep the standard.")),
    disciplineScore: discipline === null ? null : toDecimalString(round2(discipline)),
    disciplinePrevScore: disciplinePrev === null ? null : toDecimalString(round2(disciplinePrev)),
    adherencePct: adherencePct === null ? null : toDecimalString(round2(adherencePct)),
    journalDays,
    violationsCount: violationsThisWeek,
    focus,
    streaks,
  };
}

// ── Risk command center (GET /risk/overview) ─────────────────────────────────

function riskOverview(): RiskOverviewResponse {
  const trades = closedTrades();
  const currency = mainAccount.currency;
  const starting = num(mainAccount.startingBalance);

  let equity = starting;
  let peak = starting;
  const curve = trades.map((trade) => {
    equity += num(trade.pnlNet);
    peak = Math.max(peak, equity);
    return {
      date: trade.tradingDate,
      equity: toDecimalString(round2(equity)),
      drawdownPct: toDecimalString(round2(peak > 0 ? ((equity - peak) / peak) * 100 : 0)),
    };
  });
  const maxRecordedPct = curve.reduce((worst, point) => Math.min(worst, num(point.drawdownPct)), 0);
  const currentDDPct = curve.length > 0 ? num(curve[curve.length - 1]!.drawdownPct) : 0;
  const currentDDAmount = Math.abs((currentDDPct / 100) * peak);

  const todayKey = todayKeyLocal();
  const todayTrades = data.trades.filter((t) => t.tradingDate === todayKey && !t.deletedAt);
  const todayLoss = todayTrades.filter((t) => num(t.pnlNet) < 0).reduce((s, t) => s + Math.abs(num(t.pnlNet)), 0);
  const dailyLimitPct = riskDefaultsState.maxDailyLossPct;
  const dailyLimitAmount = (num(dailyLimitPct) / 100) * Math.max(equity, starting);

  const ratio = dailyLimitAmount > 0 ? todayLoss / dailyLimitAmount : 0;
  const posture: RiskLevel =
    ratio >= 1 ? "BREACH" : ratio >= 0.75 ? "WARNING" : ratio >= 0.4 ? "CAUTION" : "SAFE";

  const breachesToday = todayTrades.filter((t) => t.riskAmount !== null && num(t.riskAmount) / Math.max(equity, 1) > num(riskDefaultsState.riskPerTradePct) / 100).length;

  const last21 = data.dailyStats.slice(-21);
  const dailyRisk = last21.map((stat) => {
    const dayTrades = data.trades.filter((t) => t.tradingDate === stat.date && num(t.pnlNet) < 0);
    const loss = dayTrades.reduce((s, t) => s + Math.abs(num(t.pnlNet)), 0);
    return {
      date: stat.date,
      riskPct: toDecimalString(round2(stat.tradesCount > 0 ? (stat.tradesCount * num(riskDefaultsState.riskPerTradePct)) : 0)),
      lossPct: toDecimalString(round2(dailyLimitAmount > 0 ? (loss / dailyLimitAmount) * 100 : 0)),
      trades: stat.tradesCount,
    };
  });

  const thresholds = [
    { key: "caution" as const, ddPct: num(dailyLimitPct) === 0 ? "1" : toDecimalString(num(dailyLimitPct) * 0.5), triggered: currentDDPct <= -num(dailyLimitPct) * 0.5 },
    { key: "warning" as const, ddPct: toDecimalString(num(dailyLimitPct) * 0.75), triggered: currentDDPct <= -num(dailyLimitPct) * 0.75 },
    { key: "critical" as const, ddPct: dailyLimitPct, triggered: currentDDPct <= -num(dailyLimitPct) },
  ];

  const events: RiskOverviewResponse["events"] = [
    ...data.ruleViolations.slice(0, 6).map((violation) => ({
      id: violation.id,
      kind: "VIOLATION" as const,
      severity: violation.severity,
      title: `Rule violation — ${violation.ruleId.slice(0, 8)}`,
      message: violation.detail ?? "A standing risk rule was breached.",
      createdAt: violation.createdAt,
      acknowledgedAt: violation.acknowledgedAt,
    })),
    ...data.alerts
      .filter((alert) => alert.kind === "RISK")
      .slice(0, 4)
      .map((alert) => ({
        id: alert.id,
        kind: "ALERT" as const,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt,
        acknowledgedAt: alert.readAt,
      })),
  ];

  return {
    currency,
    balance: toDecimalString(round2(equity)),
    posture,
    postureRatio: toDecimalString(round2(Math.min(1.2, ratio))),
    daily: {
      limitPct: dailyLimitPct,
      spentPct: toDecimalString(round2(dailyLimitAmount > 0 ? (todayLoss / dailyLimitAmount) * 100 : 0)),
      spentAmount: toDecimalString(round2(todayLoss)),
    },
    perTrade: {
      limitPct: riskDefaultsState.riskPerTradePct,
      worstRiskPct: toDecimalString(round2(num(riskDefaultsState.riskPerTradePct) * 1.4)),
      avgRiskPct: riskDefaultsState.riskPerTradePct,
      breachesToday,
    },
    losses: {
      maxLossesPerDay: 3,
      lossesToday: todayTrades.filter((t) => num(t.pnlNet) < 0).length,
      maxTradesPerDay: riskDefaultsState.maxTradesPerDay,
      tradesToday: todayTrades.length,
      lossStreakCurrent: currentLossStreak(trades),
      lossStreakWorst: worstLossStreak(trades),
    },
    drawdown: {
      limitPct: dailyLimitPct,
      currentPct: toDecimalString(round2(currentDDPct)),
      currentAmount: toDecimalString(round2(currentDDAmount)),
      peakEquity: toDecimalString(round2(peak)),
      maxRecordedPct: toDecimalString(round2(maxRecordedPct)),
      thresholds,
    },
    equityCurve: curve,
    dailyRisk,
    events,
  };
}

function todayKeyLocal(): string {
  return toTradingDateKey(new Date().toISOString(), USER_TZ);
}

function currentLossStreak(trades: Trade[]): number {
  let streak = 0;
  for (let i = trades.length - 1; i >= 0; i -= 1) {
    if (num(trades[i]!.pnlNet) < 0) streak += 1;
    else break;
  }
  return streak;
}

function worstLossStreak(trades: Trade[]): number {
  let worst = 0;
  let streak = 0;
  for (const trade of trades) {
    if (num(trade.pnlNet) < 0) {
      streak += 1;
      worst = Math.max(worst, streak);
    } else streak = 0;
  }
  return worst;
}

// ── Market data (feature Charts) ─────────────────────────────────────────────

function getInstrumentCandles(symbol: string, timeframe: Timeframe, limit: number): ChartCandlesResponse {
  const instrument = data.instruments.find((i) => i.symbol === symbol);
  const base = instrument ? Number((instrument as unknown as { basePrice?: number }).basePrice ?? 1.1) : 1.1;
  const step = TIMEFRAME_MS[timeframe];
  const now = Date.now();
  const startMs = Math.floor((now - limit * step) / step) * step;
  const candles = Array.from({ length: limit }, (_, i) => {
    const bucketMs = startMs + i * step;
    const rng = mulberry32((symbol.length * 7919 + Math.floor(bucketMs / step)) >>> 0);
    const open = base * (1 + (rng() - 0.5) * 0.004);
    const close = open * (1 + (rng() - 0.5) * 0.006);
    const high = Math.max(open, close) * (1 + rng() * 0.003);
    const low = Math.min(open, close) * (1 - rng() * 0.003);
    return {
      t: iso(bucketMs),
      o: roundDigits(open, 5),
      h: roundDigits(high, 5),
      l: roundDigits(low, 5),
      c: roundDigits(close, 5),
      v: Math.round(100 + rng() * 900),
    };
  });
  return { symbol, timeframe, source: "SIM", candles };
}

function getSymbolHistory(instrumentId: string): SymbolHistoryResponse {
  const instrument = instrumentById.get(instrumentId);
  const trades = closedTrades()
    .filter((t) => t.instrumentId === instrumentId && t.exitAt !== null)
    .sort((a, b) => (a.exitAt! < b.exitAt! ? 1 : -1))
    .slice(0, 12)
    .map((trade) => ({
      entryAt: trade.entryAt,
      direction: trade.direction,
      pnlNet: num(trade.pnlNet),
      rMultiple: trade.rMultiple === null ? null : num(trade.rMultiple),
    }));
  return { symbol: instrument?.symbol ?? "—", trades };
}

function updateTradeChart(tradeId: string, input: UpdateTradeChartInput): TradeChartResponse {
  const trade = data.trades.find((t) => t.id === tradeId);
  if (!trade) throw new MockError(404, "Trade not found");
  if (input.timeframe !== undefined) trade.timeframe = input.timeframe;
  if (input.chartZones !== undefined) trade.chartZones = input.chartZones;
  trade.updatedAt = new Date().toISOString();
  return { trade };
}
