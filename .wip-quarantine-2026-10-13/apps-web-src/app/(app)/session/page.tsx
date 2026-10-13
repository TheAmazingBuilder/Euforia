import { Suspense } from "react";

import type { Metadata } from "next";

import { SessionLiveView } from "@/components/session/session-live-view";

export const metadata: Metadata = {
  title: "Session Live",
  description:
    "The real-time analytical cockpit: professional chart analysis, read-only account monitoring and complete session documentation.",
};

export default function SessionPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <SessionLiveView />
    </Suspense>
  );
}
