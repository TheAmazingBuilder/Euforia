import type { Metadata } from "next";
import { Suspense } from "react";

import { RecognitionWorkspace } from "@/components/recognition/recognition-workspace";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/recognition");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /recognition — Import & Recognition (Insights section, between Analytics
 * and Calendar). V1.1 redesign: the page opens with a console-style header —
 * a mono kicker, the page title, the description and a hairline double rule
 * — before the workspace (upload → configure → processing → result →
 * review → confirm → success), with history one tab away (?tab=history) and
 * URL-carried job context (?job=<id>, refresh-safe — spec §44).
 *
 * `<Suspense>` boundary: RecognitionWorkspace reads useSearchParams(), which
 * triggers a CSR bailout during prerendering without it (same pattern as
 * LoginForm).
 */
export default function RecognitionPage() {
  return (
    <section aria-label="Import and Recognition" className="flex flex-col">
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5">
        <div className="flex flex-col">
          <p className="ledger-label text-accent">Insights · Screenshot pipeline</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-[28px]">
            {nav.label}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {nav.description} Three recognition modes — trade details, account
            &amp; positions, chart analysis — over the same pixels.
          </p>
        </div>
        <div className="rule-double" aria-hidden="true" />
      </header>
      <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted" />}>
        <RecognitionWorkspace />
      </Suspense>
    </section>
  );
}
