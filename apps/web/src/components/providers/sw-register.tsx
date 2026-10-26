"use client";

import * as React from "react";

/**
 * Early-registers the Euforia service worker (/sw.js - PWA offline shell,
 * feature 12). Registration failures (private mode, unsupported) are
 * non-fatal.
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
