import { Suspense } from "react";

import type { Metadata } from "next";

import { CompoundingView } from "@/components/tools/compounding-view";

export const metadata: Metadata = {
  title: "Compounding",
  description:
    "Project account growth period by period: balance, gain per period and the full compound schedule.",
};

export default function CompoundingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" />
      }
    >
      <CompoundingView />
    </Suspense>
  );
}
