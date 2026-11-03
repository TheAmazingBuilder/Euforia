import { z } from "zod";

/**
 * Oryon per-panel chart preferences - browser-local persistence for the
 * chart context-menu Settings (Symbol / Status line / Scales and lines /
 * Canvas) + the OHLC legend display.
 *
 * Scope decision (same reasoning as ui-prefs): these are browser-local
 * DISPLAY preferences of the chart canvas - NOT part of the v4 layout
 * contract (layouts capture arrangement + analysis stacks; a candle color
 * override is neither, and adding it there would ripple the shared schema
 * and the documented migration chain). They ride localStorage under the
 * SAME versioned/validated conventions as every other Oryon record, keyed
 * by STABLE panel id (per-chart isolation - Phase 7 discipline), and the
 * adapters below are the only files that know the storage key.
 *
 * Robustness contract (mirrors ui-prefs):
 *  - a corrupt envelope / wrong version / unavailable storage → the
 *    documented defaults, never a throw;
 *  - per-PANEL salvage: a poisoned panel record is dropped alone, the
 *    other panels' records survive;
 *  - colors are validated as CSS hex strings (theme-token overrides) -
 *    anything else falls back to the documented default (null = theme);
 *  - writes pass through the SAME schema (validate before save).
 */

const CHART_PREFS_KEY = "euforia.oryon.chart-prefs.v1";
const SAVE_DEBOUNCE_MS = 300;

/** Color override - null = follow the active theme token. Six-digit hex is
 *  the base form; the optional trailing pair carries the picker's opacity
 *  slider (#RRGGBBAA). The extension is ADDITIVE: every record persisted
 *  before the picker validates unchanged, so the envelope version stays 1. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/);

export const oryonChartAppearanceSchema = z.object({
  upColor: hexColor.nullable(),
  downColor: hexColor.nullable(),
  wicksVisible: z.boolean(),
  bordersVisible: z.boolean(),
  lastPriceVisible: z.boolean(),
  priceScaleVisible: z.boolean(),
  timeScaleVisible: z.boolean(),
  gridVisible: z.boolean(),
  crosshairMagnet: z.boolean(),
});

export const oryonStatusLinePrefsSchema = z.object({
  ohlc: z.boolean(),
  volume: z.boolean(),
  time: z.boolean(),
});

const panelPrefsSchema = z.object({
  appearance: oryonChartAppearanceSchema,
  statusLine: oryonStatusLinePrefsSchema,
});

export const oryonChartPrefsSchema = z.object({
  version: z.literal(1),
  panels: z.record(z.string().min(1).max(80), panelPrefsSchema),
});

export type OryonChartAppearance = z.infer<typeof oryonChartAppearanceSchema>;
export type OryonStatusLinePrefs = z.infer<typeof oryonStatusLinePrefsSchema>;

/** Per-panel chart preferences - appearance + legend (status line) display. */
export interface OryonPanelChartPrefs {
  appearance: OryonChartAppearance;
  statusLine: OryonStatusLinePrefs;
}

/** Documented defaults - everything follows the theme, everything visible. */
export const ORYON_PANEL_CHART_PREFS_DEFAULT: OryonPanelChartPrefs = {
  appearance: {
    upColor: null,
    downColor: null,
    wicksVisible: true,
    bordersVisible: true,
    lastPriceVisible: true,
    priceScaleVisible: true,
    timeScaleVisible: true,
    gridVisible: true,
    crosshairMagnet: false,
  },
  statusLine: {
    ohlc: true,
    volume: true,
    time: true,
  },
};

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false;
  }
}

function defaultPrefs(): OryonPanelChartPrefs {
  return {
    appearance: { ...ORYON_PANEL_CHART_PREFS_DEFAULT.appearance },
    statusLine: { ...ORYON_PANEL_CHART_PREFS_DEFAULT.statusLine },
  };
}

/** Per-panel salvage - the zod schema validates each panel record on load;
 *  a poisoned panel record falls back to the defaults, the rest survive. */

/** Loads the panel's persisted prefs. Never throws. */
export function loadPanelChartPrefs(panelId: string): OryonPanelChartPrefs {
  if (!isStorageAvailable()) return defaultPrefs();
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CHART_PREFS_KEY);
  } catch {
    return defaultPrefs();
  }
  if (raw === null || raw === "") return defaultPrefs();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] chart prefs: corrupt JSON dropped - defaults in use.");
    return defaultPrefs();
  }

  const envelope = oryonChartPrefsSchema.safeParse(parsed);
  if (!envelope.success) {
    console.warn("[oryon] chart prefs: invalid payload dropped - defaults in use.");
    return defaultPrefs();
  }
  const panel = envelope.data.panels[panelId];
  return panel !== undefined ? panel : defaultPrefs();
}

/** The full persisted map - read fresh at save time (no stale cache). */
function readEnvelope(): { version: 1; panels: Record<string, unknown> } {
  if (!isStorageAvailable()) return { version: 1, panels: {} };
  try {
    const raw = window.localStorage.getItem(CHART_PREFS_KEY);
    if (raw !== null && raw !== "") {
      const parsed: unknown = JSON.parse(raw);
      const check = oryonChartPrefsSchema.safeParse(parsed);
      if (check.success) {
        return { version: 1, panels: { ...check.data.panels } as Record<string, unknown> };
      }
    }
  } catch {
    // Fall through to an empty envelope.
  }
  return { version: 1, panels: {} };
}

function writePrefs(panelId: string, prefs: OryonPanelChartPrefs): void {
  try {
    const envelope = readEnvelope();
    const check = panelPrefsSchema.safeParse(prefs);
    if (!check.success) {
      console.warn("[oryon] chart prefs save skipped - payload invalid.");
      return;
    }
    envelope.panels[panelId] = check.data;
    window.localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded / storage evicted - the session keeps working in memory.
  }
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced per-panel save (300 ms). */
export function savePanelChartPrefs(panelId: string, prefs: OryonPanelChartPrefs): void {
  if (!isStorageAvailable()) return;
  const pending = saveTimers.get(panelId);
  if (pending !== undefined) clearTimeout(pending);
  saveTimers.set(
    panelId,
    setTimeout(() => {
      saveTimers.delete(panelId);
      writePrefs(panelId, prefs);
    }, SAVE_DEBOUNCE_MS),
  );
}

/** Flushes a pending panel write immediately (unmount safety). */
export function flushPanelChartPrefs(panelId: string, prefs: OryonPanelChartPrefs): void {
  if (!isStorageAvailable()) return;
  const pending = saveTimers.get(panelId);
  if (pending !== undefined) {
    clearTimeout(pending);
    saveTimers.delete(panelId);
  }
  writePrefs(panelId, prefs);
}
