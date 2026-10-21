"use client";

import * as React from "react";

import { API_MOCKED } from "@/lib/api/mode";

/**
 * Early-registers the composed Euforia service worker (/sw.js — PWA offline
 * shell + hosted MSW mock layer, feature 12). MSW's start() targets the same
 * script, so whichever registers first, there is exactly ONE worker.
 * Registration failures (private mode, unsupported) are non-fatal.
 *
 * REAL-API dev safety valve (docs/auth-local-dev-setup.md): when mocking is
 * OFF and we are in a `next dev` session, do NOT register — and actively
 * UNREGISTER any worker left over from an earlier mocked session. Without
 * this, switching NEXT_PUBLIC_API_MOCKED=false kept a stale MSW+offline
 * worker intercepting navigations, which could serve /offline.html right
 * after a successful login ("You are offline"). Production builds keep the
 * offline shell regardless of mode.
 */
const DEV_REAL_API = !API_MOCKED && process.env.NODE_ENV !== "production";

export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (DEV_REAL_API) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) void registration.unregister();
        })
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app keeps working without the offline shell.
    });
  }, []);

  return null;
}
