/**
 * Strategy completeness health (Phase 7 §20 of the product contract) -
 * FACTUAL indicators only, never profitability judgments (§82 of the phase
 * prompt): the playbook describes methodology; Analytics owns performance.
 *
 * Mirrors the product read model (PlaybookOverviewResponse.health):
 *   DRAFT / ARCHIVED          - lifecycle state echoes
 *   NO_RECENT_TRADES          - no trade attributed in the last 30 days
 *   MISSING_RISK              - risk frame absent or every field null
 *   MISSING_ENTRY_CONDITIONS  - no structured conditions AND no markdown body
 *   MISSING_INVALIDATION      - no invalidation criteria
 *   MISSING_CHECKLIST         - neither own nor global checklist template
 */

import type { StrategyHealthFlag } from "../../../shared/contracts";

export interface StrategyHealthInput {
  id: string;
  status: string;
  entryRules: string | null;
  entryConditions: unknown; // JSON column - array when present
  invalidations: unknown; // JSON column - array when present
  risk: unknown; // JSON column - object when present
}

export interface StrategyUsage {
  /** Last trade attribution (entry time) - null when none exists. */
  lastTradeAt: Date | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isMissingRisk(risk: unknown): boolean {
  if (risk === null || risk === undefined || typeof risk !== "object") return true;
  return Object.values(risk as Record<string, unknown>).every(
    (value) => value === null || value === undefined,
  );
}

function arraySize(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Computes the completeness flags for ONE strategy.
 *
 * `usage.lastTradeAt` comes from the Trading Core attribution
 * (Trade.strategyId). While Trading Core carries no playbook attribution
 * (documented Phase 7 seam), usage is empty for every strategy and
 * NO_RECENT_TRADES is the honest flag - "no trade attributed" is factually
 * true, not a guess.
 */
export function computeStrategyHealth(
  strategy: StrategyHealthInput,
  usage: StrategyUsage | undefined,
  hasOwnChecklist: boolean,
  hasGlobalChecklist: boolean,
): StrategyHealthFlag[] {
  const flags: StrategyHealthFlag[] = [];

  if (strategy.status === "DRAFT") flags.push("DRAFT");
  if (strategy.status === "RETIRED") flags.push("ARCHIVED");

  const lastTradeAt = usage?.lastTradeAt ?? null;
  if (
    lastTradeAt === null ||
    Date.now() - lastTradeAt.getTime() > THIRTY_DAYS_MS
  ) {
    flags.push("NO_RECENT_TRADES");
  }

  if (isMissingRisk(strategy.risk)) flags.push("MISSING_RISK");
  if (
    arraySize(strategy.entryConditions) === 0 &&
    strategy.entryRules === null
  ) {
    flags.push("MISSING_ENTRY_CONDITIONS");
  }
  if (arraySize(strategy.invalidations) === 0) flags.push("MISSING_INVALIDATION");
  if (!hasOwnChecklist && !hasGlobalChecklist) flags.push("MISSING_CHECKLIST");

  return flags;
}
