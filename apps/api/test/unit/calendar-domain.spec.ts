/**
 * Unit — Calendar domain (Phase 13).
 *
 * Pure engine rules, no framework: provider payload normalization (§48
 * safe rejection, §15 impact mapping, §12 status derivation, §18/§19
 * textual values), window/day-key helpers, the built-in provider's
 * determinism contract (§24 stable identity, reference-engine draw order)
 * and the calendar-view aggregation (§31 zero-fill + caps + OFF exclusion,
 * mock parity).
 */
import { describe, expect, it } from "vitest";

import {
  calendarWindowBounds,
  dayKeyToUtcDate,
  normalizeProviderEvent,
  shiftDayKey,
  utcDayKey,
} from "../../src/modules/calendar/domain/economic-event";
import { BuiltinEconomicProvider } from "../../src/modules/calendar/infrastructure/builtin-economic.provider";
import {
  CALENDAR_VIEW_MAX_DAYS,
  buildCalendarView,
  type CalendarDailyStatRow,
  type CalendarViewBlockRow,
} from "../../src/modules/calendar/domain/calendar-aggregation";

// ── Normalization (§15/§48) ──────────────────────────────────────────────────

const FUTURE = new Date("2026-06-15T12:00:00.000Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    ref: "MACRO-20260610-0",
    title: "US CPI y/y",
    currency: "usd",
    tone: "high",
    scheduledAtIso: "2026-06-10T12:30:00.000Z",
    previous: "2.7",
    forecast: "2.9",
    actual: null,
    ...overrides,
  };
}

describe("normalizeProviderEvent", () => {
  it("maps a valid provider payload onto the canonical domain shape", () => {
    const outcome = normalizeProviderEvent(payload(), FUTURE);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.providerEventId).toBe("MACRO-20260610-0");
    expect(outcome.event.title).toBe("US CPI y/y");
    expect(outcome.event.currency).toBe("USD"); // uppercased
    expect(outcome.event.impact).toBe("HIGH"); // tone mapped, never leaked
    expect(outcome.event.scheduledAt.toISOString()).toBe("2026-06-10T12:30:00.000Z");
    expect(outcome.event.status).toBe("SCHEDULED"); // not released yet
  });

  it("derives RELEASED only when actual exists AND the instant has passed (§12)", () => {
    const released = normalizeProviderEvent(payload({ actual: "2.9" }), FUTURE);
    expect(released.ok && released.event.status).toBe("RELEASED");

    const futureActual = normalizeProviderEvent(
      payload({ actual: "2.9", scheduledAtIso: "2026-06-20T12:30:00.000Z" }),
      FUTURE,
    );
    // Actual before the scheduled instant is inconsistent provider data —
    // the event stays SCHEDULED (time has not passed yet).
    expect(futureActual.ok && futureActual.event.status).toBe("SCHEDULED");

    const pastWithoutActual = normalizeProviderEvent(payload(), new Date("2026-06-20T00:00:00.000Z"));
    expect(pastWithoutActual.ok && pastWithoutActual.event.status).toBe("SCHEDULED");
  });

  it("rejects malformed payloads safely with bounded reasons (§48)", () => {
    const cases = [
      payload({ title: "" }),
      payload({ currency: "US" }), // not 3 chars
      payload({ ref: "" }),
      payload({ scheduledAtIso: "not-a-date" }),
      payload({ tone: "extreme" }), // unmappable impact
    ];
    for (const bad of cases) {
      const outcome = normalizeProviderEvent(bad, FUTURE);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason.length).toBeLessThanOrEqual(120);
    }
  });

  it("preserves textual values verbatim — no numeric coercion (§18/§19)", () => {
    const outcome = normalizeProviderEvent(
      payload({ actual: "0.25%", forecast: "250K", previous: "Unchanged" }),
      FUTURE,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.actual).toBe("0.25%");
    expect(outcome.event.forecast).toBe("250K");
    expect(outcome.event.previous).toBe("Unchanged");
  });
});

// ── Window + day keys (§13/§23) ──────────────────────────────────────────────

describe("calendarWindowBounds / day keys", () => {
  it("bounds the rolling window around now", () => {
    const { from, to } = calendarWindowBounds(FUTURE, 92, 13);
    expect(from.toISOString()).toBe("2026-03-15T12:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-28T12:00:00.000Z");
  });

  it("derives UTC day keys and shifts whole days", () => {
    expect(utcDayKey(new Date("2026-06-10T12:30:00.000Z"))).toBe("2026-06-10");
    expect(shiftDayKey("2026-06-10", 1)).toBe("2026-06-11");
    expect(shiftDayKey("2026-06-30", 1)).toBe("2026-07-01"); // month boundary
    expect(dayKeyToUtcDate("2026-06-10").toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });
});

// ── Built-in provider determinism (§4/§24) ───────────────────────────────────

describe("BuiltinEconomicProvider", () => {
  const NOW = Date.parse("2026-06-10T08:00:00.000Z"); // a Wednesday
  const { from, to } = calendarWindowBounds(new Date(NOW), 92, 13);

  it("is deterministic for the same instant (same day → same payload)", () => {
    const a = new BuiltinEconomicProvider(NOW).fetchWindow(from, to);
    const b = new BuiltinEconomicProvider(NOW).fetchWindow(from, to);
    return Promise.all([a, b]).then(([ra, rb]) => {
      expect(ra).toEqual(rb);
    });
  });

  it("emits only weekday releases inside the requested window, chronological", async () => {
    const payloads = await new BuiltinEconomicProvider(NOW).fetchWindow(from, to);
    expect(payloads.length).toBeGreaterThan(50);
    for (const event of payloads) {
      const day = new Date(event.scheduledAtIso).getUTCDay();
      expect(day === 0 || day === 6).toBe(false);
      const ms = Date.parse(event.scheduledAtIso);
      expect(ms).toBeGreaterThanOrEqual(from.getTime() - 86_400_000);
      expect(ms).toBeLessThanOrEqual(to.getTime() + 86_400_000);
    }
    const sorted = [...payloads].sort((x, y) => x.scheduledAtIso.localeCompare(y.scheduledAtIso));
    expect(payloads.map((p) => p.scheduledAtIso)).toEqual(sorted.map((p) => p.scheduledAtIso));
  });

  it("uses stable provider ids independent of the seed day (§24 idempotence)", async () => {
    const dayA = await new BuiltinEconomicProvider(NOW).fetchWindow(from, to);
    const nextDay = await new BuiltinEconomicProvider(NOW + 86_400_000).fetchWindow(from, to);
    // Same physical release (same scheduled instant + template) → same ref.
    const refsA = new Set(dayA.map((event) => event.ref));
    for (const event of nextDay.filter((e) => Date.parse(e.scheduledAtIso) <= NOW)) {
      expect(refsA.has(event.ref)).toBe(true);
    }
  });

  it("fills actual for released events and leaves future ones null", async () => {
    const payloads = await new BuiltinEconomicProvider(NOW).fetchWindow(from, to);
    for (const event of payloads) {
      const released = Date.parse(event.scheduledAtIso) <= NOW;
      if (released) expect(event.actual).not.toBeNull();
      else expect(event.actual).toBeNull();
    }
  });

  it("returns a deliberately provider-shaped wire (§5 — not the domain shape)", async () => {
    const payloads = await new BuiltinEconomicProvider(NOW).fetchWindow(from, to);
    const sample = payloads[0]!;
    expect(Object.keys(sample).sort()).toEqual([
      "actual",
      "currency",
      "forecast",
      "previous",
      "ref",
      "scheduledAtIso",
      "title",
      "tone",
    ]);
    expect(sample.tone).toMatch(/^(high|medium|low)$/); // provider vocabulary
  });
});

// ── Calendar-view aggregation (§31, mock parity) ─────────────────────────────

function stat(date: string, overrides: Partial<CalendarDailyStatRow> = {}): CalendarDailyStatRow {
  return {
    date,
    tradesCount: 1,
    pnlNet: "120.50",
    rEarned: "1.5",
    disciplineScore: null,
    violationsCount: 0,
    ...overrides,
  };
}

function block(date: string, kind: "OFF" | "NEWS"): CalendarViewBlockRow {
  return { date, kind, note: kind === "OFF" ? "Planned day off" : "High-impact news", createdAt: "2026-06-01T00:00:00.000Z" };
}

describe("buildCalendarView", () => {
  it("zero-fills missing days and joins eco counts by UTC day key", () => {
    const view = buildCalendarView({
      from: "2026-06-01",
      to: "2026-06-03",
      dailyStats: [stat("2026-06-02")],
      events: [
        { scheduledAt: new Date("2026-06-02T12:30:00.000Z"), impact: "HIGH" },
        { scheduledAt: new Date("2026-06-02T14:00:00.000Z"), impact: "LOW" },
        { scheduledAt: new Date("2026-06-03T09:00:00.000Z"), impact: "MEDIUM" },
      ],
      blocks: [],
      dailyLossLimitPct: 3,
      currency: "USD",
    });
    expect(view.days).toHaveLength(3);
    const day1 = view.days[0]!;
    expect(day1).toMatchObject({
      date: "2026-06-01",
      tradesCount: 0,
      pnlNet: "0",
      rEarned: "0",
      disciplineScore: null,
      ecoHighCount: 0,
      ecoCount: 0,
      block: null,
      excludedFromStats: false,
    });
    const day2 = view.days[1]!;
    expect(day2).toMatchObject({ date: "2026-06-02", tradesCount: 1, ecoHighCount: 1, ecoCount: 2 });
    expect(view.days[2]!.ecoCount).toBe(1);
  });

  it("excludes OFF days from aggregates but counts NEWS as blocked (mock parity)", () => {
    const view = buildCalendarView({
      from: "2026-06-01",
      to: "2026-06-03",
      dailyStats: [stat("2026-06-01"), stat("2026-06-02"), stat("2026-06-03", { tradesCount: 0, pnlNet: "0", rEarned: "0" })],
      events: [],
      blocks: [block("2026-06-01", "OFF"), block("2026-06-02", "NEWS")],
      dailyLossLimitPct: 3,
      currency: "USD",
    });
    expect(view.days[0]!.excludedFromStats).toBe(true);
    expect(view.summary.daysOff).toBe(1);
    expect(view.summary.blockedDays).toBe(1);
    expect(view.summary.tradingDays).toBe(1); // only 06-03? no — 06-03 has 0 trades
    expect(view.summary.totalPnl).toBe("120.5"); // 06-02 only
    expect(view.summary.totalR).toBe("1.5");
  });

  it("averages discipline scores over scored counted days only", () => {
    const view = buildCalendarView({
      from: "2026-06-01",
      to: "2026-06-02",
      dailyStats: [
        stat("2026-06-01", { disciplineScore: "90" }),
        stat("2026-06-02", { disciplineScore: null }),
      ],
      events: [],
      blocks: [],
      dailyLossLimitPct: 3,
      currency: "USD",
    });
    expect(view.summary.disciplineAvg).toBe("90");
  });

  it("caps emitted rows at the 400-row window guard (mock parity)", () => {
    const from = "2026-01-01";
    const to = "2027-06-30"; // far wider than the cap
    const view = buildCalendarView({
      from,
      to,
      dailyStats: [],
      events: [],
      blocks: [],
      dailyLossLimitPct: 3,
      currency: "USD",
    });
    expect(view.days.length).toBe(CALENDAR_VIEW_MAX_DAYS + 1);
  });
});
