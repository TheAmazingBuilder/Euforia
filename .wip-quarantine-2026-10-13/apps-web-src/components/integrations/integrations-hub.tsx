"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { IntegrationCategory, IntegrationEvent, IntegrationView } from "@cosmoz/shared";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HubActionsProvider,
  StatusPill,
  formatRelative,
  formatTime,
  isStale,
  useHubActions,
  type HubActions,
} from "@/components/integrations/hub-bits";
import { ProviderRow, ProviderRowDetailed, RuledRows } from "@/components/integrations/provider-row";
import { ProviderDialogs, type ProviderDialogState } from "@/components/integrations/provider-dialogs";
import { NewsTape } from "@/components/integrations/news-tape";
import { WebhookConsole } from "@/components/integrations/webhook-console";
import { NotificationsPanel } from "@/components/integrations/notifications-panel";
import { useWebhookConsole } from "@/lib/api/queries/integrations";
import {
  useIntegrationNews,
  useIntegrations,
  useNotificationChannels,
  useSyncIntegration,
} from "@/lib/api/queries/integrations";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Integration Hub (t49) — the platform layer between the journal and the
 * outside world. Overview is the health surface (§5/§23); category tabs keep
 * Trading Accounts, Brokers, Exchanges, Market Data, Economic Data, News,
 * TradingView, Notifications, Webhooks and External Services conceptually
 * separate (§3/§4). The journal domain stays provider-agnostic (§25).
 */

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// ── Small building blocks ────────────────────────────────────────────────────

/** §20/§22 pipeline — mono steps over a ruled band. */
function FlowStrip({ steps, label }: { steps: string[]; label: string }) {
  return (
    <div className="space-y-1.5" aria-label={label}>
      <p className="ledger-label text-[10px]">{label}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border px-3 py-2.5">
        {steps.map((step, index) => (
          <React.Fragment key={step}>
            {index > 0 ? (
              <ArrowRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            ) : null}
            <span
              className={cn(
                "font-mono text-[11px]",
                index === 0 || index === steps.length - 1
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function LinkOut({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/** §11 — the boundary that keeps charts honest. */
function SourceOfTruthPanel() {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
      <div className="space-y-2 bg-surface px-4 py-3.5">
        <p className="ledger-label text-[10px]">TradingView is — visualization only</p>
        <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <li>· Chart embed &amp; symbol search</li>
          <li>· Market display, theme-synced</li>
          <li>· No storage, no credentials</li>
        </ul>
      </div>
      <div className="space-y-2 bg-surface px-4 py-3.5">
        <p className="ledger-label text-[10px]">Source of truth stays — broker adapter</p>
        <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <li>· Positions &amp; executions — broker only</li>
          <li>· Account state — normalized adapter</li>
          <li>· Charts can never edit them</li>
        </ul>
      </div>
    </div>
  );
}

/** §9 — the normalized economic event contract, as a ruled field strip. */
function EcoEventContract() {
  const fields = [
    "Date",
    "Time",
    "Country",
    "Currency",
    "Event name",
    "Previous",
    "Forecast",
    "Actual",
    "Impact",
    "Status",
  ];
  return (
    <div className="space-y-1.5">
      <p className="ledger-label text-[10px]">Normalized event contract</p>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <span
            key={field}
            className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground/90"
          >
            {field}
          </span>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        Scheduled releases, live updates and actuals are idempotent on provider event IDs (§14) —
        no duplicated calendar rows.
      </p>
    </div>
  );
}

// ── Tab bodies ───────────────────────────────────────────────────────────────

function byCategory(views: IntegrationView[], categories: IntegrationCategory[]): IntegrationView[] {
  return views.filter((view) => categories.includes(view.provider.category));
}

function TradingAccountsTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  const brokers = byCategory(views, ["TRADING_ACCOUNT", "BROKER"]);
  const exchanges = byCategory(views, ["EXCHANGE"]);
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Trading-account integrations are the source of truth for positions, orders, executions,
        balance and equity. Every adapter is read-only — Session Live V1 can never place or modify
        an order (§19). Provider-specific metadata is preserved by the adapters; the journal
        domain stays provider-agnostic (§7).
      </p>
      <RuledRows label="Broker adapters" testId="hub-brokers">
        {brokers.map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
      {exchanges.length > 0 ? (
        <RuledRows label="Exchanges" testId="hub-exchanges">
          {exchanges.map((view) => (
            <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
          ))}
        </RuledRows>
      ) : null}
      <FlowStrip
        label="Session Live feed (§20)"
        steps={["Broker", "Integration layer", "Normalized data", "Backend", "WebSocket", "Session Live"]}
      />
      <LinkOut href="/session">Open Session Live</LinkOut>
    </div>
  );
}

function MarketDataTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Market data is provisioned independently from brokers (§8): prices, candles, ticks,
        volume and session information. Providers do not all expose identical data — every gap
        renders as an honest blank, never a guess.
      </p>
      <RuledRows testId="hub-market-data">
        {byCategory(views, ["MARKET_DATA"]).map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
      <LinkOut href="/session">See the live chart powered by the feed</LinkOut>
    </div>
  );
}

function EconomicDataTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        The economic-calendar integration is a dedicated economic-data layer (§9) — separate from
        market news and from brokers. Real provider events (previous / forecast / actual /
        impact) feed the Calendar screen; the calendar never depends on hardcoded fake events.
      </p>
      <RuledRows testId="hub-economic">
        {byCategory(views, ["ECONOMIC_DATA"]).map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs}>
            <EcoEventContract />
          </ProviderRowDetailed>
        ))}
      </RuledRows>
      <FlowStrip
        label="Calendar pipeline (§22)"
        steps={["Provider", "Integration", "Normalization", "Database", "Calendar", "Analytics"]}
      />
      <LinkOut href="/calendar">Open the economic calendar</LinkOut>
    </div>
  );
}

function NewsTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  const { data: news, isPending, isError } = useIntegrationNews();
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Market news is kept strictly separate from the economic calendar (§10). Headlines carry
        source, category, related symbols and importance; storage respects the provider&apos;s
        licensing terms (§29).
      </p>
      <RuledRows testId="hub-news-provider">
        {byCategory(views, ["MARKET_NEWS"]).map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
      {isError ? (
        <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
          The news tape could not be loaded.
        </p>
      ) : isPending || !news ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <NewsTape news={news} />
      )}
    </div>
  );
}

function TradingViewTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        TradingView is integrated for visualization and market display only (§11). It is never
        the source of truth for broker positions — that role belongs to the read-only broker
        adapters alone.
      </p>
      <RuledRows testId="hub-tradingview">
        {byCategory(views, ["CHARTING"]).map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
      <SourceOfTruthPanel />
      <LinkOut href="/session">Open Session Live charts</LinkOut>
    </div>
  );
}

function NotificationsTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  const { data: notifications, isPending, isError } = useNotificationChannels();
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        The notification relay routes discipline alerts, ghost check-ins and economic reminders
        to relay-owned channels — email and generic webhook push. It only sends; it never reads
        journal content. Messaging platforms (Telegram, Discord, Slack) live in the Communication
        tab as first-class providers with their own credentials and health.
      </p>
      <RuledRows testId="hub-notifications-provider">
        {byCategory(views, ["NOTIFICATIONS"]).map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
      {isError ? (
        <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
          Notification channels could not be loaded.
        </p>
      ) : isPending || !notifications ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <NotificationsPanel notifications={notifications} />
      )}
    </div>
  );
}

/** Normalized alert contract — every communication provider renders the same payload. */
function AlertContract() {
  const fields = [
    "Event",
    "Symbol",
    "Direction",
    "Size",
    "Entry",
    "Stop",
    "Outcome",
    "R multiple",
    "Discipline flag",
  ];
  return (
    <div className="space-y-1.5">
      <p className="ledger-label text-[10px]">Normalized alert payload</p>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <span
            key={field}
            className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground/90"
          >
            {field}
          </span>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        Each platform adapter renders the same payload — Telegram markdown, Discord embeds, Slack
        Block Kit. Deliveries are idempotent on event IDs: a retried fan-out never posts twice,
        and a broken target surfaces as ERROR on its provider row — never silently dropped.
      </p>
    </div>
  );
}

function CommunicationTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Messaging platforms are first-class communication providers: bring your own bot token or
        webhook URL, get trade alerts, daily summaries and discipline warnings where you actually
        read them. The platform layer only SENDS — it can never read journal data, credentials are
        stored encrypted and never echoed, and disconnecting never deletes history (§18/§26).
      </p>
      <RuledRows testId="hub-communication">
        {byCategory(views, ["COMMUNICATION"]).map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs}>
            <AlertContract />
          </ProviderRowDetailed>
        ))}
      </RuledRows>
      <FlowStrip
        label="Alert fan-out pipeline"
        steps={["Journal event", "Relay fan-out", "Template render", "Platform adapter", "Telegram · Discord · Slack"]}
      />
    </div>
  );
}

function WebhooksTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  const { data: webhooks, isPending, isError } = useWebhookConsole();
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Inbound webhooks are authenticated (HMAC-SHA256), timestamp-checked, replay-protected and
        idempotent on event IDs (§12/§14). The console signs payloads server-side — the raw
        secret never leaves the backend (§18) — so you can prove to yourself what gets accepted
        and what gets rejected.
      </p>
      <RuledRows testId="hub-webhooks-provider">
        {byCategory(views, ["EXTERNAL_SERVICE"])
          .filter((view) => view.provider.id === "inbound-webhooks")
          .map((view) => (
            <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
          ))}
      </RuledRows>
      {isError ? (
        <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
          The webhook console could not be loaded.
        </p>
      ) : isPending || !webhooks ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <WebhookConsole webhooks={webhooks} />
      )}
    </div>
  );
}

function ExternalServicesTab({ views, nowMs }: { views: IntegrationView[]; nowMs: number }) {
  const services = byCategory(views, ["EXTERNAL_SERVICE"]).filter(
    (view) => view.provider.id !== "inbound-webhooks",
  );
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        External services extend the journal without touching it: backups, exports and outbound
        events. Disconnecting never deletes historical data (§26), and expired tokens surface as
        authentication-required instead of failing silently.
      </p>
      <RuledRows testId="hub-external">
        {services.map((view) => (
          <ProviderRowDetailed key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewStatBand({ counts }: { counts: IntegrationView[] }) {
  const tally = {
    connected: 0,
    syncing: 0,
    degraded: 0,
    disconnected: 0,
    authRequired: 0,
    error: 0,
  };
  for (const view of counts) {
    switch (view.state.status) {
      case "CONNECTED": tally.connected += 1; break;
      case "SYNCING": tally.syncing += 1; break;
      case "DEGRADED": tally.degraded += 1; break;
      case "AUTH_REQUIRED": tally.authRequired += 1; break;
      case "ERROR": tally.error += 1; break;
      default: tally.disconnected += 1;
    }
  }
  const cells = [
    { label: "Connected", value: tally.connected, className: "text-profit" },
    { label: "Syncing", value: tally.syncing, className: "text-accent" },
    { label: "Degraded", value: tally.degraded, className: "text-warning" },
    { label: "Auth required", value: tally.authRequired, className: "text-warning" },
    { label: "Error", value: tally.error, className: "text-loss" },
    { label: "Disconnected", value: tally.disconnected, className: "text-muted-foreground" },
  ];
  return (
    <div className="stat-strip" data-testid="hub-stat-strip">
      {cells.map((cell) => (
        <div key={cell.label} className="stat-cell">
          <p className="ledger-label text-[10px]">{cell.label}</p>
          <p className={cn("mt-1 font-heading text-xl font-semibold tabular-nums", cell.className)}>
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function NeedsAttention({
  views,
  nowMs,
}: {
  views: IntegrationView[];
  nowMs: number;
}) {
  const actions = useHubActions();
  const flagged = views.filter(
    (view) =>
      view.state.status === "DEGRADED" ||
      view.state.status === "AUTH_REQUIRED" ||
      view.state.status === "ERROR" ||
      isStale(view.state, nowMs),
  );
  return (
    <section aria-label="Needs attention" className="space-y-2">
      <p className="ledger-label">Needs attention</p>
      {flagged.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted-foreground" data-testid="hub-attention-empty">
          All integrations healthy — no degraded, expired or failing providers.
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="hub-attention-list">
          {flagged.map((view) => {
            const stale = isStale(view.state, nowMs);
            return (
              <div key={view.provider.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      status={view.state.status}
                      testId={`hub-attention-status-${view.provider.id}`}
                    />
                    <p className="font-heading text-sm font-semibold text-foreground">
                      {view.provider.name}
                    </p>
                    {stale && view.state.status === "CONNECTED" ? (
                      <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warning">
                        STALE
                      </span>
                    ) : null}
                  </div>
                  <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {view.state.health.lastErrorMessage ??
                      (stale
                        ? `No successful sync in the expected window (last ${formatRelative(view.state.sync.lastSuccessAt, nowMs)}).`
                        : "Operational with warnings.")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {view.state.status === "AUTH_REQUIRED" ? (
                    <Button size="sm" onClick={() => actions.openConnect(view)}>
                      Reauthorize
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => actions.syncNow(view)}>
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                      Retry sync
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => actions.openTest(view)}>
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    Test
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ActivityLog({ events }: { events: IntegrationEvent[] }) {
  return (
    <section aria-label="Activity log" className="space-y-2">
      <p className="ledger-label">Activity log — sanitized audit trail (§24)</p>
      {events.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">
          No activity recorded yet — connect, test or sync a provider.
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="hub-activity">
          {events.slice(0, 12).map((event) => (
            <div key={event.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex shrink-0 items-center gap-2 sm:w-52">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    event.level === "ERROR" ? "bg-loss" : event.level === "WARN" ? "bg-warning" : "bg-muted-foreground/50",
                  )}
                  aria-hidden="true"
                />
                <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {event.kind}
                </span>
                <time
                  className="font-mono text-[11px] tabular-nums text-muted-foreground"
                  dateTime={event.at}
                  title={formatTime(event.at)}
                >
                  {TIME_FORMAT.format(new Date(event.at))}
                </time>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">{event.message}</p>
                {event.detail ? (
                  <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {event.detail}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {event.providerId}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OverviewTab({
  views,
  events,
  nowMs,
}: {
  views: IntegrationView[];
  events: IntegrationEvent[];
  nowMs: number;
}) {
  return (
    <div className="space-y-8">
      <OverviewStatBand counts={views} />
      <NeedsAttention views={views} nowMs={nowMs} />
      <RuledRows label="Hub matrix — every provider, one row each" testId="hub-matrix">
        {views.map((view) => (
          <ProviderRow key={view.provider.id} view={view} nowMs={nowMs} />
        ))}
      </RuledRows>
      <ActivityLog events={events} />
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        Demo build — providers are simulated adapters behind the exact production contracts; no
        real network calls leave the browser. Credentials are masked, never stored in plaintext
        and never returned by an API response (§18/§24).
      </p>
    </div>
  );
}

// ── Main assembly ────────────────────────────────────────────────────────────

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "trading", label: "Trading Accounts" },
  { value: "market-data", label: "Market Data" },
  { value: "economic", label: "Economic Data" },
  { value: "news", label: "Market News" },
  { value: "tradingview", label: "TradingView" },
  { value: "notifications", label: "Notifications" },
  { value: "communication", label: "Communication" },
  { value: "webhooks", label: "Webhooks" },
  { value: "external", label: "External Services" },
] as const;

export function IntegrationsHub() {
  const { data, isPending, isError } = useIntegrations();
  const [tab, setTab] = React.useState<string>("overview");
  const [dialog, setDialog] = React.useState<ProviderDialogState>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  // Keep relative labels honest without re-rendering every second.
  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const sync = useSyncIntegration();

  const syncNow = React.useCallback(
    (view: IntegrationView) => {
      setSyncingId(view.provider.id);
      sync.mutate(view.provider.id, {
        onSuccess: (response) => {
          toast.success(
            response.status === "CONNECTED"
              ? `${view.provider.name} synced — ${response.sync.recordsProcessed ?? 0} records, cursor advanced.`
              : `${view.provider.name} sync still failing — check the provider target, then retry.`,
          );
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, `${view.provider.name} could not be synced.`));
        },
        onSettled: () => setSyncingId(null),
      });
    },
    [sync],
  );

  const hubActions = React.useMemo<HubActions>(
    () => ({
      openConnect: (view) => setDialog({ kind: "connect", view }),
      openTest: (view) => setDialog({ kind: "test", view }),
      openDisconnect: (view) => setDialog({ kind: "disconnect", view }),
      syncNow,
      syncingId,
    }),
    [syncNow, syncingId],
  );

  const views = React.useMemo(() => data?.integrations ?? [], [data]);

  const overall = React.useMemo(() => {
    if (views.length === 0) return null;
    const errors = views.filter((view) => view.state.status === "ERROR").length;
    const warnings = views.filter(
      (view) => view.state.status === "DEGRADED" || view.state.status === "AUTH_REQUIRED",
    ).length;
    const linked = views.filter(
      (view) => !["DISCONNECTED"].includes(view.state.status),
    ).length;
    if (errors > 0) {
      return { tone: "text-loss", label: `${errors} failing · ${linked}/${views.length} linked` };
    }
    if (warnings > 0) {
      return {
        tone: "text-warning",
        label: `${warnings} need attention · ${linked}/${views.length} linked`,
      };
    }
    return { tone: "text-profit", label: `${linked}/${views.length} linked` };
  }, [views]);

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="integrations-hub">
      <PageHeader
        eyebrow="System · Integrations"
        title="Integration Hub"
        description="One platform layer for brokers, exchanges, market data, the economic calendar, news, charting, notifications, messaging platforms (Telegram, Discord, Slack) and external services. Trading-account integrations are read-only — the journal stays the book of record."
        badge={
          overall ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
                overall.tone,
              )}
              data-testid="hub-overall"
            >
              {overall.label}
            </span>
          ) : null
        }
      />

      {isError ? (
        <p className="border-y border-border py-14 text-center text-sm text-muted-foreground">
          The integration hub could not be loaded. Try again in a moment.
        </p>
      ) : isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <HubActionsProvider value={hubActions}>
          <Tabs value={tab} onValueChange={setTab}>
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList variant="line" className="max-w-full" aria-label="Integration Hub sections">
                {TABS.map((entry) => (
                  <TabsTrigger key={entry.value} value={entry.value} className="shrink-0">
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-6">
              <OverviewTab views={views} events={data?.events ?? []} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="trading" className="mt-6">
              <TradingAccountsTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="market-data" className="mt-6">
              <MarketDataTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="economic" className="mt-6">
              <EconomicDataTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="news" className="mt-6">
              <NewsTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="tradingview" className="mt-6">
              <TradingViewTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="notifications" className="mt-6">
              <NotificationsTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="communication" className="mt-6">
              <CommunicationTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="webhooks" className="mt-6">
              <WebhooksTab views={views} nowMs={nowMs} />
            </TabsContent>
            <TabsContent value="external" className="mt-6">
              <ExternalServicesTab views={views} nowMs={nowMs} />
            </TabsContent>
          </Tabs>

          <ProviderDialogs state={dialog} onOpenChange={setDialog} />
        </HubActionsProvider>
      )}
    </div>
  );
}
