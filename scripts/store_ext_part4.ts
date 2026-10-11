
// ── Portfolios desk ──────────────────────────────────────────────────────────

function accountAggregates(accountId: string) {
  const account = data.accounts.find((a) => a.id === accountId)!;
  const trades = data.trades.filter((t) => t.accountId === accountId && !t.deletedAt);
  const closed = trades.filter((t) => t.status === "CLOSED");
  const netPnl = closed.reduce((s, t) => s + num(t.pnlNet), 0);
  const balance = num(account.startingBalance) + netPnl;
  const wins = closed.filter((t) => num(t.pnlNet) > 0).length;
  return {
    account,
    trades,
    balance,
    netPnl,
    tradesOpen: trades.filter((t) => t.status === "OPEN").length,
    tradesTotal: trades.length,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
  };
}

function portfolioOverview(): PortfolioOverviewResponse {
  const rows = data.accounts.map((account) => {
    const agg = accountAggregates(account.id);
    return {
      ...agg.account,
      balance: toDecimalString(round2(agg.balance)),
      netPnl: toDecimalString(round2(agg.netPnl)),
      tradesOpen: agg.tradesOpen,
      tradesTotal: agg.tradesTotal,
      winRate: agg.winRate === null ? null : toDecimalString(round2(agg.winRate)),
      allocationPct: "0",
    };
  });
  const totalBalance = rows.reduce((s, row) => s + num(row.balance), 0);
  for (const row of rows) {
    row.allocationPct = toDecimalString(round2(totalBalance > 0 ? (num(row.balance) / totalBalance) * 100 : 0));
  }

  const connections = brokerConnections;
  const byBrokerMap = new Map<string, { provider: BrokerConnectionRow["provider"]; connections: number; trades: number; netPnl: number }>();
  for (const connection of connections) {
    const row = byBrokerMap.get(connection.provider) ?? { provider: connection.provider, connections: 0, trades: 0, netPnl: 0 };
    row.connections += 1;
    const agg = accountAggregates(connection.accountId);
    row.trades += agg.tradesTotal;
    row.netPnl += agg.netPnl;
    byBrokerMap.set(connection.provider, row);
  }

  const byAssetClassMap = new Map<string, { trades: number; netPnl: number; wins: number }>();
  for (const trade of closedTrades()) {
    const assetClass = instrumentById.get(trade.instrumentId)?.assetClass ?? "FOREX";
    const row = byAssetClassMap.get(assetClass) ?? { trades: 0, netPnl: 0, wins: 0 };
    row.trades += 1;
    row.netPnl += num(trade.pnlNet);
    if (num(trade.pnlNet) > 0) row.wins += 1;
    byAssetClassMap.set(assetClass, row);
  }
  const tradesTotalAll = closedTrades().length;

  return {
    currency: mainAccount.currency,
    totals: {
      balance: toDecimalString(round2(totalBalance)),
      startingBalance: toDecimalString(round2(data.accounts.reduce((s, a) => s + num(a.startingBalance), 0))),
      netPnl: toDecimalString(round2(rows.reduce((s, row) => s + num(row.netPnl), 0))),
      tradesTotal: rows.reduce((s, row) => s + row.tradesTotal, 0),
      openPositions: rows.reduce((s, row) => s + row.tradesOpen, 0),
      accountsCount: rows.length,
      connectionsConnected: connections.filter((c) => c.status === "ACTIVE").length,
      connectionsTotal: connections.length,
    },
    accounts: rows,
    byBroker: [...byBrokerMap.values()].map((row) => ({
      provider: row.provider,
      connections: row.connections,
      tradesTotal: row.trades,
      netPnl: toDecimalString(round2(row.netPnl)),
    })),
    byAssetClass: [...byAssetClassMap.entries()].map(([assetClass, row]) => ({
      assetClass: assetClass as PortfolioOverviewResponse["byAssetClass"][number]["assetClass"],
      tradesPct: toDecimalString(round2(tradesTotalAll > 0 ? (row.trades / tradesTotalAll) * 100 : 0)),
      pnlNet: toDecimalString(round2(row.netPnl)),
      winRate: row.trades > 0 ? toDecimalString(round2(row.wins / row.trades)) : null,
    })),
  };
}

function listBrokerConnections(): BrokerConnectionsResponse {
  return { connections: brokerConnections.map((connection) => ({ ...connection, status: connection.status })) };
}

function createBrokerConnection(input: CreateBrokerConnectionInput): ConnectBrokerResponse {
  const account = data.accounts.find((a) => a.id === input.accountId);
  if (!account) throw new MockError(404, "Account not found");
  const connection: BrokerConnectionRow = {
    id: `bc_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    accountId: input.accountId,
    provider: input.provider,
    label: input.label,
    status: "ACTIVE",
    autoImport: input.autoImport,
    lastSyncAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    accountName: account.name,
  };
  brokerConnections.unshift(connection);
  const batch = pullBatch(connection, "initial pull");
  return { connection, batch };
}

function pullBatch(connection: BrokerConnectionRow, label: string): ImportBatchRow {
  const pulled = int(mulberry32(Date.now() >>> 0), 0, 18);
  const batch: ImportBatchRow = {
    id: `batch_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    accountId: connection.accountId,
    source: connection.provider === "DERIV" ? "DERIV_API" : connection.provider === "BINANCE" ? "BINANCE_API" : "MT5_SYNC",
    filename: `auto-import ${label} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    status: "COMPLETED",
    rowsTotal: pulled,
    rowsImported: pulled,
    rowsSkipped: 0,
    errorLog: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    accountName: connection.accountName,
  };
  importBatches.unshift(batch);
  connection.lastSyncAt = batch.startedAt;
  return batch;
}

function updateBrokerConnection(connectionId: string, input: UpdateBrokerConnectionInput): BrokerConnectionRow {
  const connection = brokerConnections.find((c) => c.id === connectionId);
  if (!connection) throw new MockError(404, "Connection not found");
  if (input.label !== undefined) connection.label = input.label;
  if (input.autoImport !== undefined) connection.autoImport = input.autoImport;
  return connection;
}

function deleteBrokerConnection(connectionId: string): { id: string; deleted: true } {
  const index = brokerConnections.findIndex((c) => c.id === connectionId);
  if (index === -1) throw new MockError(404, "Connection not found");
  brokerConnections.splice(index, 1);
  return { id: connectionId, deleted: true };
}

function syncBrokerConnection(connectionId: string): SyncConnectionResponse {
  const connection = brokerConnections.find((c) => c.id === connectionId);
  if (!connection) throw new MockError(404, "Connection not found");
  return { connection, batch: pullBatch(connection, "manual sync") };
}

function createAccount(input: CreateAccountInput): Account {
  const account: Account = {
    id: `acc_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    name: input.name,
    type: input.type,
    broker: input.broker,
    currency: input.currency,
    startingBalance: input.startingBalance,
    isDefault: false,
    propConfig: input.propConfig,
    createdAt: new Date().toISOString(),
  };
  data.accounts.push(account);
  return account;
}

function updateAccount(accountId: string, input: UpdateAccountInput): Account {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) throw new MockError(404, "Account not found");
  if (input.name !== undefined) account.name = input.name;
  if (input.type !== undefined) account.type = input.type;
  if (input.broker !== undefined) account.broker = input.broker;
  if (input.currency !== undefined) account.currency = input.currency;
  if (input.startingBalance !== undefined) account.startingBalance = input.startingBalance;
  if (input.propConfig !== undefined) account.propConfig = input.propConfig;
  if (input.isDefault === true) {
    for (const other of data.accounts) other.isDefault = other.id === accountId;
  }
  return account;
}

function deleteAccount(accountId: string): DeleteAccountResponse {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) throw new MockError(404, "Account not found");
  if (account.isDefault) throw new MockError(409, "The default account cannot be deleted — promote another account first.");
  const remaining = data.trades.filter((t) => t.accountId === accountId && !t.deletedAt);
  if (remaining.length > 0) throw new MockError(409, `This account still holds ${remaining.length} trades — reassign or delete them first.`);
  data.accounts = data.accounts.filter((a) => a.id !== accountId);
  return { id: accountId, deleted: true };
}

function listImportBatches(): ImportBatchesResponse {
  return { batches: importBatches.slice(0, 24) };
}

// ── CSV import + one-shot import ─────────────────────────────────────────────

function previewCsv(input: CsvImportPreviewRequest): CsvImportPreviewResponse {
  const parsed = parseCsvFile(input.csv, input.broker, input.hasHeader, data.instruments, new Set(data.trades.map((t) => t.externalRef ?? "")));
  const batchId = `batch_csv_${Math.random().toString(36).slice(2, 8)}`;
  csvBatches.set(batchId, { input, parsed });
  return {
    batchId,
    detected: parsed.detected,
    rows: parsed.rows,
    importable: parsed.rows.filter((row) => row.status === "OK").length,
    skipped: parsed.rows.filter((row) => row.status === "ERROR").length,
    duplicates: parsed.rows.filter((row) => row.duplicate).length,
  };
}

function commitCsvImport(input: CsvImportCommitRequest): CsvImportCommitResponse {
  const stored = csvBatches.get(input.batchId);
  if (!stored) throw new MockError(404, "Preview batch expired — import the file again");
  const okRows = stored.parsed.rows.filter((row) => row.status === "OK" && !row.duplicate);
  let instrumentsCreated = 0;
  for (const row of okRows) {
    let instrumentId = row.instrumentId;
    if (instrumentId === null) {
      const instrument = data.instruments.find((i) => i.symbol === row.symbol);
      if (instrument) instrumentId = instrument.id;
      else {
        instrumentId = `ins_${row.symbol.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
        data.instruments.push({ id: instrumentId, userId: user.id, symbol: row.symbol, name: row.symbol, assetClass: "FOREX", digits: 5 } as Instrument);
        instrumentsCreated += 1;
      }
    }
    if (row.direction === null || row.entryPrice === null || row.entryAt === null || row.exitPrice === null || row.exitAt === null || row.quantity === null) continue;
    data.trades.push({
      id: `trd_${row.index}_${input.batchId.slice(-4)}`,
      userId: user.id,
      accountId: input.accountId,
      instrumentId,
      strategyId: null,
      status: "CLOSED",
      direction: row.direction,
      entryPrice: row.entryPrice,
      entryAt: row.entryAt,
      quantity: row.quantity,
      initialStop: null,
      initialTP: null,
      plannedRR: null,
      riskAmount: null,
      finalStop: null,
      exitPrice: row.exitPrice,
      exitAt: row.exitAt,
      exitReason: null,
      fees: row.fees ?? "0",
      swap: row.swap ?? "0",
      pnlGross: row.pnlNet,
      pnlNet: row.pnlNet,
      rMultiple: null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      emotionBefore: null,
      emotionAfter: null,
      confidence: null,
      decisionGrade: null,
      followedPlan: null,
      checklistSnap: null,
      notes: null,
      lessons: null,
      tradingDate: toTradingDateKey(row.entryAt, USER_TZ),
      externalRef: row.externalRef,
      timeframe: null,
      chartZones: null,
      importBatchId: input.batchId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  }
  csvBatches.delete(input.batchId);
  return {
    batchId: input.batchId,
    imported: okRows.length,
    skipped: stored.parsed.rows.filter((row) => row.status === "ERROR").length,
    duplicatesSkipped: stored.parsed.rows.filter((row) => row.duplicate).length,
    instrumentsCreated,
  };
}

function importTrades(input: ImportTradesInput): ImportTradesResponse {
  let created = 0;
  let duplicates = 0;
  const existing = new Set(data.trades.map((t) => t.externalRef ?? ""));
  for (const row of input.rows) {
    if (existing.has(row.externalRef)) {
      duplicates += 1;
      continue;
    }
    existing.add(row.externalRef);
    data.trades.push({
      id: `trd_${row.externalRef.slice(-8)}`,
      userId: user.id,
      accountId: input.accountId,
      instrumentId: row.instrumentId,
      strategyId: null,
      status: "CLOSED",
      direction: row.direction,
      entryPrice: row.entryPrice,
      entryAt: row.entryAt,
      quantity: row.quantity,
      initialStop: row.initialStop,
      initialTP: row.initialTP,
      plannedRR: null,
      riskAmount: null,
      finalStop: null,
      exitPrice: row.exitPrice,
      exitAt: row.exitAt,
      exitReason: row.exitReason,
      fees: row.fees ?? "0",
      swap: row.swap ?? "0",
      pnlGross: row.brokerPnl,
      pnlNet: row.brokerPnl,
      rMultiple: null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      emotionBefore: null,
      emotionAfter: null,
      confidence: null,
      decisionGrade: null,
      followedPlan: null,
      checklistSnap: null,
      notes: row.notes,
      lessons: null,
      tradingDate: toTradingDateKey(row.entryAt, USER_TZ),
      externalRef: row.externalRef,
      timeframe: null,
      chartZones: null,
      importBatchId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    created += 1;
  }
  return { created, duplicates };
}

// ── Goals + settings ─────────────────────────────────────────────────────────

function getGoalSettings(): GoalSettings {
  return goalSettingsState;
}

function updateGoalSettings(input: UpdateGoalSettingsInput): GoalSettings {
  Object.assign(goalSettingsState, input, { updatedAt: new Date().toISOString() });
  return goalSettingsState;
}

function goalProgress(month?: string): GoalProgressResponse {
  const monthKey = month ?? monthKeyOf(toTradingDateKey(new Date().toISOString(), USER_TZ));
  const stats = data.dailyStats.filter((s) => monthKeyOf(s.date) === monthKey);
  const netPnl = stats.reduce((sum, s) => sum + num(s.pnlNet), 0);
  const closedCount = stats.reduce((sum, s) => sum + s.tradesCount, 0);
  const wins = stats.reduce((sum, s) => sum + s.winsCount, 0);
  const winRate = closedCount > 0 ? (wins / closedCount) * 100 : 0;
  const rEarned = stats.reduce((sum, s) => sum + num(s.rEarned), 0);
  const avgR = closedCount > 0 ? rEarned / closedCount : 0;
  const greenDays = stats.filter((s) => num(s.pnlNet) > 0).length;
  const scored = stats.filter((s) => s.disciplineScore !== null);
  const discipline = scored.length > 0 ? scored.reduce((sum, s) => sum + num(s.disciplineScore), 0) / scored.length : 0;
  const worstDayTrades = stats.reduce((max, s) => Math.max(max, s.tradesCount), 0);
  const now = new Date();
  const monthStartMs = Date.parse(`${monthKey}-01T00:00:00Z`);
  const dayOfMonth = monthKey === monthKeyOf(todayKeyLocal()) ? now.getUTCDate() : new Date(Date.parse(`${monthKey}-01T00:00:00Z`) + 31 * DAY_MS).getUTCDate();
  const daysInMonth = new Date(Date.parse(`${monthKey}-01T00:00:00Z`) + 31 * DAY_MS).getUTCDate() === 31 ? 31 : new Date(Date.parse(`${monthKey}-28T00:00:00Z`) + 5 * DAY_MS).getUTCDate();

  const statusFor = (ratio: number): GoalProgressStatus =>
    ratio >= 1 ? "ACHIEVED" : ratio >= 0.6 ? "ON_TRACK" : ratio >= 0.3 ? "AT_RISK" : "OFF_TRACK";

  const rows: GoalProgressRow[] = [
    { key: "monthlyPnl", label: "Monthly net P&L", target: num(goalSettingsState.monthlyPnlTarget), actual: round2(netPnl), progress: round2(Math.max(0, netPnl) / Math.max(1, num(goalSettingsState.monthlyPnlTarget))), status: statusFor(Math.max(0, netPnl) / Math.max(1, num(goalSettingsState.monthlyPnlTarget))) },
    { key: "winRate", label: "Win rate", target: goalSettingsState.winRateTargetPct, actual: round2(winRate), progress: round2(Math.min(1, winRate / Math.max(1, goalSettingsState.winRateTargetPct))), status: statusFor(winRate / Math.max(1, goalSettingsState.winRateTargetPct)) },
    { key: "avgR", label: "Average R", target: num(goalSettingsState.avgRTarget), actual: round2(avgR), progress: round2(Math.max(0, avgR) / Math.max(0.01, num(goalSettingsState.avgRTarget))), status: statusFor(Math.max(0, avgR) / Math.max(0.01, num(goalSettingsState.avgRTarget))) },
    { key: "greenDays", label: "Green days", target: goalSettingsState.greenDaysTarget, actual: greenDays, progress: round2(Math.min(1, greenDays / Math.max(1, goalSettingsState.greenDaysTarget))), status: statusFor(greenDays / Math.max(1, goalSettingsState.greenDaysTarget)) },
    { key: "discipline", label: "Discipline", target: goalSettingsState.disciplineTargetPct, actual: round2(discipline), progress: round2(Math.min(1, discipline / Math.max(1, goalSettingsState.disciplineTargetPct))), status: statusFor(discipline / Math.max(1, goalSettingsState.disciplineTargetPct)) },
    { key: "maxTradesPerDay", label: "Max trades / day", target: goalSettingsState.maxTradesPerDay, actual: worstDayTrades, progress: round2(Math.min(1, worstDayTrades / Math.max(1, goalSettingsState.maxTradesPerDay))), status: worstDayTrades > goalSettingsState.maxTradesPerDay ? "OFF_TRACK" : "ON_TRACK" },
  ];

  return {
    month: monthKey,
    label: monthLabel(monthKey),
    currency: mainAccount.currency,
    dayOfMonth,
    daysInMonth,
    pacePct: toDecimalString(round2(daysInMonth > 0 ? dayOfMonth / daysInMonth : 0)),
    rows,
    months: monthsWithData(),
  };
}

function monthsWithData(): string[] {
  const months = [...new Set(data.dailyStats.map((s) => monthKeyOf(s.date)))];
  return months.sort().reverse();
}

function getRiskDefaults(): RiskDefaults {
  return riskDefaultsState;
}

function updateRiskDefaults(input: UpdateRiskDefaultsInput): RiskDefaults {
  riskDefaultsState = { ...riskDefaultsState, ...input };
  return riskDefaultsState;
}

function getJournalGoals(): JournalGoals {
  return journalGoalsState;
}

function updateJournalGoals(input: UpdateJournalGoalsInput): JournalGoals {
  Object.assign(journalGoalsState, input);
  return journalGoalsState;
}
