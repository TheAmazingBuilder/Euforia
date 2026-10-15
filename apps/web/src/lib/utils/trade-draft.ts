"use client";

import type { Direction, Emotion, ExitReason } from "@cosmoz/shared";

/**
 * Capture-form draft persistence (trade-entry-ux.md §11): permanent
 * autosave to localStorage, restored on reopen, cleared after a successful
 * submit. A crash must never cost a capture.
 * Only SERIALIZABLE fields live here — screenshots stay in component state.
 */

const DRAFT_KEY = "cosmoz.trade-draft.v1";

export type TradeSizeModeValue = "risk_percent" | "quantity";

/** Serializable snapshot of the form. Raw input strings, unvalidated. */
export interface TradeDraftValues {
  variant: "open" | "closed";
  instrumentId: string | null;
  direction: Direction;
  entryPrice: string;
  exitPrice: string;
  /** datetime-local strings (local widget format). */
  entryAtLocal: string;
  exitAtLocal: string;
  exitReason: ExitReason;
  sizeMode: TradeSizeModeValue;
  riskPercent: string;
  quantity: string;
  strategyId: string | null;
  outOfPlaybook: boolean;
  initialStop: string;
  initialTP: string;
  reason: string;
  fees: string;
  emotionBefore: Emotion | null;
  /** 1–5 pre-trade conviction (psychology column; null = not rated). */
  confidence: number | null;
  tagIds: string[];
  notes: string;
}

export interface TradeDraft {
  version: 1;
  savedAt: string;
  values: TradeDraftValues;
}

export function saveTradeDraft(values: TradeDraftValues): void {
  try {
    const draft: TradeDraft = {
      version: 1,
      savedAt: new Date().toISOString(),
      values,
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage full / unavailable — the draft is best-effort by design.
  }
}

export function loadTradeDraft(): TradeDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("values" in parsed) ||
      typeof (parsed as { values: unknown }).values !== "object"
    ) {
      return null;
    }
    return parsed as TradeDraft;
  } catch {
    return null;
  }
}

export function clearTradeDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore — nothing we can do without storage.
  }
}
