import type { Metadata } from "next";

import { ChartView } from "@/components/charts/chart-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/charts");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /charts — the Charts module (Trading section). The market pane: full-width
 * TradingView-grade candlesticks (lightweight-charts), every timeframe of the
 * shared market contract, EMA and journal-trade overlays, range bar + UTC
 * clock — the chart is the page.
 */
export default function ChartsPage() {
  return (
    <section aria-label="Charts" className="flex w-full flex-col">
      <header className="mb-4 space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {nav.label}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <ChartView />
    </section>
  );
}
