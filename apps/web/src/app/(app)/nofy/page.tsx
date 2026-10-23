import { Suspense } from "react";

import type { Metadata } from "next";

import { NofyView } from "@/components/nofy/nofy-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/nofy");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "Nofy - the personal trading knowledge workspace: notes, ideas, research and documentation, connected to your trades, strategies and Academy lessons.",
};

export default function NofyPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="mx-auto h-40 w-full max-w-6xl animate-pulse rounded-xl bg-muted" />
        </>
      }
    >
      <NofyView />
    </Suspense>
  );
}
