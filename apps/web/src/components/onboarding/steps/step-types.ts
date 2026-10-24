import type { Dictionary } from "@/i18n/dictionaries/en";
import type { OnboardingController } from "@/lib/onboarding/use-onboarding";

/**
 * Contract shared by every onboarding step component. Steps are
 * presentational: they own their local form state and their writes, and
 * delegate navigation + exit animation to the overlay (single owner of the
 * step machine - no duplicated navigation logic per step).
 */
export type OnboardingStepProps = {
  controller: OnboardingController;
  dict: Dictionary["onboarding"];
  /** Advance to the next step (markDone = the current step was confirmed). */
  onAdvance: () => void;
  /** Go back one step (milestones unchanged). */
  onBack: () => void;
  /**
   * Complete the flow and hand off to an app route (accounts step) - the
   * overlay closes AFTER the backend confirms completion; a failed
   * completion must NOT navigate.
   */
  onCompleteNavigate: (href: string) => void;
};
