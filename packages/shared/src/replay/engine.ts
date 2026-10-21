/**
 * Replay Engine — deterministic historical playback core (REPLAY MASTER
 * PROMPT §17, §18, §58).
 *
 * Pure TypeScript: no React, no DOM, no clock, no randomness. The same
 * dataset + starting point + command sequence always produces the same
 * replay state, which is what makes results comparable and testable.
 *
 * LOOK-AHEAD BIAS PROTECTION (§18): the engine is the ONLY component that
 * decides which market data the presentation layer may see. `visibleCandles`
 * never returns a candle whose open time is after the current replay time,
 * and the engine never stores candles at all — the caller feeds a window
 * slice, the engine answers with the visible prefix. Future candles that
 * the caller never received cannot leak, and seek/step are clamped so the
 * playhead can never jump beyond the dataset bounds.
 */

import type { ReplayPlaybackState } from "../schemas/replay";

// ── Playback state (§17) ─────────────────────────────────────────────────────

/** Playback speeds (§19) — 1x = historical time at real time. */
export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10, 25, 50] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export interface ReplayEngineConfig {
  /** First bucket open time of the historical window (ms epoch). */
  datasetStartMs: number;
  /** Last bucket open time of the historical window (ms epoch). */
  datasetEndMs: number;
  /** Where the playhead sits when the replay starts — inside the window. */
  startAtMs: number;
  /** One candle bucket (interval ms) — the step granularity. */
  stepMs: number;
}

export interface ReplayEngineSnapshot {
  state: ReplayPlaybackState;
  /** Current replay time (historical ms epoch) — the visible-data boundary. */
  currentMs: number;
  speed: ReplaySpeed;
  /** 0-100 progress across the replayed span (startAtMs → datasetEndMs). */
  progressPct: number;
}

function assertValidConfig(config: ReplayEngineConfig): void {
  const { datasetStartMs, datasetEndMs, startAtMs, stepMs } = config;
  if (!Number.isFinite(datasetStartMs) || !Number.isFinite(datasetEndMs) || !Number.isFinite(startAtMs)) {
    throw new Error("ReplayEngine: dataset bounds and start must be finite numbers");
  }
  if (datasetEndMs < datasetStartMs) {
    throw new Error("ReplayEngine: datasetEndMs must be >= datasetStartMs");
  }
  if (startAtMs < datasetStartMs || startAtMs > datasetEndMs) {
    throw new Error("ReplayEngine: startAtMs must sit inside the dataset window");
  }
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error("ReplayEngine: stepMs must be a positive number");
  }
}

function isReplaySpeed(value: number): value is ReplaySpeed {
  return (REPLAY_SPEEDS as readonly number[]).includes(value);
}

export class ReplayEngine {
  private readonly config: ReplayEngineConfig;
  private state: ReplayPlaybackState;
  private currentMs: number;
  private speed: ReplaySpeed;

  constructor(config: ReplayEngineConfig) {
    assertValidConfig(config);
    this.config = config;
    // A zero-length dataset (single candle) starts COMPLETED — there is
    // nothing to reveal (§58 single-candle dataset).
    this.state = config.datasetEndMs <= config.startAtMs ? "COMPLETED" : "READY";
    this.currentMs = config.startAtMs;
    this.speed = 1;
  }

  get snapshot(): ReplayEngineSnapshot {
    const span = Math.max(this.config.datasetEndMs - this.config.startAtMs, 1);
    const progressPct = Math.min(
      100,
      Math.max(0, ((this.currentMs - this.config.startAtMs) / span) * 100),
    );
    return { state: this.state, currentMs: this.currentMs, speed: this.speed, progressPct };
  }

  // ── Commands (§17/§19) ─────────────────────────────────────────────────────

  /** READY → PLAYING. Starting a COMPLETED replay restarts from the top. */
  start(): void {
    if (this.state === "COMPLETED") {
      this.currentMs = this.config.startAtMs;
    }
    if (this.config.datasetEndMs <= this.config.startAtMs) {
      this.state = "COMPLETED";
      return;
    }
    this.state = "PLAYING";
  }

  pause(): void {
    if (this.state === "PLAYING") this.state = "PAUSED";
  }

  resume(): void {
    if (this.state === "PAUSED" && this.currentMs < this.config.datasetEndMs) {
      this.state = "PLAYING";
    }
  }

  /** Any state → READY at the configured start point. */
  reset(): void {
    this.currentMs = this.config.startAtMs;
    this.state = this.config.datasetEndMs <= this.config.startAtMs ? "COMPLETED" : "READY";
  }

  setSpeed(speed: number): void {
    if (!isReplaySpeed(speed)) return;
    this.speed = speed;
  }

  /**
   * Real-time driven progression: `elapsedRealMs` of wall clock reveals
   * `elapsedRealMs × speed` of historical time. Deterministic given the
   * elapsed sequence — the engine never reads the clock itself.
   */
  advance(elapsedRealMs: number): void {
    if (this.state !== "PLAYING" || elapsedRealMs <= 0) return;
    this.moveTo(this.currentMs + elapsedRealMs * this.speed);
  }

  /** One candle forward (§19 Step Forward). */
  stepForward(): void {
    this.moveTo(this.currentMs + this.config.stepMs);
  }

  /** One candle back — clamped at the start point (§19 "where valid"). */
  stepBackward(): void {
    this.moveTo(this.currentMs - this.config.stepMs);
  }

  /** Scrub/seek — clamped into [startAtMs, datasetEndMs]. */
  seek(toMs: number): void {
    if (!Number.isFinite(toMs)) return;
    this.moveTo(toMs);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Single choke point for every position change — clamps and completes. */
  private moveTo(targetMs: number): void {
    const clamped = Math.min(
      Math.max(targetMs, this.config.startAtMs),
      this.config.datasetEndMs,
    );
    this.currentMs = clamped;
    if (clamped >= this.config.datasetEndMs) {
      this.state = "COMPLETED";
    } else if (this.state === "COMPLETED") {
      // Stepping/seeking back off the end re-opens the replay as paused —
      // deterministic and predictable (resume continues from there).
      this.state = "PAUSED";
    }
  }
}

// ── Look-ahead boundary (§18) ────────────────────────────────────────────────

/**
 * The visible-data boundary: from any candle slice, only the candles whose
 * open time is at or before `currentMs` may reach the presentation layer.
 * The forming candle (open == floor(currentMs / bucket) × bucket) IS visible
 * — the trader watches it build, exactly like live charts. This is the one
 * function the workspace chart is allowed to source its data through.
 */
export function visibleCandles<T extends { t: number }>(
  candles: readonly T[],
  currentMs: number,
): T[] {
  return candles.filter((candle) => candle.t <= currentMs);
}

/** Bucket-open time containing `ms` for the given interval width. */
export function bucketStartOf(ms: number, bucketMs: number): number {
  return Math.floor(ms / bucketMs) * bucketMs;
}

// ── Result computation (§30) ─────────────────────────────────────────────────

export interface ReplayResultTradeInput {
  pnl: string | null;
  rMultiple: string | null;
  riskAmount: string | null;
  closedAtMs: number | null;
}

export interface ReplayResultActivityInput {
  decisions: number;
  notes: number;
  /** Result metrics only count what actually happened (§30). */
  durationMs: number;
}

export interface ReplayResultComputation {
  durationMs: number;
  simulatedTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number | null;
  netPnl: number | null;
  avgR: number | null;
  maxDrawdown: number | null;
  riskUsed: number | null;
  decisionCount: number;
  noteCount: number;
}

/**
 * Pure result metrics from the recorded trades/decisions — never invented:
 * every field is null/zero when its input data is absent. Max drawdown is
 * the worst peak-to-trough of the cumulative simulated P&L curve.
 */
export function computeReplayResult(
  trades: readonly ReplayResultTradeInput[],
  activity: ReplayResultActivityInput,
): ReplayResultComputation {
  const closed = trades.filter((trade) => trade.closedAtMs !== null && trade.pnl !== null);
  const pnls = closed.map((trade) => Number(trade.pnl));
  const netPnl = pnls.length > 0 ? pnls.reduce((sum, value) => sum + value, 0) : null;

  const winningTrades = pnls.filter((value) => value > 0).length;
  const losingTrades = pnls.filter((value) => value < 0).length;
  const winRatePct =
    closed.length > 0 ? (winningTrades / closed.length) * 100 : null;

  const rValues = closed
    .map((trade) => (trade.rMultiple !== null ? Number(trade.rMultiple) : null))
    .filter((value): value is number => value !== null);
  const avgR =
    rValues.length > 0 ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null;

  // Equity curve → max peak-to-trough in account currency.
  let maxDrawdown: number | null = null;
  if (pnls.length > 0) {
    let peak = 0;
    let equity = 0;
    maxDrawdown = 0;
    for (const value of pnls) {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }
  }

  const riskValues = trades
    .map((trade) => (trade.riskAmount !== null ? Number(trade.riskAmount) : null))
    .filter((value): value is number => value !== null);
  const riskUsed =
    riskValues.length > 0 ? riskValues.reduce((sum, value) => sum + value, 0) : null;

  return {
    durationMs: Math.max(activity.durationMs, 0),
    simulatedTrades: trades.length,
    closedTrades: closed.length,
    winningTrades,
    losingTrades,
    winRatePct,
    netPnl,
    avgR,
    maxDrawdown,
    riskUsed,
    decisionCount: activity.decisions,
    noteCount: activity.notes,
  };
}
