"use client";

import { useSyncExternalStore } from "react";

/**
 * Usage tracker — how long the app stays open per calendar day, persisted to
 * localStorage (`cosmoz:usage:v1`). Client-owned by nature (the "server" has
 * no page-lifecycle), it feeds the Product band's "Usage time" cell.
 *
 * Same contract as use-profile: lazy one-time client read, frozen server
 * snapshot, subscribe/notify on every recorded minute. The ticker is a
 * module-level singleton started by <UsageTicker /> — one 60s interval for
 * the whole app, visibility-gated (a background tab records nothing).
 */

const STORAGE_KEY = "cosmoz:usage:v1";
/** Window retained on disk — older day keys are pruned on each write. */
const RETENTION_DAYS = 60;
/** Days surfaced in the usage sparkbars. */
const RECENT_WINDOW = 14;
const TICK_MS = 60_000;

export interface UsageSnapshot {
  /** Minutes recorded today (browser-local calendar day). */
  todayMinutes: number;
  /** Minutes recorded since the first day of the current month. */
  monthMinutes: number;
  /** Last 14 recorded days, oldest first — feeds the usage MiniBars. */
  recentDays: number[];
  /** True once a client snapshot has been read (server snapshot is empty). */
  ready: boolean;
}

const EMPTY: UsageSnapshot = { todayMinutes: 0, monthMinutes: 0, recentDays: [], ready: false };

interface UsageRecord {
  /** Calendar day key `YYYY-MM-DD` → recorded minutes. */
  [day: string]: number;
}

let cached: UsageSnapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

/** Local calendar day key — the tracker follows the BROWSER clock (it
 * measures wall-clock sessions, not trading days computed API-side). */
function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRecord(): UsageRecord {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UsageRecord) : {};
  } catch {
    return {};
  }
}

function writeRecord(record: UsageRecord): void {
  // Prune days older than the retention window.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffKey = localDayKey(cutoff);
  const pruned = Object.fromEntries(
    Object.entries(record).filter(([day]) => day >= cutoffKey),
  );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Storage unavailable (private mode) → in-memory snapshot still works.
  }
}

function computeSnapshot(record: UsageRecord): UsageSnapshot {
  const now = new Date();
  let todayMinutes = 0;
  let monthMinutes = 0;
  const recentDays: number[] = [];
  // Oldest → newest over the surfacing window; missing days record as 0 so
  // the bars stay honest about inactive days.
  for (let offset = RECENT_WINDOW - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    const key = localDayKey(day);
    const minutes = record[key] ?? 0;
    if (offset === 0) todayMinutes = minutes;
    if (key >= localMonthStartKey(now)) monthMinutes += minutes;
    recentDays.push(minutes);
  }
  return { todayMinutes, monthMinutes, recentDays, ready: true };
}

/** `YYYY-MM` key of the browser-local current month. */
function localMonthStartKey(date: Date): string {
  return localDayKey(date).slice(0, 7);
}

function refresh(): void {
  cached = computeSnapshot(readRecord());
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UsageSnapshot {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    cached = computeSnapshot(readRecord());
  }
  return cached;
}

function getServerSnapshot(): UsageSnapshot {
  return EMPTY;
}

/** Record one visibility-gated minute and notify mounted readers. */
function tick(): void {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  const record = readRecord();
  const day = localDayKey(new Date());
  record[day] = (record[day] ?? 0) + 1;
  writeRecord(record);
  refresh();
}

let started = false;

/** Idempotent — safe to call from any mounted component. */
export function startUsageTracking(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.setInterval(tick, TICK_MS);
}

/** Live usage snapshot — re-renders on every recorded minute. */
export function useUsageTracker(): UsageSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
