/**
 * Calendar data access (Phase 13) — the ONLY place in the context that
 * touches Prisma. Narrow projections, no Prisma types cross into services
 * or controllers (Phase 1 §10 boundary).
 *
 * Ownership:
 *   - EconomicEvent   canonical provider-independent events; the sync
 *                     upsert is IDEMPOTENT on (provider, providerEventId)
 *                     — replaying a provider batch never duplicates (§24)
 *   - CalendarSyncRun freshness + observability of every sync (§29/§52)
 *   - CalendarBlock   per-user trading-calendar overlay; the principal's
 *                     userId is part of EVERY where-clause (§40/§46)
 *
 * Multi-step writes run in one transaction (§25/§27): the sync upsert
 * reads existing rows, partitions into create/update/unchanged and writes
 * atomically — concurrent syncs converge on the unique constraint instead
 * of racing (§25: no distributed locking invented).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { EcoImpact, EcoEventStatus } from "../domain/economic-event";
import type { NormalizedEconomicEvent } from "../domain/economic-event";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export interface EconomicEventRow {
  id: string;
  title: string;
  currency: string;
  impact: EcoImpact;
  scheduledAt: Date;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  status: EcoEventStatus;
  provider: string;
  providerEventId: string;
}

/** Wire projection of `/eco-events` — provider internals stay internal. */
export interface EconomicEventWireRow {
  id: string;
  title: string;
  currency: string;
  impact: EcoImpact;
  scheduledAt: Date;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface CalendarSyncRunRow {
  id: string;
  provider: string;
  status: string;
  eventsSeen: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsUnchanged: number;
  eventsRejected: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface CalendarBlockRow {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  kind: "OFF" | "NEWS";
  note: string;
  createdAt: Date;
}

export interface SyncUpsertOutcome {
  created: number;
  updated: number;
  unchanged: number;
}

/** Projection for the `/eco-events` wire — provider internals stay internal. */
const eventWireSelect = {
  id: true,
  title: true,
  currency: true,
  impact: true,
  scheduledAt: true,
  actual: true,
  forecast: true,
  previous: true,
} as const;

@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── EconomicEvent (canonical, global shared reference data) ────────────────

  /**
   * Idempotent sync upsert (§22/§24): events are keyed by the provider
   * identity pair; new rows are created, existing rows are updated ONLY
   * when a value actually changed (revision support, §20), unchanged rows
   * are left untouched. One transaction — partial synchronization is
   * impossible (§25).
   */
  async syncUpsertEvents(
    provider: string,
    events: readonly NormalizedEconomicEvent[],
  ): Promise<SyncUpsertOutcome> {
    if (events.length === 0) return { created: 0, updated: 0, unchanged: 0 };

    const existing = await this.prisma.economicEvent.findMany({
      where: {
        provider,
        providerEventId: { in: events.map((event) => event.providerEventId) },
      },
      select: {
        id: true,
        providerEventId: true,
        title: true,
        currency: true,
        impact: true,
        scheduledAt: true,
        actual: true,
        forecast: true,
        previous: true,
        status: true,
      },
    });
    const existingByRef = new Map(existing.map((row) => [row.providerEventId, row]));

    const toCreate: Prisma.EconomicEventCreateManyInput[] = [];
    const toUpdate: Array<{
      id: string;
      data: Prisma.EconomicEventUpdateInput;
    }> = [];
    let unchanged = 0;

    for (const event of events) {
      const current = existingByRef.get(event.providerEventId);
      if (current === undefined) {
        toCreate.push({
          provider,
          providerEventId: event.providerEventId,
          title: event.title,
          currency: event.currency,
          impact: event.impact,
          scheduledAt: event.scheduledAt,
          actual: event.actual,
          forecast: event.forecast,
          previous: event.previous,
          status: event.status,
        });
        continue;
      }
      const changed =
        current.title !== event.title ||
        current.currency !== event.currency ||
        current.impact !== event.impact ||
        current.scheduledAt.getTime() !== event.scheduledAt.getTime() ||
        current.actual !== event.actual ||
        current.forecast !== event.forecast ||
        current.previous !== event.previous ||
        current.status !== event.status;
      if (!changed) {
        unchanged += 1;
        continue;
      }
      toUpdate.push({
        id: current.id,
        data: {
          title: event.title,
          currency: event.currency,
          impact: event.impact,
          scheduledAt: event.scheduledAt,
          actual: event.actual,
          forecast: event.forecast,
          previous: event.previous,
          status: event.status,
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (toCreate.length > 0) {
        await tx.economicEvent.createMany({ data: toCreate });
      }
      for (const update of toUpdate) {
        await tx.economicEvent.update({ where: { id: update.id }, data: update.data });
      }
    });

    return { created: toCreate.length, updated: toUpdate.length, unchanged };
  }

  /** Chronological canonical events in [from, to] — the wire projection. */
  async listEventsBetween(from: Date, to: Date): Promise<EconomicEventWireRow[]> {
    const rows = await this.prisma.economicEvent.findMany({
      where: { scheduledAt: { gte: from, lte: to } },
      orderBy: { scheduledAt: "asc" },
      select: eventWireSelect,
    });
    return rows;
  }

  /** Window count for consumer contexts (Session Live summary — mock §43). */
  async countEventsBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.economicEvent.count({
      where: { scheduledAt: { gte: from, lte: to } },
    });
  }

  /** Ref resolution (Nofy EVENT refs) — null when the pointer is stale. */
  async findEventById(id: string): Promise<EconomicEventRow | null> {
    const row = await this.prisma.economicEvent.findUnique({ where: { id } });
    // Row-boundary cast (same as listHubEvents): the Prisma EcoImpact/
    // EcoEventStatus enums coincide with the domain vocabulary, and the
    // provenance pair is only null for rows written outside the sync (§24).
    return row === null ? null : (row as EconomicEventRow);
  }

  /** Full-event projection for Analytics (currency/impact join, §21). */
  async listEventsForCorrelation(from: Date, to: Date): Promise<
    Array<{ id: string; currency: string; impact: EcoImpact; scheduledAt: Date }>
  > {
    return this.prisma.economicEvent.findMany({
      where: { scheduledAt: { gte: from, lte: to } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, currency: true, impact: true, scheduledAt: true },
    });
  }

  /** Bounded chronological scan for reference pickers (never unbounded). */
  async listEventsAscending(limit: number): Promise<Array<{ id: string; title: string; currency: string; impact: EcoImpact; scheduledAt: Date }>> {
    return this.prisma.economicEvent.findMany({
      orderBy: { scheduledAt: "asc" },
      take: limit,
      select: { id: true, title: true, currency: true, impact: true, scheduledAt: true },
    });
  }

  /**
   * Integrations Hub projection (Phase 14 §29): full normalized rows with
   * provider provenance — the Hub builds its `providerKey` idempotency
   * identity from (provider, providerEventId). Naturally bounded: the table
   * only ever contains the rolling sync window. READ-ONLY, additive.
   */
  async listHubEvents(): Promise<EconomicEventRow[]> {
    const rows = await this.prisma.economicEvent.findMany({
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        currency: true,
        impact: true,
        scheduledAt: true,
        actual: true,
        forecast: true,
        previous: true,
        status: true,
        provider: true,
        providerEventId: true,
      },
    });
    return rows as EconomicEventRow[];
  }

  // ── CalendarSyncRun (freshness + observability, §29/§52) ───────────────────

  async findLatestSyncRun(provider: string): Promise<CalendarSyncRunRow | null> {
    const row = await this.prisma.calendarSyncRun.findFirst({
      where: { provider },
      orderBy: { startedAt: "desc" },
    });
    return row ?? null;
  }

  async findLatestSuccessfulSync(provider: string): Promise<CalendarSyncRunRow | null> {
    const row = await this.prisma.calendarSyncRun.findFirst({
      where: { provider, status: "SUCCEEDED" },
      orderBy: { startedAt: "desc" },
    });
    return row ?? null;
  }

  async createSyncRun(provider: string, windowFrom: Date, windowTo: Date): Promise<string> {
    const row = await this.prisma.calendarSyncRun.create({
      data: { provider, status: "RUNNING", windowFrom, windowTo },
      select: { id: true },
    });
    return row.id;
  }

  async finishSyncRun(
    id: string,
    outcome: {
      status: "SUCCEEDED" | "FAILED";
      eventsSeen?: number;
      eventsCreated?: number;
      eventsUpdated?: number;
      eventsUnchanged?: number;
      eventsRejected?: number;
      durationMs?: number;
      /** Bounded, credential-free summary — never a raw exception. */
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.prisma.calendarSyncRun.update({
      where: { id },
      data: {
        status: outcome.status,
        eventsSeen: outcome.eventsSeen ?? 0,
        eventsCreated: outcome.eventsCreated ?? 0,
        eventsUpdated: outcome.eventsUpdated ?? 0,
        eventsUnchanged: outcome.eventsUnchanged ?? 0,
        eventsRejected: outcome.eventsRejected ?? 0,
        durationMs: outcome.durationMs ?? null,
        errorMessage: outcome.errorMessage ?? null,
        finishedAt: new Date(),
      },
    });
  }

  // ── CalendarBlock (user-scoped overlay) ────────────────────────────────────

  private static blockSelect = {
    id: true,
    userId: true,
    date: true,
    kind: true,
    note: true,
    createdAt: true,
  } as const;

  private static toBlockRow(row: {
    id: string;
    userId: string;
    date: Date;
    kind: "OFF" | "NEWS";
    note: string;
    createdAt: Date;
  }): CalendarBlockRow {
    return { ...row, date: row.date.toISOString().slice(0, 10) };
  }

  async findBlockForUser(userId: string, date: string): Promise<CalendarBlockRow | null> {
    // CalendarBlock's @@unique is (userId, date, kind) — a per-date read is
    // a findFirst over the kinds, not a compound-unique lookup.
    const row = await this.prisma.calendarBlock.findFirst({
      where: { userId, date: new Date(`${date}T00:00:00.000Z`) },
      select: CalendarRepository.blockSelect,
    });
    return row === null ? null : CalendarRepository.toBlockRow(row);
  }

  /** Upsert is a full replace (mock parity): the where is scoped to the
   *  kind being written (the model's @@unique is userId+date+kind), the
   *  note is overwritten, createdAt regenerated on create. */
  async upsertBlock(
    userId: string,
    date: string,
    kind: "OFF" | "NEWS",
    note: string,
  ): Promise<CalendarBlockRow> {
    const row = await this.prisma.calendarBlock.upsert({
      where: { userId_date_kind: { userId, date: new Date(`${date}T00:00:00.000Z`), kind } },
      create: { userId, date: new Date(`${date}T00:00:00.000Z`), kind, note },
      update: { note },
      select: CalendarRepository.blockSelect,
    });
    return CalendarRepository.toBlockRow(row);
  }

  /** Idempotent delete (mock parity): returns the removed row or null. */
  async deleteBlockForUser(userId: string, date: string): Promise<CalendarBlockRow | null> {
    const existing = await this.findBlockForUser(userId, date);
    if (existing === null) return null;
    await this.prisma.calendarBlock.deleteMany({ where: { userId, date: new Date(`${date}T00:00:00.000Z`) } });
    return existing;
  }

  async listBlocksForUser(userId: string): Promise<CalendarBlockRow[]> {
    const rows = await this.prisma.calendarBlock.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: CalendarRepository.blockSelect,
    });
    return rows.map((row) => CalendarRepository.toBlockRow(row));
  }

  async listBlocksBetween(userId: string, from: string, to: string): Promise<CalendarBlockRow[]> {
    const rows = await this.prisma.calendarBlock.findMany({
      where: {
        userId,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      },
      orderBy: { date: "asc" },
      select: CalendarRepository.blockSelect,
    });
    return rows.map((row) => CalendarRepository.toBlockRow(row));
  }

  /** Import-eco idempotence guard: which of these dates already carry a block. */
  async findExistingBlockDates(userId: string, dates: readonly string[]): Promise<Set<string>> {
    if (dates.length === 0) return new Set();
    const rows = await this.prisma.calendarBlock.findMany({
      where: {
        userId,
        date: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) },
      },
      select: { date: true },
    });
    return new Set(rows.map((row) => row.date.toISOString().slice(0, 10)));
  }
}
