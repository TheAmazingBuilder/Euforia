/**
 * Session application service (B5) — server-assembled "today": the
 * chronological timeline (entries, exits, stop/target modifications,
 * discipline alerts), the mood strip and the logbook notes. 1:1 behavior
 * parity with the MSW engine (`mocks/handlers/session.ts` + store).
 */
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import {
  toTradingDateKey,
  type createSessionNoteInputSchema,
  type SessionNotesResponse,
  type SessionTimelineResponse,
} from "../../shared/contracts";
import { NotFoundError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";
import { dateKeyOf } from "../trades/trade-calculations";
import { DisciplineRepository } from "../discipline/discipline.repository";
import { IdentityRepository } from "../identity/identity.repository";
import { TradesRepository, type TradeRow } from "../trades/trades.repository";
import { SessionRepository } from "./session.repository";

const TRADING_ERROR = TRADE_ERROR_CODES;

/**
 * Deterministic uuid-derived event ids (contract: sessionEventSchema.id is a
 * UUID — the mock's "entry-${tradeId}" shape violated its own schema). The
 * frontend treats ids as React keys only, so a stable derived UUID keeps
 * both the contract AND idempotent, conflict-free keys per trade.
 */
function derivedId(baseUuid: string, variant: number): string {
  const hex = "0123456789abcdef";
  const last = baseUuid.slice(-1).toLowerCase();
  const index = hex.indexOf(last);
  const bumped = hex[(index + variant) % 16]!;
  return baseUuid.slice(0, -1) + bumped;
}

interface AlertData {
  title: string;
  message: string;
  severity: string;
  createdAt: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly trades: TradesRepository,
    private readonly discipline: DisciplineRepository,
    private readonly identity: IdentityRepository,
  ) {}

  private nowIso(): string {
    return new Date().toISOString();
  }

  /** GET /session/timeline — today's events + moods, oldest first. */
  async timeline(userId: string): Promise<SessionTimelineResponse> {
    const user = await this.identity.findUserById(userId);
    if (user === null) {
      throw new NotFoundError("User not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const tz = user.timezone;
    const today = toTradingDateKey(this.nowIso(), tz);

    const [all, events, alertRows] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.trades.listEventsByUser(userId),
      this.discipline.listByKind(userId, "ALERT"),
    ]);

    const eventsPayload: SessionTimelineResponse["events"] = [];

    // Journal lifecycle: entry (+ exit) events for today's trades.
    for (const trade of all) {
      if (dateKeyOf(trade.tradingDate) !== today) continue;
      const instrument = await this.trades.findInstrument(trade.instrumentId);
      const symbol = instrument?.symbol ?? "?";
      eventsPayload.push({
        id: derivedId(trade.id, 0),
        at: trade.entryAt.toISOString(),
        kind: "ENTRY",
        label: `${symbol} · ${trade.direction} opened`,
        detail: `${trade.quantity.toNumber()} @ ${trade.entryPrice.toFixed()}`,
        severity: null,
      });
      if (trade.status === "CLOSED" && trade.exitAt !== null) {
        eventsPayload.push({
          id: derivedId(trade.id, 1),
          at: trade.exitAt.toISOString(),
          kind: "EXIT",
          label: `${symbol} · ${trade.direction} closed`,
          detail: trade.exitReason !== null ? `Exit ${trade.exitReason}` : null,
          severity: null,
        });
      }
    }

    // Plan modifications (SL/TP), server-forged events from the journal.
    for (const event of events) {
      if (toTradingDateKey(event.createdAt.toISOString(), tz) !== today) continue;
      if (event.type !== "SL_MODIFIED" && event.type !== "TP_MODIFIED") continue;
      const payload = event.payload as { from?: string; to?: string } | null;
      const from = typeof payload?.from === "string" ? payload.from : "?";
      const to = typeof payload?.to === "string" ? payload.to : "?";
      const trade = await this.trades.findTradeForUser(event.tradeId, userId);
      const instrument =
        trade !== null ? await this.trades.findInstrument(trade.instrumentId) : null;
      eventsPayload.push({
        id: event.id,
        at: event.createdAt.toISOString(),
        kind: event.type,
        label: `${instrument?.symbol ?? "?"} · ${event.type === "SL_MODIFIED" ? "stop" : "target"} modified`,
        detail: `${from} → ${to}`,
        severity: null,
      });
    }

    // Discipline alerts raised today (any type — inbox mirrors the banner).
    for (const row of alertRows) {
      const data = row.data as unknown as AlertData;
      if (toTradingDateKey(data.createdAt, tz) !== today) continue;
      eventsPayload.push({
        id: derivedId(row.id, 2),
        at: data.createdAt,
        kind: "ALERT",
        label: data.title,
        detail: data.message,
        severity: data.severity as SessionTimelineResponse["events"][number]["severity"],
      });
    }

    eventsPayload.sort((a, b) => a.at.localeCompare(b.at));

    // Mood strip — entry emotion belongs to the trade's own trading day;
    // an in-trade/exit tap belongs to the DAY IT WAS TAPPED.
    const moods: SessionTimelineResponse["moods"] = [];
    for (const trade of all) {
      if (dateKeyOf(trade.tradingDate) === today && trade.emotionBefore !== null) {
        moods.push({
          at: trade.entryAt.toISOString(),
          emotion: trade.emotionBefore as SessionTimelineResponse["moods"][number]["emotion"],
          phase: "BEFORE",
          tradeId: trade.id,
        });
      }
      if (trade.emotionAfter !== null) {
        const at =
          trade.status === "OPEN"
            ? trade.updatedAt.toISOString()
            : (trade.exitAt ?? trade.updatedAt).toISOString();
        const belongsToday =
          trade.status === "OPEN"
            ? toTradingDateKey(at, tz) === today
            : dateKeyOf(trade.tradingDate) === today;
        if (belongsToday) {
          moods.push({
            at,
            emotion: trade.emotionAfter as SessionTimelineResponse["moods"][number]["emotion"],
            phase: "AFTER",
            tradeId: trade.id,
          });
        }
      }
    }
    moods.sort((a, b) => a.at.localeCompare(b.at));

    return { date: today, events: eventsPayload, moods };
  }

  // ── Session logbook ───────────────────────────────────────────────────────

  /** GET /session/notes — today's notes, chronological. */
  async listNotes(userId: string): Promise<SessionNotesResponse> {
    const today = await this.todayKey(userId);
    const rows = await this.repository.listNoteRows(userId);
    return {
      notes: rows
        .map((row) => ({ id: row.id, ...row.data }))
        .filter((note) => note.date === today)
        .sort((a, b) => a.at.localeCompare(b.at)),
    };
  }

  /** POST /session/notes — timestamped in-session note, server day+clock. */
  async addNote(userId: string, input: z.infer<typeof createSessionNoteInputSchema>) {
    const today = await this.todayKey(userId);
    const data = { date: today, at: this.nowIso(), text: input.text.trim() };
    const row = await this.repository.insertNote(
      userId,
      data as unknown as Parameters<SessionRepository["insertNote"]>[1],
    );
    return { id: row.id, ...data };
  }

  /** DELETE /session/notes/:noteId */
  async deleteNote(userId: string, noteId: string): Promise<{ ok: boolean }> {
    const row = await this.repository.findNoteForUser(userId, noteId);
    if (row === null) {
      throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    await this.repository.deleteNote(userId, noteId);
    return { ok: true };
  }

  private async todayKey(userId: string): Promise<string> {
    const user = await this.identity.findUserById(userId);
    if (user === null) {
      throw new NotFoundError("User not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    return toTradingDateKey(this.nowIso(), user.timezone);
  }
}

/** Referenced for type-aware future consumers (timeline fact types). */
export type TimelineTrade = TradeRow;
