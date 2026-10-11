/**
 * Playbook contract mappers (Phase 7) — rows → shared-schema-shaped payloads.
 * The ONLY place that translates persistence shapes into wire shapes.
 * Prisma models never reach the API surface (§50/§51 of the phase prompt).
 */
import { Prisma } from "@prisma/client";

import type {
  ChecklistTemplate,
  PlaybookRule,
  Setup,
  Strategy,
  StrategyVersionSnapshot,
} from "../../shared/contracts";
import type {
  ChecklistRow,
  PlaybookRuleRow,
  SetupRow,
  StrategyRow,
  StrategySnapshotRow,
} from "./playbook.repository";

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
export function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** JSON column → wire value (null passthrough, typed at the boundary). */
function json<T>(value: Prisma.JsonValue | null): T | null {
  return value === null || value === undefined ? null : (value as T);
}

/**
 * JSON column that is ALWAYS an array on the wire when defined — the product
 * normalizes absent structured lists to [] (createStrategy defaults), never
 * to null.
 */
function jsonArray<T>(value: Prisma.JsonValue | null): T[] {
  return value === null || value === undefined ? [] : (value as T[]);
}

/**
 * The full wire shape of a strategy — ALSO the freeze payload captured into
 * StrategyVersionSnapshot (the snapshot stores the contract-verbatim shape,
 * structuredClone semantics, §17).
 */
export function toStrategyWire(row: StrategyRow): Strategy {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    entryRules: row.entryRules,
    exitRules: row.exitRules,
    riskRules: row.riskRules,
    grade: row.grade as Strategy["grade"],
    status: row.status as Strategy["status"],
    color: row.color,
    createdAt: isoDateTime(row.createdAt),
    version: row.version,
    tags: jsonArray<string>(row.tags),
    detailedDescription: row.detailedDescription,
    marketProfile: json(row.marketProfile),
    marketConditions: jsonArray(row.marketConditions),
    entryConditions: jsonArray(row.entryConditions),
    confirmations: jsonArray(row.confirmations),
    invalidations: jsonArray<string>(row.invalidations),
    risk: json(row.risk),
    tradeManagement: jsonArray(row.tradeManagement),
    exitPlan: jsonArray(row.exitPlan),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toSetupWire(row: SetupRow): Setup {
  return {
    id: row.id,
    userId: row.userId,
    strategyId: row.strategyId,
    name: row.name,
    status: row.status as Setup["status"],
    description: row.description,
    context: row.context,
    marketCondition: row.marketCondition as Setup["marketCondition"],
    trigger: row.trigger,
    confirmation: row.confirmation,
    entryModel: row.entryModel,
    stopModel: row.stopModel,
    targetModel: row.targetModel,
    invalidation: row.invalidation,
    notes: row.notes,
    tags: jsonArray<string>(row.tags),
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toChecklistWire(row: ChecklistRow): ChecklistTemplate {
  return {
    id: row.id,
    userId: row.userId,
    strategyId: row.strategyId,
    name: row.name,
    items: row.items as ChecklistTemplate["items"],
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toRuleWire(row: PlaybookRuleRow): PlaybookRule {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    detail: row.detail,
    category: row.category as PlaybookRule["category"],
    scope: row.scope as PlaybookRule["scope"],
    strategyId: row.strategyId,
    evaluatable: row.evaluatable,
    evaluationHint: row.evaluationHint,
    active: row.active,
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  };
}

export function toSnapshotWire(row: StrategySnapshotRow): StrategyVersionSnapshot {
  return {
    id: row.id,
    strategyId: row.strategyId,
    version: row.version,
    snapshot: row.snapshot as StrategyVersionSnapshot["snapshot"],
    reason: row.reason,
    createdAt: isoDateTime(row.createdAt),
  };
}
