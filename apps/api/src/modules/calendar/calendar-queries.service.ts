/**
 * Calendar public read port (Phase 13 §34-§37) - the ONLY sanctioned
 * surface other bounded contexts consume. Consumers (Session Live,
 * Analytics, Nofy, Integrations Hub) read normalized canonical events
 * through this port; NONE of them may create a second economic-event
 * store (§34/§63).
 *
 * READ-ONLY by construction: no DOMAIN write capability exists here. The
 * Phase 14 Hub projection triggers the SAME lazy freshness sync the
 * /eco-events route uses (TTL-throttled, in-flight-locked, idempotent) -
 * a cache-refresh, never a caller-directed mutation. All projections are
 * narrow - no Prisma types out.
 */
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { calendarWindowBounds } from "./domain/economic-event";
import { CalendarRepository } from "./infrastructure/calendar.repository";
import type { EcoImpact } from "./domain/economic-event";
import { CalendarService } from "./calendar.service";

export interface CalendarEventRef {
  id: string;
  title: string;
  currency: string;
  impact: EcoImpact;
  scheduledAt: Date;
}

/**
 * Phase 14 - Integrations Hub projection row (§29 cross-context contract):
 * the canonical event PLUS its provenance pair, so the Hub can build the
 * shared `providerKey` identity (`${provider}:${providerEventId}`). No other
 * consumer uses this shape; the Hub never touches Calendar tables directly.
 */
export interface CalendarHubEventRow {
  id: string;
  providerId: string;
  providerEventId: string;
  title: string;
  currency: string;
  impact: EcoImpact;
  scheduledAt: Date;
  previous: string | null;
  forecast: string | null;
  actual: string | null;
  status: "SCHEDULED" | "RELEASED" | "UPDATED";
}

@Injectable()
export class CalendarQueriesService {
  constructor(
    private readonly repository: CalendarRepository,
    /** Phase 14: freshness trigger for the Hub projection (lazy, TTL-held,
     * in-flight-locked - the port stays semantically read-only). */
    private readonly calendar: CalendarService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Session Live summary (mock §43): events scheduled inside [from, to]. */
  async countEventsBetween(from: Date, to: Date): Promise<number> {
    return this.repository.countEventsBetween(from, to);
  }

  /** Nofy EVENT refs: resolve one canonical event or nothing (honest). */
  async findEventById(id: string): Promise<CalendarEventRef | null> {
    const row = await this.repository.findEventById(id);
    if (row === null) return null;
    return {
      id: row.id,
      title: row.title,
      currency: row.currency,
      impact: row.impact,
      scheduledAt: row.scheduledAt,
    };
  }

  /**
   * Analytics §21 (economic-event context): canonical events over the
   * SYNC window - the pure engine performs the phase/impact correlation
   * against instrument quote currencies.
   */
  async listSyncWindowEventsForCorrelation(): Promise<
    Array<{ id: string; currency: string; impact: EcoImpact; scheduledAt: Date }>
  > {
    const now = new Date();
    const { from, to } = calendarWindowBounds(
      now,
      this.config.calendar.windowPastDays,
      this.config.calendar.windowFutureDays,
    );
    return this.repository.listEventsForCorrelation(from, to);
  }

  /**
   * Nofy reference picker (mock parity: the first 40 chronological
   * canonical events - bounded scan, never unbounded).
   */
  async listPickerEvents(limit: number): Promise<CalendarEventRef[]> {
    const rows = await this.repository.listEventsAscending(limit);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      currency: row.currency,
      impact: row.impact,
      scheduledAt: row.scheduledAt,
    }));
  }

  /**
   * Phase 14 - Integrations Hub eco feed: the canonical feed WITH provenance,
   * freshest state guaranteed (runs the lazy freshness sync first - same TTL
   * throttle as /eco-events, so the Hub never serves a colder feed than the
   * Calendar page). Read-your-fresh read model; no second event store.
   */
  async listHubEvents(): Promise<CalendarHubEventRow[]> {
    await this.calendar.ensureFreshSync();
    const rows = await this.repository.listHubEvents();
    return rows.map((row) => ({
      id: row.id,
      providerId: row.provider,
      providerEventId: row.providerEventId,
      title: row.title,
      currency: row.currency,
      impact: row.impact,
      scheduledAt: row.scheduledAt,
      previous: row.previous,
      forecast: row.forecast,
      actual: row.actual,
      status: row.status,
    }));
  }
}
