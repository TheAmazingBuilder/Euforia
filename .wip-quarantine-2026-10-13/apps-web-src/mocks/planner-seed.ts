import type { MarketBias, PlanChecklistItemState, Timeframe, TradePlanStatus } from "@cosmoz/shared";

/**
 * Trade Planner module — deterministic seed definitions.
 *
 * Seeded ONCE per store creation (same lifecycle as the playbook seeds).
 * These are INPUT definitions only: the store materializes them through the
 * exact same pipeline as POST /planner/plans (checklist composition, server
 * risk math, readiness evaluation), so seeded plans and user-created plans
 * can never drift. Prices anchor around the fixture catalog base prices.
 */

export interface PlanSeed {
  /** Stable id suffix — verify scripts deep-link `plan-seed-<key>`. */
  key: string;
  /** Resolved against the fixture instrument catalog. */
  symbol: string;
  strategyName: string | null;
  setupName: string | null;
  direction: "BUY" | "SELL";
  timeframe: Timeframe;
  marketBias: MarketBias;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  riskPercent: number;
  thesis: string | null;
  invalidation: string | null;
  notes: string | null;
  status: TradePlanStatus;
  /** MANUAL checklist states applied after composition (stable std-* ids). */
  manualStates?: Record<string, PlanChecklistItemState>;
  ageMinutes: number;
  readyAgeMinutes?: number;
  executedAgeMinutes?: number;
}

const READY_MANUAL_STATES: Record<string, PlanChecklistItemState> = {
  "std-bias": "CHECKED",
  "std-structure": "CHECKED",
  "std-levels": "CHECKED",
  "std-setup": "CHECKED",
  "std-confirmation": "CHECKED",
  "std-session": "CHECKED",
  "std-news": "CHECKED",
  "std-follows-plan": "CHECKED",
  "std-accept-loss": "CHECKED",
};

export const PLAN_SEEDS: PlanSeed[] = [
  {
    key: "ready",
    symbol: "XAUUSD",
    strategyName: "Breakout NY",
    setupName: "Breakout + Retest",
    direction: "BUY",
    timeframe: "H1",
    marketBias: "BULLISH",
    entryPrice: "2390.00",
    stopLoss: "2382.00",
    takeProfit: "2406.00",
    riskPercent: 1,
    thesis:
      "Daily structure is bullish and price is pulling back into the broken resistance that held three times last week. Waiting for the H1 retest with a 15m confirmation close before entry.",
    invalidation: "H1 candle body closes back below 2382 — the breakout level failed, the idea is dead.",
    notes: null,
    status: "READY",
    manualStates: READY_MANUAL_STATES,
    ageMinutes: 180,
    readyAgeMinutes: 45,
  },
  {
    key: "draft",
    symbol: "BTCUSDT",
    strategyName: "S&R Inversion",
    setupName: "Clean Inversion",
    direction: "SELL",
    timeframe: "M15",
    marketBias: "BEARISH",
    entryPrice: "67500",
    stopLoss: "68500",
    takeProfit: null,
    riskPercent: 1,
    thesis:
      "Weekly supply rejected price twice. If the 4h level inverts on the retest, the 15m structure shift gives the entry — target still undefined, waiting for the range to resolve.",
    invalidation: null,
    notes: "Target TBD — first look at the demand shelf around 65200.",
    status: "DRAFT",
    manualStates: {
      "std-bias": "CHECKED",
      "std-structure": "CHECKED",
      "std-levels": "CHECKED",
      "std-volatility": "CHECKED",
    },
    ageMinutes: 95,
  },
  {
    key: "executed",
    symbol: "EURUSD",
    strategyName: "Range Scalping",
    setupName: "Range Edge Fade",
    direction: "BUY",
    timeframe: "M15",
    marketBias: "BULLISH",
    entryPrice: "1.0860",
    stopLoss: "1.0845",
    takeProfit: "1.0890",
    riskPercent: 0.5,
    thesis:
      "London range held cleanly; the edge fade triggered with the session alignment checklist complete. Executed externally on MT5.",
    invalidation: "M15 close through the range low — the fade is off.",
    notes: null,
    status: "EXECUTED",
    manualStates: READY_MANUAL_STATES,
    ageMinutes: 60 * 26,
    readyAgeMinutes: 60 * 25,
    executedAgeMinutes: 60 * 24,
  },
  {
    key: "cancelled",
    symbol: "GBPUSD",
    strategyName: null,
    setupName: null,
    direction: "BUY",
    timeframe: "H4",
    marketBias: "NEUTRAL",
    entryPrice: "1.2710",
    stopLoss: "1.2685",
    takeProfit: "1.2760",
    riskPercent: 1,
    thesis: "Counter-trend idea against a weakening dollar — never confirmed, parked.",
    invalidation: null,
    notes: "Cancelled: no playbook strategy behind it and the bias never resolved.",
    status: "CANCELLED",
    ageMinutes: 60 * 50,
  },
];
