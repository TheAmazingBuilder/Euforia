import { Suspense } from "react";

import type { Metadata } from "next";

import { TradesTable } from "@/components/trades/trades-table";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/trades");

export const metadata: Metadata = {
  title: nav.label,
};

export default function TradesPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <TradesTable />
    </Suspense>
  );
}
