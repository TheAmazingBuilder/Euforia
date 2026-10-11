/**
 * Today's session timeline assembly (trade-entry-ux.md §9, Phase 10 §40) —
 * pure, deterministic.
 *
 * "Use domain/event data where available. Do not fabricate historical
 * events": the backend emits ENTRY/EXIT rows from canonical journal trades
 * (Trade.tradingDate — the server-computed trading day). SL/TP modification
 * events and ALERT rows have NO backend source yet (no trade-event table, no
 * alerts domain) and are NEVER synthesized; moods require emotion columns
 * Trade does not carry → always []. These are documented honest seams.
 *
 * Derived ids are RFC-4122 v5 uuids (`entry:<tradeId>` / `exit:<tradeId>`)
 * — contract-valid AND stable across reads (idempotency §63) without
 * persisting derived rows.
 */
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
}

export interface TimelineEvent {
  id: string;
  at: string;
  kind: "ENTRY" | "EXIT";
  label: string;
  detail: string | null;
  severity: null;
}

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

export function assembleTimeline(input: TimelineAssemblyInput): { events: TimelineEvent[]; moods: [] } {
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

  // Moods: Trade carries no emotion columns in the backend (Phase 8 audit
  // seam) — honest empty list, never fabricated.
  return { events, moods: [] };
}
