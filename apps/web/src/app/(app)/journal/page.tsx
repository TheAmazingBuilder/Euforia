import type { Metadata } from "next";

import { TradeReviewView } from "@/components/trade-review/trade-review-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/journal");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

export default function JournalPage() {
  return <TradeReviewView />;
}
