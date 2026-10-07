import type { Metadata } from "next";
import { Suspense } from "react";

import { RecognitionWorkspace } from "@/components/recognition/recognition-workspace";
import { getNavItem } from "@/lib/navigation";
import { en } from "@/i18n/dictionaries/en";

const nav = getNavItem("/recognition");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /recognition — Import & Recognition (Insights section, between Analytics
 * and Calendar). The page opens with a CONSOLE header — kicker, title,
 * description, and a right-hand ruled meta cluster stating the three
 * product truths of this module (modes, pipeline span, duplicate guard)
 * — before the workspace (upload → configure → processing → result →
 * review → confirm → success), with history one tab away (?tab=history)
 * and URL-carried job context (?job=<id>, refresh-safe — spec §44).
 *
 * `<Suspense>` boundary: RecognitionWorkspace reads useSearchParams(), which
 * triggers a CSR bailout during prerendering without it (same pattern as
 * LoginForm).
 */
export default function RecognitionPage() {
  const meta = en.recognition.overview.meta;
  const metaRows = [
    { label: meta.modesLabel, value: meta.modesValue },
    { label: meta.stagesLabel, value: meta.stagesValue },
    { label: meta.guardLabel, value: meta.guardValue },
  ];
  return (
    <section aria-label="Import and Recognition" className="flex flex-col">
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="max-w-2xl">
            <p className="ledger-label text-accent">Insights · Screenshot pipeline</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-[28px]">
              {nav.label}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {nav.description} Three recognition modes — trade details, account
              &amp; positions, chart analysis — over the same pixels.
            </p>
          </div>
          {/* Console meta — static product truths, ruled like a title block. */}
          <dl className="hidden min-w-64 flex-col lg:flex" data-testid="recognition-console-meta">
            {metaRows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-6 border-b border-border/60 py-1.5 last:border-b-0"
              >
                <dt className="ledger-label !text-[10px]">{row.label}</dt>
                <dd className="font-mono text-[11px] uppercase tracking-[0.06em] text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rule-double" aria-hidden="true" />
      </header>
      <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted" />}>
        <RecognitionWorkspace />
      </Suspense>
    </section>
  );
}
