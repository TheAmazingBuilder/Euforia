/**
 * Origin-plan snapshot freezer (Phase 6 §25/§26/§40).
 *
 * TradePlan rows stay mutable while DRAFT/PLANNED; a review that claims
 * "this was my plan" must therefore FREEZE the comparison-relevant plan
 * values at save time - otherwise later plan edits would silently rewrite
 * what the review compared against (historical integrity / reproducibility,
 * §26: "create snapshots only where required").
 *
 * Everything else stays referenced, not copied: the review holds
 * originTradePlanId and the snapshot - never a duplicate of the whole plan.
 *
 * Decimal values are stored as decimal STRINGS inside the JSONB snapshot
 * (json numbers lose precision, §40). The domain never round-trips through
 * binary floats.
 *
 * Domain module: imports NO framework code (§75) - the shared contract
 * schema travels through the api contract barrel (types + plain zod only).
 */
import { reviewPlanSnapshotSchema, type ReviewPlanSnapshot } from "../../../shared/contracts";

/** Comparison-relevant fields of a TradePlan row (wire-format strings). */
export interface PlanSnapshotSource {
  id: string;
  status: string;
  direction: "BUY" | "SELL";
  symbol: string;
  currency: string;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  sizeMode: string;
  sizeValue: string;
  riskAmount: string | null;
  riskPercent: string | null;
  positionSize: string | null;
  rrRatio: string | null;
}

/**
 * Freeze the plan's comparison-relevant values into the snapshot shape.
 * The output is JSON-serializable and validated against the shared
 * snapshot schema - a malformed snapshot can never be persisted.
 */
export function freezePlanSnapshot(plan: PlanSnapshotSource, at: Date): ReviewPlanSnapshot {
  const snapshot = {
    planId: plan.id,
    planStatus: plan.status,
    direction: plan.direction,
    symbol: plan.symbol,
    currency: plan.currency,
    entryPrice: plan.entryPrice,
    stopLoss: plan.stopLoss,
    takeProfit: plan.takeProfit,
    sizeMode: plan.sizeMode,
    sizeValue: plan.sizeValue,
    riskAmount: plan.riskAmount,
    riskPercent: plan.riskPercent,
    positionSize: plan.positionSize,
    rrRatio: plan.rrRatio,
    snapshottedAt: at.toISOString(),
  };
  return reviewPlanSnapshotSchema.parse(snapshot);
}

/**
 * Re-validate a snapshot read back from JSONB (defensive - the shape is a
 * contract; a corrupted row fails loudly instead of feeding the comparison
 * engine with fabricated numbers). Returns null for absent snapshots.
 */
export function parsePlanSnapshot(raw: unknown): ReviewPlanSnapshot | null {
  if (raw === null || raw === undefined) return null;
  return reviewPlanSnapshotSchema.parse(raw);
}
