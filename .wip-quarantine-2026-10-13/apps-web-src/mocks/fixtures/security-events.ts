import type { SecurityEvent, SecurityEventType } from "@cosmoz/shared";

import { uuid, type Rng } from "./random";
import type { Instrument, SkippedTrade, Trade } from "@cosmoz/shared";

/**
 * Security & activity-log fixtures — deterministic audit trail derived from
 * the seeded journal: one "trade captured" row per capture, one "decision
 * graded" row per grade, ghost settlements, plus system/security rows
 * (sign-ins, exports, imports, strategy changes) spread over the last days.
 * Most recent first at render time.
 */

export function buildSecurityEvents(
  nowMs: number,
  rng: Rng,
  trades: Trade[],
  instruments: Instrument[],
  skippedTrades: SkippedTrade[],
): SecurityEvent[] {
  const instrumentById = new Map(instruments.map((i) => [i.id, i]));
  const events: SecurityEvent[] = [];

  const push = (
    type: SecurityEventType,
    label: string,
    detail: string | null,
    createdAt: string,
  ) => {
    events.push({ id: uuid(rng), type, label, detail, createdAt });
  };

  // Trade captures + grades (derived, always consistent with the ledger).
  for (const trade of trades) {
    const symbol = instrumentById.get(trade.instrumentId)?.symbol ?? "Instrument";
    push(
      "trade",
      `Trade captured — ${symbol}`,
      `${trade.direction} · risk ${trade.riskAmount ?? "—"}`,
      trade.entryAt,
    );
    if (trade.decisionGrade !== null) {
      const gradedAt = trade.exitAt ?? trade.entryAt;
      push(
        "grade",
        `Decision graded — ${trade.decisionGrade}`,
        `${symbol} · ${trade.followedPlan === true ? "followed plan" : trade.followedPlan === false ? "off plan" : "plan not logged"}`,
        gradedAt,
      );
    }
  }

  // Ghost captures (setup seen, not taken).
  for (const ghost of skippedTrades.slice(0, 12)) {
    const symbol = instrumentById.get(ghost.instrumentId)?.symbol ?? "Instrument";
    push("trade", `Setup seen, not taken — ${symbol}`, null, ghost.seenAt);
  }

  // System + security rows, anchored to now (same slot grammar as alerts).
  const isoAt = (dayOffset: number, hour: number, minute: number): string =>
    new Date(nowMs - dayOffset * 86_400_000)
      .toISOString()
      .replace(/T\d{2}:\d{2}/, `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);

  push("security", "Signed in", "Chrome · macOS · Toronto, CA", isoAt(0, 8, 12));
  push("system", "Daily journal saved", "Pre-market plan + session intention", isoAt(0, 7, 41));
  push("system", "Backup exported", "JSON · 52 trades, 5 strategies, 9 tags", isoAt(1, 18, 3));
  push("security", "Signed in", "Safari · iPhone · Toronto, CA", isoAt(1, 9, 27));
  push("system", "Strategy updated", "Breakout NY — exit rule tightened", isoAt(2, 21, 15));
  push("system", "CSV import committed", "12 rows · broker history", isoAt(3, 10, 52));
  push("security", "Signed in", "Chrome · macOS · Toronto, CA", isoAt(3, 8, 5));
  push("security", "Password verified", "Session re-authentication", isoAt(5, 19, 44));
  push("system", "Backup exported", "JSON · 44 trades, 5 strategies, 8 tags", isoAt(6, 17, 29));
  push("security", "Signed in", "Firefox · Windows · Toronto, CA", isoAt(7, 11, 33));
  push("system", "Risk defaults changed", "Default risk per trade set to 1.0%", isoAt(8, 14, 18));
  push("security", "Signed in", "Chrome · macOS · Toronto, CA", isoAt(9, 8, 2));

  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
