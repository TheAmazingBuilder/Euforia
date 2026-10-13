import { Suspense } from "react";

import type { Metadata } from "next";

import { PlannerView } from "@/components/planner/planner-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/planner");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

export default function PlannerPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="mx-auto h-40 w-full max-w-7xl animate-pulse rounded-xl bg-muted" />
        </>
      }
    >
      <PlannerView />
    </Suspense>
  );
}
