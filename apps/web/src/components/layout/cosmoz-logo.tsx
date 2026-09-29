"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Cosmoz brand mark — the equity-curve logo: a white performance curve drawn
 * as connected stars rising across an indigo gradient tile, the last star
 * ringed in cobalt accent. Theme-invariant brand artwork (like the favicon):
 * it keeps its own colors on purpose so the mark stays legible across all
 * three app themes.
 */
export function CosmozLogo({ className }: { className?: string }) {
  const uid = useId();
  const gradId = `cz-grad-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="Cosmoz"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0" stopColor="#6E7BFF" />
          <stop offset="1" stopColor="#4050E0" />
        </linearGradient>
      </defs>

      {/* Deep-space tile (brand background, theme-invariant) */}
      <rect width="512" height="512" rx="112" fill="#0D1424" />
      <rect
        width="512"
        height="512"
        rx="112"
        fill={`url(#${gradId})`}
        opacity="0.9"
      />

      {/* Equity curve as connected stars */}
      <polyline
        points="104,352 208,240 288,288 408,160"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <circle cx="104" cy="352" r="30" fill="#FFFFFF" />
      <circle cx="208" cy="240" r="24" fill="#FFFFFF" />
      <circle cx="288" cy="288" r="24" fill="#FFFFFF" />
      <circle cx="408" cy="160" r="34" fill="#FFFFFF" />
      <circle cx="408" cy="160" r="16" fill="#6E7BFF" />
    </svg>
  );
}
