import { Suspense } from "react";
import type { Metadata } from "next";
import { ImportView } from "@/components/import/import-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/import");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="mx-auto h-40 w-full max-w-7xl animate-pulse rounded-xl bg-muted" />
        </>
      }
    >
      <ImportView />
    </Suspense>
  );
}
