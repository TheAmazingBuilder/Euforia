import { Suspense } from "react";

import type { Metadata } from "next";

import { OryonView } from "@/components/oryon/oryon-view";

export const metadata: Metadata = {
  title: "Oryon",
  description:
    "The full-screen charting workspace: candles, honest feed states and the foundation for the drawing and indicator phases.",
};

/**
 * Oryon — Phase 1. Server page (repo convention: Server Components by
 * default); the workspace itself is the client boundary. AuthGate + AppShell
 * come from the (app) layout — Oryon never implements its own auth checks.
 */
export default function OryonPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" />
      }
    >
      <OryonView />
    </Suspense>
  );
}
