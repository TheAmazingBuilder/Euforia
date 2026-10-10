import {
  oryonIndicatorsFileSchema,
  type OryonIndicatorInstance,
} from "@cosmoz/shared";

import { defaultIndicatorInstance } from "./registry";
import { indicatorRuleError } from "./validation";

/**
 * Oryon indicator persistence — local storage adapter (Phase 3 spec §11).
 *
 * Scope decision (documented in the delivery report):
 *  - indicators persist at the CHART level under the versioned key
 *    `euforia.oryon.indicators.v1` — a chart setup, not per-symbol
 *    annotation. They survive route navigation, reloads, instrument and
 *    timeframe switches and are recomputed from the candles displayed.
 *  - LOCAL ONLY: no backend endpoint is invented, no cross-device or
 *    account synchronization is claimed.
 *  - every load goes through Zod safeParse; corrupt/invalid payloads are
 *    dropped with a console warning and replaced by the PRD default
 *    template (RF-05: volume + RSI 14) — never rendered as-is.
 *  - rule-violating instances (MACD fast ≥ slow, RSI lower ≥ upper) are
 *    dropped INDIVIDUALLY so one bad record cannot nuke a valid stack.
 *  - the FIRST-visit state (key absent) is exactly the PRD default
 *    template; an explicitly EMPTY stored stack (user removed everything)
 *    is respected and never reseeded.
 */

const KEY = "euforia.oryon.indicators.v1";
const SAVE_DEBOUNCE_MS = 300;

/** PRD RF-05 / UC-1 — the default template on first visit. */
export function defaultIndicatorTemplate(): OryonIndicatorInstance[] {
  return [defaultIndicatorInstance("volume"), defaultIndicatorInstance("rsi")];
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false; // Privacy mode / disabled storage — features degrade safely.
  }
}

export interface LoadedIndicators {
  indicators: OryonIndicatorInstance[];
  /** True when the store was seeded (first visit / corrupt payload). */
  seeded: boolean;
}

/** Loads + validates the persisted stack. Never throws. */
export function loadIndicators(): LoadedIndicators {
  const fallback = (): LoadedIndicators => ({
    indicators: defaultIndicatorTemplate(),
    seeded: true,
  });

  if (!isStorageAvailable()) return fallback();

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return fallback();
  }
  if (raw === null || raw === "") return fallback();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] indicators: corrupt JSON dropped — default template restored.");
    return fallback();
  }

  const file = oryonIndicatorsFileSchema.safeParse(parsed);
  if (!file.success) {
    console.warn("[oryon] indicators: invalid payload dropped — default template restored.");
    return fallback();
  }

  const valid: OryonIndicatorInstance[] = [];
  for (const instance of file.data.indicators) {
    if (indicatorRuleError(instance) !== null) {
      console.warn(
        `[oryon] indicators: instance "${instance.id}" (${instance.type}) violates business rules — dropped.`,
      );
      continue;
    }
    valid.push(instance);
  }
  return { indicators: valid, seeded: false };
}

const pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

/**
 * Debounced save (300 ms) — a burst of mutations lands as one write. The
 * payload passes through the SAME schema that validates the load; failures
 * are swallowed: persistence must never break the interactive session.
 */
export function saveIndicators(indicators: readonly OryonIndicatorInstance[]): void {
  if (!isStorageAvailable()) return;
  const pending = pendingTimers.get(KEY);
  if (pending !== undefined) clearTimeout(pending);

  const timer = setTimeout(() => {
    pendingTimers.delete(KEY);
    writeIndicators(indicators);
  }, SAVE_DEBOUNCE_MS);
  pendingTimers.set(KEY, timer);
}

/** Flushes a pending save immediately (unmount safety). */
export function flushIndicators(indicators: readonly OryonIndicatorInstance[]): void {
  if (!isStorageAvailable()) return;
  const pending = pendingTimers.get(KEY);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingTimers.delete(KEY);
  }
  writeIndicators(indicators);
}

function writeIndicators(indicators: readonly OryonIndicatorInstance[]): void {
  try {
    // An EXPLICITLY EMPTY stack is written as an empty file (never as an
    // absent key): "the user removed every indicator" must stay distinct
    // from "first visit" — the seed only fires for the latter.
    const file = {
      version: 1 as const,
      savedAt: Date.now(),
      indicators: [...indicators],
    };
    const check = oryonIndicatorsFileSchema.safeParse(file);
    if (!check.success) {
      console.warn("[oryon] indicators save skipped — payload invalid.");
      return;
    }
    window.localStorage.setItem(KEY, JSON.stringify(check.data));
  } catch {
    // Quota exceeded / storage evicted — the session keeps working in memory.
  }
}
