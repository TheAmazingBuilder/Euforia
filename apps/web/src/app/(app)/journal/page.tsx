import { Suspense } from "react";

import type { Metadata } from "next";

import { TradeReviewView } from "@/components/trade-review/trade-review-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/journal");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

export default function JournalPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <TradeReviewView />
    </Suspense>
  );
}
