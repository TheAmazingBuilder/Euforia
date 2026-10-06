"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * EuforiaLogo — the official brand mark (docs/brand-guide.md).
 *
 * The approved symbol is a stylized "E" made of three flowing ribbon bands.
 * The geometry below is the kit's artwork verbatim (euforia-mark.svg /
 * favicon.svg / euforia-mark-white|black.svg) — never re-proportion it,
 * never add candlesticks, dollar symbols or other gradients (forbidden
 * treatments §9).
 *
 * Variants:
 *  - "mark" — the squircle app icon: deep-navy tile + gradient ribbons
 *    (favicon construction). Use in compact navigation, loading states,
 *    avatars/watermarks.
 *  - "full" — mark + "Euforia" wordmark (+ optional tagline). Minimum
 *    120px wide per the guide; never use the tagline below that.
 *
 * Tones (surface the logo sits on):
 *  - "dark"  → navy tile + gradient mark, light wordmark (primary, dark UI)
 *  - "light" → navy tile + gradient mark, navy wordmark (light UI)
 *  - "white" → monochrome white ribbons, no tile
 *  - "black" → monochrome navy-black ribbons, no tile
 *  - "auto"  → navy tile + gradient mark (theme-invariant, like the
 *    favicon), wordmark inherits the app's foreground token — use for
 *    in-app lockups that must follow the active theme.
 *
 * Theme-invariant on purpose (like the favicon): the mark keeps its own
 * colors across the three app themes.
 */

type EuforiaLogoVariant = "mark" | "full";
type EuforiaLogoTone = "dark" | "light" | "white" | "black" | "auto";
type EuforiaLogoSize = "sm" | "md" | "lg";

const MARK_PX: Record<EuforiaLogoSize, number> = {
  sm: 24, // guide minimum for the mark
  md: 32,
  lg: 48,
};

const WORDMARK_CLASS: Record<EuforiaLogoSize, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

/** Ribbon artwork — verbatim from the kit's euforia-mark.svg (viewBox 216×224). */
const RIBBONS = [
  "M31 75 C22 57 31 38 51 31 L184 0 L172 37 L65 66 C54 69 49 76 52 84 C55 93 64 96 75 92 L169 64 L157 101 L66 128 C46 134 30 122 28 104 C27 94 28 84 31 75 Z",
  "M31 126 C22 108 31 89 51 82 L151 53 L139 90 L66 113 C55 116 49 123 52 131 C55 140 64 143 75 139 L136 121 L124 157 L66 174 C46 180 30 168 28 150 C27 140 28 134 31 126 Z",
  "M31 177 C22 159 31 140 51 133 L116 114 L104 151 L66 162 C55 165 49 172 52 180 C55 189 64 192 75 188 L101 181 L89 216 L66 223 C46 229 30 217 28 199 C27 189 28 185 31 177 Z",
] as const;

const WORDMARK_FILL: Record<EuforiaLogoTone, string | undefined> = {
  dark: "#F8FAFC", // euforia-logo-dark.svg
  light: "#020617", // euforia-logo-light.svg
  white: "#FFFFFF", // euforia-logo-white.svg
  black: "#020617", // euforia-logo-black.svg
  auto: undefined, // inherit the theme's foreground token
};

const MONO_FILL: Record<"white" | "black", string> = {
  white: "#FFFFFF",
  black: "#020617",
};

export function EuforiaLogo({
  variant = "mark",
  tone = "dark",
  size = "md",
  withTagline = false,
  className,
}: {
  variant?: EuforiaLogoVariant;
  tone?: EuforiaLogoTone;
  size?: EuforiaLogoSize;
  /** Tagline under the wordmark (full variant only). Forbidden below 120px lockups. */
  withTagline?: boolean;
  className?: string;
}) {
  const uid = useId();
  const gradientId = `eu-grad-${uid}`;
  const px = MARK_PX[size];
  const mono = tone === "white" || tone === "black";
  const fill = mono ? MONO_FILL[tone] : `url(#${gradientId})`;

  // Gradient tones use the favicon construction (navy squircle tile);
  // monochrome tones use the bare 216×224 artwork.
  const mark = mono ? (
    <svg
      viewBox="0 0 216 224"
      width={px}
      height={(px * 224) / 216}
      role={variant === "full" ? undefined : "img"}
      aria-label={variant === "full" ? undefined : "Euforia"}
      aria-hidden={variant === "full" ? true : undefined}
      className={cn("shrink-0", variant === "mark" && className)}
      style={variant === "full" ? { height: px, width: "auto" } : undefined}
    >
      {RIBBONS.map((d) => (
        <path key={d.slice(0, 24)} d={d} fill={fill} />
      ))}
    </svg>
  ) : (
    <svg
      viewBox="0 0 256 256"
      width={px}
      height={px}
      role={variant === "full" ? undefined : "img"}
      aria-label={variant === "full" ? undefined : "Euforia"}
      aria-hidden={variant === "full" ? true : undefined}
      className={cn("shrink-0", variant === "mark" && className)}
      style={variant === "full" ? { height: px, width: "auto" } : undefined}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="20"
          y1="20"
          x2="230"
          y2="230"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="46%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="#020617" />
      <g transform="translate(27 17) scale(.93)">
        {RIBBONS.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill={fill} />
        ))}
      </g>
    </svg>
  );

  if (variant === "mark") {
    return mark;
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark}
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-tight",
            tone === "auto" && "text-foreground",
            WORDMARK_CLASS[size],
          )}
          style={{
            fontFamily: "var(--font-inter)",
            color: WORDMARK_FILL[tone],
          }}
        >
          Euforia
        </span>
        {withTagline && (
          <span className="euforia-gradient-text mt-1 text-[0.625rem] font-bold uppercase tracking-[0.2em]">
            Trade smarter. Grow faster.
          </span>
        )}
      </span>
    </span>
  );
}
