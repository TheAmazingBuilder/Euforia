import type { Metadata } from "next";

import { PortfolioView } from "@/components/portfolios/portfolio-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/portfolios");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "The portfolio desk: multi-account balances, capital allocation, broker connections and auto-imported trades.",
};

export default function PortfoliosPage() {
  return <PortfolioView />;
}
