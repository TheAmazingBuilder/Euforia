/**
 * SimulatedProvider — clearly-labeled SIMULATED feed (mission §33/§34).
 *
 * Serves the catalog symbols that no real provider handles (forex, metals,
 * Deriv synthetics): a mean-reverting random walk around the same anchors
 * the journal fixtures use. Every tick/candle carries source:"sim" and the
 * Session Live renders those symbols with a SIM badge — the feed exists so
 * the monitoring UX is testable end-to-end, NOT to impersonate a market.
 *
 * Candle series are materialized lazily per (symbol, interval), backfilled
 * synthetically, then extended live from the walk while clients keep the
 * series warm (10 min idle expiry keeps memory flat).
 */
import type { Candle, Interval, MarketDataProvider, Tick } from "./types";
import { INTERVAL_MS } from "./types";

interface SymbolDef {
  symbol: string;
  basePrice: number;
  digits: number;
  /** Per-tick volatility as a fraction of price (random-walk step). */
  vol: number;
}

const SYMBOLS: SymbolDef[] = [
  { symbol: "EURUSD", basePrice: 1.0865, digits: 5, vol: 0.00025 },
  { symbol: "GBPUSD", basePrice: 1.2705, digits: 5, vol: 0.0003 },
  { symbol: "XAUUSD", basePrice: 2385.0, digits: 2, vol: 0.0008 },
  { symbol: "BOOM500", basePrice: 9820.0, digits: 2, vol: 0.001 },
  { symbol: "CRASH500", basePrice: 8340.0, digits: 2, vol: 0.001 },
  { symbol: "VOL75(1s)", basePrice: 128400.0, digits: 2, vol: 0.0014 },
];

const TICK_MS = 1000;
const SERIES_IDLE_MS = 10 * 60_000;
const MAX_CANDLES = 600;

interface Series {
  interval: Interval;
  candles: Candle[];
  lastTouch: number;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class SimulatedProvider implements MarketDataProvider {
  readonly id = "simulated";
  readonly source = "sim" as const;

  private emit: ((tick: Tick) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private quotes = new Map<string, { price: number; prevClose: number }>();
  private series = new Map<string, Series>();

  handles(symbol: string): boolean {
    return SYMBOLS.some((def) => def.symbol === symbol);
  }

  start(emit: (tick: Tick) => void): void {
    if (this.timer !== null) return;
    this.emit = emit;
    // Start every walk slightly off the anchor so sessions differ.
    this.quotes = new Map(
      SYMBOLS.map((def) => [
        def.symbol,
        {
          price: round(def.basePrice * (1 + (Math.random() - 0.5) * def.vol * 40), def.digits),
          prevClose: def.basePrice,
        },
      ]),
    );
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.series.clear();
  }

  status(): Record<string, unknown> {
    return {
      transport: "simulated-walk",
      symbols: SYMBOLS.map((def) => def.symbol),
      warmSeries: this.series.size,
    };
  }

  private tick(): void {
    const now = Date.now();
    for (const def of SYMBOLS) {
      const quote = this.quotes.get(def.symbol)!;
      // Mean-reverting random walk: step + gentle pull back to the anchor.
      const drift = (def.basePrice - quote.price) * 0.002;
      const step = quote.price * def.vol * (Math.random() * 2 - 1) + drift;
      quote.price = round(Math.max(quote.price + step, def.basePrice * 0.5), def.digits);
      this.emit?.({
        symbol: def.symbol,
        price: quote.price,
        prevClose: quote.prevClose,
        ts: now,
        source: "sim",
      });
    }
    this.extendSeries(now);
    this.expireSeries(now);
  }

  // ── Live candle extension for warm series ────────────────────────────────

  private extendSeries(now: number): void {
    for (const [key, series] of this.series) {
      const quote = this.quotes.get(key);
      if (!quote) continue;
      const bucket = Math.floor(now / INTERVAL_MS[series.interval]) * INTERVAL_MS[series.interval];
      const last = series.candles[series.candles.length - 1];
      if (last !== undefined && last.t === bucket) {
        last.h = Math.max(last.h, quote.price);
        last.l = Math.min(last.l, quote.price);
        last.c = quote.price;
      } else {
        series.candles.push({ t: bucket, o: quote.price, h: quote.price, l: quote.price, c: quote.price, v: 0 });
        if (series.candles.length > MAX_CANDLES) series.candles.shift();
      }
    }
  }

  private expireSeries(now: number): void {
    for (const [key, series] of this.series) {
      if (now - series.lastTouch > SERIES_IDLE_MS) this.series.delete(key);
    }
  }

  // ── Candle history ───────────────────────────────────────────────────────

  async candles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
    const def = SYMBOLS.find((item) => item.symbol === symbol);
    if (!def) return [];
    const key = `${symbol}|${interval}`;
    const existing = this.series.get(key);
    if (existing !== undefined) {
      existing.lastTouch = Date.now();
      return existing.candles.slice(-limit);
    }

    const series: Series = { interval, candles: [], lastTouch: Date.now() };
    const now = Date.now();
    const bucketMs = INTERVAL_MS[interval];
    const currentBucket = Math.floor(now / bucketMs) * bucketMs;
    // Walk BACKWARD from the live price, then re-order forward — the history
    // joins the present exactly where the walk is right now.
    let price = this.quotes.get(symbol)?.price ?? def.basePrice;
    for (let index = 0; index < limit; index += 1) {
      const open = price;
      const spread = price * def.vol * Math.sqrt(bucketMs / TICK_MS);
      const high = round(price + Math.random() * spread, def.digits);
      const low = round(Math.max(price - Math.random() * spread, def.basePrice * 0.5), def.digits);
      const close = round(low + Math.random() * (high - low), def.digits);
      series.candles.unshift({
        t: currentBucket - index * bucketMs,
        o: open,
        h: Math.max(high, open, close),
        l: Math.min(low, open, close),
        c: close,
        v: Number((Math.random() * 100).toFixed(2)), // synthetic volume — SIM
      });
      price = close;
    }
    this.series.set(key, series);
    return series.candles.slice(-limit);
  }
}
