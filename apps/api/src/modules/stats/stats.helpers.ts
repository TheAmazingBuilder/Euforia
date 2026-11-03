/**
 * Stats pure helpers - shared by the stats module (overview, analytics,
 * analytics-suite) AND the discipline module (mistake ledger, emotion
 * matrix). NOTHING here may import Nest or Prisma: pure functions over
 * normalized rows, mirroring the mock-store algorithms the frontend already
 * renders (single source of computation - the client only formats).
 */
import {
  ANALYTICS_HOUR_BUCKETS,
  ANALYTIC_SESSIONS,
  ANALYTICS_WEEKDAYS,
  EMOTION_LABELS,
  toDecimalString,
  toTradingDateKey,
} from "../../shared/contracts";
import type {
  AnalyticsBucket,
  AnalyticsFilters,
  Currency,
  MistakeCategory,
  StrategyGrade,
} from "../../shared/contracts";

// ── Normalized row shapes (mapped from Prisma at the service boundary) ──────

export interface StatsTradeRow {
  id: string;
  accountId: string;
  instrumentId: string;
  strategyId: string | null;
  status: string;
  direction: string;
  entryAt: string;
  exitAt: string | null;
  exitReason: string | null;
  pnlNet: string | null;
  rMultiple: string | null;
  riskAmount: string | null;
  plannedRR: string | null;
  followedPlan: boolean | null;
  decisionGrade: string | null;
  emotionBefore: string | null;
  emotionAfter: string | null;
  confidence: number | null;
  mfeR: string | null;
  maeR: string | null;
  /** YYYY-MM-DD user-local trading day (server-computed, §56). */
  tradingDate: string;
}

export interface StatsInstrumentRow {
  id: string;
  symbol: string;
  assetClass: string;
  quoteCurrency: string;
}

export interface StatsAccountRow {
  id: string;
  name: string;
  currency: string;
  startingBalance: string;
}

export interface StatsDailyStatRow {
  date: string;
  tradesCount: number;
  pnlNet: string;
  disciplineScore: string | null;
  sleepHours: string | null;
}

export interface StatsSkippedTradeRow {
  reason: string;
  outcomeGuess: string | null;
  hypotheticalR: string | null;
  seenAt: string;
}

export interface StatsMistakeRow {
  id: string;
  key: string;
  label: string;
  category: MistakeCategory;
  severity: number;
}

export interface StatsTradeMistakeRow {
  tradeId: string;
  mistakeId: string;
  createdAt: string;
}

export interface StatsStrategyRow {
  id: string;
  name: string;
  grade: StrategyGrade | null;
  color: string | null;
}

export interface StatsEcoEventRow {
  id: string;
  impact: string;
  currency: string;
  scheduledAt: string;
}

export interface StatsContext {
  /** ALL user trades (open + closed; soft-deleted excluded at the mapper). */
  trades: StatsTradeRow[];
  instruments: Map<string, StatsInstrumentRow>;
  accounts: StatsAccountRow[];
  dailyStats: StatsDailyStatRow[];
  skippedTrades: StatsSkippedTradeRow[];
  mistakes: StatsMistakeRow[];
  tradeMistakes: StatsTradeMistakeRow[];
  strategies: StatsStrategyRow[];
  ecoEvents: StatsEcoEventRow[];
  /** tradeId → tag ids (suite tag filter). */
  tradeTags: Map<string, Set<string>>;
  /** User timezone - the server trading-day clock (§56). */
  timezone: string;
  /** Main account currency (the response `currency`). */
  currency: Currency;
  /** Main account starting balance (equity anchor). */
  startingBalance: string;
}

// ── Numeric helpers ─────────────────────────────────────────────────────────

export const round2 = (value: number): number => Number(value.toFixed(2));
export const round1 = (value: number): number => Number(value.toFixed(1));

export const num = (value: string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Next calendar-day key (UTC date arithmetic on YYYY-MM-DD). */
export const shiftDayKey = (key: string): string => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/** Shift a calendar-day key by N days (UTC arithmetic on YYYY-MM-DD). */
export const shiftDayKeyBy = (key: string, days: number): string => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Inclusive calendar-day distance between two date keys. */
export const dayDiff = (from: string, to: string): number =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );

/** Round a histogram step to a human number (1/2/2.5/5 × 10^k). */
export const niceStep = (raw: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (raw <= multiple * magnitude) return multiple * magnitude;
  }
  return 10 * magnitude;
};

/** Deterministic PRNG - Monte Carlo bootstrap must be reproducible (§25). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export const meanOf = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

export const sortedCopy = (values: number[]): number[] => [...values].sort((a, b) => a - b);

export const percentileOf = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const list = sortedCopy(values);
  const pos = ((list.length - 1) * p) / 100;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return list[low]! + (list[high]! - list[low]!) * (pos - low);
};

export const medianOf = (values: number[]): number | null => percentileOf(values, 50);

export const stdOf = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const m = meanOf(values)!;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
};

// ── Period resolution (server trading-day clock - the client never derives
// "today"; CUSTOM falls back to ALL when bounds are absent) ──────────────────

export function resolvePeriodRange(
  filters: AnalyticsFilters,
  timezone: string,
): { from: string; to: string } {
  const today = toTradingDateKey(new Date().toISOString(), timezone);
  const parse = (key: string): Date => new Date(`${key}T00:00:00Z`);
  const format = (date: Date): string => date.toISOString().slice(0, 10);
  const shiftDays = (key: string, days: number): string => {
    const date = parse(key);
    date.setUTCDate(date.getUTCDate() + days);
    return format(date);
  };
  switch (filters.period) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const key = shiftDays(today, -1);
      return { from: key, to: key };
    }
    case "THIS_WEEK":
    case "LAST_WEEK": {
      // Monday-first week containing (today | today-7).
      const anchor = filters.period === "THIS_WEEK" ? today : shiftDays(today, -7);
      const weekday = parse(anchor).getUTCDay(); // 0 = Sunday
      const back = weekday === 0 ? 6 : weekday - 1;
      const monday = shiftDays(anchor, -back);
      return { from: monday, to: filters.period === "THIS_WEEK" ? today : shiftDays(monday, 6) };
    }
    case "THIS_MONTH": {
      const from = `${today.slice(0, 7)}-01`;
      return { from, to: today };
    }
    case "LAST_MONTH": {
      const firstOfThisMonth = `${today.slice(0, 7)}-01`;
      const lastOfPrev = shiftDays(firstOfThisMonth, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    case "THIS_QUARTER": {
      const month = Number(today.slice(5, 7)) - 1;
      const quarterMonth = Math.floor(month / 3) * 3 + 1;
      return { from: `${today.slice(0, 4)}-${String(quarterMonth).padStart(2, "0")}-01`, to: today };
    }
    case "THIS_YEAR":
    case "YTD":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "LAST_30":
      return { from: shiftDays(today, -29), to: today };
    case "LAST_90":
      return { from: shiftDays(today, -89), to: today };
    case "CUSTOM":
      if (filters.customFrom && filters.customTo && filters.customFrom <= filters.customTo) {
        return { from: filters.customFrom, to: filters.customTo };
      }
      return { from: "0000-01-01", to: "9999-12-31" };
    case "ALL":
    default:
      return { from: "0000-01-01", to: "9999-12-31" };
  }
}

// ── Bucket machinery (server-side aggregates; the client only formats) ──────

export function bucketOf(
  key: string,
  label: string,
  group: StatsTradeRow[],
): AnalyticsBucket {
  const count = group.length;
  const wins = group.filter((t) => num(t.pnlNet) > 0).length;
  const avgR = count > 0
    ? group.reduce((sum, t) => sum + num(t.rMultiple), 0) / count
    : null;
  return {
    key,
    label,
    trades: count,
    wins,
    avgR: avgR === null ? null : toDecimalString(round2(avgR)),
    winRate: count > 0 ? toDecimalString(round2(wins / count)) : null,
  };
}

export const weekdayOf = (trade: StatsTradeRow): number =>
  new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();

export const hourBucketIndex = (trade: StatsTradeRow): number => {
  const hour = new Date(trade.entryAt).getUTCHours();
  const index = ANALYTICS_HOUR_BUCKETS.findIndex(
    (bucket) => hour >= bucket.from && hour < bucket.to,
  );
  return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
};

export const sessionOf = (trade: StatsTradeRow): string | null => {
  const hour = new Date(trade.entryAt).getUTCHours();
  const session = ANALYTIC_SESSIONS.find((s) => s.hours.includes(hour));
  return session?.key ?? null;
};

export const emotionLabelOf = (emotion: string): string =>
  EMOTION_LABELS[emotion] ?? emotion;

// ── Mistake ledger (shared by stats analytics + discipline screen) ──────────

export interface MistakeLedgerResult {
  windowStart: string;
  entries: {
    mistakeId: string;
    key: string;
    label: string;
    category: MistakeCategory;
    severity: number;
    count: number;
    rCost: string;
    lastSeenAt: string | null;
  }[];
}

/**
 * All-time (or windowed) mistake ledger - most expensive first: cost
 * dominates, then frequency. `since` is a date key ("0000-01-01" = all).
 */
export function computeMistakeLedger(ctx: StatsContext, since: string): MistakeLedgerResult {
  const closed = ctx.trades.filter((t) => t.status === "CLOSED");
  const tradeById = new Map(closed.map((t) => [t.id, t]));
  const entries: MistakeLedgerResult["entries"] = [];
  for (const mistake of ctx.mistakes) {
    const windowRows = ctx.tradeMistakes
      .filter((m) => m.mistakeId === mistake.id)
      .map((m) => ({ row: m, trade: tradeById.get(m.tradeId) }))
      .filter((x): x is { row: StatsTradeMistakeRow; trade: StatsTradeRow } =>
        x.trade !== undefined && x.trade.tradingDate >= since,
      );
    if (windowRows.length === 0) continue;
    const rCost = windowRows.reduce((sum, x) => sum + num(x.trade.rMultiple), 0);
    const lastSeenAt = windowRows.reduce<string | null>(
      (latest, x) => (latest === null || x.row.createdAt > latest ? x.row.createdAt : latest),
      null,
    );
    entries.push({
      mistakeId: mistake.id,
      key: mistake.key,
      label: mistake.label,
      category: mistake.category,
      severity: mistake.severity,
      count: windowRows.length,
      rCost: toDecimalString(round2(rCost)),
      lastSeenAt,
    });
  }
  entries.sort(
    (a, b) => Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)) || b.count - a.count,
  );
  return { windowStart: since, entries };
}

// ── Weekday metadata re-export (suite + analytics share the same tables) ────

export const STATS_WEEKDAYS = ANALYTICS_WEEKDAYS;
export const STATS_HOUR_BUCKETS = ANALYTICS_HOUR_BUCKETS;
export const STATS_SESSIONS = ANALYTIC_SESSIONS;
