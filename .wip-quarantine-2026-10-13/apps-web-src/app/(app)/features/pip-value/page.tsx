import type { Metadata } from "next";

import { PipValueCalculator } from "@/components/calculators/pip-value-calculator";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/features/pip-value");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * Pip & Tick Value — frontend-only operational tool (TOOLS §1): instrument,
 * lot size and account currency in, pip/tick values per lot and for the whole
 * position out. No backend, no broker, no persistence.
 */
export default function PipValuePage() {
  return (
    <section aria-label={nav.label}>
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Know what one pip and one tick are worth on any instrument — per lot and for the whole
          position — with every step of the math left visible.
        </p>
      </header>
      <PipValueCalculator />
    </section>
  );
}
