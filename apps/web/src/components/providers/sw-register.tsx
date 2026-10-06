"use client";

import * as React from "react";

/**
 * Early-registers the composed Euforia service worker (/sw.js — PWA offline
 * shell + hosted MSW mock layer, feature 12). MSW's start() targets the same
 * script, so whichever registers first, there is exactly ONE worker.
 * Registration failures (private mode, unsupported) are non-fatal.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app keeps working without the offline shell.
    });
  }, []);

  return null;
}
