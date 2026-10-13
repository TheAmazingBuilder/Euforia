"use client";

import { useSyncExternalStore } from "react";

/**
 * Export history store — the record of JSON snapshots taken on this device
 * (Security → Backups). Same contract as use-academy-progress: lazy one-time
 * client read, cached client snapshot, frozen server snapshot, notify on
 * append so a fresh export updates the mounted history card instantly.
 */

export interface ExportHistoryRow {
  at: string;
  trades: number;
  strategies: number;
  tags: number;
  sizeKo: number;
}

const STORAGE_KEY = "cosmoz:export-history";
const MAX_ROWS = 20;

const EMPTY: ExportHistoryRow[] = [];

let cached: ExportHistoryRow[] | null = null;
const listeners = new Set<() => void>();

function read(): ExportHistoryRow[] {
  if (cached === null) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      cached = raw ? (JSON.parse(raw) as ExportHistoryRow[]) : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Append an export row (newest first) and notify mounted readers. */
export function recordExport(row: ExportHistoryRow): void {
  const rows = [row, ...read().slice(0, MAX_ROWS - 1)];
  cached = rows;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Storage unavailable — keep the in-memory history for the session.
  }
  listeners.forEach((listener) => listener());
}

/** useSyncExternalStore accessor — null on the server, rows on the client. */
export function useExportHistory(): ExportHistoryRow[] | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
