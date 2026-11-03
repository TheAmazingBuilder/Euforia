/**
 * GET /trades/:id/session-series - deterministic intraround sketch around
 * the recorded anchors (entry/exit/MFE/MAE). Ported 1:1 from the mock store:
 * a seeded random walk pulled toward the known price anchors. Honest by
 * design - this is a reconstruction aid between REAL anchor points, never a
 * tick replay.
 */
import { toDecimalString } from "../../shared/contracts";
import type { TradeSessionSeriesResponse } from "../../shared/contracts";
import { mulberry32 } from "../stats/stats.helpers";

export interface TradeSeriesSource {
  id: string;
  direction: string;
  entryAt: Date;
  exitAt: Date | null;
  entryPrice: PrismaDecimalLike;
  exitPrice: PrismaDecimalLike | null;
  initialStop: PrismaDecimalLike | null;
  initialTP: PrismaDecimalLike | null;
  mfePrice: PrismaDecimalLike | null;
  maePrice: PrismaDecimalLike | null;
}

/** Minimal structural type - avoids importing Prisma here. */
export interface PrismaDecimalLike {
  toString(): string;
}

export interface TradeSeriesInstrument {
  symbol: string;
  digits: number;
  pipSize: string;
}

export function buildTradeSessionSeries(
  trade: TradeSeriesSource,
  instrument: TradeSeriesInstrument | null,
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

  const entryPrice = Number(trade.entryPrice.toString());
  const exitPrice = trade.exitAt !== null ? Number((trade.exitPrice ?? trade.entryPrice).toString()) : null;
  const entryIndex = clampIndex(Math.round((entryMs - fromMs) / stepMs));
  const exitIndex = trade.exitAt !== null ? clampIndex(Math.round((exitMs - fromMs) / stepMs)) : null;

  const seed = [...trade.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = mulberry32(seed);
  const amplitude = pip * 30;
  const walk: number[] = [];
  let current = entryPrice - amplitude;
  for (let i = 0; i < count; i += 1) {
    current += (rand() - 0.5) * amplitude;
    walk.push(current);
  }

  const anchors: Array<[number, number]> = [[entryIndex, entryPrice]];
  if (exitIndex !== null && exitPrice !== null) anchors.push([exitIndex, exitPrice]);
  const mfe = trade.mfePrice !== null ? Number(trade.mfePrice.toString()) : null;
  const mae = trade.maePrice !== null ? Number(trade.maePrice.toString()) : null;
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
    walk[i] = walk[i]! * (1 - pull) + (valueSum / weightSum) * pull;
  }

  const points = walk.map((price, index) => ({
    t: new Date(fromMs + index * stepMs).toISOString(),
    price: toDecimalString(Number(price.toFixed(digits))),
  }));
  return {
    symbol: instrument?.symbol ?? "-",
    digits,
    direction: trade.direction as TradeSessionSeriesResponse["direction"],
    from: points[0]!.t,
    to: points[points.length - 1]!.t,
    points,
    entryIndex,
    exitIndex,
    entryPrice: trade.entryPrice.toString(),
    exitPrice: trade.exitPrice === null ? null : trade.exitPrice.toString(),
    initialStop: trade.initialStop === null ? null : trade.initialStop.toString(),
    initialTP: trade.initialTP === null ? null : trade.initialTP.toString(),
  };
}
