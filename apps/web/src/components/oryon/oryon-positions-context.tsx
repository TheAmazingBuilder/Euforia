"use client";

import * as React from "react";

import type { BrokerPosition } from "@cosmoz/shared";

import { usePrivatePositions } from "@/lib/realtime/market";
import {
  sanitizePositions,
} from "@/lib/oryon/positions/sanitize";

/**
 * Oryon positions context (Phase 4) - ONE subscription to the app-wide
 * private-positions stream (the same socket, auth lifecycle and snapshot
 * semantics as the price feed), validated at this boundary, plus the
 * panel↔chart selection state.
 *
 * Responsibility split (spec §5):
 *   - transport/freshness  → lib/realtime/market.ts (existing, untouched)
 *   - validation           → lib/oryon/positions/sanitize.ts (this layer)
 *   - presentation         → the lower panel (OryonPositionsPanel)
 *   - chart integration    → the overlay bridge leaf (engine imperative sync)
 *
 * Re-render discipline: the stream updates at the server's broadcast cadence
 * (~2 s). Consumers are the lower panel and the overlay bridge LEAF only -
 * the chart engine is updated imperatively, the workspace never re-renders
 * per position update. No duplicate subscription is ever created: the
 * underlying store is a module singleton (useSyncExternalStore).
 */

export interface OryonPositionsContextValue {
  /** Validated positions of the current book (invalid records dropped). */
  positions: BrokerPosition[];
  /** Wire source label - "sim" for the simulated book, "idle" before data. */
  source: "idle" | "sim";
  /** Transport alive AND at least one snapshot received (store semantics). */
  connected: boolean;
  /** Client epoch ms of the last applied snapshot (staleness input). */
  lastEventAt: number;
  /** Records rejected by validation since mount (honest observability). */
  dropped: number;
  /** Currently selected position id (panel ↔ overlay highlight), nullable. */
  selectedId: string | null;
  /** Select a position (null = clear). Pure UI state - never a trade action. */
  select: (positionId: string | null) => void;
}

const OryonPositionsContext = React.createContext<OryonPositionsContextValue | null>(null);

export function OryonPositionsProvider({ children }: { children: React.ReactNode }) {
  const stream = usePrivatePositions();

  // Validate every record at the boundary - one poisoned record must not
  // reach the table or the chart. Memoized on the stream identity: the store
  // freezes a new snapshot object per event, so this recomputes per event
  // (≤ handful of records, cents-cheap) and never per render.
  const sanitized = React.useMemo(() => {
    const report = sanitizePositions([...stream.positions.values()]);
    return report;
  }, [stream]);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const select = React.useCallback((positionId: string | null) => {
    setSelectedId(positionId);
  }, []);

  const value = React.useMemo<OryonPositionsContextValue>(
    () => ({
      positions: sanitized.positions,
      source: stream.source,
      connected: stream.connected,
      lastEventAt: stream.lastEventAt,
      dropped: sanitized.dropped,
      selectedId,
      select,
    }),
    [sanitized, stream.source, stream.connected, stream.lastEventAt, selectedId, select],
  );

  return <OryonPositionsContext.Provider value={value}>{children}</OryonPositionsContext.Provider>;
}

export function useOryonPositions(): OryonPositionsContextValue {
  const value = React.useContext(OryonPositionsContext);
  if (value === null) {
    throw new Error("useOryonPositions must be used within OryonPositionsProvider");
  }
  return value;
}

/**
 * Tolerant accessor for consumers rendered OUTSIDE the provider's guarantee
 * (defensive leaves): returns the context value or a neutral empty snapshot
 * instead of throwing. The overlay bridge uses the strict hook (it must
 * never silently render nothing); display leaves use this one.
 */
export function useOryonPositionsOptional(): OryonPositionsContextValue {
  return (
    React.useContext(OryonPositionsContext) ?? {
      positions: [],
      source: "idle",
      connected: false,
      lastEventAt: 0,
      dropped: 0,
      selectedId: null,
      select: () => {},
    }
  );
}
