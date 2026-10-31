/**
 * Calendar-view aggregation (Phase 13) - PURE domain function, the server
 * authority behind `GET /calendar-view` (§31).
 *
 * Every row is server-computed from three owned inputs - the journal's
 * closed-trade daily aggregates (read through Trading Core's public
 * contract, never recomputed from executions here - Phase 4 §46),
 * canonical economic events and per-user calendar blocks. Days marked OFF
 * are EXCLUDED from every aggregate (planned rest is not trading data -
 * mock parity).
 *
 * Deterministic: iteration from `from` to `to` step-by-step with
 * zero-filled missing days, hard window cap (semester ≈ 190 days - 400
 * emitted rows at most, mock parity), fixed rounding (round2 → decimal
 * string). No floats cross the wire: money is decimal-string everywhere.
 */
import type { EcoImpact } from "./economic-event";
import { shiftDayKey, utcDayKey } from "./economic-event";
import { toDecimalString } from "../../../shared/contracts";

type Decimal = string;

/** Narrow daily aggregate of CLOSED trades for one trading day. */
export interface CalendarDailyStatRow {
  /** Trading-day key (YYYY-MM-DD, user timezone - persisted by Trading). */
  readonly date: string;
  readonly tradesCount: number;
  readonly pnlNet: Decimal | null;
  readonly rEarned: Decimal | null;
  /** Journal-discipline score - absent backend domain → honest null (§63). */
  readonly disciplineScore: Decimal | null;
  /** Rule-violation alerts - no backend alert domain yet → honest 0. */
  readonly violationsCount: number;
}

/** Narrow economic-event projection for the view join. */
export interface CalendarViewEventRow {
  readonly scheduledAt: Date;
  readonly impact: EcoImpact;
}

/** Per-user calendar block (the trading-calendar overlay marker). */
export interface CalendarViewBlockRow {
  readonly date: string;
  readonly kind: "OFF" | "NEWS";
  readonly note: string;
  /** ISO instant - wire passes it through verbatim. */
  readonly createdAt: string;
}

export interface BuildCalendarViewInput {
  readonly from: string;
  readonly to: string;
  readonly dailyStats: readonly CalendarDailyStatRow[];
  readonly events: readonly CalendarViewEventRow[];
  readonly blocks: readonly CalendarViewBlockRow[];
  /** The account's daily loss limit in % - the "guard line" of the view. */
  readonly dailyLossLimitPct: number;
  /** Main (default) account currency - the view's display currency. */
  readonly currency: string;
}

export interface CalendarDayRowWire {
  readonly date: string;
  readonly tradesCount: number;
  readonly pnlNet: Decimal;
  readonly rEarned: Decimal;
  readonly disciplineScore: Decimal | null;
  readonly violationsCount: number;
  readonly ecoHighCount: number;
  readonly ecoCount: number;
  readonly block: CalendarViewBlockRow | null;
  readonly excludedFromStats: boolean;
}

export interface CalendarRangeSummaryWire {
  readonly from: string;
  readonly to: string;
  readonly tradingDays: number;
  readonly daysOff: number;
  readonly blockedDays: number;
  readonly totalPnl: Decimal | null;
  readonly totalR: Decimal;
  readonly disciplineAvg: Decimal | null;
  readonly violationsTotal: number;
}

export interface CalendarViewWire {
  readonly days: CalendarDayRowWire[];
  readonly summary: CalendarRangeSummaryWire;
  readonly dailyLossLimitPct: number;
  readonly currency: string;
}

/** Hard cap on emitted rows - window abuse guard (§31), mock parity. */
export const CALENDAR_VIEW_MAX_DAYS = 400;

const round2 = (value: number): number => Number(value.toFixed(2));

/**
 * Build the trading-calendar view: zero-filled day rows + range summary.
 * Pure - every input is pre-resolved by the application service.
 */
export function buildCalendarView(input: BuildCalendarViewInput): CalendarViewWire {
  const statByDate = new Map(input.dailyStats.map((stat) => [stat.date, stat]));
  const ecoByDate = new Map<string, { total: number; high: number }>();
  for (const event of input.events) {
    const key = utcDayKey(event.scheduledAt);
    const bucket = ecoByDate.get(key) ?? { total: 0, high: 0 };
    bucket.total += 1;
    if (event.impact === "HIGH") bucket.high += 1;
    ecoByDate.set(key, bucket);
  }
  const blockByDate = new Map(input.blocks.map((block) => [block.date, block]));

  const days: CalendarDayRowWire[] = [];
  for (let key = input.from; key <= input.to; key = shiftDayKey(key, 1)) {
    const stat = statByDate.get(key);
    const block = blockByDate.get(key) ?? null;
    days.push({
      date: key,
      tradesCount: stat?.tradesCount ?? 0,
      pnlNet: stat?.pnlNet ?? "0",
      rEarned: stat?.rEarned ?? "0",
      disciplineScore: stat?.disciplineScore ?? null,
      violationsCount: stat?.violationsCount ?? 0,
      ecoHighCount: ecoByDate.get(key)?.high ?? 0,
      ecoCount: ecoByDate.get(key)?.total ?? 0,
      block,
      excludedFromStats: block?.kind === "OFF",
    });
    if (days.length > CALENDAR_VIEW_MAX_DAYS) break; // window cap (semester ≈ 190 days)
  }

  const counted = days.filter((day) => !day.excludedFromStats);
  const scored = counted.filter((day) => day.disciplineScore !== null);
  const totalPnl = counted.reduce((sum, day) => sum + (Number(day.pnlNet) ?? 0), 0);
  const totalR = counted.reduce((sum, day) => sum + (Number(day.rEarned) ?? 0), 0);

  return {
    days,
    summary: {
      from: input.from,
      to: input.to,
      tradingDays: counted.filter((day) => day.tradesCount > 0).length,
      daysOff: days.length - counted.length,
      blockedDays: counted.filter((day) => day.block?.kind === "NEWS").length,
      totalPnl: toDecimalString(round2(totalPnl)),
      totalR: toDecimalString(round2(totalR)),
      disciplineAvg:
        scored.length === 0
          ? null
          : toDecimalString(
              round2(
                scored.reduce((sum, day) => sum + Number(day.disciplineScore!), 0) / scored.length,
              ),
            ),
      violationsTotal: counted.reduce((sum, day) => sum + day.violationsCount, 0),
    },
    dailyLossLimitPct: input.dailyLossLimitPct,
    currency: input.currency,
  };
}
