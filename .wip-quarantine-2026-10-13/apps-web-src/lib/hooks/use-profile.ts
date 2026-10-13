"use client";

import { useSyncExternalStore } from "react";

/**
 * Profile store — the user's identity fields, persisted to localStorage.
 * Same contract as use-academy-progress: lazy one-time client read, frozen
 * server snapshot, subscribe/notify on save. The V1 mock has no user
 * mutations; this is the exact shape PATCH /profile will replace.
 */

export interface ProfileData {
  name: string;
  email: string;
  timezone: string;
  currency: string;
  intention: string;
}

export const DEFAULT_PROFILE: ProfileData = {
  name: "Alex Moreau",
  email: "alex@cosmoz.app",
  timezone: "America/Toronto",
  currency: "USD",
  intention:
    "Trade the playbook, protect the downside, and let the sample grow. One fix at a time.",
};

const STORAGE_KEY = "cosmoz:profile";

let cached: ProfileData = DEFAULT_PROFILE;
let initialized = false;
const listeners = new Set<() => void>();

function read(): ProfileData {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        cached = { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<ProfileData>) };
      }
    } catch {
      // Corrupted row → keep defaults.
    }
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Persist the profile and notify every mounted reader. */
export function saveProfile(next: ProfileData): void {
  cached = { ...next };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — keep the in-memory value for the session.
  }
  listeners.forEach((listener) => listener());
}

const SERVER_SNAPSHOT: ProfileData = Object.freeze({ ...DEFAULT_PROFILE });

export function useProfile(): ProfileData {
  return useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
}

/** Avatar initials from the full name ("Alex Moreau" → "AM"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
