"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sparkles, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * ThemeSwitch - Prisma-docs-inspired segmented theme control.
 *
 * Compact icon-only theme control. Accessible names remain available to
 * assistive technology and tooltips without consuming horizontal space.
 */

const SEGMENTS = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "euforia", label: "Euforia", Icon: Sparkles },
] as const;

type SegmentValue = (typeof SEGMENTS)[number]["value"];

const emptySubscribe = () => () => {};

export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Hydration guard: SSR has no knowledge of the stored theme.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const index = Math.max(
    0,
    SEGMENTS.findIndex((segment) => segment.value === theme),
  );
  const activeLabel = SEGMENTS[index]?.label ?? SEGMENTS[0].label;

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      data-testid="theme-toggle"
      className={cn(
        "relative inline-flex h-9 w-[152px] shrink-0 items-center rounded-full border bg-muted/60 p-0.5 backdrop-blur-sm",
        className,
      )}
    >
      {/* Sliding thumb */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/4)] rounded-full",
          "bg-background shadow-sm ring-1 ring-border/60",
          "transition-transform duration-300 ease-out",
        )}
        style={{
          transform: `translateX(${mounted ? index * 100 : 0}%)`,
        }}
      />
      {SEGMENTS.map((segment, segmentIndex) => {
        const isActive = mounted && segmentIndex === index;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={segment.label}
            aria-label={`Switch to ${segment.label.toLowerCase()} theme`}
            onClick={() => setTheme(segment.value as SegmentValue)}
            className={cn(
              "relative z-10 flex h-7 min-w-0 flex-1 items-center justify-center rounded-full p-0 text-xs font-medium",
              "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <segment.Icon className="size-3.5 shrink-0" />
          </button>
        );
      })}
      {/* Screen-reader status */}
      <span className="sr-only" aria-live="polite">
        {mounted ? `Theme: ${activeLabel}` : ""}
      </span>
    </div>
  );
}
