import {
  oryonDrawingsFileSchema,
  oryonDrawingTypeSchema,
  type OryonDrawing,
} from "@cosmoz/shared";

/**
 * Oryon drawing persistence — local storage adapter (RF-09).
 *
 * Product decision (cahier des charges §13 Q7 + RF-09):
 *  - drawings persist PER SYMBOL under the NEW versioned key
 *    `euforia.oryon.drawings.v1:{symbol}`;
 *  - the legacy key `cosmoz.session-live.chart.v1` is NOT read back and its
 *    unvalidated data is NOT migrated;
 *  - every load goes through Zod safeParse — invalid records are dropped
 *    with a console warning, never rendered as-is;
 *  - NO backend endpoint is invented: local-only, documented limitation
 *    (not cross-device, not account-synchronized).
 *
 * Scope: the symbol is the repo's stable market identity (market-service
 * contract — candles/quotes are keyed by symbol; instrument symbols in the
 * catalog are unique). Timeframe is deliberately NOT part of the key:
 * time/price-anchored drawings survive timeframe switches (spec §13).
 */

const KEY_PREFIX = "euforia.oryon.drawings.v1";
const SAVE_DEBOUNCE_MS = 300;

/** Types the CURRENT renderer can draw — DERIVED from the shared schema's
 * full type set. Every schema member ships with a renderer in the same
 * build (the schema's own contract), so deriving removes the drift class
 * entirely: a hand-maintained list here silently DROPPED every toolbar-v2
 * drawing (extended/fibext/longpos/…) on reload — the exact bug this
 * derivation fixes. The filter stays as the load-time safety net. */
export const RENDERABLE_DRAWING_TYPES: ReadonlySet<string> = new Set(
  oryonDrawingTypeSchema.options,
);

function storageKey(symbol: string): string {
  return `${KEY_PREFIX}:${symbol}`;
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false; // Privacy mode / disabled storage — features degrade safely.
  }
}

/**
 * Loads + validates drawings for a symbol. Corrupt payloads, wrong
 * versions and unknown type values are dropped (console warning), the rest
 * survives. Never throws.
 */
export function loadDrawingsForSymbol(symbol: string): OryonDrawing[] {
  if (symbol === "" || !isStorageAvailable()) return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(symbol));
  } catch {
    return [];
  }
  if (raw === null || raw === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      `[oryon] drawings for ${symbol}: corrupt JSON dropped (not valid JSON).`,
    );
    return [];
  }

  const file = oryonDrawingsFileSchema.safeParse(parsed);
  if (!file.success) {
    console.warn(
      `[oryon] drawings for ${symbol}: invalid records dropped (Zod validation failed).`,
    );
    return [];
  }

  const renderable = file.data.drawings.filter((drawing) => {
    if (RENDERABLE_DRAWING_TYPES.has(drawing.type)) return true;
    console.warn(
      `[oryon] drawings for ${symbol}: type "${drawing.type}" has no renderer — dropped.`,
    );
    return false;
  });
  return renderable;
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced save (300 ms) — a burst of mutations (drag end, style tweaks)
 * lands as one write. Failures are swallowed: persistence must never break
 * the interactive session.
 */
export function saveDrawingsForSymbol(
  symbol: string,
  drawings: readonly OryonDrawing[],
): void {
  if (symbol === "" || !isStorageAvailable()) return;
  const existing = pendingTimers.get(symbol);
  if (existing !== undefined) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(symbol);
    try {
      if (drawings.length === 0) {
        window.localStorage.removeItem(storageKey(symbol));
        return;
      }
      const file = {
        version: 1 as const,
        symbol,
        savedAt: Date.now(),
        drawings,
      };
      // Persist through the SAME schema that validates the load — a save
      // that would not survive its own load is a bug caught here.
      const check = oryonDrawingsFileSchema.safeParse(file);
      if (!check.success) {
        console.warn("[oryon] drawings save skipped — payload invalid.");
        return;
      }
      window.localStorage.setItem(storageKey(symbol), JSON.stringify(check.data));
    } catch {
      // Quota exceeded / storage evicted — session keeps working in memory.
    }
  }, SAVE_DEBOUNCE_MS);
  pendingTimers.set(symbol, timer);
}

/** Flushes a pending save immediately (instrument switch / unmount). */
export function flushDrawingsForSymbol(
  symbol: string,
  drawings: readonly OryonDrawing[],
): void {
  if (symbol === "" || !isStorageAvailable()) return;
  const existing = pendingTimers.get(symbol);
  if (existing !== undefined) {
    clearTimeout(existing);
    pendingTimers.delete(symbol);
  }
  try {
    if (drawings.length === 0) {
      window.localStorage.removeItem(storageKey(symbol));
      return;
    }
    const file = { version: 1 as const, symbol, savedAt: Date.now(), drawings };
    const check = oryonDrawingsFileSchema.safeParse(file);
    if (!check.success) return;
    window.localStorage.setItem(storageKey(symbol), JSON.stringify(check.data));
  } catch {
    // Same swallow policy as the debounced save.
  }
}
