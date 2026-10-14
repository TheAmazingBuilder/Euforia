import { Suspense } from "react";
import type { Metadata } from "next";

import { AnalyticsView } from "@/components/analytics/analytics-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/analytics");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * Analytics — the central analytical intelligence layer of the journal
 * (MASTER PROMPT). One globally-filtered server dataset rendered across 13
 * tabs: the client formats, it never re-derives aggregates.
 */
export default function AnalyticsPage() {
  return (
    <section aria-label="Analytics">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Evidence, not prediction: performance, risk, execution, psychology and statistics computed on the exact
          dataset you filter below.
        </p>
      </header>
      <Suspense fallback={null}>
        <AnalyticsView />
      </Suspense>
    </section>
  );
}
