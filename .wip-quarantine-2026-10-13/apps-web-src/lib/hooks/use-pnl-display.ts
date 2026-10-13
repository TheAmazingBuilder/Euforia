"use client";

import type { PnlDisplay } from "@cosmoz/shared";

import { usePreferences } from "@/lib/api/queries";

/**
 * Reactive read of Settings → Appearance → "P&L display". Defaults to
 * CURRENCY while the preferences document loads (and on any error) so the
 * dashboard renders the canonical figure first and never breaks.
 */
export function usePnlDisplay(): PnlDisplay {
  const { data } = usePreferences();
  return data?.appearance.pnlDisplay ?? "CURRENCY";
}
