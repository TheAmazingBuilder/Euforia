"use client";

import Link from "next/link";

import { EuforiaLogo } from "@/components/brand/euforia-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useDict } from "@/i18n/i18n-provider";

/**
 * Authentication shell (spec §44, §45, §46) - belongs to the Euforia design
 * system: premium, technical, restrained. Desktop gets a branding column +
 * the auth card; mobile collapses to a focused single column with large
 * touch targets. No generic gradients, no stock illustrations (§45).
 */
export function AuthLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  /** SR-only page landmark title (the visual card carries its own heading). */
  title: string;
}) {
  const auth = useDict().auth;
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1fr_460px] xl:grid-cols-[1fr_520px]">
      {/* Branding column - desktop only (§44: mobile stays simple/focused) */}
      <aside
        aria-hidden="true"
        className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex xl:p-14"
      >
        {/* Ribbon motif - the brand mark, oversized and faint. Single
            decorative element, deliberately quiet (§45). */}
        <EuforiaLogo
          variant="mark"
          tone="auto"
          size="md"
          className="pointer-events-none absolute -bottom-40 -right-28 size-[560px] opacity-[0.07]"
        />

        <EuforiaLogo variant="full" tone="auto" size="md" />

        <div className="relative flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
              {auth.brandTagline}
            </p>
            <h2 className="font-heading text-3xl font-semibold leading-tight xl:text-4xl">
              A journal that
              <br />
              makes you a
              <br />
              <span className="text-accent">disciplined trader.</span>
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {auth.brandPitch}
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {auth.pillars.map((pillar) => (
              <li
                key={pillar.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised/60 px-4 py-3"
              >
                <span
                  className="mt-1 size-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{pillar.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {pillar.detail}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground/70">
          Euforia - trading journal &amp; behavioral coach
        </p>
      </aside>

      {/* Auth column */}
      <main
        aria-label={title}
        className="relative flex min-h-screen flex-col bg-background px-4 py-6 sm:px-8"
      >
        <div className="flex items-center justify-between lg:justify-end">
          {/* Mobile brand (the desktop column already carries it) */}
          <Link
            href="/login"
            aria-label="Euforia"
            className="flex items-center gap-2 lg:hidden"
          >
            <EuforiaLogo variant="full" tone="auto" size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Protected by session security, rate limiting and optional
          two-factor authentication.
        </p>
      </main>
    </div>
  );
}
