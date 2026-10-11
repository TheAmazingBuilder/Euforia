import { oryonAlertSchema, oryonAlertsFileSchema, type OryonAlert } from "@cosmoz/shared";

/**
 * Oryon alert persistence — local storage adapter (Phase 5).
 *
 * Integration honesty (spec §8/§9): this is BROWSER-LOCAL persistence under
 * the versioned key `euforia.oryon.alerts.v1` — the same convention as the
 * drawings (`euforia.oryon.drawings.v1:{symbol}`) and the indicator stack
 * (`euforia.oryon.indicators.v1`). It is NOT server-side: no endpoint, no
 * database, no cross-device sync, no background evaluation after the tab
 * closes — the management panel states this in plain copy.
 *
 * Load discipline (repo convention): every record is validated with the SAME
 * shared schema that types it. A corrupt envelope falls back to per-record
 * salvage (valid rows survive, invalid rows are dropped with a console
 * warning) — one poisoned record never destroys the user's whole list.
 * Save is debounced (300 ms) with an explicit flush, and persistence
 * failures degrade to in-memory operation instead of breaking the session.
 */

const STORAGE_KEY = "euforia.oryon.alerts.v1";
const SAVE_DEBOUNCE_MS = 300;

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false; // Privacy mode / disabled storage — features degrade safely.
  }
}

/** Loads + validates alerts. Corrupt data is dropped, never rendered. */
export function loadAlerts(): OryonAlert[] {
  if (!isStorageAvailable()) return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] alerts: corrupt JSON dropped (not valid JSON).");
    return [];
  }

  const file = oryonAlertsFileSchema.safeParse(parsed);
  if (file.success) return file.data.alerts;

  // Envelope failed — salvage valid RECORDS instead of nuking the list.
  const items = (parsed as { alerts?: unknown } | null)?.alerts;
  if (!Array.isArray(items)) {
    console.warn("[oryon] alerts: invalid payload dropped (Zod validation failed).");
    return [];
  }
  const salvaged: OryonAlert[] = [];
  for (const item of items) {
    const record = oryonAlertSchema.safeParse(item);
    if (record.success) salvaged.push(record.data);
    else console.warn("[oryon] alerts: invalid record dropped (Zod validation failed).");
  }
  return salvaged;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function writeNow(alerts: readonly OryonAlert[]): void {
  try {
    if (alerts.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const file = { version: 1 as const, savedAt: Date.now(), alerts };
    // Persist through the SAME schema that validates the load — a save that
    // would not survive its own load is a bug caught here.
    const check = oryonAlertsFileSchema.safeParse(file);
    if (!check.success) {
      console.warn("[oryon] alerts save skipped — payload invalid.");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(check.data));
  } catch {
    // Quota exceeded / storage evicted — session keeps working in memory.
  }
}

/** Debounced save — bursts of mutations land as one write. */
export function saveAlerts(alerts: readonly OryonAlert[]): void {
  if (!isStorageAvailable()) return;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    writeNow(alerts);
  }, SAVE_DEBOUNCE_MS);
}

/** Flushes a pending save immediately (unmount). */
export function flushAlerts(alerts: readonly OryonAlert[]): void {
  if (!isStorageAvailable()) return;
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  writeNow(alerts);
}
