import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

/**
 * Browser worker - started by MockProvider before children render, ONLY when
 * the canonical mode check (lib/api/mode.ts API_MOCKED) says so. Components
 * never import this module.
 */
export const worker = setupWorker(...handlers);

/**
 * The MSW worker lives at /sw.js - a composed script that importScripts the
 * generated mockServiceWorker.js AND adds the PWA offline fallback for
 * navigations (feature 12). One registration, one scope, no workers fight.
 */
export const SW_URL = "/sw.js";
