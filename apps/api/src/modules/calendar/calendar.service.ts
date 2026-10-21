/**
 * Calendar application service (B7) — the trading-calendar overlay:
 * eco events (deterministic synthetic provider), marked blocks (day
 * offs / news pauses) and the per-day server-computed view. Days marked
 * OFF are EXCLUDED from every aggregate (planned rest is not trading
 * data). Parity with the MSW engine (`mocks/handlers/eco.ts` + store).
 */
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import {
  currencySchema,
  type upsertCalendarBlockInputSchema,
  type CalendarBlocksResponse,
  type CalendarViewResponse,
  type EcoEventsResponse,
} from "../../shared/contracts";
import { BusinessRuleError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { DisciplineService } from "../discipline/discipline.service";
import { AccountsRepository } from "../accounts/accounts.repository";
import { SettingsService } from "../settings/settings.service";
import { TradesRepository, type TradeRow } from "../trades/trades.repository";
import { dateKeyOf } from "../trades/trade-calculations";
import { CalendarRepository, type CalendarBlockData } from "./calendar.repository";
import { generateEcoEvents } from "./eco-calendar";

const TRADING_ERROR = TRADE_ERROR_CODES;

/** The "objectif du jour" guard line rides the calendar view response. */
const DEFAULT_DAILY_LOSS_LIMIT_PCT = 3;

@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    private readonly trades: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly discipline: DisciplineService,
    private readonly settings: SettingsService,
  ) {}

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toDecimalString(value: number): string {
    if (Number.isInteger(value)) return value.toFixed(1);
    return String(value);
  }

  private shiftDayKey(key: string, days: number): string {
    const date = new Date(`${key}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  /** GET /eco-events — deterministic synthetic macro schedule. */
  async listEcoEvents(): Promise<EcoEventsResponse> {
    return { events: generateEcoEvents(new Date()) };
  }

  /**
   * Phase 13/14 freshness hook for the Calendar read port
   * (CalendarQueriesService.listHubEvents) — TTL-throttled lazy eco-feed
   * sync, semantically a cache refresh (never a caller-directed mutation).
   *
   * HONEST NO-OP: this service serves the DETERMINISTIC generator
   * ({@link listEcoEvents} computes the window on the fly — fresh by
   * construction) and NO external economic-data provider is configured
   * (provider.port §4: none is assumed to exist), so there is nothing to
   * synchronize. It deliberately does not fabricate CalendarSyncRun rows
   * or pretend a sync happened; when a real provider adapter is wired
   * into this service, the guarded sync-window check replaces this body.
   */
  async ensureFreshSync(): Promise<void> {
    // No sync provider configured — the feed is always freshly generated.
  }

  /** GET /calendar-blocks — marked days, chronological. */
  async listBlocks(userId: string): Promise<CalendarBlocksResponse> {
    const rows = await this.repository.listBlocks(userId);
    return {
      blocks: rows.map((row) => row.data).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** PUT /calendar-blocks — mark a day off / news blocked (upsert). */
  async upsertBlock(
    userId: string,
    input: z.infer<typeof upsertCalendarBlockInputSchema>,
  ): Promise<{ block: CalendarBlockData }> {
    const data: CalendarBlockData = {
      date: input.date,
      kind: input.kind,
      note: input.note ?? (input.kind === "OFF" ? "Planned day off" : "High-impact news"),
      createdAt: new Date().toISOString(),
    };
    await this.repository.upsertBlock(userId, input.date, data);
    return { block: data };
  }

  /** DELETE /calendar-blocks/:date — unmark a day. */
  async deleteBlock(
    userId: string,
    date: string,
  ): Promise<{ block: CalendarBlockData | null; deleted: boolean }> {
    const existing = await this.repository.findBlockByDate(userId, date);
    await this.repository.deleteBlock(userId, date);
    return { block: existing?.data ?? null, deleted: true };
  }

  /** POST /calendar-blocks/import-eco — HIGH-impact days ahead → NEWS blocks. */
  async importEcoBlockers(userId: string): Promise<{
    imported: number;
    dates: string[];
    message: string;
  }> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const horizon = this.shiftDayKey(today, 13); // two trading weeks ahead
    const highDates = [
      ...new Set(
        generateEcoEvents(now)
          .filter((event) => event.impact === "HIGH")
          .map((event) => event.scheduledAt.slice(0, 10))
          .filter((date) => date >= today && date <= horizon),
      ),
    ].sort();
    const existing = new Set((await this.repository.listBlocks(userId)).map((row) => row.data.date));
    let imported = 0;
    for (const date of highDates) {
      if (existing.has(date)) continue;
      await this.repository.upsertBlock(userId, date, {
        date,
        kind: "NEWS",
        note: "High-impact releases (imported from the eco calendar)",
        createdAt: new Date().toISOString(),
      });
      imported += 1;
    }
    return {
      imported,
      dates: highDates,
      message:
        imported === 0
          ? "Nothing to import — the next two weeks are already marked or clear."
          : `${imported} high-impact day${imported === 1 ? "" : "s"} imported as news blockers over the next two weeks.`,
    };
  }

  /**
   * GET /calendar-view?from&to — day rows + aggregates. Every row is
   * server-computed from the journal + discipline facts + eco events +
   * blocks; OFF days are excluded from the aggregates.
   */
  async view(userId: string, from: string, to: string): Promise<CalendarViewResponse> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from > to
    ) {
      // Mock parity: an invalid window is a 422 BusinessRule, not a 404.
      throw new BusinessRuleError("Invalid from/to range", TRADING_ERROR.INVALID_TRADE_DATA);
    }

    const [all, scores, violations, blocks, prefs] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.discipline.dailyScores(userId, { from, to }),
      this.discipline.violationsByDay(userId, { from, to }),
      this.repository.listBlocks(userId),
      this.settings.getPreferences(userId).catch(() => null),
    ]);
    const blockByDate = new Map(blocks.map((row) => [row.data.date, row.data]));

    // Eco buckets for the window (the deterministic provider spans ±14 days).
    const ecoByDate = new Map<string, { total: number; high: number }>();
    for (const event of generateEcoEvents(new Date())) {
      const key = event.scheduledAt.slice(0, 10);
      if (key < from || key > to) continue;
      const bucket = ecoByDate.get(key) ?? { total: 0, high: 0 };
      bucket.total += 1;
      if (event.impact === "HIGH") bucket.high += 1;
      ecoByDate.set(key, bucket);
    }

    const closed = all.filter((t) => t.status === "CLOSED");
    const dayOf = (trade: TradeRow): string => dateKeyOf(trade.tradingDate);

    const days: CalendarViewResponse["days"] = [];
    for (let key = from; key <= to && days.length <= 400; key = this.shiftDayKey(key, 1)) {
      const dayTrades = closed.filter((trade) => dayOf(trade) === key);
      const block = blockByDate.get(key) ?? null;
      const score = scores.get(key) ?? null;
      days.push({
        date: key,
        tradesCount: dayTrades.length,
        pnlNet: this.toDecimalString(
          this.round2(dayTrades.reduce((sum, t) => sum + (t.pnlNet?.toNumber() ?? 0), 0)),
        ),
        rEarned: this.toDecimalString(
          this.round2(dayTrades.reduce((sum, t) => sum + (t.rMultiple?.toNumber() ?? 0), 0)),
        ),
        disciplineScore: score === null ? null : this.toDecimalString(this.round2(score)),
        violationsCount: violations.get(key) ?? 0,
        ecoHighCount: ecoByDate.get(key)?.high ?? 0,
        ecoCount: ecoByDate.get(key)?.total ?? 0,
        block,
        excludedFromStats: block?.kind === "OFF",
      });
    }

    const counted = days.filter((day) => !day.excludedFromStats);
    const scored = counted.filter((day) => day.disciplineScore !== null);
    const totalPnl = counted.reduce((sum, day) => sum + (Number(day.pnlNet) ?? 0), 0);
    const totalR = counted.reduce((sum, day) => sum + (Number(day.rEarned) ?? 0), 0);

    const accounts = await this.accounts.listAccountsByUser(userId);
    const rawCurrency = accounts[0]?.currency ?? "USD";
    const currencyParse = currencySchema.safeParse(rawCurrency);
    const currency: CalendarViewResponse["currency"] = currencyParse.success
      ? currencyParse.data
      : "USD";

    return {
      days,
      summary: {
        from,
        to,
        tradingDays: counted.filter((day) => day.tradesCount > 0).length,
        daysOff: days.length - counted.length,
        blockedDays: counted.filter((day) => day.block?.kind === "NEWS").length,
        totalPnl: this.toDecimalString(this.round2(totalPnl)),
        totalR: this.toDecimalString(this.round2(totalR)),
        disciplineAvg:
          scored.length === 0
            ? null
            : this.toDecimalString(
                this.round2(
                  scored.reduce((sum, day) => sum + Number(day.disciplineScore!), 0) /
                    scored.length,
                ),
              ),
        violationsTotal: counted.reduce((sum, day) => sum + day.violationsCount, 0),
      },
      dailyLossLimitPct:
        prefs?.risk?.dailyLossLimitPct ?? DEFAULT_DAILY_LOSS_LIMIT_PCT,
      currency,
    };
  }
}
