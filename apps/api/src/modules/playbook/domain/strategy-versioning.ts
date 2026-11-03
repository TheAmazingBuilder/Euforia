/**
 * Strategy versioning (Phase 7 §11–§13/§17) - the product's freeze-before-
 * mutation model.
 *
 * A strategy carries a definition revision counter (`version`). When a PATCH
 * touches any DEFINITION field, the CURRENT full definition is frozen into
 * an immutable StrategyVersionSnapshot BEFORE the mutation is applied, and
 * the counter is bumped. Lifecycle/presentation fields (name, status,
 * grade, color, tags) mutate IN PLACE without creating a version - they are
 * not part of the methodology a trade was executed under.
 *
 * There is NO draft/publish lifecycle in this product (§13/§56 documented):
 * versions are created implicitly on material definition change, snapshots
 * are immutable once written, and any historical reference resolves through
 * GET /strategies/:id/versions (§70/§71).
 */

/** The 13 definition fields whose change freezes a new version (§17). */
export const STRATEGY_DEFINITION_FIELDS = [
  "description",
  "entryRules",
  "exitRules",
  "riskRules",
  "detailedDescription",
  "marketProfile",
  "marketConditions",
  "entryConditions",
  "confirmations",
  "invalidations",
  "risk",
  "tradeManagement",
  "exitPlan",
] as const;

export type StrategyDefinitionField = (typeof STRATEGY_DEFINITION_FIELDS)[number];

/** True when the patch mutates the strategy's METHODOLOGY (→ freeze first). */
export function touchesDefinition(
  patch: Record<string, unknown>,
): boolean {
  return STRATEGY_DEFINITION_FIELDS.some((field) => patch[field] !== undefined);
}

/** Product copy frozen alongside every snapshot (§17 fixture parity). */
export const VERSION_FREEZE_REASON = "Edited in the Playbook";
