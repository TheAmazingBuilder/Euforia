"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDict } from "@/i18n/i18n-provider";
import {
  runOnbStepExit,
  useOnbStepEntrance,
  usePrefersReducedMotion,
} from "@/lib/onboarding/motion";
import { nextStep, ONBOARDING_STEP_COUNT, previousStep, stepIndex } from "@/lib/onboarding/steps";
import type { OnboardingStepId } from "@/lib/onboarding/steps";
import { useOnboardingController } from "@/lib/onboarding/use-onboarding";

import { OnboardingProgress } from "./onboarding-progress";
import { OnboardingStatusError } from "./onboarding-status-error";
import { AccountsStep } from "./steps/accounts-step";
import { PersonalizeStep } from "./steps/personalize-step";
import { PreferencesStep } from "./steps/preferences-step";
import { ReadyStep } from "./steps/ready-step";
import { TourStep } from "./steps/tour-step";
import { WelcomeStep } from "./steps/welcome-step";

/**
 * FirstRunOnboarding — the blocking, full-screen first-run experience.
 *
 * Integration point: mounted ONCE inside the authenticated shell (AuthGate
 * children), so it can only ever appear after the identity is resolved and
 * the preferences document (authoritative onboarding state) is loaded.
 *
 * Behavior contract:
 *  - renders ONLY while eligibility === "eligible" (state machine in
 *    lib/onboarding/state.ts — never on fetch errors, never for completed
 *    or skipped users, never for users predating the feature);
 *  - Radix modal semantics: focus trapped, outside pointer interactions
 *    blocked, focus restored on close;
 *  - ESC / the close control PAUSE the flow (state stays IN_PROGRESS at the
 *    persisted resume pointer; a toast confirms; the tour reopens on the
 *    next session) — pausing never fabricates completion;
 *  - step transitions are deterministic: one exit tween with a hard
 *    fallback timer, then the step commits and progress persists;
 *  - reduced motion: entrances/exits collapse to instant state changes.
 */
export function FirstRunOnboarding() {
  const controller = useOnboardingController();
  const dict = useDict().onboarding;
  const router = useRouter();
  const reduce = usePrefersReducedMotion();

  const [leaving, setLeaving] = React.useState(false);
  const [pausedThisSession, setPausedThisSession] = React.useState(false);

  const contentRef = React.useRef<HTMLDivElement>(null);

  // Derived, never stored: the overlay is open exactly while the user is
  // eligible AND has not paused during this session — it cannot flicker for
  // existing users while state loads, and cannot re-open after a pause.
  const open = controller.status === "eligible" && !pausedThisSession;

  // One initialization per eligibility episode — the persisted resume
  // pointer seeds the local step EXACTLY once; subsequent navigation is
  // purely local (a failed progress write must not yank the user back).
  // React-documented "adjust state during render" pattern — NOT an effect.
  const [episode, setEpisode] = React.useState<{ active: boolean; step: OnboardingStepId }>({
    active: false,
    step: "welcome",
  });
  if (open && !episode.active) {
    setEpisode({ active: true, step: controller.resumeStep ?? "welcome" });
  } else if (!open && episode.active) {
    setEpisode((previous) => ({ ...previous, active: false }));
  }
  const step = episode.step;

  // Scoped, cleanup-safe entrance animation — re-runs per step change.
  useOnbStepEntrance(contentRef, step, reduce);

  // Per-step focus: the step heading takes focus after each transition so
  // keyboard and screen-reader users land on the new content.
  React.useEffect(() => {
    if (!open || leaving) return;
    const raf = requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>("[data-onb-focus]")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [step, open, leaving]);

  const pause = React.useCallback(() => {
    if (!open) return;
    setPausedThisSession(true);
    toast(dict.progress.resumeToast, { duration: 5000 });
  }, [dict.progress.resumeToast, open]);

  /** Deterministic step commit: exit tween → state → progress persist. */
  const commitStep = React.useCallback(
    (target: OnboardingStepId, markDone: boolean) => {
      if (leaving) return;
      setLeaving(true);
      runOnbStepExit(contentRef.current, reduce, () => {
        setEpisode((previous) => ({ ...previous, step: target }));
        setLeaving(false);
        // Progress write is best-effort: the resume pointer persists on
        // success; a failure never blocks the flow and never fakes state
        // (completion/skip/pref saves carry their own visible errors).
        void controller.goToStep(target, { markDone });
      });
    },
    [controller, leaving, reduce],
  );

  const handleAdvance = React.useCallback(() => {
    const target = nextStep(step);
    if (target) commitStep(target, true);
  }, [commitStep, step]);

  const handleBack = React.useCallback(() => {
    const target = previousStep(step);
    if (target) commitStep(target, false);
  }, [commitStep, step]);

  const handleCompleteNavigate = React.useCallback(
    (href: string) => {
      // Completion was confirmed by the backend BEFORE this call; the status
      // flip closes the overlay — navigation hands off to the real shell.
      setPausedThisSession(true);
      router.push(href);
    },
    [router],
  );

  if (controller.status === "error") {
    return <OnboardingStatusError dict={dict.errorNotice} onRetry={controller.retry} />;
  }

  if (!open) return null;

  const stepNumber = stepIndex(step) + 1;
  const liveAnnouncement = dict.progress.live
    .replace("{current}", String(stepNumber))
    .replace("{total}", String(ONBOARDING_STEP_COUNT))
    .replace("{title}", dict.steps[step]);

  const stepProps = {
    controller,
    dict,
    onAdvance: handleAdvance,
    onBack: handleBack,
    onCompleteNavigate: handleCompleteNavigate,
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Every dismiss path (ESC, outside click) is a PAUSE — progress is
        // already persisted at each step change.
        if (!next) pause();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          pause();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          pause();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        data-testid="onb-overlay"
        aria-describedby={undefined}
        className="top-0 left-0 z-50 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 text-foreground ring-0 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 sm:max-w-none"
      >
        {/* Radix a11y contract — the visible step headings are below. */}
        <DialogTitle className="sr-only">Euforia setup</DialogTitle>
        <DialogDescription className="sr-only">{dict.welcome.body}</DialogDescription>

        <div className="flex h-dvh flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
            <OnboardingProgress
              current={stepNumber}
              total={ONBOARDING_STEP_COUNT}
              label={dict.progress.label
                .replace("{current}", String(stepNumber))
                .replace("{total}", String(ONBOARDING_STEP_COUNT))}
              reduce={reduce}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 text-muted-foreground"
              onClick={pause}
              aria-label={dict.progress.resumeLater}
              data-testid="onb-close"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </header>

          {/* Polite step announcements (the ONLY place meaning is conveyed
              textually — never by animation alone). */}
          <p aria-live="polite" className="sr-only">
            {liveAnnouncement}
          </p>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
            <div key={step} className="min-h-full">
              {step === "welcome" ? <WelcomeStep {...stepProps} /> : null}
              {step === "tour" ? <TourStep {...stepProps} /> : null}
              {step === "preferences" ? <PreferencesStep {...stepProps} /> : null}
              {step === "accounts" ? <AccountsStep {...stepProps} /> : null}
              {step === "personalize" ? <PersonalizeStep {...stepProps} /> : null}
              {step === "ready" ? <ReadyStep {...stepProps} /> : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
