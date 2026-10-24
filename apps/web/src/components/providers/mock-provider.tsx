"use client";

import * as React from "react";

import { API_MOCKED } from "@/lib/api/mode";

/**
 * Boots the MSW worker before rendering children - but ONLY when mocking is
 * active per the canonical mode check (lib/api/mode.ts):
 *   - NEXT_PUBLIC_API_MOCKED=true (explicit opt-in - demo/preview), or
 *   - zero-env development (next dev).
 * Production builds default to the REAL API and cannot accidentally
 * activate the mock layer (MASTER QA spec §14.9). When mocking is off this
 * provider is a transparent passthrough and the real NestJS API serves the
 * same contract.
 *
 * The start promise is a module-level singleton: React Strict Mode
 * double-invokes effects in dev, and MSW throws when started twice.
 */
let workerStartPromise: Promise<void> | null = null;

function startWorkerOnce(): Promise<void> {
  workerStartPromise ??= import("@/mocks/browser")
    .then(({ worker, SW_URL }) =>
      // The composed /sw.js hosts both the mock layer and the PWA offline
      // fallback - one registration at scope "/" (see public/sw.js).
      worker.start({
        serviceWorker: { url: SW_URL },
        onUnhandledRequest: "bypass",
      }),
    )
    .then(() => undefined);
  return workerStartPromise;
}

export function MockProvider({ children }: { children: React.ReactNode }) {
  const mocked = API_MOCKED;
  // SSR and first client render agree: not ready when mocking, ready otherwise.
  const [ready, setReady] = React.useState(!mocked);

  React.useEffect(() => {
    if (!mocked) return;
    let cancelled = false;
    startWorkerOnce().then(
      () => {
        if (!cancelled) setReady(true);
      },
      (error: unknown) => {
        console.error("[mock-provider] worker failed to start:", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mocked]);

  if (!ready) return null;
  return <>{children}</>;
}
