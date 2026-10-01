"use client";

import * as React from "react";
import {
  Activity,
  Brain,
  CandlestickChart,
  ChartColumn,
  Coins,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  ShieldAlert,
  Swords,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import type { AcademyLevel } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Shared Academy primitives — category icon registry, category identity hues,
 * level badge, ruled progress bar, ring gauge and hue chips. Icon names arrive
 * from the API as strings; this registry is the single client-side mapping.
 */

// ── Category identity hues (tokens declared in globals.css) ──────────────────

/** categoryId → CSS var of the track's identity hue. */
export const CATEGORY_HUES: Record<string, string> = {
  "cat-fundamentals": "var(--cat-fund)",
  "cat-risk": "var(--cat-risk)",
  "cat-technical": "var(--cat-ta)",
  "cat-price-action": "var(--cat-pa)",
  "cat-candles": "var(--cat-candles)",
  "cat-chart-patterns": "var(--cat-patterns)",
  "cat-indicators": "var(--cat-indicators)",
  "cat-strategies": "var(--cat-strategies)",
  "cat-trade-management": "var(--cat-mgmt)",
  "cat-psychology": "var(--cat-psy)",
  "cat-structure": "var(--cat-structure)",
  "cat-advanced": "var(--cat-advanced)",
};

export function hueOf(categoryId: string | null | undefined): string {
  return (categoryId && CATEGORY_HUES[categoryId]) || "var(--accent)";
}

/** Alpha tint of a hue — color-mix keeps everything token-driven. */
export function tint(hue: string, percent: number): string {
  return `color-mix(in srgb, ${hue} ${percent}%, transparent)`;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Coins,
  ShieldAlert,
  TrendingUp,
  Activity,
  CandlestickChart,
  ChartColumn,
  Gauge,
  Swords,
  Layers,
  Brain,
  GitBranch,
  FlaskConical,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = CATEGORY_ICONS[icon] ?? FlaskConical;
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

const LEVEL_LABELS: Record<AcademyLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export function LevelBadge({ level, className }: { level: AcademyLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        level === "BEGINNER" && "border-profit/40 text-profit",
        level === "INTERMEDIATE" && "border-warning/40 text-warning",
        level === "ADVANCED" && "border-loss/40 text-loss",
        className,
      )}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

/** Ruled progress bar — hairline track, ink fill (or category hue), mono percentage outside. */
export function ProgressBar({
  percent,
  className,
  testid,
  label,
  hue,
}: {
  percent: number;
  className?: string;
  testid?: string;
  label?: string;
  /** CSS var — fills the bar with a category identity hue instead of the accent. */
  hue?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${clamped}%`, background: hue ?? "var(--accent)" }}
          data-testid={testid}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{clamped}%</span>
    </div>
  );
}

/** Ring gauge — single arc on a hairline track, rounded caps, token color.
 *  The arc draws itself the first time it scrolls into view (IntersectionObserver,
 *  once); honors prefers-reduced-motion by rendering the final state instantly. */
export function ProgressRing({
  percent,
  size = 64,
  strokeWidth = 6,
  hue,
  children,
  className,
  testid,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  hue?: string;
  children?: React.ReactNode;
  className?: string;
  testid?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const { ref, inView } = useInViewOnce<HTMLSpanElement>();
  const reducedMotion = usePrefersReducedMotion();
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const filled = (clamped / 100) * c;
  const drawn = inView || reducedMotion;
  return (
    <span
      ref={ref}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid={testid}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--surface-raised)", strokeWidth }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            stroke: hue ?? "var(--accent)",
            strokeWidth,
            strokeLinecap: "round",
            strokeDasharray: drawn ? `${filled} ${c - filled}` : `0.01 ${c - 0.01}`,
            transition: reducedMotion ? "none" : "stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </svg>
      {children ? <span className="absolute inset-0 flex items-center justify-center">{children}</span> : null}
    </span>
  );
}

/** Hue chip — small identity tile for an icon: tinted fill, hairline frame. */
export function HueChip({
  hue,
  icon: Icon,
  className,
  size = "sm",
}: {
  hue: string;
  icon: LucideIcon;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
      style={{ color: hue, backgroundColor: tint(hue, 12), borderColor: tint(hue, 28) }}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4.5"} strokeWidth={1.75} />
    </span>
  );
}

/** Mono letter avatar tinted with a hue (glossary entries). */
export function HueLetter({ letter, hue, className }: { letter: string; hue: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-semibold uppercase",
        className,
      )}
      style={{ color: hue, backgroundColor: tint(hue, 12), borderColor: tint(hue, 30) }}
    >
      {letter.slice(0, 1)}
    </span>
  );
}

/** Section heading in the ledger annotation style. */
export function AcademySectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("ledger-label", className)}>{children}</h2>;
}

// ── Scroll-reveal primitives (ring/diagram animations) ──────────────────────

/** True after the referenced element first enters the viewport (observes once).
 *  Falls back to "in view" when IntersectionObserver is unavailable (SSR/tests). */
export function useInViewOnce<T extends HTMLElement>(rootMargin = "0px 0px -8% 0px") {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      // Ancient engines / test environments — reveal async (never sync in effect).
      const timer = window.setTimeout(() => setInView(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin, threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

/** Live preference for reduced motion — animations render their final state.
 *  Backed by useSyncExternalStore: no setState-in-effect, SSR-safe. */
export function usePrefersReducedMotion(): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const getSnapshot = React.useCallback(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const getServerSnapshot = React.useCallback(() => false, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
