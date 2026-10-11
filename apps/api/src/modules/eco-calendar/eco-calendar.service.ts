/**
 * Eco-Calendar service — the reference macro calendar + the per-user
 * trading-calendar overlay (blocks, news importers, day range view).
 *
 * EcoEvent is a GLOBAL catalog: a deterministic weekly release schedule
 * (UTC) generated lazily over a rolling window (past 35d → future 21d).
 * Values (actual/forecast/previous) stay null until a release pipeline
 * feeds them — the backend never fabricates market outcomes.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { toDecimalString } from "../../shared/contracts";
import { shiftDayKey } from "../stats/stats.helpers";
import type {
  CalendarBlock,
  CalendarViewResponse,
  EcoEventsResponse,
  ImportEcoBlockersResponse,
  UpsertCalendarBlockInput,
} from "../../shared/contracts";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { IdentityRepository } from "../identity/identity.repository";
import { num, round2 } from "../stats/stats.helpers";

/** The weekly release template (UTC hours) — deterministic and documented. */
interface ReleaseTemplate {
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
  currency: string;
  title: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  /** Every Nth week of the ISO year, modulo bucket — for rate decisions. */
  everyNthWeek?: number;
  weekBucket?: number;
}

const RELEASES: ReleaseTemplate[] = [
  { weekday: 1, hour: 4, minute: 0, currency: "EUR", title: "Manufacturing PMI", impact: "MEDIUM" },
  { weekday: 1, hour: 13, minute: 30, currency: "USD", title: "Retail Sales (m/m)", impact: "MEDIUM" },
  { weekday: 2, hour: 9, minute: 0, currency: "GBP", title: "GDP (m/m)", impact: "MEDIUM" },
  { weekday: 2, hour: 12, minute: 30, currency: "CAD", title: "CPI (m/m)", impact: "MEDIUM" },
  { weekday: 3, hour: 13, minute: 30, currency: "USD", title: "CPI (y/y)", impact: "HIGH" },
  { weekday: 3, hour: 19, minute: 0, currency: "USD", title: "FOMC Rate Decision", impact: "HIGH", everyNthWeek: 3, weekBucket: 0 },
  { weekday: 4, hour: 1, minute: 30, currency: "AUD", title: "Employment Change", impact: "MEDIUM" },
  { weekday: 4, hour: 12, minute: 15, currency: "EUR", title: "ECB Rate Decision", impact: "HIGH", everyNthWeek: 3, weekBucket: 1 },
  { weekday: 4, hour: 23, minute: 35, currency: "JPY", title: "Tokyo Core CPI", impact: "LOW" },
  { weekday: 5, hour: 13, minute: 30, currency: "USD", title: "Non-Farm Payrolls", impact: "HIGH", everyNthWeek: 4, weekBucket: 2 },
  { weekday: 5, hour: 21, minute: 30, currency: "AUD", title: "RBA Minutes", impact: "LOW" },
];

const PAST_DAYS = 35;
const FUTURE_DAYS = 21;

@Injectable()
export class EcoCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityRepository,
  ) {}

  // ── Global macro calendar ─────────────────────────────────────────────────

  async listEcoEvents(): Promise<EcoEventsResponse> {
    await this.ensureEcoWindow();
    const from = new Date(Date.now() - PAST_DAYS * 86_400_000);
    const to = new Date(Date.now() + FUTURE_DAYS * 86_400_000);
    const events = await this.prisma.ecoEvent.findMany({
      where: { scheduledAt: { gte: from, lte: to } },
      orderBy: { scheduledAt: "asc" },
    });
    return {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        currency: e.currency,
        impact: e.impact as EcoEventsResponse["events"][number]["impact"],
        scheduledAt: e.scheduledAt.toISOString(),
        actual: e.actual,
        forecast: e.forecast,
        previous: e.previous,
      })),
    };
  }

  /** Lazy rolling-window generator — idempotent per (title, scheduledAt). */
  private async ensureEcoWindow(): Promise<void> {
    const now = new Date();
    const start = new Date(now.getTime() - PAST_DAYS * 86_400_000);
    const end = new Date(now.getTime() + FUTURE_DAYS * 86_400_000);

    // Walk back to the Monday of `start`'s week.
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    while (cursor.getUTCDay() !== 1) cursor.setUTCDate(cursor.getUTCDate() - 1);

    while (cursor.getTime() < end.getTime()) {
      const weekStart = new Date(cursor.getTime());
      for (const template of RELEASES) {
        if (template.everyNthWeek !== undefined) {
          const weekNumber = isoWeekNumber(weekStart);
          const bucket = template.weekBucket ?? 0;
          if (weekNumber % template.everyNthWeek !== bucket) continue;
        }
        const daysAhead = (template.weekday - 1 + 7) % 7;
        const scheduledAt = new Date(weekStart.getTime());
        scheduledAt.setUTCDate(scheduledAt.getUTCDate() + daysAhead);
        scheduledAt.setUTCHours(template.hour, template.minute, 0, 0);
        if (scheduledAt < start || scheduledAt > end) continue;
        const existing = await this.prisma.ecoEvent.findFirst({
          where: { title: template.title, scheduledAt },
        });
        if (existing !== null) continue;
        await this.prisma.ecoEvent.create({
          data: {
            id: randomUUID(),
            title: template.title,
            currency: template.currency,
            impact: template.impact,
            scheduledAt,
          },
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  // ── Per-user blocks ────────────────────────────────────────────────────────

  async listBlocks(userId: string): Promise<{ blocks: CalendarBlock[] }> {
    const rows = await this.prisma.calendarBlock.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });
    return { blocks: rows.map(blockView) };
  }

  async upsertBlock(userId: string, input: UpsertCalendarBlockInput): Promise<{ block: CalendarBlock }> {
    const date = new Date(`${input.date}T00:00:00.000Z`);
    const note =
      input.note ?? (input.kind === "OFF" ? "Planned day off" : "High-impact news");
    const block = await this.prisma.calendarBlock.upsert({
      where: { userId_date_kind: { userId, date, kind: input.kind } },
      create: { id: randomUUID(), userId, date, kind: input.kind, payload: { note } },
      update: { payload: { note } },
    });
    return { block: blockView(block) };
  }

  async deleteBlock(userId: string, dateKey: string): Promise<{ block: CalendarBlock | null; deleted: boolean }> {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    const existing = await this.prisma.calendarBlock.findFirst({
      where: { userId, date },
    });
    if (existing === null) return { block: null, deleted: true };
    await this.prisma.calendarBlock.delete({ where: { id: existing.id } });
    return { block: blockView(existing), deleted: true };
  }

  /** HIGH-impact eco days ahead (two weeks) become NEWS blocks. */
  async importEcoBlockers(userId: string): Promise<ImportEcoBlockersResponse> {
    await this.ensureEcoWindow();
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const horizon = new Date(today.getTime() + 13 * 86_400_000).toISOString().slice(0, 10);
    const events = await this.prisma.ecoEvent.findMany({
      where: { impact: "HIGH", scheduledAt: { gte: new Date(`${todayKey}T00:00:00.000Z`), lte: new Date(`${horizon}T23:59:59.999Z`) } },
      orderBy: { scheduledAt: "asc" },
    });
    const dates = [...new Set(events.map((e) => e.scheduledAt.toISOString().slice(0, 10)))].sort();
    let imported = 0;
    for (const date of dates) {
      const existing = await this.prisma.calendarBlock.findFirst({ where: { userId, date: new Date(`${date}T00:00:00.000Z`) } });
      if (existing !== null) continue;
      await this.prisma.calendarBlock.create({
        data: {
          id: randomUUID(),
          userId,
          date: new Date(`${date}T00:00:00.000Z`),
          kind: "NEWS",
          payload: { note: "High-impact releases (imported from the eco calendar)" },
        },
      });
      imported += 1;
    }
    return {
      imported,
      dates,
      message:
        imported === 0
          ? "Nothing to import — the next two weeks are already marked or clear."
          : `${imported} high-impact day${imported === 1 ? "" : "s"} imported as news blockers over the next two weeks.`,
    };
  }

  // ── Range view ────────────────────────────────────────────────────────────

  async calendarView(userId: string, from: string, to: string): Promise<CalendarViewResponse> {
    const user = await this.identity.findUserById(userId);
    const [stats, blocks, events] = await Promise.all([
      this.prisma.dailyStat.findMany({
        where: { userId, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } },
      }),
      this.prisma.calendarBlock.findMany({ where: { userId } }),
      this.prisma.ecoEvent.findMany({
        where: { scheduledAt: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } },
      }),
    ]);
    const statByDate = new Map(stats.map((s) => [s.date.toISOString().slice(0, 10), s]));
    const blockByDate = new Map(blocks.map((b) => [b.date.toISOString().slice(0, 10), b]));
    const ecoByDate = new Map<string, { total: number; high: number }>();
    for (const event of events) {
      const key = event.scheduledAt.toISOString().slice(0, 10);
      const bucket = ecoByDate.get(key) ?? { total: 0, high: 0 };
      bucket.total += 1;
      if (event.impact === "HIGH") bucket.high += 1;
      ecoByDate.set(key, bucket);
    }

    const days: CalendarViewResponse["days"] = [];
    for (let key = from; key <= to; key = shiftDayKey(key)) {
      const stat = statByDate.get(key);
      const block = blockByDate.get(key) ?? null;
      days.push({
        date: key,
        tradesCount: stat?.tradesCount ?? 0,
        pnlNet: stat ? stat.pnlNet.toString() : "0",
        rEarned: stat ? stat.rEarned.toString() : "0",
        disciplineScore: stat?.disciplineScore ? stat.disciplineScore.toString() : null,
        violationsCount: stat?.violationsCount ?? 0,
        ecoHighCount: ecoByDate.get(key)?.high ?? 0,
        ecoCount: ecoByDate.get(key)?.total ?? 0,
        block: block ? blockView(block) : null,
        excludedFromStats: block?.kind === "OFF",
      });
      if (days.length > 400) break; // window cap (semester ≈ 190 days)
    }

    const counted = days.filter((day) => !day.excludedFromStats);
    const scored = counted.filter((day) => day.disciplineScore !== null);
    const totalPnl = counted.reduce((sum, day) => sum + num(day.pnlNet), 0);
    const totalR = counted.reduce((sum, day) => sum + num(day.rEarned), 0);

    const preferences = (user?.preferences ?? {}) as {
      risk?: { dailyLossLimitPct?: number };
    };

    return {
      days,
      summary: {
        from,
        to,
        tradingDays: counted.filter((day) => day.tradesCount > 0).length,
        daysOff: days.length - counted.length,
        blockedDays: counted.filter((day) => day.block?.kind === "NEWS").length,
        totalPnl: toDecimalString(round2(totalPnl)),
        totalR: toDecimalString(round2(totalR)),
        disciplineAvg:
          scored.length === 0
            ? null
            : toDecimalString(round2(scored.reduce((sum, day) => sum + Number(day.disciplineScore!), 0) / scored.length)),
        violationsTotal: counted.reduce((sum, day) => sum + day.violationsCount, 0),
      },
      dailyLossLimitPct: preferences.risk?.dailyLossLimitPct ?? 3,
      currency: "USD",
    };
  }
}

function isoWeekNumber(weekMonday: Date): number {
  const date = new Date(weekMonday.getTime());
  date.setUTCDate(date.getUTCDate() + 3); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function blockView(row: {
  date: Date;
  kind: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
}): CalendarBlock {
  const payload = (row.payload ?? {}) as { note?: string };
  return {
    date: row.date.toISOString().slice(0, 10),
    kind: row.kind as CalendarBlock["kind"],
    note: payload.note ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}
