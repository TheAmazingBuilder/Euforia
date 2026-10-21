/**
 * Trading Core contract mappers — rows → shared-schema-shaped payloads.
 * The ONLY place that translates persistence shapes into wire shapes.
 * Prisma models and execution internals never reach the API surface (§33);
 * provider-specific payloads are never exposed (§38/§39).
 */
import { Prisma } from "@prisma/client";
import type {
  JournalTradeDetail,
  JournalTradeSummary,
  TradeExecutionView,
} from "../../shared/contracts";
import type { TradeExecutionRow, TradeRow } from "./trading.repository";

/** Decimal → decimal-string without exponent notation (shared wire format). */
function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed();
}

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
export function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `@db.Date` column → YYYY-MM-DD key (server-computed trading day). */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toExecutionView(row: TradeExecutionRow): TradeExecutionView {
  return {
    id: row.id,
    tradeId: row.tradeId,
    role: row.role as TradeExecutionView["role"],
    side: row.side as TradeExecutionView["side"],
    volume: row.volume.toFixed(),
    price: decimalString(row.price),
    profit: decimalString(row.profit),
    commission: decimalString(row.commission),
    swap: decimalString(row.swap),
    executedAt: isoDateTime(row.executedAt),
    reason: (row.reason as TradeExecutionView["reason"]) ?? null,
    note: row.note,
    externalDealId: row.externalDealId,
  };
}

export function toTradeSummary(row: TradeRow): JournalTradeSummary {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    status: row.status as JournalTradeSummary["status"],
    direction: row.direction as JournalTradeSummary["direction"],
    source: row.source as JournalTradeSummary["source"],
    symbol: row.symbol,
    currency: row.currency,
    quantity: row.quantity.toFixed(),
    closedQuantity: row.closedQuantity.toFixed(),
    entryPrice: row.entryPrice.toFixed(),
    exitPrice: decimalString(row.exitPrice),
    entryAt: isoDateTime(row.entryAt),
    exitAt: row.exitAt === null ? null : isoDateTime(row.exitAt),
    fees: row.fees.toFixed(),
    swap: row.swap.toFixed(),
    pnlGross: decimalString(row.pnlGross),
    pnlNet: decimalString(row.pnlNet),
    tradingDate: dateKey(row.tradingDate),
    notes: row.notes,
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toTradeDetail(row: TradeRow & { executions: TradeExecutionRow[] }): JournalTradeDetail {
  return {
    ...toTradeSummary(row),
    exitReason: (row.exitReason as JournalTradeDetail["exitReason"]) ?? null,
    initialStop: decimalString(row.initialStop),
    initialTP: decimalString(row.initialTP),
    riskAmount: decimalString(row.riskAmount),
    rMultiple: decimalString(row.rMultiple),
    externalPositionId: row.externalPositionId,
    deletedAt: row.deletedAt === null ? null : isoDateTime(row.deletedAt),
    executions: row.executions.map(toExecutionView),
  };
}
