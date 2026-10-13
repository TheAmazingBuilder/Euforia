"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type CosmozMarkProps = {
  className?: string;
  /** Accessible name; the mark stays decorative when omitted. */
  title?: string;
};

/**
 * Cosmoz brand mark — the app logo, pixel-for-pixel the same artwork as the
 * browser favicon (app/icon.svg, scaled 32 → 24): a cobalt tile holding the
 * constellation — three faint stars, a rising equity line joined by four
 * record nodes, crowned by an emerald sparkle: the trade you got right.
 * Brand SVG exception — the gradient and sparkle inks are the only hard-coded
 * colors the design system allows, and only here. Gradient ids are namespaced
 * with useId so two marks can coexist on a page.
 */
export function CosmozMark({ className, title }: CosmozMarkProps) {
  const uid = React.useId();
  const tileId = `cosmoz-tile-${uid}`;
  const nodeId = `cosmoz-node-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("size-6", className)}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={tileId}
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2E6BF6" />
          <stop offset="0.55" stopColor="#1B3FB8" />
          <stop offset="1" stopColor="#0A1745" />
        </linearGradient>
        <linearGradient id={nodeId} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {/* The record's tile */}
      <rect width="24" height="24" rx="5.6" fill={`url(#${tileId})`} />

      {/* Faint far stars */}
      <circle cx="5.6" cy="6" r="0.53" fill="#FFFFFF" opacity="0.35" />
      <circle cx="19.9" cy="15" r="0.45" fill="#FFFFFF" opacity="0.28" />
      <circle cx="13.5" cy="19.5" r="0.53" fill="#FFFFFF" opacity="0.3" />

      {/* Rising equity line — honest about the dip */}
      <polyline
        points="5.6,16.9 9.75,11.6 14.6,14.25 18.4,7.9"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Record nodes on the line */}
      <circle cx="5.6" cy="16.9" r="1.28" fill={`url(#${nodeId})`} />
      <circle cx="9.75" cy="11.6" r="1.05" fill={`url(#${nodeId})`} opacity="0.9" />
      <circle cx="14.6" cy="14.25" r="1.05" fill={`url(#${nodeId})`} opacity="0.9" />
      <circle cx="18.4" cy="7.9" r="1.5" fill={`url(#${nodeId})`} />

      {/* Emerald sparkle — the insight above the last node */}
      <path
        d="M19.05 2.7c.135 1.125.54 1.53 1.665 1.665-1.125.135-1.53.54-1.665 1.665-.135-1.125-.54-1.53-1.665-1.665 1.125-.135 1.53-.54 1.665-1.665Z"
        fill="#34D399"
      />
    </svg>
  );
}
