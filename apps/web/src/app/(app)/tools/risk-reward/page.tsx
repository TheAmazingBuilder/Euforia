import type { Metadata } from "next";

import { RiskRewardCalculator } from "@/components/calculators/risk-reward-calculator";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/tools/risk-reward");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /tools/risk-reward — Risk/Reward (TOOLS section). Standard module header
 * (title + description, same typography as every other module) over the
 * expectancy workspace: reactive calculator inputs → live summary stat band →
 * color-coded win rate cheat sheet matrix. Frontend-only deterministic math
 * through the shared risk-reward engine; no backend, no persistence — a
 * planning tool, never a performance promise.
 */
export default function RiskRewardPage() {
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <RiskRewardCalculator />
    </section>
  );
}
