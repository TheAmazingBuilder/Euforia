/**
 * Trading Core contract mappers - rows → shared-schema-shaped payloads.
 * The ONLY place that translates persistence shapes into wire shapes.
 * Prisma rows never leak past this boundary; decimals serialize as the
 * shared decimal-string format; timestamps as UTC ISO with Z.
 */
import type { z } from "zod";
import {
  dateKeyOf,
} from "./trade-calculations";
import type {
  InstrumentRow,
  SavedTradeViewRow,
  TradeEventRow,
  TradeRow,
  TradeScreenshotRow,
} from "./trades.repository";
import type {
  instrumentSchema,
  savedTradeViewSchema,
  tradeEventSchema,
  tradeSchema,
  tradeScreenshotSchema,
} from "../../shared/contracts";

/** Decimal → canonical decimal-string: at most 8 decimals (numeric(18,8)),
 * trailing zeros stripped - the shared toDecimalString wire convention. */
function decimal(value: PrismaDecimalLike): string {
  const fixed = value.toFixed(8);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

interface PrismaDecimalLike {
  toFixed(decimals?: number): string;
}

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
export function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function toInstrumentView(row: InstrumentRow): z.infer<typeof instrumentSchema> {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    assetClass: row.assetClass as z.infer<typeof instrumentSchema>["assetClass"],
    quoteCurrency: row.quoteCurrency as z.infer<typeof instrumentSchema>["quoteCurrency"],
    pipSize: decimal(row.pipSize),
    digits: row.digits,
    contractSize: decimal(row.contractSize),
    isActive: row.isActive,
  };
}

export function toTradeView(
  row: TradeRow,
  extras: { tagIds?: string[] } = {},
): z.infer<typeof tradeSchema> {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    instrumentId: row.instrumentId,
    strategyId: row.strategyId,
    setupId: row.setupId ?? undefined,
    strategyVersion: row.strategyVersion ?? undefined,

    status: row.status as z.infer<typeof tradeSchema>["status"],
    direction: row.direction as z.infer<typeof tradeSchema>["direction"],
    source: row.source as z.infer<typeof tradeSchema>["source"],

    entryPrice: decimal(row.entryPrice),
    entryAt: isoDateTime(row.entryAt),
    quantity: decimal(row.quantity),
    initialStop: row.initialStop === null ? null : decimal(row.initialStop),
    initialTP: row.initialTP === null ? null : decimal(row.initialTP),
    plannedRR: row.plannedRR === null ? null : decimal(row.plannedRR),
    riskAmount: row.riskAmount === null ? null : decimal(row.riskAmount),

    finalStop: row.finalStop === null ? null : decimal(row.finalStop),
    exitPrice: row.exitPrice === null ? null : decimal(row.exitPrice),
    exitAt: row.exitAt === null ? null : isoDateTime(row.exitAt),
    exitReason: row.exitReason === null
      ? null
      : (row.exitReason as z.infer<typeof tradeSchema>["exitReason"]),
    fees: decimal(row.fees),
    swap: decimal(row.swap),

    pnlGross: row.pnlGross === null ? null : decimal(row.pnlGross),
    pnlNet: row.pnlNet === null ? null : decimal(row.pnlNet),
    rMultiple: row.rMultiple === null ? null : decimal(row.rMultiple),
    mfePrice: row.mfePrice === null ? null : decimal(row.mfePrice),
    maePrice: row.maePrice === null ? null : decimal(row.maePrice),
    mfeR: row.mfeR === null ? null : decimal(row.mfeR),
    maeR: row.maeR === null ? null : decimal(row.maeR),

    emotionBefore: row.emotionBefore === null
      ? null
      : (row.emotionBefore as z.infer<typeof tradeSchema>["emotionBefore"]),
    emotionAfter: row.emotionAfter === null
      ? null
      : (row.emotionAfter as z.infer<typeof tradeSchema>["emotionAfter"]),
    confidence: row.confidence,

    decisionGrade: row.decisionGrade === null
      ? null
      : (row.decisionGrade as z.infer<typeof tradeSchema>["decisionGrade"]),

    followedPlan: row.followedPlan,
    checklistSnap: (row.checklistSnap ?? null) as z.infer<typeof tradeSchema>["checklistSnap"],

    notes: row.notes,
    lessons: row.lessons,
    tradingDate: dateKeyOf(row.tradingDate),
    externalRef: row.externalRef,

    importBatchId: row.importBatchId,
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
    deletedAt: row.deletedAt === null ? null : isoDateTime(row.deletedAt),

    ...(extras.tagIds !== undefined ? { tagIds: extras.tagIds } : {}),
  };
}

export function toTradeEventView(row: TradeEventRow): z.infer<typeof tradeEventSchema> {
  return {
    id: row.id,
    tradeId: row.tradeId,
    type: row.type as z.infer<typeof tradeEventSchema>["type"],
    payload: row.payload as z.infer<typeof tradeEventSchema>["payload"],
    source: row.source as z.infer<typeof tradeEventSchema>["source"],
    createdAt: isoDateTime(row.createdAt),
  };
}

export async function toScreenshotView(
  row: TradeScreenshotRow,
  storage: { dataUrlOf(storageKey: string): string | null | Promise<string | null> },
): Promise<z.infer<typeof tradeScreenshotSchema>> {
  const resolved = (await storage.dataUrlOf(row.storageKey)) ?? row.storageKey;
  return {
    id: row.id,
    tradeId: row.tradeId,
    kind: row.kind as z.infer<typeof tradeScreenshotSchema>["kind"],
    storageKey: resolved,
    caption: row.caption,
    annotations: (row.annotations ?? null) as z.infer<typeof tradeScreenshotSchema>["annotations"],
    createdAt: isoDateTime(row.createdAt),
  };
}

export function toSavedViewView(
  row: SavedTradeViewRow,
): z.infer<typeof savedTradeViewSchema> {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as z.infer<typeof savedTradeViewSchema>["scope"],
    filters: row.filters as z.infer<typeof savedTradeViewSchema>["filters"],
    analyticsFilters: (row.analyticsFilters ?? null) as z.infer<typeof savedTradeViewSchema>["analyticsFilters"],
    columns: row.columns as z.infer<typeof savedTradeViewSchema>["columns"],
    sortKey: row.sortKey as z.infer<typeof savedTradeViewSchema>["sortKey"],
    sortDir: row.sortDir as z.infer<typeof savedTradeViewSchema>["sortDir"],
    createdAt: isoDateTime(row.createdAt),
  };
}
