import { Suspense } from "react";

import type { Metadata } from "next";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/");

export const metadata: Metadata = {
  title: nav.label,
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-6xl animate-pulse rounded-xl bg-muted" /> </>}>
      <DashboardView title={nav.label} description={nav.description} />
    </Suspense>
  );
}
