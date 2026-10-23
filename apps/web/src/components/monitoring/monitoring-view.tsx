"use client";

import * as React from "react";
import { toast } from "sonner";
import { Globe, HeartPulse } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  AlertRule,
  FreshnessThresholds,
  MarketFeedStatus,
  MonitoringStatus,
  WebsocketStatus,
} from "@cosmoz/shared";
import { COSMOZ_VERSION, classifyFreshness } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  useMonitoringOverview,
  useRunMonitoringJob,
  useUpdateMonitoringThresholds,
} from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { getMarketTelemetry, useLiveQuotes } from "@/lib/realtime/market";
import { useMarketServiceHealth } from "@/lib/realtime/market-health";
import { PublicStatusDialog } from "@/components/monitoring/public-status-dialog";
import {
  BrokersPanel,
  OverviewPanel,
  SystemHealthPanel,
  MarketDataPanel,
  WebsocketsPanel,
} from "./monitoring-panels";
import {
  ApiPanel,
  DatabasePanel,
  EventsPanel,
  IntegrationsHealthPanel,
  JobsPanel,
  NotificationsPanel,
} from "./monitoring-panels-data";
import { NowClockContext, StatusBadge } from "./monitoring-primitives";

/**
 * /monitoring — the professional observability center (MASTER PROMPT §3):
 * Overview · System Health · Market Data · Broker Connections · WebSockets ·
 * API · Database · Queues & Jobs · Notifications · Integrations ·
 * Audit / System Events. The active tab persists in the URL (?tab=).
 *
 * Two telemetry planes merge here:
 * - the ENGINE plane (mocks): API traffic observed by the fetch wrapper,
 *   job ledger, alert store, Integration Hub state — one aggregate query;
 * - the CLIENT plane (this browser): the live quote feed and its socket
 *   connection, which only the browser can observe — computed below from
 *   lib/realtime/market.ts and merged into the Overview status board.
 * Nothing displays a status that no plane actually observed (§4, §21).
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "System Health" },
  { id: "market-data", label: "Market Data" },
  { id: "brokers", label: "Brokers" },
  { id: "websockets", label: "WebSockets" },
  { id: "api", label: "API" },
  { id: "database", label: "Database" },
  { id: "jobs", label: "Queues & Jobs" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "events", label: "Audit / Events" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function freshnessToStatus(freshness: ReturnType<typeof classifyFreshness>, phase: string): MonitoringStatus {
  if (freshness === "STALE") return phase === "offline" ? "DOWN" : "DEGRADED";
  if (freshness === "DELAYED") return "OPERATIONAL";
  if (freshness === "LIVE") return "OPERATIONAL";
  return phase === "offline" ? "DOWN" : "UNKNOWN";
}

export function MonitoringView() {
  const { data, isLoading, isError, error } = useMonitoringOverview();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TABS.some((tab) => tab.id === rawTab) ? rawTab : "overview") as TabId;

  const setTab = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  // ── Client-observed plane (quote feed + socket) ───────────────────────────
  const nowMs = useNowMs(1_000);
  const snapshot = useLiveQuotes();
  const healthQuery = useMarketServiceHealth();
  const fallbackThresholds = React.useMemo<FreshnessThresholds>(
    () => ({ liveMaxMs: 2_000, delayedMaxMs: 10_000 }),
    [],
  );
  const thresholds: FreshnessThresholds = data?.thresholds.freshness ?? fallbackThresholds;

  const marketFeed: MarketFeedStatus = React.useMemo(() => {
    const quotes = [...snapshot.quotes.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return {
      phase: snapshot.phase === "connecting" && quotes.length === 0 ? "connecting" : snapshot.phase,
      transport: snapshot.transport,
      symbols: quotes.map((quote) => {
        const ageMs = quote.ts > 0 && nowMs !== null ? nowMs - quote.ts : null;
        return {
          symbol: quote.symbol,
          price: quote.price,
          source: quote.source,
          lastTickAt: quote.ts > 0 ? new Date(quote.ts).toISOString() : null,
          ageMs,
          freshness: classifyFreshness(ageMs, thresholds),
        };
      }),
      thresholds,
      observedAt: new Date(nowMs ?? 0).toISOString(),
    };
  }, [snapshot, nowMs, thresholds]);

  const wsStatus: WebsocketStatus = React.useMemo(() => {
    const telemetry = getMarketTelemetry();
    return {
      connected: snapshot.connected,
      phase: snapshot.phase,
      transport: snapshot.transport,
      reconnectAttempts: telemetry.reconnectAttempts,
      droppedConnections: telemetry.droppedConnections,
      lastMessageAgeMs: telemetry.lastMessageAt !== null && nowMs !== null
        ? nowMs - telemetry.lastMessageAt
        : null,
      lastPollRttMs: telemetry.lastPollRttMs,
      subscriptions: snapshot.quotes.size,
    };
  }, [snapshot, nowMs]);

  // Client-plane statuses merged into the Overview board (§4 evidence).
  const worstFreshness = marketFeed.symbols.reduce<string>(
    (worst, symbol) => {
      const rank: Record<string, number> = { LIVE: 0, DELAYED: 1, STALE: 2, UNKNOWN: -1 };
      return (rank[symbol.freshness] ?? -1) > (rank[worst] ?? -1) ? symbol.freshness : worst;
    },
    "UNKNOWN",
  );
  const marketStatus: { status: MonitoringStatus; evidence: string } = React.useMemo(() => {
    if (marketFeed.symbols.length === 0) {
      return {
        status: marketFeed.phase === "offline" ? "DOWN" : "UNKNOWN",
        evidence: `Feed phase "${marketFeed.phase}" via ${marketFeed.transport} - no tick observed yet in this session.`,
      };
    }
    const status = freshnessToStatus(worstFreshness as never, marketFeed.phase);
    const counts = marketFeed.symbols.reduce<Record<string, number>>((acc, symbol) => {
      acc[symbol.freshness] = (acc[symbol.freshness] ?? 0) + 1;
      return acc;
    }, {});
    return {
      status,
      evidence: `${marketFeed.symbols.length} symbol(s) via ${marketFeed.transport} - ${Object.entries(counts)
        .map(([key, count]) => `${count} ${key}`)
        .join(", ")}.`,
    };
  }, [marketFeed, worstFreshness]);

  const wsPanelStatus: { status: MonitoringStatus; evidence: string } = React.useMemo(() => {
    if (wsStatus.connected === true) {
      return {
        status: "OPERATIONAL",
        evidence: `Stream ${wsStatus.phase} over ${wsStatus.transport} - last message ${wsStatus.lastMessageAgeMs === null ? "-" : `${Math.round(wsStatus.lastMessageAgeMs / 1_000)} s ago`}, ${wsStatus.reconnectAttempts} reconnect attempt(s).`,
      };
    }
    if (wsStatus.droppedConnections > 0 || wsStatus.reconnectAttempts > 0) {
      return { status: "DEGRADED", evidence: `Stream ${wsStatus.phase} - ${wsStatus.reconnectAttempts} reconnect attempt(s) after ${wsStatus.droppedConnections} drop(s), polling fallback active.` };
    }
    return {
      status: wsStatus.phase === "offline" ? "DOWN" : "UNKNOWN",
      evidence: `Stream phase "${wsStatus.phase}" via ${wsStatus.transport} - no connection observed yet.`,
    };
  }, [wsStatus]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateThresholds = useUpdateMonitoringThresholds();
  const runJob = useRunMonitoringJob();
  const [runningJobId, setRunningJobId] = React.useState<string | null>(null);
  const [statusPageOpen, setStatusPageOpen] = React.useState(false);

  const onToggleRule = (rule: AlertRule, enabled: boolean) => {
    updateThresholds.mutate(
      { rules: [{ id: rule.id, enabled }] },
      {
        onSuccess: () =>
          toast.success(`${rule.id} ${enabled ? "enabled" : "disabled"} - evaluated on every overview read`),
        onError: (mutationError) => toast.error(apiErrorMessage(mutationError, "Could not update the rule")),
      },
    );
  };

  // Custom numeric knob (p95 ms, error-rate %, backlog…) — applied in one PATCH.
  const onThresholdChange = (rule: AlertRule, value: number) => {
    updateThresholds.mutate(
      { rules: [{ id: rule.id, thresholdValue: value }] },
      {
        onSuccess: () => toast.success(`${rule.id} threshold set to ${value} - live from the next read`),
        onError: (mutationError) => toast.error(apiErrorMessage(mutationError, "Could not update the threshold")),
      },
    );
  };

  const onRunJob = (jobId: string) => {
    setRunningJobId(jobId);
    runJob.mutate(jobId, {
      onSuccess: (result) => {
        if (result.accepted) toast.success(result.message);
        else toast.info(result.message);
      },
      onError: (mutationError) => {
        // The real API answers 409 {accepted:false, message} on purpose —
        // manual runs are observational-only (Phase 17). A refusal is an
        // expected outcome, not an error: surface the server's message.
        if (mutationError instanceof ApiError && mutationError.status === 409) {
          const body = mutationError.body as { message?: unknown } | null;
          const message =
            body !== null && typeof body === "object" && typeof body.message === "string" && body.message !== ""
              ? body.message
              : "This job cannot be run manually - it is evaluated automatically.";
          toast.info(message);
        } else {
          toast.error(apiErrorMessage(mutationError, "Could not run the job"));
        }
      },
      onSettled: () => setRunningJobId(null),
    });
  };

  const clock = React.useMemo(
    () =>
      nowMs === null
        ? "--:--:--"
        : new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "UTC",
          }).format(nowMs),
    [nowMs],
  );

  if (isLoading || data === undefined) {
    if (isError) {
      return (
        <div className="mx-auto w-full max-w-5xl">
          <div className="rounded-xl border border-destructive/40 bg-surface p-6 text-sm">
            Monitoring data could not be loaded: {apiErrorMessage(error, "unknown error")}
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <NowClockContext.Provider value={nowMs}>
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          Monitoring
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The observability center for the platform and its trading infrastructure -
          statuses here are computed from observed telemetry, never declared.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.overview.overall} testId="monitoring-overall-status" />
        <span className="text-xs text-muted-foreground" data-testid="monitoring-overall-evidence">
          {data.overview.overallEvidence}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
          <HeartPulse className="size-3.5" aria-hidden="true" />
          UTC {clock} · v{COSMOZ_VERSION}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setStatusPageOpen(true)}
          data-testid="public-status-open"
        >
          <Globe className="size-3.5" aria-hidden="true" />
          Public status page (demo)
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Monitoring sections"
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
        data-testid="monitoring-tablist"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`monitoring-tab-${tab.id}`}
              onClick={() => setTab(tab.id)}
              className={cn(
                "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                active
                  ? "border-b-2 border-accent text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <OverviewPanel data={data} marketStatus={marketStatus} wsStatus={wsPanelStatus} goTo={setTab} />
      )}
      {activeTab === "health" && <SystemHealthPanel data={data} />}
      {activeTab === "market-data" && (
        <MarketDataPanel
          feed={marketFeed}
          providerHealth={healthQuery.data ?? null}
        />
      )}
      {activeTab === "brokers" && <BrokersPanel brokers={data.brokers} />}
      {activeTab === "websockets" && <WebsocketsPanel ws={wsStatus} thresholds={thresholds} />}
      {activeTab === "api" && <ApiPanel api={data.api} />}
      {activeTab === "database" && <DatabasePanel db={data.database} />}
      {activeTab === "jobs" && (
        <JobsPanel jobs={data.jobs} onRun={onRunJob} runningJobId={runningJobId} />
      )}
      {activeTab === "notifications" && <NotificationsPanel notifications={data.notifications} />}
      {activeTab === "integrations" && <IntegrationsHealthPanel integrations={data.integrations} />}
      {activeTab === "events" && (
        <EventsPanel
          data={data}
          onToggleRule={onToggleRule}
          onThresholdChange={onThresholdChange}
          toggling={updateThresholds.isPending}
        />
      )}

      <PublicStatusDialog open={statusPageOpen} onOpenChange={setStatusPageOpen} data={data} nowMs={nowMs} />
    </div>
    </NowClockContext.Provider>
  );
}

/** Tiny local block — avoids importing Card for one error surface. */
