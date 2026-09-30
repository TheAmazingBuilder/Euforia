import { Suspense } from "react";

import type { Metadata } from "next";

import { DisciplineView } from "@/components/discipline/discipline-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/discipline");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "The Cosmoz Discipline Score, your rule engine with violation history and the Mistake Ledger.",
};

export default function DisciplinePage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <DisciplineView />
    </Suspense>
  );
}
