import type { Metadata } from "next";

import { TradeReviewsView } from "@/components/trades/trade-reviews-view";

export const metadata: Metadata = {
  title: "Trade Reviews",
};

export default function TradeReviewsPage() {
  return <TradeReviewsView />;
}
