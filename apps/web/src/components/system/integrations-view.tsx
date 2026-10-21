"use client";

import {
  ArrowUpRight,
  Cable,
  ChartLine,
  CheckCircle2,
  CircleDashed,
  Eye,
  KeyRound,
  Radio,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * /integrations — the broker & data-provider hub. Provider-agnostic by
 * design: every adapter implements the same capabilities (market data,
 * read-only account monitoring, trade execution) and connects through the
 * credentials vault (Security). This build ships the Deriv connection the
 * session module already uses; the other adapters are declared and pending.
 */

type ProviderState = "Connected" | "Not configured" | "Planned";

type Provider = {
  name: string;
  tagline: string;
  state: ProviderState;
  capabilities: { label: string; icon: typeof Eye; value: string }[];
  note: string;
};

const PROVIDERS: Provider[] = [
  {
    name: "Deriv",
    tagline: "Deriv Live account — the session module's live feed",
    state: "Connected",
    capabilities: [
      { label: "Market data", icon: Radio, value: "WebSocket stream" },
      { label: "Account", icon: Wallet, value: "Read-only" },
      { label: "Execution", icon: KeyRound, value: "Disabled by design" },
    ],
    note: "Scoped to monitoring: balances, open positions and ticks. No order can leave Euforia through this connection.",
  },
  {
    name: "MT5 — Local Bridge",
    tagline: "MetaTrader 5 through a small local companion process",
    state: "Not configured",
    capabilities: [
      { label: "Market data", icon: Radio, value: "Bridge feed" },
      { label: "Account", icon: Wallet, value: "Read-only" },
      { label: "Execution", icon: KeyRound, value: "Disabled by design" },
    ],
    note: "Runs on your machine, talks to your terminal, never to the cloud. Configure the bridge key to light it up.",
  },
  {
    name: "cTrader Open API",
    tagline: "Spotware's official API for cTrader accounts",
    state: "Planned",
    capabilities: [
      { label: "Market data", icon: Radio, value: "Open API stream" },
      { label: "Account", icon: Wallet, value: "Read-only" },
      { label: "Execution", icon: KeyRound, value: "Disabled by design" },
    ],
    note: "Same contract as every adapter: positions and statements in, nothing out.",
  },
  {
    name: "Binance",
    tagline: "REST + WebSocket for spot accounts",
    state: "Planned",
    capabilities: [
      { label: "Market data", icon: Radio, value: "REST + WS" },
      { label: "Account", icon: Wallet, value: "Read-only" },
      { label: "Execution", icon: KeyRound, value: "Disabled by design" },
    ],
    note: "Keys live in the credentials vault with withdrawal scopes explicitly refused.",
  },
];

const stateVariant: Record<ProviderState, "default" | "secondary" | "outline"> = {
  Connected: "default",
  "Not configured": "secondary",
  Planned: "outline",
};

export function IntegrationsView() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          Integrations
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The hub where brokers and data providers plug in. One contract, many
          adapters — connections are scoped, read-only, and their keys sleep in
          the Security vault.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <Card key={provider.name} className="border-border bg-surface">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
                  <Cable className="size-4 text-accent" aria-hidden="true" />
                  {provider.name}
                </CardTitle>
                <CardDescription>{provider.tagline}</CardDescription>
              </div>
              <Badge variant={stateVariant[provider.state]}>
                {provider.state === "Connected" && (
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                )}
                {provider.state !== "Connected" && (
                  <CircleDashed className="size-3" aria-hidden="true" />
                )}
                {provider.state}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                {provider.capabilities.map((cap) => {
                  const Icon = cap.icon;
                  return (
                    <div
                      key={cap.label}
                      className="flex items-center justify-between gap-4 text-xs"
                    >
                      <span className="flex items-center gap-1.5 font-sans uppercase tracking-wide text-[11px] text-muted-foreground">
                        <Icon className="size-3" aria-hidden="true" />
                        {cap.label}
                      </span>
                      <span className="font-mono text-foreground">
                        {cap.value}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{provider.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <ChartLine className="size-4 text-accent" aria-hidden="true" />
            One contract, many adapters
          </CardTitle>
          <CardDescription>
            Every provider implements the same three capabilities — market
            data, account monitoring, execution. Execution stays disabled in
            this phase: Euforia observes and journals, it never places orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
          Manage and revoke the keys behind these connections in the Security
          section.
        </CardContent>
      </Card>
    </div>
  );
}
