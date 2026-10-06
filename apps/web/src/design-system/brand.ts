/**
 * Euforia brand tokens — single source for programmatic brand styling.
 *
 * Mirrors docs/brand-guide.md (Euforia Brand Kit): core colors, surfaces,
 * text and semantic inks plus the two official gradients. UI rules live in
 * the guide — tokens here are values only, they do not restyle anything by
 * themselves. Prefer the CSS variables in design-system/euforia.css inside
 * stylesheets; import these constants when JS needs the raw values
 * (canvas, charts, SVG generation).
 */

export const brand = {
  name: "Euforia",
  tagline: "Trade smarter. Grow faster.",

  colors: {
    violet: "#8B5CF6",
    indigo: "#6366F1",
    cyan: "#22D3EE",

    deepNavy: "#020617",
    darkSurface: "#0B1020",
    card: "#111827",
    border: "#1E293B",

    primary: "#F8FAFC",
    muted: "#94A3B8",

    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
  },

  gradients: {
    /** Mark gradient — sampled from the founder's reference artwork (axis:
     *  left → upper-right, ~93deg). Used by the traced mark SVGs. */
    primary:
      "linear-gradient(93deg, #7B22F4 0%, #6318E8 28%, #4299FD 62%, #28D6F6 100%)",
    /** Text gradient (90°) — light violet → cyan (reference tagline). */
    text: "linear-gradient(90deg, #A78BFA 0%, #22D3EE 100%)",
  },
} as const;

export type BrandColor = keyof typeof brand.colors;
