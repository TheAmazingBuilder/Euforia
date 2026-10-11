/**
 * Pre-trade validation battery (Phase 5 §21) — the domain service that turns
 * a plan configuration into STRUCTURED, machine-readable findings
 * (code/severity/field/message — never an opaque "invalid trade").
 *
 * Composition: the risk engine (risk-engine.ts) emits configuration findings;
 * this battery adds the checklist gate (§23) and the risk-limit gate (§22),
 * then decides pass/fail: `passed` = zero ERROR findings. WARNINGs never
 * block — they document honest gaps (no target yet, no catalog row for a
 * quantity-sized plan).
 *
 * This file is DOMAIN: pure functions over plain data.
 */
import { Decimal } from "decimal.js";

import type {
  TradePlanChecklistSnapshot,
  TradePlanValidationIssue,
} from "../../../shared/contracts";
import {
  computePlannedRisk,
  type PlanDirection,
  type PlanSizeMode,
  type RiskEngineInput,
} from "./risk-engine";
import type { RiskLimits } from "./ports";

/** Everything the battery needs to judge one plan. */
export interface ValidationBatteryInput {
  direction: PlanDirection;
  entryPrice: Decimal;
  stopLoss: Decimal | null;
  takeProfit: Decimal | null;
  sizeMode: PlanSizeMode;
  sizeValue: Decimal;
  /** Account balance snapshot (account currency) — null when unusable. */
  balance: Decimal | null;
  /** Instrument specification — null when the catalog has no row (§15). */
  specs: RiskEngineInput["specs"];
  /** Quote→account conversion multiplier — null when unavailable (§16). */
  fxRate: RiskEngineInput["fxRate"];
  /** Frozen checklist evaluation attached to the plan (§24) — null when none. */
  checklist: TradePlanChecklistSnapshot | null;
  /** Account-level limits resolved through the RiskLimitProvider port (§22). */
  limits: RiskLimits;
}

export interface ValidationBatteryResult {
  passed: boolean;
  issues: TradePlanValidationIssue[];
  /** The fresh authoritative risk computation (persisted by the caller). */
  risk: ReturnType<typeof computePlannedRisk>;
}

/**
 * Run the full battery over one plan configuration.
 * Pure: no I/O, no clock — the caller stamps evaluatedAt.
 */
export function runValidationBattery(input: ValidationBatteryInput): ValidationBatteryResult {
  const issues: TradePlanValidationIssue[] = [];

  // ── Risk engine (directional integrity, sizing, constraints, §11–§20) ─────
  const risk = computePlannedRisk({
    direction: input.direction,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    sizeMode: input.sizeMode,
    sizeValue: input.sizeValue,
    balance: input.balance,
    specs: input.specs,
    fxRate: input.fxRate,
  });
  issues.push(...risk.issues);

  // ── Checklist gate (§23) ───────────────────────────────────────────────────
  if (input.checklist !== null) {
    const missingRequired = input.checklist.items.filter(
      (item) => item.required && !item.checked,
    );
    if (missingRequired.length > 0) {
      issues.push({
        code: "CHECKLIST_INCOMPLETE",
        severity: "ERROR",
        field: "checklist",
        message: `${missingRequired.length} required checklist item(s) are not checked.`,
      });
    }
  }

  // ── Risk-limit gate (§22) — only when limits are actually configured ──────
  if (input.limits.maxRiskPercentPerTrade !== null && risk.riskPercent !== null) {
    if (risk.riskPercent.gt(input.limits.maxRiskPercentPerTrade)) {
      issues.push({
        code: "RISK_LIMIT_EXCEEDED",
        severity: "ERROR",
        field: "size",
        message: `Planned risk ${risk.riskPercent.toFixed()}% exceeds the per-trade limit of ${input.limits.maxRiskPercentPerTrade.toFixed()}%.`,
      });
    }
  }
  if (input.limits.maxRiskAmountPerTrade !== null && risk.riskAmount !== null) {
    if (risk.riskAmount.gt(input.limits.maxRiskAmountPerTrade)) {
      issues.push({
        code: "RISK_LIMIT_EXCEEDED",
        severity: "ERROR",
        field: "size",
        message: `Planned risk ${risk.riskAmount.toFixed()} exceeds the per-trade limit of ${input.limits.maxRiskAmountPerTrade.toFixed()}.`,
      });
    }
  }

  const passed = !issues.some((candidate) => candidate.severity === "ERROR");
  return { passed, issues, risk };
}

/**
 * Structural subset of the battery used at CREATE/UPDATE time (§11/§12):
 * these ERROR findings make a configuration meaningless (inverted stop,
 * inverted target, sizing impossible) — such plans are REJECTED at the door
 * with 422 instead of being stored with silently broken risk. Everything
 * else (warnings, checklist, limits) is judged by the validate operation.
 */
export function structuralError(
  issues: readonly TradePlanValidationIssue[],
  codes: readonly string[],
): TradePlanValidationIssue | null {
  return issues.find((candidate) => candidate.severity === "ERROR" && codes.includes(candidate.code)) ?? null;
}
