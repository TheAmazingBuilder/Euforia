"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Cosmoz brand mark — the original launch logo: a bold white triangle rising
 * from a deep-space black disc. Theme-invariant brand artwork (like the
 * favicon): it keeps its own colors on purpose so the mark stays legible
 * across all three app themes. A hairline ring keeps the disc crisp on the
 * dark app surfaces.
 */
export function CosmozLogo({ className }: { className?: string }) {
  const uid = useId();
  const ringId = `cz-ring-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="Cosmoz"
      className={cn("shrink-0", className)}
    >
      <defs>
        <clipPath id={ringId}>
          <circle cx="256" cy="256" r="256" />
        </clipPath>
      </defs>

      {/* Deep-space disc (brand background, theme-invariant) */}
      <circle cx="256" cy="256" r="256" fill="#000000" />
      <circle
        cx="256"
        cy="256"
        r="255"
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="2"
      />

      {/* The Cosmoz triangle */}
      <g clipPath={`url(#${ringId})`}>
        <path d="M256 132 L392 372 L120 372 Z" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
