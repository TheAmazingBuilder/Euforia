"use client";

import { cn } from "@/lib/utils";

/**
 * EuforiaLogo — the official brand mark, vectorized verbatim from the
 * founder's reference artwork (three-ribbon "E", violet→cyan gradient).
 *
 * The geometry lives in the /brand SVGs (public/brand/euforia-*.svg) —
 * traced from the reference image, NOT re-drawn: the mark must stay
 * pixel-identical to it. Never re-proportion, never add candlesticks,
 * dollar symbols or other gradients (forbidden treatments §9).
 *
 * Variants:
 *  - "mark" — the squircle app icon: deep-navy tile + gradient ribbons
 *    (euforia-icon.svg). Use in compact navigation, loading states,
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
 *    favicon), wordmark inherits the app's foreground token - use for
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

/** Mark artwork per tone — traced reference geometry, served from /brand. */
const MARK_SRC: Record<EuforiaLogoTone, string> = {
  dark: "/brand/euforia-icon.svg",
  light: "/brand/euforia-icon.svg",
  auto: "/brand/euforia-icon.svg",
  white: "/brand/euforia-mark-white.svg",
  black: "/brand/euforia-mark-black.svg",
};

const WORDMARK_FILL: Record<EuforiaLogoTone, string | undefined> = {
  dark: "#F8FAFC", // euforia-logo-dark.svg
  light: "#020617", // euforia-logo-light.svg
  white: "#FFFFFF", // euforia-logo-white.svg
  black: "#020617", // euforia-logo-black.svg
  auto: undefined, // inherit the theme's foreground token
};

/** Bare mark aspect ratio (750×918 traced artwork). */
const MARK_ASPECT = 750 / 918;

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
  const px = MARK_PX[size];
  const bare = tone === "white" || tone === "black";
  // width/height are ATTRIBUTES so Tailwind size-* classes (watermark 560px,
  // collapsed sidebar size-7) override them; they only act as the default.
  const wAttr = bare ? Math.round(px * MARK_ASPECT) : px;

  const mark = (
    <img
      src={MARK_SRC[tone]}
      alt="Euforia"
      role={variant === "full" ? undefined : "img"}
      aria-hidden={variant === "full" ? true : undefined}
      draggable={false}
      width={wAttr}
      height={px}
      className={cn("shrink-0 select-none", variant === "mark" && className)}
    />
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
