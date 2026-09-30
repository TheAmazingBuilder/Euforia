import { Suspense } from "react";

import type { Metadata } from "next";

import { PlaybookView } from "@/components/playbook/playbook-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/playbook");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "Your trading playbook: documented setups with grades, rules and live per-strategy performance.",
};

export default function PlaybookPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <PlaybookView />
    </Suspense>
  );
}
