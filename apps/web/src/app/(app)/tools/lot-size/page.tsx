import type { Metadata } from "next";

import { LotSizeCalculator } from "@/components/calculators/lot-size-calculator";
import { getNavItem } from "@/lib/navigation";
import { en } from "@/i18n/dictionaries/en";

const nav = getNavItem("/tools/lot-size");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /tools/lot-size — Lot Size Calculator (TOOLS section). The page opens with
 * the console header — kicker, title, description and the ruled meta cluster
 * stating the sizing model's product truths — before the calculator
 * (inputs → calculate → result → breakdown). Frontend-only deterministic
 * math through the shared live-estimate layer; no backend, no execution.
 */
export default function LotSizePage() {
  const meta = en.tools.lotSize.overview;
  const metaRows = [
    { label: meta.metaModes, value: meta.metaModesValue },
    { label: meta.metaModel, value: meta.metaModelValue },
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
          <dl className="hidden min-w-64 flex-col lg:flex" data-testid="lotsize-console-meta">
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
      <LotSizeCalculator />
    </section>
  );
}
