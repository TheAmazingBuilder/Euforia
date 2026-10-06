"use client";

import * as React from "react";

/**
 * Boots the MSW worker before rendering children — but ONLY when mocking is
 * active. Mocking is the DEFAULT (the canonical preview needs zero env); the
 * two ways to leave mock mode:
 *   - NEXT_PUBLIC_API_LIVE=true (the live bridge — explicit opt-in)
 *   - NEXT_PUBLIC_API_MOCKED=false (explicit legacy switch)
 * When neither applies this provider is a transparent passthrough and the
 * real NestJS API serves the same contract.
 *
 * The start promise is a module-level singleton: React Strict Mode
 * double-invokes effects in dev, and MSW throws when started twice.
 */
let workerStartPromise: Promise<void> | null = null;

function startWorkerOnce(): Promise<void> {
  workerStartPromise ??= import("@/mocks/browser")
    .then(({ worker, SW_URL }) =>
      // The composed /sw.js hosts both the mock layer and the PWA offline
      // fallback — one registration at scope "/" (see public/sw.js).
      worker.start({
        serviceWorker: { url: SW_URL },
        onUnhandledRequest: "bypass",
      }),
    )
    .then(() => undefined);
  return workerStartPromise;
}

export function MockProvider({ children }: { children: React.ReactNode }) {
  const mocked =
    process.env.NEXT_PUBLIC_API_MOCKED !== "false" &&
    process.env.NEXT_PUBLIC_API_LIVE !== "true";
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
