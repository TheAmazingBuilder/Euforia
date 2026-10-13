"use client";

import * as React from "react";

import { useAccounts } from "@/lib/api/queries";
import type { Account } from "@cosmoz/shared";

/**
 * Selected account — the multi-portfolio "active desk".
 *
 * The raw id lives in a tiny external store (useSyncExternalStore idiom,
 * same family as use-trade-modal) persisted to localStorage, so the choice
 * survives reloads and every consumer (switcher, trade form, CSV import,
 * trades table) reads the same value without a provider tree.
 *
 * Resolution: stored id if still valid, else the default account, else the
 * first account — decided at render time from the accounts query.
 */

const STORAGE_KEY = "cosmoz.selected-account.v1";

let storedId: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    storedId = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    storedId = null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Raw stored id (null = follow the default account). */
export function getSelectedAccountId(): string | null {
  readStorage();
  return storedId;
}

/** Persist the active account (null resets to the default account). */
export function setSelectedAccountId(accountId: string | null): void {
  readStorage();
  if (storedId === accountId) return;
  storedId = accountId;
  try {
    if (typeof window !== "undefined") {
      if (accountId === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, accountId);
    }
  } catch {
    // storage unavailable (private mode) — session-only selection
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding for the raw stored id. Server snapshot is always null. */
export function useSelectedAccountId(): string | null {
  return React.useSyncExternalStore(subscribe, getSelectedAccountId, () => null);
}

export interface SelectedAccount {
  /** Resolved active account (null while the catalog loads / when empty). */
  account: Account | null;
  accounts: Account[];
  isLoading: boolean;
  /** Switch the active desk (pass null to follow the default account). */
  select: (accountId: string | null) => void;
}

/**
 * Resolved active account: stored id when still valid, else the default
 * account, else the first one. Consumers never persist a dangling id.
 */
export function useSelectedAccount(): SelectedAccount {
  const storedId = useSelectedAccountId();
  const { data, isLoading } = useAccounts();
  const accounts = React.useMemo(() => data?.accounts ?? [], [data]);

  const account = React.useMemo(() => {
    if (accounts.length === 0) return null;
    return (
      accounts.find((item) => item.id === storedId) ??
      accounts.find((item) => item.isDefault) ??
      accounts[0] ??
      null
    );
  }, [accounts, storedId]);

  const select = React.useCallback((accountId: string | null) => {
    setSelectedAccountId(accountId);
  }, []);

  return { account, accounts, isLoading, select };
}
