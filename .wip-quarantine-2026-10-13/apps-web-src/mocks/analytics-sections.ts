import {
  ANALYTIC_SESSIONS,
  ANALYTICS_HOUR_BUCKETS,
  ANALYTICS_WEEKDAYS,
  EMOTION_LABELS,
  toDecimalString,
  type AnalyticsBucket,
  type AnalyticsPanel,
  type AnalyticsSectionResponse,
  type Currency,
  type DailyStat,
  type EcoEvent,
  type Instrument,
  type MistakeLedgerEntry,
  type PanelInk,
  type PanelKpi,
  type PanelUnit,
  type SkippedTrade,
  type Strategy,
  type Trade,
} from "@cosmoz/shared";

/**
 * The Analytics Atlas generator — one deterministic aggregate build per
 * section id, derived from the same closed-trade ledger the Phase 9 suite
 * reads. Every rate ships its n, every aggregate is computed here so the
 * client only formats (same principle as /stats/overview). Synthesized
 * dimensions (timeframe, regime) come from stable hashes of trade ids /
 * dates, so the mocks never flicker between reloads.
 */

export interface AtlasContext {
  sectionId: string;
  currency: Currency;
  startingBalance: number;
  /** Closed trades, chronological (oldest first). */
  trades: Trade[];
  instruments: Instrument[];
  strategies: Strategy[];
  dailyStats: DailyStat[];
  ecoEvents: EcoEvent[];
  skippedTrades: SkippedTrade[];
  /** All-time mistake ledger (the /mistakes/ledger shape). */
  mistakes: MistakeLedgerEntry[];
}

// ── Small deterministic helpers ──────────────────────────────────────────────

const round2 = (value: number): number => Number(value.toFixed(2));

/** FNV-1a → [0,1) — stable pseudo-randomness for synthesized dimensions. */
function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

const rOf = (trade: Trade): number => Number(trade.rMultiple) ?? 0;
const pnlOf = (trade: Trade): number => Number(trade.pnlNet) ?? 0;
const isWin = (trade: Trade): boolean => pnlOf(trade) > 0;

function bucketOf(key: string, label: string, group: Trade[]): AnalyticsBucket {
  const trades = group.length;
  const wins = group.filter(isWin).length;
  const avgR = trades > 0 ? group.reduce((sum, t) => sum + rOf(t), 0) / trades : null;
  return {
    key,
    label,
    trades,
    wins,
    avgR: avgR === null ? null : toDecimalString(round2(avgR)),
    winRate: trades > 0 ? toDecimalString(round2(wins / trades)) : null,
  };
}

function kpi(
  key: string,
  label: string,
  value: number | null,
  unit: PanelUnit,
  ink: PanelInk,
  hint?: string | null,
): PanelKpi {
  return {
    key,
    label,
    value: value === null ? null : toDecimalString(round2(value)),
    unit,
    ink,
    hint: hint ?? null,
  };
}

function barsPanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  unit: PanelUnit,
  items: { label: string; value: number | null; n?: number | null; ink?: PanelInk | null }[],
): AnalyticsPanel {
  return {
    kind: "bars",
    subsection,
    title,
    caption,
    ariaLabel,
    unit,
    items: items.map((item) => ({
      label: item.label,
      value: item.value === null ? null : toDecimalString(round2(item.value)),
      n: item.n ?? null,
      ink: item.ink ?? null,
    })),
  };
}

function linePanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  unit: PanelUnit,
  xLabels: string[],
  series: { name: string; ink: PanelInk; points: (number | null)[] }[],
  bands?: { name: string; ink: PanelInk; lower: (number | null)[]; upper: (number | null)[] }[] | null,
): AnalyticsPanel {
  return {
    kind: "line",
    subsection,
    title,
    caption,
    ariaLabel,
    unit,
    xLabels,
    series: series.map((s) => ({
      name: s.name,
      ink: s.ink,
      points: s.points.map((p) => (p === null ? null : toDecimalString(round2(p)))),
    })),
    bands: bands
      ? bands.map((b) => ({
          name: b.name,
          ink: b.ink,
          lower: b.lower.map((p) => (p === null ? null : toDecimalString(round2(p)))),
          upper: b.upper.map((p) => (p === null ? null : toDecimalString(round2(p)))),
        }))
      : null,
  };
}

function donutPanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  centerLabel: string,
  slices: { label: string; value: number; ink: PanelInk }[],
): AnalyticsPanel {
  return { kind: "donut", subsection, title, caption, ariaLabel, centerLabel, slices };
}

function scatterPanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  unit: PanelUnit,
  xLabel: string,
  yLabel: string,
  points: { x: number; y: number; ink?: PanelInk | null; label: string }[],
  diagonal: boolean,
): AnalyticsPanel {
  return {
    kind: "scatter",
    subsection,
    title,
    caption,
    ariaLabel,
    unit,
    xLabel,
    yLabel,
    points: points.map((p) => ({
      x: toDecimalString(round2(p.x)),
      y: toDecimalString(round2(p.y)),
      ink: p.ink ?? null,
      label: p.label,
    })),
    diagonal,
  };
}

function heatmapPanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  columns: string[],
  rows: string[],
  cells: { row: number; col: number; avgR: number | null; trades: number }[],
): AnalyticsPanel {
  return {
    kind: "heatmap",
    subsection,
    title,
    caption,
    ariaLabel,
    columns,
    rows,
    cells: cells.map((cell) => ({
      row: cell.row,
      col: cell.col,
      avgR: cell.avgR === null ? null : toDecimalString(round2(cell.avgR)),
      trades: cell.trades,
    })),
  };
}

function cell(text: string, opts?: { ink?: PanelInk | null; mono?: boolean; strong?: boolean }) {
  return { text, ink: opts?.ink ?? null, mono: opts?.mono ?? false, strong: opts?.strong ?? false };
}

function tablePanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  columns: string[],
  numericCols: number[],
  rows: { id: string; cells: ReturnType<typeof cell>[] }[],
  footnote?: string,
): AnalyticsPanel {
  return { kind: "table", subsection, title, caption, ariaLabel, columns, numericCols, rows, footnote: footnote ?? null };
}

function bucketsPanel(
  subsection: string,
  title: string,
  caption: string,
  ariaLabel: string,
  buckets: AnalyticsBucket[],
): AnalyticsPanel {
  return { kind: "buckets", subsection, title, caption, ariaLabel, buckets };
}

const signedInk = (value: number): PanelInk => (value >= 0 ? "profit" : "loss");

function bucketsBy(grouped: [key: string, label: string, group: Trade[]][]): AnalyticsBucket[] {
  return grouped.map(([key, label, group]) => bucketOf(key, label, group));
}

// ── Shared aggregates ────────────────────────────────────────────────────────

interface RStats {
  mean: number;
  std: number;
  downside: number;
  sharpe: number | null;
  sortino: number | null;
  tStat: number | null;
  skew: number | null;
}

function rStats(rs: number[]): RStats {
  const n = rs.length;
  if (n === 0) return { mean: 0, std: 0, downside: 0, sharpe: null, sortino: null, tStat: null, skew: null };
  const mean = rs.reduce((s, r) => s + r, 0) / n;
  const variance = n > 1 ? rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const lossesOnly = rs.filter((r) => r < 0);
  const downside = lossesOnly.length > 0
    ? Math.sqrt(lossesOnly.reduce((s, r) => s + r ** 2, 0) / lossesOnly.length)
    : 0;
  const m3 = rs.reduce((s, r) => s + (r - mean) ** 3, 0) / n;
  return {
    mean,
    std,
    downside,
    sharpe: std > 0 ? mean / std : null,
    sortino: downside > 0 ? mean / downside : null,
    tStat: std > 0 && n > 1 ? mean / (std / Math.sqrt(n)) : null,
    skew: std > 0 ? m3 / std ** 3 : null,
  };
}

/** Consecutive win/loss streaks over the chronological ledger. */
function streaks(trades: Trade[]): { maxWin: number; maxLoss: number; current: number; currentIsWin: boolean | null } {
  let maxWin = 0;
  let maxLoss = 0;
  let run = 0;
  let runIsWin: boolean | null = null;
  for (const trade of trades) {
    const win = isWin(trade);
    if (runIsWin === win) run += 1;
    else run = 1;
    runIsWin = win;
    if (win && run > maxWin) maxWin = run;
    if (!win && run > maxLoss) maxLoss = run;
  }
  return { maxWin, maxLoss, current: run, currentIsWin: runIsWin };
}

const monthKeyOf = (dateKey: string): string => dateKey.slice(0, 7);

/** Monday date key of the ISO week containing the given date key. */
function weekStartOf(dateKey: string): string {
  const ms = new Date(`${dateKey}T00:00:00Z`).getTime();
  const day = new Date(ms).getUTCDay();
  const back = (day + 6) % 7;
  return new Date(ms - back * 86_400_000).toISOString().slice(0, 10);
}

const EXIT_LABELS: Record<string, string> = {
  TP: "Take profit",
  SL: "Stop loss",
  MANUAL: "Manual close",
  TRAILING: "Trailing stop",
  PARTIAL: "Partial exit",
  MARGIN: "Margin call",
};

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "1 · Shaky",
  2: "2 · Unsure",
  3: "3 · Neutral",
  4: "4 · Solid",
  5: "5 · Certain",
};

const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4"] as const;

const timeframeOf = (trade: Trade): string =>
  TIMEFRAMES[Math.min(TIMEFRAMES.length - 1, Math.floor(hash01(trade.id) * TIMEFRAMES.length))] ?? "M15";

const REGIMES: [string, string][] = [
  ["TREND", "Trend day"],
  ["RANGE", "Range day"],
  ["REVERSAL", "Reversal day"],
];

const regimeKeyOf = (trade: Trade): string => {
  const roll = hash01(`regime:${trade.tradingDate}`);
  return roll < 0.4 ? "TREND" : roll < 0.82 ? "RANGE" : "REVERSAL";
};

/** Days from the nearest HIGH/MEDIUM-impact eco event (negative = before). */
function eventDistanceOf(trade: Trade, events: EcoEvent[]): number | null {
  const relevant = events.filter((e) => e.impact !== "LOW");
  if (relevant.length === 0) return null;
  const tradeMs = new Date(`${trade.tradingDate}T00:00:00Z`).getTime();
  let best: number | null = null;
  for (const event of relevant) {
    const eventMs = new Date(event.scheduledAt).getTime();
    const day = Math.round((eventMs - tradeMs) / 86_400_000);
    if (Math.abs(day) > 5) continue;
    if (best === null || Math.abs(day) < Math.abs(best)) best = day;
  }
  return best;
}

// ── Section builders ─────────────────────────────────────────────────────────

type PanelSink = (panel: AnalyticsPanel) => void;

interface SectionBuild {
  kpis: PanelKpi[];
  panels: AnalyticsPanel[];
}

function buildOverview(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const net = trades.reduce((s, t) => s + pnlOf(t), 0);
  const expectancy = trades.length > 0 ? trades.reduce((s, t) => s + rOf(t), 0) / trades.length : 0;
  const winRate = trades.length > 0 ? trades.filter(isWin).length / trades.length : 0;
  const streak = streaks(trades);

  let cumR = 0;
  let peak = 0;
  let maxDD = 0;
  for (const trade of trades) {
    cumR += rOf(trade);
    if (cumR > peak) peak = cumR;
    maxDD = Math.min(maxDD, cumR - peak);
  }

  kpis.push(
    kpi("netPnl", "Net P&L", net, "money", signedInk(net)),
    kpi("expectancy", "Expectancy", expectancy, "r", signedInk(expectancy), "per closed trade"),
    kpi("winRate", "Win rate", winRate * 100, "percent", "accent", `${trades.length} closed`),
    kpi("maxDD", "Max drawdown", maxDD, "r", "loss", "cumulative R trough"),
    kpi(
      "streak",
      "Current streak",
      streak.currentIsWin === null ? null : streak.current,
      "count",
      streak.currentIsWin === null ? "warning" : streak.currentIsWin ? "profit" : "loss",
      streak.currentIsWin === null ? "no closed trades" : streak.currentIsWin ? "wins in a row" : "losses in a row",
    ),
  );

  // Equity curve in money (starting balance + cumulative net P&L).
  let equity = ctx.startingBalance;
  const equityPoints: number[] = [];
  const equityLabels: string[] = [];
  for (const trade of trades) {
    equity += pnlOf(trade);
    equityPoints.push(equity);
    equityLabels.push(trade.tradingDate);
  }
  push(linePanel(
    "equity",
    "Equity curve",
    "Account equity after every closed trade, starting balance included. The shape matters more than the level: stairs, not rollercoasters.",
    "Equity curve after each closed trade",
    "money",
    equityLabels,
    [{ name: "Equity", ink: "profit", points: equityPoints }],
  ));

  // Daily net P&L — the last 14 trading days that have trades.
  const byDay = new Map<string, Trade[]>();
  for (const trade of trades) {
    const list = byDay.get(trade.tradingDate) ?? [];
    list.push(trade);
    byDay.set(trade.tradingDate, list);
  }
  const lastDays = [...byDay.entries()].slice(-14);
  push(barsPanel(
    "daily-flow",
    "Daily P&L flow",
    "Net P&L per trading day, last 14 active days. Emerald above break-even, carmine below — the n under each bar is the trades that day.",
    "Net profit or loss per trading day, last 14 active days",
    "money",
    lastDays.map(([date, group]) => ({
      label: date.slice(5),
      value: group.reduce((s, t) => s + pnlOf(t), 0),
      n: group.length,
    })),
  ));

  return { kpis, panels };
}

function buildPerformance(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const wins = trades.filter(isWin);
  const losses = trades.filter((t) => !isWin(t) && pnlOf(t) < 0);
  const grossProfit = wins.reduce((s, t) => s + pnlOf(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + pnlOf(t), 0));
  const best = trades.reduce((max, t) => Math.max(max, rOf(t)), 0);
  const worst = trades.reduce((min, t) => Math.min(min, rOf(t)), 0);
  const streak = streaks(trades);

  kpis.push(
    kpi("grossProfit", "Gross profit", grossProfit, "money", "profit", `${wins.length} winners`),
    kpi("grossLoss", "Gross loss", grossLoss, "money", "loss", `${losses.length} losers`),
    kpi("net", "Net P&L", grossProfit - grossLoss, "money", signedInk(grossProfit - grossLoss)),
    kpi("best", "Best trade", best, "r", "profit"),
    kpi("worst", "Worst trade", worst, "r", "loss"),
  );

  // Monthly net P&L — last 6 months that have closed trades.
  const byMonth = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = monthKeyOf(trade.tradingDate);
    const list = byMonth.get(key) ?? [];
    list.push(trade);
    byMonth.set(key, list);
  }
  const months = [...byMonth.entries()].slice(-6);
  push(barsPanel(
    "pnl",
    "Monthly P&L",
    "Net P&L by calendar month. The monthly lens kills the noise of single sessions — three red months in a row is a system question, not a bad day.",
    "Net profit or loss by calendar month",
    "money",
    months.map(([month, group]) => ({
      label: month,
      value: group.reduce((s, t) => s + pnlOf(t), 0),
      n: group.length,
    })),
  ));

  // R-multiple histogram.
  const bins: [string, number, number, PanelInk][] = [
    ["≤ -2R", -Infinity, -2, "loss"],
    ["-2…-1R", -2, -1, "loss"],
    ["-1…0R", -1, 0, "warning"],
    ["0…+1R", 0, 1, "accent"],
    ["+1…+2R", 1, 2, "profit"],
    ["≥ +2R", 2, Infinity, "profit"],
  ];
  push(barsPanel(
    "r-multiple",
    "R-multiple histogram",
    "Every closed trade dropped into an R bucket. A healthy edge is fat on the right and thin on the left — and no cliff at -3R (that would be a stop discipline leak).",
    "Count of trades per R-multiple bucket",
    "count",
    bins.map(([label, from, to, ink]) => ({
      label,
      value: trades.filter((t) => rOf(t) >= from && rOf(t) < to).length,
      ink,
    })),
  ));

  // Outcome mix donut + streak table.
  const flat = trades.filter((t) => pnlOf(t) === 0).length;
  push(donutPanel(
    "distribution",
    "Outcome mix",
    "Wins, losses and flats across the whole sample. The ratio is the raw material of every other metric on this page.",
    "Share of winning, losing and flat trades",
    `${trades.length} closed`,
    [
      { label: "Wins", value: wins.length, ink: "profit" },
      { label: "Losses", value: losses.length, ink: "loss" },
      ...(flat > 0 ? [{ label: "Flat", value: flat, ink: "warning" as PanelInk }] : []),
    ],
  ));
  push(tablePanel(
    "distribution",
    "Streaks",
    "How long the pain (and the joy) lasted. Long loss streaks with the same expectancy mean position sizing did its job.",
    "Win and loss streak statistics",
    ["Streak", "Trades", "Reading"],
    [1],
    [
      {
        id: "maxWin",
        cells: [
          cell("Longest win streak", { strong: true }),
          cell(String(streak.maxWin), { mono: true, ink: "profit" }),
          cell("best run of the sample"),
        ],
      },
      {
        id: "maxLoss",
        cells: [
          cell("Longest loss streak", { strong: true }),
          cell(String(streak.maxLoss), { mono: true, ink: "loss" }),
          cell("worst stretch — check the tilt timeline"),
        ],
      },
      {
        id: "current",
        cells: [
          cell("Current streak", { strong: true }),
          cell(String(streak.current), { mono: true, ink: streak.currentIsWin ? "profit" : "loss" }),
          cell(streak.currentIsWin === null ? "no closed trades" : streak.currentIsWin ? "wins in a row" : "losses in a row"),
        ],
      },
    ],
    "Streaks count consecutive closed trades by net outcome.",
  ));

  return { kpis, panels };
}

function buildRisk(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  // Underwater curve + max drawdown (R and %).
  let cumR = 0;
  let peakR = 0;
  let maxDDR = 0;
  let equity = ctx.startingBalance;
  let peakEquity = ctx.startingBalance;
  let maxDDPct = 0;
  const underwater: number[] = [];
  const labels: string[] = [];
  for (const trade of trades) {
    cumR += rOf(trade);
    equity += pnlOf(trade);
    peakR = Math.max(peakR, cumR);
    peakEquity = Math.max(peakEquity, equity);
    maxDDR = Math.min(maxDDR, cumR - peakR);
    maxDDPct = Math.min(maxDDPct, ((equity - peakEquity) / peakEquity) * 100);
    underwater.push(cumR - peakR);
    labels.push(trade.tradingDate);
  }
  const spikes = trades.filter((trade, i) => {
    const prior = trades.slice(Math.max(0, i - 2), i);
    return prior.length >= 2 && prior.every((t) => !isWin(t)) && Number(trade.riskAmount ?? "0") > Number(prior[prior.length - 1]?.riskAmount ?? "0") * 1.2;
  }).length;
  const risks = trades.map((t) => Number(t.riskAmount ?? "0")).filter((r) => r > 0);
  const avgRisk = risks.length > 0 ? risks.reduce((s, r) => s + r, 0) / risks.length : null;
  const stats = rStats(trades.map(rOf));

  kpis.push(
    kpi("maxDDPct", "Max drawdown", maxDDPct, "percent", "loss", "peak to trough, equity"),
    kpi("maxDDR", "Max drawdown", maxDDR, "r", "loss", "cumulative R"),
    kpi("avgRisk", "Avg risk / trade", avgRisk, "money", "accent", "committed at entry"),
    kpi("tiltSpikes", "Tilt spikes", spikes, "count", spikes > 0 ? "loss" : "profit", "bigger risk after ≥2 losses"),
  );

  push(linePanel(
    "drawdown",
    "Underwater curve",
    "Distance from the cumulative-R peak, trade after trade. Time spent below zero is the psychological price of the strategy — shallow and short is the ideal.",
    "Drawdown from cumulative R peak after each closed trade",
    "r",
    labels,
    [{ name: "Drawdown (R)", ink: "loss", points: underwater }],
  ));

  const fmt = (v: number | null, suffix = ""): string => (v === null ? "—" : `${v >= 0 ? "+" : ""}${round2(v)}${suffix}`);
  push(tablePanel(
    "metrics",
    "Risk metrics",
    "The classic risk-adjusted block, computed per trade in R units. Sharpe above 0.2 per trade is already rare in live trading.",
    "Risk-adjusted performance metrics table",
    ["Metric", "Value", "Reading"],
    [1],
    [
      { id: "ddR", cells: [cell("Max drawdown (R)", { strong: true }), cell(fmt(maxDDR), { mono: true, ink: "loss" }), cell("worst cumulative-R trough")] },
      { id: "ddPct", cells: [cell("Max drawdown (%)", { strong: true }), cell(fmt(maxDDPct), { mono: true, ink: "loss" }), cell("equity peak to trough")] },
      { id: "sharpe", cells: [cell("Sharpe (per trade)", { strong: true }), cell(fmt(stats.sharpe), { mono: true, ink: "accent" }), cell("mean R / std R")] },
      { id: "sortino", cells: [cell("Sortino (per trade)", { strong: true }), cell(fmt(stats.sortino), { mono: true, ink: "accent" }), cell("mean R / downside deviation")] },
      { id: "expectancy", cells: [cell("Expectancy", { strong: true }), cell(fmt(stats.mean, "R"), { mono: true, ink: signedInk(stats.mean) }), cell("average R per closed trade")] },
      { id: "avgRisk", cells: [cell("Avg risk / trade", { strong: true }), cell(avgRisk === null ? "—" : `$${round2(avgRisk)}`, { mono: true, ink: "accent" }), cell("money committed at entry")] },
      { id: "spikes", cells: [cell("Tilt spikes", { strong: true }), cell(String(spikes), { mono: true, ink: spikes > 0 ? "loss" : "profit" }), cell("size-ups right after losing streaks")] },
    ],
    "Risk metrics are computed on closed trades only; Sharpe and Sortino are per-trade, not annualized.",
  ));

  return { kpis, panels };
}

function buildExecution(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  // Capture = realized R ÷ best favorable excursion (MFE).
  const withMfe = trades.filter((t) => t.mfeR !== null && Number(t.mfeR) > 0);
  const capture = withMfe.length > 0
    ? withMfe.reduce((s, t) => s + Math.min(1, Math.max(0, rOf(t) / Number(t.mfeR!))), 0) / withMfe.length
    : null;
  const planned = trades.filter((t) => t.plannedRR !== null);
  const avgPlanned = planned.length > 0 ? planned.reduce((s, t) => s + Number(t.plannedRR!), 0) / planned.length : null;
  const winners = planned.filter(isWin);
  const avgSlip = winners.length > 0
    ? winners.reduce((s, t) => s + (Number(t.plannedRR!) - rOf(t)), 0) / winners.length
    : null;
  const stopMoved = trades.filter((t) => t.finalStop !== null && t.initialStop !== null && t.finalStop !== t.initialStop).length;

  kpis.push(
    kpi("avgPlanned", "Avg planned R:R", avgPlanned, "r", "accent", `${planned.length} trades with a plan`),
    kpi("capture", "MFE capture", capture === null ? null : capture * 100, "percent", "profit", "realized ÷ best excursion"),
    kpi("slip", "Avg give-back", avgSlip, "r", "warning", "planned R:R − realized, winners"),
    kpi("stopMoved", "Stops moved", stopMoved, "count", stopMoved > 0 ? "warning" : "profit", "final stop ≠ initial"),
  );

  // Entry: confidence 1–5.
  const confBuckets = [1, 2, 3, 4, 5].map((level) =>
    bucketOf(String(level), CONFIDENCE_LABELS[level] ?? String(level), trades.filter((t) => t.confidence === level)),
  );
  push(bucketsPanel(
    "entry",
    "Entry confidence",
    "Average R by the confidence you logged at entry (1–5). If the curve slopes the wrong way, your gut is trading, not your plan.",
    "Average R by pre-trade confidence level",
    confBuckets,
  ));

  // Exit reasons.
  const exitReasons = [...new Set(trades.flatMap((t) => (t.exitReason === null ? [] : [t.exitReason])))];
  const exitBuckets = bucketsBy(
    exitReasons.map(
      (reason) => [reason, EXIT_LABELS[reason] ?? reason, trades.filter((t) => t.exitReason === reason)] as [string, string, Trade[]],
    ),
  );
  push(bucketsPanel(
    "exit",
    "Exit reasons",
    "Average R per exit reason, each with its n. Manual closes sitting below trailing stops is the classic patience leak.",
    "Average R per exit reason",
    exitBuckets,
  ));

  // Slippage proxy: planned R:R vs realized R.
  push(scatterPanel(
    "slippage",
    "Planned vs realized",
    "Every dot is a trade with a planned R:R. On the diagonal the plan was delivered; below it, the market (or the trader) took the difference.",
    "Planned R multiple versus realized R multiple per trade",
    "r",
    "Planned R:R",
    "Realized R",
    planned.map((t) => ({ x: Number(t.plannedRR!), y: rOf(t), label: `${t.tradingDate} · realized ${round2(rOf(t))}R` })),
    true,
  ));

  // MFE capture histogram.
  const captureBins: [string, (t: Trade) => boolean, PanelInk][] = [
    ["< 25%", (t) => rOf(t) < 0 && Number(t.mfeR) > 0 && rOf(t) / Number(t.mfeR) < 0.25, "loss"],
    ["25–50%", (t) => rOf(t) >= 0 && rOf(t) / Number(t.mfeR) < 0.5, "warning"],
    ["50–75%", (t) => rOf(t) >= 0 && rOf(t) / Number(t.mfeR) < 0.75, "accent"],
    ["≥ 75%", (t) => rOf(t) >= 0 && rOf(t) / Number(t.mfeR) >= 0.75, "profit"],
    ["Gave it back", (t) => rOf(t) <= 0 && Number(t.mfeR) >= 1, "loss"],
  ];
  push(barsPanel(
    "efficiency",
    "MFE capture",
    "How much of the best favorable excursion each trade actually banked. \"Gave it back\" counts trades that saw ≥ 1R and closed at or below zero.",
    "Count of trades per MFE capture bucket",
    "count",
    captureBins.map(([label, match, ink]) => ({
      label,
      value: withMfe.filter(match).length,
      ink,
    })),
  ));

  return { kpis, panels };
}

function buildStrategy(ctx: AtlasContext): SectionBuild {
  const { trades, strategies } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const withStrategy = trades.filter((t) => t.strategyId !== null);
  const perStrategy = strategies
    .map((strategy) => ({
      strategy,
      group: withStrategy.filter((t) => t.strategyId === strategy.id),
    }))
    .filter((row) => row.group.length > 0)
    .map((row) => ({ ...row, avgR: row.group.reduce((s, t) => s + rOf(t), 0) / row.group.length }))
    .sort((a, b) => b.avgR - a.avgR);
  const best = perStrategy[0];
  const worst = perStrategy[perStrategy.length - 1];
  const outOfPlaybook = trades.filter((t) => t.strategyId === null).length;

  kpis.push(
    kpi("strategies", "Setups traded", perStrategy.length, "count", "accent", "playbook strategies"),
    kpi("best", "Best setup", best ? best.avgR : null, "r", "profit", best?.strategy.name ?? null),
    kpi("worst", "Worst setup", worst ? worst.avgR : null, "r", "loss", worst?.strategy.name ?? null),
    kpi("outOfPlaybook", "Out of playbook", outOfPlaybook, "count", "warning", "no setup linked"),
  );

  // Setup performance — avg R per strategy (the Strategy Performance table
  // itself is rendered client-side from /strategies/stats + distributions).
  push(bucketsPanel(
    "setup",
    "Setup performance",
    "Average R per playbook setup, each with its n. A setup with 3 trades is a hypothesis; one with 30 is a decision.",
    "Average R per playbook strategy",
    bucketsBy(perStrategy.map(({ strategy, group }) => [strategy.id, strategy.name, group] as [string, string, Trade[]])),
  ));

  // Rule adherence — followed the plan or not.
  const graded = trades.filter((t) => t.followedPlan !== null);
  const followed = graded.filter((t) => t.followedPlan === true);
  const deviated = graded.filter((t) => t.followedPlan === false);
  push(donutPanel(
    "adherence",
    "Plan adherence",
    "Share of graded trades where you followed your own plan. The honest denominator: only trades you actually graded.",
    "Share of trades that followed the declared plan",
    `${graded.length} graded`,
    [
      { label: "Followed plan", value: followed.length, ink: "profit" },
      { label: "Deviated", value: deviated.length, ink: "loss" },
    ],
  ));
  push(bucketsPanel(
    "adherence",
    "Adherence pays?",
    "Average R when the plan was followed versus when it was deviated from. If deviation outperforms, the plan — not the discipline — needs work.",
    "Average R for followed versus deviated trades",
    bucketsBy([
      ["followed", "Followed plan", followed],
      ["deviated", "Deviated", deviated],
    ]),
  ));

  return { kpis, panels };
}

function buildMarket(ctx: AtlasContext): SectionBuild {
  const { trades, instruments } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const instrumentOf = (trade: Trade): Instrument | undefined =>
    instruments.find((i) => i.id === trade.instrumentId);
  const bySymbol = new Map<string, Trade[]>();
  for (const trade of trades) {
    const symbol = instrumentOf(trade)?.symbol ?? "?";
    const list = bySymbol.get(symbol) ?? [];
    list.push(trade);
    bySymbol.set(symbol, list);
  }
  const symbolRows = [...bySymbol.entries()]
    .map(([symbol, group]) => ({ symbol, group, avgR: group.reduce((s, t) => s + rOf(t), 0) / group.length }))
    .sort((a, b) => b.avgR - a.avgR);
  const mostTraded = [...bySymbol.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const classes = [...new Set(instruments.map((i) => i.assetClass))].filter((cls) =>
    trades.some((t) => instrumentOf(t)?.assetClass === cls),
  );

  kpis.push(
    kpi("symbols", "Symbols traded", bySymbol.size, "count", "accent"),
    kpi("bestSymbol", "Best symbol", symbolRows[0]?.avgR ?? null, "r", "profit", symbolRows[0]?.symbol ?? null),
    kpi("mostTraded", "Most traded", mostTraded?.[1].length ?? null, "count", "warning", mostTraded?.[0] ?? null),
    kpi("classes", "Asset classes", classes.length, "count", "accent", classes.slice(0, 3).join(" · ") || null),
  );

  push(bucketsPanel(
    "symbol",
    "Per symbol",
    "Average R per symbol, best first. Concentrate size where the sample is big and the average is green — treat thin green cells as clues.",
    "Average R per traded symbol",
    bucketsBy(symbolRows.map(({ symbol, group }) => [symbol, symbol, group] as [string, string, Trade[]])),
  ));

  // Asset class donut + per-class buckets.
  const classGroups = classes.map((cls) => ({
    cls,
    group: trades.filter((t) => instrumentOf(t)?.assetClass === cls),
  }));
  const CLASS_INKS: PanelInk[] = ["accent", "profit", "warning", "loss"];
  push(donutPanel(
    "asset-class",
    "Asset class mix",
    "Where your trades actually live. A class with a fat slice earns the right to its own deep-dive.",
    "Share of trades per asset class",
    `${trades.length} closed`,
    classGroups.map((row, index) => ({
      label: row.cls,
      value: row.group.length,
      ink: CLASS_INKS[index % CLASS_INKS.length] ?? "accent",
    })),
  ));
  push(bucketsPanel(
    "asset-class",
    "Per asset class",
    "Average R per asset class. Different classes breathe differently — an edge in synthetic indices says nothing about forex.",
    "Average R per asset class",
    bucketsBy(classGroups.map(({ cls, group }) => [cls, cls, group] as [string, string, Trade[]])),
  ));

  // Market regime — derived deterministically from the trading day.
  push(bucketsPanel(
    "regime",
    "Market regime",
    "Average R by the day's dominant regime, labeled from the journal's session context. Most edges only live in one of the three columns.",
    "Average R per market regime",
    bucketsBy(REGIMES.map(([key, label]) => [key, label, trades.filter((t) => regimeKeyOf(t) === key)] as [string, string, Trade[]])),
  ));

  return { kpis, panels };
}

function buildTime(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const hourBucketOf = (trade: Trade): number => {
    const hour = new Date(trade.entryAt).getUTCHours();
    const index = ANALYTICS_HOUR_BUCKETS.findIndex((b) => hour >= b.from && hour < b.to);
    return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
  };
  const weekdayOf = (trade: Trade): number => new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();
  const sessionOf = (trade: Trade): string => {
    const hour = new Date(trade.entryAt).getUTCHours();
    const session = ANALYTIC_SESSIONS.find((s) => s.hours.includes(hour));
    return session?.key ?? "NEW_YORK";
  };

  const hourBuckets = ANALYTICS_HOUR_BUCKETS.map((bucket, index) =>
    bucketOf(String(index), bucket.label, trades.filter((t) => hourBucketOf(t) === index)),
  );
  const weekdayBuckets = ANALYTICS_WEEKDAYS.map((weekday) =>
    bucketOf(String(weekday.index), weekday.label, trades.filter((t) => weekdayOf(t) === weekday.index)),
  );
  const sessionBuckets = ANALYTIC_SESSIONS.map((session) =>
    bucketOf(session.key, session.label, trades.filter((t) => sessionOf(t) === session.key)),
  );
  const timeframeBuckets = TIMEFRAMES.map((tf) =>
    bucketOf(tf, tf, trades.filter((t) => timeframeOf(t) === tf)),
  );

  const bestOf = (buckets: AnalyticsBucket[]): AnalyticsBucket | undefined =>
    [...buckets].filter((b) => b.avgR !== null && b.trades > 0).sort((a, b) => Number(b.avgR) - Number(a.avgR))[0];
  const busiest = [...hourBuckets].sort((a, b) => b.trades - a.trades)[0];

  kpis.push(
    kpi("busiest", "Busiest window", busiest?.trades ?? null, "count", "accent", busiest ? `${busiest.label} UTC` : null),
    kpi("bestHour", "Best hour", Number(bestOf(hourBuckets)?.avgR ?? null), "r", "profit", bestOf(hourBuckets)?.label ?? null),
    kpi("bestDay", "Best weekday", Number(bestOf(weekdayBuckets)?.avgR ?? null), "r", "profit", bestOf(weekdayBuckets)?.label ?? null),
    kpi("bestSession", "Best session", Number(bestOf(sessionBuckets)?.avgR ?? null), "r", "profit", bestOf(sessionBuckets)?.label ?? null),
  );

  push(bucketsPanel(
    "hour",
    "By the clock",
    "Average R per UTC hour bucket. Every bar carries its n — an edge claimed on three trades is a rumor.",
    "Average R per UTC hour bucket",
    hourBuckets,
  ));
  push(bucketsPanel(
    "day",
    "By weekday",
    "Average R per weekday, Monday first. The calendar is a variable, not a backdrop.",
    "Average R per weekday",
    weekdayBuckets,
  ));
  push(bucketsPanel(
    "session",
    "By session",
    "Asia, London, New York — the same R lens over the session clock. Session edges are the most stable ones traders find.",
    "Average R per trading session",
    sessionBuckets,
  ));
  push(bucketsPanel(
    "timeframe",
    "By timeframe",
    "Average R per the chart timeframe the setup was played on. Multi-timeframe traders: check whether your H1 self earns more than your M1 self.",
    "Average R per chart timeframe",
    timeframeBuckets,
  ));

  return { kpis, panels };
}

function buildPsychology(ctx: AtlasContext): SectionBuild {
  const { trades, dailyStats, skippedTrades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const emotionBuckets = [...new Set(trades.map((t) => t.emotionBefore).filter((e): e is NonNullable<typeof e> => e !== null))]
    .map((emotion) => bucketOf(emotion, EMOTION_LABELS[emotion] ?? emotion, trades.filter((t) => t.emotionBefore === emotion)))
    .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
  const worstEmotion = emotionBuckets[0];
  const bestEmotion = emotionBuckets[emotionBuckets.length - 1];
  const emotionCounts = new Map<string, number>();
  for (const trade of trades) {
    if (trade.emotionBefore === null) continue;
    emotionCounts.set(trade.emotionBefore, (emotionCounts.get(trade.emotionBefore) ?? 0) + 1);
  }
  const dominant = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const sleeps = dailyStats.filter((s) => s.sleepHours !== null);
  const avgSleep = sleeps.length > 0
    ? sleeps.reduce((sum, s) => sum + Number(s.sleepHours), 0) / sleeps.length
    : null;

  kpis.push(
    kpi("dominant", "Dominant emotion", dominant?.[1] ?? null, "count", "accent", dominant ? (EMOTION_LABELS[dominant[0]] ?? dominant[0]) : null),
    kpi("bestEmotion", "Best state", Number(bestEmotion?.avgR ?? null), "r", "profit", bestEmotion?.label ?? null),
    kpi("worstEmotion", "Worst state", Number(worstEmotion?.avgR ?? null), "r", "loss", worstEmotion?.label ?? null),
    kpi("avgSleep", "Avg sleep", avgSleep, "plain", "warning", sleeps.length > 0 ? `${round2(avgSleep ?? 0)} h over ${sleeps.length} days` : null),
  );

  push(bucketsPanel(
    "emotions",
    "Emotions",
    "Average R per pre-trade emotion, worst first. The top of this chart is where your discipline leaks — the bottom is the state worth protecting.",
    "Average R per pre-trade emotion, worst first",
    emotionBuckets,
  ));

  // Discipline line: fear vs discipline skips over the last 30 days.
  const byDay = new Map<string, { fear: number; discipline: number }>();
  const today = new Date().toISOString().slice(0, 10);
  for (let offset = 29; offset >= 0; offset -= 1) {
    const key = new Date(new Date(`${today}T00:00:00Z`).getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    byDay.set(key, { fear: 0, discipline: 0 });
  }
  for (const skip of skippedTrades) {
    const key = skip.seenAt.slice(0, 10);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (skip.reason === "FEAR") bucket.fear += 1;
    else if (skip.reason === "DISCIPLINE") bucket.discipline += 1;
  }
  const labels = [...byDay.keys()];
  push(linePanel(
    "discipline",
    "Fear vs discipline",
    "Daily skip counts over the last 30 days: fear skips (you saw the setup and froze) versus discipline skips (the setup wasn't there). Emerald above ochre is the healthy shape.",
    "Daily fear and discipline skip counts over the last 30 days",
    "count",
    labels.map((label) => label.slice(5)),
    [
      { name: "Fear skips", ink: "warning", points: labels.map((label) => byDay.get(label)?.fear ?? 0) },
      { name: "Discipline skips", ink: "profit", points: labels.map((label) => byDay.get(label)?.discipline ?? 0) },
    ],
  ));

  return { kpis, panels };
}

function buildQuality(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const graded = trades.filter((t) => t.decisionGrade !== null);
  const abShare = graded.length > 0
    ? graded.filter((t) => t.decisionGrade === "A" || t.decisionGrade === "B").length / graded.length
    : null;
  const planAdherence = graded.length > 0
    ? graded.filter((t) => t.followedPlan === true).length / graded.length
    : null;
  const withMfe = trades.filter((t) => t.mfeR !== null && Number(t.mfeR) > 0);
  const capture = withMfe.length > 0
    ? withMfe.reduce((s, t) => s + Math.min(1, Math.max(0, rOf(t) / Number(t.mfeR!))), 0) / withMfe.length
    : null;

  kpis.push(
    kpi("graded", "Graded trades", graded.length, "count", "accent", `${trades.length - graded.length} awaiting a grade`),
    kpi("adherence", "Plan adherence", planAdherence === null ? null : planAdherence * 100, "percent", "profit", "graded trades only"),
    kpi("abShare", "A & B grades", abShare === null ? null : abShare * 100, "percent", "accent", "share of graded decisions"),
    kpi("capture", "MFE capture", capture === null ? null : capture * 100, "percent", "warning", "realized ÷ best excursion"),
  );

  // MAE scatter — pain endured vs outcome.
  const maePoints = trades
    .filter((t) => t.maeR !== null && Number(t.maeR) !== 0)
    .map((t) => ({ x: Math.abs(Number(t.maeR!)), y: rOf(t), label: `${t.tradingDate} · MAE ${round2(Math.abs(Number(t.maeR!)))}R` }));
  push(scatterPanel(
    "mae",
    "MAE vs outcome",
    "Maximum adverse excursion (magnitude, in R) against the realized result. Deep-MAE winners are lucky entries; deep-MAE losers are late entries.",
    "Maximum adverse excursion versus realized R per trade",
    "r",
    "MAE (R, magnitude)",
    "Realized R",
    maePoints,
    false,
  ));

  // MFE scatter — the capture diagonal.
  const mfePoints = trades
    .filter((t) => t.mfeR !== null && Number(t.mfeR) > 0)
    .map((t) => ({ x: Number(t.mfeR!), y: rOf(t), label: `${t.tradingDate} · MFE ${round2(Number(t.mfeR!))}R` }));
  push(scatterPanel(
    "mfe",
    "MFE vs outcome",
    "Best favorable excursion (R) against the realized result. Dots below the diagonal are profits the market offered and the journal didn't take.",
    "Maximum favorable excursion versus realized R per trade",
    "r",
    "MFE (R)",
    "Realized R",
    mfePoints,
    true,
  ));

  return { kpis, panels };
}

function buildMistakes(ctx: AtlasContext): SectionBuild {
  const { trades, mistakes } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  // The all-time ledger already aggregates counts and R cost per mistake —
  // reuse it as the single source of truth for this section.
  const rCostTotal = mistakes.reduce((s, m) => s + Number(m.rCost), 0);
  const countTotal = mistakes.reduce((s, m) => s + m.count, 0);
  const mostFrequent = [...mistakes].sort((a, b) => b.count - a.count)[0];
  const cleanShare = countTotal === 0 ? 1 : Math.max(0, 1 - countTotal / Math.max(1, trades.length));

  kpis.push(
    kpi("violations", "Mistakes logged", countTotal, "count", "loss", "all-time occurrences"),
    kpi("cost", "Total R cost", rCostTotal, "r", "loss", "Σ R over tagged trades"),
    kpi("frequent", "Most frequent", mostFrequent?.count ?? null, "count", "warning", mostFrequent?.label ?? null),
    kpi("clean", "Clean trades", cleanShare * 100, "percent", "profit", "no mistake tagged"),
  );

  // Cost of mistakes — R per mistake, most expensive first.
  push(barsPanel(
    "cost",
    "Cost of mistakes",
    "Σ R per mistake, most expensive first. This chart is the price list of your leaks — sort your week around the top three.",
    "R cost per mistake category, most expensive first",
    "r",
    [...mistakes]
      .sort((a, b) => Number(a.rCost) - Number(b.rCost))
      .slice(0, 10)
      .map((m) => ({ label: m.label, value: Number(m.rCost), n: m.count, ink: "loss" as PanelInk })),
  ));

  // Violations per month (last 6 months with any).
  const byMonth = new Map<string, number>();
  for (const m of mistakes) {
    if (m.lastSeenAt === null) continue;
    const key = m.lastSeenAt.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + m.count);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  push(barsPanel(
    "adherence",
    "Violations by month",
    "Mistake occurrences by month of last sighting. The trend matters more than the total: a shrinking bar means the ledger is working.",
    "Mistake occurrences per month",
    "count",
    months.map(([month, count]) => ({ label: month, value: count, ink: "warning" as PanelInk })),
  ));

  return { kpis, panels };
}

function buildEvents(ctx: AtlasContext): SectionBuild {
  const { trades, ecoEvents } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const withDistance = trades
    .map((trade) => ({ trade, distance: eventDistanceOf(trade, ecoEvents) }))
    .filter((row): row is { trade: Trade; distance: number } => row.distance !== null);
  const near = withDistance.filter(({ distance }) => Math.abs(distance) <= 2);
  const dayOf = withDistance.filter(({ distance }) => distance === 0);
  const quiet = trades.filter((t) => eventDistanceOf(t, ecoEvents) === null);
  const avgOf = (group: Trade[]): number | null =>
    group.length === 0 ? null : group.reduce((s, t) => s + rOf(t), 0) / group.length;
  const pastEvents = ecoEvents
    .filter((e) => e.impact !== "LOW" && new Date(e.scheduledAt).getTime() < Date.now())
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 8);

  kpis.push(
    kpi("events", "Events tracked", pastEvents.length, "count", "accent", "high & medium impact, past"),
    kpi("near", "Trades near events", near.length, "count", "warning", "within ±2 days"),
    kpi("dayR", "Event-day avg R", avgOf(dayOf.map((row) => row.trade)), "r", dayOf.length > 0 && avgOf(dayOf.map((row) => row.trade))! < 0 ? "loss" : "profit", "day of release"),
    kpi("quietR", "Quiet-day avg R", avgOf(quiet), "r", "profit", "no event within ±5 days"),
  );

  const beforeGroup = (from: number, to: number) =>
    withDistance.filter(({ distance }) => distance >= from && distance <= to).map(({ trade }) => trade);
  const afterGroup = (from: number, to: number) =>
    withDistance.filter(({ distance }) => distance >= from && distance <= to).map(({ trade }) => trade);

  push(barsPanel(
    "before",
    "Before the event",
    "Average R on the two days preceding a high/medium-impact release. Pre-event drift trades are a style — know whether yours pays.",
    "Average R on days before economic events",
    "r",
    [
      { label: "T-2 days", value: avgOf(beforeGroup(-2, -2)), n: beforeGroup(-2, -2).length },
      { label: "T-1 day", value: avgOf(beforeGroup(-1, -1)), n: beforeGroup(-1, -1).length },
    ],
  ));

  push(tablePanel(
    "during",
    "On the day",
    "Recent high and medium impact releases with the trades you took that day. The honest sample: only days you actually traded.",
    "Recent economic events with same-day trade statistics",
    ["Event", "Cur", "Impact", "Date", "Trades", "Avg R"],
    [4, 5],
    pastEvents.map((event) => {
      const day = event.scheduledAt.slice(0, 10);
      const group = trades.filter((t) => t.tradingDate === day);
      const avg = avgOf(group);
      return {
        id: event.id,
        cells: [
          cell(event.title, { strong: true }),
          cell(event.currency, { mono: true }),
          cell(event.impact, { ink: event.impact === "HIGH" ? "loss" : "warning", mono: true }),
          cell(day, { mono: true }),
          cell(String(group.length), { mono: true }),
          cell(avg === null ? "—" : `${avg >= 0 ? "+" : ""}${round2(avg)}R`, { mono: true, ink: avg === null ? null : signedInk(avg) }),
        ],
      };
    }),
    "Impact uses the calendar's own scale (HIGH / MEDIUM).",
  ));

  push(barsPanel(
    "after",
    "After the event",
    "Average R on the two days following a release. Post-event continuation and post-event hangover are different systems — your data picks which one you run.",
    "Average R on days after economic events",
    "r",
    [
      { label: "T+1 day", value: avgOf(afterGroup(1, 1)), n: afterGroup(1, 1).length },
      { label: "T+2 days", value: avgOf(afterGroup(2, 2)), n: afterGroup(2, 2).length },
    ],
  ));

  return { kpis, panels };
}

function buildAdvanced(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const rs = trades.map(rOf);
  const stats = rStats(rs);
  const winRate = trades.length > 0 ? trades.filter(isWin).length / trades.length : 0;

  kpis.push(
    kpi("std", "Std dev (R)", stats.std, "r", "accent", "per-trade dispersion"),
    kpi("tStat", "t-stat", stats.tStat, "plain", "accent", "expectancy significance"),
    kpi("sharpe", "Sharpe (trade)", stats.sharpe, "plain", "profit", "mean R ÷ std R"),
    kpi("skew", "Skew", stats.skew, "plain", "warning", "positive = fat right tail"),
  );

  push(tablePanel(
    "metrics",
    "Statistical metrics",
    "The distribution's vital signs, computed per trade in R. t-stat above ~2 on 50+ trades is the honest line between edge and noise.",
    "Statistical properties of the R distribution",
    ["Metric", "Value", "Reading"],
    [1],
    [
      { id: "sample", cells: [cell("Sample", { strong: true }), cell(String(trades.length), { mono: true }), cell("closed trades")] },
      { id: "mean", cells: [cell("Mean R", { strong: true }), cell(`${stats.mean >= 0 ? "+" : ""}${round2(stats.mean)}`, { mono: true, ink: signedInk(stats.mean) }), cell("expectancy")] },
      { id: "std", cells: [cell("Std dev", { strong: true }), cell(round2(stats.std).toFixed(2), { mono: true, ink: "accent" }), cell("dispersion per trade")] },
      { id: "t", cells: [cell("t-stat", { strong: true }), cell(stats.tStat === null ? "—" : round2(stats.tStat).toFixed(2), { mono: true, ink: "accent" }), cell("≥ 2 is the usual bar")] },
      { id: "sharpe", cells: [cell("Sharpe", { strong: true }), cell(stats.sharpe === null ? "—" : round2(stats.sharpe).toFixed(2), { mono: true, ink: "profit" }), cell("per trade, not annualized")] },
      { id: "sortino", cells: [cell("Sortino", { strong: true }), cell(stats.sortino === null ? "—" : round2(stats.sortino).toFixed(2), { mono: true, ink: "profit" }), cell("downside-adjusted")] },
      { id: "skew", cells: [cell("Skew", { strong: true }), cell(stats.skew === null ? "—" : round2(stats.skew).toFixed(2), { mono: true, ink: "warning" }), cell("fat right tail = big winners")] },
      { id: "win", cells: [cell("Win rate", { strong: true }), cell(`${round2(winRate * 100)}%`, { mono: true, ink: "accent" }), cell("wins ÷ closed")] },
    ],
    "All metrics computed on the closed-trade R series.",
  ));

  // Rolling 20-trade expectancy.
  const window = 20;
  const rolling: number[] = [];
  const rollingLabels: string[] = [];
  for (let i = window; i <= rs.length; i += 1) {
    const slice = rs.slice(i - window, i);
    rolling.push(slice.reduce((s, r) => s + r, 0) / window);
    rollingLabels.push(trades[i - 1]?.tradingDate ?? `#${i}`);
  }
  push(linePanel(
    "distribution",
    "Rolling expectancy",
    `Expectancy over a rolling ${window}-trade window. A rising line is an edge compounding; a dip below zero is the coach's question, not a verdict.`,
    "Rolling 20-trade expectancy line",
    "r",
    rollingLabels,
    [{ name: "Rolling expectancy (R)", ink: "accent", points: rolling }],
  ));

  // Correlation — symbol × session heatmap.
  const instruments = ctx.instruments;
  const symbolOf = (trade: Trade): string => instruments.find((i) => i.id === trade.instrumentId)?.symbol ?? "?";
  const sessionOf = (trade: Trade): string => {
    const hour = new Date(trade.entryAt).getUTCHours();
    const session = ANALYTIC_SESSIONS.find((s) => s.hours.includes(hour));
    return session?.key ?? "NEW_YORK";
  };
  const symbols = [...new Set(trades.map(symbolOf))];
  const heatCells = symbols.flatMap((symbol, row) =>
    ANALYTIC_SESSIONS.map((session, col) => {
      const group = trades.filter((t) => symbolOf(t) === symbol && sessionOf(t) === session.key);
      return {
        row,
        col,
        avgR: group.length === 0 ? null : group.reduce((s, t) => s + rOf(t), 0) / group.length,
        trades: group.length,
      };
    }),
  );
  push(heatmapPanel(
    "correlation",
    "Symbol × session",
    "Average R per symbol and session combination. The green pockets are where symbol and clock agree with you — this is the correlation the coach watches.",
    "Heatmap of average R per symbol and session",
    ANALYTIC_SESSIONS.map((s) => s.label),
    symbols,
    heatCells,
  ));

  // Monte Carlo — resample the ledger's R series, 300 paths of 50 trades.
  const STEPS = 50;
  const PATHS = 300;
  const stepValues: number[][] = Array.from({ length: STEPS + 1 }, () => []);
  // mulberry32 — a 32-bit-safe PRNG (the naive LCG overflows JS doubles and
  // degenerates to a flat line, which is exactly what happened in v1).
  let seed = Math.round(Math.abs(rs.reduce((s, r) => s + r * 100, 41))) + rs.length;
  const nextRandom = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let path = 0; path < PATHS; path += 1) {
    let cumulative = 0;
    stepValues[0]!.push(0);
    for (let step = 1; step <= STEPS; step += 1) {
      const pick = rs[Math.floor(nextRandom() * rs.length)] ?? 0;
      cumulative += pick;
      stepValues[step]!.push(cumulative);
    }
  }
  const percentileOf = (values: number[], p: number): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  };
  const p5 = stepValues.map((values) => percentileOf(values, 0.05));
  const p25 = stepValues.map((values) => percentileOf(values, 0.25));
  const p50 = stepValues.map((values) => percentileOf(values, 0.5));
  const p75 = stepValues.map((values) => percentileOf(values, 0.75));
  const p95 = stepValues.map((values) => percentileOf(values, 0.95));
  const stepLabels = Array.from({ length: STEPS + 1 }, (_, i) => `+${i}`);
  push(linePanel(
    "monte-carlo",
    "Monte Carlo",
    `Your R series resampled ${PATHS} times over the next ${STEPS} trades. If the lower band can spend a long stretch under zero, the sizing is too loud for the edge.`,
    "Monte Carlo percentile bands of cumulative R over the next 50 trades",
    "r",
    stepLabels,
    [{ name: "Median path", ink: "accent", points: p50 }],
    [
      { name: "Middle 50%", ink: "accent", lower: p25, upper: p75 },
      { name: "Middle 90%", ink: "accent", lower: p5, upper: p95 },
    ],
  ));

  return { kpis, panels };
}

function buildReports(ctx: AtlasContext): SectionBuild {
  const { trades } = ctx;
  const kpis: PanelKpi[] = [];
  const panels: AnalyticsPanel[] = [];
  const push: PanelSink = (p) => panels.push(p);

  const byDay = new Map<string, Trade[]>();
  for (const trade of trades) {
    const list = byDay.get(trade.tradingDate) ?? [];
    list.push(trade);
    byDay.set(trade.tradingDate, list);
  }
  const dayRows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dayStats = dayRows.map(([date, group]) => {
    const net = group.reduce((s, t) => s + pnlOf(t), 0);
    const avgR = group.reduce((s, t) => s + rOf(t), 0) / group.length;
    const wins = group.filter(isWin).length;
    return { date, group, net, avgR, winRate: wins / group.length };
  });
  const bestDay = [...dayStats].sort((a, b) => b.net - a.net)[0];
  const worstDay = [...dayStats].sort((a, b) => a.net - b.net)[0];
  const avgDaily = dayStats.length > 0 ? dayStats.reduce((s, d) => s + d.net, 0) / dayStats.length : null;

  kpis.push(
    kpi("days", "Days traded", dayStats.length, "count", "accent"),
    kpi("bestDay", "Best day", bestDay?.net ?? null, "money", "profit", bestDay?.date ?? null),
    kpi("worstDay", "Worst day", worstDay?.net ?? null, "money", "loss", worstDay?.date ?? null),
    kpi("avgDay", "Avg day", avgDaily, "money", signedInk(avgDaily ?? 0), "per active day"),
  );

  const money = (v: number): string => `${v < 0 ? "−" : "+"}$${Math.abs(round2(v)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const pct = (v: number): string => `${round2(v * 100)}%`;
  const rTxt = (v: number): string => `${v >= 0 ? "+" : ""}${round2(v)}R`;

  push(tablePanel(
    "daily",
    "Daily report",
    "The last ten trading days, one row each. Three red rows in a row is a pattern; ten green ones is a review of your risk.",
    "Daily trading report for the last ten active days",
    ["Date", "Trades", "Net P&L", "Avg R", "Win rate"],
    [1, 2, 3, 4],
    [...dayStats]
      .slice(-10)
      .reverse()
      .map((row) => ({
        id: row.date,
        cells: [
          cell(row.date, { mono: true, strong: true }),
          cell(String(row.group.length), { mono: true }),
          cell(money(row.net), { mono: true, ink: signedInk(row.net) }),
          cell(rTxt(row.avgR), { mono: true, ink: signedInk(row.avgR) }),
          cell(pct(row.winRate), { mono: true }),
        ],
      })),
  ));

  const byWeek = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = weekStartOf(trade.tradingDate);
    const list = byWeek.get(key) ?? [];
    list.push(trade);
    byWeek.set(key, list);
  }
  const weekRows = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  push(tablePanel(
    "weekly",
    "Weekly report",
    "Six most recent trading weeks, Monday-anchored. The weekly window is where strategy decisions belong.",
    "Weekly trading report for the last six weeks",
    ["Week of", "Trades", "Net P&L", "Avg R", "Win rate"],
    [1, 2, 3, 4],
    weekRows.map(([week, group]) => {
      const net = group.reduce((s, t) => s + pnlOf(t), 0);
      const avgR = group.reduce((s, t) => s + rOf(t), 0) / group.length;
      const winRate = group.filter(isWin).length / group.length;
      return {
        id: week,
        cells: [
          cell(week, { mono: true, strong: true }),
          cell(String(group.length), { mono: true }),
          cell(money(net), { mono: true, ink: signedInk(net) }),
          cell(rTxt(avgR), { mono: true, ink: signedInk(avgR) }),
          cell(pct(winRate), { mono: true }),
        ],
      };
    }),
  ));

  const byMonth = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = monthKeyOf(trade.tradingDate);
    const list = byMonth.get(key) ?? [];
    list.push(trade);
    byMonth.set(key, list);
  }
  const monthRows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  push(tablePanel(
    "monthly",
    "Monthly report",
    "Six most recent months. The monthly lens is the quietest one — it tells you whether the year is working.",
    "Monthly trading report for the last six months",
    ["Month", "Trades", "Win rate", "Avg R", "Net P&L"],
    [1, 2, 3, 4],
    monthRows.map(([month, group]) => {
      const net = group.reduce((s, t) => s + pnlOf(t), 0);
      const avgR = group.reduce((s, t) => s + rOf(t), 0) / group.length;
      const winRate = group.filter(isWin).length / group.length;
      return {
        id: month,
        cells: [
          cell(month, { mono: true, strong: true }),
          cell(String(group.length), { mono: true }),
          cell(pct(winRate), { mono: true }),
          cell(rTxt(avgR), { mono: true, ink: signedInk(avgR) }),
          cell(money(net), { mono: true, ink: signedInk(net) }),
        ],
      };
    }),
  ));

  // Custom window — last 30 vs previous 30 days.
  const nowMs = Date.now();
  const inWindow = (trade: Trade, from: number, to: number): boolean => {
    const ms = new Date(`${trade.tradingDate}T00:00:00Z`).getTime();
    return ms >= from && ms < to;
  };
  const windowStat = (label: string, from: number, to: number) => {
    const group = trades.filter((t) => inWindow(t, from, to));
    const net = group.reduce((s, t) => s + pnlOf(t), 0);
    const avgR = group.length > 0 ? group.reduce((s, t) => s + rOf(t), 0) / group.length : null;
    const winRate = group.length > 0 ? group.filter(isWin).length / group.length : null;
    return {
      id: label,
      cells: [
        cell(label, { strong: true }),
        cell(String(group.length), { mono: true }),
        cell(group.length === 0 ? "—" : money(net), { mono: true, ink: group.length === 0 ? null : signedInk(net) }),
        cell(avgR === null ? "—" : rTxt(avgR), { mono: true, ink: avgR === null ? null : signedInk(avgR) }),
        cell(winRate === null ? "—" : pct(winRate), { mono: true }),
      ],
    };
  };
  const DAY = 86_400_000;
  push(tablePanel(
    "custom",
    "Custom window",
    "A rolling 30-day window against the previous one — the fastest honest read of whether things are getting better.",
    "Comparison of the last 30 days against the previous 30",
    ["Window", "Trades", "Net P&L", "Avg R", "Win rate"],
    [1, 2, 3, 4],
    [
      windowStat("Last 30 days", nowMs - 30 * DAY, nowMs + DAY),
      windowStat("Previous 30", nowMs - 60 * DAY, nowMs - 30 * DAY),
      windowStat("All time", 0, nowMs + DAY),
    ],
    "Windows are calendar-based on the trading date key.",
  ));

  return { kpis, panels };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export function buildAnalyticsSection(ctx: AtlasContext): AnalyticsSectionResponse {
  const known = new Set<string>([
    "overview", "performance", "risk", "execution", "strategy", "market", "time",
    "psychology", "quality", "mistakes", "events", "advanced", "reports",
  ]);
  if (!known.has(ctx.sectionId)) {
    throw new Error(`Unknown analytics section: ${ctx.sectionId}`);
  }

  const build =
    ctx.sectionId === "overview" ? buildOverview(ctx)
    : ctx.sectionId === "performance" ? buildPerformance(ctx)
    : ctx.sectionId === "risk" ? buildRisk(ctx)
    : ctx.sectionId === "execution" ? buildExecution(ctx)
    : ctx.sectionId === "strategy" ? buildStrategy(ctx)
    : ctx.sectionId === "market" ? buildMarket(ctx)
    : ctx.sectionId === "time" ? buildTime(ctx)
    : ctx.sectionId === "psychology" ? buildPsychology(ctx)
    : ctx.sectionId === "quality" ? buildQuality(ctx)
    : ctx.sectionId === "mistakes" ? buildMistakes(ctx)
    : ctx.sectionId === "events" ? buildEvents(ctx)
    : ctx.sectionId === "advanced" ? buildAdvanced(ctx)
    : buildReports(ctx);

  return {
    sectionId: ctx.sectionId,
    currency: ctx.currency,
    sampleTrades: ctx.trades.length,
    kpis: build.kpis,
    panels: build.panels,
  };
}
