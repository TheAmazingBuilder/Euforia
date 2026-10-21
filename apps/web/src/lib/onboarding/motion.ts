"use client";

import * as React from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Onboarding motion system (GSAP).
 *
 * Principles (spec §5):
 *  - motion is an ENHANCEMENT: every animated element starts at its final
 *    CSS state and is animated FROM it (gsap.from) — if GSAP fails to
 *    initialize or `prefers-reduced-motion` is set, the flow simply renders
 *    static and fully functional; no state depends on animation completing;
 *  - timelines are scoped (useGSAP context) and reverted on unmount or on
 *    dependency change — no leaked tweens across steps, StrictMode-safe;
 *  - durations stay short (≤ 0.55s) and easings restrained (power/back) —
 *    premium, not theatrical.
 *
 * Element contract (data attributes consumed here):
 *  - data-onb="brand"    — the brand lockup entrance (scale + fade);
 *  - data-onb="reveal"   — staggered content entrance (y + fade);
 *  - data-onb="success"  — the completion check reveal (back.out).
 */

gsap.registerPlugin(useGSAP);

export const ONB_EASE = "power3.out";

/** Reactive prefers-reduced-motion (matchMedia + change listener). */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduce;
}

/**
 * Step entrance — brand + staggered reveal of the CURRENT step's content.
 * Runs once per step change (the overlay keys the step container, so the
 * scoped context re-runs cleanly). Reduced motion: skipped entirely — the
 * content is already in its final state.
 */
export function useOnbStepEntrance(
  scope: React.RefObject<HTMLElement | null>,
  stepKey: string,
  reduce: boolean,
): void {
  useGSAP(
    () => {
      if (reduce) return;
      try {
        const timeline = gsap.timeline({ defaults: { ease: ONB_EASE } });
        const brand = "[data-onb='brand']";
        const reveal = "[data-onb='reveal']";
        if (scope.current?.querySelector(brand)) {
          timeline.from(brand, { autoAlpha: 0, scale: 0.94, duration: 0.55 });
        }
        if (scope.current?.querySelector(reveal)) {
          timeline.from(
            reveal,
            { autoAlpha: 0, y: 14, duration: 0.45, stagger: 0.055 },
            brand && scope.current?.querySelector(brand) ? "-=0.3" : 0,
          );
        }
      } catch {
        // Animation failure must never prevent users from proceeding.
      }
    },
    { scope, dependencies: [stepKey, reduce] },
  );
}

/** The completion check — subtle scale-in (restrained, no confetti). */
export function useOnbSuccessReveal(
  scope: React.RefObject<HTMLElement | null>,
  active: boolean,
  reduce: boolean,
): void {
  useGSAP(
    () => {
      if (!active || reduce) return;
      try {
        gsap.from("[data-onb='success']", {
          autoAlpha: 0,
          scale: 0.6,
          duration: 0.5,
          ease: "back.out(1.6)",
        });
      } catch {
        // Ignore — the check is already visible statically.
      }
    },
    { scope, dependencies: [active, reduce] },
  );
}

/** Progress bar tween — width follows the step progress. */
export function animateOnbProgress(
  bar: HTMLElement | null,
  progress: number,
  reduce: boolean,
): void {
  if (!bar) return;
  try {
    gsap.to(bar, {
      scaleX: Math.max(0, Math.min(1, progress)),
      duration: reduce ? 0 : 0.45,
      ease: "power2.out",
      transformOrigin: "left center",
      overwrite: true,
    });
  } catch {
    // The bar's CSS width already reflects the target via the inline style
    // fallback set by the caller.
  }
}

/**
 * Step exit — quick fade of the outgoing content, then commit. Safety:
 * a one-shot latch + timeout fallback guarantee onDone fires EXACTLY once
 * even if the tween is interrupted (an interrupted animation can never
 * leave the flow stuck).
 */
export function runOnbStepExit(
  scope: HTMLElement | null,
  reduce: boolean,
  onDone: () => void,
): void {
  const doneOnce = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      onDone();
    };
  })();

  if (!scope || reduce) {
    doneOnce();
    return;
  }
  try {
    const targets = scope.querySelectorAll("[data-onb='reveal'], [data-onb='brand']");
    if (targets.length === 0) {
      doneOnce();
      return;
    }
    gsap.to(targets, {
      autoAlpha: 0,
      y: -10,
      duration: 0.18,
      ease: "power2.in",
      stagger: 0.02,
      onComplete: () => doneOnce(),
    });
    // Hard fallback — never depend on animation completion for navigation.
    window.setTimeout(() => doneOnce(), 450);
  } catch {
    doneOnce();
  }
}
