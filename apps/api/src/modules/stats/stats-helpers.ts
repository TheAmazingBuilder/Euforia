/**
 * Stats service helpers (B1) — pure date/number utilities + the internal
 * TradeLike projection the analytics math runs on (numbers instead of
 * decimal strings — the wire conversion happens at the edges, exactly like
 * the mock's `Number(...)` unwrapping).
 */

export interface TradeLike {
  id: string;
  accountId: string;
  instrumentId: string;
  strategyId: string | null;
  status: string;
  direction: string;
  /** YYYY-MM-DD (UTC). */
  tradingDate: string;
  /** ISO instant. */
  entryAt: string;
  exitAt: string | null;
  pnlNet: number;
  rMultiple: number | null;
  riskAmount: number | null;
  plannedRR: number | null;
  decisionGrade: string | null;
  emotionBefore: string | null;
  emotionAfter: string | null;
  exitReason: string | null;
  followedPlan: boolean | null;
  mfeR: number | null;
  maeR: number | null;
  confidence: number | null;
}

export const round2 = (value: number): number => Number(value.toFixed(2));
export const round1 = (value: number): number => Number(value.toFixed(1));
export const toDecimalString = (value: number): string => {
  if (Number.isInteger(value)) return value.toFixed(1);
  return String(value);
};

/** Next calendar-day key (UTC date arithmetic on YYYY-MM-DD). */
export const shiftDayKey = (key: string): string => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/** Inclusive calendar-day distance between two date keys. */
export const dayDiff = (from: string, to: string): number =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

/** Round a histogram step to a human number (1/2/2.5/5 × 10^k). */
export const niceStep = (raw: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (raw <= multiple * magnitude) return multiple * magnitude;
  }
  return 10 * magnitude;
};

export const todayKey = (): string => new Date().toISOString().slice(0, 10);

export const dateKeyOffset = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** mulberry32 — deterministic PRNG for the Monte Carlo bootstrap. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
