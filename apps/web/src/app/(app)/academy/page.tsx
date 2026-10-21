import { Suspense } from "react";

import type { Metadata } from "next";

import { AcademyView } from "@/components/academy/academy-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/academy");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "The Euforia Academy — structured trading courses, drills, quizzes and a searchable glossary, from market fundamentals to advanced execution.",
};

export default function AcademyPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" />
        </>
      }
    >
      <AcademyView />
    </Suspense>
  );
}
