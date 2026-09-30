import { Suspense } from "react";

import type { Metadata } from "next";

import { SessionView } from "@/components/session/session-view";

export const metadata: Metadata = {
  title: "Session Live",
  description:
    "Run a structured trading session in real time: open-trade monitoring, live discipline banner and the Regret Registry.",
};

export default function SessionPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <SessionView />
    </Suspense>
  );
}
