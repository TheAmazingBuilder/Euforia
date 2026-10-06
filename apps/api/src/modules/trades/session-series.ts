/**
 * Session price series (B3) — the deterministic projection behind
 * GET /trades/:id/session-series.
 *
 * HONESTY CONTRACT (Phase 4 §68 carries over): Euforia has NO market-data
 * provider, so this endpoint does NOT pretend to return ticks. It builds a
 * DETERMINISTIC SYNTHETIC PATH anchored on the trade's REAL recorded points
 * (entry, exit, MFE, MAE) and interpolated in between with a seeded walk
 * (seed = trade id — the same trade always yields the same series). The
 * consumer renders it as the trade projection chart; recorded plan/reality
 * levels ride along so the drawing never contradicts the journal.
 *
 * Algorithm is a 1:1 port of the frontend mock engine
 * (`apps/web/src/mocks/store.ts` getTradeSessionSeries) so MSW mode and live
 * mode render identical charts for identical trades.
 */
import type { TradeSessionSeriesResponse } from "../../shared/contracts";

/** mulberry32 — small, fast, deterministic PRNG (same constants everywhere). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SessionSeriesTradeInput {
  id: string;
  direction: string;
  entryPrice: string;
  exitPrice: string | null;
  entryAt: Date;
  exitAt: Date | null;
  mfePrice: string | null;
  maePrice: string | null;
  initialStop: string | null;
  initialTP: string | null;
}

export interface SessionSeriesInstrumentInput {
  symbol: string;
  digits: number;
  pipSize: string;
}

export function computeSessionSeries(
  trade: SessionSeriesTradeInput,
  instrument: SessionSeriesInstrumentInput | null,
): TradeSessionSeriesResponse {
  const digits = instrument?.digits ?? 2;
  const pip = Number(instrument?.pipSize ?? "0.0001") || 0.0001;

  const entryMs = trade.entryAt.getTime();
  const exitMs = trade.exitAt !== null ? trade.exitAt.getTime() : entryMs + 45 * 60_000;
  const stepMs = 5 * 60_000;
  const fromMs = entryMs - 60 * 60_000;
  const toMs = exitMs + 30 * 60_000;
  const count = Math.max(8, Math.round((toMs - fromMs) / stepMs) + 1);
  const clampIndex = (index: number) => Math.min(count - 1, Math.max(0, index));

  const entryPrice = Number(trade.entryPrice);
  const exitPrice = trade.exitAt !== null ? Number(trade.exitPrice ?? trade.entryPrice) : null;
  const entryIndex = clampIndex(Math.round((entryMs - fromMs) / stepMs));
  const exitIndex =
    trade.exitAt !== null ? clampIndex(Math.round((exitMs - fromMs) / stepMs)) : null;

  const seed = [...trade.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = mulberry32(seed);
  const amplitude = pip * 30;
  const walk: number[] = [];
  let current = entryPrice - amplitude;
  for (let i = 0; i < count; i += 1) {
    current += (rand() - 0.5) * amplitude;
    walk.push(current);
  }

  // Anchor the walk on the REAL recorded points — the projection hugs the
  // journal's truth at entry/exit/MFE/MAE and interpolates elsewhere.
  const anchors: Array<[number, number]> = [[entryIndex, entryPrice]];
  if (exitIndex !== null && exitPrice !== null) anchors.push([exitIndex, exitPrice]);
  const mfe = trade.mfePrice !== null ? Number(trade.mfePrice) : null;
  const mae = trade.maePrice !== null ? Number(trade.maePrice) : null;
  const midIndex = exitIndex !== null ? Math.round((entryIndex + exitIndex) / 2) : entryIndex + 4;
  if (mfe !== null && mfe !== entryPrice) anchors.push([clampIndex(midIndex + 2), mfe]);
  if (mae !== null && mae !== entryPrice) anchors.push([clampIndex(midIndex - 2), mae]);
  for (let i = 0; i < count; i += 1) {
    let bestWeight = 0;
    let weightSum = 0;
    let valueSum = 0;
    for (const [index, value] of anchors) {
      const distance = i - index;
      const weight = 1 / (1 + distance * distance * 0.2);
      weightSum += weight;
      valueSum += weight * value;
      if (weight > bestWeight) bestWeight = weight;
    }
    const pull = Math.min(1, bestWeight * 1.6);
    walk[i] = (walk[i] ?? 0) * (1 - pull) + (valueSum / weightSum) * pull;
  }

  const points = walk.map((price, index) => ({
    t: new Date(fromMs + index * stepMs).toISOString(),
    price: toDecimalString(Number(price.toFixed(digits))),
  }));
  return {
    symbol: instrument?.symbol ?? "—",
    digits,
    direction: trade.direction as TradeSessionSeriesResponse["direction"],
    from: points[0]!.t,
    to: points[points.length - 1]!.t,
    points,
    entryIndex,
    exitIndex,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    initialStop: trade.initialStop,
    initialTP: trade.initialTP,
  };
}

/** Decimal string without exponent notation (contract: decimalStringSchema). */
function toDecimalString(value: number): string {
  if (Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}
