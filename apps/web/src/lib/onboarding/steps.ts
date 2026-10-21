import { onboardingStepIdSchema, type OnboardingStepId } from "@cosmoz/shared";

export type { OnboardingStepId };

/**
 * Onboarding step sequence (single source of order truth).
 *
 * The ids mirror the shared `onboardingStepIdSchema`; the ORDER lives here
 * because the wire contract stores only a resume pointer, not the sequence.
 * A future onboarding revision may reorder or add steps — it must bump
 * ONBOARDING_VERSION and document the resume policy (see the report §resume).
 */
export const ONBOARDING_STEP_ORDER = [
  "welcome",
  "tour",
  "preferences",
  "accounts",
  "personalize",
  "ready",
] as const satisfies readonly OnboardingStepId[];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEP_ORDER.length;

export function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return onboardingStepIdSchema.safeParse(value).success;
}

/** Defensive step resolution — a stored pointer that no longer exists (a
 * future revision removed/renamed a step) falls back to the FIRST step of
 * the current sequence instead of trapping the user on a ghost step. */
export function normalizeStepId(value: unknown): OnboardingStepId {
  return isOnboardingStepId(value) ? value : "welcome";
}

export function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

/** Next step in sequence, or null when the step is the last one. */
export function nextStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(step);
  if (index < 0 || index >= ONBOARDING_STEP_ORDER.length - 1) return null;
  return ONBOARDING_STEP_ORDER[index + 1] as OnboardingStepId;
}

/** Previous step in sequence, or null when the step is the first one. */
export function previousStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(step);
  if (index <= 0) return null;
  return ONBOARDING_STEP_ORDER[index - 1] as OnboardingStepId;
}
