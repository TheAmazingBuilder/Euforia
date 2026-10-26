/**
 * Unit - Trade Review lifecycle (Phase 6 §10/§32/§44).
 *
 * The state machine is intentionally small: only states the product
 * exercises, explicit transitions, no arbitrary mutation.
 */
import { describe, expect, it } from "vitest";

import {
  REVIEW_STATUS,
  archiveAcceptsState,
  canTransitionReview,
  patchAcceptsState,
  upsertAcceptsState,
} from "../../src/modules/trade-review/domain/review-lifecycle";

describe("review lifecycle - transition table (§10)", () => {
  it("allows COMPLETED → ARCHIVED (undo review)", () => {
    expect(canTransitionReview(REVIEW_STATUS.COMPLETED, REVIEW_STATUS.ARCHIVED)).toBe(true);
  });

  it("allows ARCHIVED → COMPLETED (re-review after undo)", () => {
    expect(canTransitionReview(REVIEW_STATUS.ARCHIVED, REVIEW_STATUS.COMPLETED)).toBe(true);
  });

  it("forbids same-status lifecycle moves", () => {
    expect(canTransitionReview(REVIEW_STATUS.COMPLETED, REVIEW_STATUS.COMPLETED)).toBe(false);
    expect(canTransitionReview(REVIEW_STATUS.ARCHIVED, REVIEW_STATUS.ARCHIVED)).toBe(false);
  });
});

describe("review lifecycle - operation gates (§32)", () => {
  it("upsert accepts both states (create/edit/reactivate)", () => {
    expect(upsertAcceptsState(REVIEW_STATUS.COMPLETED)).toBe(true);
    expect(upsertAcceptsState(REVIEW_STATUS.ARCHIVED)).toBe(true);
  });

  it("patch accepts only COMPLETED rows", () => {
    expect(patchAcceptsState(REVIEW_STATUS.COMPLETED)).toBe(true);
    expect(patchAcceptsState(REVIEW_STATUS.ARCHIVED)).toBe(false);
  });

  it("archive accepts only COMPLETED rows (second delete is a 404)", () => {
    expect(archiveAcceptsState(REVIEW_STATUS.COMPLETED)).toBe(true);
    expect(archiveAcceptsState(REVIEW_STATUS.ARCHIVED)).toBe(false);
  });
});
