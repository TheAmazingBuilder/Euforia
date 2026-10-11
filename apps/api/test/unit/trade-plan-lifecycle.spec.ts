/**
 * Unit — TradePlan lifecycle state machine (Phase 5 §7/§38/§41).
 * Pure table checks: every legal transition is allowed, every documented
 * illegal one is rejected, and the mutation/operation policies line up.
 */
import { describe, expect, it } from "vitest";

import type { TradePlanStatus } from "../../src/shared/contracts";
import {
  canTransition,
  isAbandonable,
  isCancellable,
  isEditable,
  isRecalculable,
  isTerminal,
  isValidatable,
} from "../../src/modules/trade-planning/domain/trade-plan-lifecycle";

const ALL: TradePlanStatus[] = [
  "DRAFT",
  "PLANNED",
  "VALIDATED",
  "CANCELLED",
  "ABANDONED",
  "EXECUTED",
];

describe("trade plan lifecycle — legal transitions", () => {
  const legal: Array<[TradePlanStatus, TradePlanStatus]> = [
    ["DRAFT", "PLANNED"],
    ["DRAFT", "ABANDONED"],
    ["PLANNED", "VALIDATED"],
    ["PLANNED", "CANCELLED"],
    ["PLANNED", "ABANDONED"],
    ["VALIDATED", "CANCELLED"],
  ];
  it.each(legal)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe("trade plan lifecycle — illegal transitions (§51)", () => {
  const illegal: Array<[TradePlanStatus, TradePlanStatus]> = [
    // Terminal states never leave.
    ["CANCELLED", "VALIDATED"],
    ["CANCELLED", "PLANNED"],
    ["ABANDONED", "PLANNED"],
    ["ABANDONED", "DRAFT"],
    // Reserved state has no inbound edge this phase (§62).
    ["PLANNED", "EXECUTED"],
    ["VALIDATED", "EXECUTED"],
    ["EXECUTED", "DRAFT"],
    ["EXECUTED", "VALIDATED"],
    // Backwards motion.
    ["VALIDATED", "PLANNED"],
    ["VALIDATED", "DRAFT"],
    ["PLANNED", "DRAFT"],
    ["CANCELLED", "ABANDONED"],
    ["ABANDONED", "CANCELLED"],
  ];
  it.each(illegal)("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("trade plan lifecycle — operation policies", () => {
  it("edits and recalculations only in DRAFT/PLANNED (§38/§39)", () => {
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("PLANNED")).toBe(true);
    expect(isEditable("VALIDATED")).toBe(false);
    expect(isEditable("CANCELLED")).toBe(false);
    expect(isEditable("ABANDONED")).toBe(false);
    expect(isEditable("EXECUTED")).toBe(false);
    for (const status of ALL) {
      expect(isRecalculable(status)).toBe(isEditable(status));
    }
  });

  it("validation only from PLANNED", () => {
    expect(isValidatable("PLANNED")).toBe(true);
    expect(isValidatable("DRAFT")).toBe(false);
    expect(isValidatable("VALIDATED")).toBe(false);
    expect(isValidatable("CANCELLED")).toBe(false);
    expect(isValidatable("ABANDONED")).toBe(false);
  });

  it("cancellation from PLANNED/VALIDATED, abandonment from DRAFT/PLANNED", () => {
    expect(isCancellable("PLANNED")).toBe(true);
    expect(isCancellable("VALIDATED")).toBe(true);
    expect(isCancellable("DRAFT")).toBe(false);
    expect(isCancellable("CANCELLED")).toBe(false);
    expect(isAbandonable("DRAFT")).toBe(true);
    expect(isAbandonable("PLANNED")).toBe(true);
    expect(isAbandonable("VALIDATED")).toBe(false);
    expect(isAbandonable("CANCELLED")).toBe(false);
  });

  it("terminality", () => {
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("ABANDONED")).toBe(true);
    expect(isTerminal("EXECUTED")).toBe(true);
    expect(isTerminal("DRAFT")).toBe(false);
    expect(isTerminal("PLANNED")).toBe(false);
    expect(isTerminal("VALIDATED")).toBe(false);
  });
});
