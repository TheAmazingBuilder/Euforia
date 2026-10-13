import type { Candle, MarketInterval } from "@cosmoz/shared";

/**
 * Chart market data — deterministic SIM engine (lib/charts).
 *
 * The Charts module prefers the authenticated market service feed (the same
 * candles the Session Live consumes, served on :3003). When the feed cannot
 * be reached, the module degrades to THIS engine instead of showing an empty
 * pane. Product honesty (mission §16): the UI labels the fallback "SIM" —
 * simulated data must never pretend to be real.
 *
 * Design constraints:
 *   - Deterministic — a seeded PRNG (fnv1a hash → mulberry32) drives every
 *     number; the same (symbol, interval, 6h epoch bucket) always regenerates
 *     the exact same series, so switching timeframes or re-mounting the page
 *     never reshuffles history under the user's eyes.
 *   - Realistic — bar-by-bar OHLC built from a volatility-scaled random walk
 *     with trend regimes (slow sine regimes per asset class), wicks, gaps and
 *     range-correlated volume; buckets aligned on UTC epoch boundaries.
 *   - Anchored — the walk is folded so the LAST bar lands on the instrument's
 *     2026 anchor price (within a small per-seed offset): the current price a
 *     user sees is always a plausible live level for that instrument.
 *
 * Instrument display specs come from the app's catalog fixture
 * (mocks/fixtures/catalog.ts) — the same universe Session Live trades. Only
 * the sim anchor prices live here, as data (never sizing constants).
 */

// ── Symbol specs ─────────────────────────────────────────────────────────────

export interface ChartSymbolSpec {
  symbol: string;
  name: string;
  /** 2026 sim anchor price — where the walk's LAST bar lands. */
  anchor: number;
  /** Display digits (drives the price scale + legend formatting). */
  digits: number;
  /** Smallest quoted increment (lightweight-charts priceFormat minMove). */
  minMove: number;
  /** One pip in price units (spread display) — e.g. 0.0001 forex, 0.01 gold. */
  pipSize: number;
  /** Typical bid/ask spread in price units (SELL/BUY badges). */
  spread: number;
  /** Daily volatility as a fraction of price (e.g. 0.009 ≈ 0.9%/day). */
  dailyVol: number;
  /** Amplitude of the slow trend regime, as a fraction of dailyVol. */
  trendStrength: number;
  /** Base volume per bar (range-correlated multiplier on top). */
  baseVolume: number;
}

export const CHART_SYMBOLS: readonly ChartSymbolSpec[] = [
  {
    symbol: "XAUUSD",
    name: "Gold Spot / U.S. Dollar",
    anchor: 4110.3,
    digits: 3,
    minMove: 0.001,
    pipSize: 0.01,
    spread: 0.57,
    dailyVol: 0.0095,
    trendStrength: 2.1,
    baseVolume: 12000,
  },
  {
    symbol: "EURUSD",
    name: "Euro / U.S. Dollar",
    anchor: 1.0865,
    digits: 5,
    minMove: 0.00001,
    pipSize: 0.0001,
    spread: 0.00012,
    dailyVol: 0.0045,
    trendStrength: 1.6,
    baseVolume: 88000,
  },
  {
    symbol: "GBPUSD",
    name: "British Pound / U.S. Dollar",
    anchor: 1.2705,
    digits: 5,
    minMove: 0.00001,
    pipSize: 0.0001,
    spread: 0.00016,
    dailyVol: 0.0052,
    trendStrength: 1.8,
    baseVolume: 64000,
  },
  {
    symbol: "BTCUSDT",
    name: "Bitcoin / U.S. Dollar",
    anchor: 67340,
    digits: 1,
    minMove: 0.1,
    pipSize: 1,
    spread: 12,
    dailyVol: 0.026,
    trendStrength: 2.6,
    baseVolume: 3400,
  },
  {
    symbol: "BOOM500",
    name: "Boom 500 Index",
    anchor: 9820,
    digits: 2,
    minMove: 0.01,
    pipSize: 0.01,
    spread: 1.4,
    dailyVol: 0.014,
    trendStrength: 2.2,
    baseVolume: 5200,
  },
  {
    symbol: "CRASH500",
    name: "Crash 500 Index",
    anchor: 8340,
    digits: 2,
    minMove: 0.01,
    pipSize: 0.01,
    spread: 1.4,
    dailyVol: 0.014,
    trendStrength: 2.2,
    baseVolume: 5200,
  },
  {
    symbol: "VOL75(1s)",
    name: "Volatility 75 (1s) Index",
    anchor: 128400,
    digits: 2,
    minMove: 0.01,
    pipSize: 0.01,
    spread: 18,
    dailyVol: 0.021,
    trendStrength: 2.4,
    baseVolume: 4100,
  },
];

const SYMBOL_INDEX = new Map(CHART_SYMBOLS.map((spec) => [spec.symbol, spec]));

/** Resolves a chart symbol spec (falls back to the first instrument). */
export function getChartSymbol(symbol: string): ChartSymbolSpec {
  return SYMBOL_INDEX.get(symbol) ?? CHART_SYMBOLS[0];
}

// ── Interval math ────────────────────────────────────────────────────────────

/** Bar size in seconds for every interval of the shared contract. */
export const INTERVAL_SECONDS: Record<MarketInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
};

/** Toolbar labels (uppercase exchange convention) in display order. */
export const INTERVAL_TABS: { interval: MarketInterval; label: string }[] = [
  { interval: "1m", label: "1m" },
  { interval: "5m", label: "5m" },
  { interval: "15m", label: "15m" },
  { interval: "30m", label: "30m" },
  { interval: "1H", label: "1h" },
  { interval: "4H", label: "4h" },
  { interval: "1D", label: "D" },
];

/** How many candles the sim engine generates (and the pane keeps in memory). */
export const SIM_BAR_COUNT = 1000;

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

/** FNV-1a 32-bit — string → seed. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — tiny, fast, well-distributed PRNG. Deterministic by seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal from a uniform generator. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Candle generation ────────────────────────────────────────────────────────

/** The sim series is regenerated every 6h (stable within a session). */
const BUCKET_MS = 6 * 60 * 60 * 1000;

/**
 * Deterministic OHLCV history for one symbol + interval, ending at `nowMs`
 * (the last bucket is the current, still-forming bar). The walk is folded so
 * the final close lands on the instrument anchor — history before that is a
 * free, realistic path.
 */
export function generateSimCandles(
  spec: ChartSymbolSpec,
  interval: MarketInterval,
  nowMs: number,
  count = SIM_BAR_COUNT,
): Candle[] {
  const barSec = INTERVAL_SECONDS[interval];
  const barMs = barSec * 1000;
  const lastBucket = Math.floor(nowMs / barMs) * barMs;
  const seedText = `${spec.symbol}|${interval}|${Math.floor(nowMs / BUCKET_MS)}`;
  const seed = fnv1a(seedText);
  const rand = mulberry32(seed);

  // Final close: the anchor with a small per-seed offset (±0.35%) so the
  // "current" price is never a suspiciously round number.
  const finalClose =
    spec.anchor * (1 + ((seed % 1000) / 1000 - 0.5) * 0.007);

  // Pre-generate per-bar log returns: slow trend regime (sine) + noise, with
  // volatility clustering (a second slow sine scales the noise).
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const trendPeriod = 120 + rand() * 160;
  const volPeriod = 40 + rand() * 80;
  const barVol =
    spec.dailyVol * Math.sqrt(barSec / 86400);
  const returns: number[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const trend =
      Math.sin((i / trendPeriod) * Math.PI * 2 + phase1) *
      barVol *
      spec.trendStrength *
      0.45;
    const volMult = 0.65 + 0.7 * (1 + Math.sin((i / volPeriod) * Math.PI * 2 + phase2)) / 2;
    returns[i] = trend + barVol * volMult * gaussian(rand);
  }

  // Fold: pick the start price so the walk ends exactly on `finalClose`.
  let sum = 0;
  for (let i = 0; i < count; i += 1) sum += returns[i];
  let close = finalClose * Math.exp(-sum);

  const candles: Candle[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const open = close * (1 + gaussian(rand) * barVol * 0.12); // small gap
    close *= Math.exp(returns[i]);
    const body = Math.abs(close - open);
    const wick = barVol * close * (0.35 + rand() * 0.85);
    const high = Math.max(open, close) + wick * (0.3 + rand() * 0.7);
    const low = Math.min(open, close) - wick * (0.3 + rand() * 0.7);
    const volume = Math.round(
      spec.baseVolume *
        (0.55 + rand() * 0.9) *
        (1 + (4 * body) / Math.max(barVol * close, 1e-9)),
    );
    candles[i] = {
      t: lastBucket - (count - 1 - i) * barMs,
      o: roundTo(open, spec.digits),
      h: roundTo(high, spec.digits),
      l: roundTo(low, spec.digits),
      c: roundTo(close, spec.digits),
      v: volume,
    };
  }
  return candles;
}

/** Rounds to the instrument's display precision (no float dust on candles). */
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ── Indicators ───────────────────────────────────────────────────────────────

export interface LinePoint {
  /** Bucket open time, epoch ms. */
  t: number;
  value: number;
}

/** Exponential moving average over candle closes (starts at bar `period-1`). */
export function computeEma(candles: Candle[], period: number): LinePoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let ema = candles[0].c;
  for (let i = 1; i < period; i += 1) ema += (candles[i].c - ema) * k;
  const points: LinePoint[] = [{ t: candles[period - 1].t, value: ema }];
  for (let i = period; i < candles.length; i += 1) {
    ema += (candles[i].c - ema) * k;
    points.push({ t: candles[i].t, value: ema });
  }
  return points;
}

// ── Simulated journal trades (markers) ───────────────────────────────────────

export interface SimTrade {
  /** Index of the ENTRY candle in the series. */
  entryIndex: number;
  /** Index of the EXIT candle. */
  exitIndex: number;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  /** Signed price delta (display P/L, formatted to instrument digits). */
  pnl: number;
}

/**
 * Plausible journal history overlaid as chart markers: entries/exits spread
 * over the recent window, P/L consistent with the actual candle path. A
 * seeded draw keeps the same trades on every render.
 */
export function generateSimTrades(candles: Candle[], symbol: string, digits: number): SimTrade[] {
  if (candles.length < 260) return [];
  const rand = mulberry32(fnv1a(`${symbol}|journal`));
  const trades: SimTrade[] = [];
  const windowStart = Math.max(40, candles.length - 420);
  const stride = 34;
  for (let i = windowStart; i < candles.length - 12; i += stride) {
    const entryIndex = i + Math.floor(rand() * 14);
    const exitIndex = Math.min(
      candles.length - 2,
      entryIndex + 8 + Math.floor(rand() * 30),
    );
    if (exitIndex <= entryIndex) continue;
    const side: "BUY" | "SELL" = rand() < 0.56 ? "BUY" : "SELL";
    const entryPrice = candles[entryIndex].c;
    const exitPrice = candles[exitIndex].c;
    const raw = (exitPrice - entryPrice) * (side === "BUY" ? 1 : -1);
    trades.push({
      entryIndex,
      exitIndex,
      side,
      entryPrice: roundTo(entryPrice, digits),
      exitPrice: roundTo(exitPrice, digits),
      pnl: roundTo(raw, digits),
    });
  }
  return trades;
}

// ── Range bar (1D … All) ─────────────────────────────────────────────────────

export type ChartRange =
  | "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

export const CHART_RANGES: ChartRange[] = [
  "1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL",
];

/** Span in SECONDS covered by a range button (YTD resolved against `nowMs`). */
export function rangeSpanSeconds(range: ChartRange, nowMs: number): number {
  const day = 86400;
  switch (range) {
    case "1D": return day;
    case "5D": return 5 * day;
    case "1M": return 30 * day;
    case "3M": return 91 * day;
    case "6M": return 182 * day;
    case "YTD": return Math.max(day, (nowMs - Date.UTC(new Date(nowMs).getUTCFullYear(), 0, 1)) / 1000);
    case "1Y": return 365 * day;
    case "5Y": return 5 * 365 * day;
    case "ALL": return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * How many trailing bars a range covers for this interval (clamped to what
 * the pane actually holds — the sim keeps `SIM_BAR_COUNT` bars).
 */
export function rangeBarCount(
  range: ChartRange,
  interval: MarketInterval,
  nowMs: number,
  available: number,
): number {
  if (range === "ALL") return available;
  const barSec = INTERVAL_SECONDS[interval];
  const bars = Math.ceil(rangeSpanSeconds(range, nowMs) / barSec);
  return Math.max(10, Math.min(bars, available));
}

// ── Formatting (market convention: 1,234.567) ────────────────────────────────

const formatters = new Map<number, Intl.NumberFormat>();

/** Price formatter honoring the instrument digits — "4,138.460" style. */
export function formatChartPrice(value: number, digits: number): string {
  let fmt = formatters.get(digits);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(digits, fmt);
  }
  return fmt.format(value);
}

/** Signed P/L delta in price units — "+2.86" / "-1.46" (marker labels). */
export function formatSignedDelta(value: number, digits: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatChartPrice(value, digits)}`;
}

/** Percent change — "+0.11%" (legend). */
export function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
