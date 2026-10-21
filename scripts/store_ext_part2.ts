
// ── Atlas section (GET /stats/analytics/sections/:id) ────────────────────────

function analyticsSection(sectionId: string): AnalyticsSectionResponse {
  return buildAnalyticsSection({
    sectionId,
    currency: mainAccount.currency,
    startingBalance: num(mainAccount.startingBalance),
    trades: closedTrades(),
    instruments: data.instruments,
    strategies: data.strategies,
    dailyStats: data.dailyStats,
    ecoEvents: data.ecoEvents,
    skippedTrades: data.skippedTrades,
    mistakes: mistakesLedger().entries,
  });
}

// ── Economic calendar (GET /calendar/economic?week=) ─────────────────────────

function economicCalendar(weekStart: string | null): EconomicCalendarResponse {
  const start = weekStart ?? mondayOf(toTradingDateKey(new Date().toISOString(), USER_TZ));
  const weekEnd = iso(Date.parse(`${start}T00:00:00Z`) + 6 * DAY_MS).slice(0, 10);
  return {
    weekStart: start,
    weekEnd,
    events: buildEconomicWeek(start, new Date().toISOString(), USER_TZ),
  };
}

// ── Account band (GET /stats/account-band) ───────────────────────────────────

function accountBand(): AccountBandResponse {
  const trades = closedTrades();
  const all = data.trades.filter((t) => !t.deletedAt);
  const currency = mainAccount.currency;
  const starting = num(mainAccount.startingBalance);

  // Equity + drawdown curve, chronological.
  let equity = starting;
  let peak = starting;
  let maxDD = 0;
  const equityCurve = trades.map((trade) => {
    equity += num(trade.pnlNet);
    peak = Math.max(peak, equity);
    const drawdownPct = peak > 0 ? ((equity - peak) / peak) * 100 : 0;
    maxDD = Math.min(maxDD, drawdownPct);
    return { date: trade.tradingDate, equity: toDecimalString(round2(equity)), drawdownPct: toDecimalString(round2(drawdownPct)) };
  });

  const grossProfit = trades.filter((t) => num(t.pnlNet) > 0).reduce((s, t) => s + num(t.pnlNet), 0);
  const grossLoss = Math.abs(trades.filter((t) => num(t.pnlNet) < 0).reduce((s, t) => s + num(t.pnlNet), 0));

  // Weekly trade counts + active days (8 ISO weeks, oldest first).
  const mondays = lastNWeekMondays(8);
  const weeklyTradeCounts = mondays.map((monday) => {
    const from = Date.parse(`${monday}T00:00:00Z`);
    const to = from + 7 * DAY_MS;
    return all.filter((t) => {
      const ts = Date.parse(`${t.tradingDate}T00:00:00Z`);
      return ts >= from && ts < to;
    }).length;
  });
  const weeklyActiveDays = mondays.map((monday) => {
    const from = Date.parse(`${monday}T00:00:00Z`);
    const to = from + 7 * DAY_MS;
    const days = new Set(
      all
        .filter((t) => {
          const ts = Date.parse(`${t.tradingDate}T00:00:00Z`);
          return ts >= from && ts < to;
        })
        .map((t) => t.tradingDate),
    );
    return days.size;
  });

  const dayGroups = new Map<string, { wins: number; total: number }>();
  for (const stat of data.dailyStats) {
    dayGroups.set(stat.date, { wins: stat.winsCount, total: stat.tradesCount });
  }
  const tradingDays = [...dayGroups.entries()].filter(([, g]) => g.total > 0);
  const winDays = tradingDays.filter(([, g]) => g.wins > g.total - g.wins ? false : g.wins / g.total > 0.5);
  const avgDailyWinRate = tradingDays.length > 0 ? winDays.length / tradingDays.length : 0;

  const monthKey = monthKeyOf(toTradingDateKey(new Date().toISOString(), USER_TZ));
  const lastMonthKey = monthKeyOf(
    iso(Date.parse(`${monthKey}-15T00:00:00Z`) - 15 * DAY_MS).slice(0, 10),
  );
  const monthTrades = all.filter((t) => monthKeyOf(t.tradingDate) === monthKey).length;
  const lastMonthTrades = all.filter((t) => monthKeyOf(t.tradingDate) === lastMonthKey).length;

  const graded = trades.filter((t) => t.plannedRR !== null);
  const avgPlannedRR =
    graded.length > 0 ? graded.reduce((s, t) => s + num(t.plannedRR), 0) / graded.length : null;

  const recentTrades = [...all]
    .sort((a, b) => (a.exitAt ?? a.entryAt) < (b.exitAt ?? b.entryAt) ? 1 : -1)
    .slice(0, 5)
    .map((trade) => ({
      id: trade.id,
      symbol: symbolOf(trade),
      direction: trade.direction,
      tradingDate: trade.tradingDate,
      status: trade.status,
      pnlNet: trade.pnlNet,
      rMultiple: trade.rMultiple,
    }));

  const monthlyGoals = monthlyGoals().goals;

  return {
    currency,
    startingBalance: mainAccount.startingBalance,
    balance: toDecimalString(round2(starting + trades.reduce((s, t) => s + num(t.pnlNet), 0))),
    grossProfit: toDecimalString(round2(grossProfit)),
    grossLoss: toDecimalString(round2(grossLoss)),
    totalTrades: all.length,
    openTrades: all.filter((t) => t.status === "OPEN").length,
    closedTrades: trades.length,
    weeklyTradeCounts,
    weeklyActiveDays,
    usageDays: data.dailyStats.filter((s) => s.tradesCount > 0 || s.ghostTradesCount > 0).length,
    activeDays: tradingDays.length,
    firstTradeDate: trades.length > 0 ? trades[0]!.tradingDate : null,
    avgDailyWinRate: toDecimalString(round2(avgDailyWinRate)),
    avgDailyWinRateDays: tradingDays.length,
    avgPlannedRR: avgPlannedRR === null ? null : toDecimalString(round2(avgPlannedRR)),
    avgPlannedRRCount: graded.length,
    equityCurve,
    maxDrawdownPct: toDecimalString(round2(maxDD)),
    goals: monthlyGoals,
    recentTrades,
    monthTrades,
    lastMonthTrades,
  };
}

// ── Month highlights (GET /stats/highlights) ─────────────────────────────────

function toMonthHighlight(trade: Trade): MonthHighlight {
  return {
    tradeId: trade.id,
    symbol: symbolOf(trade),
    direction: trade.direction,
    pnlNet: trade.pnlNet ?? "0",
    rMultiple: trade.rMultiple,
    strategyName: strategyNameOf(trade),
    strategyColor: strategyColorOf(trade),
    durationMinutes: minutesBetween(trade.entryAt, trade.exitAt ?? trade.entryAt),
    tradingDate: trade.tradingDate,
    entryAt: trade.entryAt,
    exitAt: trade.exitAt ?? trade.entryAt,
  };
}

function monthHighlights(): MonthHighlightsResponse {
  const monthKey = monthKeyOf(toTradingDateKey(new Date().toISOString(), USER_TZ));
  const trades = closedTrades().filter((t) => monthKeyOf(t.tradingDate) === monthKey);
  const sorted = [...trades].sort((a, b) => num(b.pnlNet) - num(a.pnlNet));
  return {
    monthKey,
    best: sorted.length > 0 ? toMonthHighlight(sorted[0]!) : null,
    worst: sorted.length > 0 ? toMonthHighlight(sorted[sorted.length - 1]!) : null,
    currency: mainAccount.currency,
  };
}

// ── Monthly goals (GET /stats/monthly-goals) ─────────────────────────────────

function monthlyGoals(): MonthlyGoalsResponse {
  const monthKey = monthKeyOf(toTradingDateKey(new Date().toISOString(), USER_TZ));
  const stats = data.dailyStats.filter((s) => monthKeyOf(s.date) === monthKey);
  const netPnl = stats.reduce((sum, s) => sum + num(s.pnlNet), 0);
  const closedCount = stats.reduce((sum, s) => sum + s.tradesCount, 0);
  const winCount = stats.reduce((sum, s) => sum + s.winsCount, 0);
  const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
  const rEarned = stats.reduce((sum, s) => sum + num(s.rEarned), 0);
  const greenDays = stats.filter((s) => num(s.pnlNet) > 0).length;
  const scored = stats.filter((s) => s.disciplineScore !== null);
  const discipline = scored.length > 0 ? scored.reduce((sum, s) => sum + num(s.disciplineScore), 0) / scored.length : 0;
  const worstDayTrades = stats.reduce((max, s) => Math.max(max, s.tradesCount), 0);
  const target = num(goalSettingsState.monthlyPnlTarget);

  const goals: MonthlyGoal[] = [
    {
      key: "profit",
      label: "Monthly net P&L",
      unit: "CURRENCY",
      direction: "HIGHER_IS_BETTER",
      target: goalSettingsState.monthlyPnlTarget,
      current: toDecimalString(round2(netPnl)),
      progress: toDecimalString(round2(target > 0 ? Math.max(0, netPnl) / target : 0)),
      note: netPnl >= target ? "Target reached — protect it." : `${round2(Math.max(0, target - netPnl))} to go this month.`,
    },
    {
      key: "winRate",
      label: "Win rate",
      unit: "PERCENT",
      direction: "HIGHER_IS_BETTER",
      target: toDecimalString(goalSettingsState.winRateTargetPct),
      current: toDecimalString(round2(winRate)),
      progress: toDecimalString(round2(goalSettingsState.winRateTargetPct > 0 ? Math.min(1, winRate / goalSettingsState.winRateTargetPct) : 0)),
      note: `${closedCount} closed trades this month.`,
    },
    {
      key: "avgR",
      label: "Average R",
      unit: "R",
      direction: "HIGHER_IS_BETTER",
      target: goalSettingsState.avgRTarget,
      current: toDecimalString(round2(closedCount > 0 ? rEarned / closedCount : 0)),
      progress: toDecimalString(round2(Math.min(1, closedCount > 0 ? rEarned / closedCount / num(goalSettingsState.avgRTarget) : 0))),
      note: "Per closed trade, all setups.",
    },
    {
      key: "greenDays",
      label: "Green days",
      unit: "COUNT",
      direction: "HIGHER_IS_BETTER",
      target: toDecimalString(goalSettingsState.greenDaysTarget),
      current: toDecimalString(greenDays),
      progress: toDecimalString(round2(goalSettingsState.greenDaysTarget > 0 ? Math.min(1, greenDays / goalSettingsState.greenDaysTarget) : 0)),
      note: `${stats.length} trading days so far.`,
    },
    {
      key: "discipline",
      label: "Discipline",
      unit: "PERCENT",
      direction: "HIGHER_IS_BETTER",
      target: toDecimalString(goalSettingsState.disciplineTargetPct),
      current: toDecimalString(round2(discipline)),
      progress: toDecimalString(round2(goalSettingsState.disciplineTargetPct > 0 ? Math.min(1, discipline / goalSettingsState.disciplineTargetPct) : 0)),
      note: "Average Cosmoz Index this month.",
    },
    {
      key: "maxTradesPerDay",
      label: "Max trades / day",
      unit: "COUNT",
      direction: "LOWER_IS_BETTER",
      target: toDecimalString(goalSettingsState.maxTradesPerDay),
      current: toDecimalString(worstDayTrades),
      progress: toDecimalString(round2(goalSettingsState.maxTradesPerDay > 0 ? Math.min(1, worstDayTrades / goalSettingsState.maxTradesPerDay) : 0)),
      note: worstDayTrades > goalSettingsState.maxTradesPerDay ? "Ceiling breached — review the day." : "Within the ceiling.",
    },
  ];

  return { monthLabel: monthLabel(monthKey), currency: mainAccount.currency, goals };
}

// ── Product band (GET /stats/product) ────────────────────────────────────────

function productMetrics(): ProductMetricsResponse {
  const monthKey = monthKeyOf(toTradingDateKey(new Date().toISOString(), USER_TZ));
  const activeDays30 = new Set(
    data.dailyStats.filter((s) => s.tradesCount > 0).map((s) => s.date),
  );
  return {
    activeUsers: 1284,
    totalTradesLogged: 18_402,
    tradesThisMonth: data.trades.filter((t) => monthKeyOf(t.tradingDate) === monthKey).length,
    retentionPct: "0.68",
    activeDays30d: Math.min(30, activeDays30.size),
  };
}

// ── Weekly report (GET /stats/weekly?week=) ──────────────────────────────────

function weeklyReport(start?: string): WeeklyReportResponse {
  const todayKey = toTradingDateKey(new Date().toISOString(), USER_TZ);
  const weekStart = start ?? mondayOf(todayKey);
  const startMs = Date.parse(`${weekStart}T00:00:00Z`);
  const weekEnd = iso(startMs + 6 * DAY_MS).slice(0, 10);
  const inWeek = closedTrades().filter((t) => {
    const ts = Date.parse(`${t.tradingDate}T00:00:00Z`);
    return ts >= startMs && ts < startMs + 7 * DAY_MS;
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const dateKey = iso(startMs + i * DAY_MS).slice(0, 10);
    const dayTrades = inWeek.filter((t) => t.tradingDate === dateKey);
    const label = WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()]!;
    return {
      date: dateKey,
      label,
      pnlNet: toDecimalString(round2(dayTrades.reduce((s, t) => s + num(t.pnlNet), 0))),
      tradesCount: dayTrades.length,
    };
  });

  const netPnl = inWeek.reduce((s, t) => s + num(t.pnlNet), 0);
  const wins = inWeek.filter((t) => num(t.pnlNet) > 0).length;
  const rEarned = inWeek.reduce((s, t) => s + num(t.rMultiple), 0);
  const weekStats = data.dailyStats.filter((s) => {
    const ts = Date.parse(`${s.date}T00:00:00Z`);
    return ts >= startMs && ts < startMs + 7 * DAY_MS && s.disciplineScore !== null;
  });
  const disciplineAvg =
    weekStats.length > 0
      ? weekStats.reduce((s, stat) => s + num(stat.disciplineScore), 0) / weekStats.length
      : null;

  const sortedByPnl = [...inWeek].sort((a, b) => num(b.pnlNet) - num(a.pnlNet));
  const spot = (trade: Trade) => ({
    tradeId: trade.id,
    symbol: symbolOf(trade),
    pnlNet: trade.pnlNet ?? "0",
    rMultiple: trade.rMultiple,
    date: trade.tradingDate,
  });

  const byInstrumentMap = new Map<string, { name: string; trades: Trade[] }>();
  for (const trade of inWeek) {
    const symbol = symbolOf(trade);
    const row = byInstrumentMap.get(symbol) ?? { name: instrumentById.get(trade.instrumentId)?.name ?? symbol, trades: [] };
    row.trades.push(trade);
    byInstrumentMap.set(symbol, row);
  }
  const byInstrument = [...byInstrumentMap.entries()].map(([symbol, row]) => ({
    symbol,
    name: row.name,
    tradesCount: row.trades.length,
    netPnl: toDecimalString(round2(row.trades.reduce((s, t) => s + num(t.pnlNet), 0))),
    winRate:
      row.trades.length > 0
        ? toDecimalString(round2(row.trades.filter((t) => num(t.pnlNet) > 0).length / row.trades.length))
        : null,
  }));

  const insights: WeekInsight[] = [];
  if (inWeek.length === 0) {
    insights.push({ tone: "neutral", text: "No closed trades this week — the ledger stays honest at zero." });
  } else {
    if (netPnl >= 0) insights.push({ tone: "positive", text: `Net ${round2(netPnl)} over ${inWeek.length} closed trades.` });
    else insights.push({ tone: "negative", text: `Net ${round2(netPnl)} over ${inWeek.length} closed trades — review the worst decision below.` });
    if (disciplineAvg !== null) {
      insights.push({
        tone: num(String(disciplineAvg)) >= 70 ? "positive" : "negative",
        text: `Average discipline index ${round2(disciplineAvg)} across ${weekStats.length} scored days.`,
      });
    }
  }

  return {
    currency: mainAccount.currency,
    weekStart,
    weekEnd,
    isCurrent: start === undefined || start === mondayOf(todayKey),
    days,
    totals: {
      netPnl: toDecimalString(round2(netPnl)),
      tradesCount: inWeek.length,
      winRate: inWeek.length > 0 ? toDecimalString(round2(wins / inWeek.length)) : "0",
      rEarned: toDecimalString(round2(rEarned)),
      disciplineAvg: disciplineAvg === null ? null : toDecimalString(round2(disciplineAvg)),
    },
    best: sortedByPnl.length > 0 ? spot(sortedByPnl[0]!) : null,
    worst: sortedByPnl.length > 0 ? spot(sortedByPnl[sortedByPnl.length - 1]!) : null,
    byInstrument,
    insights: insights.slice(0, 4),
    generatedAt: new Date().toISOString(),
  };
}
