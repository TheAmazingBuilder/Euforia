/**
 * OCR V3 pure-logic unit tests — multi-screenshot fusion (correlation
 * evidence, aggregation gate, fused draft + conflicts, timeline) and the
 * deterministic quality score. No I/O, no Nest, no DB.
 */
import { describe, expect, it } from "vitest";

import {
  AUTO_CONFIRM_THRESHOLD,
  aggregateEvidence,
  correlatePair,
  fuseMembers,
  type FusionMemberInput,
} from "../../src/modules/ocr/fusion.logic";
import { computeQuality } from "../../src/modules/ocr/quality.logic";
import type { RecognizedTrade } from "../../src/shared/contracts";

// ── fixtures ─────────────────────────────────────────────────────────────────

function tradeField(value: string | null, confidence: number | null, state = "FOUND") {
  return { value, state, confidence };
}

/** Build a member whose recognized trade carries the given wire-key values. */
function member(
  overrides: Partial<FusionMemberInput> & {
    jobId: string;
    values?: Record<string, { value: string | null; confidence: number | null }>;
  },
): FusionMemberInput {
  const { values = {}, ...rest } = overrides;
  const fields: Record<string, ReturnType<typeof tradeField>> = {};
  for (const [key, entry] of Object.entries(values)) {
    fields[key] = tradeField(entry.value, entry.confidence);
  }
  const trade: RecognizedTrade = { index: 1, fields } as unknown as RecognizedTrade;
  return {
    screenshotName: `${rest.jobId}.png`,
    status: "REVIEW_REQUIRED",
    trade,
    detectedPlatform: "METATRADER_5",
    screenshotType: "MT5_TRADE",
    uploadedAt: "2026-10-06T10:00:00.000Z",
    ...rest,
  };
}

// ── correlatePair ────────────────────────────────────────────────────────────

describe("correlatePair", () => {
  it("scores symbol/direction agreement as 1 and disagreement as 0", () => {
    const a = member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 } } });
    const b = member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 80 }, direction: { value: "SELL", confidence: 80 } } });
    const evidence = correlatePair(a, b);
    const symbol = evidence.find((e) => e.kind === "SYMBOL");
    const direction = evidence.find((e) => e.kind === "DIRECTION");
    expect(symbol?.score).toBe(1);
    expect(direction?.score).toBe(0);
  });

  it("only fires evidence when both sides carry the value (never invents)", () => {
    const a = member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 } } });
    const b = member({ jobId: "b", values: {} });
    const evidence = correlatePair(a, b);
    expect(evidence.find((e) => e.kind === "SYMBOL")).toBeUndefined();
  });

  it("scales timestamp proximity by distance inside the 4h window", () => {
    const a = member({ jobId: "a", values: { openTime: { value: "2026-10-06T10:00:00Z", confidence: 80 } } });
    const b = member({ jobId: "b", values: { openTime: { value: "2026-10-06T10:30:00Z", confidence: 80 } } });
    const evidence = correlatePair(a, b);
    const proximity = evidence.find((e) => e.kind === "TIMESTAMP_PROXIMITY");
    expect(proximity).toBeDefined();
    expect(proximity?.score).toBeGreaterThan(0.8);
    expect(proximity?.detail).toContain("30 min");
  });

  it("rewards complementary screenshot types over identical ones", () => {
    const same = correlatePair(
      member({ jobId: "a", screenshotType: "MT5_TRADE" }),
      member({ jobId: "b", screenshotType: "MT5_TRADE" }),
    );
    const complementary = correlatePair(
      member({ jobId: "a", screenshotType: "MT5_TRADE" }),
      member({ jobId: "b", screenshotType: "MT5_HISTORY" }),
    );
    expect(same.find((e) => e.kind === "SCREENSHOT_TYPE")?.score).toBe(0.5);
    expect(complementary.find((e) => e.kind === "SCREENSHOT_TYPE")?.score).toBe(0.7);
  });
});

// ── aggregateEvidence (the documented gate) ──────────────────────────────────

describe("aggregateEvidence", () => {
  it("auto-confirms when symbol AND direction agree and the aggregate crosses the threshold", () => {
    const pairs = [
      correlatePair(
        member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 } } }),
        member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 } } }),
      ),
    ];
    const { fusionConfidence, autoConfirmed } = aggregateEvidence(pairs);
    expect(fusionConfidence).toBeGreaterThanOrEqual(AUTO_CONFIRM_THRESHOLD);
    expect(autoConfirmed).toBe(true);
  });

  it("never auto-confirms a symbol mismatch (cap 40) even with other evidence", () => {
    const pairs = [
      correlatePair(
        member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 }, positionId: { value: "P1", confidence: 90 } } }),
        member({ jobId: "b", values: { symbol: { value: "EURUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 }, positionId: { value: "P1", confidence: 90 } } }),
      ),
    ];
    const { fusionConfidence, autoConfirmed } = aggregateEvidence(pairs);
    expect(fusionConfidence).toBeLessThanOrEqual(40);
    expect(autoConfirmed).toBe(false);
  });

  it("requires BOTH identity gates — direction mismatch blocks auto-confirm", () => {
    const pairs = [
      correlatePair(
        member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 } } }),
        member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "SELL", confidence: 90 } } }),
      ),
    ];
    const { autoConfirmed } = aggregateEvidence(pairs);
    expect(autoConfirmed).toBe(false);
  });

  it("yields 0 and no auto-confirm when there is no evidence at all", () => {
    const { fusionConfidence, autoConfirmed } = aggregateEvidence([[]]);
    expect(fusionConfidence).toBe(0);
    expect(autoConfirmed).toBe(false);
  });
});

// ── fuseMembers (draft + conflicts + timeline + provenance) ─────────────────

describe("fuseMembers", () => {
  it("fuses values from the strongest-evidence member with provenance", () => {
    const outcome = fuseMembers([
      member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, entryPrice: { value: "2345.60", confidence: 70 } } }),
      member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 85 }, entryPrice: { value: "2345.65", confidence: 95 } } }),
    ]);
    expect(outcome.fusedDraft.symbol).toBe("XAUUSD");
    expect(outcome.fusedDraft.entryPrice).toBe("2345.65"); // higher confidence wins
    expect(outcome.fieldOrigins.entryPrice).toBe("b");
    expect(outcome.fieldOrigins.symbol).toBe("a");
  });

  it("preserves conflicting values and flags the selected one (spec §31/§103)", () => {
    const outcome = fuseMembers([
      member({ jobId: "a", values: { volume: { value: "0.10", confidence: 90 } } }),
      member({ jobId: "b", values: { volume: { value: "0.15", confidence: 80 } } }),
    ]);
    expect(outcome.conflicts).toHaveLength(1);
    const conflict = outcome.conflicts[0];
    expect(conflict?.field).toBe("volume");
    expect(conflict?.values.map((v) => v.value)).toEqual(["0.10", "0.15"]);
    expect(conflict?.selectedJobId).toBe("a"); // strongest confidence
  });

  it("produces no conflict when every member agrees", () => {
    const outcome = fuseMembers([
      member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 } } }),
      member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 90 } } }),
    ]);
    expect(outcome.conflicts).toHaveLength(0);
  });

  it("orders timestamped timeline entries by time and keeps untimed members after", () => {
    const outcome = fuseMembers([
      member({ jobId: "late", values: { openTime: { value: "2026-10-06T12:00:00Z", confidence: 80 } } }),
      member({ jobId: "early", values: { closeTime: { value: "2026-10-06T09:00:00Z", confidence: 80 } } }),
      member({ jobId: "untimed", values: {} }),
    ]);
    expect(outcome.timeline.map((entry) => entry.jobId)).toEqual(["early", "late", "untimed"]);
    expect(outcome.timeline[2]?.at).toBeNull();
  });

  it("derives the timeline role from the detected screenshot type only", () => {
    const outcome = fuseMembers([
      member({ jobId: "a", screenshotType: "MT5_HISTORY", values: {} }),
      member({ jobId: "b", screenshotType: "MT5_OPEN_POSITION", values: {} }),
    ]);
    expect(outcome.timeline.map((entry) => entry.role)).toEqual(["EXIT", "POSITION"]);
  });

  it("computes group consistency as the mean identity agreement (0..100)", () => {
    const agreeing = fuseMembers([
      member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 } } }),
      member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 90 } } }),
    ]);
    expect(agreeing.consistency).toBe(100);
  });

  it("rejects member counts outside 2..8", () => {
    expect(() => fuseMembers([member({ jobId: "a" })])).toThrow(RangeError);
    const nine = Array.from({ length: 9 }, (_, i) => member({ jobId: `m${i}` }));
    expect(() => fuseMembers(nine)).toThrow(RangeError);
  });

  it("is deterministic — the same input always produces the same output (§77)", () => {
    const build = () =>
      fuseMembers([
        member({ jobId: "a", values: { symbol: { value: "XAUUSD", confidence: 90 }, direction: { value: "BUY", confidence: 88 } } }),
        member({ jobId: "b", values: { symbol: { value: "XAUUSD", confidence: 84 }, direction: { value: "BUY", confidence: 91 }, volume: { value: "0.10", confidence: 70 } } }),
      ]);
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

// ── computeQuality (spec §28) ────────────────────────────────────────────────

describe("computeQuality", () => {
  it("scores a clean high-confidence recognition high", () => {
    const score = computeQuality({
      trades: [
        {
          index: 1,
          fields: {
            symbol: { key: "symbol", value: "XAUUSD", state: "FOUND", confidence: 95 },
            direction: { key: "direction", value: "BUY", state: "FOUND", confidence: 95 },
            volume: { key: "volume", value: "0.10", state: "FOUND", confidence: 92 },
            entryPrice: { key: "entryPrice", value: "2345.60", state: "FOUND", confidence: 90 },
            stopLoss: { key: "stopLoss", value: "2335.60", state: "FOUND", confidence: 88 },
            takeProfit: { key: "takeProfit", value: "2365.60", state: "FOUND", confidence: 87 },
          },
        } as unknown as RecognizedTrade,
      ],
      overallConfidence: 92,
    });
    expect(score.overall).toBeGreaterThan(70);
    expect(score.components.consistency).toBeNull(); // single-image job
    expect(score.components.fieldExtraction).toBe(100);
  });

  it("returns 0 components when nothing was recognized", () => {
    const score = computeQuality({
      trades: [{ index: 1, fields: {} } as unknown as RecognizedTrade],
      overallConfidence: null,
    });
    expect(score.overall).toBe(0);
    expect(score.components.textRecognition).toBe(0);
    expect(score.components.fieldExtraction).toBe(0);
    expect(score.components.consistency).toBeNull();
  });

  it("penalizes incoherent price relationships in crossFieldValidation", () => {
    const coherent = computeQuality({
      trades: [
        {
          index: 1,
          fields: {
            direction: { key: "direction", value: "BUY", state: "FOUND", confidence: 90 },
            entryPrice: { key: "entryPrice", value: "2345.60", state: "FOUND", confidence: 90 },
            stopLoss: { key: "stopLoss", value: "2335.60", state: "FOUND", confidence: 90 },
            takeProfit: { key: "takeProfit", value: "2365.60", state: "FOUND", confidence: 90 },
          },
        } as unknown as RecognizedTrade,
      ],
      overallConfidence: 90,
    });
    const incoherent = computeQuality({
      trades: [
        {
          index: 1,
          fields: {
            direction: { key: "direction", value: "BUY", state: "FOUND", confidence: 90 },
            entryPrice: { key: "entryPrice", value: "2345.60", state: "FOUND", confidence: 90 },
            stopLoss: { key: "stopLoss", value: "2365.60", state: "FOUND", confidence: 90 },
            takeProfit: { key: "takeProfit", value: "2335.60", state: "FOUND", confidence: 90 },
          },
        } as unknown as RecognizedTrade,
      ],
      overallConfidence: 90,
    });
    expect(coherent.components.crossFieldValidation).toBeGreaterThan(
      incoherent.components.crossFieldValidation,
    );
  });

  it("joins group consistency with renormalized weights when provided", () => {
    const base = {
      trades: [
        {
          index: 1,
          fields: {
            symbol: { key: "symbol", value: "XAUUSD", state: "FOUND", confidence: 90 },
            direction: { key: "direction", value: "BUY", state: "FOUND", confidence: 90 },
            volume: { key: "volume", value: "0.10", state: "FOUND", confidence: 90 },
            entryPrice: { key: "entryPrice", value: "2345.60", state: "FOUND", confidence: 90 },
          },
        } as unknown as RecognizedTrade,
      ],
      overallConfidence: 90,
    };
    const withConsistency = computeQuality({ ...base, consistency: 100 });
    expect(withConsistency.components.consistency).toBe(100);
    // Perfect consistency on an already-good read can only keep or lift the overall.
    const withoutConsistency = computeQuality(base);
    expect(withConsistency.overall).toBeGreaterThanOrEqual(withoutConsistency.overall);
  });

  it("is deterministic — the same input always produces the same score (§77)", () => {
    const input = {
      trades: [
        {
          index: 1,
          fields: {
            symbol: { key: "symbol", value: "XAUUSD", state: "FOUND", confidence: 90 },
            direction: { key: "direction", value: "BUY", state: "FOUND", confidence: 85 },
          },
        } as unknown as RecognizedTrade,
      ],
      overallConfidence: 88,
      consistency: 80,
    };
    expect(JSON.stringify(computeQuality(input))).toBe(JSON.stringify(computeQuality(input)));
  });
});
