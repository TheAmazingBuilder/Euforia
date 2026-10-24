/**
 * Trade Review contract mappers - rows → shared-schema-shaped payloads
 * (Phase 6 §37/§70). The ONLY place that translates persistence shapes into
 * wire shapes: Prisma rows and internal domain objects never reach the API
 * surface.
 *
 * Two wire conventions coexist BY CONTRACT (§38):
 *   - the workspace schemas (tradeReview.ts) keep their established
 *     `number` fields for pnlNet/rMultiple (frontend read models);
 *   - the Phase 6 comparison/summary schemas use the repository-wide
 *     decimal-string convention for financial values (§40).
 */
import { Prisma } from "@prisma/client";
import type {
  PlanVsActualComparison,
  ReviewRow,
  ReviewPlanSummary,
  ReviewPlanSnapshot,
  ReviewTradeSummary,
  TradeReview,
} from "../../shared/contracts";
import type { ReviewedJoinRow, PendingTradeRow, TradeReviewRow } from "./trade-review.repository";
import type { ReviewTradeFactRow } from "./trade-review.repository";
import type { PlanVsActualResult } from "./domain/plan-vs-actual";

/** Decimal → decimal-string without exponent notation (shared wire format). */
function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed();
}

/** Decimal → number for the workspace read models (established contract). */
function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `@db.Date` column → YYYY-MM-DD key (server-computed trading day). */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function checklistWire(value: Prisma.JsonValue | null): ReviewRow["checklistResults"] {
  if (value === null || value === undefined) return null;
  // Stored shape is exactly [{label, passed}] - the write path validated it;
  // a corrupted row fails loudly here instead of leaking garbage.
  return JSON.parse(JSON.stringify(value)) as ReviewRow["checklistResults"];
}

export function toReviewRowFromReview(join: ReviewedJoinRow): ReviewRow {
  const { review, trade } = join;
  return {
    tradeId: review.tradeId,
    symbol: trade.symbol,
    direction: trade.direction as ReviewRow["direction"],
    tradingDate: dateKey(trade.tradingDate),
    reviewStatus: "REVIEWED",
    decisionGrade: null,
    executionGrade: review.executionGrade as ReviewRow["executionGrade"],
    playbookMatch: review.playbookMatch as ReviewRow["playbookMatch"],
    followedPlan: review.followedPlan,
    entryQuality: review.entryQuality,
    exitQuality: review.exitQuality,
    riskManagement: review.riskManagement,
    rMultiple: decimalNumber(trade.rMultiple),
    pnlNet: decimalNumber(trade.pnlNet),
    currency: trade.currency as ReviewRow["currency"],
    strategyName: null,
    setupName: null,
    lesson: review.lessons,
    improvementNote: review.improvementNote,
    checklistResults: checklistWire(review.checklistResults),
    reviewedAt: isoDateTime(review.reviewedAt),
  };
}

export function toReviewRowFromPending(trade: PendingTradeRow): ReviewRow {
  return {
    tradeId: trade.id,
    symbol: trade.symbol,
    direction: trade.direction as ReviewRow["direction"],
    tradingDate: dateKey(trade.tradingDate),
    reviewStatus: "PENDING",
    decisionGrade: null,
    executionGrade: null,
    playbookMatch: null,
    followedPlan: null,
    entryQuality: null,
    exitQuality: null,
    riskManagement: null,
    rMultiple: decimalNumber(trade.rMultiple),
    pnlNet: decimalNumber(trade.pnlNet),
    currency: trade.currency as ReviewRow["currency"],
    strategyName: null,
    setupName: null,
    // The trade's own written note stands in for the workspace "lesson" on
    // pending rows (the review lesson does not exist yet). Trade.notes is
    // journal metadata - reading it does not modify the trade (§11).
    lesson: trade.notes,
    improvementNote: null,
    checklistResults: null,
    reviewedAt: null,
  };
}

/** The review payload inside the detail response (shared tradeReviewSchema). */
export function toReviewPayload(review: TradeReviewRow): TradeReview {
  return {
    id: review.id,
    userId: review.userId,
    tradeId: review.tradeId,
    executionGrade: review.executionGrade as TradeReview["executionGrade"],
    followedPlan: review.followedPlan,
    playbookMatch: review.playbookMatch as TradeReview["playbookMatch"],
    checklistResults: checklistWire(review.checklistResults),
    entryQuality: review.entryQuality,
    exitQuality: review.exitQuality,
    riskManagement: review.riskManagement,
    lessons: review.lessons,
    improvementNote: review.improvementNote,
    reviewedAt: isoDateTime(review.reviewedAt),
    updatedAt: isoDateTime(review.updatedAt),
  };
}

/** Authoritative trade facts for the detail response (§70 - Trading Core owns these). */
export function toReviewTradeSummary(
  trade: ReviewTradeFactRow & {
    quantity: Prisma.Decimal;
    closedQuantity: Prisma.Decimal;
    entryPrice: Prisma.Decimal | null;
    exitPrice: Prisma.Decimal | null;
    entryAt: Date | null;
    exitAt: Date | null;
    pnlGross: Prisma.Decimal | null;
    fees: Prisma.Decimal | null;
    swap: Prisma.Decimal | null;
    riskAmount: Prisma.Decimal | null;
    initialStop: Prisma.Decimal | null;
    initialTP: Prisma.Decimal | null;
  },
): ReviewTradeSummary {
  const durationSeconds =
    trade.exitAt !== null && trade.entryAt !== null
      ? Math.max(0, Math.round((trade.exitAt.getTime() - trade.entryAt.getTime()) / 1000))
      : null;
  return {
    tradeId: trade.id,
    status: trade.status,
    direction: trade.direction as ReviewTradeSummary["direction"],
    symbol: trade.symbol,
    currency: trade.currency as ReviewTradeSummary["currency"],
    quantity: trade.quantity.toFixed(),
    closedQuantity: trade.closedQuantity.toFixed(),
    entryPrice: decimalString(trade.entryPrice),
    exitPrice: decimalString(trade.exitPrice),
    entryAt: trade.entryAt === null ? null : isoDateTime(trade.entryAt),
    exitAt: trade.exitAt === null ? null : isoDateTime(trade.exitAt),
    durationSeconds,
    pnlGross: decimalString(trade.pnlGross),
    pnlNet: decimalString(trade.pnlNet),
    fees: decimalString(trade.fees),
    swap: decimalString(trade.swap),
    riskAmount: decimalString(trade.riskAmount),
    rMultiple: decimalString(trade.rMultiple),
    initialStop: decimalString(trade.initialStop),
    initialTP: decimalString(trade.initialTP),
  };
}

export function toPlanSummary(
  planId: string,
  snapshot: ReviewPlanSnapshot,
  currentStatus: string | null,
): ReviewPlanSummary {
  return { planId, currentStatus, snapshot };
}

export function toComparison(result: PlanVsActualResult): PlanVsActualComparison {
  return result;
}
