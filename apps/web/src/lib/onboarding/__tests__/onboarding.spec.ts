import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  ONBOARDING_VERSION,
  onboardingPreferencesSchema,
  type OnboardingPreferences,
} from "@cosmoz/shared";

import {
  isOnboardingStepId,
  nextStep,
  normalizeStepId,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEP_ORDER,
  previousStep,
  stepIndex,
} from "../steps";
import {
  appearanceDomainWithOverlay,
  onboardingCompleteInput,
  onboardingSkipInput,
  onboardingStartInput,
  onboardingStepInput,
  resolveOnboardingEligibility,
  resolveResumeStep,
  tradingDomainWithOverlay,
} from "../state";

const NOW = "2026-10-19T12:00:00.000Z";

function onboardingState(overrides: Partial<OnboardingPreferences> = {}): OnboardingPreferences {
  return {
    status: "NOT_STARTED",
    version: ONBOARDING_VERSION,
    currentStep: null,
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    stepsDone: [],
    ...overrides,
  };
}

// ── steps ────────────────────────────────────────────────────────────────────

describe("onboarding steps", () => {
  it("exposes the six-step sequence", () => {
    expect(ONBOARDING_STEP_ORDER).toEqual([
      "welcome",
      "tour",
      "preferences",
      "accounts",
      "personalize",
      "ready",
    ]);
    expect(ONBOARDING_STEP_COUNT).toBe(6);
  });

  it("navigates the sequence with null at both ends", () => {
    expect(stepIndex("welcome")).toBe(0);
    expect(stepIndex("ready")).toBe(5);
    expect(nextStep("welcome")).toBe("tour");
    expect(nextStep("ready")).toBeNull();
    expect(previousStep("welcome")).toBeNull();
    expect(previousStep("ready")).toBe("personalize");
  });

  it("maps unknown or ghost step ids to the first step", () => {
    expect(isOnboardingStepId("payments")).toBe(false);
    expect(isOnboardingStepId("tour")).toBe(true);
    expect(normalizeStepId("does-not-exist")).toBe("welcome");
    expect(normalizeStepId(null)).toBe("welcome");
    expect(normalizeStepId("personalize")).toBe("personalize");
  });
});

// ── eligibility ──────────────────────────────────────────────────────────────

describe("resolveOnboardingEligibility", () => {
  const eligible = onboardingState();

  it("never renders before identity AND onboarding state are resolved", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "initializing",
        preferencesStatus: "success",
        onboarding: eligible,
      }),
    ).toBe("loading");
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "pending",
        onboarding: eligible,
      }),
    ).toBe("loading");
  });

  it("never runs for unauthenticated users", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "unauthenticated",
        preferencesStatus: "success",
        onboarding: eligible,
      }),
    ).toBe("not_required");
  });

  it("never runs for non-ACTIVE account states", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        userStatus: "PENDING_VERIFICATION",
        preferencesStatus: "success",
        onboarding: eligible,
      }),
    ).toBe("not_required");
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        userStatus: "SUSPENDED",
        preferencesStatus: "success",
        onboarding: eligible,
      }),
    ).toBe("not_required");
  });

  it("is eligible exactly for NOT_STARTED and IN_PROGRESS", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "success",
        onboarding: eligible,
      }),
    ).toBe("eligible");
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "success",
        onboarding: onboardingState({ status: "IN_PROGRESS", currentStep: "tour", startedAt: NOW }),
      }),
    ).toBe("eligible");
  });

  it("is not required for completed or skipped users", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "success",
        onboarding: onboardingState({ status: "COMPLETED", completedAt: NOW }),
      }),
    ).toBe("not_required");
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "success",
        onboarding: onboardingState({ status: "SKIPPED", skippedAt: NOW }),
      }),
    ).toBe("not_required");
  });

  it("treats a missing onboarding key as predating the tour (existing users)", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "success",
        onboarding: undefined,
      }),
    ).toBe("not_required");
  });

  it("resolves a status fetch failure to error — never assumes a new user", () => {
    expect(
      resolveOnboardingEligibility({
        authStatus: "authenticated",
        preferencesStatus: "error",
        onboarding: undefined,
      }),
    ).toBe("error");
  });
});

// ── resume ───────────────────────────────────────────────────────────────────

describe("resolveResumeStep", () => {
  it("starts at the first step for a fresh or predating user", () => {
    expect(resolveResumeStep(undefined)).toBeNull();
    expect(resolveResumeStep(onboardingState())).toBe("welcome");
  });

  it("resumes from the persisted pointer", () => {
    expect(
      resolveResumeStep(onboardingState({ status: "IN_PROGRESS", currentStep: "accounts", startedAt: NOW })),
    ).toBe("accounts");
  });

  it("never resumes a terminal state", () => {
    expect(
      resolveResumeStep(onboardingState({ status: "COMPLETED", completedAt: NOW })),
    ).toBeNull();
    expect(
      resolveResumeStep(onboardingState({ status: "SKIPPED", skippedAt: NOW })),
    ).toBeNull();
  });

  it("falls back to the first step for ghost pointers and foreign versions", () => {
    expect(
      resolveResumeStep(
        onboardingState({ status: "IN_PROGRESS", currentStep: null, startedAt: NOW }),
      ),
    ).toBe("welcome");
    expect(
      resolveResumeStep(
        onboardingState({ status: "IN_PROGRESS", version: 99, currentStep: "accounts", startedAt: NOW }),
      ),
    ).toBe("welcome");
  });
});

// ── domain input builders ────────────────────────────────────────────────────

describe("onboarding domain input builders", () => {
  it("start enters IN_PROGRESS at the first step and stamps startedAt once", () => {
    const started = onboardingStartInput(undefined, NOW);
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.currentStep).toBe("welcome");
    expect(started.startedAt).toBe(NOW);
    expect(started.completedAt).toBeNull();
    expect(started.skippedAt).toBeNull();
    expect(started.stepsDone).toEqual([]);
    expect(started.version).toBe(ONBOARDING_VERSION);

    const resumed = onboardingStartInput(
      onboardingState({ status: "IN_PROGRESS", currentStep: "tour", startedAt: NOW, stepsDone: ["welcome"] }),
      "2026-10-20T00:00:00.000Z",
    );
    // Re-entering the flow must not wipe prior progress.
    expect(resumed.startedAt).toBe(NOW);
    expect(resumed.stepsDone).toEqual(["welcome"]);
  });

  it("step navigation records each milestone exactly once", () => {
    const first = onboardingStepInput(undefined, "tour", { markDone: true, now: NOW });
    expect(first.stepsDone).toEqual(["tour"]);
    expect(first.currentStep).toBe("tour");

    const repeat = onboardingStepInput(first, "tour", { markDone: true, now: NOW });
    expect(repeat.stepsDone).toEqual(["tour"]);

    const forward = onboardingStepInput(repeat, "preferences", { markDone: false, now: NOW });
    expect(forward.stepsDone).toEqual(["tour"]);
    expect(forward.currentStep).toBe("preferences");
  });

  it("completion nulls the resume pointer and stamps completedAt only", () => {
    const done = onboardingCompleteInput(
      onboardingState({ status: "IN_PROGRESS", currentStep: "ready", startedAt: NOW, stepsDone: ["welcome"] }),
      NOW,
    );
    expect(done.status).toBe("COMPLETED");
    expect(done.currentStep).toBeNull();
    expect(done.completedAt).toBe(NOW);
    expect(done.skippedAt).toBeNull();
    expect(done.stepsDone).toEqual(["welcome"]);
  });

  it("skip NEVER fabricates completion", () => {
    const skipped = onboardingSkipInput(
      onboardingState({ status: "IN_PROGRESS", currentStep: "accounts", startedAt: NOW, stepsDone: ["welcome", "tour"] }),
      NOW,
    );
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.currentStep).toBeNull();
    expect(skipped.skippedAt).toBe(NOW);
    expect(skipped.completedAt).toBeNull();
    // Skipping must not silently mark unvisited steps as done.
    expect(skipped.stepsDone).toEqual(["welcome", "tour"]);
  });

  it("every builder output satisfies the shared superRefine invariants", () => {
    expect(() => onboardingPreferencesSchema.parse(onboardingStartInput(undefined, NOW))).not.toThrow();
    expect(() =>
      onboardingPreferencesSchema.parse(onboardingStepInput(undefined, "ready", { markDone: true, now: NOW })),
    ).not.toThrow();
    expect(() => onboardingPreferencesSchema.parse(onboardingCompleteInput(undefined, NOW))).not.toThrow();
    expect(() => onboardingPreferencesSchema.parse(onboardingSkipInput(undefined, NOW))).not.toThrow();
  });
});

// ── preference overlays ──────────────────────────────────────────────────────

describe("preference overlays for the tour steps", () => {
  it("trading overlay touches ONLY display preferences and preserves siblings", () => {
    const current = structuredClone(DEFAULT_USER_PREFERENCES.trading);
    const merged = tradingDomainWithOverlay(current, {
      displayCurrency: "EUR",
      defaultSession: "NEW_YORK",
    });
    expect(merged.displayCurrency).toBe("EUR");
    expect(merged.defaultSession).toBe("NEW_YORK");
    expect(merged.defaultAssetClass).toBe(current.defaultAssetClass);
    expect(merged.chart).toEqual(current.chart);
    expect(merged.softLockAfterViolations).toBe(current.softLockAfterViolations);
  });

  it("trading overlay falls back to the safe defaults when the doc has no domain yet", () => {
    const merged = tradingDomainWithOverlay(undefined, { displayCurrency: "GBP" });
    expect(merged).toEqual({
      ...DEFAULT_USER_PREFERENCES.trading,
      displayCurrency: "GBP",
    });
  });

  it("trading overlay with no overlay input returns the domain unchanged", () => {
    const current = structuredClone(DEFAULT_USER_PREFERENCES.trading);
    expect(tradingDomainWithOverlay(current, {})).toEqual(current);
  });

  it("appearance overlay changes only defaultDashboardLayout", () => {
    const current = structuredClone(DEFAULT_USER_PREFERENCES.appearance);
    const merged = appearanceDomainWithOverlay(current, "PERFORMANCE_FIRST");
    expect(merged.defaultDashboardLayout).toBe("PERFORMANCE_FIRST");
    expect(merged.theme).toBe(current.theme);
    expect(merged.density).toBe(current.density);
    expect(merged.pnlDisplay).toBe(current.pnlDisplay);
  });
});
