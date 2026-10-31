/**
 * Unit - Session Live pure domain (Phase 10): lifecycle rules, summary
 * engine, timeline assembly (stable derived ids, honest empties).
 */
import { describe, expect, it } from "vitest";

import {
  assertActive,
  assertStartable,
  cancelSession,
  endSession,
  SessionAlreadyActiveError,
  SessionNotActiveError,
} from "../../src/modules/session-live/domain/session-lifecycle";
import {
  computeSessionSummary,
  type SummaryTradeRow,
} from "../../src/modules/session-live/domain/session-summary";
import {
  assembleTimeline,
  prettyDecimal,
  type TimelineTradeRow,
} from "../../src/modules/session-live/domain/timeline-assembly";
import { uuidV5 } from "../../src/shared/ids/uuid-v5";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ── lifecycle ────────────────────────────────────────────────────────────────

describe("session lifecycle", () => {
  it("start is allowed only when no ACTIVE session exists", () => {
    expect(() => assertStartable(null)).not.toThrow();
    expect(() => assertStartable({ status: "COMPLETED" })).not.toThrow();
    expect(() => assertStartable({ status: "CANCELLED" })).not.toThrow();
    expect(() => assertStartable({ status: "ACTIVE" })).toThrow(SessionAlreadyActiveError);
  });

  it("only the ACTIVE session is mutable", () => {
    expect(() => assertActive({ status: "ACTIVE" })).not.toThrow();
    expect(() => assertActive({ status: "COMPLETED" })).toThrow(SessionNotActiveError);
    expect(() => assertActive({ status: "CANCELLED" })).toThrow(SessionNotActiveError);
  });

  it("end merges notes ONLY when a non-blank string is provided (mock semantics)", () => {
    const endedAt = new Date("2026-10-03T15:00:00Z");
    const base = { endedAt, currentNotes: "existing" as string | null };

    expect(endSession({ ...base, notes: "closing note", })).toEqual({
      status: "COMPLETED",
      endedAt,
      notes: "closing note",
    });
    expect(endSession({ ...base, notes: "   " })).toEqual({
      status: "COMPLETED",
      endedAt,
      notes: "existing",
    });
    expect(endSession({ ...base, notes: null })).toEqual({
      status: "COMPLETED",
      endedAt,
      notes: "existing",
    });
    expect(endSession({ ...base, notes: undefined, currentNotes: null })).toEqual({
      status: "COMPLETED",
      endedAt,
      notes: null,
    });
  });

  it("cancel records CANCELLED + endedAt, notes untouched", () => {
    const endedAt = new Date("2026-10-03T15:00:00Z");
    expect(cancelSession(endedAt)).toEqual({ status: "CANCELLED", endedAt });
  });
});

// ── summary ──────────────────────────────────────────────────────────────────

function trade(overrides: Partial<SummaryTradeRow>): SummaryTradeRow {
  return {
    symbol: "EURUSD",
    status: "CLOSED",
    entryAt: new Date("2026-10-03T10:00:00Z"),
    exitAt: new Date("2026-10-03T11:00:00Z"),
    pnlNet: "10",
    pnlGross: "10.5",
    rMultiple: "2",
    ...overrides,
  };
}

describe("session summary engine", () => {
  const base = {
    startedAt: new Date("2026-10-03T09:00:00Z"),
    endedAt: new Date("2026-10-03T11:30:00Z"),
    primarySymbol: "EURUSD",
    notesCount: 2,
    analysesCount: 1,
    violationsCount: 0,
    ecoEventsCount: 0,
  };

  it("computes duration, unique markets, tradeCount from opened trades", () => {
    const summary = computeSessionSummary({
      ...base,
      windowTrades: [trade({}), trade({ symbol: "XAUUSD" }), trade({ symbol: "EURUSD" })],
    });
    expect(summary.durationMinutes).toBe(150);
    expect(summary.markets).toEqual(["EURUSD", "XAUUSD"]);
    expect(summary.tradeCount).toBe(3);
  });

  it("falls back to primarySymbol when no trades and symbol is not the placeholder", () => {
    const summary = computeSessionSummary({ ...base, windowTrades: [] });
    expect(summary.markets).toEqual(["EURUSD"]);
  });

  it("keeps markets empty when no trades and the placeholder symbol is set", () => {
    const summary = computeSessionSummary({ ...base, primarySymbol: "-", windowTrades: [] });
    expect(summary.markets).toEqual([]);
  });

  it("netPnl sums closed-window P&L (pnlNet ?? pnlGross fallback), null when nothing closed", () => {
    const summary = computeSessionSummary({
      ...base,
      windowTrades: [trade({}), trade({ pnlNet: "-2.5" }), trade({ pnlNet: null, pnlGross: "3.25" })],
    });
    expect(summary.netPnl).toBe(10.75);

    const openOnly = computeSessionSummary({
      ...base,
      windowTrades: [trade({ status: "OPEN", exitAt: null, pnlNet: null, pnlGross: null, rMultiple: null })],
    });
    expect(openOnly.netPnl).toBeNull();
    expect(openOnly.avgR).toBeNull();
  });

  it("avgR averages rMultiple of closed trades only", () => {
    const summary = computeSessionSummary({
      ...base,
      windowTrades: [trade({}), trade({ rMultiple: "-1" }), trade({ rMultiple: null, status: "OPEN", exitAt: null })],
    });
    expect(summary.avgR).toBe(0.5);
  });

  it("passes through honest counters (violations/eco stay at what the service provides)", () => {
    const summary = computeSessionSummary({ ...base, windowTrades: [], violationsCount: 0, ecoEventsCount: 0 });
    expect(summary.violationsCount).toBe(0);
    expect(summary.ecoEventsCount).toBe(0);
    expect(summary.notesCount).toBe(2);
    expect(summary.analysesCount).toBe(1);
  });
});

// ── timeline ─────────────────────────────────────────────────────────────────

function timelineTrade(overrides: Partial<TimelineTradeRow> = {}): TimelineTradeRow {
  return {
    id: "0f0e1d2c-3b4a-4f5e-8d7c-6b5a4938271",
    symbol: "EURUSD",
    status: "CLOSED",
    direction: "BUY",
    quantity: "0.10000000",
    entryPrice: "1.08500000",
    entryAt: new Date("2026-10-03T10:00:00Z"),
    exitAt: new Date("2026-10-03T11:00:00Z"),
    exitReason: "TAKE_PROFIT",
    ...overrides,
  };
}

describe("timeline assembly", () => {
  it("emits ENTRY + EXIT rows with contract-valid stable uuid ids", () => {
    const { events, moods } = assembleTimeline({ trades: [timelineTrade()] });
    expect(moods).toEqual([]);
    expect(events).toHaveLength(2);

    const entry = events[0];
    const exit = events[1];
    if (!entry || !exit) throw new Error("expected ENTRY+EXIT timeline rows");
    expect(entry.kind).toBe("ENTRY");
    expect(entry.label).toBe("EURUSD · BUY opened");
    expect(entry.detail).toBe("0.1 @ 1.085");
    expect(entry.severity).toBeNull();
    expect(entry.id).toMatch(UUID_RE);
    expect(exit.kind).toBe("EXIT");
    expect(exit.detail).toBe("Exit TAKE_PROFIT");
    expect(exit.id).toMatch(UUID_RE);
    // Deterministic: same trade → same ids (idempotent replay, §63).
    const again = assembleTimeline({ trades: [timelineTrade()] }).events;
    expect(again[0]?.id).toBe(entry.id);
    expect(again[1]?.id).toBe(exit.id);
  });

  it("open trades carry ENTRY only; exit detail is null without a reason", () => {
    const { events } = assembleTimeline({
      trades: [
        timelineTrade({ status: "OPEN", exitAt: null, exitReason: null }),
        timelineTrade({ id: "another-trade-id", exitReason: null }),
      ],
    });
    expect(events).toHaveLength(3);
    expect(events.some((event) => event.kind === "EXIT" && event.detail === null)).toBe(true);
  });

  it("orders chronologically (stable at equal timestamps)", () => {
    const { events } = assembleTimeline({
      trades: [
        timelineTrade({ entryAt: new Date("2026-10-03T10:00:00Z"), exitAt: new Date("2026-10-03T10:00:00Z") }),
      ],
    });
    expect(events[0]?.kind).toBe("ENTRY");
    expect(events[1]?.kind).toBe("EXIT");
  });

  // ── mood strip (seam closure - Trade psychology columns are real) ──────────

  it("builds NO moods when the trades carry no psychology data", () => {
    const { moods } = assembleTimeline({ trades: [timelineTrade()] });
    expect(moods).toEqual([]);
  });

  it("derives BEFORE @ entryAt from emotionBefore, with confidence when present", () => {
    const { moods } = assembleTimeline({
      trades: [timelineTrade({ emotionBefore: "CALM", confidence: 4 })],
    });
    expect(moods).toHaveLength(1);
    expect(moods[0]).toEqual({
      at: "2026-10-03T10:00:00Z",
      emotion: "CALM",
      phase: "BEFORE",
      tradeId: "0f0e1d2c-3b4a-4f5e-8d7c-6b5a4938271",
      confidence: 4,
    });
  });

  it("derives AFTER @ exitAt for closed trades and @ updatedAt for open ones", () => {
    const closed = assembleTimeline({
      trades: [timelineTrade({ emotionAfter: "RELIEVED", emotionBefore: "CONFIDENT", confidence: 3 })],
    }).moods;
    expect(closed).toHaveLength(2);
    expect(closed[0]).toMatchObject({ phase: "BEFORE", at: "2026-10-03T10:00:00Z" });
    expect(closed[1]).toMatchObject({ phase: "AFTER", at: "2026-10-03T11:00:00Z", emotion: "RELIEVED" });

    const open = assembleTimeline({
      trades: [
        timelineTrade({
          status: "OPEN",
          exitAt: null,
          exitReason: null,
          emotionBefore: "CONFIDENT",
          emotionAfter: "EUPHORIC",
          updatedAt: new Date("2026-10-03T10:30:00Z"),
        }),
      ],
    }).moods;
    expect(open).toHaveLength(2);
    expect(open[1]).toMatchObject({ phase: "AFTER", at: "2026-10-03T10:30:00Z" });
  });

  it("sorts moods chronologically across trades", () => {
    const { moods } = assembleTimeline({
      trades: [
        timelineTrade({
          id: "0f0e1d2c-3b4a-4f5e-8d7c-6b5a4938272",
          entryAt: new Date("2026-10-03T11:30:00Z"),
          exitAt: new Date("2026-10-03T12:00:00Z"),
          emotionBefore: "ANXIOUS",
        }),
        timelineTrade({ emotionAfter: "FOMO", emotionBefore: null }),
      ],
    });
    expect(moods.map((mood) => mood.phase)).toEqual(["AFTER", "BEFORE"]);
    expect(moods.map((mood) => mood.at)).toEqual([
      "2026-10-03T11:00:00Z",
      "2026-10-03T11:30:00Z",
    ]);
  });
});

describe("prettyDecimal", () => {
  it("trims wire-scale zeros without touching exponent forms", () => {
    expect(prettyDecimal("0.10000000")).toBe("0.1");
    expect(prettyDecimal("4182.55000000")).toBe("4182.55");
    expect(prettyDecimal("1000.00000000")).toBe("1000");
    expect(prettyDecimal("1e-8")).toBe("1e-8");
  });
});

describe("uuidV5", () => {
  it("is RFC-4122 v5-shaped and deterministic", () => {
    const a = uuidV5("entry:t1", "6f0a1b5e-8f4c-4b7a-9c0e-1d3f5a7b9c21");
    const b = uuidV5("entry:t1", "6f0a1b5e-8f4c-4b7a-9c0e-1d3f5a7b9c21");
    const c = uuidV5("entry:t2", "6f0a1b5e-8f4c-4b7a-9c0e-1d3f5a7b9c21");
    expect(a).toMatch(UUID_RE);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
