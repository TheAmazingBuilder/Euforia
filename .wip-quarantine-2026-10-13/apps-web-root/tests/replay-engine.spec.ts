import { describe, expect, it } from "vitest";

import {
  computeReplayResult,
  REPLAY_SPEEDS,
  ReplayEngine,
  visibleCandles,
} from "../../packages/shared/src/replay/engine";

/**
 * Replay engine specs (REPLAY MASTER PROMPT §58) — lifecycle, state
 * transitions, determinism, boundaries and the MANDATORY look-ahead suite.
 * The engine is the replay data boundary: these tests assert future market
 * data can never surface through it.
 */

const BASE = {
  datasetStartMs: 1_700_000_000_000,
  datasetEndMs: 1_700_000_000_000 + 10 * 60_000, // ten 1m buckets
  startAtMs: 1_700_000_000_000 + 2 * 60_000,
  stepMs: 60_000,
};

function freshEngine() {
  return new ReplayEngine(BASE);
}

// ── Lifecycle & state transitions ─────────────────────────────────────────────

describe("ReplayEngine lifecycle", () => {
  it("starts READY at startAtMs", () => {
    const engine = freshEngine();
    expect(engine.snapshot.state).toBe("READY");
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
    expect(engine.snapshot.speed).toBe(1);
    expect(engine.snapshot.progressPct).toBe(0);
  });

  it("start → PLAYING, pause → PAUSED, resume → PLAYING", () => {
    const engine = freshEngine();
    engine.start();
    expect(engine.snapshot.state).toBe("PLAYING");
    engine.advance(30_000);
    engine.pause();
    expect(engine.snapshot.state).toBe("PAUSED");
    const frozen = engine.snapshot.currentMs;
    engine.advance(60_000); // advance while paused is a no-op
    expect(engine.snapshot.currentMs).toBe(frozen);
    engine.resume();
    expect(engine.snapshot.state).toBe("PLAYING");
  });

  it("resume stays paused when the dataset is already fully revealed", () => {
    const engine = freshEngine();
    engine.seek(BASE.datasetEndMs); // → COMPLETED
    engine.resume();
    expect(engine.snapshot.state).toBe("COMPLETED");
  });

  it("reset returns to READY at the start point from any state", () => {
    const engine = freshEngine();
    engine.start();
    engine.advance(120_000);
    engine.reset();
    expect(engine.snapshot.state).toBe("READY");
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
  });

  it("starting a COMPLETED replay restarts from the beginning", () => {
    const engine = freshEngine();
    engine.seek(BASE.datasetEndMs);
    expect(engine.snapshot.state).toBe("COMPLETED");
    engine.start();
    expect(engine.snapshot.state).toBe("PLAYING");
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
  });
});

// ── Progression & determinism ────────────────────────────────────────────────

describe("ReplayEngine progression", () => {
  it("advance reveals historical time scaled by speed", () => {
    const engine = freshEngine();
    engine.start();
    engine.advance(10_000);
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs + 10_000);
    engine.setSpeed(10);
    engine.advance(10_000);
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs + 110_000);
  });

  it("completes exactly at the dataset end and stays there", () => {
    const engine = freshEngine();
    engine.start();
    engine.advance(BASE.datasetEndMs - BASE.startAtMs);
    expect(engine.snapshot.state).toBe("COMPLETED");
    expect(engine.snapshot.currentMs).toBe(BASE.datasetEndMs);
    engine.advance(999_999);
    expect(engine.snapshot.currentMs).toBe(BASE.datasetEndMs);
  });

  it("same command sequence → identical snapshots (determinism)", () => {
    const run = () => {
      const engine = freshEngine();
      engine.start();
      engine.advance(45_000);
      engine.pause();
      engine.stepForward();
      engine.setSpeed(5);
      engine.resume();
      engine.advance(12_000);
      engine.stepBackward();
      return engine.snapshot;
    };
    expect(run()).toEqual(run());
  });

  it("only accepts the documented speed set (§19)", () => {
    const engine = freshEngine();
    engine.setSpeed(7); // not in REPLAY_SPEEDS — ignored
    expect(engine.snapshot.speed).toBe(1);
    for (const speed of REPLAY_SPEEDS) {
      engine.setSpeed(speed);
      expect(engine.snapshot.speed).toBe(speed);
    }
  });

  it("stepForward/stepBackward move one candle bucket", () => {
    const engine = freshEngine();
    engine.stepForward();
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs + BASE.stepMs);
    engine.stepBackward();
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
  });

  it("stepBackward never crosses the start point", () => {
    const engine = freshEngine();
    engine.stepBackward();
    engine.stepBackward();
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
    expect(engine.snapshot.state).toBe("READY");
  });

  it("stepping back off the end re-opens a COMPLETED replay as PAUSED", () => {
    const engine = freshEngine();
    engine.seek(BASE.datasetEndMs);
    engine.stepBackward();
    expect(engine.snapshot.state).toBe("PAUSED");
    expect(engine.snapshot.currentMs).toBe(BASE.datasetEndMs - BASE.stepMs);
  });
});

// ── Boundaries ───────────────────────────────────────────────────────────────

describe("ReplayEngine boundaries", () => {
  it("seek clamps into [startAtMs, datasetEndMs]", () => {
    const engine = freshEngine();
    engine.seek(BASE.datasetStartMs - 999_999);
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
    engine.seek(BASE.datasetEndMs + 999_999);
    expect(engine.snapshot.currentMs).toBe(BASE.datasetEndMs);
  });

  it("rejects invalid configs", () => {
    expect(() => new ReplayEngine({ ...BASE, datasetEndMs: BASE.datasetStartMs - 1 })).toThrow();
    expect(() => new ReplayEngine({ ...BASE, startAtMs: BASE.datasetEndMs + 1 })).toThrow();
    expect(() => new ReplayEngine({ ...BASE, stepMs: 0 })).toThrow();
    expect(() => new ReplayEngine({ ...BASE, datasetEndMs: Number.NaN })).toThrow();
  });

  it("single-candle dataset (zero span) is born COMPLETED", () => {
    const engine = new ReplayEngine({ ...BASE, datasetEndMs: BASE.startAtMs });
    expect(engine.snapshot.state).toBe("COMPLETED");
    engine.start();
    expect(engine.snapshot.state).toBe("COMPLETED");
    expect(engine.snapshot.currentMs).toBe(BASE.startAtMs);
  });

  it("large dataset: 10k-candle sweep reveals exactly the elapsed prefix", () => {
    const bucketMs = 60_000;
    const candles = Array.from({ length: 10_000 }, (_, index) => ({
      t: BASE.datasetStartMs + index * bucketMs,
      close: index,
    }));
    const engine = new ReplayEngine({
      datasetStartMs: candles[0].t,
      datasetEndMs: candles[candles.length - 1].t,
      startAtMs: candles[0].t,
      stepMs: bucketMs,
    });
    engine.start();
    engine.advance(2_000 * bucketMs); // 2000 buckets of historical time
    const visible = visibleCandles(candles, engine.snapshot.currentMs);
    expect(visible).toHaveLength(2001); // buckets 0..2000 inclusive
    expect(visible[visible.length - 1].close).toBe(2000);
  });
});

// ── LOOK-AHEAD BIAS (§18 — mandatory) ────────────────────────────────────────

describe("look-ahead bias protection", () => {
  const bucketMs = 60_000;
  const dataset = Array.from({ length: 50 }, (_, index) => ({
    t: BASE.datasetStartMs + index * bucketMs,
    o: 100 + index,
    h: 101 + index,
    l: 99 + index,
    c: 100.5 + index,
    v: 1,
  }));
  /** Bounds matching the 50-candle dataset above. */
  const datasetEndMs = BASE.datasetStartMs + 49 * bucketMs;
  const datasetEngine = () =>
    new ReplayEngine({
      datasetStartMs: BASE.datasetStartMs,
      datasetEndMs,
      startAtMs: BASE.datasetStartMs + 2 * bucketMs,
      stepMs: bucketMs,
    });

  it("never exposes a candle beyond the current replay time", () => {
    for (let offset = 0; offset <= 50 * bucketMs; offset += 17_000) {
      const currentMs = BASE.datasetStartMs + offset;
      const visible = visibleCandles(dataset, currentMs);
      for (const candle of visible) {
        expect(candle.t).toBeLessThanOrEqual(currentMs);
      }
    }
  });

  it("shows the forming candle (open ≤ now) and nothing after", () => {
    const mid = BASE.datasetStartMs + 20 * bucketMs + 30_000; // inside bucket 20
    const visible = visibleCandles(dataset, mid);
    expect(visible).toHaveLength(21); // buckets 0..20
    expect(visible[visible.length - 1].t).toBe(BASE.datasetStartMs + 20 * bucketMs);
  });

  it("future prices are unreachable even when the FULL dataset is in memory", () => {
    // The workspace holds only chunked slices — but even against the whole
    // dataset, the boundary returns a strict prefix.
    const engine = datasetEngine();
    engine.start();
    engine.advance(2 * bucketMs); // +2 buckets from startAt (+2) → bucket 4
    const visible = visibleCandles(dataset, engine.snapshot.currentMs);
    const maxVisibleT = Math.max(...visible.map((candle) => candle.t));
    expect(maxVisibleT).toBeLessThanOrEqual(engine.snapshot.currentMs);
    expect(visible).toHaveLength(5); // buckets 0..4 inclusive
  });

  it("seeking cannot push the playhead beyond the dataset end", () => {
    const engine = datasetEngine();
    engine.seek(datasetEndMs + 10 * bucketMs);
    expect(engine.snapshot.currentMs).toBe(datasetEndMs);
    const visible = visibleCandles(dataset, engine.snapshot.currentMs);
    expect(visible).toHaveLength(dataset.length);
  });
});

// ── Result computation (§30) ─────────────────────────────────────────────────

describe("computeReplayResult", () => {
  it("computes win rate, net P&L, average R and max drawdown", () => {
    const result = computeReplayResult(
      [
        { pnl: "150", rMultiple: "1.5", riskAmount: "100", closedAtMs: 1 },
        { pnl: "-100", rMultiple: "-1", riskAmount: "100", closedAtMs: 2 },
        { pnl: "50", rMultiple: "0.5", riskAmount: "100", closedAtMs: 3 },
        { pnl: null, rMultiple: null, riskAmount: "100", closedAtMs: null }, // open
      ],
      { decisions: 6, notes: 2, durationMs: 3_600_000 },
    );
    expect(result.simulatedTrades).toBe(4);
    expect(result.closedTrades).toBe(3);
    expect(result.winningTrades).toBe(2);
    expect(result.losingTrades).toBe(1);
    expect(result.winRatePct).toBeCloseTo((2 / 3) * 100, 10);
    expect(result.netPnl).toBeCloseTo(100, 10);
    expect(result.avgR).toBeCloseTo((1.5 - 1 + 0.5) / 3, 10);
    // Equity curve: +150 → +50 → +100. Peak 150, trough after -100 = 50 → DD 100.
    expect(result.maxDrawdown).toBeCloseTo(100, 10);
    expect(result.riskUsed).toBeCloseTo(400, 10);
    expect(result.decisionCount).toBe(6);
    expect(result.noteCount).toBe(2);
  });

  it("returns nulls when nothing is closed (never fabricates metrics)", () => {
    const result = computeReplayResult(
      [{ pnl: null, rMultiple: null, riskAmount: null, closedAtMs: null }],
      { decisions: 0, notes: 0, durationMs: 0 },
    );
    expect(result.winRatePct).toBeNull();
    expect(result.netPnl).toBeNull();
    expect(result.avgR).toBeNull();
    expect(result.maxDrawdown).toBeNull();
    expect(result.riskUsed).toBeNull();
    expect(result.winningTrades).toBe(0);
    expect(result.losingTrades).toBe(0);
  });
});
