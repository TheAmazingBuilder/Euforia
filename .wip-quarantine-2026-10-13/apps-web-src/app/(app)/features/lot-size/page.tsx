import type { Metadata } from "next";

import { LotSizeCalculator } from "@/components/calculators/lot-size-calculator";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/features/lot-size");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * Lot Size Calculator — frontend-only operational tool (FEATURES §1): risk
 * amount, stop distance and instrument specifications in, recommended
 * position size out. No backend, no broker, no persistence.
 */
export default function LotSizePage() {
  return (
    <section aria-label={nav.label}>
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Size positions from your account risk, stop distance and instrument specifications — with every
          step of the math left visible.
        </p>
      </header>
      <LotSizeCalculator />
    </section>
  );
}
