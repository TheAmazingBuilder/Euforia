/**
 * Trade Planning contract mappers — rows → shared-schema-shaped payloads.
 * The ONLY place that translates persistence shapes into wire shapes.
 * Prisma models and engine internals never reach the API surface (§33).
 */
import { Prisma } from "@prisma/client";

import type {
  TradePlanChecklistSnapshot,
  TradePlanDetail,
  TradePlanSummary,
  TradePlanValidationIssue,
} from "../../shared/contracts";
import type { TradePlanRow } from "./trade-plan.repository";

/** Decimal → decimal-string without exponent notation (shared wire format). */
function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed();
}

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
export function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function checklistOf(row: TradePlanRow): TradePlanChecklistSnapshot | null {
  return row.checklist === null || row.checklist === undefined
    ? null
    : (row.checklist as TradePlanChecklistSnapshot);
}

function lastValidationOf(
  row: TradePlanRow,
): TradePlanDetail["lastValidation"] {
  if (row.lastValidation === null || row.lastValidation === undefined) return null;
  const value = row.lastValidation as {
    evaluatedAt: string;
    passed: boolean;
    issues: TradePlanValidationIssue[];
  };
  return value;
}

export function toTradePlanSummary(row: TradePlanRow): TradePlanSummary {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    status: row.status as TradePlanSummary["status"],
    direction: row.direction as TradePlanSummary["direction"],
    entryType: row.entryType as TradePlanSummary["entryType"],
    symbol: row.symbol,
    currency: row.currency,
    timeframe: row.timeframe,
    strategyId: row.strategyId,
    entryPrice: row.entryPrice.toFixed(),
    stopLoss: decimalString(row.stopLoss),
    takeProfit: decimalString(row.takeProfit),
    // Sizing INPUT as provided (distinct from derived risk, §39).
    size:
      row.sizeMode === "quantity"
        ? { mode: "quantity" as const, quantity: row.sizeValue.toFixed() }
        : row.sizeMode === "risk_percent"
          ? { mode: "risk_percent" as const, riskPercent: row.sizeValue.toFixed() }
          : { mode: "risk_amount" as const, riskAmount: row.sizeValue.toFixed() },
    risk: {
      balanceSnapshot: decimalString(row.balanceSnapshot),
      riskPercent: decimalString(row.riskPercent),
      riskAmount: decimalString(row.riskAmount),
      stopDistance: decimalString(row.stopDistance),
      stopPips: decimalString(row.stopPips),
      positionSize: decimalString(row.positionSize),
      potentialProfit: decimalString(row.potentialProfit),
      potentialLoss: decimalString(row.potentialLoss),
      rrRatio: decimalString(row.rrRatio),
    },
    checklistComplete: row.checklistComplete,
    validationPassed:
      row.lastValidation === null || row.lastValidation === undefined
        ? null
        : (lastValidationOf(row)?.passed ?? null),
    plannedAt: row.plannedAt === null ? null : isoDateTime(row.plannedAt),
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toTradePlanDetail(row: TradePlanRow): TradePlanDetail {
  return {
    ...toTradePlanSummary(row),
    rationale: row.rationale,
    checklist: checklistOf(row),
    lastValidation: lastValidationOf(row),
    validatedAt: row.validatedAt === null ? null : isoDateTime(row.validatedAt),
    cancelledAt: row.cancelledAt === null ? null : isoDateTime(row.cancelledAt),
    abandonedAt: row.abandonedAt === null ? null : isoDateTime(row.abandonedAt),
    clientRequestId: row.clientRequestId,
  };
}
