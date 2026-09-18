import type { Trade } from "@cosmoz/shared";

/**
 * What-If simulation — pure, client-side (Phase 9 brief: computed from the
 * trades query, no new endpoint). The same helper powers the Mistakes tab
 * teaser. Money never re-derived here: curves are cumulative R, the one
 * unit the trade contract already ships as a decimal string.
 */

export interface WhatIfFilters {
  /** Exclude trades whose trading day (API-provided date key) is a Friday. */
  noFridays: boolean;
  /** Keep only top-graded decisions (decisionGrade === "A"). */
  aPlusOnly: boolean;
  /** Exclude trades whose stop was moved (finalStop differs from initialStop). */
  stopsNeverMoved: boolean;
  /** Keep only self-declared in-plan trades. */
  inPlanOnly: boolean;
}

export const WHAT_IF_FILTER_KEYS = [
  "noFridays",
  "aPlusOnly",
  "stopsNeverMoved",
  "inPlanOnly",
] as const;

export type WhatIfFilterKey = (typeof WHAT_IF_FILTER_KEYS)[number];

export const WHAT_IF_FILTER_META: Record<
  WhatIfFilterKey,
  { label: string; description: string }
> = {
  noFridays: { label: "No Fridays", description: "Drop every trade entered on a Friday" },
  aPlusOnly: { label: "A+ setups only", description: "Keep only decisions graded A before the reveal" },
  stopsNeverMoved: { label: "Stops never moved", description: "Drop trades whose stop was moved from its initial level" },
  inPlanOnly: { label: "In-plan only", description: "Keep only trades marked as following the plan" },
};

export const NO_FILTERS: WhatIfFilters = {
  noFridays: false,
  aPlusOnly: false,
  stopsNeverMoved: false,
  inPlanOnly: false,
};

export interface WhatIfPoint {
  /** Trade index in the chronological closed sequence (x axis). */
  index: number;
  /** Trading date key of the trade at this index. */
  date: string;
  /** Cumulative actual R (every trade counts). */
  actualR: number;
  /** Cumulative simulated R (filtered-out trades contribute nothing). */
  simulatedR: number;
}

export interface WhatIfResult {
  points: WhatIfPoint[];
  actualTotalR: number;
  simulatedTotalR: number;
  /** simulated − actual, in R. */
  deltaR: number;
  /** Calendar days covered by the sample (last trading date − first). */
  days: number;
  keptTrades: number;
  totalTrades: number;
}

/** A trade's stop counts as moved only when it demonstrably changed level. */
export function isStopMoved(trade: Trade): boolean {
  return (
    trade.initialStop !== null &&
    trade.finalStop !== null &&
    trade.initialStop !== trade.finalStop
  );
}

/** Friday = weekday index 5 of the API-provided trading date key. */
export function isFridayTrade(trade: Trade): boolean {
  return new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay() === 5;
}

export function passesFilters(trade: Trade, filters: WhatIfFilters): boolean {
  if (filters.noFridays && isFridayTrade(trade)) return false;
  if (filters.aPlusOnly && trade.decisionGrade !== "A") return false;
  if (filters.stopsNeverMoved && isStopMoved(trade)) return false;
  if (filters.inPlanOnly && trade.followedPlan !== true) return false;
  return true;
}

/**
 * Chronological closed trades → the two cumulative-R curves on a shared
 * x axis (every actual trade gets a point; filtered-out trades leave the
 * simulated line flat, which makes both curves directly comparable).
 */
export function simulateWhatIf(closed: Trade[], filters: WhatIfFilters): WhatIfResult {
  const chronological = [...closed]
    .filter((t) => t.status === "CLOSED" && t.rMultiple !== null)
    .sort((a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt));

  let actualCum = 0;
  let simulatedCum = 0;
  let keptTrades = 0;
  const points: WhatIfPoint[] = chronological.map((trade, index) => {
    actualCum += Number(trade.rMultiple) ?? 0;
    if (passesFilters(trade, filters)) {
      simulatedCum += Number(trade.rMultiple) ?? 0;
      keptTrades += 1;
    }
    return { index, date: trade.tradingDate, actualR: actualCum, simulatedR: simulatedCum };
  });

  const firstDate = chronological[0]?.tradingDate;
  const lastDate = chronological.at(-1)?.tradingDate;
  const days =
    firstDate !== undefined && lastDate !== undefined
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000,
          ),
        )
      : 0;

  return {
    points,
    actualTotalR: actualCum,
    simulatedTotalR: simulatedCum,
    deltaR: simulatedCum - actualCum,
    days,
    keptTrades,
    totalTrades: chronological.length,
  };
}
