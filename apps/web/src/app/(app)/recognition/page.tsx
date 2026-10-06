import type { Metadata } from "next";
import { Suspense } from "react";

import { RecognitionView } from "@/components/recognition/recognition-view";

export const metadata: Metadata = {
  title: "Recognition",
  description:
    "Trade-screenshot recognition: upload an MT5-style summary, review every extracted field with its confidence and validation status, then confirm your corrections as the authoritative record.",
};

export default function RecognitionPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" />}>
      <RecognitionView />
    </Suspense>
  );
}
