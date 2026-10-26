#!/usr/bin/env python3
"""Rewire session-live-view.tsx to the Charty terminal (frontend refonte).

Targeted transformations, preserving every data hook / dialog unchanged:
1. Trim the import block (workspace-internal imports moved to charty/*).
2. Delete the old Workspace function + TIMEFRAMES (now charty-owned).
3. Root: full-width (no max-w) - header/journaling get max-w containers.
4. Replace <Workspace> with <ChartyWorkspace onSymbolChange=...>.
5. Remove the old market-selector row (symbol pill lives in the terminal).
"""
import pathlib
import re

p = pathlib.Path("apps/web/src/components/session/session-live-view.tsx")
s = p.read_text()

# ── 1. Import block ──────────────────────────────────────────────────────────
new_imports = '''"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, RefreshCcw, Stars } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DisciplineBanner } from "@/components/trades/discipline-banner";
import { ChartyWorkspace } from "@/components/charty/charty-workspace";
import { EventTimeline } from "@/components/session/event-timeline";
import { GhostSettlementNotifier } from "@/components/session/ghost-settlement-notifier";
import { GhostSettlements } from "@/components/session/ghost-settlements";
import { MoodStrip } from "@/components/session/mood-strip";
import { OpenTradeCard } from "@/components/session/open-trade-card";
import { PriceAlertToaster } from "@/components/session/price-alert-toaster";
import { RegretRegistry } from "@/components/session/regret-registry";
import {
  EndSessionDialog,
  SessionHistoryDrawer,
  SessionLiveHeader,
  StartSessionDialog,
} from "@/components/session/session-shell";
import { SessionLogbook } from "@/components/session/session-logbook";
import { SessionReplayDialog } from "@/components/session/session-replay";
import {
  useAlerts,
  useSavedAnalyses,
  useInstruments,
  useSessionLiveState,
  useSessionTimeline,
  useSkippedTrades,
  useStatsOverview,
  useStrategies,
  useTrades,
  useUpdateSessionLive,
} from "@/lib/api/queries";
import { useBrokerSession } from "@/lib/api/queries";
import { useLiveQuote, useFeedStatus, useLiveQuotes } from "@/lib/realtime/market";
import { useI18n } from "@/i18n/i18n-provider";
import type {
  BrokerPosition,
  MarketBias,
  SavedAnalysis,
  Trade,
  TradingSession,
} from "@cosmoz/shared";
import type { LiveQuote } from "@/lib/realtime/market";
import { loadMultiChart, persistMultiChart, type MultiChartState } from "@/components/session/chart-grid";
import { cn } from "@/lib/utils";
'''

start = s.index('"use client";')
anchor = 'import { cn } from "@/lib/utils";'
end = s.index(anchor) + len(anchor)
s = new_imports + s[end:]

# ── 2. Delete TIMEFRAMES + old Workspace (from the const to the section end) ─
start_marker = "const TIMEFRAMES: readonly MarketInterval[]"
start_idx = s.index(start_marker)
end_marker = "// ── Top-level view"
end_idx = s.index(end_marker)
s = s[:start_idx] + s[end_idx:]

# ── 3. Root container: full width; header/journaling get max-w containers ────
s = s.replace(
    '''    <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-6">
      <GhostSettlementNotifier ghosts={pendingGhosts} />
      {/* Live-feed level events (TP/SL touched) - toasts, invisible UI */}
      <PriceAlertToaster trades={trades} instruments={instruments} quotes={quotes} />

      <header className="space-y-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{S.view.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {S.view.subtitle}
        </p>
        <DisciplineBanner />
      </header>''',
    '''    <div className="space-y-4 sm:space-y-6">
      <GhostSettlementNotifier ghosts={pendingGhosts} />
      {/* Live-feed level events (TP/SL touched) - toasts, invisible UI */}
      <PriceAlertToaster trades={trades} instruments={instruments} quotes={quotes} />

      <header className="mx-auto w-full max-w-[1600px] space-y-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{S.view.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {S.view.subtitle}
        </p>
        <DisciplineBanner />
      </header>''',
)

# Skeleton / error states keep the standard container width.
s = s.replace(
    """      {isLoading ? (
        <SessionSkeleton />
      ) : isError ? (
        <ErrorSession onRetry={retry} />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {/* ── Lifecycle header ────────────────────────────────────── */}
          <SessionLiveHeader""",
    """      {isLoading ? (
        <div className="mx-auto w-full max-w-[1600px]">
          <SessionSkeleton />
        </div>
      ) : isError ? (
        <div className="mx-auto w-full max-w-[1600px]">
          <ErrorSession onRetry={retry} />
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {/* ── Lifecycle header ────────────────────────────────────── */}
          <div className="mx-auto w-full max-w-[1600px]">
          <SessionLiveHeader""",
)

# ── 4. Remove the market-selector row + replace Workspace with ChartyWorkspace
old_block = s[s.index("          {/* ── Market selector row"):s.index("          {/* ── Journaling flow")]
new_block = '''          {/* ── Charty terminal - full-width chart workspace ────────────── */}
          {symbol !== "" ? (
            <ChartyWorkspace
              key={symbol}
              symbol={symbol}
              instrument={instrument}
              quote={quote}
              onSymbolChange={setUserSymbol}
              symbolTrades={symbolTrades}
              openTrades={trades}
              brokerPositions={brokerPositionsOnSymbol}
              allBrokerPositions={brokerData?.positions ?? []}
              instruments={instruments}
              levels={levels}
              levelsLoading={levelsLoading}
              activeSession={activeSession}
              onBiasChange={onBiasChange}
              latestAnalysisNote={latestAnalysisNote}
              analyses={analyses}
              analysesLoading={analysesLoading}
              multi={multi}
              onMultiChange={setMulti}
            />
          ) : null}

'''
s = s.replace(old_block, new_block)

# Close the lifecycle-header wrapper div right before the journaling flow.
s = s.replace(
    '''            onOpenHistory={() => setHistoryOpen(true)}
          />

''',
    '''            onOpenHistory={() => setHistoryOpen(true)}
          />
          </div>

''',
)

p.write_text(s)
print("rewired OK")
