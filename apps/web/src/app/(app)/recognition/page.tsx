import type { Metadata } from "next";

import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/recognition");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /recognition — Import & Recognition (Insights section).
 *
 * PROMPT 3 rebuild, in progress: the Phase 19 monolithic review view was
 * removed; the full workspace (upload → processing → result → draft →
 * confirm → history) is being recomposed per the OCR & Trade Recognition
 * V1 spec. This shell keeps the route coherent between commits.
 */
export default function RecognitionPage() {
  return (
    <section aria-label="Import and Recognition">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <div
        className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center"
        data-testid="recognition-rebuild-shell"
      >
        <p className="font-heading text-base font-semibold">Workspace rebuilding</p>
        <p className="max-w-md text-sm text-muted-foreground">
          The Import &amp; Recognition workspace is being recomposed — screenshot upload,
          staged recognition, field review with confidence, trade draft and history.
        </p>
      </div>
    </section>
  );
}
