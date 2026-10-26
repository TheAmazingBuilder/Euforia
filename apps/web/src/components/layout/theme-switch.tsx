"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Droplet, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * ThemeSwitch - Prisma-docs-inspired segmented theme control.
 *
 * A single pill with three segments (Dark blue / Dark / Light). The active
 * segment sits on a rounded "thumb" that slides smoothly to the clicked
 * position (transform + transition), exactly like the docs-site switcher.
 * Icons only on >=md viewports, labels always accessible via aria/title.
 */

const SEGMENTS = [
  { value: "dark-blue", label: "Dark blue", Icon: Droplet },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
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
        "relative inline-flex items-center rounded-full border bg-muted/60 p-0.5 backdrop-blur-sm",
        className,
      )}
    >
      {/* Sliding thumb */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full",
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
              "relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
              "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <segment.Icon className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{segment.label}</span>
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
