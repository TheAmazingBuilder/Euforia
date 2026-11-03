/**
 * Strategy view mappers - Prisma Strategy rows ⇄ shared strategySchema.
 *
 * PAYLOAD LAYOUT (the definition document - shared with the future Playbook
 * module; lifecycle columns name/status/color/grade/version are real cols):
 *   { description, entryRules, exitRules, riskRules, tags,
 *     detailedDescription, marketProfile, marketConditions, entryConditions,
 *     confirmations, invalidations, risk, tradeManagement, exitPlan }
 *
 * §17 semantics live with the Playbook module: definition changes spawn a
 * StrategyVersion row; status/color/grade mutate in place.
 */
import type { strategySchema } from "../../shared/contracts";
import type { z } from "zod";

export type StrategyView = z.infer<typeof strategySchema>;

/** The definition fields carried in the payload JSON column. */
export const STRATEGY_PAYLOAD_FIELDS = [
  "description",
  "entryRules",
  "exitRules",
  "riskRules",
  "tags",
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

export interface StrategyPayload {
  description?: string | null;
  entryRules?: string | null;
  exitRules?: string | null;
  riskRules?: string | null;
  tags?: string[];
  detailedDescription?: string | null;
  marketProfile?: unknown;
  marketConditions?: unknown[];
  entryConditions?: unknown[];
  confirmations?: unknown[];
  invalidations?: string[];
  risk?: unknown;
  tradeManagement?: unknown[];
  exitPlan?: unknown[];
}

export function strategyPayloadOf(row: { payload: unknown }): StrategyPayload {
  return (row.payload ?? {}) as StrategyPayload;
}

/** Prisma Strategy row (structural subset) → shared wire shape. */
export function toStrategyView(row: {
  id: string;
  userId: string;
  name: string;
  status: string;
  color: string | null;
  grade: string | null;
  version: number;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StrategyView {
  const def = strategyPayloadOf(row);
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: def.description ?? null,
    entryRules: def.entryRules ?? null,
    exitRules: def.exitRules ?? null,
    riskRules: def.riskRules ?? null,
    grade: row.grade as StrategyView["grade"],
    status: row.status as StrategyView["status"],
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    tags: def.tags ?? [],
    detailedDescription: def.detailedDescription ?? null,
    marketProfile: (def.marketProfile ?? null) as StrategyView["marketProfile"],
    marketConditions: (def.marketConditions ?? []) as StrategyView["marketConditions"],
    entryConditions: (def.entryConditions ?? []) as StrategyView["entryConditions"],
    confirmations: (def.confirmations ?? []) as StrategyView["confirmations"],
    invalidations: def.invalidations ?? [],
    risk: (def.risk ?? null) as StrategyView["risk"],
    tradeManagement: (def.tradeManagement ?? []) as StrategyView["tradeManagement"],
    exitPlan: (def.exitPlan ?? []) as StrategyView["exitPlan"],
    updatedAt: row.updatedAt.toISOString(),
  };
}
