import type { Metadata } from "next";

import { CompoundingCalculator } from "@/components/calculators/compounding-calculator";
import { getNavItem } from "@/lib/navigation";
import { en } from "@/i18n/dictionaries/en";

const nav = getNavItem("/tools/compounding");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /tools/compounding — Compounding Calculator (TOOLS section). Console header
 * (kicker, title, description, ruled meta cluster) over the live projection:
 * inputs → summary stat band → growth chart → period-by-period results.
 * Frontend-only deterministic math through the shared projection layer; no
 * backend, no persistence, no performance promises.
 */
export default function CompoundingPage() {
  const meta = en.tools.compounding.overview;
  const metaRows = [
    { label: meta.metaModel, value: meta.metaModelValue },
    { label: meta.metaRange, value: meta.metaRangeValue },
    { label: meta.metaGuard, value: meta.metaGuardValue },
  ];
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="max-w-2xl">
            <p className="ledger-label text-accent">{meta.kicker}</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-[28px]">
              {nav.label}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{nav.description}</p>
          </div>
          {/* Console meta — static product truths, ruled like a title block. */}
          <dl className="hidden min-w-64 flex-col lg:flex" data-testid="comp-console-meta">
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
      <CompoundingCalculator />
    </section>
  );
}
