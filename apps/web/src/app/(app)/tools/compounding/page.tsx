import type { Metadata } from "next";

import { CompoundingCalculator } from "@/components/calculators/compounding-calculator";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/tools/compounding");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /tools/compounding — Interest (TOOLS section). Standard module header
 * (title + description, same typography as every other module) over the
 * live projection: inputs → summary stat band → growth chart →
 * period-by-period results. Frontend-only deterministic math through the
 * shared projection layer; no backend, no persistence, no performance
 * promises.
 */
export default function CompoundingPage() {
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <CompoundingCalculator />
    </section>
  );
}
