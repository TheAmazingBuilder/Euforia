/**
 * Euforia service worker — Priorité 3, feature 12 (PWA offline).
 *
 * COMPOSITION: this worker ALSO hosts the MSW mock layer. MSW's generated
 * script (mockServiceWorker.js) is imported below — it intercepts the API
 * requests and BYPASSES navigations, so both layers coexist in one
 * registration at scope "/" (two workers cannot fight for the scope).
 *
 * Offline strategy (this file):
 * - Navigations: network-first, /offline.html fallback when the network is
 *   unreachable. The captured data stays on the device; reconnect to sync.
 * - Dev/prod identical: no static caching here (Next's immutable assets ride
 *   the browser HTTP cache), so Turbopack HMR can never serve stale chunks.
 */
importScripts("/mockServiceWorker.js");

const CACHE_VERSION = "cosmoz-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll([OFFLINE_URL, "/icon.svg", "/manifest.webmanifest"]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// MSW's fetch listener (imported above) bypasses navigations — this listener
// owns them: network-first with the offline shell as the last resort.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        try {
          const cache = await caches.open(CACHE_VERSION);
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
        } catch {}
        return new Response(
          "<!doctype html><title>Euforia</title><p style='font-family:sans-serif;padding:2rem'>You are offline.</p>",
          { status: 503, headers: { "Content-Type": "text/html" } },
        );
      }
    })(),
  );
});
