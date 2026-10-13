"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Cosmoz brand mark — the "orbital comet": a glowing planet core wrapped by a
 * sweeping orbit arc that ends in a bright comet head, set inside a deep-space
 * squircle with an aurora wash. Theme-invariant brand artwork (like the
 * favicon): it keeps its own colors on purpose so the mark stays legible
 * across all three app themes.
 */
export function CosmozLogo({ className }: { className?: string }) {
  const uid = useId();
  const tileId = `cz-tile-${uid}`;
  const auroraId = `cz-aurora-${uid}`;
  const arcId = `cz-arc-${uid}`;
  const coreId = `cz-core-${uid}`;
  const haloId = `cz-halo-${uid}`;
  const glowId = `cz-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Cosmoz"
      className={cn("shrink-0", className)}
    >
      <defs>
        {/* Deep-space tile — subtle vertical depth, richer than flat black */}
        <linearGradient id={tileId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141F3E" />
          <stop offset="100%" stopColor="#0A1122" />
        </linearGradient>
        {/* Aurora wash behind the mark */}
        <radialGradient id={auroraId} cx="50%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#5A67F2" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#5A67F2" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#5A67F2" stopOpacity="0" />
        </radialGradient>
        {/* Orbit arc — cyan → brand violet → bright lavender at the head */}
        <linearGradient id={arcId} x1="15%" y1="85%" x2="85%" y2="10%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="45%" stopColor="#6E7BFF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>
        {/* Planet core — lit from the top-left */}
        <radialGradient id={coreId} cx="35%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#B7C2FF" />
          <stop offset="45%" stopColor="#6E7BFF" />
          <stop offset="100%" stopColor="#4049CE" />
        </radialGradient>
        {/* Comet head halo */}
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#C7D2FE" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#C7D2FE" stopOpacity="0" />
        </radialGradient>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Deep-space tile (brand background, theme-invariant) */}
      <rect width="100" height="100" rx="23" fill={`url(#${tileId})`} />
      <rect
        x="0.75"
        y="0.75"
        width="98.5"
        height="98.5"
        rx="22.25"
        fill="none"
        stroke="#3A4A78"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      <rect width="100" height="100" rx="23" fill={`url(#${auroraId})`} />

      {/* Depth ring + orbit arc with comet head */}
      <circle
        cx="50"
        cy="52"
        r="33"
        fill="none"
        stroke="#6E7BFF"
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <path
        d="M 74.43 43.11 A 26 26 0 1 1 58.89 27.57"
        fill="none"
        stroke={`url(#${arcId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
      />

      {/* Planet core */}
      <circle
        cx="50"
        cy="52"
        r="10.5"
        fill={`url(#${coreId})`}
        filter={`url(#${glowId})`}
      />
      <ellipse cx="46.6" cy="48" rx="4.4" ry="2.9" fill="#FFFFFF" opacity="0.3" />

      {/* Comet head — halo + bright core */}
      <circle cx="58.89" cy="27.57" r="9" fill={`url(#${haloId})`} />
      <circle
        cx="58.89"
        cy="27.57"
        r="4.4"
        fill="#FFFFFF"
        filter={`url(#${glowId})`}
      />

      {/* Starfield accents */}
      <circle cx="26" cy="64" r="1.6" fill="#8B96FF" opacity="0.75" />
      <circle cx="71" cy="63" r="1.3" fill="#E6EBF5" opacity="0.6" />
      <path
        d="M27 24.8 v6.4 M23.8 28 h6.4"
        stroke="#C7D2FE"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
