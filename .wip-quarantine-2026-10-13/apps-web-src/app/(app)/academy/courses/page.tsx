import { Suspense } from "react";
import type { Metadata } from "next";

import { CoursesView } from "@/components/academy/courses-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Courses",
};

export default function AcademyCoursesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl space-y-5" aria-busy="true">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <CoursesView />
    </Suspense>
  );
}
