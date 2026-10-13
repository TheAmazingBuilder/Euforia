"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarRange, List, NotebookPen } from "lucide-react";

import { CosmozMark } from "@/components/layout/cosmoz-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const FEATURES = [
  {
    Icon: NotebookPen,
    title: "The journal that remembers",
    text: "Every trade, every note, every lesson — searchable forever.",
  },
  {
    Icon: List,
    title: "Sessions with judgment gates",
    text: "One decision at a time, graded after the reveal.",
  },
  {
    Icon: CalendarRange,
    title: "Reports that write themselves",
    text: "Your week rolled up automatically, ready to review.",
  },
] as const;

/**
 * Brand panel of the split auth layout: logo + theme switch on top, the
 * "Le Registre" pitch in the middle, ledger-lined decor underneath. Tokens
 * only — the panel must follow every theme switch without a flash.
 */
export function AuthBrand() {
  return (
    <aside className="relative hidden w-[42%] max-w-[560px] shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex xl:p-14">
      {/* Ledger lines — the ruled page the whole app draws on (token ink). */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full text-border"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {[16, 32, 48, 64, 80, 96].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="currentColor"
            strokeWidth="0.12"
          />
        ))}
      </svg>
      {/* Rising equity curve — the honest dip, crowned by a profit dot. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full text-accent"
        viewBox="0 0 400 160"
        preserveAspectRatio="none"
      >
        <polyline
          points="0,140 70,96 130,118 200,64 260,88 330,34 400,52"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="330" cy="34" r="4" className="fill-current" fillOpacity="0.9" />
        <circle cx="330" cy="34" r="9" className="fill-current" fillOpacity="0.18" />
      </svg>

      <div className="relative flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Cosmoz — Dashboard"
        >
          <CosmozMark className="size-9 rounded-md" title="Cosmoz" />
          <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Cosmoz
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="relative space-y-8">
        <p className="ledger-label">Le Registre</p>
        <h2 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground xl:text-4xl">
          The trading journal that keeps you honest.
        </h2>
        <ul className="space-y-5">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-accent">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative max-w-sm text-xs text-muted-foreground">
        Demo build — sign-in is simulated locally. No credential ever leaves
        your browser.
      </p>
    </aside>
  );
}

/** Compact brand header shown on < lg screens (the panel is hidden). */
export function AuthMobileHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
      <Link
        href="/"
        className="flex items-center gap-2"
        aria-label="Cosmoz — Dashboard"
      >
        <CosmozMark className="size-7 rounded-md" title="Cosmoz" />
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
          Cosmoz
        </span>
      </Link>
      <ThemeToggle />
    </header>
  );
}
