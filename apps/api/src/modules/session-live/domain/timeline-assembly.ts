/**
 * Today's session timeline assembly (trade-entry-ux.md §9, Phase 10 §40) —
 * pure, deterministic.
 *
 * "Use domain/event data where available. Do not fabricate historical
 * events": the backend emits ENTRY/EXIT rows from canonical journal trades
 * (Trade.tradingDate — the server-computed trading day). SL/TP modification
 * events and ALERT rows have NO backend source in this assembly (no
 * trade-event bridge, no alerts domain here) and are NEVER synthesized.
 * The mood strip, however, IS real: Trade carries the emotionBefore /
 * emotionAfter / confidence psychology columns, so moods are derived from
 * the loaded trades when those columns are populated (mirroring the B5
 * session service) — an empty strip means "nothing logged", never "hidden".
 *
 * Derived ids are RFC-4122 v5 uuids (`entry:<tradeId>` / `exit:<tradeId>`)
 * — contract-valid AND stable across reads (idempotency §63) without
 * persisting derived rows.
 */
import type { SessionLiveMood } from "../../../shared/contracts";
import { uuidV5, SESSION_LIVE_DERIVED_UUID_NAMESPACE } from "../../../shared/ids/uuid-v5";

export interface TimelineTradeRow {
  id: string;
  symbol: string;
  status: string;
  direction: "BUY" | "SELL";
  /** Decimal wire strings (presentation only). */
  quantity: string;
  entryPrice: string;
  entryAt: Date;
  exitAt: Date | null;
  exitReason: string | null;
  /** Psychology columns (Phase 10 seam closure — optional: callers pass
   * them when they load the trades; absent → no mood is derived). */
  emotionBefore?: string | null;
  emotionAfter?: string | null;
  /** 1–5 self-rated conviction, when the trader logged it. */
  confidence?: number | null;
  /** Last update — timestamps the AFTER mood of an OPEN trade (in-trade tap). */
  updatedAt?: Date | null;
}

export interface TimelineEvent {
  id: string;
  at: string;
  kind: "ENTRY" | "EXIT";
  label: string;
  detail: string | null;
  severity: null;
}

/** Mood strip row — the shared additive contract (emotion + phase + tradeId
 * + confidence when present). */
export type TimelineMood = SessionLiveMood;

/** Decimal wire string → trimmed presentation string ("0.10000000" → "0.1"). */
export function prettyDecimal(value: string): string {
  if (value.includes("e") || value.includes("E")) return value;
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}

export interface TimelineAssemblyInput {
  /** Trades whose tradingDate == the requested day (ownership pre-scoped). */
  trades: TimelineTradeRow[];
}

/** Wire ISO format — identical to the event timestamps. */
function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function assembleTimeline(input: TimelineAssemblyInput): {
  events: TimelineEvent[];
  moods: TimelineMood[];
} {
  const events: TimelineEvent[] = [];

  for (const trade of input.trades) {
    events.push({
      id: uuidV5(`entry:${trade.id}`, SESSION_LIVE_DERIVED_UUID_NAMESPACE),
      at: trade.entryAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
      kind: "ENTRY",
      label: `${trade.symbol} · ${trade.direction} opened`,
      detail: `${prettyDecimal(trade.quantity)} @ ${prettyDecimal(trade.entryPrice)}`,
      severity: null,
    });
    if (trade.status === "CLOSED" && trade.exitAt !== null) {
      events.push({
        id: uuidV5(`exit:${trade.id}`, SESSION_LIVE_DERIVED_UUID_NAMESPACE),
        at: trade.exitAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
        kind: "EXIT",
        label: `${trade.symbol} · ${trade.direction} closed`,
        detail: trade.exitReason !== null ? `Exit ${trade.exitReason}` : null,
        severity: null,
      });
    }
  }

  // Stable sort by at (rows were pushed per-trade: ENTRY before EXIT at
  // equal timestamps — the mock's insertion-order semantics).
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  // Mood strip — derived from the trades' psychology columns (B5 session
  // service parity): the entry emotion belongs to the trade's own session
  // row (BEFORE @ entryAt); an in-trade/exit tap rides the trade too
  // (AFTER @ exitAt for closed trades, updatedAt for open ones). The
  // confidence (1–5) rides along when the trader logged it. Nothing is
  // fabricated for trades without psychology data.
  const moods: TimelineMood[] = [];
  for (const trade of input.trades) {
    const confidence = trade.confidence ?? null;
    if (trade.emotionBefore != null) {
      moods.push({
        at: isoDateTime(trade.entryAt),
        emotion: trade.emotionBefore as TimelineMood["emotion"],
        phase: "BEFORE",
        tradeId: trade.id,
        confidence,
      });
    }
    if (trade.emotionAfter != null) {
      const at =
        trade.status === "OPEN"
          ? (trade.updatedAt ?? trade.entryAt)
          : (trade.exitAt ?? trade.updatedAt ?? trade.entryAt);
      moods.push({
        at: isoDateTime(at),
        emotion: trade.emotionAfter as TimelineMood["emotion"],
        phase: "AFTER",
        tradeId: trade.id,
        confidence,
      });
    }
  }
  moods.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return { events, moods };
}
