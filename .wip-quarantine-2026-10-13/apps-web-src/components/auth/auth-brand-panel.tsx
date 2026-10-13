"use client";

import Link from "next/link";
import { BookOpen, ChartColumn, Scale, ShieldCheck, Sparkles } from "lucide-react";

import { CosmozMark } from "@/components/layout/cosmoz-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const FEATURES = [
  {
    Icon: BookOpen,
    title: "Every trade, journaled",
    text: "Entries, exits, R multiple and the grade you gave the decision — side by side.",
  },
  {
    Icon: ChartColumn,
    title: "Honest analytics",
    text: "The R heatmap, tilt timeline and strategy edge, computed from your own log.",
  },
  {
    Icon: ShieldCheck,
    title: "Discipline that pays",
    text: "Ghost setups settled daily — the setups you avoided count as saved R.",
  },
  {
    Icon: Scale,
    title: "Risk guardrails",
    text: "Daily-loss cap, per-trade risk and drawdown alerts that stop the bleed early.",
  },
];

/**
 * Brand half of the split auth screen: logo + wordmark, the pitch, and the
 * theme switcher — everything reads from design tokens so the panel follows
 * all three Cosmoz themes instantly.
 */
export function AuthBrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface lg:flex">
      {/* Decorative constellation — token colors only, whispers */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full opacity-[0.35]"
        viewBox="0 0 600 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <g stroke="var(--border)" strokeWidth="1">
          <polyline points="90,620 210,540 340,600 470,520" fill="none" />
          <polyline points="430,140 520,220 470,320" fill="none" />
        </g>
        <circle cx="90" cy="620" r="3" fill="var(--muted-foreground)" opacity="0.5" />
        <circle cx="210" cy="540" r="2.5" fill="var(--muted-foreground)" opacity="0.4" />
        <circle cx="340" cy="600" r="3.5" fill="var(--muted-foreground)" opacity="0.5" />
        <circle cx="470" cy="520" r="2" fill="var(--muted-foreground)" opacity="0.35" />
        <circle cx="430" cy="140" r="2.5" fill="var(--muted-foreground)" opacity="0.4" />
        <circle cx="520" cy="220" r="3" fill="var(--muted-foreground)" opacity="0.5" />
        <circle cx="470" cy="320" r="2" fill="var(--muted-foreground)" opacity="0.35" />
      </svg>

      <div className="relative flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Cosmoz — Dashboard"
        >
          <CosmozMark className="size-9" />
          <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Cosmoz
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="relative space-y-8 px-2">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3 text-accent" aria-hidden="true" />
            The trading journal that keeps you honest
          </span>
          <h2 className="font-heading text-3xl font-bold leading-tight tracking-tight text-foreground">
            Your edge lives in
            <br />
            your own numbers.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Cosmoz turns every execution into a graded decision, every week into
            a report and every leak into a lesson — so you trade the plan, not
            the feeling.
          </p>
        </div>

        <ul className="grid gap-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background/60">
                <feature.Icon className="size-4 text-accent" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{feature.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{feature.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} Cosmoz · demo build — data is mocked locally
      </p>
    </aside>
  );
}

/** Compact brand bar shown above the form on small screens. */
export function AuthMobileHeader() {
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
      <Link href="/" className="flex items-center gap-2" aria-label="Cosmoz — Dashboard">
        <CosmozMark className="size-7" />
        <span className="font-heading text-base font-semibold tracking-tight text-foreground">
          Cosmoz
        </span>
      </Link>
      <ThemeToggle />
    </div>
  );
}
