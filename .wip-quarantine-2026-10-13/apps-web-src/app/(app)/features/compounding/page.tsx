import type { Metadata } from "next";

import { CompoundingCalculator } from "@/components/calculators/compounding-calculator";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/features/compounding");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * Compounding Calculator — frontend-only projection tool (FEATURES §1):
 * A = P × (1 + r)^n applied per period. The UI projects whatever assumptions
 * the user enters — it never implies a return is realistic (§52).
 */
export default function CompoundingPage() {
  return (
    <section aria-label={nav.label}>
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Project account growth across multiple periods using a defined return per period — a mathematical
          projection, not a performance promise.
        </p>
      </header>
      <CompoundingCalculator />
    </section>
  );
}
