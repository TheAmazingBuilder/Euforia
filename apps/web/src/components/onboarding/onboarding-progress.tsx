"use client";

import * as React from "react";

import { animateOnbProgress } from "@/lib/onboarding/motion";
import { cn } from "@/lib/utils";

/**
 * Onboarding progress chrome - the step counter + the fine progress rule.
 * Visual only (aria-hidden): the accessible announcement lives in the
 * overlay's polite live region, never carried by color/width alone.
 */
export function OnboardingProgress({
  current,
  total,
  label,
  reduce,
}: {
  current: number;
  total: number;
  label: string;
  reduce: boolean;
}) {
  const barRef = React.useRef<HTMLSpanElement>(null);
  const progress = total > 0 ? current / total : 0;

  React.useEffect(() => {
    animateOnbProgress(barRef.current, progress, reduce);
  }, [progress, reduce]);

  return (
    <div className="flex items-center gap-3" data-testid="onb-progress">
      <span className="text-xs font-medium tabular-nums text-muted-foreground">{label}</span>
      <span
        aria-hidden="true"
        className="h-1 w-28 overflow-hidden rounded-full bg-muted sm:w-40"
      >
        <span
          ref={barRef}
          className="block h-full w-full origin-left bg-accent"
          style={{ transform: `scaleX(${progress})` }}
        />
      </span>
    </div>
  );
}

/** Segment dots alternative used on the welcome screen (subtle, decorative). */
export function OnboardingSegments({
  current,
  total,
  className,
}: {
  current: number;
  total: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("flex items-center gap-1.5", className)}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1 w-4 rounded-full transition-colors duration-200",
            index < current ? "bg-accent" : "bg-muted",
          )}
        />
      ))}
    </span>
  );
}
