import { z } from "zod";

import { isCatalogToolId, type OryonCatalogToolId } from "@/lib/oryon/tools/catalog";

/**
 * Oryon workspace UI preferences — browser-local persistence for the
 * Drawing toolbar v2 chrome: the FAVORITES list (starred tools) and the
 * FLOATING favorites-bar state (visibility + position over the chart).
 *
 * Scope decision (same reasoning as workspace/layouts persistence): these
 * are browser-local workspace preferences, not server contract — they ride
 * localStorage under the SAME versioned/validated conventions as every
 * other Oryon record, and the adapters below are the only files that know
 * the storage key.
 *
 * Robustness contract (mirrors layouts/templates):
 *  - a corrupt envelope / wrong version / unavailable storage → the
 *    documented defaults, never a throw;
 *  - favorites entries are salvaged INDIVIDUALLY against the catalog
 *    whitelist (a stale tool id from an older build is dropped, the rest
 *    survive) and deduplicated;
 *  - the bar position is validated finite and re-clamped at RENDER time
 *    against the current chart-area size (a persisted position from a
 *    larger viewport can never strand the bar off-screen);
 *  - writes pass through the SAME schema (validate before save).
 */

const UI_PREFS_KEY = "euforia.oryon.ui.v1";
const SAVE_DEBOUNCE_MS = 300;

export const oryonUiPrefsSchema = z.object({
  version: z.literal(1),
  /** Whitelist-validated per entry at LOAD time (isCatalogToolId) — the
   *  schema stays a plain string list so an older build's stale ids are
   *  salvaged out instead of nuking the whole envelope. */
  favorites: z.array(z.string().min(1).max(40)).max(24),
  favoritesBar: z.object({
    visible: z.boolean(),
    /** CSS px within the chart area — clamped at render time. */
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

/** Runtime prefs — favorites are ALWAYS catalog-validated by the loader. */
export interface OryonUiPrefs {
  favorites: readonly OryonCatalogToolId[];
  favoritesBar: {
    visible: boolean;
    x: number;
    y: number;
  };
}

/** Documented defaults — a curated starter set (mirrors the TradingView
 *  floating bar: trend, hline, fib, position, measure) and the bar VISIBLE:
 *  the user asked for it, and an empty hidden bar would look broken.
 *  Position (96, 128) — chart-AREA coordinates (panel headers INCLUDED in
 *  this container): the top-left column is BUSY by default — panel header
 *  (~0..48) then the indicator legend (~52..116) then the event-marker
 *  band (click line ≈120) — so the bar docks at y=128, BELOW all three.
 *  The earlier defaults (120, then 64) floated INSIDE those interactive
 *  zones and swallowed chart clicks there (P8 marker popover + P3 legend
 *  chip regressions). Users drag the bar anywhere — the clamp keeps it
 *  inside the chart area. */
export const ORYON_UI_PREFS_DEFAULT: OryonUiPrefs = {
  favorites: ["trend", "hline", "fib", "longpos", "shortpos", "measure"],
  favoritesBar: {
    visible: true,
    x: 96,
    y: 128,
  },
};

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false;
  }
}

/** Loose frame so valid favorites salvage out of an otherwise-broken file. */
const rawEnvelopeSchema = z.object({
  version: z.unknown(),
  favorites: z.unknown(),
  favoritesBar: z.unknown(),
});

/** Loads + validates the persisted prefs. Never throws. */
export function loadUiPrefs(): OryonUiPrefs {
  if (!isStorageAvailable()) return { ...ORYON_UI_PREFS_DEFAULT };
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(UI_PREFS_KEY);
  } catch {
    return { ...ORYON_UI_PREFS_DEFAULT };
  }
  if (raw === null || raw === "") return { ...ORYON_UI_PREFS_DEFAULT };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] ui prefs: corrupt JSON dropped - defaults in use.");
    return { ...ORYON_UI_PREFS_DEFAULT };
  }

  const envelope = rawEnvelopeSchema.safeParse(parsed);
  if (!envelope.success || envelope.data.version !== 1) {
    console.warn("[oryon] ui prefs: invalid payload dropped - defaults in use.");
    return { ...ORYON_UI_PREFS_DEFAULT };
  }

  // Favorites salvage — per-entry, order kept, duplicates removed.
  const favorites: OryonCatalogToolId[] = [];
  if (Array.isArray(envelope.data.favorites)) {
    for (const entry of envelope.data.favorites) {
      if (typeof entry === "string" && isCatalogToolId(entry) && !favorites.includes(entry)) {
        favorites.push(entry);
      }
    }
  }

  // Bar position — finite numbers only; visibility boolean only.
  const rawBar = envelope.data.favoritesBar;
  const bar =
    rawBar !== null && typeof rawBar === "object"
      ? (rawBar as Record<string, unknown>)
      : {};
  const visible = typeof bar.visible === "boolean" ? bar.visible : ORYON_UI_PREFS_DEFAULT.favoritesBar.visible;
  const x = typeof bar.x === "number" && Number.isFinite(bar.x) ? bar.x : ORYON_UI_PREFS_DEFAULT.favoritesBar.x;
  const y = typeof bar.y === "number" && Number.isFinite(bar.y) ? bar.y : ORYON_UI_PREFS_DEFAULT.favoritesBar.y;

  return {
    favorites: favorites.length > 0 ? favorites : [...ORYON_UI_PREFS_DEFAULT.favorites],
    favoritesBar: { visible, x, y },
  };
}

function writePrefs(prefs: OryonUiPrefs): void {
  try {
    const check = oryonUiPrefsSchema.safeParse({
      version: 1 as const,
      favorites: [...prefs.favorites],
      favoritesBar: { ...prefs.favoritesBar },
    });
    if (!check.success) {
      console.warn("[oryon] ui prefs save skipped - payload invalid.");
      return;
    }
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(check.data));
  } catch {
    // Quota exceeded / storage evicted — the session keeps working in memory.
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced prefs save (300 ms). */
export function saveUiPrefs(prefs: OryonUiPrefs): void {
  if (!isStorageAvailable()) return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writePrefs(prefs);
  }, SAVE_DEBOUNCE_MS);
}

/** Flushes a pending prefs write immediately (unmount safety). */
export function flushUiPrefs(prefs: OryonUiPrefs): void {
  if (!isStorageAvailable()) return;
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writePrefs(prefs);
}
