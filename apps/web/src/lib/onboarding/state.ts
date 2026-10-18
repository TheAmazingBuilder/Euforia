import {
  DEFAULT_USER_PREFERENCES,
  ONBOARDING_VERSION,
  type AppearancePreferences,
  type AppearancePreferencesInput,
  type DashboardLayout,
  type Currency,
  type MarketSession,
  type OnboardingPreferences,
  type OnboardingPreferencesInput,
  type OnboardingStatus,
  type TradingPreferences,
  type TradingPreferencesInput,
} from "@cosmoz/shared";

import { normalizeStepId, ONBOARDING_STEP_ORDER, type OnboardingStepId } from "./steps";

/**
 * Onboarding state machine — PURE logic, unit-tested in isolation
 * (web vitest = node, no DOM). The React hook (use-onboarding.ts) only wires
 * this to TanStack Query; every decision lives here.
 */

export type OnboardingEligibility =
  | /** identity or onboarding state not resolved yet — render nothing */
  "loading"
  /** the first-run experience must NOT run (done, skipped, predates it, or not applicable) */
  | "not_required"
  /** the authenticated user should see the first-run experience */
  | "eligible"
  /** eligibility could not be determined — deliberate recovery, never "assume new user" */
  | "error";

export type AuthStatusLike = "initializing" | "authenticated" | "unauthenticated";

export type OnboardingEligibilityInput = {
  authStatus: AuthStatusLike;
  /** user?.status — only an ACTIVE trader account may run the tour. */
  userStatus?: string;
  /** TanStack Query status for the preferences document. */
  preferencesStatus: "pending" | "error" | "success";
  /** preferences.onboarding — undefined = the doc predates onboarding. */
  onboarding?: OnboardingPreferences;
};

/**
 * Eligibility rules (spec §3): show the tour ONLY when the identity is
 * resolved, the preferences document is loaded, and the persisted state is
 * NOT_STARTED / IN_PROGRESS. Any failure to DETERMINE eligibility resolves
 * to "error" — never to "eligible" (a status fetch failure must not present
 * the tour to an existing user).
 */
export function resolveOnboardingEligibility(input: OnboardingEligibilityInput): OnboardingEligibility {
  if (input.authStatus === "initializing") return "loading";
  if (input.authStatus === "unauthenticated") return "not_required";
  if (input.userStatus !== undefined && input.userStatus !== "ACTIVE") return "not_required";
  if (input.preferencesStatus === "pending") return "loading";
  if (input.preferencesStatus === "error") return "error";

  const onboarding = input.onboarding;
  // Backward-compat contract (shared settings.ts): no onboarding key on the
  // stored document = the user predates the first-run experience. NEVER
  // retro-force the tour on existing users.
  if (onboarding === undefined) return "not_required";
  if (onboarding.status === "COMPLETED" || onboarding.status === "SKIPPED") return "not_required";
  return "eligible";
}

export function isTerminalOnboardingStatus(status: OnboardingStatus): boolean {
  return status === "COMPLETED" || status === "SKIPPED";
}

/**
 * Resume policy (spec §9): resume from the persisted pointer when it is
 * still a live step; fall back to the FIRST step for a null/ghost pointer;
 * a different onboarding version restarts the CURRENT sequence from its
 * first step (an interrupted user never completed the tour, and the current
 * revision is what they should see — this is a documented, explicit policy,
 * not an accident); terminal states never resume.
 */
export function resolveResumeStep(onboarding: OnboardingPreferences | undefined): OnboardingStepId | null {
  if (onboarding === undefined) return null;
  if (isTerminalOnboardingStatus(onboarding.status)) return null;
  if (onboarding.status === "NOT_STARTED") return ONBOARDING_STEP_ORDER[0] as OnboardingStepId;
  if (onboarding.version !== ONBOARDING_VERSION) return ONBOARDING_STEP_ORDER[0] as OnboardingStepId;
  return normalizeStepId(onboarding.currentStep);
}

// ── Domain input builders (whole-domain PATCH semantics) ────────────────────

function baseDomain(current: OnboardingPreferences | undefined): OnboardingPreferencesInput {
  const fallback = DEFAULT_USER_PREFERENCES.onboarding;
  return {
    status: current?.status ?? fallback.status,
    version: current?.version ?? ONBOARDING_VERSION,
    currentStep: current?.currentStep ?? null,
    startedAt: current?.startedAt ?? null,
    completedAt: current?.completedAt ?? null,
    skippedAt: current?.skippedAt ?? null,
    stepsDone: current?.stepsDone ? [...current.stepsDone] : [],
  };
}

/** "Get started" — the tour enters IN_PROGRESS at the first step. Never
 * wipes prior milestones: re-entering an interrupted flow keeps its history
 * (stepsDone is empty anyway on a genuine first start). */
export function onboardingStartInput(
  current: OnboardingPreferences | undefined,
  now: string,
): OnboardingPreferencesInput {
  const previous = baseDomain(current);
  return {
    ...previous,
    status: "IN_PROGRESS",
    version: ONBOARDING_VERSION,
    currentStep: ONBOARDING_STEP_ORDER[0] as OnboardingStepId,
    startedAt: previous.startedAt ?? now,
    completedAt: null,
    skippedAt: null,
    stepsDone: previous.stepsDone,
  };
}

/**
 * Step navigation — persists the resume pointer at every MEANINGFUL step
 * change (never per animation frame). `markDone` records the milestone the
 * user just confirmed; entering a step never marks it done.
 */
export function onboardingStepInput(
  current: OnboardingPreferences | undefined,
  step: OnboardingStepId,
  options: { markDone: boolean; now: string },
): OnboardingPreferencesInput {
  const previous = baseDomain(current);
  const stepsDone = options.markDone && !previous.stepsDone.includes(step)
    ? [...previous.stepsDone, step]
    : previous.stepsDone;
  return {
    ...previous,
    status: "IN_PROGRESS",
    version: ONBOARDING_VERSION,
    currentStep: step,
    startedAt: previous.startedAt ?? options.now,
    completedAt: null,
    skippedAt: null,
    stepsDone,
  };
}

/** Completion — only persisted once the backend CONFIRMS (no optimistic
 * completion): currentStep null, completedAt set, milestones preserved. */
export function onboardingCompleteInput(
  current: OnboardingPreferences | undefined,
  now: string,
): OnboardingPreferencesInput {
  return {
    ...baseDomain(current),
    status: "COMPLETED",
    version: ONBOARDING_VERSION,
    currentStep: null,
    startedAt: current?.startedAt ?? now,
    completedAt: now,
    skippedAt: null,
  };
}

/**
 * Skip policy: skipping the introduction NEVER fabricates completion (no
 * completedAt, no invented milestones) — it only marks SKIPPED so the
 * automatic display is suppressed.
 */
export function onboardingSkipInput(
  current: OnboardingPreferences | undefined,
  now: string,
): OnboardingPreferencesInput {
  return {
    ...baseDomain(current),
    status: "SKIPPED",
    version: ONBOARDING_VERSION,
    currentStep: null,
    startedAt: current?.startedAt ?? now,
    completedAt: null,
    skippedAt: now,
  };
}

// ── Preference overlays for the tour's REAL settings (whole-domain merges) ──

export type TradingPreferencesOverlay = {
  displayCurrency?: Currency;
  defaultSession?: MarketSession;
};

/**
 * Build the WHOLE trading domain for the preferences step: the overlay is
 * applied over the user's CURRENT domain (or the safe defaults when the doc
 * has not been provisioned) so sibling fields never change. Only DISPLAY
 * preferences are touched — a trading account's base currency is a property
 * of the account and is never written here.
 */
export function tradingDomainWithOverlay(
  current: TradingPreferences | undefined,
  overlay: TradingPreferencesOverlay,
): TradingPreferencesInput {
  const base = structuredClone(current ?? DEFAULT_USER_PREFERENCES.trading);
  return {
    ...base,
    ...(overlay.displayCurrency !== undefined ? { displayCurrency: overlay.displayCurrency } : {}),
    ...(overlay.defaultSession !== undefined ? { defaultSession: overlay.defaultSession } : {}),
  };
}

/**
 * Build the WHOLE appearance domain for the personalization step: only
 * defaultDashboardLayout changes, theme/density/pnlDisplay carry over.
 */
export function appearanceDomainWithOverlay(
  current: AppearancePreferences | undefined,
  layout: DashboardLayout,
): AppearancePreferencesInput {
  const base = structuredClone(current ?? DEFAULT_USER_PREFERENCES.appearance);
  return { ...base, defaultDashboardLayout: layout };
}
