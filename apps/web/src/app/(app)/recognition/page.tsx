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
 * /recognition — Recognition (Insights section, between Analytics and
 * Calendar). Standard module header (title + description, same typography
 * as every other module) before the workspace (upload → configure →
 * processing → result → review → confirm → success), with history one tab
 * away (?tab=history) and URL-carried job context (?job=<id>,
 * refresh-safe — spec §44).
 *
 * `<Suspense>` boundary: RecognitionWorkspace reads useSearchParams(), which
 * triggers a CSR bailout during prerendering without it (same pattern as
 * LoginForm).
 */
export default function RecognitionPage() {
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted" />}>
        <RecognitionWorkspace />
      </Suspense>
    </section>
  );
}
