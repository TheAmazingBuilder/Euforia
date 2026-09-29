"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Cosmoz brand mark — the "constellation" logo: five stars joined around a
 * bright core, wrapped by two orbit rings, set inside a deep-space tile.
 * Theme-invariant brand artwork (like the favicon): it keeps its own colors
 * on purpose so the mark stays legible across all three app themes.
 */
export function CosmozLogo({ className }: { className?: string }) {
  const uid = useId();
  const gradId = `cz-grad-${uid}`;
  const glowId = `cz-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Cosmoz"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#8B96FF" />
          <stop offset="100%" stopColor="#4F5BEE" />
        </linearGradient>
        <filter
          id={glowId}
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
        >
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Deep-space tile (brand background, theme-invariant) */}
      <rect width="100" height="100" rx="22" fill="#0D1424" />

      {/* Constellation orbit rings */}
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke="#243352"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <circle
        cx="50"
        cy="50"
        r="24"
        fill="none"
        stroke="#6E7BFF"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />

      {/* Star pentagon */}
      <path
        d="M50 14 L78 38 L68 76 L32 76 L22 38 Z"
        fill={`url(#${gradId})`}
        fillOpacity="0.06"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Spokes from the core to each star */}
      <g stroke="#8B96FF" strokeWidth="1.5">
        <line x1="50" y1="50" x2="50" y2="14" />
        <line x1="50" y1="50" x2="78" y2="38" />
        <line x1="50" y1="50" x2="68" y2="76" />
        <line x1="50" y1="50" x2="32" y2="76" />
        <line x1="50" y1="50" x2="22" y2="38" />
      </g>

      {/* Nodes / stars */}
      <circle cx="50" cy="14" r="4.5" fill="#FFFFFF" filter={`url(#${glowId})`} />
      <circle cx="78" cy="38" r="3.5" fill="#6E7BFF" />
      <circle cx="68" cy="76" r="4" fill="#34D399" />
      <circle cx="32" cy="76" r="3.5" fill="#6E7BFF" />
      <circle cx="22" cy="38" r="4" fill="#8B96FF" />

      {/* Core star */}
      <circle
        cx="50"
        cy="50"
        r="6"
        fill={`url(#${gradId})`}
        filter={`url(#${glowId})`}
      />
      <circle cx="50" cy="50" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}
