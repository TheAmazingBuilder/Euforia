/**
 * Session Live contract mappers — rows → shared-schema-shaped payloads.
 * The ONLY place translating persistence shapes into wire shapes; Prisma
 * internals never cross the module boundary (repo-wide convention).
 *
 * Decimal columns map to the shared contract's NUMBERS (tradingSession.
 * riskPerTradePct, keyLevel.price, savedAnalysis.priceAtSave) — the shared
 * sessionLive schemas are consumed verbatim (numbers on the wire), the same
 * "follow the contract" rule as Phase 6's workspace numbers.
 */
import type { Prisma } from "@prisma/client";
import type {
  KeyLevel,
  MarketInterval,
  SavedAnalysis,
  SessionNote,
  SessionLiveEvent,
  TradingSession,
} from "../../shared/contracts";
import type {
  KeyLevelRow,
  SavedAnalysisRow,
  SessionNoteRow,
  TradingSessionEventRow,
  TradingSessionRow,
} from "./session-live.repository";

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** @db.Date column → YYYY-MM-DD key (server-computed trading day). */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Decimal → number (shared sessionLive contract uses numbers, never strings). */
function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value.toFixed());
}

export function toSessionLiveEvent(row: TradingSessionEventRow): SessionLiveEvent {
  return {
    id: row.id,
    at: isoDateTime(row.at),
    kind: row.kind as SessionLiveEvent["kind"],
    label: row.label,
    detail: row.detail,
    source: row.source,
  };
}

export function toTradingSession(row: TradingSessionRow): TradingSession {
  return {
    id: row.id,
    status: row.status as TradingSession["status"],
    startedAt: isoDateTime(row.startedAt),
    endedAt: row.endedAt === null ? null : isoDateTime(row.endedAt),
    primarySymbol: row.primarySymbol,
    primaryTimeframe: row.primaryTimeframe as MarketInterval,
    tradingWindow: row.tradingWindow as TradingSession["tradingWindow"],
    strategyId: row.strategyId,
    setupId: row.setupId,
    marketBias: row.marketBias as TradingSession["marketBias"],
    sessionObjective: row.sessionObjective,
    notes: row.notes,
    riskPerTradePct: decimalNumber(row.riskPerTradePct),
    dailyRiskLimitPct: decimalNumber(row.dailyRiskLimitPct),
    events: row.events.map(toSessionLiveEvent),
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toSavedAnalysis(row: SavedAnalysisRow): SavedAnalysis {
  return {
    id: row.id,
    sessionId: row.sessionId,
    symbol: row.symbol,
    timeframe: row.timeframe as MarketInterval,
    createdAt: isoDateTime(row.createdAt),
    priceAtSave: decimalNumber(row.priceAtSave),
    bias: row.bias as SavedAnalysis["bias"],
    bullishScenario: row.bullishScenario,
    bearishScenario: row.bearishScenario,
    strategyId: row.strategyId,
    setupId: row.setupId,
    notes: row.notes,
    indicators: row.indicators as SavedAnalysis["indicators"],
    drawings: row.drawings as SavedAnalysis["drawings"],
    levels: row.levels as SavedAnalysis["levels"],
  };
}

export function toKeyLevel(row: KeyLevelRow): KeyLevel {
  return {
    id: row.id,
    symbol: row.symbol,
    kind: row.kind as KeyLevel["kind"],
    price: Number(row.price.toFixed()),
    note: row.note,
    createdAt: isoDateTime(row.createdAt),
  };
}

export function toSessionNote(row: SessionNoteRow): SessionNote {
  return {
    id: row.id,
    date: dateKey(row.date),
    at: isoDateTime(row.at),
    text: row.text,
  };
}
