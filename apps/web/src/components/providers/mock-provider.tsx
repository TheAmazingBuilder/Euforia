"use client";

import * as React from "react";

/**
 * Boots the MSW worker before rendering children — but ONLY when
 * NEXT_PUBLIC_API_MOCKED === "true". Components know nothing about MSW;
 * when the env flag is off this provider is a transparent passthrough and
 * the future NestJS API serves the same contract.
 *
 * The start promise is a module-level singleton: React Strict Mode
 * double-invokes effects in dev, and MSW throws when started twice.
 */
let workerStartPromise: Promise<void> | null = null;

function startWorkerOnce(): Promise<void> {
  workerStartPromise ??= import("@/mocks/browser")
    .then(({ worker }) => worker.start({ onUnhandledRequest: "bypass" }))
    .then(() => undefined);
  return workerStartPromise;
}

export function MockProvider({ children }: { children: React.ReactNode }) {
  const mocked = process.env.NEXT_PUBLIC_API_MOCKED === "true";
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
