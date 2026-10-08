import type { Metadata } from "next";

import { LotSizeCalculator } from "@/components/calculators/lot-size-calculator";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/tools/lot-size");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /tools/lot-size — Lot (TOOLS section). The page opens with the standard
 * module header (title + description, same typography as every other
 * module) before the calculator (inputs → calculate → result → breakdown).
 * Frontend-only deterministic math through the shared live-estimate layer;
 * no backend, no execution.
 */
export default function LotSizePage() {
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <LotSizeCalculator />
    </section>
  );
}
